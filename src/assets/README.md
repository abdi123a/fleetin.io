# Assets

Static files imported by the application.

```
assets/
  icons/    # SVGs not covered by lucide-react (brand marks, document types)
  images/   # raster artwork, illustrations
```

- Prefer `lucide-react` over adding an icon file — it is already tree-shaken and
  themed through `currentColor`.
- Brand artwork that must follow the theme belongs inline in a component (see
  `components/common/Logo.tsx`), not here, so it can use semantic tokens.
- Files that must keep a stable URL (favicon, `robots.txt`, OG images) go in
  `/public`, not here.
