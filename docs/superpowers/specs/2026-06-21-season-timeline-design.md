# Season Timeline Design

## Problem

The dashboard and plant detail page only show watering/fertilizing schedules. There's no visibility into a plant's natural seasonal rhythm — when it blooms, when it's actively growing vs. dormant, or the best window to prune/repot. Perenual.com shows this with a month-by-month "Season" strip per plant; users want the same, plus a cross-plant view to see when multiple plants' seasonal events line up.

## Goal

Add a seasonal-events timeline component shown in two places:
1. **Plant detail page** — single-plant timeline with tabs for Bloom / Growth Cycle / Pruning & Repotting.
2. **Dashboard** — multi-plant board using the same tabs and month columns, one row per plant, so overlapping events are visually obvious.

Seasonal data is AI-generated (via Claude, same mechanism as `care_tips`), generated at identify-time for new plants and lazily backfilled for existing plants the first time their detail page is viewed.

## Non-goals

- No fruiting/harvest category (descoped from the initial 4 options to keep scope tight — bloom, growth/dormancy, and pruning/repotting cover the requested use cases).
- No manual editing UI for seasonal data — regeneration only happens via re-identify or backfill, not a form.
- No precise-location storage — only coarse hemisphere (`northern`/`southern`) is persisted, never raw lat/lng.
- No automated test suite (none exists in this repo per `CLAUDE.md`).

## Architecture

### 1. Data model & types

**Migration** (`supabase/migrations/<timestamp>_add_seasonal_events.sql`):
```sql
alter table user_plants add column hemisphere text check (hemisphere in ('northern','southern'));
alter table user_plants add column seasonal_events jsonb;
```
Both nullable. No RLS changes needed (covered by existing `user_plants` policies).

- `hemisphere`: derived once, when geolocation is available (either at identify-time, or re-derived during lazy backfill). `null` means "unknown" — the AI prompt then defaults to a generic/Northern-hemisphere framing.
- `seasonal_events`: `null` means "not generated yet" (triggers lazy backfill). Once generated, shape:
```json
{
  "bloom_months": [3, 4, 5],
  "growth_months": [3, 4, 5, 6, 7, 8],
  "dormancy_months": [11, 12, 1, 2],
  "pruning_months": [2, 3]
}
```
Month numbers are 1–12 calendar months (already hemisphere-adjusted by Claude — the renderer does not re-derive months, only flips season *band labels*). An empty array means "generated, and genuinely not applicable to this plant" (e.g. a plant with no strong dormancy), distinct from the whole column being `null`.

**`src/types/index.ts` additions:**
```ts
export type Hemisphere = 'northern' | 'southern';

export interface SeasonalEvents {
  bloom_months: number[];
  growth_months: number[];
  dormancy_months: number[];
  pruning_months: number[];
}
```
`UserPlant` gets `hemisphere: Hemisphere | null` and `seasonal_events: SeasonalEvents | null`.
`PlantIdentification` gets `seasonal: SeasonalEvents`.

### 2. AI generation — new plants (identify flow)

