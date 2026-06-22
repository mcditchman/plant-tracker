# Multi-Candidate Plant Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-guess "Search by Name" flow in `/identify` with a description-driven flow that returns 3-5 ranked candidate plants, each with a Wikipedia photo, so the user can confirm the right species before fetching full care details and adding it to their collection.

**Architecture:** A new `POST /api/identify/candidates` route asks Claude for a ranked list of lightweight candidates, then enriches each with a photo from Wikipedia's public REST summary API. The existing `POST /api/identify` route is reused unmodified as the "fetch full care details" step once the user picks a candidate by its scientific name. A new nullable `photo_attribution_url` column persists Wikipedia credit alongside `photo_url`.

**Tech Stack:** Next.js 16 App Router route handlers, `@anthropic-ai/sdk`, Supabase Postgres migration, React client component (`src/app/identify/page.tsx`), shadcn/ui (`base-ui` composition).

## Global Constraints

- No automated test suite exists in this repo — verification is manual, against the running dev server (`npm run dev`), per project convention (`CLAUDE.md`).
- Photo-upload identification (`mode === 'photo'`) must remain completely unchanged — this plan only touches the search/description path.
- Location (`geoCoords`) is passed to Claude as context only — never used to filter/exclude candidates.
- No new external API keys — the only new external call is to Wikipedia's public, unauthenticated REST API (`en.wikipedia.org/api/rest_v1/page/summary/<title>`).
- `.env.local` in this dev environment points at the real production Supabase project (`CLAUDE.md`) — confirm with the user before running `supabase db push`.
- If `PlantIdentification`/`PlantCandidate` JSON shapes change, keep prompt, type, and consuming code in lockstep (same discipline `CLAUDE.md` already calls out for `PlantIdentification`).
- shadcn was initialized with `--base base-ui`: compose with the `render` prop, not `asChild`, and pass `nativeButton={false}` on any `Button` that `render`s a non-`<button>` element. (Not triggered by this plan's new UI, which uses plain `<button>`/`<a>` tags, but keep in mind if that changes.)

---

### Task 1: Database migration — add `photo_attribution_url`

**Files:**
- Create: `supabase/migrations/20260619000000_add_photo_attribution.sql`

**Interfaces:**
- Produces: `user_plants.photo_attribution_url` (nullable `TEXT` column), consumed by Task 2 (`UserPlant` type), Task 4 (insert), Task 5 (display).

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE user_plants ADD COLUMN photo_attribution_url TEXT;
```

- [ ] **Step 2: Confirm with the user, then apply to the remote database**

This dev environment's `.env.local` points at the real production Supabase project. Ask the user for explicit go-ahead before running:

```bash
supabase db push
```

- [ ] **Step 3: Verify the column was added**

Use the `mcp__plugin_supabase_supabase__list_tables` tool (project ref `uenqzppfwjxprdsxbnuy`) and confirm `user_plants` now lists a `photo_attribution_url` column of type `text`, nullable.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619000000_add_photo_attribution.sql
git commit -m "Add photo_attribution_url column to user_plants"
```

---

### Task 2: Types — `PlantCandidate` and `UserPlant.photo_attribution_url`

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PlantCandidate` interface and `UserPlant.photo_attribution_url: string | null`, consumed by Task 3, Task 4, Task 5, Task 6, Task 7.

- [ ] **Step 1: Add `photo_attribution_url` to `UserPlant`**

In `src/types/index.ts`, the `UserPlant` interface currently reads (lines 4-29):

```ts
export interface UserPlant {
  id: string;
  user_id: string;
  common_name: string;
  scientific_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  location: string | null;
  ...
```

Add the new field directly after `photo_url`:

```ts
export interface UserPlant {
  id: string;
  user_id: string;
  common_name: string;
  scientific_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  photo_attribution_url: string | null;
  location: string | null;
  ...
```

- [ ] **Step 2: Add the `PlantCandidate` interface**

Append after the existing `PlantIdentification` interface (end of file):

```ts

export interface PlantCandidate {
  common_name: string;
  scientific_name: string;
  confidence: 'high' | 'medium' | 'low';
  description: string;
  photo_url: string | null;
  photo_attribution_url: string | null;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (the new field/interface are additive; nothing references `photo_attribution_url` yet, so existing code is unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "Add PlantCandidate type and UserPlant.photo_attribution_url"
```

---

### Task 3: `POST /api/identify/candidates` route

**Files:**
- Create: `src/app/api/identify/candidates/route.ts`

**Interfaces:**
- Consumes: `PlantCandidate` from `src/types/index.ts` (Task 2).
- Produces: `POST /api/identify/candidates` accepting `{ description: string, geoCoords?: { lat: number; lng: number } | null }`, returning `{ candidates: PlantCandidate[] }` (200) or `{ error: string }` (400/500). Consumed by Task 6's `handleIdentify`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PlantCandidate } from '@/types';

const client = new Anthropic();

function buildCandidatesSystemPrompt(geoCoords?: { lat: number; lng: number } | null) {
  const locationContext = geoCoords
    ? `\n\nThe user is located at approximately ${geoCoords.lat.toFixed(2)}°, ${geoCoords.lng.toFixed(2)}°. Use this as light context for which plants are plausible in their climate, but do not exclude valid indoor or exotic matches just because they're uncommon locally.`
    : '';

  return `You are a plant identification expert. Given a description, return a JSON array of the 3-5 most likely plant matches, ranked by likelihood. Always respond with valid JSON only, no markdown.${locationContext}

Response format:
[
  {
    "common_name": "string",
    "scientific_name": "string",
    "confidence": "high" | "medium" | "low",
    "description": "one sentence distinguishing this plant from the others in the list"
  }
]

Return valid JSON only, no markdown fences.`;
}

interface RawCandidate {
  common_name: string;
  scientific_name: string;
  confidence: 'high' | 'medium' | 'low';
  description: string;
}

interface WikipediaSummary {
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

async function fetchWikipediaPhoto(
  title: string
): Promise<{ photo_url: string | null; photo_attribution_url: string | null }> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!res.ok) return { photo_url: null, photo_attribution_url: null };
    const data: WikipediaSummary = await res.json();
    if (!data.thumbnail?.source) return { photo_url: null, photo_attribution_url: null };
    return {
      photo_url: data.thumbnail.source,
      photo_attribution_url: data.content_urls?.desktop?.page || null,
    };
  } catch {
    return { photo_url: null, photo_attribution_url: null };
  }
}

async function enrichCandidate(raw: RawCandidate): Promise<PlantCandidate> {
  let photo = await fetchWikipediaPhoto(raw.scientific_name);
  if (!photo.photo_url) {
    photo = await fetchWikipediaPhoto(raw.common_name);
  }
  return { ...raw, ...photo };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, geoCoords } = body;

    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'Provide a description' }, { status: 400 });
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildCandidatesSystemPrompt(geoCoords),
      messages: [
        {
          role: 'user',
          content: `Identify the plant matching this description: "${description}". Return JSON only.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const rawCandidates: RawCandidate[] = JSON.parse(jsonMatch[0]);
    const settled = await Promise.allSettled(rawCandidates.map(enrichCandidate));
    const enriched: PlantCandidate[] = settled.map((result, i) =>
      result.status === 'fulfilled'
        ? result.value
        : { ...rawCandidates[i], photo_url: null, photo_attribution_url: null }
    );

    const withPhotos = enriched.filter((c) => c.photo_url);
    const candidates = withPhotos.length > 0 ? withPhotos : enriched;

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('Candidates error:', error);
    return NextResponse.json({ error: 'Failed to find plant candidates' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

Note: this route sits behind the auth middleware (`src/middleware.ts`), so it can't be exercised with a bare `curl` (unauthenticated requests get redirected to `/login`). Full functional verification happens in Task 6, once the `/identify` page calls this route from an authenticated browser session.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/identify/candidates/route.ts
git commit -m "Add /api/identify/candidates route for multi-candidate plant search"
```

---

### Task 4: Persist `photo_attribution_url` on plant creation

**Files:**
- Modify: `src/app/api/plants/route.ts:29-52`

**Interfaces:**
- Consumes: `body.photo_attribution_url` (sent by Task 7's `handleAddPlant`).
- Produces: inserted `user_plants` rows now include `photo_attribution_url`.

- [ ] **Step 1: Add the field to the insert**

In `src/app/api/plants/route.ts`, the insert object currently reads:

```ts
    .insert({
      user_id: user.id,
      common_name: body.common_name,
      scientific_name: body.scientific_name,
      nickname: body.nickname,
      photo_url: body.photo_url,
      location: body.location,
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
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Functional verification (that this value actually persists end-to-end) happens in Task 8, since it requires the full add-plant flow from Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/plants/route.ts
git commit -m "Persist photo_attribution_url when creating a plant"
```

---

### Task 5: `PhotoAttribution` component + wire into plant detail page

**Files:**
- Create: `src/components/PhotoAttribution.tsx`
- Modify: `src/app/plants/[id]/page.tsx:77-80`

**Interfaces:**
- Consumes: `UserPlant.photo_attribution_url` (Task 2).
- Produces: `PhotoAttribution({ url }: { url: string | null })` component, rendering nothing when `url` is null.

- [ ] **Step 1: Write the component**

```tsx
export default function PhotoAttribution({ url }: { url: string | null }) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground hover:underline"
    >
      Photo via Wikipedia
    </a>
  );
}
```

- [ ] **Step 2: Wire it into the plant detail page hero card**

In `src/app/plants/[id]/page.tsx`, add the import near the other component imports (after line 7):

```ts
import DeletePlantButton from '@/components/DeletePlantButton';
import PhotoAttribution from '@/components/PhotoAttribution';
```

The hero card currently reads (lines 77-80):

```tsx
      <Card>
        {plant.photo_url && (
          <img src={plant.photo_url} alt={plant.common_name} className="w-full h-52 object-cover" />
        )}
        <CardContent>
```

Change to:

```tsx
      <Card>
        {plant.photo_url && (
          <div>
            <img src={plant.photo_url} alt={plant.common_name} className="w-full h-52 object-cover" />
            <div className="px-4 pt-1">
              <PhotoAttribution url={plant.photo_attribution_url} />
            </div>
          </div>
        )}
        <CardContent>
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Visual confirmation happens in Task 8 once a plant with `photo_attribution_url` set actually exists.

- [ ] **Step 4: Commit**

```bash
git add src/components/PhotoAttribution.tsx src/app/plants/\[id\]/page.tsx
git commit -m "Add PhotoAttribution component and render it on the plant detail page"
```

---

### Task 6: Client — candidates flow (search → pick → existing result screen)

**Files:**
- Modify: `src/app/identify/page.tsx`

**Interfaces:**
- Consumes: `PlantCandidate` (Task 2), `POST /api/identify/candidates` (Task 3), existing `POST /api/identify` (unmodified).
- Produces: working `step: 'candidates'` UI; `handleSelectCandidate(candidate: PlantCandidate)`; state `candidates: PlantCandidate[]`, `selectedPhotoUrl: string | null`, `selectedPhotoAttribution: string | null` (consumed for display/persistence by Task 7).

After this task, searching by description shows a list of candidates with photos; picking one loads full care details into the existing result screen (without yet showing the candidate's photo there — that's Task 7).

- [ ] **Step 1: Update imports and add `'candidates'` step**

`src/app/identify/page.tsx` line 4 currently reads:

```ts
import { PlantIdentification } from '@/types';
```

Change to:

```ts
import { PlantIdentification, PlantCandidate } from '@/types';
```

Line 12 currently reads:

```ts
type Step = 'input' | 'loading' | 'result' | 'adding' | 'done';
```

Change to:

```ts
type Step = 'input' | 'loading' | 'candidates' | 'result' | 'adding' | 'done';
```

- [ ] **Step 2: Add `confidenceColors` map and new state**

After the existing `difficultyColors` map (lines 15-19), add:

```ts
const confidenceColors = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-red-100 text-red-700',
};
```

In the component body, after `const [result, setResult] = useState<PlantIdentification | null>(null);` (line 28), add:

```ts
  const [candidates, setCandidates] = useState<PlantCandidate[]>([]);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [selectedPhotoAttribution, setSelectedPhotoAttribution] = useState<string | null>(null);
```

- [ ] **Step 3: Branch `handleIdentify` on mode, add `handleSelectCandidate`**

The existing `handleIdentify` (lines 69-92) currently reads:

```ts
  async function handleIdentify() {
    setError('');
    setStep('loading');

    try {
      const body = mode === 'photo'
        ? { imageBase64, imageType, geoCoords }
        : { searchText, geoCoords };

      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to identify plant');
      const data = await res.json();
      setResult(data);
      setStep('result');
    } catch {
      setError('Could not identify plant. Please try again.');
      setStep('input');
    }
  }
```

Replace with:

```ts
  async function handleIdentify() {
    setError('');
    setStep('loading');

    try {
      if (mode === 'search') {
        const res = await fetch('/api/identify/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: searchText, geoCoords }),
        });

        if (!res.ok) throw new Error('Failed to find candidates');
        const data = await res.json();
        setCandidates(data.candidates);
        setStep('candidates');
        return;
      }

      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, imageType, geoCoords }),
      });

      if (!res.ok) throw new Error('Failed to identify plant');
      const data = await res.json();
      setResult(data);
      setStep('result');
    } catch {
      setError('Could not identify plant. Please try again.');
      setStep('input');
    }
  }

  async function handleSelectCandidate(candidate: PlantCandidate) {
    setError('');
    setStep('loading');

    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchText: candidate.scientific_name, geoCoords }),
      });

      if (!res.ok) throw new Error('Failed to load plant details');
      const data = await res.json();
      setResult(data);
      setSelectedPhotoUrl(candidate.photo_url);
      setSelectedPhotoAttribution(candidate.photo_attribution_url);
      setStep('result');
    } catch {
      setError('Could not load plant details. Please try again.');
      setStep('candidates');
    }
  }
