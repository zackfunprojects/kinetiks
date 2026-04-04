-- Phase 4: Add capabilities column to kinetiks_synapses for command routing

ALTER TABLE kinetiks_synapses
  ADD COLUMN IF NOT EXISTS capabilities jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN kinetiks_synapses.capabilities IS 'Registered command capabilities for this Synapse (query, action, config)';
