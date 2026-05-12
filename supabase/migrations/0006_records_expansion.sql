-- Headland — records (harvests + applications/operations) expansion.
-- Goal: capture state-aware field operations beyond the original 6 application types.
-- LA workflow: post-harvest stubble shave + trash burn. FL: pre-harvest burn (or green harvest).

-- Expand application_type with the field-event vocabulary growers actually use.
alter type application_type add value if not exists 'pre_harvest_burn';
alter type application_type add value if not exists 'post_harvest_burn';
alter type application_type add value if not exists 'green_harvest';
alter type application_type add value if not exists 'stubble_shave';
alter type application_type add value if not exists 'sub_soiling';
alter type application_type add value if not exists 'cultivation';
alter type application_type add value if not exists 'layby';

-- Tillage / burn ops have no product; allow null.
alter table applications alter column product drop not null;
