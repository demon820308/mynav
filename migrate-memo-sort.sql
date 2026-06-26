-- Add sort_order column to existing memos table
-- Run: wrangler d1 execute nav-db --file=migrate-memo-sort.sql

ALTER TABLE memos ADD COLUMN sort_order INTEGER DEFAULT 0;
