# Live portfolio demo

The free, self-contained **Senseway** demo is published at:
https://karthikapkumar.github.io/Serverless-Sensory-Aware-Router/

GitHub Pages serves `docs/` from `main`. No API keys, database or cloud account are required for this demo. The original backend and ingestion files below remain available as source material; they are not connected to the public demo.

## What is implemented

- Client-side Dijkstra routing on a validated synthetic network (10 locations, 14 edges).
- Adjustable crowd, noise and light weights, preset preferences and journey swapping.
- Shortest-time and preference-weighted comparisons, time-weighted exposure scores and explicit path text.
- Schematic SVG map and illustrative quiet-space markers.
- Responsive, keyboard-accessible interface and documented scoring formula.

All locations, durations and signals are sample data. This is not a navigation service or a trained ML model. The previous Vercel deployment is unavailable. The missing original React/Python application was not recovered; `docs/` is a new standalone demonstration.

## Run and verify

```sh
python3 -m http.server 8765 --directory docs
node --test tests-demo/routing.test.mjs
```

Visit http://localhost:8765/. Tests cover all 90 distinct journeys, preference trade-offs, zero weights, disconnected graphs and invalid data. There is no frontend build step or dependency installation for this demo.

## Deployment

Repository Settings → Pages → Deploy from a branch → `main` → `/docs`.
Changes to `docs/` publish through GitHub Pages. Keep relative asset URLs so the project path works.

## Future Data / ML engineering work

Restore a separately hosted API before adding live data. Build timestamped ingestion with quality and coverage checks, indexed PostGIS queries, reproducible scoring evaluation and monitored deployment. Forecasting should only be added after a baseline and a held-out evaluation dataset exist. Do not treat missing sensor coverage as low exposure.

---

## Original project context

# Serverless-Sensory-Aware-Router
A sensory-aware routing application that helps users find less crowded, quieter, and lower light routes to their destination.

AWS Lambda + Aurora Serverless (PostgreSQL + PostGIS) backend for the Sensory-Aware Route Planner.

## Stack
- AWS Lambda (Node.js/Express via serverless-http)
- Aurora Serverless v2 (PostgreSQL + PostGIS), accessed via RDS Data API
- Deployed with AWS SAM

## Setup
See `infrastructure/schema.sql` for database schema.

## Visit
https://karthikapkumar.github.io/Serverless-Sensory-Aware-Router/

<img width="1280" height="684" alt="Screenshot 2026-08-15 at 00 42 52" src="https://github.com/user-attachments/assets/0a404d48-2a37-4e0e-b796-96b5f3daf00e" />


<img width="1280" height="683" alt="Screenshot 2026-08-15 at 00 43 00" src="https://github.com/user-attachments/assets/ca310248-020e-4a96-ba61-6b5ce36c0422" />



