-- Spanish notes for record printouts (translated best-effort at log time —
-- most field crews are Spanish-speaking), and stroke width on hand-drawn
-- line annotations (freehand + point-to-point thickness choice).
alter table operation_events
  add column if not exists detail_es text;

alter table map_annotations
  add column if not exists width numeric;