```

- [ ] **Step 4: Clear new state in `handleReset`**

`handleReset` (lines 120-129) currently reads:

```ts
  function handleReset() {
    setStep('input');
    setResult(null);
    setError('');
    setImagePreview(null);
    setImageBase64(null);
    setSearchText('');
    setNickname('');
    setLocation('');
  }
```

Add the three new clears:

```ts
  function handleReset() {
    setStep('input');
    setResult(null);
    setError('');
    setImagePreview(null);
    setImageBase64(null);
    setSearchText('');
    setNickname('');
    setLocation('');
    setCandidates([]);
    setSelectedPhotoUrl(null);
    setSelectedPhotoAttribution(null);
  }
```

- [ ] **Step 5: Update copy and labels for the description-driven framing**

Line 134 currently reads:

```tsx
      <p className="text-muted-foreground text-sm mb-6">Take a photo or search by name — AI will identify it and set up a care schedule</p>
```

Change to:

```tsx
      <p className="text-muted-foreground text-sm mb-6">Take a photo or describe it — AI will show you matching options and set up a care schedule</p>
```

Line 141 currently reads:

```tsx
            <TabsTrigger value="search" className="flex-1">🔍 Search by Name</TabsTrigger>
```

Change to:

```tsx
            <TabsTrigger value="search" className="flex-1">📝 Describe It</TabsTrigger>
