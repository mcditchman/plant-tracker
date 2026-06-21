export type Difficulty = 'easy' | 'moderate' | 'hard';
export type CareType = 'water' | 'fertilize' | 'prune' | 'repot' | 'mist' | 'other';
export type Hemisphere = 'northern' | 'southern';

export interface SeasonalEvents {
  bloom_months: number[];
  growth_months: number[];
  dormancy_months: number[];
  pruning_months: number[];
}

export interface UserPlant {
  id: string;
  user_id: string;
  common_name: string;
  scientific_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  photo_attribution_url: string | null;
  location: string | null;
  description: string | null;
  difficulty: Difficulty | null;
  care_light: string | null;
  care_water: string | null;
  care_humidity: string | null;
  care_temperature: string | null;
  care_soil: string | null;
  care_fertilizer: string | null;
  watering_frequency_days: number;
  fertilize_frequency_days: number;
  care_tips: string[];
  hemisphere: Hemisphere | null;
  seasonal_events: SeasonalEvents | null;
  last_watered_at: string | null;
  next_watering_at: string | null;
  last_fertilized_at: string | null;
  date_added: string;
  created_at: string;
  updated_at: string;
}

export interface CareLog {
  id: string;
  user_plant_id: string;
  care_type: CareType;
  notes: string | null;
  performed_at: string;
  created_at: string;
}

export interface PlantIdentification {
  identified: boolean;
  common_name: string;
  scientific_name: string;
  confidence: 'high' | 'medium' | 'low';
  description: string;
  difficulty: Difficulty;
  care: {
    light: string;
    water: string;
    watering_frequency_days: number;
    humidity: string;
    temperature: string;
    soil: string;
    fertilizer: string;
    fertilize_frequency_days: number;
  };
  tips: string[];
  seasonal: SeasonalEvents;
}

export interface PlantCandidate {
  common_name: string;
  scientific_name: string;
  confidence: 'high' | 'medium' | 'low';
  description: string;
  photo_url: string | null;
  photo_attribution_url: string | null;
}
