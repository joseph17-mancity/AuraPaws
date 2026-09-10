/*
# AuraPaws — Automated Animal Welfare Monitoring Schema

## Overview
Creates the full database schema for the AuraPaws platform, an automated welfare monitoring
system that processes real-time acoustic and vision telemetry to detect non-verbal animal
distress. The schema supports streaming telemetry from edge devices, a Predictive Welfare
Index (PWI) scoring engine, and intervention logging for veterinary staff.

## New Tables

1. **shelter_units** — Physical locations/enclosures within a shelter where animals are housed.
   - `id` (uuid, PK)
   - `name` (text, not null) — human-readable unit name (e.g., "Kennel A-12")
   - `location` (text) — building/zone description
   - `capacity` (int, default 1) — max animals per unit
   - `created_at` (timestamptz, default now)

2. **animals** — Individual animals being monitored by the system.
   - `id` (uuid, PK)
   - `name` (text, not null) — animal's name
   - `species` (text, not null) — e.g., "Canine", "Feline"
   - `breed` (text) — breed description
   - `age_years` (numeric) — age in years
   - `shelter_unit_id` (uuid, FK → shelter_units) — current enclosure
   - `admission_date` (date) — when the animal entered the shelter
   - `medical_notes` (text) — pre-existing conditions, medications
   - `status` (text, default 'ACTIVE') — ACTIVE, ADOPTED, TRANSFERRED, DECEASED
   - `created_at` (timestamptz, default now)

3. **edge_devices** — Hardware sensors (camera + microphone) deployed in shelter units.
   - `id` (uuid, PK)
   - `shelter_unit_id` (uuid, FK → shelter_units) — which unit this device covers
   - `device_code` (text, unique, not null) — hardware serial/identifier
   - `device_type` (text, default 'MULTIMODAL') — MULTIMODAL, AUDIO_ONLY, VISION_ONLY
   - `firmware_version` (text)
   - `status` (text, default 'ONLINE') — ONLINE, OFFLINE, MAINTENANCE
   - `last_heartbeat_at` (timestamptz) — last check-in from device
   - `created_at` (timestamptz, default now)

4. **welfare_telemetry** — Streaming PWI readings from the inference engine.
   - `id` (uuid, PK)
   - `animal_id` (uuid, FK → animals, not null) — which animal this reading is for
   - `edge_device_id` (uuid, FK → edge_devices) — which device captured the data
   - `pwi_score` (int, not null) — Predictive Welfare Index 0–100 (100 = optimal)
   - `stress_category` (text, not null) — OPTIMAL, MONITOR, CRITICAL
   - `audio_classification` (text) — PLAYFUL, NEUTRAL, SEPARATION_ANXIETY, PAIN_VOCALIZATION, STRESS_PANTING
   - `audio_confidence` (real) — 0.0–1.0 model confidence
   - `vision_posture_weight` (real) — 0.0–1.0 posture distress level
   - `vision_confidence` (real) — 0.0–1.0 model confidence
   - `heart_rate_bpm` (real) — beats per minute
   - `panting_frequency_cpm` (real) — cycles per minute
   - `head_tilt_angle` (real) — degrees
   - `ear_orientation` (real) — degrees
   - `tail_tuck_angle` (real) — degrees relative to spine
   - `pacing_velocity` (real) — m/s
   - `recommended_action` (text) — e.g., "Deploy sound masking", "Immediate vet check"
   - `is_emergency` (boolean, default false) — auto-flagged true when pwi_score < 50
   - `created_at` (timestamptz, default now)

5. **intervention_logs** — Record of actions taken by vet staff in response to telemetry.
   - `id` (uuid, PK)
   - `animal_id` (uuid, FK → animals, not null)
   - `telemetry_id` (uuid, FK → welfare_telemetry) — triggering reading
   - `action_type` (text, not null) — SOUND_MASKING, VET_DISPATCH, MEDICATION, RELOCATION, OBSERVATION
   - `performed_by` (text) — staff member name
   - `notes` (text)
   - `status` (text, default 'INITIATED') — INITIATED, IN_PROGRESS, COMPLETED, CANCELLED
   - `created_at` (timestamptz, default now)

## Indexes
- Compound index on `welfare_telemetry (animal_id, created_at DESC)` for efficient per-animal time-series queries.
- Index on `welfare_telemetry (is_emergency)` for fast alert queries.
- Index on `welfare_telemetry (created_at DESC)` for general time-sorted scans.
- Index on `animals (shelter_unit_id)` for unit-to-animal lookups.
- Index on `edge_devices (shelter_unit_id)` for unit-to-device lookups.
- Index on `intervention_logs (animal_id, created_at DESC)`.

## Realtime / Emergency Trigger
- PL/pgSQL function `flag_emergency_telemetry()` fires BEFORE INSERT on `welfare_telemetry`.
  When `pwi_score < 50`, it sets `is_emergency = true` and `stress_category = 'CRITICAL'`
  (if not already set), ensuring every low-PWI row is automatically flagged for
  emergency notification. Supabase Realtime broadcasts the INSERT to subscribed clients.

## Security (RLS)
This is a no-auth, single-tenant dashboard app (no sign-in screen). All policies use
`TO anon, authenticated` so the anon-key frontend can read and write its own data.
- All 5 tables have RLS enabled.
- 4 CRUD policies per table (SELECT, INSERT, UPDATE, DELETE) with `USING (true)` / `WITH CHECK (true)`
  because the data is intentionally shared/public within the shelter operations context.
*/

