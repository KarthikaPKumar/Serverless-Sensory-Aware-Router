# Senseway: central-Melbourne walking explorer

**Published site:** https://karthikapkumar.github.io/Serverless-Sensory-Aware-Router/

A free, browser-based route-planning preview using real OpenStreetMap walking segments, real City of Melbourne addresses, and timestamped public pedestrian-counter snapshots. No paid database, routing API key or geocoding service is needed.

## What is real, and what is not

- `docs/data/streets.json`: a bounded CBD OSM extract converted into a connected walking graph. Known foot restrictions, private access, indoor/conditional paths and unsuitable road classes are excluded. Stairs may be included; this is not a wheelchair profile.
- `docs/data/addresses.json`: City of Melbourne property address points inside the extract. Searches stay in the browser. This does not cover all Melbourne.
- `docs/data/pedestrians.json`: observations within an explicit 60-minute window, including original observation timestamps, reporting-minute counts and validation statistics. These are passages at sensor points, not unique people or crowd density.
- **Noise and light are unknown.** No fabricated measurements or proxy scores are used for them.
- Routes use Dijkstra's algorithm over actual mapped segments. Walking durations are estimates at 4.8 km/h. Ordered street segments are provided, not turn-by-turn navigation.
- Address-to-network gaps up to 80 m are disclosed separately; they are not verified entrance connections. Closures and access restrictions may have changed since the extract.
- The old synthetic demonstration remains at `demo.html`, explicitly labelled and separate from the real-data interface.

## Observation eligibility and scoring

A counter must have an observation within 30 minutes, a snapshot fetched within 90 minutes, and at least 45 reporting minutes in the 60-minute window. Missing minute records can mean no passages or missing data; they are not filled with zero. Incomplete totals cannot be interpreted as low activity.

The nearest eligible counter within 50 m of an edge midpoint supplies context. This proximity does not prove the counter represents that sidewalk. Route coverage is shown explicitly.

```
segment cost = metres * (1 + preference * activity)
activity = observed passages / (observed passages + 200)
unknown activity = 1
```

The scale of 200 is a transparent heuristic, not a calibrated model. Unknown segments receive the maximum penalty; they are never scored as quiet. When no observations are eligible, the activity alternative is unavailable and the app still computes a real shortest walking path. No route is certified safe or quiet.

## Run and test

```
python3 -m http.server 8765 --directory docs
node --test tests-real/*.test.mjs tests-demo/*.test.mjs
python3 -m unittest discover -s tests-real -p 'test_*.py'
```

Open http://localhost:8765/. Static files need no build step or dependency installation.

## Refresh public JSON

```
python3 scripts/refresh_data.py          # pedestrian observations only
python3 scripts/refresh_data.py --all    # also addresses and OSM walking graph
```

Python standard library only. Downloads use timeouts. Exact duplicates are removed, conflicting duplicates are excluded and invalid data is rejected. A failed/empty observation refresh preserves the previous file; the browser independently excludes stale observations. Metadata records source, attribution and time.

The `refresh-pedestrians.yml` workflow runs at minutes 7 and 37 each hour and can be dispatched manually. It fetches observations, tests, commits a snapshot and explicitly deploys the Pages artifact (a bot commit alone does not trigger another workflow). Scheduled GitHub jobs may be delayed or disabled after inactivity; refresh times are not guaranteed. Check Actions and the public timestamps. Address/street snapshots are refreshed manually with `--all` to avoid unnecessary upstream load.

`pages.yml` tests and publishes code changes. Both deployments share one concurrency group. Configure Pages source as **GitHub Actions**. Only `docs/` is published.

## Attribution and data licensing

- Street graph: © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The adapted graph is distributed under ODbL; original OSM IDs and provenance are included. [OSM attribution](https://www.openstreetmap.org/copyright).
- Addresses and counters: City of Melbourne Open Data, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) as specified by the source portal. Source links are embedded in the JSON files and displayed on the site.
- The datasets are stored separately. See [data notes](docs/data/README.md).

## Original project files

The repository retains the original AWS Lambda / Aurora / PostGIS templates and Node ingestion utilities. They are not deployed or connected to this free release. The original React source and Python backend referenced by earlier documentation were not present in the repository; this static application is a new implementation.
