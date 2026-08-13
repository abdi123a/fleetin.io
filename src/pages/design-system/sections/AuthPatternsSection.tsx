import { Logo, ThemeToggle } from '@/components';
import { Button, Input } from '@/design-system';
import { Lock, Mail, ShieldCheck } from '@/design-system/icons';
import {
  ShowcaseExample,
  ShowcaseItem,
  ShowcaseSection,
  ShowcaseSubsection,
} from '@/design-system/showcase';
import { AuthScreen } from '@/pages/auth/components';

/* ---------------------------------------------------------------------------
 * 1. Logo
 * ------------------------------------------------------------------------- */
/**
 * The three steps the product ships. The component defines sm, md, xl and 3xl
 * as well; they have no call site, so they are named in the prose rather than
 * given a specimen — a size ramp with four unreachable rungs invites someone to
 * pick one at random.
 */
const LOGO_SIZES = ['lg', '2xl', '4xl'] as const;

/** Height class per step, restated for the spec caption only. */
const LOGO_HEIGHTS: Record<(typeof LOGO_SIZES)[number], string> = {
  lg: 'h-10 · 40px',
  '2xl': 'h-14 · 56px',
  '4xl': 'h-20 · 80px',
};

function LogoSubsection() {
  return (
    <ShowcaseSubsection
      title="Logo"
      description="One component for every FLEETIN mark. The wordmark's 2.57:1 ratio means height is always the binding constraint — the max-width in each step only guards narrow viewports, so `size` is the dial to turn."
    >
      <ShowcaseExample
        title="The three steps in use"
        description="4xl is the auth screen, 2xl the expanded sidebar, lg the collapsed rail. The component also defines sm, md, xl and 3xl, which nothing calls."
        layout="column"
        code={`<Logo size="4xl" />`}
      >
        <div className="flex w-full flex-col gap-4">
          {LOGO_SIZES.map((size) => (
            <div key={size} className="flex items-center gap-4 border-b border-border pb-3 last:border-0">
              <span className="w-12 shrink-0 type-caption font-medium text-primary">{size}</span>
              <Logo size={size} />
              <span className="ml-auto shrink-0 type-caption text-muted-foreground">
                {LOGO_HEIGHTS[size]}
              </span>
            </div>
          ))}
        </div>
      </ShowcaseExample>

      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="Icon only"
          description="The collapsed sidebar rail, at lg. Never filtered — the glyph is a solid disc with the mark cut out of it, so a white flatten would erase it to a blank circle."
          code={`<Logo iconOnly size="lg" variant="white" />`}
        >
          {(['lg', '2xl'] as const).map((size) => (
            <ShowcaseItem key={size} label={size}>
              <Logo iconOnly size={size} />
            </ShowcaseItem>
          ))}
        </ShowcaseExample>

        <ShowcaseExample
          title="White variant"
          description="Flattens the wordmark to a solid silhouette for the brand-coloured sidebar. The sidebar is the only surface that uses it, and it costs the icon mark its internal dot detail."
          layout="bare"
          code={`<Logo iconOnly={isCollapsed} size={isCollapsed ? 'lg' : '2xl'} variant="white" />`}
        >
          <div className="flex items-center justify-center bg-sidebar p-8">
            <Logo variant="white" size="lg" />
          </div>
        </ShowcaseExample>
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 2. Controls over imagery
 * ------------------------------------------------------------------------- */
function GlassControlSubsection() {
  return (
    <ShowcaseSubsection
      title="Controls over imagery"
      description="The page palette is built for the page's own surfaces. Placed on a photograph it has no ground to sit against, so a control has to borrow its contrast from the image instead."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="Correct — glass"
          description="A translucent white fill with a blur reads as a control at any point of the image underneath it."
          layout="bare"
        >
          <ImagePlate>
            <ThemeToggle
              variant="compact"
              className="rounded-full border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
              Fleetin Logistics Platform
            </span>
          </ImagePlate>
        </ShowcaseExample>

        <ShowcaseExample
          title="Wrong — page palette"
          description="The sunken fill and border were mixed against the page, not a photo. Over one they read as a grey smudge."
          layout="bare"
        >
          <ImagePlate>
            <ThemeToggle variant="compact" className="rounded-full border-border" />
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-sunken px-3 py-1 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Fleetin Logistics Platform
            </span>
          </ImagePlate>
        </ShowcaseExample>
      </div>
    </ShowcaseSubsection>
  );
}

/** Shared backdrop for the two comparison plates above — the hero panel's own
 *  treatment, so the comparison is made against the real surface. */
function ImagePlate({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-44 overflow-hidden bg-primary-active">
      <div className="absolute inset-0" aria-hidden>
        <img
          src="/images/truck-hero.jpg"
          alt=""
          className="h-full w-full scale-105 object-cover object-center opacity-45 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </div>
      {/* Toggle top-right, badge bottom-left — the hero's own arrangement. */}
      <div className="absolute inset-0 flex flex-col justify-between p-4 [&>*:first-child]:self-end [&>*:last-child]:self-start">
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 3. AuthScreen
 * ------------------------------------------------------------------------- */
function AuthScreenSubsection() {
  return (
    <ShowcaseSubsection
      title="Auth Screen"
      description="The shell behind Login, Register and Forgot Password. Each screen passes only its hero copy and its form — the logo size, the theme toggle's placement on the hero, and the responsive hero sizing live in the shell, so a change to any of them lands on all three screens at once."
    >
      <ShowcaseExample
        title="Live shell"
        description="The real component. Below the sm breakpoint the hero drops from 440px to 260px so the form clears the fold on a phone."
        layout="bare"
        code={`<AuthScreen hero={<h2>Connected Fleet</h2>}>
  {/* form */}
</AuthScreen>`}
      >
        <div className="border-b border-border bg-surface">
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
            <form className="space-y-3.5 pt-1" onSubmit={(event) => event.preventDefault()}>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">Email</label>
                <Input
                  inputSize="md"
                  leadingIcon={<Mail className="h-4 w-4" />}
                  placeholder="Enter your email"
                  className="rounded-lg"
                  readOnly
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-foreground">Password</label>
                <Input
                  inputSize="md"
                  leadingIcon={<Lock className="h-4 w-4" />}
                  placeholder="Enter Password"
                  className="rounded-lg"
                  readOnly
                />
              </div>
              <Button type="button" variant="primary" size="lg" fullWidth className="rounded-lg py-3 text-sm font-semibold">
                Sign In
              </Button>
            </form>
          </AuthScreen>
        </div>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Main export
 * ------------------------------------------------------------------------- */
export function AuthPatternsSection() {
  return (
    <ShowcaseSection
      id="auth-patterns"
      index="15"
      title="Auth & Brand"
      description="The FLEETIN mark and the shell every signed-out screen is built from. Login, Register and Forgot Password all render one shared component, so these are the pieces to change when the signed-out experience changes."
    >
      <LogoSubsection />
      <GlassControlSubsection />
      <AuthScreenSubsection />
    </ShowcaseSection>
  );
}
