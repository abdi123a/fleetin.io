#!/usr/bin/env node
/**
 * FLEETIN — design-system invariants.
 *
 * These exist because the Tailwind palette lockdown in `src/styles/index.css`
 * is NOT self-enforcing. Clearing `--color-*` stops the default palette from
 * generating utilities, but an unknown utility is silently dropped by Tailwind
 * rather than raised as an error — so `bg-emerald-500` still builds green, it
 * just renders nothing. Without this script a regression is invisible until
 * someone notices an unstyled chip in production.
 *
 * Run: npm run check:ds
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — this repo's path contains spaces, which
// pathname would hand back percent-encoded.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
};
const files = walk(SRC);
const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(ROOT, p);

const failures = [];
const warnings = [];
const fail = (name, detail) => failures.push({ name, detail });
const warn = (name, detail) => warnings.push({ name, detail });

const PALETTE =
  'emerald|rose|slate|zinc|gray|sky|indigo|violet|purple|fuchsia|pink|lime|cyan|teal|amber|orange|red|green|blue|yellow|stone|neutral';
const PROPS =
  'bg|text|border|ring|from|to|via|fill|stroke|shadow|divide|outline|decoration|accent|caret|placeholder';

/* 1 — the lockdown itself must still be in place */
const indexCss = read(join(SRC, 'styles/index.css'));
if (!/--color-\*:\s*initial/.test(indexCss)) {
  fail('palette-lockdown-removed', "`--color-*: initial` is gone from src/styles/index.css — Tailwind's default palette is live again.");
}

/* 2 — no raw palette utilities in components */
const leaks = [];
const leakRe = new RegExp(`\\b(?:${PROPS})-(?:${PALETTE})-[0-9]{2,3}\\b`, 'g');
for (const f of files.filter((f) => f.endsWith('.tsx'))) {
  const hits = read(f).match(leakRe);
  if (hits) leaks.push(`${rel(f)} (${hits.length}): ${[...new Set(hits)].slice(0, 4).join(', ')}`);
}
if (leaks.length) {
  fail('raw-palette-classes', `${leaks.length} file(s) use Tailwind's default palette instead of semantic tokens:\n      ` + leaks.slice(0, 12).join('\n      '));
}

/* 3 — the brand value is settled; guard it against well-meaning "contrast fixes" */
const semantic = read(join(SRC, 'styles/tokens.semantic.css'));
if (!/--primary:\s*var\(--fl-teal-500\)/.test(semantic)) {
  fail('brand-colour-moved', '`--primary` is no longer --fl-teal-500 (#60969D). That value is set by the user and has been reaffirmed repeatedly; its 3.3:1 is an accepted trade. Use --primary-bold for filled surfaces that carry text.');
}
if (!/--sidebar:\s*var\(--primary\)/.test(semantic)) {
  fail('sidebar-detached-from-brand', '`--sidebar` is no longer aliased to `--primary`. The sidebar is meant to *be* the brand colour.');
}

/* 4 — the deleted amber ramp must not come back */
for (const f of files) {
  if (/--fl-amber-/.test(read(f))) fail('amber-ramp-resurrected', `${rel(f)} references --fl-amber-*, which was deleted; --warning rides --fl-orange-*.`);
}

