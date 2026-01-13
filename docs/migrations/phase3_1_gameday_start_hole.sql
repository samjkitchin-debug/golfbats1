-- Phase 3.1: Add start hole, holes to play, and current hole index to gameday_rounds
-- Run this manually in Supabase SQL Editor

ALTER TABLE public.gameday_rounds
  ADD COLUMN IF NOT EXISTS start_hole integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS holes_to_play integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS current_hole_index integer NOT NULL DEFAULT 0;

-- Add constraint: start_hole must be between 1 and 18
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gameday_rounds_start_hole'
  ) THEN
    ALTER TABLE public.gameday_rounds
      ADD CONSTRAINT chk_gameday_rounds_start_hole
      CHECK (start_hole BETWEEN 1 AND 18);
  END IF;
END $$;

-- Add constraint: holes_to_play must be 9 or 18
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gameday_rounds_holes_to_play'
  ) THEN
    ALTER TABLE public.gameday_rounds
      ADD CONSTRAINT chk_gameday_rounds_holes_to_play
      CHECK (holes_to_play IN (9, 18));
  END IF;
END $$;

-- Add constraint: current_hole_index must be between 0 and 17
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gameday_rounds_current_hole_index'
  ) THEN
    ALTER TABLE public.gameday_rounds
      ADD CONSTRAINT chk_gameday_rounds_current_hole_index
      CHECK (current_hole_index BETWEEN 0 AND 17);
  END IF;
END $$;
