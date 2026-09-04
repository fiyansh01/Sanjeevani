/*
# Sanjeevani — Emergency Response Platform Schema

## Overview
Creates the complete database schema for a real-time emergency response and disaster management platform
connecting hospitals, ambulances, blood banks, and institutions.

## Tables
1. `hospitals` — Hospital registry with live bed/ventilator availability and location
2. `ambulances` — Ambulance fleet with GPS tracking, status, and assigned emergency
3. `blood_banks` — Blood bank inventory with per-type unit counts and donor list
4. `institutions` — Registered institutions (schools, hotels, offices, resorts) that can trigger SOS
5. `emergencies` — Central emergency log; every SOS creates a row here and all dashboards react to it
6. `blood_requests` — Blood requests from hospitals/ambulances to blood banks, with approval workflow
7. `traffic_segments` — Simulated traffic sensor data for route congestion analysis
8. `analytics_events` — Append-only log of key events (dispatch, accept, save) for analytics
9. `donors` — Registered blood donors with contact info and notification status

## Security
- Single-tenant app (no sign-in). All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because the data is intentionally shared/public across all dashboards.
- RLS enabled on every table.

## Notes
1. All dashboards subscribe to `emergencies` for real-time SOS updates.
2. Hospital auto-suggestion uses `beds_available > 0` and proximity.
3. Blood bank inventory is updated by blood bank staff; requests flow through `blood_requests`.
4. Traffic segments are seeded with simulated congestion values.
5. `analytics_events` feeds the analytics dashboard (response time, lives saved, utilization).
*/

-- ============================================================
-- HOSPITALS
-- ============================================================
CREATE TABLE IF NOT EXISTS hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  lat double precision NOT NULL DEFAULT 28.6139,
  lng double precision NOT NULL DEFAULT 77.2090,
  beds_total integer NOT NULL DEFAULT 100,
  beds_available integer NOT NULL DEFAULT 50,
  ventilators_total integer NOT NULL DEFAULT 20,
  ventilators_available integer NOT NULL DEFAULT 10,
  phone text NOT NULL DEFAULT '+91-100',
  specialties text NOT NULL DEFAULT 'General',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_hospitals" ON hospitals;
CREATE POLICY "anon_crud_hospitals" ON hospitals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_hospitals" ON hospitals;
CREATE POLICY "anon_insert_hospitals" ON hospitals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_hospitals" ON hospitals;
CREATE POLICY "anon_update_hospitals" ON hospitals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_hospitals" ON hospitals;
CREATE POLICY "anon_delete_hospitals" ON hospitals FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- AMBULANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS ambulances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number text NOT NULL,
  driver_name text NOT NULL DEFAULT 'Driver',
  driver_phone text NOT NULL DEFAULT '+91-100',
  lat double precision NOT NULL DEFAULT 28.6139,
  lng double precision NOT NULL DEFAULT 77.2090,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','dispatched','en_route','at_scene','transporting','offline')),
  current_emergency_id uuid,
  destination_hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  patient_condition text NOT NULL DEFAULT 'Unknown',
  eta_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ambulances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_ambulances" ON ambulances;
CREATE POLICY "anon_select_ambulances" ON ambulances FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ambulances" ON ambulances;
CREATE POLICY "anon_insert_ambulances" ON ambulances FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ambulances" ON ambulances;
CREATE POLICY "anon_update_ambulances" ON ambulances FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ambulances" ON ambulances;
CREATE POLICY "anon_delete_ambulances" ON ambulances FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- BLOOD BANKS
-- ============================================================
CREATE TABLE IF NOT EXISTS blood_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL DEFAULT '+91-100',
  lat double precision NOT NULL DEFAULT 28.6139,
  lng double precision NOT NULL DEFAULT 77.2090,
  -- Inventory stored as JSONB: { "A+": 120, "B+": 80, ... }
  inventory jsonb NOT NULL DEFAULT '{"A+":120,"A-":45,"B+":100,"B-":30,"AB+":25,"AB-":10,"O+":150,"O-":60}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE blood_banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_blood_banks" ON blood_banks;