```

Lines 182-190 currently read:

```tsx
              <Input
                type="text"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); if (e.target.value.length === 1) requestGeolocation(); }}
                onKeyDown={e => e.key === 'Enter' && searchText.trim() && handleIdentify()}
                placeholder="e.g. 'monstera', 'snake plant', 'that spiky cactus'"
              />
              <p className="text-xs text-muted-foreground mt-2">Don&apos;t know the name? Try describing it — &quot;tall plant with big leaves&quot; works too!</p>
```

Change the placeholder and helper text to:

```tsx
              <Input
                type="text"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); if (e.target.value.length === 1) requestGeolocation(); }}
                onKeyDown={e => e.key === 'Enter' && searchText.trim() && handleIdentify()}
                placeholder="e.g. 'monstera', 'tall plant with big shiny leaves', 'that spiky cactus'"
              />
              <p className="text-xs text-muted-foreground mt-2">Describe what you see — name, shape, leaves, anything. We&apos;ll show you a few likely matches with photos to pick from.</p>
```

Lines 197-204 currently read:

```tsx
          <Button
            onClick={handleIdentify}
            disabled={mode === 'photo' ? !imageBase64 : !searchText.trim()}
            className="w-full"
            size="lg"
          >
            Identify Plant
          </Button>
```

Change the button label:

```tsx
          <Button
            onClick={handleIdentify}
            disabled={mode === 'photo' ? !imageBase64 : !searchText.trim()}
            className="w-full"
            size="lg"
          >
            {mode === 'photo' ? 'Identify Plant' : 'Find Matches'}
          </Button>
