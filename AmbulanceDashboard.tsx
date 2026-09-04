import { useEffect, useState, useCallback } from 'react';
import {
  Ambulance as AmbulanceIcon,
  Navigation,
  HeartPulse,
  Droplet,
  MapPin,
  Phone,
  User,
  Clock,
  Activity,
  CheckCircle2,
  AlertCircle,
  Truck,
  X,
  Hospital as HospitalIcon,
} from 'lucide-react';
import {
  supabase,
  type Ambulance,
  type Emergency,
  type Hospital,
  type BloodBank,
} from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { canManageDashboard } from '@/lib/access';

const CONDITIONS = [
  'Stable',
  'Critical',
  'Serious',
  'Conscious',
  'Unconscious',
  'Bleeding',
  'Breathing Difficulty',
  'Cardiac Arrest',
  'Trauma',
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

type BloodGroup = (typeof BLOOD_GROUPS)[number];

type PatientDetailsForm = {
  condition: string;
  bloodGroup: BloodGroup;
  location: string;
};

type HospitalRecommendation = {
  hospital: Hospital;
  score: number;
  distanceKm: number;
  reason: string;
};

type MapPoint = {
  id: string;
  label: string;
  kind: 'ambulance' | 'emergency' | 'hospital';
  lat: number;
  lng: number;
  detail: string;
};

function distanceKm(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractBloodGroup(description: string): BloodGroup | null {
  const match = description.match(/blood\s*group\s*:\s*(A\+|A-|B\+|B-|AB\+|AB-|O\+|O-)/i);
  if (!match) return null;
  const normalized = match[1].toUpperCase() as BloodGroup;
  return BLOOD_GROUPS.includes(normalized) ? normalized : null;
}

function upsertBloodGroup(description: string, bloodGroup: BloodGroup) {
  const cleaned = description.replace(/\s*\|\s*blood\s*group\s*:\s*(A\+|A-|B\+|B-|AB\+|AB-|O\+|O-)\s*/gi, ' ').trim();
  if (!cleaned) return `Blood Group: ${bloodGroup}`;
  return `${cleaned} | Blood Group: ${bloodGroup}`;
}

function needsCriticalCare(condition: string, emergencyType: Emergency['type']) {
  const combined = `${condition} ${emergencyType}`.toLowerCase();
  return ['critical', 'cardiac', 'trauma', 'unconscious', 'breathing'].some((keyword) => combined.includes(keyword));
}

function specialtyMatchScore(hospital: Hospital, condition: string, emergencyType: Emergency['type']) {
  const specialties = hospital.specialties.toLowerCase();
  const signals = `${condition} ${emergencyType}`.toLowerCase();
  const needed = [
    signals.includes('cardiac') ? 'cardio' : '',
    signals.includes('trauma') || signals.includes('accident') ? 'trauma' : '',
    signals.includes('breathing') ? 'emergency' : '',
    signals.includes('unconscious') ? 'neurology' : '',
  ].filter(Boolean);

  if (needed.length === 0) {
    return specialties.includes('emergency') || specialties.includes('general') ? 12 : 6;
  }

  const matched = needed.filter((keyword) => specialties.includes(keyword));
  return matched.length === 0 ? 4 : Math.min(20, matched.length * 10);
}

function recommendHospitals(
  hospitals: Hospital[],
  emergency: Emergency,
  ambulance: Ambulance,
  condition: string,
) {
  const critical = needsCriticalCare(condition, emergency.type);
  return hospitals
    .filter((hospital) => hospital.beds_available > 0)
    .map((hospital) => {
      const km = distanceKm(ambulance.lat, ambulance.lng, hospital.lat, hospital.lng);
      const distanceScore = Math.max(0, 45 - km * 7);
      const bedScore = Math.min(28, hospital.beds_available * 1.2);
      const ventilatorScore = critical
        ? Math.min(20, hospital.ventilators_available * 2)
        : Math.min(10, hospital.ventilators_available * 0.8);
      const matchScore = specialtyMatchScore(hospital, condition, emergency.type);
      const totalScore = Math.round(distanceScore + bedScore + ventilatorScore + matchScore);
      const reason = `${km.toFixed(1)} km away, ${hospital.beds_available} beds, ${hospital.ventilators_available} ventilators`;
      return { hospital, score: totalScore, distanceKm: km, reason };
    })
    .sort((a, b) => b.score - a.score);
}

export function AmbulanceDashboard() {
  const toast = useToast();
  const canEdit = canManageDashboard('ambulance');
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [selectedAmbulance, setSelectedAmbulance] = useState<string | null>(null);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [bloodBanks, setBloodBanks] = useState<BloodBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showBloodModal, setShowBloodModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [patientDetails, setPatientDetails] = useState<PatientDetailsForm>({
    condition: 'Stable',
    bloodGroup: 'O+',
    location: '',
  });
  const [hospitalRecommendations, setHospitalRecommendations] = useState<HospitalRecommendation[]>([]);
  const [selectedMapPoint, setSelectedMapPoint] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [ambRes, emergRes, hospRes, bloodRes] = await Promise.all([
      supabase.from('ambulances').select('*').order('status'),
      supabase
        .from('emergencies')
        .select('*')
        .in('status', ['pending', 'dispatched', 'en_route', 'at_scene', 'transporting'])
        .order('created_at', { ascending: false }),
      supabase.from('hospitals').select('*').order('beds_available', { ascending: false }),
      supabase.from('blood_banks').select('*'),
    ]);

    setAmbulances(ambRes.data as Ambulance[] || []);
    setEmergencies(emergRes.data as Emergency[] || []);
    setHospitals(hospRes.data as Hospital[] || []);
    setBloodBanks(bloodRes.data as BloodBank[] || []);
    if (!selectedAmbulance && ambRes.data && ambRes.data.length > 0) {
      setSelectedAmbulance(ambRes.data[0].id);
    }
    setLoading(false);
  }, [selectedAmbulance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('ambulance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambulances' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergencies' }, () => loadData())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadData]);

  const currentAmbulance = ambulances.find((a) => a.id === selectedAmbulance);
  const assignedEmergency = currentAmbulance?.current_emergency_id
    ? emergencies.find((e) => e.id === currentAmbulance.current_emergency_id)
    : null;
  const detectedBloodGroup = assignedEmergency ? extractBloodGroup(assignedEmergency.description) : null;

  useEffect(() => {
    if (!currentAmbulance) return;
    setPatientDetails({
      condition: currentAmbulance.patient_condition || assignedEmergency?.patient_condition || 'Stable',
      bloodGroup: detectedBloodGroup ?? 'O+',
      location: assignedEmergency?.location || `${currentAmbulance.lat.toFixed(4)}, ${currentAmbulance.lng.toFixed(4)}`,
    });
  }, [assignedEmergency, currentAmbulance, detectedBloodGroup]);

  const mapPoints: MapPoint[] = [
    ...(currentAmbulance ? [{
      id: currentAmbulance.id,
      label: currentAmbulance.vehicle_number,
      kind: 'ambulance' as const,
      lat: currentAmbulance.lat,
      lng: currentAmbulance.lng,
      detail: `${currentAmbulance.status.replace('_', ' ')}${currentAmbulance.eta_minutes > 0 ? ` · ETA ${currentAmbulance.eta_minutes} min` : ''}`,
    }] : []),
    ...(assignedEmergency ? [{
      id: assignedEmergency.id,
      label: 'Emergency',
      kind: 'emergency' as const,
      lat: assignedEmergency.lat,
      lng: assignedEmergency.lng,
      detail: `${assignedEmergency.location} · ${assignedEmergency.severity} priority`,
    }] : []),
    ...hospitals.map((hospital) => ({
      id: hospital.id,
      label: hospital.name,
      kind: 'hospital' as const,
      lat: hospital.lat,
      lng: hospital.lng,
      detail: `${hospital.beds_available} beds available`,
    })),
  ];
  const latitudes = mapPoints.map((point) => point.lat);
  const longitudes = mapPoints.map((point) => point.lng);
  const mapLatitudes = latitudes.length > 0 ? latitudes : [0];
  const mapLongitudes = longitudes.length > 0 ? longitudes : [0];
  const latitudeSpan = Math.max((Math.max(...mapLatitudes) - Math.min(...mapLatitudes)) * 1.25, 0.01);
  const longitudeSpan = Math.max((Math.max(...mapLongitudes) - Math.min(...mapLongitudes)) * 1.25, 0.01);
  const minLat = (Math.min(...mapLatitudes) + Math.max(...mapLatitudes)) / 2 - latitudeSpan / 2;
  const minLng = (Math.min(...mapLongitudes) + Math.max(...mapLongitudes)) / 2 - longitudeSpan / 2;
  const getMapPosition = (point: MapPoint) => ({
    left: `${Math.min(92, Math.max(8, ((point.lng - minLng) / longitudeSpan) * 100))}%`,
    top: `${Math.min(82, Math.max(18, (1 - (point.lat - minLat) / latitudeSpan) * 100))}%`,
  });
  const selectedPoint = mapPoints.find((point) => point.id === selectedMapPoint);

  const handleUpdatePatientDetails = async () => {
    if (!canEdit) return;
    if (!currentAmbulance) return;
    try {
      const { error } = await supabase
        .from('ambulances')
        .update({ patient_condition: patientDetails.condition })
        .eq('id', currentAmbulance.id);
      if (error) throw error;

      if (assignedEmergency) {
        const updatedDescription = upsertBloodGroup(assignedEmergency.description, patientDetails.bloodGroup);
        await supabase
          .from('emergencies')
          .update({
            patient_condition: patientDetails.condition,
            location: patientDetails.location,
            description: updatedDescription,
          })
          .eq('id', assignedEmergency.id);
      }

      toast.show('Patient details updated successfully', 'success');
      setShowPatientModal(false);
      loadData();
    } catch {
      toast.show('Failed to update patient details', 'error');
    }
  };

  const handleOpenAiMatch = () => {
    if (!assignedEmergency || !currentAmbulance) return;
    const recommendations = recommendHospitals(
      hospitals,
      assignedEmergency,
      currentAmbulance,
      patientDetails.condition || currentAmbulance.patient_condition,
    );

    if (recommendations.length === 0) {
      toast.show('No hospitals with available beds found right now', 'error');
      return;
    }

    setHospitalRecommendations(recommendations.slice(0, 5));
    setShowAiModal(true);
  };

  const handleRequestBlood = async (bloodType: string, units: number, bloodBankId: string) => {
    if (!canEdit) return;
    if (!currentAmbulance) return;
    try {
      const { data: bloodBank } = await supabase
        .from('blood_banks')
        .select('name')
        .eq('id', bloodBankId)
        .single();

      await supabase.from('blood_requests').insert({
        emergency_id: assignedEmergency?.id ?? null,
        blood_bank_id: bloodBankId,
        requester_type: 'ambulance',
        requester_name: currentAmbulance.vehicle_number,
        blood_type: bloodType,
        units_needed: units,
        status: 'pending',
      });

      toast.show(`Blood request sent to ${bloodBank?.name || 'blood bank'}: ${units} unit(s) of ${bloodType}`, 'success');
      setShowBloodModal(false);
      loadData();
    } catch {
      toast.show('Failed to send blood request', 'error');
    }
  };

  const handleRouteToHospital = async (hospitalId: string, aiReason?: string) => {
    if (!canEdit) return;
    if (!currentAmbulance) return;
    try {
      const hospital = hospitals.find((h) => h.id === hospitalId);
      if (!hospital) return;

      await supabase
        .from('ambulances')
        .update({
          destination_hospital_id: hospitalId,
          status: 'transporting',
          eta_minutes: Math.floor(Math.random() * 8) + 5,
        })
        .eq('id', currentAmbulance.id);

      if (assignedEmergency) {
        const routeMessage = aiReason
          ? `Patient being transported to ${hospital.name}. ${aiReason}.`
          : `Patient being transported to ${hospital.name}. ETA pending.`;
        await supabase
          .from('emergencies')
          .update({
            status: 'transporting',
            assigned_hospital_id: hospitalId,
            feedback: routeMessage,
          })
          .eq('id', assignedEmergency.id);
      }

      toast.show(`Routed to ${hospital.name}. Patient in transit.`, 'success');
      setShowRouteModal(false);
      setShowAiModal(false);
      loadData();
    } catch {
      toast.show('Failed to set route', 'error');
    }
  };

  const handleUpdateStatus = async (status: Ambulance['status']) => {
    if (!canEdit) return;
    if (!currentAmbulance) return;
    try {
      const { error } = await supabase.from('ambulances').update({ status }).eq('id', currentAmbulance.id);
      if (error) throw error;
      toast.show(`Status updated to: ${status.replace('_', ' ')}`, 'success');
      loadData();
    } catch {
      toast.show('Failed to update status', 'error');
    }
  };

  const handleClearAssignment = async () => {
    if (!canEdit) return;
    if (!currentAmbulance) return;
    try {
      const { error } = await supabase
        .from('ambulances')
        .update({
          status: 'available',
          current_emergency_id: null,
          destination_hospital_id: null,
          eta_minutes: 0,
          patient_condition: 'Unknown',
        })
        .eq('id', currentAmbulance.id);
      if (error) throw error;

      toast.show('Ambulance marked as available', 'info');
      loadData();
    } catch {
      toast.show('Failed to update status', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center lg:ml-64">
        <div className="animate-pulse text-gray-400">Loading ambulance dashboard...</div>
      </div>
    );
  }

  const availableCount = ambulances.filter((a) => a.status === 'available').length;
  const dispatchedCount = ambulances.filter((a) => a.status !== 'available' && a.status !== 'offline').length;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8 lg:ml-64">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ambulance Dashboard</h1>
            <p className="mt-1 text-gray-500">GPS tracking, patient management, and hospital routing.</p>
          </div>
          <select
            value={selectedAmbulance ?? ''}
            onChange={(e) => setSelectedAmbulance(e.target.value)}
            className="input-field max-w-xs"
          >
            {ambulances.map((a) => (
              <option key={a.id} value={a.id}>
                {a.vehicle_number} — {a.driver_name}
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={CheckCircle2} label="Available" value={availableCount} color="green" />
          <StatCard icon={Truck} label="On Duty" value={dispatchedCount} color="blue" />
          <StatCard icon={AmbulanceIcon} label="Total Fleet" value={ambulances.length} color="gray" />
          <StatCard icon={AlertCircle} label="Active Emergencies" value={emergencies.length} color="red" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Ambulance details */}
          <div className="space-y-6">
            {currentAmbulance && (
              <div className="card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
                    <AmbulanceIcon size={24} className="text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{currentAmbulance.vehicle_number}</h2>
                    <p className="text-sm text-gray-500">{currentAmbulance.driver_name}</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={16} className="text-gray-400" />
                    {currentAmbulance.driver_phone}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={16} className="text-gray-400" />
                    {currentAmbulance.lat.toFixed(4)}, {currentAmbulance.lng.toFixed(4)}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Activity size={16} className="text-gray-400" />
                    <span className="capitalize">{currentAmbulance.status.replace('_', ' ')}</span>
                  </div>
                  {currentAmbulance.eta_minutes > 0 && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock size={16} className="text-gray-400" />
                      ETA: {currentAmbulance.eta_minutes} min
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div className="mt-4">
                  <span
                    className={`badge w-full justify-center py-1.5 ${
                      currentAmbulance.status === 'available'
                        ? 'bg-green-100 text-green-700'
                        : currentAmbulance.status === 'offline'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {currentAmbulance.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                {/* Action buttons */}
                {canEdit && <div className="mt-5 space-y-2">
                  <button
                    onClick={() => setShowPatientModal(true)}
                    disabled={!assignedEmergency}
                    className="btn-primary w-full"
                  >
                    <HeartPulse size={18} />
                    Update Patient Details
                  </button>
                  <button
                    onClick={handleOpenAiMatch}
                    disabled={!assignedEmergency}
                    className="btn-success w-full"
                  >
                    <Navigation size={18} />
                    AI Hospital Match
                  </button>
                  <button
                    onClick={() => setShowBloodModal(true)}
                    disabled={!assignedEmergency}
                    className="btn-danger w-full"
                  >
                    <Droplet size={18} />
                    Request Blood
                  </button>
                  <button
                    onClick={() => setShowRouteModal(true)}
                    disabled={!assignedEmergency}
                    className="btn-secondary w-full"
                  >
                    <Navigation size={18} />
                    Manual Route Selection
                  </button>
                </div>}

                {/* Quick status controls */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-xs font-semibold text-gray-500">Quick Status</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => handleUpdateStatus('en_route')}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      En Route
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('at_scene')}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      At Scene
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('transporting')}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Transport
                    </button>
                  </div>
                  {currentAmbulance.status !== 'available' && (
                    <button
                      onClick={handleClearAssignment}
                      className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                    >
                      Mark Available
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Fleet overview */}
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Fleet Overview</h3>
              <div className="space-y-2">
                {ambulances.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAmbulance(a.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                      a.id === selectedAmbulance ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          a.status === 'available'
                            ? 'bg-green-500'
                            : a.status === 'offline'
                              ? 'bg-gray-400'
                              : 'bg-blue-500'
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-700">{a.vehicle_number}</span>
                    </div>
                    <span className="text-xs capitalize text-gray-400">{a.status.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Assigned emergency + GPS map */}
          <div className="space-y-6 lg:col-span-2">
            {/* GPS tracking visualization */}
            <div className="card overflow-hidden">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-lg font-bold text-gray-900">GPS Tracking</h2>
                <p className="text-sm text-gray-500">Live ambulance location</p>
              </div>
              <div className="relative h-64 bg-gradient-to-br from-blue-50 to-green-50">
                {/* Simulated map grid */}
                <div className="absolute inset-0 opacity-20">
                  <div className="h-full w-full" style={{
                    backgroundImage: `linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                  }} />
                </div>
                {/* Roads */}
                <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 bg-gray-300/50" />
                <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-gray-300/50" />
                {/* Interactive tracking points */}
                {mapPoints.map((point) => {
                  const isSelected = selectedMapPoint === point.id;
                  const isAmbulance = point.kind === 'ambulance';
                  const isEmergency = point.kind === 'emergency';
                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => setSelectedMapPoint(isSelected ? null : point.id)}
                      style={getMapPosition(point)}
                      aria-label={`View ${point.label}`}
                      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <span className={`absolute -inset-2 rounded-full ${isAmbulance ? 'pulse-ring bg-green-500' : ''}`} />
                      <span className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform ${
                        isSelected ? 'scale-125' : 'hover:scale-110'
                      } ${isAmbulance ? 'bg-green-600' : isEmergency ? 'bg-red-500' : 'bg-blue-600'}`}>
                        {isAmbulance ? <AmbulanceIcon size={20} className="text-white" /> : isEmergency ? <MapPin size={20} className="text-white" /> : <HospitalIcon size={19} className="text-white" />}
                      </span>
                      <span className={`absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                        {point.label}
                      </span>
                    </button>
                  );
                })}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2 rounded-lg bg-white/90 px-2.5 py-2 text-[10px] font-semibold text-gray-600 shadow-sm">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" /> Ambulance</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Incident</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Hospital</span>
                </div>
                {selectedPoint && (
                  <div className="absolute bottom-3 right-3 z-20 max-w-[65%] rounded-lg bg-white/95 px-3 py-2 shadow-md">
                    <p className="text-xs font-bold capitalize text-gray-900">{selectedPoint.label}</p>
                    <p className="text-[11px] capitalize text-gray-500">{selectedPoint.detail}</p>
                    <p className="mt-1 font-mono text-[10px] text-gray-400">{selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}</p>
                  </div>
                )}
                {/* Coordinates */}
                <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-mono text-gray-600 shadow-sm">
                  {currentAmbulance?.lat.toFixed(4)}, {currentAmbulance?.lng.toFixed(4)}
                </div>
              </div>
            </div>

            {/* Assigned emergency */}
            <div className="card p-6">
              <h2 className="mb-4 text-lg font-bold text-gray-900">Assigned Emergency</h2>
              {assignedEmergency ? (
                <div className="animate-slide-up space-y-4">
                  <div className="rounded-xl border-2 border-red-200 bg-red-50/50 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                          <AlertCircle size={20} className="text-red-600" />
                        </div>
                        <div>
                          <span className="font-semibold capitalize text-gray-900">
                            {assignedEmergency.type.replace('_', ' ')}
                          </span>
                          <p className="text-sm text-gray-500">{assignedEmergency.location}</p>
                          <p className="text-xs text-gray-400">
                            {new Date(assignedEmergency.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <span className={`badge ${
                        assignedEmergency.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        assignedEmergency.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {assignedEmergency.severity}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoItem icon={User} label="Victim" value={assignedEmergency.victim_name} />
                    <InfoItem icon={Phone} label="Phone" value={assignedEmergency.victim_phone} />
                    <InfoItem icon={HeartPulse} label="Condition" value={currentAmbulance?.patient_condition || 'Unknown'} />
                    <InfoItem icon={Droplet} label="Blood Group" value={detectedBloodGroup || patientDetails.bloodGroup} />
                    <InfoItem icon={Activity} label="Status" value={assignedEmergency.status.replace('_', ' ')} />
                  </div>

                  {assignedEmergency.description && (
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-sm text-gray-600">{assignedEmergency.description}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <CheckCircle2 size={48} className="mb-3 text-green-400" />
                  <p className="text-sm">No active assignment. Ambulance is available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPatientModal && (
        <PatientDetailsModal
          details={patientDetails}
          onChange={setPatientDetails}
          onSave={handleUpdatePatientDetails}
          onClose={() => setShowPatientModal(false)}
        />
      )}

      {showAiModal && hospitalRecommendations.length > 0 && (
        <AiRouteModal
          recommendations={hospitalRecommendations}
          onRoute={(recommendation) => handleRouteToHospital(recommendation.hospital.id, recommendation.reason)}
          onClose={() => setShowAiModal(false)}
        />
      )}

      {showBloodModal && bloodBanks.length > 0 && (
        <BloodRequestModal
          bloodBanks={bloodBanks}
          onSubmit={handleRequestBlood}
          onClose={() => setShowBloodModal(false)}
        />
      )}

      {showRouteModal && hospitals.length > 0 && (
        <SelectionModal
          title="Route to Hospital"
          icon={Navigation}
          options={hospitals.map((h) => `${h.name} (${h.beds_available} beds)`)}
          onSelect={(label) => {
            const hospital = hospitals.find((h) => label.startsWith(h.name));
            if (hospital) handleRouteToHospital(hospital.id);
          }}
          onClose={() => setShowRouteModal(false)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  color: 'green' | 'blue' | 'red' | 'gray';
}) {
  const colors = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
      <Icon size={16} className="text-gray-400" />
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium capitalize text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function PatientDetailsModal({
  details,
  onChange,
  onSave,
  onClose,
}: {
  details: PatientDetailsForm;
  onChange: (next: PatientDetailsForm) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slide-up card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <HeartPulse size={20} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Update Patient Details</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Patient Condition</label>
            <select
              value={details.condition}
              onChange={(event) => onChange({ ...details, condition: event.target.value })}
              className="input-field"
            >
              {CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Blood Group</label>
            <div className="grid grid-cols-4 gap-2">
              {BLOOD_GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => onChange({ ...details, bloodGroup: group })}
                  className={`rounded-lg border-2 px-2 py-2 text-sm font-bold transition-all ${
                    details.bloodGroup === group
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-red-200'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Patient Location</label>
            <input
              value={details.location}
              onChange={(event) => onChange({ ...details, location: event.target.value })}
              placeholder="Street, landmark, area"
              className="input-field"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onSave} className="btn-primary flex-1">Save Details</button>
        </div>
      </div>
    </div>
  );
}

function AiRouteModal({
  recommendations,
  onRoute,
  onClose,
}: {
  recommendations: HospitalRecommendation[];
  onRoute: (recommendation: HospitalRecommendation) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slide-up card w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <Navigation size={20} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">AI Hospital Recommendations</h2>
            <p className="text-sm text-gray-500">Sorted by proximity, beds, critical care support, and specialty fit.</p>
          </div>
        </div>

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {recommendations.map((recommendation, index) => (
            <button
              key={recommendation.hospital.id}
              type="button"
              onClick={() => onRoute(recommendation)}
              className="w-full rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-green-300 hover:bg-green-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    #{index + 1} {recommendation.hospital.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{recommendation.reason}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-700">Score {recommendation.score}</p>
                  <p className="text-xs text-gray-500">{recommendation.distanceKm.toFixed(1)} km</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button onClick={onClose} className="btn-secondary mt-4 w-full">
          <X size={16} /> Close
        </button>
      </div>
    </div>
  );
}

function SelectionModal({
  title,
  icon: Icon,
  options,
  onSelect,
  onClose,
}: {
  title: string;
  icon: typeof HeartPulse;
  options: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slide-up card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Icon size={20} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              {opt}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="btn-secondary mt-4 w-full">
          <X size={16} /> Close
        </button>
      </div>
    </div>
  );
}

function BloodRequestModal({
  bloodBanks,
  onSubmit,
  onClose,
}: {
  bloodBanks: BloodBank[];
  onSubmit: (bloodType: string, units: number, bloodBankId: string) => void;
  onClose: () => void;
}) {
  const [bloodType, setBloodType] = useState<BloodGroup>('O+');
  const [units, setUnits] = useState(1);
  const [bloodBankId, setBloodBankId] = useState(bloodBanks[0]?.id ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slide-up card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <Droplet size={20} className="text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Request Blood</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Blood Type</label>
            <div className="grid grid-cols-4 gap-2">
              {BLOOD_GROUPS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBloodType(t)}
                  className={`rounded-lg border-2 px-2 py-2 text-sm font-bold transition-all ${
                    bloodType === t ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Units Needed</label>
            <input
              type="number"
              min={1}
              max={10}
              value={units}
              onChange={(e) => setUnits(parseInt(e.target.value) || 1)}
              className="input-field"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Blood Bank</label>
            <select
              value={bloodBankId}
              onChange={(e) => setBloodBankId(e.target.value)}
              className="input-field"
            >
              {bloodBanks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSubmit(bloodType, units, bloodBankId)} className="btn-danger flex-1">
            <Droplet size={16} /> Send Request
          </button>
        </div>
      </div>
    </div>
  );
}
