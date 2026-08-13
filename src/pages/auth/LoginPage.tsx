import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ENV } from '@/config/app';
import { ROUTES } from '@/config/routes';
import { Button, Input } from '@/design-system';
import {
  AlertCircle,
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  Truck,
  UserCheck,
} from '@/design-system/icons';
import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_PRESETS,
  useAuthStore,
  type DemoPresetUser,
} from '@/stores';
import { errorMessage } from '@/utils';

import { AuthScreen } from './components';

/** A missing preset is a broken fixture, not a runtime possibility — fail loudly rather than proceed with `undefined`. */
function requirePreset(role: DemoPresetUser['role']): DemoPresetUser {
  const found = DEMO_PRESETS.find((p) => p.role === role);
  if (!found) throw new Error(`Expected demo preset with role "${role}" not found in DEMO_PRESETS`);
  return found;
}

const QUICK_DEMO_PRESETS: DemoPresetUser[] = [
  requirePreset('TRANSPORTER'),
  requirePreset('SHIPPER'),
  requirePreset('ADMIN'),
];

function demoIcon(role: string) {
  if (role === 'TRANSPORTER') return Truck;
  if (role === 'SHIPPER') return Building2;
  return ShieldCheck;
}

function navigateForRole(role: string | undefined, navigate: ReturnType<typeof useNavigate>) {
  if (role === 'SHIPPER' || role === 'CLIENT') {
    navigate(ROUTES.shipperDashboard, { replace: true });
  } else if (role === 'TRANSPORTER') {
    navigate(ROUTES.transporterDashboard, { replace: true });
  } else {
    navigate(ROUTES.dashboard, { replace: true });
  }
}

/**
 * A wrong password fails almost instantly here — there's no real backend to
 * round-trip to, just a local lookup — so without a floor the Sign In
 * button's spinner would flash on and off inside a couple hundred
 * milliseconds. That read as the page "blinking". Holding the loading state
 * up to this floor is purely cosmetic; it never delays a *successful* login
 * past when it actually resolves.
 */
const MIN_SUBMIT_VISIBLE_MS = 450;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loginAsDemoPreset } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // Deliberately doesn't clear `localError` before validating/submitting.
    // It used to, and the gap between "old error hidden" and "new error (or
    // none) shown" — up to MIN_SUBMIT_VISIBLE_MS on every retry — was the
    // banner visibly vanishing and reappearing, i.e. the login page
    // "flashing". Every branch below only *replaces* the message, so the
    // banner never has a tick where it's showing nothing.
    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid work email.');
      return;
    }
    if (!password || password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    const startedAt = Date.now();

    try {
      await login(email, password);
      navigateForRole(useAuthStore.getState().user?.role, navigate);
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SUBMIT_VISIBLE_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SUBMIT_VISIBLE_MS - elapsed));
      }
      setLocalError(errorMessage(err, 'Authentication failed. Please verify credentials.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSelect = (preset: DemoPresetUser) => {
    setEmail(preset.email);
    setPassword(DEMO_ACCOUNT_PASSWORD);
    loginAsDemoPreset(preset);
    navigateForRole(preset.role, navigate);
  };

  return (
    <AuthScreen
      hero={
        <>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
            <span>Fleetin Logistics Platform</span>
          </div>

          <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
            Connected Fleet, <br />
            <span className="font-extrabold text-accent">Smarter Operations</span>
          </h2>
        </>
      }
    >
          {localError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-xs font-medium text-destructive-subtle-foreground animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <span>{localError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-foreground" htmlFor="login-email">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="login-email"
                type="email"
                required
                inputSize="md"
                leadingIcon={<Mail className="h-4 w-4" aria-hidden />}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                className="rounded-lg"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-foreground" htmlFor="login-password">
                Password <span className="text-destructive">*</span>
              </label>
              <Input
                id="login-password"
                type="password"
                required
                isPassword
                inputSize="md"
                leadingIcon={<Lock className="h-4 w-4" aria-hidden />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter Password"
                className="rounded-lg"
                autoComplete="current-password"
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
              isLoading={isSubmitting}
              className="rounded-lg py-3 text-sm font-semibold transition active:scale-[0.99]"
            >
              Sign In
            </Button>
          </form>

          {/*
            Demo picker: dev-only, and only when VITE_ENABLE_DEMO_AUTH=true.
            ENV.isDemoModeEnabled is gated on import.meta.env.DEV, a
            compile-time constant, so this block is dead-code-eliminated from
            every production build regardless of runtime env vars — it is not
            merely hidden, it does not exist in the shipped bundle.
          */}
          {ENV.isDemoModeEnabled && (
            <>
              <div className="relative my-3 flex items-center justify-center">
                <div className="w-full border-t border-border" />
                <span className="absolute bg-surface px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Or quick demo login
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1 pb-0.5 text-xs font-semibold text-muted-foreground">
                  <UserCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                  <span>Try a demo account:</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {QUICK_DEMO_PRESETS.map((preset) => {
                    const Icon = demoIcon(preset.role);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleDemoSelect(preset)}
                        className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface p-2.5 text-left text-xs text-foreground transition hover:border-primary hover:bg-primary-subtle"
                      >
                        <Icon className="h-4 w-4 text-primary" aria-hidden />
                        <span className="w-full truncate text-xs font-bold text-foreground">
                          {preset.role === 'ADMIN'
                            ? 'Admin'
                            : preset.role === 'SHIPPER'
                              ? 'Shipper'
                              : 'Transporter'}
                        </span>
                        <span className="w-full truncate text-[11px] text-muted-foreground">
                          {preset.companyName || preset.email}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="pt-2 text-center text-xs text-muted-foreground">
            Need a Shipper account for your company?{' '}
            <Link to={ROUTES.register} className="font-semibold text-primary hover:underline">
              Contact Fleetin Sales
            </Link>
          </div>
    </AuthScreen>
  );
}

export default LoginPage;
