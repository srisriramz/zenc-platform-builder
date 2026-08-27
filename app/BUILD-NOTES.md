# ZenC Platform — build notes

Frontend-only demo built from the `zenc-platform-builder` skill. No backend,
no real credentials, seeded mock data throughout. Build order and checkpoints
follow `templates/claude-code-bootstrap.md`.

## Milestone status

| Milestone | Scope | State |
|---|---|---|
| **M0** | Scaffold + platform shell | ✅ done |
| **M1** | SIEM foundation: telemetry, normalization, Log Explorer | ✅ done |
| M2 | Correlation engine + ATT&CK-mapped rules → alert-envelope | not started |
| M3 | Detection engineering workflow (agent proposes, human-only enable) | not started |
| M4 | ZenC SOC: intake → triage → response, 12 agents, approvals | not started |
| M5 | ATT&CK × D3FEND coverage matrix + SOC reporting | not started |

## Stack

Next.js 16 (App Router, Turbopack), strict TypeScript, Tailwind v4,
hand-rolled shadcn/ui-style primitives (`components/ui/`), TanStack Query for
simulated server state, Zustand for the allowed slices only (session, tenant,
product, theme, sim, sidebar), Recharts, Zod runtime schemas mirroring
`../schemas/`.

## Design system

Dark-first enterprise SOC surface, fully theme-aware (dark / light / system).
- Tokens in `app/globals.css` — one `:root` (light) definition per color,
  `.dark` re-points the same names. shadcn-compatible names + a severity ramp
  (`--sev-*`), elevation (`--card` / `--card-elevated` / `--popover`), and a
  shadow scale keyed to a per-theme shadow color.
- Primitives: `Card` (hairline top-highlight + optional `interactive` lift),
  `Badge`, `Button`, `Table` (sticky headers via `<TableHeader sticky>`,
  scroll container), `Tabs`, `Menu`/`Dialog`/`Sheet` (scale-in / slide-in,
  focus trap, Esc + backdrop), `Timeline`, `StatTile` + `StatGrid`.
- Motion: `.anim-rise` / `.anim-fade` / `.anim-scale-in` / `.anim-slide-in-left`
  + `shimmer` skeletons, all disabled under `prefers-reduced-motion`. Page
  content re-animates on route change (keyed on pathname).
- Charts follow the `dataviz` skill: single-series histogram → no legend,
  4px rounded data-ends on the baseline, recessive grid, per-bar hover
  tooltip, validated bar-vs-surface contrast. Severity is a status ramp that
  always ships with a text label + dot, never color alone.
- Chrome: glass sticky top bar, command palette (⌘K) with grouped results,
  responsive left nav that collapses into a `Sheet` drawer below `lg`,
  skip-to-content link, visible focus rings, keyboard nav in menus/palette.

The shadcn CLI in this environment is pre-release and crashes on `init`, so
the primitives are written directly against the same token names — same
component API, no dependency on the CLI.

## M0 — what's in

- **App shell**: top bar with product switcher, command palette (⌘K), tenant
  switcher, role display, theme toggle, environment + simulation indicators,
  and a **kill-switch status** badge (visible in chrome, not settings).
- **Non-removable "Interactive Demo with Mock Data" notice** on every screen
  (`components/shell/demo-notice.tsx`) — do not remove.
- **Shared services (mock)**: Identity/RBAC-ABAC (`mock/rbac.ts`), tenants +
  partners, per-tenant entitlements (`has_siem`/`has_soc`/`has_assessment`),
  Policy Engine with locked non-negotiable fields, append-only Audit, Feature
  flags via the sim control, Observability via connector health.
- **RBAC**: 6 roles (analyst, senior analyst, approver, admin, reviewer,
  auditor); permissions are checked in the mock API, not just hidden in the
  UI. `rule.enable` / `action.approve` are separate permissions; agents are
  never modelled as holding them.
- **Seeded ATT&CK + D3FEND libraries** as static data
  (`data/frameworks/`) — 24 techniques / 11 tactics, 16 D3FEND techniques.
  The product maps to them; it never edits them.
- **Simulation control**: normal / slow / timeout / server error / degraded
  source / partial results — every required UI state is reachable on demand.
- **Routes**: all SIEM + SOC + platform routes exist. SOC and later-SIEM
  screens render an honest roadmap stub that still enforces the real
  entitlement + RBAC gates.

## M1 — what's in

- **Telemetry**: 6 synthetic source families for Northwind Bank, 4 for
  Northwind Markets, 0 for Summit Credit Union (SOAR-only tenant — proves SIEM
  can be absent). Health states cover healthy / degraded / stale / unknown.
- **Stream vs. sample.** The demo separates two things: the *stream* (real-rate
  ingestion — millions of events / GB per day, summarised as 24h counters on
  Telemetry and shown live on `/ingestion`, all from `data/ingestion-profile.ts`),
  and the *sample* — a deterministic ~72h slice materialised by
  `data/events.ts` (~2,400 events, linked **raw + normalized** via
  `raw_payload_ref`, ~2% **quarantined on arrival**) that backs the Log
  Explorer, the quarantine review queue, and (in M2) correlation. Every screen
  labels which one it's showing.
