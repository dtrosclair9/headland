-- Text annotations get a size and rotation, so a big "N" for north or a
-- small landmark note both read right on the map and the printed sheets.

alter table map_annotations
  add column size int not null default 16 check (size between 8 and 64),
  add column rotation int not null default 0 check (rotation between -180 and 180);
