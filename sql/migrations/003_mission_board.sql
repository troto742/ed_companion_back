ALTER TABLE current_state
  ADD COLUMN IF NOT EXISTS missions JSONB NOT NULL DEFAULT '{"active":[],"history":[],"updatedAt":null}'::jsonb;

CREATE TABLE IF NOT EXISTS mission_events (
  id BIGSERIAL PRIMARY KEY,
  commander_id BIGINT NOT NULL REFERENCES commanders(id) ON DELETE CASCADE,
  mission_id BIGINT,
  event_ts TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_events_commander_ts
  ON mission_events (commander_id, event_ts DESC);

CREATE INDEX IF NOT EXISTS idx_mission_events_commander_mission
  ON mission_events (commander_id, mission_id, event_ts DESC);
