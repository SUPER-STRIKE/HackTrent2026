-- Tripwire schema for Tiger Data (TimescaleDB). Idempotent. Run with: npm run db:migrate
-- Statements are split on semicolon+newline by scripts/migrate.mjs (continuous aggregates cannot run in a transaction), so keep semicolons out of comments.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS agents (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  auth0_client_id text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Every action an agent reports. Time-partitioned.
CREATE TABLE IF NOT EXISTS agent_events (
  time         timestamptz NOT NULL DEFAULT now(),
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  agent_id     text        NOT NULL,
  session_id   text        NOT NULL,
  action_type  text        NOT NULL,
  target       text,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  risk_score   real        CHECK (risk_score BETWEEN 0 AND 1),
  risk_level   text        CHECK (risk_level IN ('low','medium','high','critical')),
  risk_reason  text,
  status       text        NOT NULL DEFAULT 'allowed'
                 CHECK (status IN ('allowed','pending','approved','denied')),
  decided_by   text,
  decided_at   timestamptz,
  PRIMARY KEY (id, time)
);

SELECT create_hypertable('agent_events', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS agent_events_agent_time_idx ON agent_events (agent_id, time DESC);
CREATE INDEX IF NOT EXISTS agent_events_session_time_idx ON agent_events (session_id, time DESC);
CREATE INDEX IF NOT EXISTS agent_events_pending_idx ON agent_events (time DESC) WHERE status = 'pending';

-- Per-minute rollup for the live dashboard (real-time aggregation on).
CREATE MATERIALIZED VIEW IF NOT EXISTS events_per_minute
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 minute', time) AS bucket,
  agent_id,
  count(*)                                   AS events,
  avg(risk_score)                            AS avg_risk,
  max(risk_score)                            AS max_risk,
  count(*) FILTER (WHERE status = 'pending') AS pending,
  count(*) FILTER (WHERE status = 'denied')  AS denied,
  count(*) FILTER (WHERE risk_level IN ('high','critical')) AS risky
FROM agent_events
GROUP BY bucket, agent_id
WITH NO DATA;

-- Hourly rollup for history charts.
CREATE MATERIALIZED VIEW IF NOT EXISTS events_per_hour
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  agent_id,
  action_type,
  count(*)         AS events,
  avg(risk_score)  AS avg_risk,
  max(risk_score)  AS max_risk
FROM agent_events
GROUP BY bucket, agent_id, action_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('events_per_minute',
  start_offset => INTERVAL '1 hour', end_offset => INTERVAL '10 seconds',
  schedule_interval => INTERVAL '30 seconds', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('events_per_hour',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE);
