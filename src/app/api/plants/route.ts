import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_plants')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const now = new Date();
  const nextWatering = new Date(now);
  nextWatering.setDate(nextWatering.getDate() + (body.watering_frequency_days || 7));

  const { data, error } = await supabase
    .from('user_plants')
    .insert({
      user_id: user.id,
      common_name: body.common_name,
      scientific_name: body.scientific_name,
      nickname: body.nickname,
      photo_url: body.photo_url,
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
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
