import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import PlantCard from '@/components/PlantCard';
import { UserPlant } from '@/types';

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
          <h1 className="text-2xl font-bold text-gray-900">My Plants</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {plantList.length === 0 ? 'No plants yet' : `${plantList.length} plant${plantList.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href="/identify"
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1"
        >
          <span>+</span> Add Plant
        </Link>
      </div>

      {needsWater.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
          <p className="text-blue-800 font-medium text-sm">
            💧 {needsWater.length} plant{needsWater.length !== 1 ? 's' : ''} need{needsWater.length === 1 ? 's' : ''} water
          </p>
        </div>
      )}

      {plantList.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🌱</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Add your first plant</h2>
          <p className="text-gray-500 mb-6 max-w-xs mx-auto">
            Take a photo or search by name and AI will identify your plant and set up a care schedule.
          </p>
          <Link
            href="/identify"
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-medium transition-colors inline-block"
          >
            Identify a Plant
          </Link>
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
