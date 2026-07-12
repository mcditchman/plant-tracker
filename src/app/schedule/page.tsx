import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Droplet, Leaf, Sprout, TriangleAlert } from 'lucide-react';
import { UserPlant } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type EventType = 'water' | 'fertilize';

interface ScheduleEvent {
  plant: UserPlant;
  type: EventType;
  date: Date;
}

const eventInfo: Record<EventType, { label: string; Icon: typeof Droplet }> = {
  water: { label: 'Water', Icon: Droplet },
  fertilize: { label: 'Fertilize', Icon: Sprout },
};

function getNextFertilizeDate(plant: UserPlant): Date {
  const base = plant.last_fertilized_at ? new Date(plant.last_fertilized_at) : new Date(plant.date_added);
  const next = new Date(base);
  next.setDate(next.getDate() + plant.fertilize_frequency_days);
  return next;
}

function diffInDays(date: Date): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
}

function groupLabel(days: number): string {
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return 'This week';
  return 'Later';
}

const groupOrder = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later'];

// Color marks urgency only: overdue/today get the attention color, the rest stay muted
const attentionGroups = new Set(['Overdue', 'Today']);

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: plants } = await supabase
    .from('user_plants')
    .select('*')
    .eq('user_id', user.id);

  const plantList = (plants || []) as UserPlant[];

  const events: ScheduleEvent[] = [];
  for (const plant of plantList) {
    if (plant.next_watering_at) {
      events.push({ plant, type: 'water', date: new Date(plant.next_watering_at) });
    }
    events.push({ plant, type: 'fertilize', date: getNextFertilizeDate(plant) });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const grouped = new Map<string, ScheduleEvent[]>();
  for (const event of events) {
    const label = groupLabel(diffInDays(event.date));
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push(event);
  }

  const overdueCount = grouped.get('Overdue')?.length || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Schedule</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {events.length === 0 ? 'No upcoming care' : 'Watering & maintenance, all plants'}
        </p>
      </div>

      {overdueCount > 0 && (
        <Card className="mb-6">
          <CardContent>
            <p className="text-attention font-medium text-sm flex items-center gap-2">
              <TriangleAlert className="size-4" />
              {overdueCount} task{overdueCount !== 1 ? 's' : ''} overdue
            </p>
          </CardContent>
        </Card>
      )}

      {plantList.length === 0 ? (
        <div className="text-center py-16">
          <CalendarDays className="size-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Nothing scheduled yet</h2>
          <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
            Add a plant to start tracking watering and maintenance.
          </p>
          <Button render={<Link href="/identify" />} nativeButton={false} size="lg">
            Identify a plant
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupOrder
            .filter(label => grouped.has(label))
            .map(label => {
              const attention = attentionGroups.has(label);
              const headerColor = attention ? 'text-attention' : 'text-muted-foreground';
              return (
                <div key={label}>
                  <h2 className={`text-sm font-semibold mb-2 ${headerColor}`}>{label}</h2>
                  <div className="space-y-2">
                    {grouped.get(label)!.map((event, i) => {
                      const info = eventInfo[event.type];
                      const days = diffInDays(event.date);
                      const dayText =
                        days < 0 ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue` :
                        days === 0 ? 'Today' :
                        days === 1 ? 'Tomorrow' :
                        `In ${days} days`;

                      return (
                        <Link
                          key={`${event.plant.id}-${event.type}-${i}`}
                          href={`/plants/${event.plant.id}`}
                          className="block"
                        >
                          <Card className="hover:shadow-md hover:ring-primary/20 transition-all" size="sm">
                            <CardContent className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-accent flex items-center justify-center flex-shrink-0">
                                {event.plant.photo_url ? (
                                  <img src={event.plant.photo_url} alt={event.plant.common_name} className="w-full h-full object-cover" />
                                ) : (
                                  <Leaf className="size-5 text-primary/40" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm truncate">
                                  {event.plant.nickname || event.plant.common_name}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <info.Icon className="size-3" /> {info.label}
                                </p>
                              </div>
                              <span className={`text-xs font-medium ${attention ? 'text-attention' : 'text-muted-foreground'} flex-shrink-0`}>
                                {dayText}
                              </span>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
