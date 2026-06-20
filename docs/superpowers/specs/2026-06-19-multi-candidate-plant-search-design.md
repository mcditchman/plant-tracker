# Multi-Candidate Plant Search Design

## Problem

Today, searching by name in `/identify` sends a single free-text query to Claude and gets back exactly one guessed identification, with no photo (the result card only shows an image in photo-upload mode). When the description is ambiguous (e.g. "tall plant with big leaves"), the user has no way to see alternatives or confirm Claude picked the right plant before committing to its care schedule.

## Goal

Replace the "Search by Name" text-search mode with a flow that returns several ranked candidate plants, each with a representative photo, so the user can visually confirm which one matches before fetching full care details and adding it to their collection.

Photo-upload identification is unaffected — it stays a single best-guess result, since photo mode already provides a true image of the user's own plant; this change is scoped to disambiguating free-text descriptions only.

## Non-goals

- No change to the photo-upload identification flow.
- No active filtering of candidates by location (location remains context passed to Claude, same as today — it does not exclude candidates).
- No new test suite (tracked as a separate follow-up).

## Architecture

### 1. Data model & types

**Migration** (`supabase/migrations/<timestamp>_add_photo_attribution.sql`):
```sql
alter table user_plants add column photo_attribution_url text;
```
Nullable; no RLS changes needed (covered by existing `user_plants` policies). Null for photo-upload-added or legacy plants; set only when the photo came from Wikipedia.

**`src/types/index.ts` additions:**
```ts
export interface PlantCandidate {
  common_name: string;
  scientific_name: string;
  confidence: 'high' | 'medium' | 'low';
  description: string;       // 1-sentence blurb to help disambiguate
  photo_url: string | null;  // null only in the all-dropped fallback case
  photo_attribution_url: string | null; // Wikipedia article URL, for credit link
}
```
`UserPlant` gets `photo_attribution_url: string | null` added alongside `photo_url`. The existing `PlantIdentification` shape (full care detail) is unchanged.

### 2. `POST /api/identify/candidates` (new route)

Sibling to existing `src/app/api/identify/route.ts`.

**Request:** `{ description: string, geoCoords?: { lat, lng } | null }`

**Step 1 — Claude call.** New system prompt (separate function from `buildSystemPrompt`, since the response shape differs):
> "You are a plant identification expert. Given a description, return a JSON array of the 3-5 most likely plant matches, ranked by likelihood. Each item: `common_name`, `scientific_name`, `confidence` (high/medium/low), `description` (one sentence distinguishing it from the others)."

Same `${locationContext}` suffix pattern as today's `buildSystemPrompt` (context only, not a filter). Parse with the same regex-extraction approach as the existing route, but matching `/\[[\s\S]*\]/` (array) instead of `/\{[\s\S]*\}/` (object).

**Step 2 — Wikipedia enrichment.** For each candidate, in parallel (`Promise.allSettled`), fetch `https://en.wikipedia.org/api/rest_v1/page/summary/<encoded scientific_name>`. On success, pull `thumbnail.source` as `photo_url` and `content_urls.desktop.page` as `photo_attribution_url`. On 404 or missing `thumbnail`, retry once with `common_name` as the title before giving up. `Promise.allSettled` ensures one failed/network-error lookup doesn't break the others.

**Step 3 — Filter + fallback.** Drop candidates with no `photo_url`. If that empties the array, return the original (unfiltered) candidate list instead, each with `photo_url: null` and `photo_attribution_url: null` — the client shows a placeholder icon for those rather than an empty screen.