/* 5 — motion must be opt-out-able */
const motion = [];
for (const f of files.filter((f) => f.endsWith('.tsx'))) {
  for (const m of read(f).match(/(["'`])[^"'`\n]*\banimate-(?:ping|pulse)\b[^"'`\n]*\1/g) ?? []) {
    if (!m.includes('motion-reduce')) motion.push(`${rel(f)}: ${m.slice(0, 70)}`);
  }
}
if (motion.length) {
  fail('unguarded-motion', `${motion.length} animation(s) ignore prefers-reduced-motion:\n      ` + motion.slice(0, 8).join('\n      '));
}

/* --- warnings: real debt, not yet a gate ------------------------------- */

/* Hex literals bypass the token layer entirely — the lockdown cannot see them.
 * Several are hardcoded copies of Tailwind palette steps (#10b981 = emerald-500,
 * #f59e0b = amber-500) and of the deleted amber (#ffb502). */
const hex = [];
for (const f of files.filter((f) => f.endsWith('.tsx'))) {
  const hits = read(f).match(/#[0-9a-fA-F]{6}\b/g);
  if (hits) hex.push([rel(f), hits.length]);
}
const hexTotal = hex.reduce((n, [, c]) => n + c, 0);
if (hexTotal) {
  warn('hex-literals', `${hexTotal} hard-coded hex value(s) across ${hex.length} file(s) bypass the token layer. Worst: ` + hex.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, c]) => `${f} (${c})`).join(', '));
}

const transitionAll = files
  .filter((f) => f.endsWith('.tsx'))
  .reduce((n, f) => n + (read(f).match(/\btransition-all\b/g) ?? []).length, 0);
if (transitionAll) {
  warn('transition-all', `${transitionAll} use(s) remain. These animate every property including layout. The remaining ones are mostly progress fills that genuinely animate width — narrow those to transition-[width] rather than plain transition.`);
}

/* --- dead radius utilities ---------------------------------------------
 *
 * `src/styles/index.css` sets `--radius-*: initial`, which DELETES Tailwind's
 * own radius scale so only the house steps survive: none / sm / md / lg / full,
 * plus `card` and `card-nested`. A `rounded-xl` therefore does not fall back to
 * anything — it matches no utility at all and the corner renders square.
 *
 * That is the nastiest kind of design-system drift, because it is invisible in
 * review: the class name reads like a rounder corner and ships as a sharp one.
 * This is a FAIL rather than a warning for exactly that reason — nobody is ever
 * going to notice it in a diff.
 */
const RADIUS_STEPS = new Set(['none', 'sm', 'md', 'lg', 'full', 'card', 'card-nested']);
/* Corner modifiers, longest first so `tl` is stripped before `t`. */
const RADIUS_SIDES = /^(tl|tr|bl|br|ss|se|es|ee|t|b|l|r|s|e)(?:-|$)/;
const deadRadius = [];
for (const f of files.filter((x) => x.endsWith('.tsx'))) {
  /* The bracket class is part of the token on purpose: `rounded-t-[3px]` is a
     perfectly good arbitrary value, and a pattern that stops at the side
     modifier reports it as a bare `rounded-t` and condemns working code. */
  for (const m of read(f).matchAll(/\brounded(-[A-Za-z0-9[\]_.%/-]+)?/g)) {
    const rest = m[1];
    /* A bare `rounded` is skipped, not flagged. It reads the same as the word
       "rounded" in a sentence, and this file is full of prose — a check that
       reports six comments as bugs is one nobody reads the output of. */
    if (!rest) continue;
    const step = rest.slice(1).replace(RADIUS_SIDES, '');
    /* An arbitrary value resolves on its own and needs no token. */
    if (step.startsWith('[')) continue;
    if (!RADIUS_STEPS.has(step)) deadRadius.push(`${rel(f)}: rounded${rest}`);
  }
}
if (deadRadius.length) {
  fail(
    'dead-radius',
    `${deadRadius.length} radius utility/utilities do not exist in this theme and render as square corners. ` +
      `Use none/sm/md/lg/full, or card/card-nested inside a Card. Found: ${[...new Set(deadRadius)].slice(0, 6).join(', ')}`,
  );
}

/* --- report ------------------------------------------------------------ */
for (const { name, detail } of warnings) console.log(`  warn  ${name}\n        ${detail}\n`);
for (const { name, detail } of failures) console.error(`  FAIL  ${name}\n        ${detail}\n`);

if (failures.length) {
  console.error(`design-system check: ${failures.length} failure(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`design-system check: passed (${warnings.length} warning(s))`);
