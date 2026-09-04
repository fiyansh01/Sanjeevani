import { useEffect, useState, useCallback } from 'react';
import {
  HeartPulse,
  BedDouble,
  Wind,
  Ambulance as AmbulanceIcon,
  Activity,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  MapPin,
  Phone,
  Clock,
  Building2,
  User,
  Zap,
} from 'lucide-react';
import {
  supabase,
  type Hospital,
  type Emergency,
  type Ambulance,
} from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { canManageDashboard } from '@/lib/access';

export function HospitalDashboard() {
  const toast = useToast();
  const canEdit = canManageDashboard('hospital');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBedModal, setShowBedModal] = useState(false);
  const [showVentModal, setShowVentModal] = useState(false);

  const loadData = useCallback(async () => {
    const [hospRes, emergRes, ambRes] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase
        .from('emergencies')
        .select('*')
        .in('status', ['pending', 'dispatched', 'en_route', 'at_scene', 'transporting'])
        .order('created_at', { ascending: false }),
      supabase.from('ambulances').select('*').order('status'),
    ]);

    setHospitals(hospRes.data as Hospital[] || []);
    setEmergencies(emergRes.data as Emergency[] || []);
    setAmbulances(ambRes.data as Ambulance[] || []);
    if (!selectedHospital && hospRes.data && hospRes.data.length > 0) {
      setSelectedHospital(hospRes.data[0].id);
    }
    setLoading(false);
  }, [selectedHospital]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscriptions
  useEffect(() => {
    const emergChannel = supabase
      .channel('hospital-emergencies')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergencies' },
        () => loadData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulances' },
        () => loadData(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitals' },
        () => loadData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(emergChannel);
    };
  }, [loadData]);

  const currentHospital = hospitals.find((h) => h.id === selectedHospital);
  const activeEmergencies = emergencies.filter((e) => e.status !== 'resolved' && e.status !== 'cancelled');

  const handleUpdateBeds = async (newAvailable: number) => {
    if (!canEdit) return;
    if (!currentHospital) return;
    try {
      const { error } = await supabase
        .from('hospitals')
        .update({ beds_available: Math.min(newAvailable, currentHospital.beds_total) })
        .eq('id', currentHospital.id);
      if (error) throw error;

      await supabase.from('analytics_events').insert({
        event_type: 'hospital_updated',
        metadata: { hospital_id: currentHospital.id, field: 'beds', value: newAvailable },
      });

      toast.show(`Bed availability updated to ${newAvailable}`, 'success');
      setShowBedModal(false);
      loadData();
    } catch {
      toast.show('Failed to update bed availability', 'error');
    }
  };

  const handleUpdateVentilators = async (newAvailable: number) => {
    if (!canEdit) return;
    if (!currentHospital) return;
    try {
      const { error } = await supabase
        .from('hospitals')
        .update({ ventilators_available: Math.min(newAvailable, currentHospital.ventilators_total) })
        .eq('id', currentHospital.id);
      if (error) throw error;

      await supabase.from('analytics_events').insert({
        event_type: 'hospital_updated',
        metadata: { hospital_id: currentHospital.id, field: 'ventilators', value: newAvailable },
      });

      toast.show(`Ventilator availability updated to ${newAvailable}`, 'success');
      setShowVentModal(false);
      loadData();
    } catch {
      toast.show('Failed to update ventilator availability', 'error');
    }
  };

  const handleAcceptPatient = async (emergency: Emergency) => {
    if (!canEdit) return;
    if (!currentHospital) return;
    try {
      const { error } = await supabase
        .from('emergencies')
        .update({
          status: 'arrived',
          assigned_hospital_id: currentHospital.id,
          feedback: `Patient accepted at ${currentHospital.name}. Preparing emergency department.`,
        })
        .eq('id', emergency.id);
      if (error) throw error;

      // Reduce bed count
      await supabase
        .from('hospitals')
        .update({ beds_available: Math.max(0, currentHospital.beds_available - 1) })
        .eq('id', currentHospital.id);

      // Free ambulance
      if (emergency.assigned_ambulance_id) {
        await supabase
          .from('ambulances')
          .update({
            status: 'available',
            current_emergency_id: null,
            destination_hospital_id: null,
            eta_minutes: 0,
            patient_condition: 'Unknown',
          })
          .eq('id', emergency.assigned_ambulance_id);
      }

      await supabase.from('analytics_events').insert({
        event_type: 'patient_accepted',
        emergency_id: emergency.id,
        metadata: { hospital_id: currentHospital.id, hospital_name: currentHospital.name },
        response_time_seconds: Math.floor((Date.now() - new Date(emergency.created_at).getTime()) / 1000),
      });

      toast.show(`Patient accepted at ${currentHospital.name}`, 'success');
      loadData();
    } catch {
      toast.show('Failed to accept patient', 'error');
    }
  };

  const suggestBestHospital = (): Hospital | null => {
    const available = hospitals.filter((h) => h.beds_available > 0);
    if (available.length === 0) return null;
    // Best = most beds + most ventilators (simple heuristic)
    return available.sort((a, b) => {
      const scoreA = a.beds_available * 2 + a.ventilators_available;
      const scoreB = b.beds_available * 2 + b.ventilators_available;
      return scoreB - scoreA;
    })[0];
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center lg:ml-64">
        <div className="animate-pulse text-gray-400">Loading hospital dashboard...</div>
      </div>
    );
  }

  const totalBeds = hospitals.reduce((sum, h) => sum + h.beds_available, 0);
  const totalVents = hospitals.reduce((sum, h) => sum + h.ventilators_available, 0);
  const totalCapacity = hospitals.reduce((sum, h) => sum + h.beds_total, 0);
  const utilization = totalCapacity > 0 ? Math.round(((totalCapacity - totalBeds) / totalCapacity) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8 lg:ml-64">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Hospital Dashboard</h1>
            <p className="mt-1 text-gray-500">Live bed availability, patient management, and emergency intake.</p>
          </div>
          <select
            value={selectedHospital ?? ''}
            onChange={(e) => setSelectedHospital(e.target.value)}
            className="input-field max-w-xs"
          >
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={BedDouble} label="Available Beds" value={totalBeds} color="blue" />
          <StatCard icon={Wind} label="Available Ventilators" value={totalVents} color="green" />
          <StatCard icon={Activity} label="Active Emergencies" value={activeEmergencies.length} color="red" />
          <StatCard icon={TrendingUp} label="Bed Utilization" value={`${utilization}%`} color="amber" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Current hospital details + controls */}
          <div className="space-y-6">
            {currentHospital && (
              <div className="card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                    <Building2 size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{currentHospital.name}</h2>
                    <p className="text-sm text-gray-500">{currentHospital.specialties}</p>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={16} className="text-gray-400" />
                    {currentHospital.address}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={16} className="text-gray-400" />
                    {currentHospital.phone}
                  </div>
                </div>

                {/* Availability bars */}
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Beds</span>
                      <span className="text-sm font-bold text-blue-600">
                        {currentHospital.beds_available} / {currentHospital.beds_total}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${(currentHospital.beds_available / currentHospital.beds_total) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Ventilators</span>
                      <span className="text-sm font-bold text-green-600">
                        {currentHospital.ventilators_available} / {currentHospital.ventilators_total}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${(currentHospital.ventilators_available / currentHospital.ventilators_total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                {canEdit && <div className="mt-6 space-y-2">
                  <button onClick={() => setShowBedModal(true)} className="btn-primary w-full">
                    <BedDouble size={18} />
                    Update Beds
                  </button>
                  <button onClick={() => setShowVentModal(true)} className="btn-success w-full">
                    <Wind size={18} />
                    Update Ventilators
                  </button>
                </div>}
              </div>
            )}

            {/* All hospitals overview */}
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">All Hospitals</h3>
              <div className="space-y-2">
                {hospitals.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <HeartPulse size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{h.name}</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="badge bg-blue-50 text-blue-700">{h.beds_available} beds</span>
                      <span className="badge bg-green-50 text-green-700">{h.ventilators_available} vents</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Incoming emergencies */}
          <div className="lg:col-span-2">
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Incoming Emergencies</h2>
                {activeEmergencies.length > 0 && (
                  <span className="badge bg-red-100 text-red-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                    {activeEmergencies.length} Active
                  </span>
                )}
              </div>

              {activeEmergencies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <CheckCircle2 size={48} className="mb-3 text-green-400" />
                  <p className="text-sm">No active emergencies. All clear.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeEmergencies.map((emerg) => {
                    const ambulance = ambulances.find((a) => a.id === emerg.assigned_ambulance_id);
                    const bestHospital = suggestBestHospital();
                    const isAssignedToThis = emerg.assigned_hospital_id === currentHospital?.id;
                    return (
                      <div
                        key={emerg.id}
                        className={`animate-slide-up rounded-xl border-2 p-4 ${
                          isAssignedToThis ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                              <AlertCircle size={20} className="text-red-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold capitalize text-gray-900">
                                  {emerg.type.replace('_', ' ')}
                                </span>
                                <span
                                  className={`badge ${
                                    emerg.severity === 'critical'
                                      ? 'bg-red-100 text-red-700'
                                      : emerg.severity === 'high'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-yellow-100 text-yellow-700'
                                  }`}
                                >
                                  {emerg.severity}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm text-gray-500">{emerg.location}</p>
                              <p className="text-xs text-gray-400">
                                Reported {new Date(emerg.created_at).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            {emerg.eta_minutes > 0 && (
                              <div className="flex items-center gap-1 text-sm font-semibold text-green-600">
                                <Clock size={14} />
                                {emerg.eta_minutes} min
                              </div>
                            )}
                            <p className="mt-1 text-xs capitalize text-gray-500">{emerg.status.replace('_', ' ')}</p>
                          </div>
                        </div>

                        {ambulance && (
                          <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                            <AmbulanceIcon size={16} className="text-gray-500" />
                            <span className="font-medium text-gray-700">{ambulance.vehicle_number}</span>
                            <span className="text-gray-400">·</span>
                            <User size={14} className="text-gray-400" />
                            <span className="text-gray-600">{ambulance.driver_name}</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-600">{ambulance.patient_condition}</span>
                          </div>
                        )}

                        {bestHospital && !isAssignedToThis && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs">
                            <Zap size={14} className="text-amber-600" />
                            <span className="text-amber-700">
                              Suggested hospital: <strong>{bestHospital.name}</strong> ({bestHospital.beds_available} beds available)
                            </span>
                          </div>
                        )}

                        {canEdit && <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleAcceptPatient(emerg)}
                            className="btn-success flex-1"
                          >
                            <CheckCircle2 size={16} />
                            Accept Patient
                          </button>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bed update modal */}
      {showBedModal && currentHospital && (
        <UpdateModal
          title="Update Bed Availability"
          icon={BedDouble}
          current={currentHospital.beds_available}
          max={currentHospital.beds_total}
          onSave={handleUpdateBeds}
          onClose={() => setShowBedModal(false)}
        />
      )}

      {/* Ventilator update modal */}
      {showVentModal && currentHospital && (
        <UpdateModal
          title="Update Ventilator Availability"
          icon={Wind}
          current={currentHospital.ventilators_available}
          max={currentHospital.ventilators_total}
          onSave={handleUpdateVentilators}
          onClose={() => setShowVentModal(false)}
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
  value: number | string;
  color: 'blue' | 'green' | 'red' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
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

function UpdateModal({
  title,
  icon: Icon,
  current,
  max,
  onSave,
  onClose,
}: {
  title: string;
  icon: typeof BedDouble;
  current: number;
  max: number;
  onSave: (value: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slide-up card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Icon size={20} className="text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Current: {current} / {max} available
        </p>
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value) || 0)}
          className="input-field mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(value)} className="btn-primary flex-1">Save</button>
        </div>
      </div>
    </div>
  );
}
