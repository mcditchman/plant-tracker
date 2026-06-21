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
