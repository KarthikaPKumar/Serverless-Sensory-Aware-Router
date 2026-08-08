CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE location (
  location_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);

CREATE TABLE pedestrian_sensor (
  sensor_id text PRIMARY KEY,
  location_id uuid REFERENCES location(location_id),
  status text
);

CREATE TABLE pedestrian_reading (
  reading_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_id text REFERENCES pedestrian_sensor(sensor_id),
  count int NOT NULL,
  rolling_avg_4wk float,
  recorded_at timestamptz,
  fetched_at timestamptz DEFAULT now()
);

CREATE TABLE disruption (
  disruption_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES location(location_id),
  type text,
  start_date date,
  end_date date
);

CREATE TABLE event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES location(location_id),
  name text,
  start_datetime timestamptz,
  end_datetime timestamptz
);

CREATE TABLE refuge (
  refuge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES location(location_id),
  type text,
  name text
);

CREATE INDEX location_geom_idx ON location USING GIST (geom);
