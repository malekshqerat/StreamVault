-- Add last_active column to track guest activity for cleanup
ALTER TABLE users ADD COLUMN last_active INTEGER;
-- Backfill existing users with their created_at value
UPDATE users SET last_active = created_at WHERE last_active IS NULL;
