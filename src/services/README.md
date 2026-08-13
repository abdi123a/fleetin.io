# Services

The transport layer between the application and external systems.
**Empty by design in Phase 1** — no API integration ships until Phase 2.

## Intended shape

```
services/
  http/
    client.ts       # fetch/axios instance: base URL, auth header, timeout
    interceptors.ts # 401 refresh, correlation ids, error normalisation
    errors.ts       # HttpError type consumed by queryClient's retry policy
  <domain>/
    <domain>.service.ts   # endpoint functions, request/response schemas
```

## Boundaries

- **Services return data, not React state.** A service function is plain async
  TypeScript with no React import. TanStack Query hooks that call it belong to
  the feature, in `features/<name>/api/`.
- **Validate at the boundary.** Parse every response with a Zod schema, so an
  unexpected payload fails at the edge with a clear error rather than as an
  `undefined` deep inside a component.
- **Normalise errors here.** `lib/queryClient.ts` decides whether to retry based
  on a numeric `status` field, so every thrown error must carry one.
- **No UI concerns.** Services never import from `design-system/`,
  `components/` or `layouts/`.
