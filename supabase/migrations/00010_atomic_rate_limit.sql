-- Atomic rate limit increment function.
-- Inserts or increments the request_count in a single statement,
-- returning the new count so the caller can decide allowed/denied
-- without a TOCTOU race.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_key_id uuid,
  p_window_start timestamptz,
  p_window_type text
) RETURNS integer
LANGUAGE sql
AS $$
  INSERT INTO kinetiks_rate_limits (key_id, window_start, window_type, request_count)
  VALUES (p_key_id, p_window_start, p_window_type, 1)
  ON CONFLICT (key_id, window_start, window_type)
  DO UPDATE SET request_count = kinetiks_rate_limits.request_count + 1
  RETURNING request_count;
$$;
