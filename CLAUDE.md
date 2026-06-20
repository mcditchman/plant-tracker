# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does
Plant Tracker — a Next.js app for tracking houseplants and their care schedules. Users add plants by uploading a photo or searching by name; Claude (via the Anthropic SDK) identifies the plant and generates care requirements (light, water, humidity, temperature, soil, fertilizer) and a watering/fertilizing cadence. The app then tracks watering/fertilizing history and surfaces an upcoming care schedule.

## Stack
- Next.js 16 (App Router) on Vercel
- Supabase (Postgres + Auth + Storage), accessed via `@supabase/ssr`
- Anthropic SDK (`@anthropic-ai/sdk`) for plant identification — calls `claude-sonnet-4-6`
- shadcn/ui components (style: `base-nova`) + Tailwind CSS v4
- TypeScript

## ⚠️ This is not the Next.js you know
This repo pins Next.js 16, which has breaking changes vs. older Next.js versions you may know from training data. Before writing routing, caching, or config code, check the docs vendored in `node_modules/next/dist/docs/` and heed deprecation notices rather than assuming older conventions still apply.

## Commands
- `npm run dev` — start Next.js dev server (localhost:3000, Turbopack)
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint (flat config, `eslint-config-next`)
- No test suite exists in this repo.

### Supabase / DB
- `supabase start` / `supabase stop` — local Supabase stack (requires Docker)
- `vercel env pull .env.local` — sync env vars from Vercel dashboard
- Migrations live in `supabase/migrations/`; generate new ones with `supabase db diff --use-migra -f migration_name`
- Apply to remote with `supabase db push` — never hand-edit the prod DB
- Regenerate types: `supabase gen types typescript --local > src/types/database.types.ts` (note: `src/types/index.ts`, the hand-written domain types actually used by the app, is separate and not generated)

**Note:** in this dev environment, `.env.local` points to the real remote Supabase project, not a local stack — `supabase start` is not actually in use. Treat auth/data testing here as touching production: don't create test accounts/data without checking with the user first.

### Env vars (see `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`

## Architecture

### Auth gate
`src/middleware.ts` runs on every request (matcher excludes static assets) and redirects unauthenticated users to `/login`, except for `/login` and `/api/auth/*` themselves. Session state comes from Supabase cookies via `createServerClient`. There are two separate Supabase client factories:
- `src/lib/supabase/server.ts` — for server components and route handlers (cookie-based, async)
- `src/lib/supabase/client.ts` — for client components only

Every page and API route additionally re-checks `supabase.auth.getUser()` and scopes queries with `.eq('user_id', user.id)` — middleware is a redirect convenience, not the sole authorization boundary. Row Level Security policies in `supabase/migrations/20260616000000_init.sql` are the actual enforcement layer (policies key off `auth.uid() = user_id`, with `care_logs` authorized transitively through its parent `user_plants` row).

### Data model
Two tables, defined in `supabase/migrations/20260616000000_init.sql` and mirrored by hand in `src/types/index.ts`:
- `user_plants` — one row per plant a user owns. Stores AI-identified metadata (`common_name`, `scientific_name`, `difficulty`, `care_*` fields, `care_tips`) plus tracking fields (`last_watered_at`, `next_watering_at`, `last_fertilized_at`, `watering_frequency_days`, `fertilize_frequency_days`).
- `care_logs` — append-only history of care actions (`water` | `fertilize` | `prune` | `repot` | `mist` | `other`) per plant.

`next_watering_at` is computed and stored on `user_plants` whenever a plant is created or watered (see `src/app/api/plants/route.ts` and `src/app/api/plants/[id]/water/route.ts`); it is not derived on read. Fertilizing has no equivalent stored "next" field — `src/app/schedule/page.tsx` recomputes the next fertilize date on every render from `last_fertilized_at` (or `date_added` if never fertilized) + `fertilize_frequency_days`. Keep this asymmetry in mind when changing scheduling logic: watering schedule changes need a write; fertilizing schedule changes are read-time only.

### Identification flow (the AI integration)
`src/app/identify/page.tsx` (client component) drives a multi-step wizard (`input → loading → result → adding → done`):
1. Client resizes uploaded images to a 1024px max dimension on `<canvas>` before sending (keeps API payloads/tokens small), and opportunistically requests browser geolocation to pass along as context.
2. `POST /api/identify` (`src/app/api/identify/route.ts`) sends the image (or search text) plus a system prompt to Claude, requesting strict JSON matching the `PlantIdentification` shape in `src/types/index.ts`. The route does a regex extraction (`/\{[\s\S]*\}/`) to strip any markdown fences before `JSON.parse`.
3. On confirmation, `POST /api/plants` persists the identification result into `user_plants`, computing `next_watering_at` at insert time.

If you change the `PlantIdentification` JSON shape, update three places in lockstep: the system prompt in `identify/route.ts`, the `PlantIdentification` type in `src/types/index.ts`, and the insert mapping in `src/app/api/plants/route.ts`.

### Route structure
- `src/app/page.tsx` — dashboard (plant list, sorted by soonest `next_watering_at`, with an overdue-water banner)
- `src/app/schedule/page.tsx` — combined water + fertilize timeline across all plants, grouped into Overdue/Today/Tomorrow/This Week/Later
- `src/app/plants/[id]/page.tsx` — single plant detail: care guide, watering status, care history, water/log-care/delete actions
- `src/app/identify/page.tsx` — add-plant wizard described above
- `src/app/login/page.tsx` + `src/app/api/auth/{login,signup,logout}/route.ts` — auth
- API routes under `src/app/api/plants/` are the only data-mutation surface; pages are server components that read directly via the Supabase server client.

### UI components
shadcn/ui primitives live in `src/components/ui/` (generated via `components.json` config — base color `neutral`, icon library `lucide`). Domain components (`PlantCard`, `WaterButton`, `CareLogButton`, `DeletePlantButton`, `Navigation`) are hand-written client components that call the `/api/plants/*` routes directly with `fetch` and then `router.refresh()`.

shadcn was initialized with `--base base-ui` (not Radix): compose with the `render` prop, not `asChild` — e.g. `<Button render={<Link href="/x" />}>text</Button>`. base-ui's `Button` defaults `nativeButton={true}`; when `render`-ing a non-`<button>` element (like `Link`), also pass `nativeButton={false}` or it throws a console warning on every render (only visible at runtime, not caught by `npm run build`).

## Environment notes (Windows)
- `vercel` and `supabase` CLIs are both installed and on PATH (`vercel --version`, `supabase --version`) — use them directly rather than assuming they're missing or reaching for `npx`.
- `git add`/`commit` print `LF will be replaced by CRLF` for every text file — harmless (no `.gitattributes`), not an error.
- The Bash tool's `/tmp` resolves to `%LOCALAPPDATA%\Temp`, but a leading `/tmp/...` path passed to a Node.js script resolves against the current drive root instead (e.g. `C:\tmp\...`) — they are different directories. Use explicit Windows paths in any script whose output Claude needs to read back.
