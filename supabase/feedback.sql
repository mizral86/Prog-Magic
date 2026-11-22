-- Menga Deck: "Segnala un problema" (bug e idee mandati dall'app, con
-- schermata e dettagli tecnici facoltativi).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO moderation.sql. Si può rieseguire senza problemi.
--
-- Si può segnalare anche senza account. Le segnalazioni le vedono solo i
-- moderatori (tabella app_admins) in Account → "Problemi segnalati".
-- Limiti contro gli abusi: 10 al giorno per account o dispositivo, 300 al
-- giorno in tutto da chi non ha fatto l'accesso, schermata al massimo ~600 KB.
-- Le segnalazioni chiuse da più di 6 mesi vengono cancellate da sole.

create table if not exists public.app_feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  device_id uuid,
  kind text not null check (kind in ('bug', 'idea')),
  message text not null check (char_length(message) between 1 and 2000),
  page text check (page is null or char_length(page) <= 200),
  -- Dettagli tecnici: versione, browser, schermo, ultimi errori…
  diag jsonb not null default '{}'::jsonb,
  -- Schermata come immagine JPEG "data:image/jpeg;base64,…".
  screenshot text check (screenshot is null or char_length(screenshot) <= 800000),
  status text not null default 'aperta' check (status in ('aperta', 'chiusa')),
  created_at timestamptz not null default now()
);
create index if not exists app_feedback_status_idx on public.app_feedback (status, created_at desc);
create index if not exists app_feedback_device_idx on public.app_feedback (device_id, created_at);
alter table public.app_feedback enable row level security;
-- Nessuno legge o scrive la tabella direttamente: solo tramite le funzioni qui sotto.
revoke all on public.app_feedback from anon, authenticated;

create or replace function public.send_feedback(
  fb_kind text,
  fb_message text,
  fb_page text,
  fb_diag jsonb,
  fb_screenshot text,
  fb_device uuid
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id bigint;
begin
  if coalesce(trim(fb_message), '') = '' then
    raise exception 'Scrivi cosa è successo';
  end if;
  if fb_screenshot is not null and fb_screenshot not like 'data:image/jpeg;base64,%' then
    raise exception 'Schermata non valida';
  end if;
  if me is not null then
    if (select count(*) from public.app_feedback where user_id = me and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Hai già mandato 10 segnalazioni oggi: riprova domani';
    end if;
  else
    if fb_device is null then
      raise exception 'Dispositivo sconosciuto';
    end if;
    if (select count(*) from public.app_feedback where device_id = fb_device and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Hai già mandato 10 segnalazioni oggi: riprova domani';
    end if;
    if (select count(*) from public.app_feedback where user_id is null and created_at > now() - interval '1 day') >= 300 then
      raise exception 'Troppe segnalazioni oggi: riprova domani';
    end if;
  end if;

  delete from public.app_feedback where status = 'chiusa' and created_at < now() - interval '6 months';

  insert into public.app_feedback (user_id, device_id, kind, message, page, diag, screenshot)
  values (
    me,
    fb_device,
    case when fb_kind = 'idea' then 'idea' else 'bug' end,
    left(trim(fb_message), 2000),
    left(fb_page, 200),
    coalesce(fb_diag, '{}'::jsonb),
    fb_screenshot
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.send_feedback(text, text, text, jsonb, text, uuid) from public;
grant execute on function public.send_feedback(text, text, text, jsonb, text, uuid) to anon, authenticated;

-- Elenco per i moderatori (senza schermata: si scarica a parte, è pesante).
drop function if exists public.admin_feedback(boolean);
create function public.admin_feedback(only_open boolean)
returns table (
  id bigint,
  username text,
  kind text,
  message text,
  page text,
  diag jsonb,
  has_screenshot boolean,
  status text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  return query
    select f.id, p.username, f.kind, f.message, f.page, f.diag,
           f.screenshot is not null, f.status, f.created_at
    from public.app_feedback f
    left join public.profiles p on p.id = f.user_id
    where not only_open or f.status = 'aperta'
    order by f.created_at desc
    limit 200;
end;
$$;
revoke execute on function public.admin_feedback(boolean) from public, anon;
grant execute on function public.admin_feedback(boolean) to authenticated;

create or replace function public.admin_feedback_screenshot(fid bigint)
returns text
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  return (select screenshot from public.app_feedback where id = fid);
end;
$$;
revoke execute on function public.admin_feedback_screenshot(bigint) from public, anon;
grant execute on function public.admin_feedback_screenshot(bigint) to authenticated;

create or replace function public.admin_set_feedback(fid bigint, new_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  update public.app_feedback set status = new_status where id = fid;
end;
$$;
revoke execute on function public.admin_set_feedback(bigint, text) from public, anon;
grant execute on function public.admin_set_feedback(bigint, text) to authenticated;
