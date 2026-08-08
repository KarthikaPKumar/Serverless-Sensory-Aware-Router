require('dotenv').config();
const fetch = require('node-fetch');

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is alive' });
});

const { query } = require('./db');

const SEVERITY_RANK = { Low: 0, Medium: 1, High: 2 };

const WALKTHROUGH_TEMPLATES = {
  Low: 'Quiet stretch, comfortable pedestrian volume.',
  Medium: 'Moderately busy — above typical levels for this time.',
  High: 'Busy — pedestrian count well above usual for this location.'
};

async function scoreSegment(segment) {
  const nearby = await query(
    `SELECT pr.count, pr.rolling_avg_4wk
     FROM pedestrian_sensor ps
     JOIN location l ON ps.location_id = l.location_id
     JOIN pedestrian_reading pr ON pr.sensor_id = ps.sensor_id
     WHERE ST_DWithin(l.geom::geography, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)::geography, 150)
     ORDER BY pr.fetched_at DESC LIMIT 1`,
    [
      { name: 'lng', value: { doubleValue: segment.startLng } },
      { name: 'lat', value: { doubleValue: segment.startLat } }
    ]
  );

  let severity = 'Low';
  let walkthrough = WALKTHROUGH_TEMPLATES.Low;
  let dataAvailable = false;

  if (nearby.records && nearby.records.length > 0) {
    const count = nearby.records[0][0].longValue;
    const avg = nearby.records[0][1].doubleValue;
    if (avg > 0) {
      dataAvailable = true;
      const ratio = count / avg;
      if (ratio > 1.5) severity = 'High';
      else if (ratio > 1.0) severity = 'Medium';
      walkthrough = WALKTHROUGH_TEMPLATES[severity];
    }
  }

  return { ...segment, severity, walkthrough, dataAvailable };
}

async function scoreRoute(route) {
  const scoredSegments = await Promise.all(route.segments.map(scoreSegment));
  const worst = scoredSegments.reduce((worst, s) =>
    SEVERITY_RANK[s.severity] > SEVERITY_RANK[worst.severity] ? s : worst
  , scoredSegments[0]);

  return {
    ...route,
    segments: scoredSegments,
    overallSeverity: worst.severity
  };
}

app.post('/api/routes', async (req, res) => {
  const { origin, destination } = req.body;
  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination required' });
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=walking&alternatives=true&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const gmapsRes = await fetch(url);
  const gmapsData = await gmapsRes.json();

  if (gmapsData.status !== 'OK') {
    return res.status(502).json({ error: 'Directions lookup failed', status: gmapsData.status });
  }

  const routes = gmapsData.routes.map((route, i) => ({
    routeId: `route-${i}`,
    segments: route.legs[0].steps.map((step, j) => ({
      segmentId: `route-${i}-seg-${j}`,
      startLat: step.start_location.lat,
      startLng: step.start_location.lng,
      endLat: step.end_location.lat,
      endLng: step.end_location.lng,
      durationSeconds: step.duration.value
    }))
  }));

  const scoredRoutes = await Promise.all(routes.map(scoreRoute));

  const noLowSensoryRoute = scoredRoutes.every(r => r.overallSeverity === 'High');

  res.json({
    routes: scoredRoutes,
    onlyOneRouteAvailable: routes.length < 2,
    noLowSensoryRoute
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));
}

module.exports = app;