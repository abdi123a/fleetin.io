import { Bot } from 'lucide-react';
import { recentActivity } from '@/data/dashboardData';
import { Skeleton } from './DashboardSkeleton';

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const avatarPalette = [
  'bg-primary-subtle text-primary-subtle-foreground',
  'bg-accent-subtle text-accent-subtle-foreground',
  'bg-muted text-muted-foreground',
];

export function RecentActivityCard({ ready = true }: { ready?: boolean }) {
  return (
    <div className="h-full flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3 text-foreground">Recent Activity</h2>
        <button
          type="button"
          className="type-body-xs font-medium text-primary hover:text-primary-hover cursor-pointer"
        >
          View audit log
        </button>
      </div>

      <ul className="mt-3">
        {recentActivity.map((item, idx) => {
          const isLast = idx === recentActivity.length - 1;
          const isSystem = item.actor === 'System';
          const tone = avatarPalette[idx % avatarPalette.length];
          return (
            <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span className="absolute left-[13.5px] top-7 h-full w-px bg-border" />
              )}
              {isSystem ? (
                <div className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <Bot className="h-[14px] w-[14px]" strokeWidth={1.75} />
                </div>
              ) : (
                <div
                  className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full type-caption ${tone}`}
                >
                  {initials(item.actor)}
                </div>
              )}
              <div className="min-w-0 flex-1 pt-0.5">
                {ready ? (
                  <>
                    <p className="type-body-sm leading-snug text-foreground/80">
                      <span className="font-medium text-foreground">{item.actor}</span>{' '}
                      {item.action}{' '}
                      <span className="font-medium text-foreground">{item.target}</span>
                    </p>
                    <span className="type-caption text-muted-foreground">{item.time}</span>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Skeleton className="h-2.5 w-full max-w-[75%]" />
                    <Skeleton className="h-2 w-16" />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