CREATE POLICY "anon_select_blood_banks" ON blood_banks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_blood_banks" ON blood_banks;
CREATE POLICY "anon_insert_blood_banks" ON blood_banks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_blood_banks" ON blood_banks;
CREATE POLICY "anon_update_blood_banks" ON blood_banks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_blood_banks" ON blood_banks;
CREATE POLICY "anon_delete_blood_banks" ON blood_banks FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- INSTITUTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'school' CHECK (type IN ('school','college','hotel','resort','office','mall','stadium')),
  address text NOT NULL,
  lat double precision NOT NULL DEFAULT 28.6139,
  lng double precision NOT NULL DEFAULT 77.2090,
  capacity integer NOT NULL DEFAULT 500,
  evacuation_status text NOT NULL DEFAULT 'safe' CHECK (evacuation_status IN ('safe','evacuating','evacuated','emergency')),
  contact_person text NOT NULL DEFAULT 'Administrator',
  contact_phone text NOT NULL DEFAULT '+91-100',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_institutions" ON institutions;
CREATE POLICY "anon_select_institutions" ON institutions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_institutions" ON institutions;
CREATE POLICY "anon_insert_institutions" ON institutions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_institutions" ON institutions;
CREATE POLICY "anon_update_institutions" ON institutions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_institutions" ON institutions;
CREATE POLICY "anon_delete_institutions" ON institutions FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- EMERGENCIES (central log)
-- ============================================================
CREATE TABLE IF NOT EXISTS emergencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'medical' CHECK (type IN ('medical','fire','accident','pandemic','mass_casualty','cardiac','trauma','other')),
  severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('low','moderate','high','critical')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','en_route','at_scene','transporting','arrived','resolved','cancelled')),
  location text NOT NULL DEFAULT 'Unknown',
  lat double precision NOT NULL DEFAULT 28.6139,
  lng double precision NOT NULL DEFAULT 77.2090,
  victim_name text NOT NULL DEFAULT 'Unknown',
  victim_phone text NOT NULL DEFAULT '+91-100',
  description text NOT NULL DEFAULT '',
  assigned_ambulance_id uuid REFERENCES ambulances(id) ON DELETE SET NULL,
  assigned_hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  assigned_blood_bank_id uuid REFERENCES blood_banks(id) ON DELETE SET NULL,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  patient_condition text NOT NULL DEFAULT 'Unknown',
  eta_minutes integer NOT NULL DEFAULT 0,
  feedback text NOT NULL DEFAULT 'Alert sent. Waiting for ambulance dispatch...',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE emergencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_emergencies" ON emergencies;
CREATE POLICY "anon_select_emergencies" ON emergencies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_emergencies" ON emergencies;
CREATE POLICY "anon_insert_emergencies" ON emergencies FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_emergencies" ON emergencies;
CREATE POLICY "anon_update_emergencies" ON emergencies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_emergencies" ON emergencies;
CREATE POLICY "anon_delete_emergencies" ON emergencies FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- BLOOD REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS blood_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id uuid REFERENCES emergencies(id) ON DELETE CASCADE,
  blood_bank_id uuid REFERENCES blood_banks(id) ON DELETE SET NULL,
  requester_type text NOT NULL DEFAULT 'hospital' CHECK (requester_type IN ('hospital','ambulance','institution')),
  requester_name text NOT NULL DEFAULT 'Unknown',
  blood_type text NOT NULL DEFAULT 'O+',
  units_needed integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dispatched','delivered','rejected','cancelled')),
  drone_delivery boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_blood_requests" ON blood_requests;
CREATE POLICY "anon_select_blood_requests" ON blood_requests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_blood_requests" ON blood_requests;
CREATE POLICY "anon_insert_blood_requests" ON blood_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_blood_requests" ON blood_requests;
CREATE POLICY "anon_update_blood_requests" ON blood_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_blood_requests" ON blood_requests;
CREATE POLICY "anon_delete_blood_requests" ON blood_requests FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- TRAFFIC SEGMENTS (simulated sensor data)
-- ============================================================
CREATE TABLE IF NOT EXISTS traffic_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_name text NOT NULL,
  congestion_level text NOT NULL DEFAULT 'moderate' CHECK (congestion_level IN ('clear','light','moderate','heavy','blocked')),
  avg_speed_kmph integer NOT NULL DEFAULT 40,
  delay_minutes integer NOT NULL DEFAULT 0,
  is_emergency_route boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE traffic_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_traffic" ON traffic_segments;