**`src/app/api/identify/route.ts`:** `buildSystemPrompt` gains a `seasonal` block in the requested JSON, alongside `care`/`tips`:
```
"seasonal": {
  "bloom_months": [number 1-12, ...],   // months it flowers; [] if non-flowering or no notable bloom
  "growth_months": [number 1-12, ...],  // months of active growth
  "dormancy_months": [number 1-12, ...],// months of dormancy/reduced growth; [] if grows steadily year-round
  "pruning_months": [number 1-12, ...]  // best months to prune or repot
}
```
The existing `locationContext` suffix (built from `geoCoords`) is extended to instruct Claude to return calendar months adjusted for the user's hemisphere when coordinates are given, otherwise assume Northern hemisphere and note that assumption isn't shown to the user (it's just the default framing).

**`src/app/api/plants/route.ts` (POST):** insert mapping adds:
- `seasonal_events: body.seasonal || null`
- `hemisphere: body.geoCoords ? (body.geoCoords.lat >= 0 ? 'northern' : 'southern') : null`

**`src/app/identify/page.tsx`:** `handleAddPlant`'s POST body already has access to `geoCoords` in component state (used today for the identify call) — pass it through to `/api/plants` alongside the existing fields, and pass `result.seasonal` through as `seasonal`.

### 3. AI generation — existing plants (lazy backfill)

**New route `POST /api/plants/[id]/seasonal`:**
1. Auth check + ownership check (`eq('user_id', user.id)`), same pattern as other plant routes.
2. Load the plant; if `seasonal_events` is already non-null, return it as-is (idempotent no-op — avoids re-calling Claude on repeat visits).
3. Otherwise call Claude with a focused prompt: given `common_name`, `scientific_name`, and optional `hemisphere` (from request body), return just the `seasonal` JSON block (same shape as above).
4. Update the row: `seasonal_events`, and `hemisphere` if it was learned this call and the column was previously null.
5. Return the updated plant fields.

**New client component `src/components/SeasonalDataLoader.tsx`** (`'use client'`, renders nothing visible):
- Props: `plantId: string`, `hasSeasonalData: boolean`.
- On mount, if `!hasSeasonalData`: best-effort request browser geolocation (same silent pattern as `requestGeolocation` in `identify/page.tsx` — proceeds with `null` on denial/unavailability/timeout), then `POST /api/plants/[id]/seasonal` with `{ hemisphere }` derived from the coords (or omitted if none), then `router.refresh()`.
- Mounted once in `src/app/plants/[id]/page.tsx` alongside the season card; doesn't block any other rendering.

### 4. Components

**`src/components/SeasonTimeline.tsx`** — single-plant view.
- Props: `events: SeasonalEvents | null`, `hemisphere: Hemisphere | null`.
- Uses shadcn `Tabs`/`TabsList`/`TabsTrigger` (already used in `identify/page.tsx`) with 3 tabs: **Bloom** 🌸, **Growth Cycle** 🌿, **Pruning & Repotting** ✂️.
- Shared month-strip header: 12 columns ordered Sep→Aug, grouped into 4 season bands (Fall/orange, Winter/cyan, Spring/green, Summer/yellow — matching the Perenual reference). Column-to-month mapping is fixed; band *labels* swap to the opposite hemisphere's season names when `hemisphere === 'southern'` (e.g. the Sep/Oct/Nov band reads "Spring" instead of "Fall").
- Active tab determines which month(s) get highlighted:
  - Bloom: highlight `bloom_months` with a flower icon.
  - Growth Cycle: highlight `growth_months` (green) and `dormancy_months` (gray/blue) simultaneously — the two are complementary halves of one cycle, shown together.
  - Pruning & Repotting: highlight `pruning_months` with a scissors/pot icon.
- The current real-world month gets a subtle ring/outline regardless of active tab.
- **States:**
  - `events === null` → skeleton placeholder (data not generated yet; `SeasonalDataLoader` is working on it).
  - Active tab's relevant array(s) empty → inline message instead of a blank grid: "No notable blooming period for this plant" / "Grows steadily year-round, no dormant period" / "No specific pruning window — prune as needed."

**`src/components/SeasonTimelineBoard.tsx`** — multi-plant dashboard view.
- Props: `plants: UserPlant[]`.
- One shared tab selector (same 3 tabs) drives all rows, so plants are compared on the same category at once.
- Same month-strip/season-band header as `SeasonTimeline`, rendered once. Below it, one compact row per plant: name (+ thumbnail if `photo_url` set) on the left, highlighted cells on the right, sharing column geometry with the header so everything lines up vertically.
- Plants are filtered per active tab: a plant is included only if it has non-null `seasonal_events` AND a non-empty array for that tab's category. This keeps the board focused on plants with real signal for the selected category rather than padding it with blank rows.
- If zero plants qualify for the active tab, show a short empty state: "No plants have bloom data yet — visit a plant's page to generate it."
- Each plant's hemisphere is per-plant (not assumed shared) — a household with plants identified at different locations/times can have mixed `hemisphere` values; the board only cares about each plant's already-hemisphere-adjusted month numbers, so no cross-plant hemisphere reconciliation is needed.

### 5. Integration points

- **`src/app/plants/[id]/page.tsx`:** add a new `<Card>` section containing `<SeasonTimeline events={plant.seasonal_events} hemisphere={plant.hemisphere} />`, placed between the Care Guide and Tips cards. Mount `<SeasonalDataLoader plantId={plant.id} hasSeasonalData={!!plant.seasonal_events} />` once on the page (renders nothing, triggers backfill + refresh).
- **`src/app/page.tsx`:** add `<SeasonTimelineBoard plants={plantList} />`, always-expanded, placed below the existing overdue-water banner and above the plant list. The page's existing `select('*')` query already returns `seasonal_events`/`hemisphere` — no extra query needed.

## Error handling & edge cases

- **Claude returns malformed JSON** in either the identify route or the new backfill route: caught by existing/equivalent `try/catch`, identify route already handles this (existing behavior unchanged); backfill route returns `{ error }`/500, and `SeasonalDataLoader` silently no-ops on failure (no error UI — the season card just stays in its skeleton/empty state until the next visit retries).
- **Backfill called twice concurrently** (e.g. fast navigation + remount): both calls re-check `seasonal_events IS NULL` before calling Claude; worst case is one redundant Claude call that overwrites with an equally-valid idempotent result — not worth deduping given low traffic.
- **Geolocation denied/unavailable during backfill**: proceeds with `hemisphere: null` in the request; Claude prompt defaults to Northern-hemisphere framing, same as the identify flow's existing fallback behavior.
- **Plant has no meaningful bloom/dormancy/pruning window** (e.g. many foliage houseplants): Claude returns `[]` for that array; UI shows the friendly inline message rather than an empty grid (Section 4).
- **Dashboard with no plants having data for the active tab**: empty state message, not a blank board (Section 4).

## Verification plan

No automated test suite exists in this repo (per `CLAUDE.md`); verification is manual against the dev server:

1. `npm run dev`, identify a new plant (photo or search) with browser geolocation allowed — confirm the resulting `user_plants` row has non-null `seasonal_events` and a `hemisphere` matching the test location.
2. Open an existing plant from before this change (`seasonal_events` is `null`) — confirm the season card starts as a skeleton, then populates after the backfill call completes and the page refreshes; reload again and confirm no duplicate Claude call fires (check server logs / Anthropic usage if visible).
3. On the plant detail page, switch between the three tabs — confirm correct months highlight, season band labels match the test location's hemisphere, and the current month has a visible indicator.
4. Test a plant Claude says has no bloom period (e.g. a foliage-only plant) — confirm the inline "no notable blooming period" message appears instead of a blank grid.
5. On the dashboard, with multiple plants having overlapping and non-overlapping months, confirm rows align under the correct month columns across all three tabs, and that switching tabs changes which plants are shown.
6. `npm run lint` and `npm run build` to catch type errors from the new `SeasonalEvents`/`Hemisphere` types and routes.
