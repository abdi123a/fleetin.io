# Features

Business modules live here. **Empty by design in Phase 1** — no business logic
ships until Phase 2.

## Why features, not layers

A layered tree (`components/`, `hooks/`, `services/` at the top level, holding
everything) forces a change to one module to touch four distant folders and
makes ownership impossible to see. A feature folder is self-contained: the whole
of Partners is under `features/partners/`, and deleting the folder deletes the
module.

## Structure

Each feature owns its slice. Create only the folders it actually needs:

```
features/
  partners/
    api/          # queries + mutations (TanStack Query hooks)
    components/   # UI private to this feature
    hooks/        # feature-specific hooks
    schemas/      # Zod schemas — the source of truth for its types
    types/        # types not derivable from a schema
    utils/        # feature-specific helpers
    index.ts      # public surface — the ONLY import path for other features
```

## Rules

1. **Import features through their barrel.** `@/features/partners` is allowed;
   `@/features/partners/components/PartnerRow` is not. The barrel is the
   module's contract, and anything not exported is free to change.
2. **No feature imports another feature's internals.** If two features need the
   same thing, it is not feature code — promote it to `components/`,
   `design-system/`, `hooks/` or `utils/`.
3. **A shared component never imports a feature.** Dependencies point inward,
   from features toward the shared layers, never the other way.
4. **Derive types from Zod schemas** with `z.infer` rather than declaring a type
   and a schema separately, which drift apart.
5. **Route entry points stay in `pages/`.** A page composes a feature; the
   feature does not own the route.

## Adding a module

1. Add the path to `src/config/routes.ts`.
2. Add the navigation entry to `src/config/navigation.ts` — this alone gives it
   a sidebar item, a breadcrumb and a page title.
3. Add the lazy route in `src/app/router/routes.tsx`.
4. Create `src/pages/<module>/` and `src/features/<module>/`.

The layout, theme and shell require no changes.
