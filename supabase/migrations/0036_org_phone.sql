-- Optional cell number collected at signup — so a new farm can actually be
-- called for setup help, not just emailed (Thomas Farms lesson).
alter table organizations
  add column if not exists phone text;
