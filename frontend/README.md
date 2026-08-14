# Sensory-Aware Route Planner — Frontend

React + Vite + TypeScript client for the [backend](../backend/README.md).
See the [repo root README](../README.md) for how to run both together.

## Quick start

```bash
npm install
npm run dev
```

Requires the backend running at `http://127.0.0.1:8000` (see root README).
To point at a different backend, copy `.env.example` to `.env.local` and set
`VITE_API_BASE_URL`.

## Layout

```
src/
  api/          Types mirroring backend/app/schemas.py, fetch client, error handling
  constants/    landmarks.ts (stand-in for place search), sensory.ts (badge presentation)
  hooks/        useRoutes, useQuietSpaces, useGeolocation, usePrefersReducedMotion
  components/
    layout/     AppShell — map + side panel + persistent quiet-space bar
    map/        Leaflet map, route polylines, origin/destination + quiet-space markers
    journey/    FE-F1 — origin/destination input
    routes/     FE-F2 — route comparison, sensory badge
    quietSpaces/ FE-F3/FE-F4 — find button, results, detail panel, expand-radius dialog
    common/     Button, ErrorBanner, LoadingState, VisuallyHidden
  styles/       tokens.css (palette, verified against WCAG AA), global.css
```

No router: the app is one continuous map-centric view: the side panel swaps
between journey input, route comparison, and quiet-space results based on
in-memory state — never the URL, and never `localStorage` (origin/destination
pairs can identify where someone lives and works).
