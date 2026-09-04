import { FormEvent, useState } from 'react';
import {
  Activity,
  Ambulance,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Droplet,
  Eye,
  EyeOff,
  HeartPulse,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import type { View } from '@/components/Sidebar';

type LoginRole = 'ambulance' | 'hospital' | 'bloodbank';
type Field = { name: string; label: string; type?: string; placeholder: string; required?: boolean };

const ROLE_CONFIG: Record<LoginRole, { title: string; subtitle: string; icon: typeof Ambulance; accent: string; fields: Field[]; purpose: string }> = {
  ambulance: {
    title: 'Ambulance Dashboard Login',
    subtitle: 'Identify your crew and vehicle for live emergency coordination.',
    icon: Ambulance,
    accent: 'green',
    purpose: 'GPS tracking and real-time patient updates',
    fields: [
      { name: 'ambulanceId', label: 'Ambulance ID / Vehicle Number', placeholder: 'e.g. DL 01 AB 1234' },
      { name: 'driverName', label: 'Driver Name', placeholder: 'Full name' },
      { name: 'driverContact', label: 'Driver Contact Number', placeholder: '+91 98765 43210', type: 'tel' },
      { name: 'region', label: 'Assigned Region / Zone', placeholder: 'e.g. South Delhi' },
      { name: 'licenseId', label: 'Emergency Service License / Badge ID', placeholder: 'License or badge number' },
      { name: 'password', label: 'Password', placeholder: 'Enter password', type: 'password' },
    ],
  },
  hospital: {
    title: 'Hospital Dashboard Login',
    subtitle: 'Verify your hospital authority and keep capacity updates current.',
    icon: HeartPulse,
    accent: 'blue',
    purpose: 'Bed availability, triage, and ventilator updates',
    fields: [
      { name: 'registrationId', label: 'Hospital Registration ID', placeholder: 'Hospital registration number' },
      { name: 'organizationName', label: 'Hospital Name', placeholder: 'Full hospital name' },
      { name: 'adminName', label: 'Coordinator / Admin Name', placeholder: 'Full name' },
      { name: 'department', label: 'Department', placeholder: 'Select department' },
      { name: 'contact', label: 'Contact Number', placeholder: '+91 98765 43210', type: 'tel' },
      { name: 'email', label: 'Email Address', placeholder: 'admin@hospital.com', type: 'email' },
      { name: 'password', label: 'Password', placeholder: 'Enter password', type: 'password' },
    ],
  },
  bloodbank: {
    title: 'Blood Bank Dashboard Login',
    subtitle: 'Securely manage inventory, donors, and hospital requests.',
    icon: Droplet,
    accent: 'rose',
    purpose: 'Blood inventory and donor alert management',
    fields: [
      { name: 'registrationId', label: 'Blood Bank Registration ID', placeholder: 'Blood bank registration number' },
      { name: 'organizationName', label: 'Blood Bank Name', placeholder: 'Full blood bank name' },
      { name: 'adminName', label: 'Admin / Manager Name', placeholder: 'Full name' },
      { name: 'contact', label: 'Contact Number', placeholder: '+91 98765 43210', type: 'tel' },
      { name: 'email', label: 'Email Address', placeholder: 'admin@bloodbank.com', type: 'email' },
      { name: 'licenseId', label: 'License Number (Govt. approved)', placeholder: 'Government license number' },
      { name: 'password', label: 'Password', placeholder: 'Enter password', type: 'password' },
    ],
  },
};

const ROLE_OPTIONS: { id: LoginRole; label: string; icon: typeof Ambulance }[] = [
  { id: 'ambulance', label: 'Ambulance', icon: Ambulance },
  { id: 'hospital', label: 'Hospital', icon: HeartPulse },
  { id: 'bloodbank', label: 'Blood Bank', icon: Droplet },
];

const ACCENT_CLASSES: Record<LoginRole, { text: string; background: string }> = {
  ambulance: { text: 'text-green-600', background: 'bg-green-50' },
  hospital: { text: 'text-blue-600', background: 'bg-blue-50' },
  bloodbank: { text: 'text-rose-600', background: 'bg-rose-50' },
};

interface LoginPageProps { onNavigate: (view: View) => void }

export function LoginPage({ onNavigate }: LoginPageProps) {
  const [role, setRole] = useState<LoginRole>(() => {
    const savedRole = localStorage.getItem('sanjeevani_login_role');
    return savedRole === 'hospital' || savedRole === 'bloodbank' ? savedRole : 'ambulance';
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;

  const selectRole = (nextRole: LoginRole) => {
    setRole(nextRole);
    setForm({});
    setError('');
    setShowPassword(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const missing = config.fields.find((field) => !form[field.name]?.trim());
    if (missing) {
      setError(`Please enter ${missing.label.toLowerCase()}.`);
      return;
    }
    const displayName = form.organizationName || form.driverName || form.ambulanceId;
    const safeProfile = Object.fromEntries(Object.entries(form).filter(([name]) => name !== 'password'));
    localStorage.setItem('sanjeevani_profile', JSON.stringify({ role, displayName, ...safeProfile, savedAt: new Date().toISOString() }));
    onNavigate(role);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e8f2ff,_transparent_42%),linear-gradient(135deg,#f8fafc_0%,#fff_55%,#fff1f2_100%)] px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => onNavigate('landing')} className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900">
          <ArrowLeft size={18} /> Back to Sanjeevani
        </button>
        <div className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl lg:grid-cols-[0.82fr_1.18fr]">
          <section className="relative overflow-hidden bg-gray-950 px-7 py-9 text-white sm:px-10 lg:px-12 lg:py-12">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[32px] border-white/5" />
            <div className="relative">
              <div className="mb-12 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600"><Activity size={22} /></div><span className="text-lg font-bold">Sanjeevani</span></div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">Partner access</p>
              <h1 className="max-w-sm text-3xl font-extrabold leading-tight sm:text-4xl">One network.<br />Every critical minute.</h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-gray-300">Your role-based workspace keeps emergency teams connected, informed, and ready to act.</p>
              <div className="mt-10 space-y-4 text-sm text-gray-200">
                <p className="flex items-center gap-3"><ShieldCheck size={18} className="text-green-400" /> Verified partner access</p>
                <p className="flex items-center gap-3"><MapPin size={18} className="text-blue-300" /> Live coordination across zones</p>
                <p className="flex items-center gap-3"><LockKeyhole size={18} className="text-amber-300" /> Your demo profile stays local</p>
              </div>
            </div>
          </section>
          <section className="px-5 py-8 sm:px-10 lg:px-12 lg:py-10">
            <div className="mb-7"><p className="text-sm font-semibold text-blue-600">Dashboard access</p><h2 className="mt-1 text-2xl font-bold text-gray-900">Choose your role</h2><p className="mt-2 text-sm text-gray-500">Enter your details to continue to your workspace.</p></div>
            <div className="mb-8 grid grid-cols-3 gap-2 rounded-xl bg-gray-100 p-1.5">
              {ROLE_OPTIONS.map((option) => { const OptionIcon = option.icon; return <button key={option.id} type="button" onClick={() => selectRole(option.id)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-all ${role === option.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><OptionIcon size={19} className={role === option.id ? ACCENT_CLASSES[option.id].text : ''} />{option.label}</button>; })}
            </div>
            <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-5"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${ACCENT_CLASSES[role].background}`}><Icon size={22} className={ACCENT_CLASSES[role].text} /></div><div><h3 className="font-bold text-gray-900">{config.title}</h3><p className="text-xs text-gray-500">{config.subtitle}</p></div></div>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              {config.fields.map((field) => <label key={field.name} className={field.name === 'password' || field.name === 'department' ? '' : field.name === 'organizationName' || field.name === 'ambulanceId' ? '' : ''}><span className="mb-1.5 block text-xs font-semibold text-gray-700">{field.label}</span><div className="relative"><input required value={form[field.name] ?? ''} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} type={field.name === 'password' && showPassword ? 'text' : field.type ?? 'text'} placeholder={field.placeholder} className="input-field pr-10" />{field.name === 'password' && <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}</div></label>)}
              <div className="sm:col-span-2"><p className="mb-4 flex items-center gap-2 text-xs text-gray-500"><CheckCircle2 size={15} className="text-green-600" /> Demo profile is saved locally for this browser. {config.purpose}.</p>{error && <p className="mb-4 text-sm font-medium text-red-600">{error}</p>}<button type="submit" className="btn-primary w-full justify-center py-3">Continue to dashboard <ArrowRight size={18} /></button></div>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}