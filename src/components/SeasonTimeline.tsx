'use client';
import { useState } from 'react';
import { SeasonalEvents, Hemisphere } from '@/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CELL_ACTIVE,
  CELL_DORMANT,
  CELL_INACTIVE,
  GrowthLegend,
  MONTH_LABELS,
  MONTH_ORDER,
  SEASON_CATEGORIES,
  getSeasonBands,
  type SeasonCategory,
} from '@/components/seasons';

const EMPTY_MESSAGES: Record<SeasonCategory, string> = {
  bloom: 'No notable blooming period for this plant.',
  growth: 'Grows steadily year-round, no dormant period.',
  pruning: 'No specific pruning window — prune as needed.',
};

function isCategoryEmpty(category: SeasonCategory, events: SeasonalEvents): boolean {
  if (category === 'bloom') return events.bloom_months.length === 0;
  if (category === 'pruning') return events.pruning_months.length === 0;
  return events.growth_months.length === 0 && events.dormancy_months.length === 0;
}

export default function SeasonTimeline({ events, hemisphere }: { events: SeasonalEvents | null; hemisphere: Hemisphere | null }) {
  const [category, setCategory] = useState<SeasonCategory>('bloom');
  const currentMonth = new Date().getMonth() + 1;
  const bands = getSeasonBands(hemisphere);

  return (
    <section>
      <h2 className="font-semibold text-foreground mb-3">Season</h2>
      <Tabs value={category} onValueChange={v => setCategory(v as SeasonCategory)}>
        <TabsList className="w-full mb-4">
          {SEASON_CATEGORIES.map(c => (
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
            <>
              <div className="grid grid-cols-12 gap-px mt-1">
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
                      className={`h-6 rounded-sm ${active ? (isDormant ? CELL_DORMANT : CELL_ACTIVE) : CELL_INACTIVE}`}
                    />
                  );
                })}
              </div>
              {category === 'growth' && <GrowthLegend />}
            </>
          )}
        </div>
      )}
    </section>
  );
}