-- ============================================================
-- 1. shelter_units
-- ============================================================
CREATE TABLE IF NOT EXISTS shelter_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  capacity int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shelter_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_shelter_units" ON shelter_units;
CREATE POLICY "anon_select_shelter_units" ON shelter_units FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_shelter_units" ON shelter_units;
CREATE POLICY "anon_insert_shelter_units" ON shelter_units FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_shelter_units" ON shelter_units;
CREATE POLICY "anon_update_shelter_units" ON shelter_units FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_shelter_units" ON shelter_units;
CREATE POLICY "anon_delete_shelter_units" ON shelter_units FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 2. animals
-- ============================================================
CREATE TABLE IF NOT EXISTS animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  species text NOT NULL,
  breed text,
  age_years numeric,
  shelter_unit_id uuid REFERENCES shelter_units(id) ON DELETE SET NULL,
  admission_date date,
  medical_notes text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_animals_shelter_unit ON animals (shelter_unit_id);

DROP POLICY IF EXISTS "anon_select_animals" ON animals;
CREATE POLICY "anon_select_animals" ON animals FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_animals" ON animals;
CREATE POLICY "anon_insert_animals" ON animals FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_animals" ON animals;
CREATE POLICY "anon_update_animals" ON animals FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_animals" ON animals;
CREATE POLICY "anon_delete_animals" ON animals FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 3. edge_devices
-- ============================================================
CREATE TABLE IF NOT EXISTS edge_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_unit_id uuid REFERENCES shelter_units(id) ON DELETE SET NULL,
  device_code text UNIQUE NOT NULL,
  device_type text NOT NULL DEFAULT 'MULTIMODAL',
  firmware_version text,
  status text NOT NULL DEFAULT 'ONLINE',
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE edge_devices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_edge_devices_shelter_unit ON edge_devices (shelter_unit_id);

DROP POLICY IF EXISTS "anon_select_edge_devices" ON edge_devices;
CREATE POLICY "anon_select_edge_devices" ON edge_devices FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_edge_devices" ON edge_devices;
CREATE POLICY "anon_insert_edge_devices" ON edge_devices FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_edge_devices" ON edge_devices;
CREATE POLICY "anon_update_edge_devices" ON edge_devices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_edge_devices" ON edge_devices;
CREATE POLICY "anon_delete_edge_devices" ON edge_devices FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 4. welfare_telemetry
-- ============================================================
CREATE TABLE IF NOT EXISTS welfare_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  edge_device_id uuid REFERENCES edge_devices(id) ON DELETE SET NULL,
  pwi_score int NOT NULL,
  stress_category text NOT NULL,
  audio_classification text,
  audio_confidence real,
  vision_posture_weight real,
  vision_confidence real,
  heart_rate_bpm real,
  panting_frequency_cpm real,
  head_tilt_angle real,
  ear_orientation real,
  tail_tuck_angle real,
  pacing_velocity real,
  recommended_action text,
  is_emergency boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE welfare_telemetry ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_telemetry_animal_time
  ON welfare_telemetry (animal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_emergency
  ON welfare_telemetry (is_emergency);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at
  ON welfare_telemetry (created_at DESC);

DROP POLICY IF EXISTS "anon_select_welfare_telemetry" ON welfare_telemetry;
CREATE POLICY "anon_select_welfare_telemetry" ON welfare_telemetry FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_welfare_telemetry" ON welfare_telemetry;
CREATE POLICY "anon_insert_welfare_telemetry" ON welfare_telemetry FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_welfare_telemetry" ON welfare_telemetry;
CREATE POLICY "anon_update_welfare_telemetry" ON welfare_telemetry FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_welfare_telemetry" ON welfare_telemetry;
CREATE POLICY "anon_delete_welfare_telemetry" ON welfare_telemetry FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- 5. intervention_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS intervention_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  telemetry_id uuid REFERENCES welfare_telemetry(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  performed_by text,
  notes text,
  status text NOT NULL DEFAULT 'INITIATED',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE intervention_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_intervention_animal_time
  ON intervention_logs (animal_id, created_at DESC);

DROP POLICY IF EXISTS "anon_select_intervention_logs" ON intervention_logs;
CREATE POLICY "anon_select_intervention_logs" ON intervention_logs FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_intervention_logs" ON intervention_logs;
CREATE POLICY "anon_insert_intervention_logs" ON intervention_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_intervention_logs" ON intervention_logs;
CREATE POLICY "anon_update_intervention_logs" ON intervention_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_intervention_logs" ON intervention_logs;
CREATE POLICY "anon_delete_intervention_logs" ON intervention_logs FOR DELETE
  TO anon, authenticated USING (true);

-- ============================================================
-- Realtime / Emergency Trigger
-- Automatically flags any telemetry row with pwi_score < 50 as emergency
-- and ensures stress_category is CRITICAL. Supabase Realtime broadcasts
-- the INSERT to all subscribed dashboard clients.
-- ============================================================
CREATE OR REPLACE FUNCTION flag_emergency_telemetry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pwi_score < 50 THEN
    NEW.is_emergency := true;
    IF NEW.stress_category IS NULL OR NEW.stress_category NOT IN ('CRITICAL') THEN
      NEW.stress_category := 'CRITICAL';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_emergency ON welfare_telemetry;
CREATE TRIGGER trg_flag_emergency
  BEFORE INSERT ON welfare_telemetry
  FOR EACH ROW
  EXECUTE FUNCTION flag_emergency_telemetry();
