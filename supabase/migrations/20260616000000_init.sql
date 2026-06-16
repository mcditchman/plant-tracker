-- User plants collection
CREATE TABLE user_plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  nickname TEXT,
  photo_url TEXT,
  location TEXT,
  description TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard')),

  -- Care requirements (AI-generated)
  care_light TEXT,
  care_water TEXT,
  care_humidity TEXT,
  care_temperature TEXT,
  care_soil TEXT,
  care_fertilizer TEXT,
  watering_frequency_days INT DEFAULT 7,
  fertilize_frequency_days INT DEFAULT 30,

  -- Care tips array
  care_tips TEXT[] DEFAULT '{}',

  -- Tracking
  last_watered_at TIMESTAMPTZ,
  next_watering_at TIMESTAMPTZ,
  last_fertilized_at TIMESTAMPTZ,

  date_added TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Care activity log
CREATE TABLE care_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_plant_id UUID REFERENCES user_plants(id) ON DELETE CASCADE NOT NULL,
  care_type TEXT NOT NULL CHECK (care_type IN ('water', 'fertilize', 'prune', 'repot', 'mist', 'other')),
  notes TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE user_plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own plants" ON user_plants
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage care logs for their plants" ON care_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_plants
      WHERE user_plants.id = care_logs.user_plant_id
      AND user_plants.user_id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_plants_updated_at
  BEFORE UPDATE ON user_plants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
