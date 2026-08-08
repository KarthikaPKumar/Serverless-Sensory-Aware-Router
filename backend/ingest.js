const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const fetch = require('node-fetch');

const client = new RDSDataClient({ region: 'ap-southeast-2' });
const resourceArn = 'arn:aws:rds:ap-southeast-2:837873138727:cluster:database-1';
const secretArn = 'arn:aws:secretsmanager:ap-southeast-2:837873138727:secret:routeplanner-db-secret-hpSdDs';

async function query(sql, parameters = [], retries = 3) {
  const command = new ExecuteStatementCommand({
    resourceArn, secretArn, database: 'postgres', sql, parameters
  });
  try {
    return await client.send(command);
  } catch (err) {
    if (err.name === 'DatabaseResumingException' && retries > 0) {
      console.log('Database resuming — waiting 10s and retrying...');
      await new Promise(r => setTimeout(r, 10000));
      return query(sql, parameters, retries - 1);
    }
    throw err;
  }
}

function cleanSensorRecord(record) {
  // Note: City of Melbourne's `location_id` field is their sensor's unique ID —
  // unrelated to our own database's `location_id` column, just an unfortunate naming collision.
  const { location_id, sensor_description, latitude, longitude, status } = record;
  const issues = [];

  if (location_id == null) issues.push('missing sensor_id (source field: location_id)');
  if (latitude == null || longitude == null) issues.push('missing coordinates');

  const cleanLat = latitude != null ? parseFloat(latitude) : null;
  const cleanLng = longitude != null ? parseFloat(longitude) : null;
  if (latitude != null && isNaN(cleanLat)) issues.push('latitude not numeric');
  if (longitude != null && isNaN(cleanLng)) issues.push('longitude not numeric');

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
  const res = await fetch(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-sensor-locations/records?limit=100'
  );
  const data = await res.json();
  console.log(`Fetched ${data.results.length} raw sensor records from City of Melbourne`);

  const seen = new Set();
  let inserted = 0, rejected = 0, duplicates = 0;
  const rejectionLog = [];

  for (const record of data.results) {
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

    const locResult = await query(
      `INSERT INTO location (name, geom) VALUES (:name, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)) RETURNING location_id`,
      [
        { name: 'name', value: { stringValue: cleaned.name } },
        { name: 'lng', value: { doubleValue: cleaned.longitude } },
        { name: 'lat', value: { doubleValue: cleaned.latitude } }
      ]
    );
    const locationId = locResult.records[0][0].stringValue;

    await query(
      `INSERT INTO pedestrian_sensor (sensor_id, location_id, status) VALUES (:sid, :lid::uuid, :status)
       ON CONFLICT (sensor_id) DO UPDATE SET status = :status`,
      [
        { name: 'sid', value: { stringValue: cleaned.sensor_id } },
        { name: 'lid', value: { stringValue: locationId } },
        { name: 'status', value: { stringValue: cleaned.status } }
      ]
    );
    inserted++;
  }

  console.log(`Data quality report: ${inserted} inserted, ${rejected} rejected, ${duplicates} duplicates skipped`);
  if (rejectionLog.length) console.log('Rejected records:', JSON.stringify(rejectionLog, null, 2));
}

function cleanReadingRecord(record) {
  const { location_id, sensing_datetime, total_of_directions } = record;
  const issues = [];

  if (location_id == null) issues.push('missing sensor_id (source field: location_id)');
  if (sensing_datetime == null) issues.push('missing timestamp');
  if (total_of_directions == null) issues.push('missing count');

  const cleanCount = total_of_directions != null ? parseInt(total_of_directions, 10) : null;
  if (total_of_directions != null && isNaN(cleanCount)) issues.push('count not numeric');
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
  const res = await fetch(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/pedestrian-counting-system-past-hour-counts-per-minute/records?limit=100'
  );
  const data = await res.json();
  console.log(`Fetched ${data.results.length} raw reading records`);

  let inserted = 0, rejected = 0, skippedUnknownSensor = 0;
  const rejectionLog = [];

  for (const record of data.results) {
    const { valid, issues, cleaned } = cleanReadingRecord(record);

    if (!valid) {
      rejected++;
      rejectionLog.push({ location_id: record.location_id, issues });
      continue;
    }

    try {
      await query(
        `INSERT INTO pedestrian_reading (sensor_id, count, recorded_at) VALUES (:sid, :count, :recorded_at::timestamptz)`,
        [
          { name: 'sid', value: { stringValue: cleaned.sensor_id } },
          { name: 'count', value: { longValue: cleaned.count } },
          { name: 'recorded_at', value: { stringValue: cleaned.recorded_at } }
        ]
      );
      inserted++;
    } catch (err) {
      skippedUnknownSensor++;
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
}

// ingestSensors().catch(console.error);
ingestReadings().catch(console.error);

