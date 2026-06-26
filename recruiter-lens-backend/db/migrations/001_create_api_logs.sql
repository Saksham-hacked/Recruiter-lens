-- ============================================================================
-- API Logs table for Recruiter Lens Backend
-- Run this in your Supabase SQL editor (alongside the existing zoho_tokens table)
-- ============================================================================

CREATE TABLE api_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method        text NOT NULL,
  path          text NOT NULL,
  status_code   integer NOT NULL,
  duration_ms   integer,
  request_body  text,          -- JSON string (sensitive fields stripped)
  response_body text,          -- JSON string
  ip            text,
  user_agent    text,
  requested_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for common query patterns
CREATE INDEX idx_api_logs_requested_at ON api_logs (requested_at DESC);
CREATE INDEX idx_api_logs_path         ON api_logs (path);
CREATE INDEX idx_api_logs_status_code  ON api_logs (status_code);

-- Optional: enable Row Level Security (disabled by default for service-role access)
-- ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- Optional: auto-purge logs older than 90 days (requires pg_cron extension)
-- SELECT cron.schedule('purge-old-api-logs', '0 3 * * *',
--   $$DELETE FROM api_logs WHERE requested_at < now() - interval '90 days'$$
-- );
