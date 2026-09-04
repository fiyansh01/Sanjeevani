import type { View } from '@/components/Sidebar';

export type DashboardRole = 'ambulance' | 'hospital' | 'bloodbank';

export function getLoggedInRole(): DashboardRole | null {
  try {
    const profile = JSON.parse(localStorage.getItem('sanjeevani_profile') ?? 'null') as { role?: DashboardRole } | null;
    return profile?.role === 'ambulance' || profile?.role === 'hospital' || profile?.role === 'bloodbank'
      ? profile.role
      : null;
  } catch {
    return null;
  }
}

export function canManageDashboard(view: View): boolean {
  return getLoggedInRole() === view;
}