import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Droplet, Plus, Sprout } from 'lucide-react';
import PlantCard from '@/components/PlantCard';
import SeasonTimelineBoard from '@/components/SeasonTimelineBoard';
import { UserPlant } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: plants } = await supabase
    .from('user_plants')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const plantList = (plants || []) as UserPlant[];

  // Sort plants: overdue first, then by next_watering_at
  const sortedPlants = [...plantList].sort((a, b) => {
    const aNext = a.next_watering_at ? new Date(a.next_watering_at).getTime() : Infinity;
    const bNext = b.next_watering_at ? new Date(b.next_watering_at).getTime() : Infinity;
    return aNext - bNext;
  });

  const needsWater = sortedPlants.filter(p => {
    if (!p.next_watering_at) return false;
    return new Date(p.next_watering_at) <= new Date();
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Plants</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {plantList.length === 0 ? 'No plants yet' : `${plantList.length} plant${plantList.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button render={<Link href="/identify" />} nativeButton={false}>
          <Plus /> Add Plant
        </Button>
      </div>

      {needsWater.length > 0 && (
        <Card className="mb-6">
          <CardContent>
            <p className="text-attention font-medium text-sm flex items-center gap-2">
              <Droplet className="size-4" />
              {needsWater.length} plant{needsWater.length !== 1 ? 's' : ''} need{needsWater.length === 1 ? 's' : ''} water
            </p>
          </CardContent>
        </Card>
      )}

      {plantList.length > 0 && <SeasonTimelineBoard plants={plantList} />}

      {plantList.length === 0 ? (
        <div className="text-center py-16">
          <Sprout className="size-12 mx-auto text-primary/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Add your first plant</h2>
          <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
            Take a photo or search by name and AI will identify your plant and set up a care schedule.
          </p>
          <Button render={<Link href="/identify" />} nativeButton={false} size="lg">
            Identify a Plant
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPlants.map(plant => (
            <PlantCard key={plant.id} plant={plant} />
          ))}
        </div>
      )}
    </div>
  );
}
