import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get plant to calculate next watering
  const { data: plant } = await supabase
    .from('user_plants')
    .select('watering_frequency_days')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!plant) return NextResponse.json({ error: 'Plant not found' }, { status: 404 });

  const now = new Date();
  const nextWatering = new Date(now);
  nextWatering.setDate(nextWatering.getDate() + plant.watering_frequency_days);

  // Update plant and log care
  const [updateResult] = await Promise.all([
    supabase.from('user_plants').update({
      last_watered_at: now.toISOString(),
      next_watering_at: nextWatering.toISOString(),
    }).eq('id', id).eq('user_id', user.id).select().single(),
    supabase.from('care_logs').insert({
      user_plant_id: id,
      care_type: 'water',
      performed_at: now.toISOString(),
    }),
  ]);

  if (updateResult.error) return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
  return NextResponse.json(updateResult.data);
}
