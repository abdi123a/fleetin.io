import { ChevronDown, LogOut, Settings, UserRound } from '@/design-system/icons';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

export interface HeaderUserMenuProps {
  className?: string;
}

export function HeaderUserMenu({ className }: HeaderUserMenuProps) {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 rounded-full py-1 pl-1 pr-2',
          'transition-colors duration-fast hover:bg-muted',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          className,
        )}
      >
        <Avatar size="sm" name={displayName} src={user?.avatarUrl} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-foreground truncate max-w-[140px]">
            {displayName}
          </span>
          <span className="block text-2xs leading-tight text-primary uppercase font-bold truncate max-w-[140px]">
            {displayRole}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
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
