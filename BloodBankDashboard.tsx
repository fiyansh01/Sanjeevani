import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Droplet,
  Package,
  CheckCircle2,
  XCircle,
  Bell,
  Truck,
  Activity,
  User,
  Phone,
  MapPin,
  Send,
  Heart,
} from 'lucide-react';
import {
  supabase,
  type BloodBank,
  type BloodRequest,
  type Donor,
  BLOOD_TYPES,
} from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { canManageDashboard } from '@/lib/access';

export function BloodBankDashboard() {
  const toast = useToast();
  const canEdit = canManageDashboard('bloodbank');
  const [bloodBanks, setBloodBanks] = useState<BloodBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showDroneModal, setShowDroneModal] = useState<string | null>(null);
  const [droneStatus, setDroneStatus] = useState<'idle' | 'launching' | 'in_flight' | 'delivered'>('idle');
  const droneTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    droneTimers.current.forEach(clearTimeout);
  }, []);

  const loadData = useCallback(async () => {
    const [bankRes, reqRes, donorRes] = await Promise.all([
      supabase.from('blood_banks').select('*').order('name'),
      supabase.from('blood_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('donors').select('*').order('name'),
    ]);

    setBloodBanks(bankRes.data as BloodBank[] || []);
    setRequests(reqRes.data as BloodRequest[] || []);
    setDonors(donorRes.data as Donor[] || []);
    if (!selectedBank && bankRes.data && bankRes.data.length > 0) {
      setSelectedBank(bankRes.data[0].id);
    }
    setLoading(false);
  }, [selectedBank]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('bloodbank-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blood_banks' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blood_requests' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donors' }, () => loadData())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadData]);

  const currentBank = bloodBanks.find((b) => b.id === selectedBank);
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const approvedRequests = requests.filter((r) => r.status === 'approved' || r.status === 'dispatched');

  const handleUpdateInventory = async (inventory: Record<string, number>) => {
    if (!canEdit) return;
    if (!currentBank) return;
    try {
      await supabase.from('blood_banks').update({ inventory }).eq('id', currentBank.id);
      toast.show('Blood inventory updated successfully', 'success');
      setShowInventoryModal(false);
      loadData();
    } catch {
      toast.show('Failed to update inventory', 'error');
    }
  };

  const handleApproveRequest = async (request: BloodRequest) => {
    if (!canEdit) return;
    try {
      const bank = bloodBanks.find((b) => b.id === request.blood_bank_id);
      if (!bank) {
        toast.show('Blood bank not found for this request', 'error');
        return;
      }

      const currentUnits = bank.inventory[request.blood_type] || 0;
      if (currentUnits < request.units_needed) {
        toast.show(`Insufficient ${request.blood_type} units. Available: ${currentUnits}`, 'error');
        return;
      }

      // Deduct units from inventory
      const newInventory = {
        ...bank.inventory,
        [request.blood_type]: currentUnits - request.units_needed,
      };

      await supabase.from('blood_banks').update({ inventory: newInventory }).eq('id', bank.id);

      // Approve request
      await supabase
        .from('blood_requests')
        .update({ status: 'approved' })
        .eq('id', request.id);

      await supabase.from('analytics_events').insert({
        event_type: 'blood_approved',
        emergency_id: request.emergency_id,
        metadata: { blood_type: request.blood_type, units: request.units_needed, bank_id: bank.id },
      });

      toast.show(`Request approved: ${request.units_needed} unit(s) of ${request.blood_type}`, 'success');
      loadData();
    } catch {
      toast.show('Failed to approve request', 'error');
    }
  };

  const handleRejectRequest = async (request: BloodRequest) => {
    if (!canEdit) return;
    try {
      await supabase.from('blood_requests').update({ status: 'rejected' }).eq('id', request.id);
      toast.show('Request rejected', 'info');
      loadData();
    } catch {
      toast.show('Failed to reject request', 'error');
    }
  };

  const handleNotifyDonors = async () => {
    if (!canEdit) return;
    try {
      // Mark all available donors as notified
      const availableDonors = donors.filter((d) => d.available && !d.notified);
      if (availableDonors.length === 0) {
        toast.show('No available donors to notify', 'info');
        return;
      }

      for (const donor of availableDonors) {
        await supabase.from('donors').update({ notified: true }).eq('id', donor.id);
      }

      toast.show(`Notified ${availableDonors.length} available donor(s) about urgent blood needs`, 'success');
      loadData();
    } catch {
      toast.show('Failed to notify donors', 'error');
    }
  };

  const handleDroneDelivery = async (requestId: string) => {
    if (!canEdit) return;
    droneTimers.current.forEach(clearTimeout);
    droneTimers.current = [];
    setDroneStatus('launching');
    setShowDroneModal(requestId);

    droneTimers.current.push(setTimeout(() => setDroneStatus('in_flight'), 1500));
    droneTimers.current.push(setTimeout(() => setDroneStatus('delivered'), 4000));

    droneTimers.current.push(setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('blood_requests')
          .update({ status: 'delivered', drone_delivery: true })
          .eq('id', requestId);
        if (error) throw error;

        const { error: analyticsError } = await supabase.from('analytics_events').insert({
          event_type: 'blood_approved',
          metadata: { delivery_method: 'drone', request_id: requestId },
        });
        if (analyticsError) throw analyticsError;

        toast.show('Drone delivery completed successfully!', 'success');
        loadData();
      } catch {
        toast.show('Failed to update delivery status', 'error');
      }
    }, 5000));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center lg:ml-64">
        <div className="animate-pulse text-gray-400">Loading blood bank dashboard...</div>
      </div>
    );
  }

  const totalUnits = currentBank
    ? Object.values(currentBank.inventory).reduce((sum, v) => sum + v, 0)
    : 0;
  const availableDonors = donors.filter((d) => d.available).length;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8 lg:ml-64">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Blood Bank Dashboard</h1>
            <p className="mt-1 text-gray-500">Real-time inventory, request management, and donor coordination.</p>
          </div>
          <select
            value={selectedBank ?? ''}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="input-field max-w-xs"
          >
            {bloodBanks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Droplet} label="Total Units" value={totalUnits} color="red" />
          <StatCard icon={Package} label="Pending Requests" value={pendingRequests.length} color="amber" />
          <StatCard icon={Truck} label="Approved/Delivered" value={approvedRequests.length} color="blue" />
          <StatCard icon={Heart} label="Available Donors" value={availableDonors} color="green" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Inventory */}
          <div className="space-y-6">
            {currentBank && (
              <div className="card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
                    <Droplet size={24} className="text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{currentBank.name}</h2>
                    <p className="text-sm text-gray-500">{totalUnits} total units</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={16} className="text-gray-400" />
                    {currentBank.address}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={16} className="text-gray-400" />
                    {currentBank.phone}
                  </div>
                </div>

                {/* Inventory grid */}
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Live Inventory</h3>
                    {canEdit && <button onClick={() => setShowInventoryModal(true)} className="btn-primary px-3 py-1.5 text-xs">
                      <Package size={14} /> Update
                    </button>}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {BLOOD_TYPES.map((type) => {
                      const units = currentBank.inventory[type] || 0;
                      const isLow = units < 20;
                      const isCritical = units < 10;
                      return (
                        <div
                          key={type}
                          className={`rounded-lg border-2 p-2.5 text-center transition-all ${
                            isCritical
                              ? 'border-red-300 bg-red-50'
                              : isLow
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <p className="text-sm font-bold text-gray-900">{type}</p>
                          <p className={`text-lg font-bold ${
                            isCritical ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-700'
                          }`}>
                            {units}
                          </p>
                          <p className="text-[10px] text-gray-400">units</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                {canEdit && <div className="mt-5 space-y-2">
                  <button onClick={() => setShowInventoryModal(true)} className="btn-primary w-full">
                    <Package size={18} />
                    Update Inventory
                  </button>
                  <button onClick={handleNotifyDonors} className="btn-success w-full">
                    <Bell size={18} />
                    Notify Donors ({availableDonors})
                  </button>
                </div>}
              </div>
            )}

            {/* Donor list */}
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Registered Donors</h3>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {donors.map((donor) => (
                  <div key={donor.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                        <User size={14} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">{donor.name}</p>
                        <p className="text-xs text-gray-400">{donor.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge bg-red-50 text-red-700">{donor.blood_type}</span>
                      {donor.available ? (
                        <span className={`badge ${donor.notified ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                          {donor.notified ? 'Notified' : 'Available'}
                        </span>
                      ) : (
                        <span className="badge bg-gray-100 text-gray-500">Unavailable</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Blood requests */}
          <div className="space-y-6 lg:col-span-2">
            {/* Pending requests */}
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Blood Requests</h2>
                {pendingRequests.length > 0 && (
                  <span className="badge bg-amber-100 text-amber-700">
                    {pendingRequests.length} Pending
                  </span>
                )}
              </div>

              {requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <CheckCircle2 size={48} className="mb-3 text-green-400" />
                  <p className="text-sm">No blood requests at this time.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className={`animate-slide-up rounded-xl border-2 p-4 ${
                        req.status === 'pending'
                          ? 'border-amber-200 bg-amber-50/30'
                          : req.status === 'approved'
                            ? 'border-blue-200 bg-blue-50/30'
                            : req.status === 'delivered'
                              ? 'border-green-200 bg-green-50/30'
                              : req.status === 'rejected'
                                ? 'border-gray-200 bg-gray-50'
                                : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                            <Droplet size={20} className="text-red-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{req.blood_type}</span>
                              <span className="text-sm text-gray-500">×{req.units_needed} units</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              From: <span className="font-medium">{req.requester_name}</span>
                              <span className="ml-1 text-xs text-gray-400">({req.requester_type})</span>
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(req.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`badge ${
                            req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            req.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                            req.status === 'delivered' ? 'bg-green-100 text-green-700' :
                            req.status === 'rejected' ? 'bg-gray-100 text-gray-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {req.status}
                          </span>
                          {req.drone_delivery && (
                            <p className="mt-1 flex items-center justify-end gap-1 text-xs text-blue-600">
                              <Truck size={12} /> Drone
                            </p>
                          )}
                        </div>
                      </div>

                      {canEdit && req.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleApproveRequest(req)}
                            className="btn-success flex-1 py-2 text-xs"
                          >
                            <CheckCircle2 size={14} /> Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req)}
                            className="btn-secondary flex-1 py-2 text-xs"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}

                      {canEdit && req.status === 'approved' && (
                        <div className="mt-3">
                          <button
                            onClick={() => handleDroneDelivery(req.id)}
                            className="btn-primary w-full py-2 text-xs"
                          >
                            <Truck size={14} /> Dispatch via Drone
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inventory update modal */}
      {showInventoryModal && currentBank && (
        <InventoryModal
          inventory={currentBank.inventory}
          onSave={handleUpdateInventory}
          onClose={() => setShowInventoryModal(false)}
        />
      )}

      {/* Drone delivery modal */}
      {showDroneModal && (
        <DroneDeliveryModal status={droneStatus} onClose={() => setShowDroneModal(null)} />
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
  color: 'red' | 'amber' | 'blue' | 'green';
}) {
  const colors = {
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
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

function InventoryModal({
  inventory,
  onSave,
  onClose,
}: {
  inventory: Record<string, number>;
  onSave: (inventory: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, number>>({ ...inventory });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slide-up card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <Package size={20} className="text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Update Blood Inventory</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BLOOD_TYPES.map((type) => (
            <div key={type}>
              <label className="mb-1 block text-sm font-bold text-gray-700">{type}</label>
              <input
                type="number"
                min={0}
                value={values[type] || 0}
                onChange={(e) => setValues({ ...values, [type]: parseInt(e.target.value) || 0 })}
                className="input-field"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(values)} className="btn-primary flex-1">
            <Send size={16} /> Save Inventory
          </button>
        </div>
      </div>
    </div>
  );
}

function DroneDeliveryModal({ status, onClose }: { status: string; onClose: () => void }) {
  const steps = [
    { key: 'launching', label: 'Drone Launching', icon: Truck },
    { key: 'in_flight', label: 'In Flight', icon: Send },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  ];

  const currentIdx = steps.findIndex((s) => s.key === status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={status === 'delivered' ? onClose : undefined}>
      <div className="animate-slide-up card w-full max-w-md p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
            {status === 'delivered' ? (
              <CheckCircle2 size={40} className="text-green-600" />
            ) : (
              <Truck size={40} className={`text-blue-600 ${status === 'in_flight' ? 'animate-bounce' : ''}`} />
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {status === 'delivered' ? 'Delivery Complete!' : 'Drone Delivery Simulation'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {status === 'launching' && 'Preparing drone for launch...'}
            {status === 'in_flight' && 'Drone is en route to destination...'}
            {status === 'delivered' && 'Blood units have been delivered successfully.'}
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isDone = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                    isDone ? 'bg-green-500 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <Icon size={16} />
                </div>
                <span className={`text-sm font-medium ${isDone || isCurrent ? 'text-gray-800' : 'text-gray-400'}`}>
                  {step.label}
                </span>
                {isCurrent && <span className="ml-auto text-xs text-blue-500 animate-pulse">In progress...</span>}
                {isDone && <CheckCircle2 size={14} className="ml-auto text-green-500" />}
              </div>
            );
          })}
        </div>

        {status === 'delivered' && (
          <button onClick={onClose} className="btn-success mt-6 w-full">
            <CheckCircle2 size={18} /> Done
          </button>
        )}
      </div>
    </div>
  );
}
