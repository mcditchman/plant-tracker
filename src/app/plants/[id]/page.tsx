import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Droplet,
  Droplets,
  Layers,
  Lightbulb,
  MapPin,
  NotebookPen,
  Scissors,
  Shovel,
  SprayCan,
  Sprout,
  Sun,
  Thermometer,
  type LucideIcon,
} from 'lucide-react';
import { UserPlant, CareLog } from '@/types';
import WaterButton from '@/components/WaterButton';
import CareLogButton from '@/components/CareLogButton';
import DeletePlantButton from '@/components/DeletePlantButton';
import PhotoAttribution from '@/components/PhotoAttribution';
import SeasonalDataLoader from '@/components/SeasonalDataLoader';
import SeasonTimeline from '@/components/SeasonTimeline';
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
  if (!plant.next_watering_at) return { label: 'Not scheduled', attention: false };
  const now = new Date();
  const next = new Date(plant.next_watering_at);
  const diffMs = next.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`, attention: true };
  if (diffDays === 0) return { label: 'Water today', attention: true };
  if (diffDays === 1) return { label: 'Water tomorrow', attention: false };
  return { label: `Water in ${diffDays} days`, attention: false };
}

const careTypeLabels: Record<string, { label: string; Icon: LucideIcon }> = {
  water: { label: 'Watered', Icon: Droplet },
  fertilize: { label: 'Fertilized', Icon: Sprout },
  prune: { label: 'Pruned', Icon: Scissors },
  repot: { label: 'Repotted', Icon: Shovel },
  mist: { label: 'Misted', Icon: SprayCan },
  other: { label: 'Care', Icon: NotebookPen },
};

const difficultyInfo = {
  easy: { label: 'Easy' },
  moderate: { label: 'Moderate' },
  hard: { label: 'Advanced' },
};

const careFields: { field: keyof UserPlant; label: string; Icon: LucideIcon }[] = [
  { field: 'care_water', label: 'Water', Icon: Droplet },
  { field: 'care_light', label: 'Light', Icon: Sun },
  { field: 'care_humidity', label: 'Humidity', Icon: Droplets },
  { field: 'care_temperature', label: 'Temperature', Icon: Thermometer },
  { field: 'care_soil', label: 'Soil', Icon: Layers },
  { field: 'care_fertilizer', label: 'Fertilizer', Icon: Sprout },
];

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
    <div className="space-y-6">
      <SeasonalDataLoader plantId={plant.id} hasSeasonalData={!!plant.seasonal_events} />
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">← Back</Link>
      </div>

      {/* Photo + identity */}
      <div>
        {plant.photo_url && (
          <div className="mb-4">
            <img src={plant.photo_url} alt={plant.common_name} className="w-full h-64 object-cover rounded-2xl" />
            <PhotoAttribution url={plant.photo_attribution_url} />
          </div>
        )}
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
            <Badge variant="secondary">{diff.label}</Badge>
          )}
        </div>
        {plant.location && (
          <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
            <MapPin className="size-3.5" /> {plant.location}
          </p>
        )}
        {plant.description && (
          <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{plant.description}</p>
        )}
      </div>

      {/* Watering status — the one actionable block keeps a card */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className={`font-semibold flex items-center gap-2 ${waterStatus.attention ? 'text-attention' : 'text-foreground'}`}>
              <Droplet className="size-4" /> {waterStatus.label}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last watered: {formatDate(plant.last_watered_at)} · Every {plant.watering_frequency_days} days
            </p>
          </div>
          <WaterButton plantId={plant.id} />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <CareLogButton plantId={plant.id} />
      </div>

      <Separator />

      {/* Care guide */}
      <section>
        <h2 className="font-semibold text-foreground mb-4">Care guide</h2>
        <div className="space-y-4">
          {careFields.map(({ field, label, Icon }) => {
            const value = plant[field];
            if (!value || typeof value !== 'string') return null;
            return (
              <div key={field} className="flex gap-3">
                <Icon className="size-4.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-sm text-foreground/80">{value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Separator />

      <SeasonTimeline events={plant.seasonal_events} hemisphere={plant.hemisphere} />

      {/* Tips */}
      {plant.care_tips && plant.care_tips.length > 0 && (
        <>
          <Separator />
          <section>
            <h2 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Lightbulb className="size-4" /> Care tips
            </h2>
            <ul className="space-y-2">
              {plant.care_tips.map((tip, i) => (
                <li key={i} className="text-sm text-foreground/80 flex gap-2">
                  <span className="text-primary flex-shrink-0 mt-0.5">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Separator />

      {/* Care history */}
      <section>
        <h2 className="font-semibold text-foreground mb-4">Care history</h2>
        {logs.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing logged yet. Watering and other care will show up here.</p>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const info = careTypeLabels[log.care_type] || { label: log.care_type, Icon: NotebookPen };
              return (
                <div key={log.id} className="flex items-center gap-3">
                  <info.Icon className="size-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{info.label}</p>
                    {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(log.performed_at)}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="pb-4">
        <DeletePlantButton plantId={plant.id} />
      </div>
    </div>
  );
}
