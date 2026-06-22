# Season Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-generated seasonal-events timeline (bloom / growth-dormancy / pruning-repotting) shown per-plant on the plant detail page and as a multi-plant comparison board on the dashboard.

**Architecture:** Two new nullable columns on `user_plants` (`hemisphere`, `seasonal_events` jsonb) store AI-generated seasonal data. New plants get this data from an extended `/api/identify` prompt; existing plants get it lazily backfilled via a new `POST /api/plants/[id]/seasonal` route, triggered by an invisible client component on first view of the plant detail page. Two presentational components (`SeasonTimeline` for one plant, `SeasonTimelineBoard` for all plants) render a shared Sep→Aug month grid grouped into 4 colored season bands, with a tab selector to switch between the three event categories.

**Tech Stack:** Next.js 16 App Router (server + client components), `@anthropic-ai/sdk`, Supabase Postgres migration, shadcn/ui `Tabs`/`Card` (`base-ui` composition).

## Global Constraints

- No automated test suite exists in this repo — verification is manual, against the running dev server (`npm run dev`), per project convention (`CLAUDE.md`).
- `.env.local` in this dev environment points at the real production Supabase project (`CLAUDE.md`) — confirm with the user before running `supabase db push`.
- Never persist raw latitude/longitude — only the derived `hemisphere` (`'northern' | 'southern'`) is stored on `user_plants` (per spec's non-goals).
- If the `PlantIdentification`/`SeasonalEvents` JSON shapes change, keep prompt, type, and consuming code in lockstep (same discipline `CLAUDE.md` calls out for `PlantIdentification`).
- shadcn was initialized with `--base base-ui`: compose with the `render` prop, not `asChild`, and pass `nativeButton={false}` on any `Button` that `render`s a non-`<button>` element. (Not triggered by this plan's new components, which use `Tabs`/`Card`/plain `<div>`/`<Link>`, but keep in mind if that changes.)
- Backfill is idempotent: the route only calls Claude if `seasonal_events IS NULL`, and the client only triggers it once per mount — repeat visits to an already-backfilled plant must not re-call Claude.

---

### Task 1: Database migration — add `hemisphere` and `seasonal_events`

**Files:**
- Create: `supabase/migrations/20260621000000_add_seasonal_events.sql`

**Interfaces:**
- Produces: `user_plants.hemisphere` (nullable `TEXT`, checked `'northern'|'southern'`) and `user_plants.seasonal_events` (nullable `JSONB`), consumed by Task 2 (`UserPlant` type), Task 4 (insert), Task 5 (backfill route), Task 7/8 (display).

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE user_plants ADD COLUMN hemisphere TEXT CHECK (hemisphere IN ('northern', 'southern'));
ALTER TABLE user_plants ADD COLUMN seasonal_events JSONB;
```

- [ ] **Step 2: Confirm with the user, then apply to the remote database**

This dev environment's `.env.local` points at the real production Supabase project. Ask the user for explicit go-ahead before running:

```bash
supabase db push
```

- [ ] **Step 3: Verify the columns were added**

Use the `mcp__plugin_supabase_supabase__list_tables` tool (project ref `uenqzppfwjxprdsxbnuy`) and confirm `user_plants` now lists a `hemisphere` column (type `text`, nullable) and a `seasonal_events` column (type `jsonb`, nullable).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260621000000_add_seasonal_events.sql
git commit -m "Add hemisphere and seasonal_events columns to user_plants"
```

---

### Task 2: Types — `Hemisphere`, `SeasonalEvents`, and field additions

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Hemisphere` type, `SeasonalEvents` interface, `UserPlant.hemisphere`/`UserPlant.seasonal_events`, `PlantIdentification.seasonal` — consumed by every later task.

- [ ] **Step 1: Add `Hemisphere` type and `SeasonalEvents` interface**

`src/types/index.ts` currently starts:

```ts
export type Difficulty = 'easy' | 'moderate' | 'hard';
export type CareType = 'water' | 'fertilize' | 'prune' | 'repot' | 'mist' | 'other';

export interface UserPlant {
```

Change to:

```ts
export type Difficulty = 'easy' | 'moderate' | 'hard';
export type CareType = 'water' | 'fertilize' | 'prune' | 'repot' | 'mist' | 'other';
export type Hemisphere = 'northern' | 'southern';

export interface SeasonalEvents {
  bloom_months: number[];
  growth_months: number[];
  dormancy_months: number[];
  pruning_months: number[];
}

export interface UserPlant {
```

- [ ] **Step 2: Add `hemisphere`/`seasonal_events` to `UserPlant`**

`UserPlant` currently includes (immediately after the change above):

```ts
  watering_frequency_days: number;
  fertilize_frequency_days: number;
  care_tips: string[];
  last_watered_at: string | null;
```

Change to:

```ts
  watering_frequency_days: number;
  fertilize_frequency_days: number;
  care_tips: string[];
  hemisphere: Hemisphere | null;
  seasonal_events: SeasonalEvents | null;
  last_watered_at: string | null;
```

- [ ] **Step 3: Add `seasonal` to `PlantIdentification`**

`PlantIdentification` currently ends:

```ts
  tips: string[];
}

export interface PlantCandidate {
```

Change to:

```ts
  tips: string[];
  seasonal: SeasonalEvents;
}

export interface PlantCandidate {
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (the new fields are additive; nothing references them yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "Add Hemisphere and SeasonalEvents types"
```

---

### Task 3: Extend identify prompt to generate seasonal data

**Files:**
- Modify: `src/app/api/identify/route.ts:6-35`

**Interfaces:**
- Consumes: nothing new (response is parsed generically via the existing `JSON.parse`).
- Produces: `PlantIdentification` responses from `/api/identify` now include a `seasonal: SeasonalEvents`-shaped field, consumed by Task 4.

- [ ] **Step 1: Update `buildSystemPrompt`**

`src/app/api/identify/route.ts` currently reads:

```ts
function buildSystemPrompt(geoCoords?: { lat: number; lng: number } | null) {
  const locationContext = geoCoords
    ? `\n\nThe user is located at approximately ${geoCoords.lat.toFixed(2)}°, ${geoCoords.lng.toFixed(2)}°. Use this to tailor care advice to their local climate, seasons, humidity, and typical growing conditions.`
    : '';

  return `You are a plant identification and care expert. When given an image or plant name, return a JSON object with plant identification and care information. Always respond with valid JSON only, no markdown.${locationContext}

Response format:
{
  "identified": true,
  "common_name": "string",
  "scientific_name": "string",
  "confidence": "high" | "medium" | "low",
  "description": "2-3 sentence description of the plant",
  "difficulty": "easy" | "moderate" | "hard",
  "care": {
    "light": "string describing light needs",
    "water": "string describing watering needs",
    "watering_frequency_days": number (how many days between waterings),
    "humidity": "string",
    "temperature": "string with fahrenheit range",
    "soil": "string",
    "fertilizer": "string",
    "fertilize_frequency_days": number
  },
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"]
}

If you cannot identify the plant, set "identified": false and use "Unknown Plant" for common_name. Always return valid JSON.`;
}
```

Change to:

```ts
function buildSystemPrompt(geoCoords?: { lat: number; lng: number } | null) {
  const locationContext = geoCoords
    ? `\n\nThe user is located at approximately ${geoCoords.lat.toFixed(2)}°, ${geoCoords.lng.toFixed(2)}°. Use this to tailor care advice to their local climate, seasons, humidity, and typical growing conditions. This is in the ${geoCoords.lat >= 0 ? 'Northern' : 'Southern'} hemisphere — return all "seasonal" months below adjusted for this hemisphere (e.g. a spring bloomer in the Southern hemisphere blooms Sep-Nov, not Mar-May).`
    : '\n\nNo location was provided — assume the Northern hemisphere for the "seasonal" months below.';

  return `You are a plant identification and care expert. When given an image or plant name, return a JSON object with plant identification and care information. Always respond with valid JSON only, no markdown.${locationContext}

Response format:
{
  "identified": true,
  "common_name": "string",
  "scientific_name": "string",
  "confidence": "high" | "medium" | "low",
  "description": "2-3 sentence description of the plant",
  "difficulty": "easy" | "moderate" | "hard",
  "care": {
    "light": "string describing light needs",
    "water": "string describing watering needs",
    "watering_frequency_days": number (how many days between waterings),
    "humidity": "string",
    "temperature": "string with fahrenheit range",
    "soil": "string",
    "fertilizer": "string",
    "fertilize_frequency_days": number
  },
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
  "seasonal": {
    "bloom_months": [numbers 1-12, empty array if non-flowering or no notable bloom],
    "growth_months": [numbers 1-12, months of active growth],
    "dormancy_months": [numbers 1-12, months of dormancy/reduced growth, empty array if it grows steadily year-round],
    "pruning_months": [numbers 1-12, best months to prune or repot]
  }
}

If you cannot identify the plant, set "identified": false and use "Unknown Plant" for common_name. Always return valid JSON.`;
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/identify/route.ts
git commit -m "Generate seasonal bloom/growth/pruning data during identification"
```

---

### Task 4: Persist seasonal data and hemisphere on plant creation

**Files:**
- Modify: `src/app/api/plants/route.ts:29-51`
- Modify: `src/app/identify/page.tsx` (the `handleAddPlant` POST body)

**Interfaces:**
- Consumes: `body.seasonal` (from Task 3's extended `/api/identify` response, spread into the add-plant POST body), `body.geoCoords` (already in client state).
- Produces: inserted `user_plants` rows now include `seasonal_events` and `hemisphere`.

- [ ] **Step 1: Add the fields to the insert**

`src/app/api/plants/route.ts`'s insert currently reads:

```ts
    .insert({
      user_id: user.id,
      common_name: body.common_name,
      scientific_name: body.scientific_name,
      nickname: body.nickname,
      photo_url: body.photo_url,
      photo_attribution_url: body.photo_attribution_url || null,
      location: body.location,
      description: body.description,
      difficulty: body.difficulty,
      care_light: body.care?.light,
      care_water: body.care?.water,
      care_humidity: body.care?.humidity,
      care_temperature: body.care?.temperature,
      care_soil: body.care?.soil,
      care_fertilizer: body.care?.fertilizer,
      watering_frequency_days: body.care?.watering_frequency_days || body.watering_frequency_days || 7,
      fertilize_frequency_days: body.care?.fertilize_frequency_days || body.fertilize_frequency_days || 30,
      care_tips: body.tips || [],
      next_watering_at: nextWatering.toISOString(),
    })
```

Change to:

```ts
    .insert({
      user_id: user.id,
      common_name: body.common_name,
      scientific_name: body.scientific_name,
      nickname: body.nickname,
      photo_url: body.photo_url,
      photo_attribution_url: body.photo_attribution_url || null,
      location: body.location,
      description: body.description,
      difficulty: body.difficulty,
      care_light: body.care?.light,
      care_water: body.care?.water,
      care_humidity: body.care?.humidity,
      care_temperature: body.care?.temperature,
      care_soil: body.care?.soil,
      care_fertilizer: body.care?.fertilizer,
      watering_frequency_days: body.care?.watering_frequency_days || body.watering_frequency_days || 7,
      fertilize_frequency_days: body.care?.fertilize_frequency_days || body.fertilize_frequency_days || 30,
      care_tips: body.tips || [],
      seasonal_events: body.seasonal || null,
      hemisphere: body.geoCoords ? (body.geoCoords.lat >= 0 ? 'northern' : 'southern') : null,
      next_watering_at: nextWatering.toISOString(),
    })
```

- [ ] **Step 2: Pass `geoCoords` through from the identify page**

In `src/app/identify/page.tsx`, `handleAddPlant`'s POST body currently reads:

```ts
        body: JSON.stringify({
          ...result,
          nickname: nickname || null,
          location: location || null,
          photo_url: mode === 'photo' ? imagePreview : selectedPhotoUrl,
          photo_attribution_url: mode === 'search' ? selectedPhotoAttribution : null,
        }),
```

Change to:

```ts
        body: JSON.stringify({
          ...result,
          nickname: nickname || null,
          location: location || null,
          photo_url: mode === 'photo' ? imagePreview : selectedPhotoUrl,
          photo_attribution_url: mode === 'search' ? selectedPhotoAttribution : null,
          geoCoords,
        }),
```

(`...result` already spreads `seasonal` since `PlantIdentification` now includes it from Task 2/3 — no separate field needed.)

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Functional verification (that this actually persists end-to-end) happens in Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plants/route.ts src/app/identify/page.tsx
git commit -m "Persist seasonal_events and hemisphere when creating a plant"
```

---

### Task 5: Backfill route — `POST /api/plants/[id]/seasonal`

**Files:**
- Create: `src/app/api/plants/[id]/seasonal/route.ts`

**Interfaces:**
- Consumes: `Hemisphere`, `SeasonalEvents` types (Task 2).
- Produces: `POST /api/plants/[id]/seasonal` accepting `{ hemisphere?: Hemisphere | null }`, returning `{ seasonal_events: SeasonalEvents, hemisphere: Hemisphere | null }` (200) or `{ error: string }` (401/404/500). Idempotent — returns existing data without calling Claude if already present. Consumed by Task 6.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { Hemisphere, SeasonalEvents } from '@/types';

const client = new Anthropic();

function buildSeasonalPrompt(commonName: string, scientificName: string | null, hemisphere: Hemisphere | null) {
  const hemisphereContext = hemisphere
    ? `This is in the ${hemisphere === 'northern' ? 'Northern' : 'Southern'} hemisphere — return months adjusted for this hemisphere.`
    : 'No hemisphere was provided — assume the Northern hemisphere.';

  return `You are a plant care expert. Given a plant, return only its seasonal event months as JSON. Always respond with valid JSON only, no markdown. ${hemisphereContext}

Plant: ${commonName}${scientificName ? ` (${scientificName})` : ''}

Response format:
{
  "bloom_months": [numbers 1-12, empty array if non-flowering or no notable bloom],
  "growth_months": [numbers 1-12, months of active growth],
  "dormancy_months": [numbers 1-12, months of dormancy/reduced growth, empty array if it grows steadily year-round],
  "pruning_months": [numbers 1-12, best months to prune or repot]
}

Return valid JSON only.`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: plant, error: fetchError } = await supabase
    .from('user_plants')
    .select('common_name, scientific_name, hemisphere, seasonal_events')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !plant) return NextResponse.json({ error: 'Plant not found' }, { status: 404 });

  if (plant.seasonal_events) {
    return NextResponse.json({ seasonal_events: plant.seasonal_events, hemisphere: plant.hemisphere });
  }

  const body = await request.json().catch(() => ({}));
  const hemisphere: Hemisphere | null = plant.hemisphere || body.hemisphere || null;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: buildSeasonalPrompt(plant.common_name, plant.scientific_name, hemisphere),
      messages: [{ role: 'user', content: 'Return the seasonal JSON only.' }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const seasonal: SeasonalEvents = JSON.parse(jsonMatch[0]);

    const { data: updated, error: updateError } = await supabase
      .from('user_plants')
      .update({
        seasonal_events: seasonal,
        hemisphere,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('seasonal_events, hemisphere')
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Seasonal backfill error:', error);
    return NextResponse.json({ error: 'Failed to generate seasonal data' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

Note: this route sits behind the auth middleware (`src/middleware.ts`), so it can't be exercised with a bare `curl`. Full functional verification happens in Task 6/9, once it's called from an authenticated browser session.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/plants/\[id\]/seasonal/route.ts
git commit -m "Add /api/plants/[id]/seasonal backfill route"
```

---

### Task 6: `SeasonalDataLoader` client component

**Files:**
- Create: `src/components/SeasonalDataLoader.tsx`
- Modify: `src/app/plants/[id]/page.tsx:1-11,71-75`

**Interfaces:**
- Consumes: `POST /api/plants/[id]/seasonal` (Task 5).
- Produces: `SeasonalDataLoader({ plantId, hasSeasonalData }: { plantId: string; hasSeasonalData: boolean })` — renders nothing; on mount, if `!hasSeasonalData`, best-effort geolocation then triggers backfill and refreshes the page.

- [ ] **Step 1: Write the component**

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function SeasonalDataLoader({ plantId, hasSeasonalData }: { plantId: string; hasSeasonalData: boolean }) {
  const router = useRouter();
  const triggered = useRef(false);

  useEffect(() => {
    if (hasSeasonalData || triggered.current) return;
    triggered.current = true;

    function backfill(hemisphere: 'northern' | 'southern' | null) {
      fetch(`/api/plants/${plantId}/seasonal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hemisphere }),
      })
        .then(() => router.refresh())
        .catch(() => { /* silently ignore; retried on next visit */ });
    }

    if (!navigator.geolocation) {
      backfill(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => backfill(pos.coords.latitude >= 0 ? 'northern' : 'southern'),
      () => backfill(null)
    );
  }, [plantId, hasSeasonalData, router]);

  return null;
}
```

- [ ] **Step 2: Mount it on the plant detail page**

`src/app/plants/[id]/page.tsx` currently imports (lines 1-11):

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { UserPlant, CareLog } from '@/types';
import WaterButton from '@/components/WaterButton';
import CareLogButton from '@/components/CareLogButton';
import DeletePlantButton from '@/components/DeletePlantButton';
import PhotoAttribution from '@/components/PhotoAttribution';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
```

Add an import after `PhotoAttribution`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { UserPlant, CareLog } from '@/types';
import WaterButton from '@/components/WaterButton';
import CareLogButton from '@/components/CareLogButton';
import DeletePlantButton from '@/components/DeletePlantButton';
import PhotoAttribution from '@/components/PhotoAttribution';
import SeasonalDataLoader from '@/components/SeasonalDataLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
```

The page body currently opens (lines 71-75):

```tsx
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">← Back</Link>
      </div>
```

Change to:

```tsx
  return (
    <div className="space-y-4">
      <SeasonalDataLoader plantId={plant.id} hasSeasonalData={!!plant.seasonal_events} />
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">← Back</Link>
      </div>
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/SeasonalDataLoader.tsx src/app/plants/\[id\]/page.tsx
git commit -m "Add SeasonalDataLoader to lazily backfill seasonal data"
```

---

### Task 7: `SeasonTimeline` component (single plant)

**Files:**
- Create: `src/components/SeasonTimeline.tsx`
- Modify: `src/app/plants/[id]/page.tsx:8-9,190-195`

**Interfaces:**
- Consumes: `SeasonalEvents`, `Hemisphere` types (Task 2).
- Produces: `SeasonTimeline({ events, hemisphere }: { events: SeasonalEvents | null; hemisphere: Hemisphere | null })`, rendered on the plant detail page.

- [ ] **Step 1: Write the component**

```tsx
'use client';
import { useState } from 'react';
import { SeasonalEvents, Hemisphere } from '@/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

type Category = 'bloom' | 'growth' | 'pruning';

const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

const NORTHERN_BANDS = [
  { name: 'Fall', emoji: '🍂', color: 'bg-orange-400' },
  { name: 'Winter', emoji: '❄️', color: 'bg-cyan-400' },
  { name: 'Spring', emoji: '🌱', color: 'bg-green-400' },
  { name: 'Summer', emoji: '☀️', color: 'bg-yellow-400' },
];

const SOUTHERN_BANDS = [
  { name: 'Spring', emoji: '🌱', color: 'bg-green-400' },
  { name: 'Summer', emoji: '☀️', color: 'bg-yellow-400' },
  { name: 'Fall', emoji: '🍂', color: 'bg-orange-400' },
  { name: 'Winter', emoji: '❄️', color: 'bg-cyan-400' },
];

function getSeasonBands(hemisphere: Hemisphere | null) {
  return hemisphere === 'southern' ? SOUTHERN_BANDS : NORTHERN_BANDS;
}

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'bloom', label: 'Bloom', icon: '🌸' },
  { key: 'growth', label: 'Growth Cycle', icon: '🌿' },
  { key: 'pruning', label: 'Pruning & Repotting', icon: '✂️' },
];

const EMPTY_MESSAGES: Record<Category, string> = {
  bloom: 'No notable blooming period for this plant.',
  growth: 'Grows steadily year-round, no dormant period.',
  pruning: 'No specific pruning window — prune as needed.',
};

function isCategoryEmpty(category: Category, events: SeasonalEvents): boolean {
  if (category === 'bloom') return events.bloom_months.length === 0;
  if (category === 'pruning') return events.pruning_months.length === 0;
  return events.growth_months.length === 0 && events.dormancy_months.length === 0;
}

export default function SeasonTimeline({ events, hemisphere }: { events: SeasonalEvents | null; hemisphere: Hemisphere | null }) {
  const [category, setCategory] = useState<Category>('bloom');
  const currentMonth = new Date().getMonth() + 1;
  const bands = getSeasonBands(hemisphere);

  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold text-foreground mb-3">Season</h2>
        <Tabs value={category} onValueChange={v => setCategory(v as Category)}>
          <TabsList className="w-full mb-4">
            {CATEGORIES.map(c => (
              <TabsTrigger key={c.key} value={c.key} className="flex-1">{c.icon} {c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {!events ? (
          <div className="h-24 rounded-xl bg-muted animate-pulse" />
        ) : (
          <div>
            <div className="grid grid-cols-12 gap-px text-center">
              {bands.map((band, bandIndex) => (
                <div key={bandIndex} className={`col-span-3 ${band.color} text-white text-xs font-medium py-1.5 rounded-sm`}>
                  {band.name} {band.emoji}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-12 gap-px text-center mt-1">
              {MONTH_ORDER.map((month, i) => (
                <div
                  key={month}
                  className={`text-xs py-1 ${month === currentMonth ? 'ring-2 ring-primary rounded-sm' : ''}`}
                >
                  {MONTH_LABELS[i]}
                </div>
              ))}
            </div>
            {isCategoryEmpty(category, events) ? (
              <p className="text-sm text-muted-foreground mt-3">{EMPTY_MESSAGES[category]}</p>
            ) : (
              <div className="grid grid-cols-12 gap-px mt-1">
                {MONTH_ORDER.map(month => (
                  <div key={month} className="bg-muted/50 rounded-sm py-2 flex items-center justify-center">
                    {category === 'bloom' && events.bloom_months.includes(month) && <span title="Flowering">🌸</span>}
                    {category === 'growth' && events.growth_months.includes(month) && <span title="Active growth">🌿</span>}
                    {category === 'growth' && events.dormancy_months.includes(month) && <span title="Dormant">❄️</span>}
                    {category === 'pruning' && events.pruning_months.includes(month) && <span title="Best time to prune/repot">✂️</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the plant detail page**

`src/app/plants/[id]/page.tsx` imports (after Task 6's change) currently include:

```tsx
import PhotoAttribution from '@/components/PhotoAttribution';
import SeasonalDataLoader from '@/components/SeasonalDataLoader';
import { Card, CardContent } from '@/components/ui/card';
```

Change to:

```tsx
import PhotoAttribution from '@/components/PhotoAttribution';
import SeasonalDataLoader from '@/components/SeasonalDataLoader';
import SeasonTimeline from '@/components/SeasonTimeline';
import { Card, CardContent } from '@/components/ui/card';
```

The Care Guide card currently ends, immediately followed by the Tips section:

```tsx
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      {plant.care_tips && plant.care_tips.length > 0 && (
```

Change to:

```tsx
          </div>
        </CardContent>
      </Card>

      <SeasonTimeline events={plant.seasonal_events} hemisphere={plant.hemisphere} />

      {/* Tips */}
      {plant.care_tips && plant.care_tips.length > 0 && (
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manually verify in the browser**

```bash
npm run dev
```

Open any existing plant's detail page (`/plants/[id]`). Confirm:
- A "Season" card appears below Care Guide, above Tips, with 3 tabs.
- If the plant has no `seasonal_events` yet, it briefly shows a skeleton, then populates (Task 6's backfill firing).
- Switching tabs changes the highlighted months; the current month has a ring outline regardless of tab.

- [ ] **Step 5: Commit**

```bash
git add src/components/SeasonTimeline.tsx src/app/plants/\[id\]/page.tsx
git commit -m "Add SeasonTimeline component to plant detail page"
```

---

### Task 8: `SeasonTimelineBoard` component (dashboard)

**Files:**
- Create: `src/components/SeasonTimelineBoard.tsx`
- Modify: `src/app/page.tsx:1-7,49-59`

**Interfaces:**
- Consumes: `UserPlant` type (Task 2).
- Produces: `SeasonTimelineBoard({ plants }: { plants: UserPlant[] })`, rendered on the dashboard.

- [ ] **Step 1: Write the component**

```tsx
'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { UserPlant } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Category = 'bloom' | 'growth' | 'pruning';

const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

const NORTHERN_BANDS = [
  { name: 'Fall', color: 'bg-orange-400' },
  { name: 'Winter', color: 'bg-cyan-400' },
  { name: 'Spring', color: 'bg-green-400' },
  { name: 'Summer', color: 'bg-yellow-400' },
];

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'bloom', label: 'Bloom', icon: '🌸' },
  { key: 'growth', label: 'Growth Cycle', icon: '🌿' },
  { key: 'pruning', label: 'Pruning & Repotting', icon: '✂️' },
];

function plantHasCategory(plant: UserPlant, category: Category): boolean {
  const events = plant.seasonal_events;
  if (!events) return false;
  if (category === 'bloom') return events.bloom_months.length > 0;
  if (category === 'pruning') return events.pruning_months.length > 0;
  return events.growth_months.length > 0 || events.dormancy_months.length > 0;
}

export default function SeasonTimelineBoard({ plants }: { plants: UserPlant[] }) {
  const [category, setCategory] = useState<Category>('bloom');
  const currentMonth = new Date().getMonth() + 1;
  const qualifyingPlants = plants.filter(p => plantHasCategory(p, category));

  return (
    <Card className="mb-6">
      <CardContent>
        <h2 className="font-semibold text-foreground mb-3">Season Overview</h2>
        <Tabs value={category} onValueChange={v => setCategory(v as Category)}>
          <TabsList className="w-full mb-4">
            {CATEGORIES.map(c => (
              <TabsTrigger key={c.key} value={c.key} className="flex-1">{c.icon} {c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-2 items-center">
          <div />
          <div className="grid grid-cols-12 gap-px text-center">
            {NORTHERN_BANDS.map((band, i) => (
              <div key={i} className={`col-span-3 ${band.color} text-white text-xs font-medium py-1 rounded-sm`}>
                {band.name}
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">Plant</div>
          <div className="grid grid-cols-12 gap-px text-center">
            {MONTH_ORDER.map((month, i) => (
              <div key={month} className={`text-[10px] py-1 ${month === currentMonth ? 'ring-2 ring-primary rounded-sm' : ''}`}>
                {MONTH_LABELS[i]}
              </div>
            ))}
          </div>

          {qualifyingPlants.map(plant => {
            const events = plant.seasonal_events!;
            return (
              <Fragment key={plant.id}>
                <Link href={`/plants/${plant.id}`} className="text-xs font-medium text-foreground truncate hover:underline">
                  {plant.nickname || plant.common_name}
                </Link>
                <div className="grid grid-cols-12 gap-px">
                  {MONTH_ORDER.map(month => {
                    const isGrowth = category === 'growth' && events.growth_months.includes(month);
                    const isDormant = category === 'growth' && events.dormancy_months.includes(month) && !isGrowth;
                    const active = category === 'bloom'
                      ? events.bloom_months.includes(month)
                      : category === 'pruning'
                        ? events.pruning_months.includes(month)
                        : isGrowth || isDormant;
                    return (
                      <div
                        key={month}
                        className={`h-6 rounded-sm ${active ? (isDormant ? 'bg-slate-300' : 'bg-primary/60') : 'bg-muted/40'}`}
                      />
                    );
                  })}
                </div>
              </Fragment>
            );
          })}
        </div>

        {qualifyingPlants.length === 0 && (
          <p className="text-sm text-muted-foreground mt-3">No plants have data for this category yet — visit a plant&apos;s page to generate it.</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the dashboard**

`src/app/page.tsx` currently imports:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import PlantCard from '@/components/PlantCard';
import { UserPlant } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
```

Change to:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import PlantCard from '@/components/PlantCard';
import SeasonTimelineBoard from '@/components/SeasonTimelineBoard';
import { UserPlant } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
```

The page body currently reads:

```tsx
      {needsWater.length > 0 && (
        <Card className="bg-blue-50 mb-6">
          <CardContent>
            <p className="text-blue-800 font-medium text-sm">
              💧 {needsWater.length} plant{needsWater.length !== 1 ? 's' : ''} need{needsWater.length === 1 ? 's' : ''} water
            </p>
          </CardContent>
        </Card>
      )}

      {plantList.length === 0 ? (
```

Change to:

```tsx
      {needsWater.length > 0 && (
        <Card className="bg-blue-50 mb-6">
          <CardContent>
            <p className="text-blue-800 font-medium text-sm">
              💧 {needsWater.length} plant{needsWater.length !== 1 ? 's' : ''} need{needsWater.length === 1 ? 's' : ''} water
            </p>
          </CardContent>
        </Card>
      )}

      {plantList.length > 0 && <SeasonTimelineBoard plants={plantList} />}

      {plantList.length === 0 ? (
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manually verify in the browser**

```bash
npm run dev
```

Open the dashboard (`/`) with at least 2-3 plants that have seasonal data (visit each plant's detail page first if needed, to trigger backfill). Confirm:
- "Season Overview" card appears below the water banner, above the plant list.
- Switching tabs changes which plants are listed and which months are highlighted.
- Plant name links navigate to that plant's detail page.
- If a category has zero qualifying plants, the empty-state message appears instead of a blank board.

- [ ] **Step 5: Commit**

```bash
git add src/components/SeasonTimelineBoard.tsx src/app/page.tsx
git commit -m "Add SeasonTimelineBoard to dashboard"
```

---

### Task 9: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-8.

- [ ] **Step 1: New plant gets seasonal data at identify-time**

```bash
npm run dev
```

With browser geolocation allowed, identify a flowering plant (e.g. search "African violet") and add it. Confirm in Supabase (via `mcp__plugin_supabase_supabase__execute_sql` on project `uenqzppfwjxprdsxbnuy`, `select hemisphere, seasonal_events from user_plants where id = '<new id>'`) that both columns are populated and `hemisphere` matches the test location.

- [ ] **Step 2: Existing plant gets lazily backfilled**

Pick a plant created before this feature (`seasonal_events IS NULL`). Open its detail page — confirm the Season card starts as a skeleton, then populates after one backfill call. Reload the page again and confirm (via server logs) no second Claude call fires.

- [ ] **Step 3: Tab switching and hemisphere labels**

On a plant's detail page, switch between Bloom / Growth Cycle / Pruning & Repotting — confirm correct months highlight for each, the season band labels match the test hemisphere, and the current month has a visible ring.

- [ ] **Step 4: Empty-category messaging**

Identify a foliage-only plant unlikely to have a notable bloom period (e.g. a snake plant). On its Season card's Bloom tab, confirm the "No notable blooming period for this plant." message appears instead of a blank grid.

- [ ] **Step 5: Dashboard alignment across plants**

With 2+ plants having seasonal data, open the dashboard and confirm rows align under the correct month columns across all three tabs, and that the plant list per tab updates correctly when switching.

- [ ] **Step 6: Full build check**

```bash
npm run lint
npm run build
```

Expected: both pass with no errors.

- [ ] **Step 7: Final commit (if any cleanup was needed)**

If Steps 1-6 required no code changes, no commit is needed — the feature is complete as of Task 8's commit. If any fixes were made during verification, commit them:

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
```
