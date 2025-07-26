-- Migration: Add app/source column to analytics table for multi-app analytics support
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS app VARCHAR(50) DEFAULT 'gridrr';
-- Optionally, add an index for faster queries by app
CREATE INDEX IF NOT EXISTS idx_analytics_app ON analytics (app);
