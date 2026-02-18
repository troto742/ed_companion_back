CREATE TABLE IF NOT EXISTS commanders (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_events (
  id BIGSERIAL PRIMARY KEY,
  commander_id BIGINT NOT NULL REFERENCES commanders(id) ON DELETE CASCADE,
  event_ts TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (commander_id, event_hash)
);

CREATE INDEX IF NOT EXISTS idx_journal_events_commander_ts
  ON journal_events (commander_id, event_ts DESC);

CREATE TABLE IF NOT EXISTS status_events (
  id BIGSERIAL PRIMARY KEY,
  commander_id BIGINT NOT NULL REFERENCES commanders(id) ON DELETE CASCADE,
  status_ts TIMESTAMPTZ NOT NULL,
  flags INTEGER,
  fsd_charging BOOLEAN,
  fuel_main DOUBLE PRECISION,
  fuel_reserve DOUBLE PRECISION,
  cargo INTEGER,
  hull DOUBLE PRECISION,
  shields DOUBLE PRECISION,
  star_system TEXT,
  body_name TEXT,
  station_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_events_commander_ts
  ON status_events (commander_id, status_ts DESC);

CREATE TABLE IF NOT EXISTS routes (
  id BIGSERIAL PRIMARY KEY,
  commander_id BIGINT NOT NULL REFERENCES commanders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_commander_loaded_at
  ON routes (commander_id, loaded_at DESC);

CREATE TABLE IF NOT EXISTS route_legs (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  system_name TEXT NOT NULL,
  distance DOUBLE PRECISION,
  distance_remaining DOUBLE PRECISION,
  fuel_left DOUBLE PRECISION,
  fuel_used DOUBLE PRECISION,
  refuel BOOLEAN NOT NULL DEFAULT FALSE,
  neutron_star BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (route_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_route_legs_route_seq
  ON route_legs (route_id, seq);

CREATE TABLE IF NOT EXISTS current_state (
  commander_id BIGINT PRIMARY KEY REFERENCES commanders(id) ON DELETE CASCADE,
  ship JSONB NOT NULL DEFAULT '{}'::jsonb,
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  route JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
