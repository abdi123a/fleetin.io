import { Avatar } from '@/design-system';
import { resolveAssetUrl } from '@/services/api.client';
import { cn } from '@/utils';

/**
 * Six tints, assigned by id.
 *
 * The standing rule is that this app spends no hue on identity — a crew stack
 * is deliberately uncoloured because teal, green, amber and red all *mean*
 * something here. A chat avatar is the exception, and only because it is the
 * one mark that never carries a state: two people with no photo are otherwise
 * a pair of identical grey discs, and telling them apart is the entire job the
 * avatar has in a conversation.
 *
 * So the palette deliberately avoids the status vocabulary — no green (fine),
 * no amber (waiting), no red (wrong), no brand teal. Violet, magenta, sky,
 * cyan and blue carry no meaning in this app, which is what makes them safe to
 * spend on a face. (`--fl-slate-200` was the obvious sixth and does not exist —
 * that ramp starts at 800 — so the sixth is a deeper violet instead.)
 *
 * Written as literal class strings because Tailwind cannot see a class it
 * never reads as a literal — an interpolated one compiles to nothing.
 */
const TONES = [
  'bg-[var(--fl-violet-100)] [&>span]:text-[var(--fl-violet-800)]',
  'bg-[var(--fl-magenta-100)] [&>span]:text-[var(--fl-magenta-800)]',
  'bg-[var(--fl-sky-100)] [&>span]:text-[var(--fl-sky-800)]',
  'bg-[var(--fl-cyan-100)] [&>span]:text-[var(--fl-cyan-800)]',
  'bg-[var(--fl-blue-100)] [&>span]:text-[var(--fl-blue-800)]',
  'bg-[var(--fl-violet-200)] [&>span]:text-[var(--fl-violet-800)]',
] as const;

/** Same person, same colour, on every screen and every reload. */
function toneFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  return TONES[hash % TONES.length] ?? TONES[0];
}

export interface PersonAvatarProps {
  person: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * A person in a conversation.
 *
 * Rounded rather than a circle: a squircle reads as a person's *tile* rather
 * than a status dot, and it is the shape Slack and Teams both settled on for
 * exactly that reason.
 */
export function PersonAvatar({ person, size = 'md', className }: PersonAvatarProps) {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return (
    <Avatar
      size={size}
      shape="rounded"
      name={name}
      src={resolveAssetUrl(person.avatarUrl ?? undefined)}
      className={cn('font-semibold', toneFor(person.id), className)}
    />
  );
}
