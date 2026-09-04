import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

export type EmergencyType =
  | 'medical'
  | 'fire'
  | 'accident'
  | 'pandemic'
  | 'mass_casualty'
  | 'cardiac'
  | 'trauma'
  | 'other';

export type EmergencyStatus =
  | 'pending'
  | 'dispatched'
  | 'en_route'
  | 'at_scene'
  | 'transporting'
  | 'arrived'
  | 'resolved'
  | 'cancelled';

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface Hospital {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  beds_total: number;
  beds_available: number;
  ventilators_total: number;
  ventilators_available: number;
  phone: string;
  specialties: string;
  created_at: string;
}

export interface Ambulance {
  id: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  lat: number;
  lng: number;
  status:
    | 'available'
    | 'dispatched'
    | 'en_route'
    | 'at_scene'
    | 'transporting'
    | 'offline';
  current_emergency_id: string | null;
  destination_hospital_id: string | null;
  patient_condition: string;
  eta_minutes: number;
  created_at: string;
}

export interface BloodBank {
  id: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  inventory: Record<string, number>;
  created_at: string;
}

export interface Emergency {
  id: string;
  type: EmergencyType;
  severity: Severity;
  status: EmergencyStatus;
  location: string;
  lat: number;
  lng: number;
  victim_name: string;
  victim_phone: string;
  description: string;
  assigned_ambulance_id: string | null;
  assigned_hospital_id: string | null;
  assigned_blood_bank_id: string | null;
  patient_condition: string;
  eta_minutes: number;
  feedback: string;
  created_at: string;
  updated_at: string;
}

export interface BloodRequest {
  id: string;
  emergency_id: string | null;
  blood_bank_id: string | null;
  requester_type: 'hospital' | 'ambulance';
  requester_name: string;
  blood_type: string;
  units_needed: number;
  status: 'pending' | 'approved' | 'dispatched' | 'delivered' | 'rejected' | 'cancelled';
  drone_delivery: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrafficSegment {
  id: string;
  road_name: string;
  congestion_level: 'clear' | 'light' | 'moderate' | 'heavy' | 'blocked';
  avg_speed_kmph: number;
  delay_minutes: number;
  is_emergency_route: boolean;
  updated_at: string;
}

export interface Donor {
  id: string;
  name: string;
  blood_type: string;
  phone: string;
  city: string;
  last_donated: string | null;
  available: boolean;
  notified: boolean;
  blood_bank_id: string | null;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  event_type: string;
  emergency_id: string | null;
  metadata: Record<string, unknown>;
  response_time_seconds: number | null;
  created_at: string;
}

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const EMERGENCY_TYPES: { value: EmergencyType; label: string; icon: string }[] = [
  { value: 'medical', label: 'Medical Emergency', icon: 'heart-pulse' },
  { value: 'cardiac', label: 'Cardiac Arrest', icon: 'heart' },
  { value: 'accident', label: 'Road Accident', icon: 'car' },
  { value: 'fire', label: 'Fire Emergency', icon: 'flame' },
  { value: 'trauma', label: 'Trauma / Injury', icon: 'bandage' },
  { value: 'pandemic', label: 'Pandemic / Outbreak', icon: 'virus' },
  { value: 'mass_casualty', label: 'Mass Casualty', icon: 'users' },
  { value: 'other', label: 'Other Emergency', icon: 'alert-triangle' },
];

export const SEVERITY_LEVELS: { value: Severity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'green' },
  { value: 'moderate', label: 'Moderate', color: 'yellow' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'critical', label: 'Critical', color: 'red' },
];
