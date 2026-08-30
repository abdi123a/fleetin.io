import { describe, expect, it } from 'vitest';

import { applyToken, findActiveTrigger } from './useTypeahead';

describe('composer typeahead', () => {
  it('finds an @ trigger at the start of the body', () => {
    expect(findActiveTrigger('@ahm', 4)).toEqual({ char: '@', query: 'ahm', start: 0 });
  });

  it('finds a / trigger after a space', () => {
    expect(findActiveTrigger('look at /VEH-00', 15)).toEqual({ char: '/', query: 'VEH-00', start: 8 });
  });

  it('ignores an @ inside an email address', () => {
    expect(findActiveTrigger('mail ahmed@fleetin.io', 21)).toBeNull();
  });

  it('ignores a / inside a date', () => {
    expect(findActiveTrigger('due 12/09', 9)).toBeNull();
  });

  it('closes the token once a space is typed', () => {
    expect(findActiveTrigger('@ahmed can you', 14)).toBeNull();
  });

  it('gives up rather than querying on a long run of prose', () => {
    expect(findActiveTrigger(`@${'x'.repeat(40)}`, 41)).toBeNull();
  });

  it('replaces the active token and leaves the caret after a trailing space', () => {
    const value = 'the door on /VEH-00 is broken';
    const trigger = findActiveTrigger(value, 19);
    expect(trigger).not.toBeNull();
    if (!trigger) return;
    const result = applyToken(value, trigger, '@[vehicle:MO-2022-DJ]');
    expect(result.value).toBe('the door on @[vehicle:MO-2022-DJ] is broken');
    /* Caret sits at the end of the token, before the space already there. */
    expect(result.value.slice(result.caret)).toBe(' is broken');
  });

  it('adds a space when the token is typed at the very end', () => {
    const value = 'check /VEH-00';
    const trigger = findActiveTrigger(value, value.length);
    expect(trigger).not.toBeNull();
    if (!trigger) return;
    const result = applyToken(value, trigger, '@[vehicle:MO-2022-DJ]');
    expect(result.value).toBe('check @[vehicle:MO-2022-DJ] ');
    expect(result.caret).toBe(result.value.length);
  });

  it('returns null when the caret is not in a token', () => {
    expect(findActiveTrigger('plain words', 11)).toBeNull();
  });
});
