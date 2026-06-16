import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('care_logs')
    .select('*')
    .eq('user_plant_id', id)
    .order('performed_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Verify plant belongs to user
  const { data: plant } = await supabase
    .from('user_plants')
    .select('id, fertilize_frequency_days')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!plant) return NextResponse.json({ error: 'Plant not found' }, { status: 404 });

  const now = new Date();

  const { data, error } = await supabase
    .from('care_logs')
    .insert({
      user_plant_id: id,
      care_type: body.care_type,
      notes: body.notes,
      performed_at: now.toISOString(),
    })
    .select()
    .single();

  // If fertilizing, update last_fertilized_at
  if (body.care_type === 'fertilize') {
    await supabase.from('user_plants').update({
      last_fertilized_at: now.toISOString(),
    }).eq('id', id).eq('user_id', user.id);
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
