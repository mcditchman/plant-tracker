import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { UserPlant, CareLog } from '@/types';
import WaterButton from '@/components/WaterButton';
import CareLogButton from '@/components/CareLogButton';
import DeletePlantButton from '@/components/DeletePlantButton';
import PhotoAttribution from '@/components/PhotoAttribution';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWateringStatus(plant: UserPlant) {
  if (!plant.next_watering_at) return { label: 'Not scheduled', color: 'text-muted-foreground', bg: 'bg-muted' };
  const now = new Date();
  const next = new Date(plant.next_watering_at);
  const diffMs = next.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`, color: 'text-red-600', bg: 'bg-red-50' };
  if (diffDays === 0) return { label: 'Water today!', color: 'text-orange-600', bg: 'bg-orange-50' };
  if (diffDays === 1) return { label: 'Water tomorrow', color: 'text-yellow-600', bg: 'bg-yellow-50' };
  return { label: `Water in ${diffDays} days`, color: 'text-green-600', bg: 'bg-green-50' };
}

const careTypeLabels: Record<string, { label: string; icon: string }> = {
  water: { label: 'Watered', icon: '💧' },
  fertilize: { label: 'Fertilized', icon: '🌱' },
  prune: { label: 'Pruned', icon: '✂️' },
  repot: { label: 'Repotted', icon: '🪴' },
  mist: { label: 'Misted', icon: '🌫️' },
  other: { label: 'Care', icon: '📝' },
};

const difficultyInfo = {
  easy: { label: 'Easy', className: 'bg-green-100 text-green-700' },
  moderate: { label: 'Moderate', className: 'bg-yellow-100 text-yellow-700' },
  hard: { label: 'Advanced', className: 'bg-red-100 text-red-700' },
};

export default async function PlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [plantResult, logsResult] = await Promise.all([
    supabase.from('user_plants').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('care_logs').select('*').eq('user_plant_id', id).order('performed_at', { ascending: false }).limit(20),
  ]);

  if (plantResult.error || !plantResult.data) notFound();

  const plant = plantResult.data as UserPlant;
  const logs = (logsResult.data || []) as CareLog[];
  const waterStatus = getWateringStatus(plant);
  const diff = plant.difficulty ? difficultyInfo[plant.difficulty] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">← Back</Link>
      </div>

      {/* Hero card */}
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
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {plant.nickname || plant.common_name}
              </h1>
              {plant.nickname && <p className="text-muted-foreground text-sm">{plant.common_name}</p>}
              {plant.scientific_name && (
                <p className="text-muted-foreground text-sm italic">{plant.scientific_name}</p>
              )}
            </div>
            {diff && (
              <Badge className={diff.className}>{diff.label}</Badge>
            )}
          </div>
          {plant.location && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
              <span>📍</span> {plant.location}
            </p>
          )}
          {plant.description && (
            <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{plant.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Watering status */}
      <Card className={waterStatus.bg}>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className={`font-semibold ${waterStatus.color}`}>💧 {waterStatus.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last watered: {formatDate(plant.last_watered_at)} · Every {plant.watering_frequency_days} days
            </p>
          </div>
          <WaterButton plantId={plant.id} />
        </CardContent>
      </Card>

      {/* Care actions */}
      <div className="flex gap-3">
        <CareLogButton plantId={plant.id} />
      </div>

      {/* Care requirements */}
      <Card>
        <CardContent>
          <h2 className="font-semibold text-foreground mb-4">Care Guide</h2>
          <div className="space-y-3">
            {plant.care_water && (
              <div className="flex gap-3">
                <span className="text-xl w-7 flex-shrink-0">💧</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Water</p>
                  <p className="text-sm text-foreground/80">{plant.care_water}</p>
                </div>
              </div>
            )}
            {plant.care_light && (
              <div className="flex gap-3">
                <span className="text-xl w-7 flex-shrink-0">☀️</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Light</p>
                  <p className="text-sm text-foreground/80">{plant.care_light}</p>
                </div>
              </div>
            )}
            {plant.care_humidity && (
              <div className="flex gap-3">
                <span className="text-xl w-7 flex-shrink-0">🌫️</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Humidity</p>
                  <p className="text-sm text-foreground/80">{plant.care_humidity}</p>
                </div>
              </div>
            )}
            {plant.care_temperature && (
              <div className="flex gap-3">
                <span className="text-xl w-7 flex-shrink-0">🌡️</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Temperature</p>
                  <p className="text-sm text-foreground/80">{plant.care_temperature}</p>
                </div>
              </div>
            )}
            {plant.care_soil && (
              <div className="flex gap-3">
                <span className="text-xl w-7 flex-shrink-0">🪱</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Soil</p>
                  <p className="text-sm text-foreground/80">{plant.care_soil}</p>
                </div>
              </div>
            )}
            {plant.care_fertilizer && (
              <div className="flex gap-3">
                <span className="text-xl w-7 flex-shrink-0">🌱</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Fertilizer</p>
                  <p className="text-sm text-foreground/80">{plant.care_fertilizer}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      {plant.care_tips && plant.care_tips.length > 0 && (
        <Card className="bg-accent">
          <CardContent>
            <h2 className="font-semibold text-foreground mb-3">💡 Care Tips</h2>
            <ul className="space-y-2">
              {plant.care_tips.map((tip, i) => (
                <li key={i} className="text-sm text-foreground/80 flex gap-2">
                  <span className="text-primary flex-shrink-0 mt-0.5">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Care history */}
      <Card>
        <CardContent>
          <h2 className="font-semibold text-foreground mb-4">Care History</h2>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No care activities logged yet. Start by watering your plant!</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log, i) => {
                const info = careTypeLabels[log.care_type] || { label: log.care_type, icon: '📝' };
                return (
                  <div key={log.id}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{info.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{info.label}</p>
                        {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(log.performed_at)}</p>
                    </div>
                    {i < logs.length - 1 && <Separator className="mt-3" />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <div className="pb-4">
        <DeletePlantButton plantId={plant.id} />
      </div>
    </div>
  );
}
