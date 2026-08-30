import { useCallback, useMemo, useState } from 'react';

export type TriggerChar = '@' | '/';

export interface ActiveTrigger {
  char: TriggerChar;
  /** What has been typed after the trigger, so far. */
  query: string;
  /** Index of the trigger character itself, in the raw value. */
  start: number;
}

/**
 * Finds the token the caret is currently inside, if any.
 *
 * A trigger only counts at a word boundary — start of the body, or after
 * whitespace. Without that, an email address opens the people menu on every
 * keystroke, and a date like 12/09 opens the record menu.
 *
 * A whitespace character closes the token: these are references and names, and
 * once somebody has typed a space they have moved on. That is also what makes
 * the menu disappear on its own instead of needing to be dismissed.
 */
export function findActiveTrigger(value: string, caret: number): ActiveTrigger | null {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === undefined) return null;
    if (/\s/.test(char)) return null;

    if (char === '@' || char === '/') {
      const before = index === 0 ? '' : value[index - 1];
      if (before !== undefined && before !== '' && !/\s/.test(before)) return null;
      return { char, query: value.slice(index + 1, caret), start: index };
    }
    /* A reference is at most a couple of dozen characters; anything longer is
       prose and should not be querying the server on every keypress. */
    if (caret - index > 32) return null;
  }
  return null;
}

export function useTypeahead(value: string) {
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  const trigger = useMemo(() => {
    const found = findActiveTrigger(value, caret);
    if (!found) return null;
    /* Escape closes the menu for THIS token only; typing more re-opens it. */
    if (dismissed !== null && dismissed === found.start) return null;
    return found;
  }, [value, caret, dismissed]);

  const dismiss = useCallback(() => {
    const found = findActiveTrigger(value, caret);
    setDismissed(found ? found.start : null);
  }, [value, caret]);

  return { trigger, setCaret, dismiss };
}

/** Replace the active token with a finished one, and say where the caret lands. */
export function applyToken(
  value: string,
  trigger: ActiveTrigger,
  token: string,
): { value: string; caret: number } {
  const end = trigger.start + 1 + trigger.query.length;
  const rest = value.slice(end);
  /* A trailing space so the next word is not swallowed into the token — but
     only when there is not already one there. Inserting unconditionally
     double-spaces every token typed in the middle of a sentence, which is
     where most of them are typed. */
  const spacer = /^\s/.test(rest) ? '' : ' ';
  const next = `${value.slice(0, trigger.start)}${token}${spacer}${rest}`;
  return { value: next, caret: trigger.start + token.length + spacer.length };
}
