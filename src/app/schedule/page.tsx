import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { UserPlant } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type EventType = 'water' | 'fertilize';

interface ScheduleEvent {
  plant: UserPlant;
  type: EventType;
  date: Date;
}

const eventInfo: Record<EventType, { label: string; icon: string }> = {
  water: { label: 'Water', icon: '💧' },
  fertilize: { label: 'Fertilize', icon: '🌱' },
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
  if (days <= 7) return 'This Week';
  return 'Later';
}

const groupOrder = ['Overdue', 'Today', 'Tomorrow', 'This Week', 'Later'];

const groupStyles: Record<string, { bg: string; text: string }> = {
  Overdue: { bg: 'bg-red-50', text: 'text-red-700' },
  Today: { bg: 'bg-orange-50', text: 'text-orange-700' },
  Tomorrow: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  'This Week': { bg: 'bg-blue-50', text: 'text-blue-700' },
  Later: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

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
        <Card className="bg-red-50 mb-6">
          <CardContent>
            <p className="text-red-700 font-medium text-sm">
              ⚠️ {overdueCount} task{overdueCount !== 1 ? 's' : ''} overdue
            </p>
          </CardContent>
        </Card>
      )}

      {plantList.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📅</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Nothing scheduled yet</h2>
          <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
            Add a plant to start tracking watering and maintenance.
          </p>
          <Button render={<Link href="/identify" />} nativeButton={false} size="lg">
            Identify a Plant
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupOrder
            .filter(label => grouped.has(label))
            .map(label => {
              const style = groupStyles[label];
              return (
                <div key={label}>
                  <h2 className={`text-sm font-semibold mb-2 ${style.text}`}>{label}</h2>
                  <div className="space-y-2">
                    {grouped.get(label)!.map((event, i) => {
                      const info = eventInfo[event.type];
                      const days = diffInDays(event.date);
                      const dayText =
                        days < 0 ? `${Math.abs(days)}d overdue` :
                        days === 0 ? 'Today' :
                        days === 1 ? 'Tomorrow' :
                        `In ${days}d`;

                      return (
                        <Link
                          key={`${event.plant.id}-${event.type}-${i}`}
                          href={`/plants/${event.plant.id}`}
                          className="block"
                        >
                          <Card className={`${style.bg} hover:opacity-80 transition-opacity`} size="sm">
                            <CardContent className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-card flex items-center justify-center flex-shrink-0">
                                {event.plant.photo_url ? (
                                  <img src={event.plant.photo_url} alt={event.plant.common_name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xl">🌱</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm truncate">
                                  {event.plant.nickname || event.plant.common_name}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span>{info.icon}</span> {info.label}
                                </p>
                              </div>
                              <span className={`text-xs font-medium ${style.text} flex-shrink-0`}>
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
