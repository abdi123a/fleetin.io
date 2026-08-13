# Empty Return Cycles — presentation rules

Brand anchors for this surface:

- **Primary** `#60969d` (Fleetin teal) → identity, active states, **Protected** urgency only
- **Secondary** `#f9ac17` (Fleetin orange / accent) → in-progress / informational lifecycle dots and **Critical** urgency

Both ramps already live in `tokens.primitives.css` (`--fl-teal-*`, `--fl-orange-*`). Components must never hardcode hex — consume semantic tokens via Tailwind utilities (`bg-urgency-overdue-bg`, `text-primary`, …).

## Urgency scale

| Level     | Token root            | Weight                         |
|-----------|-----------------------|--------------------------------|
| Overdue   | `--urgency-overdue-*` | Solid fill — highest weight    |
| At risk   | `--urgency-at-risk-*` | Tinted surface + border        |
| Critical  | `--urgency-critical-*`| Tinted surface + border        |
| Watch     | `--urgency-watch-*`   | Tinted surface, no border      |
| Safe      | `--urgency-safe-*`    | Tinted surface, low contrast   |
| Protected | `--urgency-protected-*` | Brand-tinted surface         |

Each level exposes `-bg`, `-fg`, `-border`, and `-solid` (row rail / KPI rail).

## One saturated colour per row

**Urgency owns saturation.** Lifecycle chips are neutral outline + a 6px coloured dot. Alerts are an icon + tooltip in the Urgency cell — never a second badge that breaks fixed row height.

Only **Overdue** may use a solid saturated fill. Everything else is a tinted surface (~8–12% light / ~15–20% dark). Always pair colour with an icon and a text label (WCAG AA on `-fg` over `-bg`).

Reusable primitives: `components/ui/` — `UrgencyBadge`, `LifecycleChip`, `ContainerSwap`, `DeadlineCell`, `PartyCell`.
