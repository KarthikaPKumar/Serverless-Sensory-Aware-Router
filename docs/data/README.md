# Public dataset snapshots

`streets.json` is an adapted OpenStreetMap database, licensed under ODbL 1.0:
https://opendatacommons.org/licenses/odbl/1-0/
Attribution: © OpenStreetMap contributors. https://www.openstreetmap.org/copyright

The graph retains OSM node identifiers, coordinates, mapped edge names, foot direction restrictions, source timestamp, extraction timestamp and bounds. Only the largest connected component of the conservatively filtered walking graph is retained. No invented connecting edges are added. The graph is a planning preview, not a complete routing engine or accessibility audit.

`addresses.json` and `pedestrians.json` originate from City of Melbourne Open Data and retain their own [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) source attribution. They are kept separate from the OSM-derived database. Sources:
- https://data.melbourne.vic.gov.au/explore/dataset/street-addresses/
- https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-sensor-locations/
- https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-past-hour-counts-per-minute/

Changes: CBD filtering, address formatting/deduplication, observation validation and duplicate exclusion, per-counter window totals, source/timestamp metadata. No estimates replace missing noise/light measurements.
