require('dotenv').config();
const fetch = require('node-fetch');

async function test() {
  const res = await fetch(
    'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/records?limit=5'
  );
  const data = await res.json();
  console.log('RAW FIRST RECORD:', JSON.stringify(data.results[0], null, 2));
  console.log(`Total fetched: ${data.results.length}`);
}

test();
