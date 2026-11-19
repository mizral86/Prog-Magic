-- Menga Deck: eliminazione dell'account, utenti bloccati e segnalazioni.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO schema.sql, friends.sql, groups.sql e avatar.sql.
-- Si può rieseguire senza problemi (non cancella blocchi né segnalazioni).
--
-- Cosa crea:
--   delete_my_account()  cancella l'account di chi la chiama e tutti i suoi
--                         dati (collezione, profilo, amici, messaggi). I gruppi
--                         che aveva creato passano al membro più vecchio.
--   blocks                chi hai bloccato: non può scriverti, mandarti
--                         richieste né trovarti nella ricerca
--   reports               segnalazioni, con una copia degli ultimi messaggi.
--                         Si leggono da Supabase → Table Editor → reports.

-- ---------------------------------------------------------------------------
-- Eliminazione dell'account

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  g record;
  heir uuid;
begin
  if me is null then
    raise exception 'Serve l''accesso';
  end if;

  -- I gruppi creati da chi se ne va non spariscono per gli altri: passano
  -- al membro entrato per primo. Se era rimasto solo lui, si cancellano.
  if to_regclass('public.play_groups') is not null then
    for g in select id from public.play_groups where owner = me loop
      heir := null;
      select m.user_id into heir
      from public.group_members m
      where m.group_id = g.id and m.user_id <> me
      order by m.joined_at
      limit 1;
      if heir is null then
        delete from public.play_groups where id = g.id;
      else
        update public.play_groups set owner = heir where id = g.id;
      end if;
    end loop;
  end if;

  -- Tutto il resto (user_data, profilo, amicizie, messaggi, blocchi) è
  -- collegato all'account con "on delete cascade" e se ne va con lui.
  delete from auth.users where id = me;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Utenti bloccati

create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_not_self check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);

alter table public.blocks enable row level security;

-- Vedi (e togli) solo i blocchi che hai messo tu: chi è bloccato non lo sa.
drop policy if exists "Vedi chi hai bloccato" on public.blocks;
create policy "Vedi chi hai bloccato" on public.blocks
  for select to authenticated using (blocker = auth.uid());

drop policy if exists "Sblocca" on public.blocks;
create policy "Sblocca" on public.blocks
  for delete to authenticated using (blocker = auth.uid());

revoke insert, update on public.blocks from anon, authenticated;

-- Vero se uno dei due ha bloccato l'altro.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker = a and k.blocked = b) or (k.blocker = b and k.blocked = a)
  );
$$;

-- Blocca: toglie anche l'amicizia o la richiesta tra i due.
create or replace function public.block_user(other uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Serve l''accesso';
  end if;
  if other = auth.uid() then
    raise exception 'Non puoi bloccare te stesso';
  end if;
  insert into public.blocks (blocker, blocked) values (auth.uid(), other)
  on conflict do nothing;
  delete from public.friendships
  where (requester = auth.uid() and addressee = other)
     or (requester = other and addressee = auth.uid());
end;
$$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- Il nome di chi hai bloccato resta visibile a te (per poterlo sbloccare).
drop policy if exists "Vedi profili bloccati" on public.profiles;
create policy "Vedi profili bloccati" on public.profiles
  for select to authenticated
  using (exists (select 1 from public.blocks k where k.blocker = auth.uid() and k.blocked = id));

-- Niente messaggi né richieste tra chi è bloccato.
drop policy if exists "Scrivi agli amici" on public.messages;
create policy "Scrivi agli amici" on public.messages
  for insert to authenticated
  with check (
    sender = auth.uid()
    and public.are_friends(sender, receiver)
    and not public.is_blocked(sender, receiver)
  );

drop policy if exists "Manda richieste" on public.friendships;
create policy "Manda richieste" on public.friendships
  for insert to authenticated
  with check (
    requester = auth.uid()
    and status = 'pending'
    and not public.is_blocked(requester, addressee)
  );

-- La ricerca non mostra chi hai bloccato né chi ha bloccato te.
drop function if exists public.search_profiles(text);
create function public.search_profiles(q text)
returns table (id uuid, username text, display_name text, avatar text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and p.id <> auth.uid()
    and char_length(trim(q)) >= 2
    and not public.is_blocked(auth.uid(), p.id)
    and (
      p.username like lower(replace(replace(trim(q), '%', ''), '_', '\_')) || '%'
      or lower(u.email) = lower(trim(q))
    )
  order by p.username
  limit 10;
$$;
revoke execute on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Segnalazioni

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid references public.profiles (id) on delete set null,
  reported uuid references public.profiles (id) on delete set null,
  -- Nome utente al momento della segnalazione (resta anche se cambia).
  reported_username text,
  reason text not null check (reason in ('spam', 'molestie', 'inappropriato', 'truffa', 'altro')),
  details text check (details is null or char_length(details) <= 1000),
  -- Ultimi messaggi tra i due: [{ "from": "reporter"|"reported", "body", "at" }]
  messages jsonb not null default '[]'::jsonb,
  status text not null default 'aperta' check (status in ('aperta', 'chiusa')),
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;
-- Nessuna regola di lettura o scrittura per gli utenti: si segnala solo con
-- report_user() e le segnalazioni le legge solo il proprietario del progetto
-- dal pannello di Supabase.
revoke all on public.reports from anon, authenticated;

create or replace function public.report_user(other uuid, why text, note text, also_block boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Serve l''accesso';
  end if;
  if other = me then
    raise exception 'Non puoi segnalare te stesso';
  end if;
  if (select count(*) from public.reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Troppe segnalazioni oggi: riprova domani';
  end if;
  insert into public.reports (reporter, reported, reported_username, reason, details, messages)
  values (
    me,
    other,
    (select username from public.profiles where id = other),
    why,
    nullif(trim(left(coalesce(note, ''), 1000)), ''),
    coalesce((
      select jsonb_agg(x order by x->>'at')
      from (
        select jsonb_build_object(
          'from', case when m.sender = me then 'reporter' else 'reported' end,
          'body', m.body,
          'at', m.created_at
        ) as x
        from public.messages m
        where (m.sender = me and m.receiver = other) or (m.sender = other and m.receiver = me)
        order by m.created_at desc
        limit 30
      ) last
    ), '[]'::jsonb)
  );
  if also_block then
    perform public.block_user(other);
  end if;
end;
$$;
revoke execute on function public.report_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated;
