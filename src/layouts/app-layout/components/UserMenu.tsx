import { ChevronDown, LogOut, Settings, UserRound } from '@/design-system/icons';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import {
  Avatar,
  CompanyAvatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system';
import { useAuthStore } from '@/stores';
import { useShipper } from '@/features/shippers/api/queries';
import { cn } from '@/utils';

export interface UserMenuProps {
  /** `sidebar` is a full-width row in the sidebar footer; `header` the old pill. */
  variant?: 'header' | 'sidebar';
  /** Sidebar only — the rail is icon-width, so the name and role step aside. */
  isCollapsed?: boolean;
  className?: string;
}

/**
 * The account menu, and the theme control that now lives inside it.
 *
 * Both moved on 2026-08-30. The theme switch had a whole footer of the sidebar
 * to itself — a three-way control, permanently on screen, for a setting most
 * people touch once — while the account it belongs to sat in the far opposite
 * corner of the chrome. Swapping them puts the person's own settings in one
 * place and gives the sidebar's footer back to the account it is signed in as.
 */
const THEME_CHOICES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

export function UserMenu({ variant = 'header', isCollapsed = false, className }: UserMenuProps) {
  const inSidebar = variant === 'sidebar';
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate(ROUTES.login, { replace: true });
  };

  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Super Admin';
  const displayRole = user?.companyName
    ? `${user.companyName}`
    : user?.role || 'ADMIN';

  /*
   * A shipper seat is the company, not the person who happens to hold the
   * login: the account's own mark is what belongs in the chrome. Cached by the
   * same query the shipper pages already run, so this costs no extra request.
   */
  const { data: shipper } = useShipper(user?.role === 'SHIPPER' ? (user.shipperId ?? '') : '');
  const companyName = shipper?.companyLegalName ?? user?.companyName;
  const companyLogo = shipper?.logoUrl;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={inSidebar ? `${displayName} — account menu` : undefined}
        className={cn(
          'flex items-center gap-2 transition-colors duration-fast',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          inSidebar
            ? cn(
                'w-full rounded-lg p-2 text-left hover:bg-sidebar-item-hover',
                isCollapsed && 'justify-center px-0',
              )
            : 'rounded-full py-1 pl-1 pr-2 hover:bg-muted',
          className,
        )}
      >
        {companyLogo ? (
          <CompanyAvatar size="sm" name={companyName} src={companyLogo} className="bg-card" />
        ) : (
          <Avatar size="sm" name={displayName} src={user?.avatarUrl} />
        )}
        {!(inSidebar && isCollapsed) && (
          <span className={cn('min-w-0 flex-1 text-left', !inSidebar && 'hidden sm:block')}>
            <span
              className={cn(
                'block truncate text-sm font-medium leading-tight',
                inSidebar ? 'text-sidebar-foreground' : 'max-w-[140px] text-foreground',
              )}
            >
              {displayName}
            </span>
            <span
              className={cn(
                'block truncate text-2xs font-bold uppercase leading-tight',
                inSidebar ? 'text-sidebar-foreground/70' : 'max-w-[140px] text-primary',
              )}
            >
              {displayRole}
            </span>
          </span>
        )}
        {!(inSidebar && isCollapsed) && (
          <ChevronDown
            className={cn(
              'size-4 shrink-0',
              inSidebar ? 'text-sidebar-foreground/70' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={inSidebar ? 'start' : 'end'}
        side={inSidebar ? 'top' : 'bottom'}
        /* 240px = the 264px sidebar less its 12px footer padding either side.
           The menu belongs to the sidebar, so it sits inside it rather than
           spilling over the content beside it. Fixed rather than fluid because
           on the 72px collapsed rail a menu that width would be unusable — an
           overlay popping out of a rail is expected; one overhanging a full
           sidebar looks like a mistake. */
        className={cn(inSidebar ? 'w-60' : 'w-56')}
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{displayName}</span>
          <span className="text-2xs text-muted-foreground font-normal">{user?.email || 'admin@fleetin.com'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to={ROUTES.settings}>
            <UserRound className="size-4 shrink-0" aria-hidden />
            Profile & Account
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link to={ROUTES.settings}>
            <Settings className="size-4 shrink-0" aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Rows, not the segmented control this started as.
            Three labelled segments sharing one narrow row could not fit the
            menu without widening it past the sidebar, and the widths were a
            standing fight — "System" was clipped to "Syst…" at 224px. As menu
            items they cost nothing to fit at any width, they read the same on
            the 72px rail as on the full panel, and the menu's own keyboard
            handling drives them. `radio`, because picking a theme is choosing
            one of three, and the check says which. */}
        <DropdownMenuLabel className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(next) => setMode(next as typeof mode)}>
          {THEME_CHOICES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="cursor-pointer">
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive-subtle-foreground focus:bg-destructive-subtle dark:focus:bg-destructive-subtle cursor-pointer"
        >
          <LogOut className="size-4 shrink-0 text-destructive-subtle-foreground" aria-hidden />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
