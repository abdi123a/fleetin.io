import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccessRequestStore, findAccountByEmail, findPendingRequestByEmail } from '@/stores';
import { Button, Input } from '@/design-system';
import { AlertCircle, CheckCircle2, User, Mail, Phone, Building2, Lock } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';

import { AuthScreen } from './components';

/**
 * "Register" does not create an account. It files an access request that
 * lands on the admin's Access Requests queue (Administration page) — an
 * admin has to approve it before the email/password entered here can sign
 * in. See access-request.store.ts.
 */
export function RegisterPage() {
  const submitRequest = useAccessRequestStore((state) => state.submitRequest);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!firstName || !lastName) {
      setLocalError('First name and last name are required.');
      return;
    }
    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid work email address.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (findAccountByEmail(email)) {
      setLocalError('An account already exists for this email. Try signing in instead.');
      return;
    }
    if (findPendingRequestByEmail(email)) {
      setLocalError('An access request for this email is already awaiting admin review.');
      return;
    }

    submitRequest({ firstName, lastName, email, phone, password, companyName: companyName || undefined });
    setIsSubmitted(true);
  };

  const displayedError = localError;

  return (
    <AuthScreen
      hero={
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
          FLEETIN Staff Portal <br />
          <span className="text-accent font-extrabold font-sans">Request Access</span>
        </h2>
      }
    >
          {isSubmitted ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-lg bg-success-subtle border border-success/20 text-success-subtle-foreground text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  <span>Access Request Sent!</span>
                </div>
                <p>
                  Your request has been sent to the Fleetin administrator for review. Once approved,
                  you can sign in with <strong className="text-foreground">{email}</strong> and the
                  password you chose.
                </p>
              </div>

              <Button
                variant="outline"
                size="lg"
                fullWidth
                onClick={() => {
                  setIsSubmitted(false);
                  setFirstName('');
                  setLastName('');
                  setEmail('');
                  setPhone('');
                  setCompanyName('');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="rounded-lg font-semibold py-3 text-sm"
              >
                Submit Another Request
              </Button>
            </div>
          ) : (
            <>
              {/* Error Alert Display */}
              {displayedError && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-destructive-subtle border border-destructive/20 text-destructive-subtle-foreground text-xs font-medium animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                  <span>{displayedError}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            {/* Name Fields Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground block">
                  First Name <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  required
                  inputSize="md"
                  leadingIcon={<User className="w-4 h-4" />}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground block">
                  Last Name <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  required
                  inputSize="md"
                  leadingIcon={<User className="w-4 h-4" />}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* Email Field */}
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
                placeholder="john.doe@fleetin.com"
                className="rounded-lg"
              />
            </div>

            {/* Phone & Company Fields. The cells bottom-align because these two
                labels wrap at different widths — "Phone Number (Optional)" goes
                to two lines while "Company (Optional)" stays on one, which
                otherwise leaves the inputs sitting at different heights. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col justify-end space-y-1">
                <label className="text-xs font-semibold text-foreground block">
                  Phone Number (Optional)
                </label>
                <Input
                  type="tel"
                  inputSize="md"
                  leadingIcon={<Phone className="w-4 h-4" />}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+253 77 12 34 56"
                  className="rounded-lg"
                />
              </div>

              <div className="flex flex-col justify-end space-y-1">
                <label className="text-xs font-semibold text-foreground block">
                  Company (Optional)
                </label>
                <Input
                  type="text"
                  inputSize="md"
                  leadingIcon={<Building2 className="w-4 h-4" />}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="AMINA FZCO"
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-2 gap-3">
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
                  placeholder="Min 8 chars"
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground block">
                  Confirm Password <span className="text-destructive">*</span>
                </label>
                <Input
                  type="password"
                  required
                  isPassword
                  inputSize="md"
                  leadingIcon={<Lock className="w-4 h-4" />}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="rounded-lg"
                />
              </div>
            </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="mt-3 rounded-lg font-semibold py-3 text-sm transition active:scale-[0.99]"
                >
                  Submit Access Request
                </Button>
              </form>
            </>
          )}

          {/* Footer Back to Login Link FIXED to ROUTES.login */}
          <div className="text-center text-xs text-muted-foreground pt-3 border-t border-border">
            Already have an account?{' '}
            <Link to={ROUTES.login} className="text-primary font-semibold hover:underline cursor-pointer">
              Sign in here
            </Link>
          </div>
    </AuthScreen>
  );
}
