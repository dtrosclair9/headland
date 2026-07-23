-- spatial_ref_sys hardening. The PostGIS catalog table can't get RLS (owned
-- by supabase_admin) and can't be revoked or relocated by us — yet the anon
-- role can WRITE to it through the Data API (verified live 2026-07-22), and
-- corrupting srid 4326 would break every geometry operation in the app.
-- Until Supabase support revokes those grants, this guard makes tampering
-- self-healing: a protected snapshot + a 5-minute integrity check restore.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Protected snapshot (postgres-owned; not API-exposed — private schema).
create table if not exists private.srs_backup as select * from public.spatial_ref_sys;

create table if not exists private.srs_guard_log (
  id bigint generated always as identity primary key,
  detected_at timestamptz not null default now(),
  detail text not null
);

create or replace function private.srs_guard() returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  live_hash text;
  backup_hash text;
begin
  select md5(string_agg(srid::text || coalesce(auth_name,'') || coalesce(auth_srid::text,'')
             || coalesce(srtext,'') || coalesce(proj4text,''), ',' order by srid))
    into live_hash from public.spatial_ref_sys;
  select md5(string_agg(srid::text || coalesce(auth_name,'') || coalesce(auth_srid::text,'')
             || coalesce(srtext,'') || coalesce(proj4text,''), ',' order by srid))
    into backup_hash from private.srs_backup;
  if live_hash is distinct from backup_hash then
    -- Tampered (or drifted): restore the catalog from the snapshot.
    delete from public.spatial_ref_sys;
    insert into public.spatial_ref_sys select * from private.srs_backup;
    insert into private.srs_guard_log (detail)
      values ('spatial_ref_sys drift detected and restored from snapshot');
  end if;
end;
$$;
revoke all on function private.srs_guard() from public, anon, authenticated;

-- Every 5 minutes.
select cron.schedule('srs-guard', '*/5 * * * *', $$select private.srs_guard()$$);
