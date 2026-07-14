-- App-level rate limiting: a fixed-window counter keyed by "action:identifier"
-- (org id for tenant actions, IP for pre-login auth actions). One atomic RPC
-- increments and reports whether the caller is under the limit. Not user data,
-- so no RLS — the table is reachable only through the SECURITY DEFINER function.
create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

create or replace function public.rate_limit_hit(
  p_key text, p_limit int, p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limits (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1 else rate_limits.count + 1 end,
        window_start = case
          when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now() else rate_limits.window_start end
    returning count into v_count;
  return v_count <= p_limit; -- true = allowed, false = over the limit
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public;
grant execute on function public.rate_limit_hit(text, int, int) to anon, authenticated, service_role;
