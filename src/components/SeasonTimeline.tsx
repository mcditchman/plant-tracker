'use client';
import { useState } from 'react';
import { Flower2, Leaf, Scissors, Snowflake, type LucideIcon } from 'lucide-react';
import { SeasonalEvents, Hemisphere } from '@/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

type Category = 'bloom' | 'growth' | 'pruning';

const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

const NORTHERN_BANDS = [
  { name: 'Fall', color: 'bg-orange-400/20' },
  { name: 'Winter', color: 'bg-cyan-400/20' },
  { name: 'Spring', color: 'bg-green-400/20' },
  { name: 'Summer', color: 'bg-yellow-400/20' },
];

const SOUTHERN_BANDS = [
  { name: 'Spring', color: 'bg-green-400/20' },
  { name: 'Summer', color: 'bg-yellow-400/20' },
  { name: 'Fall', color: 'bg-orange-400/20' },
  { name: 'Winter', color: 'bg-cyan-400/20' },
];

function getSeasonBands(hemisphere: Hemisphere | null) {
  return hemisphere === 'southern' ? SOUTHERN_BANDS : NORTHERN_BANDS;
}

const CATEGORIES: { key: Category; label: string; Icon: LucideIcon }[] = [
  { key: 'bloom', label: 'Bloom', Icon: Flower2 },
  { key: 'growth', label: 'Growth Cycle', Icon: Leaf },
  { key: 'pruning', label: 'Pruning & Repotting', Icon: Scissors },
];

const EMPTY_MESSAGES: Record<Category, string> = {
  bloom: 'No notable blooming period for this plant.',
  growth: 'Grows steadily year-round, no dormant period.',
  pruning: 'No specific pruning window — prune as needed.',
};

function isCategoryEmpty(category: Category, events: SeasonalEvents): boolean {
  if (category === 'bloom') return events.bloom_months.length === 0;
  if (category === 'pruning') return events.pruning_months.length === 0;
  return events.growth_months.length === 0 && events.dormancy_months.length === 0;
}

export default function SeasonTimeline({ events, hemisphere }: { events: SeasonalEvents | null; hemisphere: Hemisphere | null }) {
  const [category, setCategory] = useState<Category>('bloom');
  const currentMonth = new Date().getMonth() + 1;
  const bands = getSeasonBands(hemisphere);

  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold text-foreground mb-3">Season</h2>
        <Tabs value={category} onValueChange={v => setCategory(v as Category)}>
          <TabsList className="w-full mb-4">
            {CATEGORIES.map(c => (
              <TabsTrigger key={c.key} value={c.key} className="flex-1">
                <c.Icon className="size-3.5" /> {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {!events ? (
          <div className="h-24 rounded-xl bg-muted animate-pulse" />
        ) : (
          <div>
            <div className="grid grid-cols-12 gap-px text-center">
              {bands.map((band, bandIndex) => (
                <div key={bandIndex} className={`col-span-3 ${band.color} text-foreground/70 text-xs font-medium py-1.5 rounded-sm`}>
                  {band.name}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-12 gap-px text-center mt-1">
              {MONTH_ORDER.map((month, i) => (
                <div
                  key={month}
                  className={`text-xs py-1 ${month === currentMonth ? 'ring-2 ring-primary rounded-sm' : ''}`}
                >
                  {MONTH_LABELS[i]}
                </div>
              ))}
            </div>
            {isCategoryEmpty(category, events) ? (
              <p className="text-sm text-muted-foreground mt-3">{EMPTY_MESSAGES[category]}</p>
            ) : (
              <div className="grid grid-cols-12 gap-px mt-1">
                {MONTH_ORDER.map(month => (
                  <div key={month} className="bg-muted/50 rounded-sm py-2 flex items-center justify-center">
                    {category === 'bloom' && events.bloom_months.includes(month) && <Flower2 className="size-3.5 text-primary" aria-label="Flowering" />}
                    {category === 'growth' && events.growth_months.includes(month) && <Leaf className="size-3.5 text-primary" aria-label="Active growth" />}
                    {category === 'growth' && events.dormancy_months.includes(month) && <Snowflake className="size-3.5 text-muted-foreground" aria-label="Dormant" />}
                    {category === 'pruning' && events.pruning_months.includes(month) && <Scissors className="size-3.5 text-primary" aria-label="Best time to prune/repot" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
