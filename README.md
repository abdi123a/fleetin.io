# FLEETIN — Internal Management System

Frontend foundation for the FLEETIN internal management system.

**Phase 1 delivers architecture only.** There are no business features, no API
integration and no authentication. What exists is the shell, the token/theme
system and the conventions every future module is built on.

---

## Stack

| Concern         | Choice                                        |
| --------------- | --------------------------------------------- |
| Framework       | React 18 + TypeScript (strict)                |
| Build           | Vite                                          |
| Styling         | Tailwind CSS v4 (CSS-first `@theme`)          |
| Components      | shadcn/ui conventions on Radix UI primitives  |
| Routing         | React Router (lazy, code-split routes)        |
| Server state    | TanStack Query                                |
| Tables          | TanStack Table                                |
| Client state    | Zustand (persisted)                           |
| Forms           | React Hook Form + Zod                         |
| Icons           | Lucide React                                  |
| Motion          | Framer Motion + CSS keyframes                 |
| Charts          | Recharts                                      |
| Class utilities | clsx, tailwind-merge, class-variance-authority |
| Dates           | date-fns                                      |

## Commands

```bash
npm run dev
```

```bash
npm run verify
```

`verify` runs typecheck, lint and a production build — the gate a change must
pass before review. Individually: `typecheck`, `lint`, `lint:fix`, `build`,
`preview`.

---

## Environment

Copy `.env.example` to `.env` to configure local development. No variable is
required to run the app — `.env` is only needed to opt into demo auth.

### Demo login (dev-only, opt-in)

`auth.store.ts` will fall back to demo authentication — matching a preset
persona, or sniffing a role from the email — **only** when both of these
hold:

1. The build is a dev build (`import.meta.env.DEV`). This is a compile-time
   constant; a production build (`vite build`) cannot ship this code path no
   matter what env vars are set, because Vite dead-code-eliminates it.
2. `VITE_ENABLE_DEMO_AUTH=true` is set in `.env`.

Without both, a failed login (bad credentials, unreachable backend) is always
a login error — never a silent grant of access. This is what `npm run dev`
does out of the box, with no `.env` file at all, so local development matches
production auth behaviour by default.

To use the demo picker locally:

```bash
echo "VITE_ENABLE_DEMO_AUTH=true" >> .env
npm run dev
```

---

## Architecture

```
src/
  app/            # composition root: providers + router. Rarely changes.
  layouts/        # AppLayout — the one shell every page renders inside
  pages/          # route entry points, one folder per module
  design-system/  # generic, business-agnostic primitives + design tokens
  components/     # shared app-aware components (feature-agnostic)
  features/       # business modules — empty in Phase 1, see features/README.md
  hooks/          # cross-cutting React hooks
  services/       # API/transport layer — empty in Phase 1, see services/README.md
  lib/            # third-party configuration (TanStack Query client)
  stores/         # Zustand stores (theme, shell UI state)
  config/         # routes, navigation, app constants, storage keys
  types/          # cross-cutting TypeScript types
  utils/          # dependency-free helpers
  styles/         # token layers, base layer, keyframes
  assets/         # static files
```

Every folder exposes an `index.ts` barrel. Import from the barrel
(`@/design-system`), not from file paths inside it — the barrel is the module's
contract.

The `@/` alias maps to `src/` and is configured in both `vite.config.ts` and
`tsconfig.app.json`.

### Dependency direction

```
features  ->  components  ->  design-system  ->  tokens
    \             \                \
     ------------> hooks / utils / types <-------
```

Dependencies only ever point rightward. A shared component never imports a
feature; a design-system primitive never imports application config.

---

## Design tokens

Three tiers, in `src/styles/`:

1. **`tokens.primitives.css`** — raw values (`--fl-teal-500`, `--fl-space-4`).
   Theme-agnostic. Never referenced by a component.
2. **`tokens.semantic.css`** — role aliases (`--primary`, `--surface`,
   `--border`). This is the only layer that differs between light and dark, and
   the only layer components may consume.
3. **`index.css`** — the `@theme inline` block turning semantic tokens into
   Tailwind utilities (`bg-primary`, `text-muted-foreground`, `shadow-md`).

Primitives are deliberately *not* exposed as utilities: `bg-fl-teal-500` is
unreachable from feature code, so a colour cannot be used outside its role.

