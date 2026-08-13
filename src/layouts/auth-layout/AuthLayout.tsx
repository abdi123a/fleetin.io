import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-dvh flex flex-col justify-between items-center bg-primary dark:bg-background p-4 sm:p-6 lg:p-10 text-foreground transition-colors duration-200">
      {/* Main Centered Container */}
      <main className="w-full max-w-[960px] my-auto relative z-10">
        <div className="bg-surface rounded-[2.2rem] border border-border overflow-hidden transition-all shadow-sm dark:shadow-2xl dark:shadow-black/80">
          {children}
        </div>
      </main>

      {/* Footer info */}
      <footer className="w-full text-center py-3 text-xs text-white/90 dark:text-muted-foreground font-medium z-20">
        <span>© 2026 FLEETIN Internal Management System. All rights reserved.</span>
      </footer>
    </div>
  );
}
