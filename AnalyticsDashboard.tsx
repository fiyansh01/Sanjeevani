import { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  Heart,
  Activity,
  TrendingUp,
  TrendingDown,
  Ambulance as AmbulanceIcon,
  Droplet,
  Building2,
  CheckCircle2,
  AlertCircle,
  Users,
  Zap,
} from 'lucide-react';
import {
  supabase,
  type AnalyticsEvent,
  type Emergency,
  type Hospital,
  type Ambulance,
  type BloodBank,
  type TrafficSegment,
} from '@/lib/supabase';

export function AnalyticsDashboard() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [bloodBanks, setBloodBanks] = useState<BloodBank[]>([]);
  const [traffic, setTraffic] = useState<TrafficSegment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [eventsRes, emergRes, hospRes, ambRes, bloodRes, trafficRes] = await Promise.all([
      supabase.from('analytics_events').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('emergencies').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('hospitals').select('*'),
      supabase.from('ambulances').select('*'),
      supabase.from('blood_banks').select('*'),
      supabase.from('traffic_segments').select('*'),
    ]);

    setEvents(eventsRes.data as AnalyticsEvent[] || []);
    setEmergencies(emergRes.data as Emergency[] || []);
    setHospitals(hospRes.data as Hospital[] || []);
    setAmbulances(ambRes.data as Ambulance[] || []);
    setBloodBanks(bloodRes.data as BloodBank[] || []);
    setTraffic(trafficRes.data as TrafficSegment[] || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analytics_events' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergencies' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitals' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambulances' }, () => loadData())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center lg:ml-64">
        <div className="animate-pulse text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  // Calculate metrics
  const livesSaved = events.filter((e) => e.event_type === 'patient_accepted').length;
  const evacuations = events.filter((e) => e.event_type === 'evacuation_confirmed').length;

  const responseTimes = events
    .filter((e) => e.response_time_seconds != null)
    .map((e) => e.response_time_seconds!);
  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;

  const totalBeds = hospitals.reduce((s, h) => s + h.beds_total, 0);
  const availableBeds = hospitals.reduce((s, h) => s + h.beds_available, 0);
  const bedUtilization = totalBeds > 0 ? Math.round(((totalBeds - availableBeds) / totalBeds) * 100) : 0;

  const totalVentilators = hospitals.reduce((s, h) => s + h.ventilators_total, 0);
  const availableVentilators = hospitals.reduce((s, h) => s + h.ventilators_available, 0);

  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length;
  const activeAmbulances = ambulances.filter((a) => a.status !== 'available' && a.status !== 'offline').length;

  const totalBloodUnits = bloodBanks.reduce((s, b) =>
    s + Object.values(b.inventory).reduce((sum, v) => sum + v, 0), 0);

  // Emergency type breakdown
  const typeBreakdown: Record<string, number> = {};
  emergencies.forEach((e) => {
    typeBreakdown[e.type] = (typeBreakdown[e.type] || 0) + 1;
  });
  const typeEntries = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]);

  // Traffic analysis
  const clearRoutes = traffic.filter((t) => t.is_emergency_route && (t.congestion_level === 'clear' || t.congestion_level === 'light'));
  const heavyRoutes = traffic.filter((t) => t.congestion_level === 'heavy' || t.congestion_level === 'blocked');

  // Recent events timeline
  const recentEvents = events.slice(0, 15);

  const now = Date.now();
  const currentPeriodStart = now - 7 * 24 * 60 * 60 * 1000;
  const previousPeriodStart = now - 14 * 24 * 60 * 60 * 1000;
  const currentPeriodEvents = events.filter((event) => new Date(event.created_at).getTime() >= currentPeriodStart);
  const previousPeriodEvents = events.filter((event) => {
    const createdAt = new Date(event.created_at).getTime();
    return createdAt >= previousPeriodStart && createdAt < currentPeriodStart;
  });
  const periodCount = (periodEvents: AnalyticsEvent[], eventType: string) =>
    periodEvents.filter((event) => event.event_type === eventType).length;
  const periodAverage = (periodEvents: AnalyticsEvent[]) => {
    const times = periodEvents
      .filter((event) => event.response_time_seconds != null)
      .map((event) => event.response_time_seconds!);
    return times.length > 0 ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length) : null;
  };
  const currentResponseTime = periodAverage(currentPeriodEvents);
  const previousResponseTime = periodAverage(previousPeriodEvents);
  const responseTrend: 'up' | 'down' = currentResponseTime != null && previousResponseTime != null && currentResponseTime > previousResponseTime ? 'up' : 'down';
  const livesSavedTrend: 'up' | 'down' = periodCount(currentPeriodEvents, 'patient_accepted') >= periodCount(previousPeriodEvents, 'patient_accepted') ? 'up' : 'down';
  const utilizationTrend: 'up' | 'down' = bedUtilization >= 70 ? 'up' : 'down';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8 lg:ml-64">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Analytics & Monitoring</h1>
          <p className="mt-1 text-gray-500">Real-time metrics across the entire emergency response network.</p>
        </div>

        {/* Key metrics */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={Clock}
            label="Avg Response Time"
            value={formatTime(currentResponseTime ?? avgResponseTime)}
            trend={responseTrend}
            color="blue"
          />
          <MetricCard
            icon={Heart}
            label="Lives Saved"
            value={livesSaved}
            trend={livesSavedTrend}
            color="red"
          />
          <MetricCard
            icon={TrendingUp}
            label="Bed Utilization"
            value={`${bedUtilization}%`}
            trend={utilizationTrend}
            color="green"
          />
        </div>

        {/* Secondary metrics */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat icon={AmbulanceIcon} label="Ambulances Available" value={`${availableAmbulances}/${ambulances.length}`} color="green" />
          <MiniStat icon={Activity} label="Active Ambulances" value={activeAmbulances} color="blue" />
          <MiniStat icon={Droplet} label="Total Blood Units" value={totalBloodUnits} color="red" />
          <MiniStat icon={Users} label="Evacuations Done" value={evacuations} color="amber" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Emergency type breakdown */}
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Emergency Types</h2>
            {typeEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No emergencies recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {typeEntries.map(([type, count]) => {
                  const maxCount = typeEntries[0][1];
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={type}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium capitalize text-gray-700">{type.replace('_', ' ')}</span>
                        <span className="font-bold text-gray-900">{count}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resource utilization */}
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Resource Utilization</h2>
            <div className="space-y-4">
              <ResourceBar
                icon={Building2}
                label="Hospital Beds"
                available={availableBeds}
                total={totalBeds}
                color="blue"
              />
              <ResourceBar
                icon={Activity}
                label="Ventilators"
                available={availableVentilators}
                total={totalVentilators}
                color="green"
              />
              <ResourceBar
                icon={AmbulanceIcon}
                label="Ambulances"
                available={availableAmbulances}
                total={ambulances.length}
                color="amber"
              />
              <ResourceBar
                icon={Droplet}
                label="Blood Units"
                available={totalBloodUnits}
                total={1500}
                color="red"
              />
            </div>
          </div>

          {/* Traffic analysis */}
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Traffic Management</h2>
            <div className="mb-4 flex gap-3">
              <div className="flex-1 rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{clearRoutes.length}</p>
                <p className="text-xs text-gray-500">Clear Routes</p>
              </div>
              <div className="flex-1 rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{traffic.filter((t) => t.congestion_level === 'moderate').length}</p>
                <p className="text-xs text-gray-500">Moderate</p>
              </div>
              <div className="flex-1 rounded-lg bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{heavyRoutes.length}</p>
                <p className="text-xs text-gray-500">Heavy/Blocked</p>
              </div>
            </div>
            <div className="space-y-2">
              {traffic.slice(0, 5).map((seg) => (
                <div key={seg.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className={seg.is_emergency_route ? 'text-blue-500' : 'text-gray-300'} />
                    <span className="text-sm font-medium text-gray-700">{seg.road_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{seg.avg_speed_kmph} km/h</span>
                    <span className={`badge ${
                      seg.congestion_level === 'clear' ? 'bg-green-50 text-green-700' :
                      seg.congestion_level === 'light' ? 'bg-green-50 text-green-600' :
                      seg.congestion_level === 'moderate' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {seg.congestion_level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent events timeline */}
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Recent Activity</h2>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {recentEvents.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No activity recorded yet.</p>
              ) : (
                recentEvents.map((event) => {
                  const Icon = getEventIcon(event.event_type);
                  const color = getEventColor(event.event_type);
                  return (
                    <div key={event.id} className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium capitalize text-gray-700">
                          {event.event_type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(event.created_at).toLocaleString()}
                        </p>
                      </div>
                      {event.response_time_seconds != null && (
                        <span className="badge bg-blue-50 text-blue-700">
                          {formatTime(event.response_time_seconds)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Hospital resource table */}
        <div className="mt-6 card p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Hospital Resource Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-semibold text-gray-700">Hospital</th>
                  <th className="pb-2 font-semibold text-gray-700">Beds Available</th>
                  <th className="pb-2 font-semibold text-gray-700">Ventilators Available</th>
                  <th className="pb-2 font-semibold text-gray-700">Bed Utilization</th>
                </tr>
              </thead>
              <tbody>
                {hospitals.map((h) => {
                  const util = h.beds_total > 0 ? Math.round(((h.beds_total - h.beds_available) / h.beds_total) * 100) : 0;
                  return (
                    <tr key={h.id} className="border-b border-gray-50">
                      <td className="py-3 font-medium text-gray-800">{h.name}</td>
                      <td className="py-3">
                        <span className="font-bold text-blue-600">{h.beds_available}</span>
                        <span className="text-gray-400"> / {h.beds_total}</span>
                      </td>
                      <td className="py-3">
                        <span className="font-bold text-green-600">{h.ventilators_available}</span>
                        <span className="text-gray-400"> / {h.ventilators_total}</span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${util > 70 ? 'bg-red-500' : util > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${util}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600">{util}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: number | string;
  trend: 'up' | 'down';
  color: 'blue' | 'red' | 'amber' | 'green';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
  };
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors[color]}`}>
          <Icon size={24} />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-500'}`}>
          <TrendIcon size={14} />
          {trend === 'up' ? 'Increasing' : 'Decreasing'}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string;
  color: 'green' | 'blue' | 'red' | 'amber';
}) {
  const colors = {
    green: 'text-green-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <Icon size={20} className={colors[color]} />
      <div>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function ResourceBar({
  icon: Icon,
  label,
  available,
  total,
  color,
}: {
  icon: typeof Building2;
  label: string;
  available: number;
  total: number;
  color: 'blue' | 'green' | 'amber' | 'red';
}) {
  const pct = total > 0 ? (available / total) * 100 : 0;
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className="text-sm font-bold text-gray-900">
          {available}<span className="text-gray-400"> / {total}</span>
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${colors[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function getEventIcon(type: string): typeof Activity {
  switch (type) {
    case 'ambulance_dispatched': return AmbulanceIcon;
    case 'patient_accepted': return CheckCircle2;
    case 'blood_requested': return Droplet;
    case 'blood_approved': return Droplet;
    case 'life_saved': return Heart;
    case 'evacuation_confirmed': return Users;
    case 'hospital_updated': return Building2;
    case 'traffic_updated': return Activity;
    default: return AlertCircle;
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case 'ambulance_dispatched': return 'bg-green-100 text-green-600';
    case 'patient_accepted': return 'bg-blue-100 text-blue-600';
    case 'blood_requested': return 'bg-rose-100 text-rose-600';
    case 'blood_approved': return 'bg-rose-100 text-rose-600';
    case 'life_saved': return 'bg-red-100 text-red-600';
    case 'evacuation_confirmed': return 'bg-amber-100 text-amber-600';
    case 'hospital_updated': return 'bg-blue-100 text-blue-600';
    case 'traffic_updated': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}
