ALTER TABLE user_plants ADD COLUMN hemisphere TEXT CHECK (hemisphere IN ('northern', 'southern'));
ALTER TABLE user_plants ADD COLUMN seasonal_events JSONB;
