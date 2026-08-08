require('dotenv').config();
const fetch = require('node-fetch');
const { query } = require('./db');


// Map real sub_theme values to our REFUGE.type column
const REFUGE_SUBTHEMES = {
  'Informal Outdoor Facility (Park/Garden/Reserve)': 'green_space',
  'Art Gallery/Museum': 'indoor',
  'Place Of Assembly': 'indoor',
  'Public Buildings': 'indoor'
};

function cleanRefugeRecord(record) {
  const { feature_name, sub_theme, co_ordinates } = record;
  const issues = [];

  const refugeType = REFUGE_SUBTHEMES[sub_theme];
  if (!refugeType) issues.push(`sub_theme not a refuge category: ${sub_theme}`);

  if (!feature_name) issues.push('missing feature_name');
  if (!co_ordinates || co_ordinates.lat == null || co_ordinates.lon == null) {
    issues.push('missing coordinates');
  }

  const lat = co_ordinates?.lat;
  const lng = co_ordinates?.lon;
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
      latitude: lat,
      longitude: lng
    }
  };
}

async function ingestRefuges() {
  const res = await fetch(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/records?limit=100'
  );
  const data = await res.json();
  console.log(`Fetched ${data.results.length} raw place records`);

  let inserted = 0, rejected = 0;
  const rejectionLog = [];

  for (const record of data.results) {
    const { valid, issues, cleaned } = cleanRefugeRecord(record);

    if (!valid) {
      rejected++;
      rejectionLog.push({ feature_name: record.feature_name, issues });
      continue;
    }

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
      `INSERT INTO refuge (location_id, type, name) VALUES (:lid::uuid, :type, :name)`,
      [
        { name: 'lid', value: { stringValue: locationId } },
        { name: 'type', value: { stringValue: cleaned.type } },
        { name: 'name', value: { stringValue: cleaned.name } }
      ]
    );
    inserted++;
  }

  console.log(`Refuge report: ${inserted} inserted, ${rejected} rejected (not a refuge category or bad data)`);
  console.log('Rejection reasons sample:', JSON.stringify(rejectionLog.slice(0, 3), null, 2));
}

// ingestReadings().catch(console.error);
ingestRefuges().catch(console.error);
