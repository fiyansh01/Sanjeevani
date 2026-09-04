import { useEffect, useState } from 'react';
import {
  Activity,
  Ambulance as AmbulanceIcon,
  Droplet,
  BarChart3,
  Menu,
  X,
  HeartPulse,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type View =
  | 'landing'
  | 'login'
  | 'hospital'
  | 'ambulance'
  | 'bloodbank'
  | 'analytics';

interface NavItem {
  id: View;
  label: string;
  icon: typeof Activity;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'hospital', label: 'Hospital', icon: HeartPulse },
  { id: 'ambulance', label: 'Ambulance', icon: AmbulanceIcon },
  { id: 'bloodbank', label: 'Blood Bank', icon: Droplet },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

interface SidebarProps {
  current: View;
  onNavigate: (view: View) => void;
}

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeEmergencies, setActiveEmergencies] = useState(0);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    const storedProfile = localStorage.getItem('sanjeevani_profile');
    if (storedProfile) {
      try {
        const profile = JSON.parse(storedProfile) as { displayName?: string };
        setProfileName(profile.displayName ?? '');
      } catch {
        localStorage.removeItem('sanjeevani_profile');
      }
    }
  }, []);

  useEffect(() => {
    const updateCount = async () => {
      try {
        const { count } = await supabase
          .from('emergencies')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'dispatched', 'en_route', 'at_scene', 'transporting']);
        setActiveEmergencies(count ?? 0);
      } catch {
        // ignore
      }
    };
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleNav = (view: View) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('sanjeevani_profile');
    localStorage.removeItem('sanjeevani_login_role');
    handleNav('login');
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-gray-200 bg-white p-2 shadow-sm lg:hidden"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <button
          onClick={() => handleNav('landing')}
          className="flex items-center gap-3 border-b border-gray-200 px-6 py-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-md">
            <Activity size={22} className="text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-bold text-gray-900">Sanjeevani</h1>
            <p className="text-xs text-gray-500">Emergency Response</p>
          </div>
        </button>

        {/* Active emergencies badge */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
            <span className="text-xs font-semibold text-red-700">Active Emergencies</span>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
              {activeEmergencies}
            </span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          {profileName && <p className="mb-2 truncate text-xs font-semibold text-gray-700">{profileName}</p>}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            System Online
          </div>
          <p className="mt-1 text-xs text-gray-400">Saving lives, faster.</p>
          <button onClick={handleLogout} className="mt-3 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900">
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
