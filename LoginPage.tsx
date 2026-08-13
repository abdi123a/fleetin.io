import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore, DEMO_PRESETS, type DemoPresetUser } from '@/stores';
import { Logo, ThemeToggle } from '@/components';
import { Button, Input } from '@/design-system';
import { AlertCircle, UserCheck, Mail, Lock, Building2, ShieldCheck, Truck } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { errorMessage } from '@/utils';

const QUICK_DEMO_ROLES = ['TRANSPORTER', 'SHIPPER', 'ADMIN'] as const;

const QUICK_DEMO_PRESETS: DemoPresetUser[] = QUICK_DEMO_ROLES.map((role) =>
  DEMO_PRESETS.find((p) => p.role === role),
).filter((preset): preset is DemoPresetUser => preset !== undefined);

function demoIcon(role: string) {
  if (role === 'TRANSPORTER') return Truck;
  if (role === 'SHIPPER') return Building2;
  return ShieldCheck;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loginAsDemoPreset, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid work email.');
      return;
    }
    if (!password || password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    try {
      await login(email, password);
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.role === 'SHIPPER' || currentUser?.role === 'CLIENT') {
        navigate(ROUTES.shipperDashboard, { replace: true });
      } else if (currentUser?.role === 'TRANSPORTER') {
        navigate(ROUTES.transporterDashboard, { replace: true });
      } else {
        navigate(ROUTES.dashboard, { replace: true });
      }
    } catch (err) {
      setLocalError(errorMessage(err, 'Authentication failed. Please verify credentials.'));
    }
  };

  const handleDemoSelect = (preset: DemoPresetUser) => {
    setEmail(preset.email);
    setPassword('Shipper@2026!');
    loginAsDemoPreset(preset);
    if (preset.role === 'SHIPPER' || preset.role === 'CLIENT') {
      navigate(ROUTES.shipperDashboard, { replace: true });
    } else if (preset.role === 'TRANSPORTER') {
      navigate(ROUTES.transporterDashboard, { replace: true });
    } else {
      navigate(ROUTES.dashboard, { replace: true });
    }
  };

  const displayedError = localError || error;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
      {/* ── LEFT HERO PANEL ── */}
      <div className="lg:col-span-5 p-3 flex flex-col h-full">
        <div className="relative rounded-[1.8rem] overflow-hidden h-full min-h-[440px] lg:min-h-[540px] flex flex-col justify-end p-7 text-white bg-primary-active">
          <div className="absolute inset-0 z-0">
            <img
              src="/images/truck-hero.jpg"
              alt="FLEETIN Fleet"
              className="w-full h-full object-cover object-center opacity-45 mix-blend-overlay scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          </div>

          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-white">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              <span>Fleetin Logistics Platform</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
              Connected Fleet, <br />
              <span className="text-accent font-extrabold">Smarter Operations</span>
            </h2>
          </div>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between my-auto">
        <div className="w-full mx-auto space-y-5">
          <div className="relative flex items-center justify-center gap-4 pb-1">
            <Logo size="2xl" />
            <div className="absolute right-0">
              <ThemeToggle variant="compact" className="shrink-0 rounded-full border-border" />
            </div>
          </div>

          {displayedError && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-destructive-subtle border border-destructive/20 text-destructive-subtle-foreground text-xs font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
              <span>{displayedError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground block">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                type="email"
                required
                inputSize="md"
                leadingIcon={<Mail className="w-4 h-4" />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground block">
                Password <span className="text-destructive">*</span>
              </label>
              <Input
                type="password"
                required
                isPassword
                inputSize="md"
                leadingIcon={<Lock className="w-4 h-4" />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password"
                className="rounded-xl"
              />
              <div className="flex justify-end pt-0.5">
                <Link
                  to={ROUTES.forgotPassword}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
              className="rounded-xl font-semibold py-3 text-sm transition-all active:scale-[0.99]"
            >
              Sign In
            </Button>
          </form>

          <div className="relative flex items-center justify-center my-3">
            <div className="border-t border-border w-full" />
            <span className="bg-surface px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider absolute">
              OR QUICK DEMO LOGIN
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground font-semibold pb-0.5">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              <span>Try a demo account:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {QUICK_DEMO_PRESETS.map((preset) => {
                const Icon = demoIcon(preset.role);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleDemoSelect(preset)}
                    className="flex flex-col items-start gap-1.5 p-2.5 rounded-xl border border-border bg-surface hover:bg-primary-subtle text-foreground text-xs hover:border-primary transition-all text-left"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="font-bold text-foreground text-xs truncate w-full">
                      {preset.role === 'ADMIN'
                        ? 'Admin'
                        : preset.role === 'SHIPPER'
                          ? 'Shipper'
                          : 'Transporter'}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate w-full">
                      {preset.companyName || preset.email}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-2">
            Need a Shipper account for your company?{' '}
            <Link to={ROUTES.register} className="text-primary font-semibold hover:underline">
              Contact Fleetin Sales
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