**Response:** `{ candidates: PlantCandidate[] }` on success, or `{ error }` with status 500 on Claude/parse failure (mirrors the existing route's error handling).

### 3. Client flow (`src/app/identify/page.tsx`)

**Tabs:** "Upload Photo" unchanged. "Search by Name" is relabeled (e.g. "Describe It") — same `Input`, copy shifts from name-search framing to description framing (the existing helper text already nudges this way).

**New step `'candidates'`**, inserted into the existing step machine: `input → loading → candidates → loading → result → adding → done` (search/describe path). Photo-upload path is unchanged: `input → loading → result → adding → done`.

- `handleIdentify`, when `mode === 'search'`, calls `/api/identify/candidates` instead of `/api/identify`, stores the array in new state `candidates: PlantCandidate[]`, and transitions to `step: 'candidates'`.
- Photo mode keeps calling `/api/identify` directly and goes straight to `'result'`, exactly as today.

**Candidates screen:** a vertical list of `Card`s, each showing the Wikipedia thumbnail (or a placeholder icon if `photo_url` is null) in a fixed-size square, `common_name` + italic `scientific_name`, confidence `Badge`, and the one-sentence blurb. Tapping a card calls new `handleSelectCandidate(candidate)`:
1. Sets `step: 'loading'`.
2. Calls the existing `/api/identify` with `{ searchText: candidate.scientific_name, geoCoords }` — reusing today's route unmodified, now disambiguated by the precise scientific name.
3. Stores the resulting `PlantIdentification` plus `candidate.photo_url` / `candidate.photo_attribution_url` in new state (`selectedPhotoUrl`, `selectedPhotoAttribution`).
4. Transitions to `step: 'result'`.
5. On failure, sets the error banner and returns to `step: 'candidates'` (not `'input'`), so the candidate list isn't lost.

**Result screen changes:** in search mode, also renders `selectedPhotoUrl` (with a "Photo via Wikipedia" link using `selectedPhotoAttribution`) in the same image slot photo-mode uses for `imagePreview`. A "← back to results" control (search mode only) returns to `step: 'candidates'` without re-calling the candidates API.

**`handleAddPlant` changes:** `photo_url` becomes `mode === 'photo' ? imagePreview : selectedPhotoUrl`; a new field `photo_attribution_url: mode === 'search' ? selectedPhotoAttribution : null` is added to the POST body.

**`handleReset`** additionally clears `candidates`, `selectedPhotoUrl`, `selectedPhotoAttribution`.

### 4. Persistence & attribution display

**`src/app/api/plants/route.ts` POST handler:** add `photo_attribution_url: body.photo_attribution_url || null` to the insert, alongside the existing `photo_url: body.photo_url` passthrough.

**Display component** (`src/components/PhotoAttribution.tsx`): renders a small `<a>` ("Photo via Wikipedia") linking to the stored `photo_attribution_url`, shown only when that field is set.
- Used in `src/app/plants/[id]/page.tsx`, under the hero photo block.
- Not used in `PlantCard.tsx` — the card is too small for a credit line, and Wikimedia's attribution requirement is satisfied at the detail page (the full-size image's display context), which the card always links through to.

## Error handling & edge cases

- **Claude returns malformed/non-array JSON** in `/api/identify/candidates`: caught by the route's `try/catch`, returns `{ error }` / 500; client shows the existing error banner and returns to `'input'`.
- **Wikipedia lookup fails (network error or 404)**: handled per-candidate via `Promise.allSettled`, treated as "no image found" for that candidate only — does not fail the whole request.
- **All candidates lack photos**: falls back to the unfiltered list with `photo_url: null` per candidate (Section 2, Step 3); UI shows placeholder icons.
- **Follow-up `/api/identify` call fails after candidate selection**: error banner shown, `step` returns to `'candidates'` so the user can retry or pick a different candidate.
- **Empty/whitespace description**: already guarded via the existing `disabled={!searchText.trim()}` button state — unchanged.

## Verification plan

No automated test suite exists in this repo (per `CLAUDE.md`); verification is manual against the dev server:

1. `npm run dev`, go to `/identify`, use the "Describe It" tab with a vague description (e.g. "tall plant with big shiny leaves") — confirm 3-5 candidates render with distinct photos and confidence badges.
2. Try an obscure/fictional description to exercise the "no photos found" fallback — confirm placeholder icons appear instead of a blank screen.
3. Pick a candidate — confirm the loading step runs once, the result screen shows the chosen photo + Wikipedia attribution link, and care info matches that specific species.
4. Add the plant — confirm `photo_url` and `photo_attribution_url` persist (detail page renders the credit link; dashboard card shows the photo).
5. Confirm "Upload Photo" mode is unaffected — still single-result, no candidates step, no attribution link.
6. `npm run lint` and `npm run build` to catch type errors from the new `PlantCandidate` type and route.
