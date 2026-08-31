import type { TaskRecurrence } from '../contracts';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(day: number) {
  const suffix = day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd'
    : 'th';
  return `${day}${suffix}`;
}

/**
 * A rule as a sentence: "Every Monday", "Every 2 weeks on Tuesday",
 * "Monthly on the 15th".
 *
 * One function for both the badge on a generated task and the manage screen,
 * because a rule described two different ways in two places is a rule nobody
 * trusts. Note the clamp is not spelled out — a rule set to the 31st fires on
 * the 30th in April, and saying so in the badge would be a footnote about
 * something the reader can see on the date itself.
 */
export function describeRecurrence(rule: Pick<TaskRecurrence, 'frequency' | 'interval' | 'weekday' | 'dayOfMonth'>): string {
  const every = rule.interval > 1 ? `Every ${rule.interval} ` : 'Every ';

  if (rule.frequency === 'DAILY') {
    return rule.interval > 1 ? `${every}days` : 'Every day';
  }
  if (rule.frequency === 'WEEKLY') {
    const day = rule.weekday !== null ? WEEKDAY[rule.weekday] : undefined;
    if (rule.interval > 1) return `${every}weeks${day ? ` on ${day}` : ''}`;
    return day ? `Every ${day}` : 'Every week';
  }
  const date = rule.dayOfMonth ? ` on the ${ordinal(rule.dayOfMonth)}` : '';
  return rule.interval > 1 ? `${every}months${date}` : `Monthly${date}`;
}

