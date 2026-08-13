import type { ReactNode } from 'react';

import { Logo, ThemeToggle } from '@/components';

interface AuthScreenProps {
  /**
   * Hero panel content — sits bottom-left over the fleet image. A slot rather
   * than a `title` string because Login pairs its heading with a platform
   * badge while the other screens run the heading alone.
   */
  hero: ReactNode;
  /** Form column content, rendered under the logo. */
  children: ReactNode;
}

/**
 * The shared two-column shell behind Login, Register and Forgot Password:
 * fleet-image hero on the left, logo + form on the right.
 *
 * Every screen renders this one component, so the logo size, the theme
 * toggle's placement and the responsive hero sizing are each defined once
 * here and change across all three together.
 */
export function AuthScreen({ hero, children }: AuthScreenProps) {
  return (
    <div className="grid min-h-[580px] grid-cols-1 lg:grid-cols-12">
      <div className="flex h-full flex-col p-3 lg:col-span-5">
        {/* The hero is deliberately short on phones — at the full 440px it ate
            the viewport and pushed the form below the fold. */}
        <div className="relative flex h-full min-h-[260px] flex-col justify-end overflow-hidden rounded-[1.8rem] bg-primary-active p-5 text-white sm:min-h-[440px] sm:p-7 lg:min-h-[540px]">
          <div className="absolute inset-0 z-0">
            <img
              src="/images/truck-hero.jpg"
              alt="FLEETIN Fleet"
              className="h-full w-full scale-105 object-cover object-center opacity-45 mix-blend-overlay"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          </div>

          {/* Glass treatment matches the platform badge — the page palette's
              sunken fill and border read as a grey smudge over the image. */}
          <div className="absolute right-5 top-5 z-10 sm:right-7 sm:top-7">
            <ThemeToggle
              variant="compact"
              className="rounded-full border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
            />
          </div>

          <div className="relative z-10 space-y-3">{hero}</div>
        </div>
      </div>

      <div className="my-auto flex flex-col justify-between p-6 sm:p-10 lg:col-span-7 lg:p-12">
        <div className="mx-auto w-full space-y-5">
          <div className="flex items-center justify-center pb-1">
            <Logo size="4xl" />
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
