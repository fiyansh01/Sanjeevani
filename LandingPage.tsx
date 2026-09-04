import {
  Activity,
  HeartPulse,
  Ambulance as AmbulanceIcon,
  Droplet,
  BarChart3,
  ArrowRight,
  Shield,
  Zap,
  MapPin,
  Clock,
  Users,
} from 'lucide-react';
import type { View } from '@/components/Sidebar';

interface LandingProps {
  onNavigate: (view: View) => void;
}

const ROLE_CARDS: {
  view: View;
  title: string;
  desc: string;
  icon: typeof Activity;
  color: string;
  bgColor: string;
  iconColor: string;
}[] = [
  {
    view: 'hospital',
    title: 'Hospital Dashboard',
    desc: 'Live bed & ventilator availability. Accept patients, manage resources, auto-suggest best hospital.',
    icon: HeartPulse,
    color: 'border-blue-200 hover:border-blue-400',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    view: 'ambulance',
    title: 'Ambulance Dashboard',
    desc: 'GPS tracking, update patient condition, request blood, route to hospital in real-time.',
    icon: AmbulanceIcon,
    color: 'border-green-200 hover:border-green-400',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
  },
  {
    view: 'bloodbank',
    title: 'Blood Bank Dashboard',
    desc: 'Real-time inventory, approve requests, notify donors, drone delivery simulation.',
    icon: Droplet,
    color: 'border-rose-200 hover:border-rose-400',
    bgColor: 'bg-rose-50',
    iconColor: 'text-rose-600',
  },
  {
    view: 'analytics',
    title: 'Analytics & Monitoring',
    desc: 'Response time, lives saved, resource utilization across the entire network.',
    icon: BarChart3,
    color: 'border-purple-200 hover:border-purple-400',
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
];

const FEATURES = [
  { icon: Zap, title: 'Instant Dispatch', desc: 'Alerts reach hospitals, ambulances, and emergency services within seconds.' },
  { icon: MapPin, title: 'GPS Tracking', desc: 'Real-time ambulance location with live ETA updates for all stakeholders.' },
  { icon: Shield, title: 'Auto-Suggest Hospital', desc: 'Intelligent routing based on bed availability and patient condition.' },
  { icon: Users, title: 'Unified Network', desc: 'Hospitals, ambulances, blood banks, and command analytics on one platform.' },
];

export function LandingPage({ onNavigate }: LandingProps) {
  const openDashboard = (view: View) => {
    if (view === 'hospital' || view === 'ambulance' || view === 'bloodbank') {
      localStorage.setItem('sanjeevani_login_role', view);
      onNavigate('login');
      return;
    }
    onNavigate(view);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-red-50/30" />
        <div className="relative mx-auto max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Real-time Emergency Response Network
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            Saving Lives,
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-red-500 bg-clip-text text-transparent">
              Faster Than Ever
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Sanjeevani connects hospitals, ambulances, blood banks, and analytics teams into one
            unified emergency response platform — reducing response time and saving lives through
            real-time coordination.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => openDashboard('hospital')}
              className="group inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.98]"
            >
              <Activity size={20} />
              Open Dashboards
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => openDashboard('hospital')}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
            >
              <Activity size={20} />
              View Dashboards
            </button>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-gray-200 bg-white px-6 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: 'Avg Response Time', value: '< 7 min', icon: Clock },
            { label: 'Hospitals Connected', value: '5+', icon: HeartPulse },
            { label: 'Ambulances Active', value: '6+', icon: AmbulanceIcon },
            { label: 'Blood Units Ready', value: '1,000+', icon: Droplet },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center">
                <Icon size={24} className="mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Role cards */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold text-gray-900">Choose Your Dashboard</h2>
          <p className="mt-2 text-center text-gray-500">
            Each role has a dedicated real-time dashboard with full functionality.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ROLE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.view}
                  onClick={() => {
                    openDashboard(card.view);
                  }}
                  className={`group animate-fade-in card border-2 p-6 text-left transition-all hover:shadow-lg ${card.color}`}
                >
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${card.bgColor}`}>
                    <Icon size={24} className={card.iconColor} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{card.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{card.desc}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Open Dashboard <ArrowRight size={16} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-gray-900">How Sanjeevani Works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Icon size={26} className="text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-gray-500">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 px-8 py-12 text-center shadow-xl">
          <h2 className="text-3xl font-bold text-white">Ready to Save Lives?</h2>
          <p className="mt-3 text-blue-100">
            Explore the full emergency response platform with live data and real-time updates.
          </p>
          <button
            onClick={() => openDashboard('hospital')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 shadow-lg transition-all hover:bg-blue-50 active:scale-[0.98]"
          >
            <Activity size={20} />
            Start Emergency Response
          </button>
        </div>
      </section>
    </div>
  );
}
