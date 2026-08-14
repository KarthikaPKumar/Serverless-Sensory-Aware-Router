const fetch = require('node-fetch');
const { query } = require('./db');

const SOURCE_TIMEOUT_MS = 10_000;

function finiteNumber(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

async function fetchRecords(url, sourceName) {
  const response = await fetch(url, { timeout: SOURCE_TIMEOUT_MS });
  if (!response.ok) {
    throw new Error(`${sourceName} source returned HTTP ${response.status}`);
  }
  try {
    const data = await response.json();
    if (!Array.isArray(data.results)) {
      throw new Error('response did not contain a results array');
    }
    return data.results;
  } catch (error) {
    throw new Error(`${sourceName} source returned invalid JSON: ${error.message}`);
  }
}

function cleanSensorRecord(record) {
  // Note: City of Melbourne's `location_id` field is their sensor's unique ID —
  // unrelated to our own database's `location_id` column, just an unfortunate naming collision.
  const { location_id, sensor_description, latitude, longitude, status } = record;
  const issues = [];

  if (location_id == null) issues.push('missing sensor_id (source field: location_id)');
  if (latitude == null || longitude == null) issues.push('missing coordinates');

  const cleanLat = latitude != null ? finiteNumber(latitude) : null;
  const cleanLng = longitude != null ? finiteNumber(longitude) : null;
  if (latitude != null && cleanLat === null) issues.push('latitude not numeric');
  if (longitude != null && cleanLng === null) issues.push('longitude not numeric');

  const inMelbourne = cleanLat > -38.5 && cleanLat < -37.5 && cleanLng > 144.4 && cleanLng < 145.6;
  if (cleanLat != null && cleanLng != null && !inMelbourne) {
    issues.push(`coordinates out of expected range: ${cleanLat},${cleanLng}`);
  }

  return {
    valid: issues.length === 0,
    issues,
    cleaned: {
      sensor_id: String(location_id ?? '').trim(),
      name: (sensor_description ?? 'Unnamed sensor').trim(),
      latitude: cleanLat,
      longitude: cleanLng,
      status: (status ?? 'unknown').trim().toLowerCase()
    }
  };
}

async function ingestSensors() {
  const records = await fetchRecords(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-sensor-locations/records?limit=100',
    'Sensor'
  );
  console.log(`Fetched ${records.length} raw sensor records from City of Melbourne`);

  const seen = new Set();
  let inserted = 0, rejected = 0, duplicates = 0;
  const rejectionLog = [];

  for (const record of records) {
    const { valid, issues, cleaned } = cleanSensorRecord(record);

    if (!valid) {
      rejected++;
      rejectionLog.push({ sensor_id: record.sensor_id, issues });
      continue;
    }
    if (seen.has(cleaned.sensor_id)) {
      duplicates++;
      continue;
    }
    seen.add(cleaned.sensor_id);

    await query(
      `WITH location_upsert AS (
         INSERT INTO location (source_key, name, geom)
         VALUES (:location_key, :name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
         ON CONFLICT (source_key) DO UPDATE
           SET name = EXCLUDED.name, geom = EXCLUDED.geom
         RETURNING location_id
       )
       INSERT INTO pedestrian_sensor (sensor_id, location_id, status)
       SELECT :sid, location_id, :status FROM location_upsert
       ON CONFLICT (sensor_id) DO UPDATE
         SET location_id = EXCLUDED.location_id, status = EXCLUDED.status`,
      [
        { name: 'location_key', value: { stringValue: `sensor:${cleaned.sensor_id}` } },
        { name: 'name', value: { stringValue: cleaned.name } },
        { name: 'lng', value: { doubleValue: cleaned.longitude } },
        { name: 'lat', value: { doubleValue: cleaned.latitude } },
        { name: 'sid', value: { stringValue: cleaned.sensor_id } },
        { name: 'status', value: { stringValue: cleaned.status } }
      ]
    );
    inserted++;
  }

  console.log(`Data quality report: ${inserted} inserted, ${rejected} rejected, ${duplicates} duplicates skipped`);
  if (rejectionLog.length) console.log('Rejected records:', JSON.stringify(rejectionLog, null, 2));
  return { inserted, rejected, duplicates };
}

function cleanReadingRecord(record) {
  const { location_id, sensing_datetime, total_of_directions } = record;
  const issues = [];

  if (location_id == null) issues.push('missing sensor_id (source field: location_id)');
  if (sensing_datetime == null) issues.push('missing timestamp');
  if (total_of_directions == null) issues.push('missing count');

  const cleanCount = total_of_directions != null ? integer(total_of_directions) : null;
  if (total_of_directions != null && cleanCount === null) issues.push('count not numeric');
  if (cleanCount != null && cleanCount < 0) issues.push('negative count — invalid');

  const validDate = sensing_datetime != null && !isNaN(Date.parse(sensing_datetime));
  if (sensing_datetime != null && !validDate) issues.push('timestamp not parseable');

  return {
    valid: issues.length === 0,
    issues,
    cleaned: {
      sensor_id: String(location_id ?? '').trim(),
      count: cleanCount,
      recorded_at: sensing_datetime
    }
  };
}

async function ingestReadings() {
  const records = await fetchRecords(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-past-hour-counts-per-minute/records?limit=100',
    'Reading'
  );
  console.log(`Fetched ${records.length} raw reading records`);

  let inserted = 0, rejected = 0, skippedUnknownSensor = 0;
  const rejectionLog = [];

  for (const record of records) {
    const { valid, issues, cleaned } = cleanReadingRecord(record);

    if (!valid) {
      rejected++;
      rejectionLog.push({ location_id: record.location_id, issues });
      continue;
    }

    try {
      await query(
        `INSERT INTO pedestrian_reading (sensor_id, count, recorded_at)
         VALUES (:sid, :count, :recorded_at::timestamptz)
         ON CONFLICT (sensor_id, recorded_at) DO UPDATE
           SET count = EXCLUDED.count, fetched_at = now()`,
        [
          { name: 'sid', value: { stringValue: cleaned.sensor_id } },
          { name: 'count', value: { longValue: cleaned.count } },
          { name: 'recorded_at', value: { stringValue: cleaned.recorded_at } }
        ]
      );
      inserted++;
    } catch (err) {
      if (err.name === 'BadRequestException' && /foreign key/i.test(err.message)) {
        skippedUnknownSensor++;
        continue;
      }
      throw err;
    }
  }

  console.log(`Readings report: ${inserted} inserted, ${rejected} rejected, ${skippedUnknownSensor} skipped (unknown sensor)`);
  if (rejectionLog.length) console.log('Rejected records:', JSON.stringify(rejectionLog, null, 2));

  await query(`
    UPDATE pedestrian_reading pr
    SET rolling_avg_4wk = sub.avg_count
    FROM (
      SELECT sensor_id, AVG(count) as avg_count
      FROM pedestrian_reading
      WHERE recorded_at > now() - interval '28 days'
      GROUP BY sensor_id
    ) sub
    WHERE pr.sensor_id = sub.sensor_id;
  `);
  console.log('Rolling averages recomputed');
  return { inserted, rejected, skippedUnknownSensor };
}

async function ingestPedestrianData() {
  const sensors = await ingestSensors();
  const readings = await ingestReadings();
  return { sensors, readings };
}

if (require.main === module) {
  ingestPedestrianData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  cleanSensorRecord,
  cleanReadingRecord,
  ingestSensors,
  ingestReadings,
  ingestPedestrianData
};