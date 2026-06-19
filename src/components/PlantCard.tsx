import Link from 'next/link';
import { UserPlant } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function getWateringStatus(plant: UserPlant): { label: string; color: string } {
  if (!plant.next_watering_at) {
    return { label: 'Set up watering', color: 'text-muted-foreground' };
  }

  const now = new Date();
  const next = new Date(plant.next_watering_at);
  const diffMs = next.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}d overdue`, color: 'text-red-600' };
  } else if (diffDays === 0) {
    return { label: 'Water today!', color: 'text-orange-500' };
  } else if (diffDays <= 2) {
    return { label: `Water in ${diffDays}d`, color: 'text-yellow-600' };
  } else {
    return { label: `Water in ${diffDays}d`, color: 'text-green-600' };
  }
}

const difficultyBadge = {
  easy: 'bg-green-100 text-green-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

export default function PlantCard({ plant }: { plant: UserPlant }) {
  const waterStatus = getWateringStatus(plant);

  return (
    <Link href={`/plants/${plant.id}`} className="block">
      <Card className="hover:shadow-md hover:ring-primary/20 transition-all">
        <CardContent className="flex gap-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-accent flex items-center justify-center flex-shrink-0">
            {plant.photo_url ? (
              <img src={plant.photo_url} alt={plant.common_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">🌱</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground truncate">
                  {plant.nickname || plant.common_name}
                </h3>
                {plant.nickname && (
                  <p className="text-xs text-muted-foreground truncate">{plant.common_name}</p>
                )}
                {plant.scientific_name && !plant.nickname && (
                  <p className="text-xs text-muted-foreground truncate italic">{plant.scientific_name}</p>
                )}
              </div>
              {plant.difficulty && (
                <Badge className={`${difficultyBadge[plant.difficulty] || ''} flex-shrink-0`}>
                  {plant.difficulty}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-base">💧</span>
                <span className={`text-sm font-medium ${waterStatus.color}`}>
                  {waterStatus.label}
                </span>
              </div>
              {plant.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <span>📍</span>
                  {plant.location}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
