import { Flower2, Leaf, Scissors, type LucideIcon } from 'lucide-react';
import { Hemisphere } from '@/types';

export type SeasonCategory = 'bloom' | 'growth' | 'pruning';

export const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
export const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

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

export function getSeasonBands(hemisphere: Hemisphere | null) {
  return hemisphere === 'southern' ? SOUTHERN_BANDS : NORTHERN_BANDS;
}

export const SEASON_CATEGORIES: { key: SeasonCategory; label: string; Icon: LucideIcon }[] = [
  { key: 'bloom', label: 'Bloom', Icon: Flower2 },
  { key: 'growth', label: 'Growth cycle', Icon: Leaf },
  { key: 'pruning', label: 'Pruning & repotting', Icon: Scissors },
];

// Cell fills shared by both timelines
export const CELL_ACTIVE = 'bg-primary/60';
export const CELL_DORMANT = 'bg-muted-foreground/25';
export const CELL_INACTIVE = 'bg-muted/40';

export function GrowthLegend() {
  return (
    <div className="flex items-center gap-4 mt-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`size-2.5 rounded-sm ${CELL_ACTIVE}`} /> Active growth
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`size-2.5 rounded-sm ${CELL_DORMANT}`} /> Dormant
      </span>
    </div>
  );
}