- **Log Explorer** (`app/(app)/log-explorer`):
  - **Safe bounded query parser** (`lib/query/`): tokenizer + recursive
    descent → typed AST → pure evaluator. **Never** `eval`, `new Function`,
    SQL, shell, or a user RegExp (wildcards compile to a linear two-pointer
    matcher). Field allowlist, operator allowlist per field, hard bounds
    (query length, condition count, group depth, wildcard count, result rows,
    90-day time range). Injection characters (`; $ { } \` -- /* */`) are
    rejected with a specific, positioned error.
  - Free-text + structured search over the same query; visual query builder
    (no code editor); time histogram; field statistics with click-to-filter;
    raw/normalized side-by-side with parser + schema version; event lineage
    and related-events; saved searches + history (versioned, tenant-scoped
    localStorage); tenant-safe CSV/JSON export.
  - **Required states** all implemented: loading, no-results, malformed
    query, timeout, server error, partial results, stale data, degraded
    source, access denied, success.
- **SIEM Dashboard** and **Telemetry & Connectors** screens with connector
  health, ingestion lag, 24h volume, schema-validation failures, and the
  quarantine queue.
- **Entities at Risk** (`/entities`) — the seeded, *indicative* UEBA
  stand-in. Per-user/host risk score derived transparently from signal
  *ratios* in the sample (not ML, not baselining — that stays Phase 1.5);
  every signal drills to its contributing events. Risk badges also appear on
  entities in the Log Explorer.
- **Analytics** (`/analytics`) — a role-aware reporting layer (a contract
  consumer, not a cross-product god-view) with three presets: **Detection
  Analytics** (SIEM, live now — volume trend, connector reliability,
  telemetry-family coverage staging, quarantine causes, event-type mix,
  entity-risk distribution), **SOC Manager** (M4 stub), **Executive/CISO**
  (M5 stub, degrades to whatever the tenant is entitled to). Default preset
  follows the viewer's role. New roles `ciso` + `soc_manager` (read-only,
  `reporting.view` + `audit.view`) with matching demo personas.
- **Interactive drill-down** — dashboards are URL-param driven: stat tiles,
  chart marks, table rows, legend items, and degraded-source names all link
  into the filtered operational screens; the Log Explorer hydrates a query
  from the URL and auto-runs; histogram bars are click-to-zoom.
- **Traffic & Ingestion** (`/ingestion`) — a *simulated-live* throughput
  dashboard: rolling events/sec and bandwidth area charts, per-source stream
  table with 90-second sparklines, bandwidth-by-family bars, an ingestion-
  health donut, and 24h projections. Driven by a pure deterministic sampler
  (`lib/live-feed.ts`) advanced by a timer (`hooks/use-live-ingestion.ts`),
  pausable, honours `prefers-reduced-motion` (slower tick). Steady-state
  rates come from `data/ingestion-profile.ts` (family rate × `volume_weight`);
  this view models the *rate*, the Log Explorer holds the materialised sample.

## Checkpoint notes (against the bootstrap template)

1. Nothing in SIEM depends on SOC being present. `tenant-summit-cu` has
   `has_siem:false` and every SIEM screen correctly shows "not entitled".
2. Query + rule-authoring surfaces are structured/bounded — verified by the
   parser rejecting `event_type = "foo" OR $(rm -rf /)` and
   `event_type:'; DROP TABLE events;--` with a clear reason.
3. `alert-envelope` / `correlation-rule` Zod schemas are defined (with the
   human-only-`enabled` and no-empty-`contributing_event_refs` refinements)
   ahead of M2/M3 so producers share one shape.
4. Detection coverage is not yet built (M5); no binary covered/not-covered
   flag has been introduced anywhere.

## Tests

Vitest, pure-function coverage on the load-bearing pieces (74 tests):

- `src/lib/query/parser.test.ts` — the safe query parser: valid grammar,
  injection/code rejection (`;`, `$(…)`, backticks, `--`, `/* */`, `\x`),
  allowlist errors, every bound (length, condition count, group depth,
  wildcard stars), and the linear glob matcher's ReDoS-immunity.
- `src/lib/query/evaluate.test.ts` — operator semantics, boolean composition,
  `source.family` resolution, time-window filtering, limit/truncation,
  time-range caps.
- `src/mock/rbac.test.ts` — role → permission mapping, `assertCan` /
  `assertEntitlement` failure codes, separation of duties (no role holds both
  `rule.propose` and `rule.enable`), auditor is read-only.
- `src/schemas/schemas.test.ts` — every Zod schema accepts its
  `examples/sample-*.json` fixture and rejects a broken one; the
  non-negotiable refinements (no empty `contributing_event_refs`, enabled
  rule needs D3FEND + `enabled_by`, quarantine needs a reason).

## Running

```bash
cd app
npm install
npm run dev       # http://localhost:3000
npm run build     # production build — passes clean
npm run lint      # ESLint — passes clean
npm test          # Vitest — 74 tests, passes clean
```
