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
    if (!data.thumbnail?.source?.startsWith('https://')) {
      return { photo_url: null, photo_attribution_url: null };
    }
    const attributionUrl = data.content_urls?.desktop?.page;
    return {
      photo_url: data.thumbnail.source,
      photo_attribution_url: attributionUrl?.startsWith('https://') ? attributionUrl : null,
    };
  } catch (error) {
    console.warn(`Wikipedia photo lookup failed for "${title}":`, error);
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
