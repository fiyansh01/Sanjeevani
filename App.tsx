import { useState } from 'react';
import { Sidebar, type View } from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import { LandingPage } from '@/pages/LandingPage';
import { HospitalDashboard } from '@/pages/HospitalDashboard';
import { AmbulanceDashboard } from '@/pages/AmbulanceDashboard';
import { BloodBankDashboard } from '@/pages/BloodBankDashboard';
import { AnalyticsDashboard } from '@/pages/AnalyticsDashboard';
import { LoginPage } from '@/pages/LoginPage';

function App() {
  const [view, setView] = useState<View>('login');

  const renderView = () => {
    switch (view) {
      case 'landing':
        return <LandingPage onNavigate={setView} />;
      case 'login':
        return <LoginPage onNavigate={setView} />;
      case 'hospital':
        return <HospitalDashboard />;
      case 'ambulance':
        return <AmbulanceDashboard />;
      case 'bloodbank':
        return <BloodBankDashboard />;
      case 'analytics':
        return <AnalyticsDashboard />;
      default:
        return <LandingPage onNavigate={setView} />;
    }
  };

  return (
    <ToastProvider>
      {view !== 'landing' && view !== 'login' && <Sidebar current={view} onNavigate={setView} />}
      <div className="animate-fade-in">{renderView()}</div>
    </ToastProvider>
  );
}

export default App;
