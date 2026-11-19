-- Menga Deck: pannello delle segnalazioni per chi gestisce l'app.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO account.sql. Si può rieseguire senza problemi.
--
-- PRIMA DI ESEGUIRE: nell'ultima riga sostituisci LA-TUA-EMAIL@esempio.it con
-- l'email con cui accedi all'app. Quell'account vedrà in Account il pannello
-- "Segnalazioni" e un pallino rosso sull'icona del profilo quando ce ne sono
-- di nuove. Per aggiungere altri moderatori basta rieseguire l'ultima riga
-- con la loro email.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Vero se chi chiama è un moderatore.
create or replace function public.is_app_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- Segnalazioni (aperte o tutte), le più recenti prima.
drop function if exists public.admin_reports(boolean);
create function public.admin_reports(only_open boolean)
returns table (
  id bigint,
  reporter uuid,
  reporter_username text,
  reported uuid,
  reported_username text,
  reported_exists boolean,
  reason text,
  details text,
  messages jsonb,
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
    select r.id, r.reporter, rp.username, r.reported, r.reported_username,
           r.reported is not null, r.reason, r.details, r.messages, r.status, r.created_at
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter
    where not only_open or r.status = 'aperta'
    order by r.created_at desc
    limit 200;
end;
$$;
revoke execute on function public.admin_reports(boolean) from public, anon;
grant execute on function public.admin_reports(boolean) to authenticated;

-- Segna una segnalazione come chiusa (o la riapre).
create or replace function public.admin_set_report(rid bigint, new_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  update public.reports set status = new_status where id = rid;
end;
$$;
revoke execute on function public.admin_set_report(bigint, text) from public, anon;
grant execute on function public.admin_set_report(bigint, text) to authenticated;

-- Cancella l'account di un utente che viola le regole (come se lo
-- eliminasse lui: i suoi gruppi passano al membro più vecchio).
create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  g record;
  heir uuid;
begin
  if not public.is_app_admin() then
    raise exception 'Solo per i moderatori';
  end if;
  if target = auth.uid() then
    raise exception 'Per il tuo account usa Elimina account';
  end if;
  if exists (select 1 from public.app_admins where user_id = target) then
    raise exception 'Non puoi cancellare un altro moderatore';
  end if;
  if to_regclass('public.play_groups') is not null then
    for g in select id from public.play_groups where owner = target loop
      heir := null;
      select m.user_id into heir
      from public.group_members m
      where m.group_id = g.id and m.user_id <> target
      order by m.joined_at
      limit 1;
      if heir is null then
        delete from public.play_groups where id = g.id;
      else
        update public.play_groups set owner = heir where id = g.id;
      end if;
    end loop;
  end if;
  delete from auth.users where id = target;
  update public.reports set status = 'chiusa' where reported is null and status = 'aperta';
end;
$$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Il tuo account diventa moderatore (sostituisci l'email!).
insert into public.app_admins (user_id)
select id from auth.users where lower(email) = lower('LA-TUA-EMAIL@esempio.it')
on conflict do nothing;
