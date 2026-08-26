import { useState } from 'react';

import { PageHeader } from '@/components';
import { Clock, Key, Users } from '@/design-system/icons';
import { useAccessProfiles, useDirectoryUsers, usePermissionCatalog } from '@/features/access';
import { useAccessRequestStore } from '@/stores';
import { cn } from '@/utils';

import { AccessProfilesTab } from './tabs/AccessProfilesTab';
import { RequestsTab } from './tabs/RequestsTab';
import { UsersTab } from './tabs/UsersTab';

type TabId = 'users' | 'profiles' | 'requests';

/**
 * Administration — accounts and what they may do.
 *
 * Three tabs because there are three separate questions: who has an account
 * (Users), what a given bundle of permissions is called (Access Profiles), and
 * who is asking for one (Requests). The first two are served by the API and
 * are the real authorization state; Requests is the local sign-up queue that
 * predates it, kept because the register page still files into it.
 */
export function AdministrationPage() {
  const [tab, setTab] = useState<TabId>('users');

  const users = useDirectoryUsers();
  const profiles = useAccessProfiles();
  const catalog = usePermissionCatalog();
  const pendingRequests = useAccessRequestStore(
    (state) => state.requests.filter((r) => r.status === 'PENDING').length,
  );

  const tabs: { id: TabId; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'users', label: 'Users', icon: Users, count: users.data?.meta.total },
    { id: 'profiles', label: 'Access Profiles', icon: Key, count: profiles.data?.length },
    { id: 'requests', label: 'Requests', icon: Clock, count: pendingRequests || undefined },
  ];

  return (
    <div className="w-full min-w-0 space-y-5 pb-12">
      <PageHeader
        title="Administration"
        description={
          catalog.data
            ? `Accounts, access profiles and the ${catalog.data.total} permissions they draw from`
            : 'Accounts, access profiles and sign-up requests'
        }
      />

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card p-2.5">
        {tabs.map((entry) => {
          const active = tab === entry.id;
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{entry.label}</span>
              {entry.count !== undefined && (
                <span
                  className={cn(
                    'rounded-sm px-1 py-0.2 text-[10px] font-semibold tabular-nums',
                    active
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'border border-border/40 bg-background/80 text-muted-foreground',
                  )}
                >
                  {entry.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'profiles' && <AccessProfilesTab />}
      {tab === 'requests' && <RequestsTab />}
    </div>
  );
}

export default AdministrationPage;