CREATE POLICY "anon_select_traffic" ON traffic_segments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_traffic" ON traffic_segments;
CREATE POLICY "anon_insert_traffic" ON traffic_segments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_traffic" ON traffic_segments;
CREATE POLICY "anon_update_traffic" ON traffic_segments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_traffic" ON traffic_segments;
CREATE POLICY "anon_delete_traffic" ON traffic_segments FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- DONORS
-- ============================================================
CREATE TABLE IF NOT EXISTS donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  blood_type text NOT NULL DEFAULT 'O+',
  phone text NOT NULL DEFAULT '+91-100',
  city text NOT NULL DEFAULT 'Delhi',
  last_donated date,
  available boolean NOT NULL DEFAULT true,
  notified boolean NOT NULL DEFAULT false,
  blood_bank_id uuid REFERENCES blood_banks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_donors" ON donors;
CREATE POLICY "anon_select_donors" ON donors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_donors" ON donors;
CREATE POLICY "anon_insert_donors" ON donors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_donors" ON donors;
CREATE POLICY "anon_update_donors" ON donors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_donors" ON donors;
CREATE POLICY "anon_delete_donors" ON donors FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- ANALYTICS EVENTS (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('sos_triggered','ambulance_dispatched','patient_accepted','blood_requested','blood_approved','life_saved','evacuation_confirmed','hospital_updated','traffic_updated')),
  emergency_id uuid REFERENCES emergencies(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  response_time_seconds integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_analytics" ON analytics_events;
CREATE POLICY "anon_select_analytics" ON analytics_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_analytics" ON analytics_events;
CREATE POLICY "anon_insert_analytics" ON analytics_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_analytics" ON analytics_events;
CREATE POLICY "anon_update_analytics" ON analytics_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_analytics" ON analytics_events;
CREATE POLICY "anon_delete_analytics" ON analytics_events FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON emergencies(status);
CREATE INDEX IF NOT EXISTS idx_emergencies_created ON emergencies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ambulances_status ON ambulances(status);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emergencies_updated ON emergencies;
CREATE TRIGGER trg_emergencies_updated BEFORE UPDATE ON emergencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_blood_requests_updated ON blood_requests;
CREATE TRIGGER trg_blood_requests_updated BEFORE UPDATE ON blood_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_traffic_updated ON traffic_segments;
CREATE TRIGGER trg_traffic_updated BEFORE UPDATE ON traffic_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO hospitals (name, address, lat, lng, beds_available, ventilators_available, beds_total, ventilators_total, phone, specialties)
VALUES
  ('AIIMS Delhi', 'Ansari Nagar, New Delhi', 28.5675, 77.2100, 42, 8, 200, 30, '+91-11-26588500', 'Cardiology, Trauma, Neurology, Pediatrics'),
  ('Apollo Hospital', 'Sarita Vihar, New Delhi', 28.5270, 77.2730, 35, 12, 150, 25, '+91-11-26925858', 'Cardiac, Orthopedics, Emergency Medicine'),
  ('Fortis Escorts', 'Okhla Road, New Delhi', 28.5535, 77.2710, 28, 5, 120, 20, '+91-11-26825000', 'Cardiology, Oncology, Nephrology'),
  ('Max Smart Super Speciality', 'Saket, New Delhi', 28.5245, 77.2520, 50, 15, 180, 35, '+91-11-26515000', 'Neurology, Cardiac, Trauma, Transplant'),
  ('Safdarjung Hospital', 'Safdarjung Enclave, New Delhi', 28.5689, 77.2067, 60, 10, 250, 40, '+91-11-26165060', 'General, Emergency, Burns, Orthopedics')
ON CONFLICT DO NOTHING;

INSERT INTO ambulances (vehicle_number, driver_name, driver_phone, lat, lng, status, eta_minutes)
VALUES
  ('DL-01-AB-1234', 'Rajesh Kumar', '+91-9810012345', 28.6139, 77.2090, 'available', 0),
  ('DL-01-CD-5678', 'Suresh Singh', '+91-9810056789', 28.5270, 77.2730, 'available', 0),
  ('DL-02-EF-9012', 'Amit Verma', '+91-9810090123', 28.5535, 77.2710, 'available', 0),
  ('DL-02-GH-3456', 'Vikram Patel', '+91-9810034567', 28.5245, 77.2520, 'available', 0),
  ('DL-03-IJ-7890', 'Deepak Sharma', '+91-9810078901', 28.5689, 77.2067, 'available', 0),
  ('DL-03-KL-1122', 'Manoj Yadav', '+91-9810011223', 28.6100, 77.2300, 'available', 0)
ON CONFLICT DO NOTHING;

INSERT INTO blood_banks (name, address, phone, lat, lng, inventory)
VALUES
  ('Indian Red Cross Blood Bank', '1 Red Cross Road, New Delhi', '+91-11-23716442', 28.6139, 77.2090,
   '{"A+":120,"A-":45,"B+":100,"B-":30,"AB+":25,"AB-":10,"O+":150,"O-":60}'::jsonb),
  ('AIIMS Blood Bank', 'Ansari Nagar, New Delhi', '+91-11-26594679', 28.5675, 77.2100,
   '{"A+":80,"A-":30,"B+":65,"B-":15,"AB+":20,"AB-":8,"O+":110,"O-":40}'::jsonb),
  ('Delhi State Blood Transfusion Centre', 'GTB Hospital Campus, Delhi', '+91-11-22592171', 28.6520, 77.3000,
   '{"A+":95,"A-":35,"B+":70,"B-":20,"AB+":15,"AB-":5,"O+":130,"O-":50}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO institutions (name, type, address, lat, lng, capacity, contact_person, contact_phone)
VALUES
  ('Delhi Public School', 'school', 'R.K. Puram, New Delhi', 28.5630, 77.1670, 2000, 'Principal Mehta', '+91-11-26175171'),
  ('IIT Delhi', 'college', 'Hauz Khas, New Delhi', 28.5450, 77.1920, 8000, 'Dean Sharma', '+91-11-26591111'),
  ('The Grand Hotel', 'hotel', 'Connaught Place, New Delhi', 28.6320, 77.2190, 500, 'Mr. Kapoor', '+91-11-23355555'),
  ('Cyber Hub Office Complex', 'office', 'Gurgaon Sector 24', 28.4940, 77.0890, 5000, 'Facility Manager', '+91-124-4567890'),
  ('Kingdom of Dreams', 'stadium', 'Sector 29, Gurgaon', 28.4710, 77.0690, 3000, 'Event Coordinator', '+91-124-4567800')
ON CONFLICT DO NOTHING;

INSERT INTO traffic_segments (road_name, congestion_level, avg_speed_kmph, delay_minutes, is_emergency_route)
VALUES
  ('Ring Road - South', 'moderate', 35, 8, true),
  ('Outer Ring Road', 'heavy', 20, 15, true),
  ('Mathura Road', 'light', 50, 3, true),
  ('Aurobindo Marg', 'clear', 60, 0, true),
  ('MG Road - Gurgaon', 'heavy', 15, 20, false),
  ('NH-48 (Delhi-Gurgaon)', 'moderate', 40, 7, true),
  ('Barakhamba Road', 'light', 45, 5, true),
  ('Janpath', 'clear', 55, 0, false),
  ('India Gate Roundabout', 'moderate', 30, 10, true),
  ('AIIMS Road', 'light', 50, 2, true)
ON CONFLICT DO NOTHING;

INSERT INTO donors (name, blood_type, phone, city, available, blood_bank_id)
VALUES
  ('Arjun Mehta', 'O+', '+91-9811000001', 'Delhi', true, null),
  ('Priya Sharma', 'A+', '+91-9811000002', 'Delhi', true, null),
  ('Rahul Gupta', 'B+', '+91-9811000003', 'Delhi', true, null),
  ('Sneha Reddy', 'O-', '+91-9811000004', 'Delhi', true, null),
  ('Karan Malhotra', 'AB+', '+91-9811000005', 'Delhi', true, null),
  ('Ananya Iyer', 'A-', '+91-9811000006', 'Delhi', false, null),
  ('Vivek Nair', 'B-', '+91-9811000007', 'Delhi', true, null),
  ('Pooja Bhatia', 'O+', '+91-9811000008', 'Delhi', true, null)
ON CONFLICT DO NOTHING;
