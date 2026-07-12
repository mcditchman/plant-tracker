'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Flower2, Leaf, Scissors, type LucideIcon } from 'lucide-react';
import { UserPlant } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Category = 'bloom' | 'growth' | 'pruning';

const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

const NORTHERN_BANDS = [
  { name: 'Fall', color: 'bg-orange-400/20' },
  { name: 'Winter', color: 'bg-cyan-400/20' },
  { name: 'Spring', color: 'bg-green-400/20' },
  { name: 'Summer', color: 'bg-yellow-400/20' },
];

const CATEGORIES: { key: Category; label: string; Icon: LucideIcon }[] = [
  { key: 'bloom', label: 'Bloom', Icon: Flower2 },
  { key: 'growth', label: 'Growth cycle', Icon: Leaf },
  { key: 'pruning', label: 'Pruning & repotting', Icon: Scissors },
];

function plantHasCategory(plant: UserPlant, category: Category): boolean {
  const events = plant.seasonal_events;
  if (!events) return false;
  if (category === 'bloom') return events.bloom_months.length > 0;
  if (category === 'pruning') return events.pruning_months.length > 0;
  return events.growth_months.length > 0 || events.dormancy_months.length > 0;
}

export default function SeasonTimelineBoard({ plants }: { plants: UserPlant[] }) {
  const [category, setCategory] = useState<Category>('bloom');
  const currentMonth = new Date().getMonth() + 1;
  const qualifyingPlants = plants.filter(p => plantHasCategory(p, category));

  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold text-foreground mb-3">Season overview</h2>
        <Tabs value={category} onValueChange={v => setCategory(v as Category)}>
          <TabsList className="w-full mb-4">
            {CATEGORIES.map(c => (
              <TabsTrigger key={c.key} value={c.key} className="flex-1">
                <c.Icon className="size-3.5" /> {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-2 items-center">
          <div />
          <div className="grid grid-cols-12 gap-px text-center">
            {NORTHERN_BANDS.map((band, i) => (
              <div key={i} className={`col-span-3 ${band.color} text-foreground/70 text-xs font-medium py-1 rounded-sm`}>
                {band.name}
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">Plant</div>
          <div className="grid grid-cols-12 gap-px text-center">
            {MONTH_ORDER.map((month, i) => (
              <div key={month} className={`text-[10px] py-1 ${month === currentMonth ? 'ring-2 ring-primary rounded-sm' : ''}`}>
                {MONTH_LABELS[i]}
              </div>
            ))}
          </div>

          {qualifyingPlants.map(plant => {
            const events = plant.seasonal_events!;
            return (
              <Fragment key={plant.id}>
                <Link href={`/plants/${plant.id}`} className="text-xs font-medium text-foreground truncate hover:underline">
                  {plant.nickname || plant.common_name}
                </Link>
                <div className="grid grid-cols-12 gap-px">
                  {MONTH_ORDER.map(month => {
                    const isGrowth = category === 'growth' && events.growth_months.includes(month);
                    const isDormant = category === 'growth' && events.dormancy_months.includes(month) && !isGrowth;
                    const active = category === 'bloom'
                      ? events.bloom_months.includes(month)
                      : category === 'pruning'
                        ? events.pruning_months.includes(month)
                        : isGrowth || isDormant;
                    return (
                      <div
                        key={month}
                        className={`h-6 rounded-sm ${active ? (isDormant ? 'bg-muted-foreground/25' : 'bg-primary/60') : 'bg-muted/40'}`}
                      />
                    );
                  })}
                </div>
              </Fragment>
            );
          })}
        </div>

        {qualifyingPlants.length === 0 && (
          <p className="text-sm text-muted-foreground mt-3">No plants have data for this category yet — visit a plant&apos;s page to generate it.</p>
        )}
      </CardContent>
    </Card>
  );
}
