-- Headland — split a distinct 6th-year stubble off the "5th+" bucket.
--
-- The grower tracks 6th-year cane as its own thing (own color on his crop
-- maps). Rather than migrate data, we reinterpret the existing
-- `fifth_stubble_plus` value as just "5th" and add a new `sixth_stubble_plus`
-- for 6th-and-beyond. Existing rows need no change — they were 5th anyway.
--
-- Note: ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- then references the new value. This statement stands alone, so it's safe.

alter type ratoon_stage add value if not exists 'sixth_stubble_plus' after 'fifth_stubble_plus';
