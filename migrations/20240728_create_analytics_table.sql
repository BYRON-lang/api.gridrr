-- Migration: Create analytics table for custom analytics
CREATE TABLE IF NOT EXISTS analytics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  country VARCHAR(100),
  page VARCHAR(255),
  referrer VARCHAR(255),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Optionally, add an index for faster queries by country or page
CREATE INDEX IF NOT EXISTS idx_analytics_country ON analytics (country);
CREATE INDEX IF NOT EXISTS idx_analytics_page ON analytics (page); 