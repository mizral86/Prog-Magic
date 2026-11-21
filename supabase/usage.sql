-- Menga Deck: statistiche di utilizzo (chi usa l'app e per quanto tempo).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO moderation.sql. Si può rieseguire senza problemi.
--
-- Come funziona: mentre l'app è aperta e in primo piano, ogni minuto manda
-- quanto tempo è stata usata e in quali sezioni. Ogni dispositivo ha un
-- codice casuale (non legato a nome, email o telefono); se la persona ha fatto
-- l'accesso, la sessione viene collegata anche al suo account.
-- Le statistiche le vedono solo i moderatori (tabella app_admins), in
-- Account → "Statistiche di utilizzo". I dati più vecchi di 13 mesi vengono
-- cancellati da soli.

create table if not exists public.usage_sessions (
  id uuid primary key,
  device_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  active_seconds integer not null default 0,
  sections jsonb not null default '{}'::jsonb,
  installed boolean not null default false,
  platform text
);
create index if not exists usage_sessions_started_idx on public.usage_sessions (started_at desc);
create index if not exists usage_sessions_device_idx on public.usage_sessions (device_id, started_at);
create index if not exists usage_sessions_user_idx on public.usage_sessions (user_id);
alter table public.usage_sessions enable row level security;
-- Nessuno legge o scrive la tabella direttamente: solo tramite le funzioni qui sotto.
revoke all on public.usage_sessions from anon, authenticated;

-- Chiamata dall'app (anche senza accesso) per aggiornare la sessione in corso.
drop function if exists public.usage_ping(uuid, uuid, integer, jsonb, boolean, text);
create function public.usage_ping(
  sid uuid,
  device uuid,
  secs integer,
  secs_by_section jsonb,
  is_installed boolean,
  plat text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  clean jsonb := '{}'::jsonb;
  k text;
  v integer;
  s integer := greatest(0, least(coalesce(secs, 0), 86400));
begin
  -- Solo le sezioni dell'app, con valori sensati.
  if jsonb_typeof(secs_by_section) = 'object' then
    for k in select jsonb_object_keys(secs_by_section) loop
      if k in ('cerca', 'collezione', 'mazzi', 'simula', 'gioca', 'scansiona', 'amici', 'gruppi', 'account') then
        begin
          v := greatest(0, least((secs_by_section ->> k)::integer, s));
          clean := clean || jsonb_build_object(k, v);
        exception when others then
          null;
        end;
      end if;
    end loop;
  end if;
  if plat is not null and plat not in ('android', 'ios', 'computer') then
    plat := null;
  end if;

  if exists (select 1 from public.usage_sessions where id = sid) then
    update public.usage_sessions u
       set last_seen = now(),
           -- Non può superare il tempo passato dall'inizio della sessione.
           active_seconds = greatest(u.active_seconds,
             least(s, extract(epoch from now() - u.started_at)::integer + 90)),
           sections = clean,
           user_id = coalesce(auth.uid(), u.user_id),
           installed = coalesce(is_installed, false)
     where u.id = sid
       and u.device_id = device
       and u.started_at > now() - interval '1 day';
  else
    -- Freno contro chi volesse riempire il database: al massimo 600 sessioni
    -- nuove al minuto in tutto (molto sopra l'uso normale).
    if (select count(*) from public.usage_sessions where started_at > now() - interval '1 minute') >= 600 then
      return;
    end if;
    insert into public.usage_sessions (id, device_id, user_id, active_seconds, sections, installed, platform)
    values (sid, device, auth.uid(), least(s, 90), clean, coalesce(is_installed, false), plat)
    on conflict (id) do nothing;
    -- Ogni tanto, pulizia dei dati più vecchi di 13 mesi.
    if random() < 0.02 then
      delete from public.usage_sessions where started_at < now() - interval '13 months';
    end if;
  end if;
end;
$$;
revoke execute on function public.usage_ping(uuid, uuid, integer, jsonb, boolean, text) from public;
grant execute on function public.usage_ping(uuid, uuid, integer, jsonb, boolean, text) to anon, authenticated;

-- Riepilogo per i moderatori degli ultimi N giorni (giorni contati sull'ora italiana).
drop function if exists public.admin_usage_stats(integer);
create function public.admin_usage_stats(days integer)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  since timestamptz;
  result jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  days := greatest(1, least(coalesce(days, 30), 400));
  since := (date_trunc('day', now() at time zone 'Europe/Rome') - make_interval(days => days - 1))
           at time zone 'Europe/Rome';

  with s as (
    select * from public.usage_sessions where started_at >= since and active_seconds > 0
  ),
  first_seen as (
    select device_id, min(started_at) as first_at from public.usage_sessions group by device_id
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'devices', count(distinct s.device_id),
        'accounts', count(distinct s.user_id),
        'sessions', count(*),
        'seconds', coalesce(sum(s.active_seconds), 0),
        'installed_devices', count(distinct s.device_id) filter (where s.installed),
        'new_devices', (select count(*) from first_seen f
                        where f.first_at >= since
                          and exists (select 1 from s s2 where s2.device_id = f.device_id)),
        'active_now', (select count(distinct device_id) from public.usage_sessions
                       where last_seen > now() - interval '3 minutes')
      ) from s
    ),
    'days', coalesce((
      select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object(
          'day', to_char(started_at at time zone 'Europe/Rome', 'YYYY-MM-DD'),
          'devices', count(distinct device_id),
          'sessions', count(*),
          'seconds', sum(active_seconds)
        ) as d
        from s group by to_char(started_at at time zone 'Europe/Rome', 'YYYY-MM-DD')
      ) x
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_object_agg(key, total) from (
        select e.key, sum((e.value)::integer) as total
        from s, jsonb_each_text(s.sections) e
        group by e.key
      ) y
    ), '{}'::jsonb),
    'platforms', coalesce((
      select jsonb_object_agg(coalesce(platform, 'altro'), n) from (
        select platform, count(distinct device_id) as n from s group by platform
      ) z
    ), '{}'::jsonb),
    'users', coalesce((
      select jsonb_agg(u order by (u->>'seconds')::integer desc) from (
        select jsonb_build_object(
          'username', p.username,
          'display_name', p.display_name,
          'sessions', count(*),
          'seconds', sum(s.active_seconds),
          'devices', count(distinct s.device_id),
          'last_seen', max(s.last_seen),
          -- Le due sezioni dove passa più tempo nel periodo.
          'top_sections', (
            select jsonb_agg(k order by tot desc) from (
              select e.key as k, sum((e.value)::integer) as tot
              from s s3, jsonb_each_text(s3.sections) e
              where s3.user_id = s.user_id
              group by e.key order by tot desc limit 2
            ) q
          )
        ) as u
        from s left join public.profiles p on p.id = s.user_id
        where s.user_id is not null
        group by s.user_id, p.username, p.display_name
        order by sum(s.active_seconds) desc
        limit 200
      ) w
    ), '[]'::jsonb),
    'guests', (
      select jsonb_build_object(
        'devices', count(distinct device_id),
        'sessions', count(*),
        'seconds', coalesce(sum(active_seconds), 0)
      ) from s
      where user_id is null
        -- Dispositivi che non hanno mai fatto l'accesso nel periodo.
        and device_id not in (select device_id from s where user_id is not null)
    )
  ) into result;
  return result;
end;
$$;
revoke execute on function public.admin_usage_stats(integer) from public, anon;
grant execute on function public.admin_usage_stats(integer) to authenticated;

-- Quando un account viene eliminato, le sue sessioni restano solo come
-- numeri anonimi (user_id torna vuoto grazie a "on delete set null").

-- Tutti gli account registrati (anche chi non ha ancora usato l'app dopo
-- questo script), con iscrizione, ultimo accesso e tempo d'uso totale.
-- "Ultima attività" usa anche lo stato online degli Amici, che esiste da prima.
drop function if exists public.admin_registered_users();
create function public.admin_registered_users()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  return coalesce((
    select jsonb_agg(r order by (r->>'last_active') desc nulls last)
    from (
      select jsonb_build_object(
        'email', u.email,
        'username', p.username,
        'display_name', p.display_name,
        'created_at', u.created_at,
        'last_sign_in', u.last_sign_in_at,
        'last_active', greatest(u.last_sign_in_at, p.last_seen, x.last_seen),
        'confirmed', u.email_confirmed_at is not null,
        'sessions', coalesce(x.sessions, 0),
        'seconds', coalesce(x.seconds, 0),
        'top_sections', (
          select jsonb_agg(k order by tot desc) from (
            select e.key as k, sum((e.value)::integer) as tot
            from public.usage_sessions us, jsonb_each_text(us.sections) e
            where us.user_id = u.id
            group by e.key order by tot desc limit 2
          ) q
        )
      ) as r
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join (
        select user_id, count(*) as sessions, sum(active_seconds) as seconds, max(last_seen) as last_seen
        from public.usage_sessions where user_id is not null group by user_id
      ) x on x.user_id = u.id
    ) t
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_registered_users() from public, anon;
grant execute on function public.admin_registered_users() to authenticated;
