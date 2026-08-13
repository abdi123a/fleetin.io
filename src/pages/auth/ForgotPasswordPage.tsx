import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input } from '@/design-system';
import { AlertCircle, CheckCircle2, Mail, ArrowLeft } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { findAccountByEmail } from '@/stores';

import { AuthScreen } from './components';

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }

    setIsLoading(true);

    // Simulates the network round-trip a real "send reset email" call would
    // make. The actual check — is this email registered — happens against
    // the local account directory (access-request.store.ts), the same one
    // login() checks, so this page reports the same truth login does.
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsLoading(false);

    if (!findAccountByEmail(email)) {
      setError('This email is not registered. Check the address, or request access below.');
      return;
    }

    setIsSuccess(true);
  };

  return (
    <AuthScreen
      hero={
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
          Account Recovery <br />
          <span className="text-accent font-extrabold font-sans">Reset Staff Password</span>
        </h2>
      }
    >
          {/* Header Title */}
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold tracking-tight text-foreground">Forgot Password?</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Enter your registered work email address below. We'll send instructions and a link to reset your password.
            </p>
          </div>

          {/* Error Alert Display */}
          {error && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-destructive-subtle border border-destructive/20 text-destructive-subtle-foreground text-xs font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Alert Display */}
          {isSuccess ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-lg bg-success-subtle border border-success/20 text-success-subtle-foreground text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  <span>Password Reset Instructions Sent!</span>
                </div>
                <p>
                  We have sent a password reset link to <strong className="text-foreground">{email}</strong>. Please check your inbox and follow the steps to set a new password.
                </p>
              </div>

              <Button
                variant="outline"
                size="lg"
                fullWidth
                onClick={() => navigate(ROUTES.login)}
                className="rounded-lg font-semibold py-3 text-sm"
              >
                Return to Sign In
              </Button>
            </div>
          ) : (
            /* Reset Form */
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground block">
                  Work Email <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  required
                  inputSize="md"
                  leadingIcon={<Mail className="w-4 h-4" />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your work email address"
                  className="rounded-lg"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isLoading}
                className="rounded-lg font-semibold py-3 text-sm transition active:scale-[0.99]"
              >
                Send Password Reset Link
              </Button>
            </form>
          )}

          {/* Footer Back to Login Link */}
          <div className="text-center text-xs text-muted-foreground pt-3 border-t border-border space-y-1.5">
            <Link
              to={ROUTES.login}
              className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </Link>
            <p>
              Don&apos;t have an account yet?{' '}
              <Link to={ROUTES.register} className="text-primary font-semibold hover:underline">
                Request access
              </Link>
            </p>
          </div>
    </AuthScreen>
  );
}