```

- [ ] **Step 6: Add the candidates screen**

Immediately after the `{step === 'loading' && ( ... )}` block (after line 214, before `{step === 'result' && result && (`), add:

```tsx
      {step === 'candidates' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Tap the one that matches:</p>
          {candidates.map((candidate, i) => (
            <button key={i} onClick={() => handleSelectCandidate(candidate)} className="w-full text-left">
              <Card className="hover:shadow-md hover:ring-primary/20 transition-all">
                <CardContent className="flex gap-4">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-accent flex items-center justify-center flex-shrink-0">
                    {candidate.photo_url ? (
                      <img src={candidate.photo_url} alt={candidate.common_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">🌿</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground">{candidate.common_name}</h3>
                        <p className="text-xs text-muted-foreground italic">{candidate.scientific_name}</p>
                      </div>
                      <Badge className={confidenceColors[candidate.confidence]}>{candidate.confidence}</Badge>
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{candidate.description}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          <Button onClick={handleReset} variant="outline" className="w-full" size="lg">
            Start Over
          </Button>
        </div>
      )}

```

- [ ] **Step 7: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 8: Manually verify in the browser**

```bash
npm run dev
```

Go to `http://localhost:3000/identify` (logged in), select the "📝 Describe It" tab, enter `tall plant with big shiny leaves`, tap "Find Matches". Confirm:
- 3-5 candidate cards appear, each with a photo (or a 🌿 placeholder), name, scientific name, confidence badge, and blurb.
- Tapping a candidate shows the loading state, then the existing result screen with that plant's full care info.
- "Try Again" / "Start Over" resets back to the input screen.

- [ ] **Step 9: Commit**

```bash
git add src/app/identify/page.tsx
git commit -m "Add multi-candidate description search flow to identify page"
```

---

### Task 7: Client — show photo + attribution, persist on add, back button

**Files:**
- Modify: `src/app/identify/page.tsx`

**Interfaces:**
- Consumes: `selectedPhotoUrl`, `selectedPhotoAttribution`, `candidates` state (Task 6); `body.photo_attribution_url` field (Task 4).
- Produces: result screen shows the picked candidate's photo + Wikipedia credit; `handleAddPlant` persists `photo_url`/`photo_attribution_url` for search-added plants; a back-to-candidates control.

- [ ] **Step 1: Show the selected photo and attribution on the result screen**

The result screen's image block currently reads:

```tsx
              {imagePreview && (
                <img src={imagePreview} alt={result.common_name} className="w-full h-48 object-cover rounded-xl mb-3" />
              )}
```

Change to:

```tsx
              {(imagePreview || selectedPhotoUrl) && (
                <div className="mb-3">
                  <img
                    src={imagePreview || selectedPhotoUrl || ''}
                    alt={result.common_name}
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  {selectedPhotoAttribution && (
                    <a
                      href={selectedPhotoAttribution}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Photo via Wikipedia
                    </a>
                  )}
                </div>
              )}
```

- [ ] **Step 2: Persist the photo and attribution in `handleAddPlant`**

The POST body in `handleAddPlant` currently reads:

```ts
        body: JSON.stringify({
          ...result,
          nickname: nickname || null,
          location: location || null,
          photo_url: mode === 'photo' ? imagePreview : null,
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
        }),
```

- [ ] **Step 3: Add a back-to-candidates control**

The result screen's action row currently reads:

```tsx
          <div className="flex gap-3">
            <Button onClick={handleReset} variant="outline" className="flex-1" size="lg">
              Try Again
            </Button>
            <Button onClick={handleAddPlant} className="flex-1" size="lg">
              Add to My Plants 🌱
            </Button>
          </div>
```

Add a back link above it, only shown when there are candidates to go back to:

```tsx
          {mode === 'search' && candidates.length > 0 && (
            <button
              onClick={() => setStep('candidates')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to results
            </button>
          )}

          <div className="flex gap-3">
            <Button onClick={handleReset} variant="outline" className="flex-1" size="lg">
              Try Again
            </Button>
            <Button onClick={handleAddPlant} className="flex-1" size="lg">
              Add to My Plants 🌱
            </Button>
          </div>
```

- [ ] **Step 4: Verify it compiles and lints**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/identify/page.tsx
git commit -m "Show candidate photo and attribution on result screen; persist on add"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Full happy-path flow**

```bash
npm run dev
```

In the browser, logged in, go to `/identify` → "📝 Describe It" → enter `tall plant with big shiny leaves` → "Find Matches". Confirm 3-5 candidates with distinct photos and confidence badges render.

- [ ] **Step 2: Fallback path (no images found)**

Enter an obscure/fictional description (e.g. `purple striped jellybean fern thing`) and confirm the candidates screen still renders (placeholder 🌿 icons instead of a blank/broken screen) rather than erroring out.

- [ ] **Step 3: Selection → result → add**

From Step 1's results, tap a candidate. Confirm: a single loading flash, then the result screen shows that candidate's photo with a "Photo via Wikipedia" link, and the care info matches that specific species (not a generic/different one). Fill in a nickname, tap "Add to My Plants 🌱".

- [ ] **Step 4: Persistence check**

On the resulting plant detail page (`/plants/[id]`), confirm the hero photo is the Wikipedia image and the "Photo via Wikipedia" credit link appears beneath it and opens the correct Wikipedia article. Confirm the dashboard (`/`) card for this plant also shows the photo.

- [ ] **Step 5: Photo mode regression check**

Go to `/identify` → "Upload Photo", upload any image, identify it. Confirm: single result (no candidates screen), no "Photo via Wikipedia" credit anywhere, and adding it works exactly as before.

- [ ] **Step 6: Full build check**

```bash
npm run lint
npm run build
```

Expected: both pass with no errors.

- [ ] **Step 7: Final commit (if any cleanup was needed)**

If Steps 1-6 required no code changes, no commit is needed here — the feature is complete as of Task 7's commit. If any fixes were made during verification, commit them:

```bash
git add -A
git commit -m "Fix issues found during end-to-end verification"
```
