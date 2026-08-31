import { describe, expect, it } from 'vitest';

import { toneFor } from './TaskCalendar';

/**
 * The calendar must speak the same colours as every badge in the module.
 *
 * It used to grade by urgency, which gave the grid a fourth vocabulary nobody
 * had seen elsewhere. These lock the mapping to the status ladder — and lock
 * the one exception, overdue, which a deadline view cannot drop.
 */
describe('TaskCalendar tone', () => {
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString();

  it('wears the status colour when nothing is late', () => {
    expect(toneFor({ status: 'OPEN', dueAt: future })).toBe('available');
    expect(toneFor({ status: 'IN_PROGRESS', dueAt: future })).toBe('active');
    expect(toneFor({ status: 'WAITING', dueAt: future })).toBe('waiting');
    expect(toneFor({ status: 'COMPLETED', dueAt: future })).toBe('returned');
    expect(toneFor({ status: 'CANCELLED', dueAt: future })).toBe('returned');
  });

  it('turns red when open work is past its date', () => {
    expect(toneFor({ status: 'OPEN', dueAt: past })).toBe('late');
    expect(toneFor({ status: 'IN_PROGRESS', dueAt: past })).toBe('late');
    expect(toneFor({ status: 'WAITING', dueAt: past })).toBe('late');
  });

  it('does not call finished work late — it was done, not missed', () => {
    expect(toneFor({ status: 'COMPLETED', dueAt: past })).toBe('returned');
    expect(toneFor({ status: 'CANCELLED', dueAt: past })).toBe('returned');
  });

  it('keeps the status colour when there is no date at all', () => {
    expect(toneFor({ status: 'OPEN', dueAt: null })).toBe('available');
  });
});
