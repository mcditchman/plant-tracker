import Link from 'next/link';
import { UserPlant } from '@/types';

function getWateringStatus(plant: UserPlant): { label: string; color: string; urgent: boolean } {
  if (!plant.next_watering_at) {
    return { label: 'Set up watering', color: 'text-gray-400', urgent: false };
  }

  const now = new Date();
  const next = new Date(plant.next_watering_at);
  const diffMs = next.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}d overdue`, color: 'text-red-600', urgent: true };
  } else if (diffDays === 0) {
    return { label: 'Water today!', color: 'text-orange-500', urgent: true };
  } else if (diffDays <= 2) {
    return { label: `Water in ${diffDays}d`, color: 'text-yellow-600', urgent: false };
  } else {
    return { label: `Water in ${diffDays}d`, color: 'text-green-600', urgent: false };
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
      <div className="bg-white rounded-2xl border border-gray-100 hover:border-green-200 hover:shadow-md transition-all p-4">
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-green-50 flex items-center justify-center flex-shrink-0">
            {plant.photo_url ? (
              <img src={plant.photo_url} alt={plant.common_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">🌱</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 truncate">
                  {plant.nickname || plant.common_name}
                </h3>
                {plant.nickname && (
                  <p className="text-xs text-gray-400 truncate">{plant.common_name}</p>
                )}
                {plant.scientific_name && !plant.nickname && (
                  <p className="text-xs text-gray-400 truncate italic">{plant.scientific_name}</p>
                )}
              </div>
              {plant.difficulty && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${difficultyBadge[plant.difficulty] || ''}`}>
                  {plant.difficulty}
                </span>
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
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <span>📍</span>
                  {plant.location}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
