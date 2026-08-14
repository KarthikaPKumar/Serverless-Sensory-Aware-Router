const fetch = require('node-fetch');
const { query } = require('./db');

const SOURCE_TIMEOUT_MS = 10_000;

// Map real sub_theme values to our REFUGE.type column
const REFUGE_SUBTHEMES = {
  'Informal Outdoor Facility (Park/Garden/Reserve)': 'green_space',
  'Art Gallery/Museum': 'indoor',
  'Place Of Assembly': 'indoor',
  'Public Buildings': 'indoor'
};

function finiteNumber(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceKey(record, name, type) {
  const sourceId = record.feature_id ?? record.objectid ?? record.id;
  if (sourceId != null && String(sourceId).trim() !== '') {
    return `refuge:${String(sourceId).trim()}`;
  }
  // The source does not consistently expose an identifier. This stable
  // fallback keeps a known place updateable across repeated ingestions.
  return `refuge:${type}:${name.trim().toLowerCase()}`;
}

async function fetchRecords() {
  const response = await fetch(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/records?limit=100',
    { timeout: SOURCE_TIMEOUT_MS }
  );
  if (!response.ok) {
    throw new Error(`Refuge source returned HTTP ${response.status}`);
  }
  try {
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('response did not contain a results array');
    return data.results;
  } catch (error) {
    throw new Error(`Refuge source returned invalid JSON: ${error.message}`);
  }
}

function cleanRefugeRecord(record) {
  const { feature_name, sub_theme, co_ordinates } = record;
  const issues = [];

  const refugeType = REFUGE_SUBTHEMES[sub_theme];
  if (!refugeType) issues.push(`sub_theme not a refuge category: ${sub_theme}`);

  if (!feature_name) issues.push('missing feature_name');
  if (!co_ordinates || co_ordinates.lat == null || co_ordinates.lon == null) {
    issues.push('missing coordinates');
  }

  const lat = co_ordinates?.lat == null ? null : finiteNumber(co_ordinates.lat);
  const lng = co_ordinates?.lon == null ? null : finiteNumber(co_ordinates.lon);
  if (co_ordinates?.lat != null && lat === null) issues.push('latitude not numeric');
  if (co_ordinates?.lon != null && lng === null) issues.push('longitude not numeric');
  const inMelbourne = lat > -38.5 && lat < -37.5 && lng > 144.4 && lng < 145.6;
  if (lat != null && lng != null && !inMelbourne) {
    issues.push(`coordinates out of expected range: ${lat},${lng}`);
  }

  return {
    valid: issues.length === 0,
    issues,
    cleaned: {
      name: (feature_name ?? 'Unnamed location').trim(),
      type: refugeType,
      source_key: sourceKey(record, feature_name ?? 'Unnamed location', refugeType),
      latitude: lat,
      longitude: lng
    }
  };
}

async function ingestRefuges() {
  const records = await fetchRecords();
  console.log(`Fetched ${records.length} raw place records`);

  let inserted = 0, rejected = 0;
  const rejectionLog = [];

  for (const record of records) {
    const { valid, issues, cleaned } = cleanRefugeRecord(record);

    if (!valid) {
      rejected++;
      rejectionLog.push({ feature_name: record.feature_name, issues });
      continue;
    }

    await query(
      `WITH location_upsert AS (
         INSERT INTO location (source_key, name, geom)
         VALUES (:location_key, :name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
         ON CONFLICT (source_key) DO UPDATE
           SET name = EXCLUDED.name, geom = EXCLUDED.geom
         RETURNING location_id
       )
       INSERT INTO refuge (location_id, type, name)
       SELECT location_id, :type, :name FROM location_upsert
       ON CONFLICT (location_id) DO UPDATE
         SET type = EXCLUDED.type, name = EXCLUDED.name`,
      [
        { name: 'location_key', value: { stringValue: cleaned.source_key } },
        { name: 'name', value: { stringValue: cleaned.name } },
        { name: 'lng', value: { doubleValue: cleaned.longitude } },
        { name: 'lat', value: { doubleValue: cleaned.latitude } },
        { name: 'type', value: { stringValue: cleaned.type } }
      ]
    );
    inserted++;
  }

  console.log(`Refuge report: ${inserted} inserted, ${rejected} rejected (not a refuge category or bad data)`);
  console.log('Rejection reasons sample:', JSON.stringify(rejectionLog.slice(0, 3), null, 2));
  return { inserted, rejected };
}

if (require.main === module) {
  ingestRefuges().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { cleanRefugeRecord, ingestRefuges };