Covered: colour, typography, spacing, radius, borders, shadow/elevation,
z-index, animation (durations + easings), and shell layout metrics.

### Typography levels

`src/styles/typography.css` adds the semantic layer on top of the raw size
scale. Apply the level, never the four values it stands for:

```
type-display-xl  type-display  type-h1  type-h2  type-h3  type-h4
type-body-lg     type-body     type-body-sm      type-caption
type-label       type-mono
```

Each locks size, line height, weight and tracking together. Colour is
deliberately not part of a level — pair with a text colour token at the call
site (`<h2 className="type-h2 text-foreground">`).

**Rules**

- Never hardcode a colour, radius, shadow, duration or z-index.
- Use `z-modal`, not `z-[600]` — the z-scale is exposed as named utilities.
- Values needed in JS (Recharts series, Framer Motion transitions) come from
  `@/design-system/tokens`, which stores `var(--token)` references so they still
  follow the theme.

The palette was sampled from the production FLEETIN shipment platform: teal
`#4F8A94` primary, orange `#ED6C03` accent, with green/amber/red/blue status
roles.

## Theming

- Light, dark and system, persisted to `localStorage` under `fleetin.theme`.
- An inline script in `index.html` applies the stored theme **before first
  paint**, so dark-mode users never see a light flash.
- `mode: 'system'` stays reactive to OS changes for as long as it is selected.
- The `<html>` class is owned by the theme store, so it cannot drift from the
  persisted value.

---

## Design system showcase

`/design-system` is the internal reference for the visual language — colours,
typography, radius, shadows, spacing and the curated icon set.

Nothing on that page restates a token value in its own source. Colours and
shadows are read from the live stylesheet with `useTokenValues`, and type
metrics are measured off the rendered specimen, so the documentation cannot
drift from the tokens it documents and re-reports itself when the theme
changes. Token names, utility classes and icon names are click-to-copy.

Showcase components live in `src/design-system/showcase/` and are intentionally
**not** re-exported from `@/design-system` — the page is lazily loaded, and
folding documentation code into the main barrel would pull it into every bundle
that touches a primitive. Import from `@/design-system/showcase`.

## Buttons

`Button` is the only button implementation in the application. Modules import it
rather than defining their own — if a need is not expressible through its props,
the component gains a variant instead of the feature gaining a bespoke control.

```tsx
import { Button, ButtonGroup, IconButton } from '@/design-system';
```

- **`Button`** — labelled actions. 10 variants, sizes `xs`–`xl` plus `icon`,
  with `isLoading`, `leadingIcon`/`trailingIcon`, `fullWidth` and `asChild`.
- **`IconButton`** — icon-only. Requires `aria-label` **at the type level**, so
  an unlabelled icon control cannot compile.
- **`ButtonGroup`** — attached (segmented) or spaced groups, horizontal or
  vertical.

All three render from one `cva` definition in
`design-system/primitives/Button/buttonVariants.ts`. That file is the single
source of button styling; changing focus treatment or radius there lands
everywhere at once.

Conventions:

- `type` defaults to `"button"`, so a button inside a form never submits by
  accident. Pass `type="submit"` deliberately.
- Navigation uses `<Button asChild><Link to="…" /></Button>`, which renders a
  real anchor — middle-click and "open in new tab" keep working.
- `className` is for layout (spacing, width). A colour override means a missing
  variant, not a one-off.

Full documentation, live examples and the API reference are at
`/design-system` § 07.

## Adding a module

1. Add the path to `src/config/routes.ts`.
2. Add the entry to `src/config/navigation.ts` — this alone produces the sidebar
   item, the breadcrumb and the page title.
3. Add the lazy route in `src/app/router/routes.tsx`.
4. Create `src/pages/<module>/` and `src/features/<module>/`.

The layout, theme and shell need no changes.

## Conventions

- Components are typed with an exported props interface; no `any`, no
  non-null assertions.
- Variants are declared with `cva`, never with ad-hoc conditional strings.
- `className` is merged last via `cn()`, so callers can always override.
- Primitives forward refs and support `asChild` where composition makes sense.
- Icon-only controls require `aria-label` at the type level.
- Files are `PascalCase.tsx` for components, `camelCase.ts` elsewhere;
  hooks are `useThing.ts`; stores are `thing.store.ts`.
