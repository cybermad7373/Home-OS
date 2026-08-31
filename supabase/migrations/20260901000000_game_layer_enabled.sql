-- 20260901000000_game_layer_enabled.sql
-- Add game_layer_enabled column to house_settings table

ALTER TABLE house_settings
ADD COLUMN IF NOT EXISTS game_layer_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN house_settings.game_layer_enabled IS
  'When true, the gamification layer (streaks, badges, game points) is visible to members. Admin-only toggle.';