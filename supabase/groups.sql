-- Menga Magic: gruppi di amici, partite registrate dal segnapunti e tornei.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO friends.sql (usa le tabelle profiles e friendships).
-- Si può rieseguire senza problemi (non cancella gruppi, partite o tornei).
--
-- Cosa crea:
--   play_groups    i gruppi (es. "Venerdì da Marco")
--   group_members  chi fa parte di ogni gruppo
--   group_games    partite registrate (giocatori, vincitore, vita finale…)
--   tournaments    tornei del gruppo: iscritti, turni e risultati in un JSON
-- Le regole RLS fanno sì che ogni gruppo lo vedano e lo usino solo i suoi
-- membri, e che si possano aggiungere al gruppo solo i propri amici.

-- ---------------------------------------------------------------------------
-- Gruppi e membri

create table if not exists public.play_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  owner uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.play_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- Vero se l'account fa parte del gruppo.
create or replace function public.is_group_member(g uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.group_members m where m.group_id = g and m.user_id = u);
$$;

-- Vero se i due account sono insieme in almeno un gruppo (per vedere il nome).
create or replace function public.share_group(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members x
    join public.group_members y on y.group_id = x.group_id
    where x.user_id = a and y.user_id = b
  );
$$;

-- Crea un gruppo e ci mette dentro chi lo crea, in un colpo solo.
create or replace function public.create_play_group(group_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Serve l''accesso';
  end if;
  insert into public.play_groups (name, owner) values (trim(group_name), auth.uid()) returning id into gid;
  insert into public.group_members (group_id, user_id, added_by) values (gid, auth.uid(), auth.uid());
  return gid;
end;
$$;
revoke execute on function public.create_play_group(text) from public, anon;
grant execute on function public.create_play_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Partite registrate

create table if not exists public.group_games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.play_groups (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  played_at timestamptz not null default now(),
  -- [{ "uid": uuid|null, "name": text, "life": int, "winner": bool, "out": text|null }]
  players jsonb not null check (jsonb_typeof(players) = 'array' and jsonb_array_length(players) between 1 and 8),
  start_life int,
  commander boolean not null default false,
  duration_min int,
  note text check (note is null or char_length(note) <= 300),
  tournament_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists group_games_group_idx on public.group_games (group_id, played_at desc);

-- ---------------------------------------------------------------------------
-- Tornei

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.play_groups (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  kind text not null check (kind in ('swiss', 'roundrobin', 'elimination')),
  status text not null default 'open' check (status in ('open', 'running', 'done')),
  -- Iscritti, turni, abbinamenti e risultati (vedi src/tournament.ts).
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tournaments_group_idx on public.tournaments (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Regole di accesso (RLS)

alter table public.play_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_games enable row level security;
alter table public.tournaments enable row level security;

-- Gruppi: li vedono i membri; il nome lo cambia chi l'ha creato; lo
-- cancella (con partite e tornei) solo chi l'ha creato. Si creano con
-- create_play_group().
drop policy if exists "Vedi i tuoi gruppi" on public.play_groups;
create policy "Vedi i tuoi gruppi" on public.play_groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()));

drop policy if exists "Rinomina il tuo gruppo" on public.play_groups;
create policy "Rinomina il tuo gruppo" on public.play_groups
  for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "Cancella il tuo gruppo" on public.play_groups;
create policy "Cancella il tuo gruppo" on public.play_groups
  for delete to authenticated
  using (owner = auth.uid());

-- Membri: li vedono i membri dello stesso gruppo. Un membro può aggiungere
-- solo un proprio amico. Ognuno può uscire; chi ha creato il gruppo può
-- togliere chiunque.
drop policy if exists "Vedi i membri" on public.group_members;
create policy "Vedi i membri" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Aggiungi amici al gruppo" on public.group_members;
create policy "Aggiungi amici al gruppo" on public.group_members
  for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
    and public.are_friends(auth.uid(), user_id)
  );

drop policy if exists "Esci o togli dal gruppo" on public.group_members;
create policy "Esci o togli dal gruppo" on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.play_groups g where g.id = group_id and g.owner = auth.uid())
  );

-- Partite: le vedono e le registrano i membri; le cancella chi le ha
-- registrate o chi ha creato il gruppo.
drop policy if exists "Vedi le partite del gruppo" on public.group_games;
create policy "Vedi le partite del gruppo" on public.group_games
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Registra partite" on public.group_games;
create policy "Registra partite" on public.group_games
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_group_member(group_id, auth.uid()));

drop policy if exists "Cancella partite" on public.group_games;
create policy "Cancella partite" on public.group_games
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.play_groups g where g.id = group_id and g.owner = auth.uid())
  );

-- Tornei: tutti i membri li vedono, li creano e segnano i risultati; li
-- cancella chi li ha creati o chi ha creato il gruppo.
drop policy if exists "Vedi i tornei" on public.tournaments;
create policy "Vedi i tornei" on public.tournaments
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Crea tornei" on public.tournaments;
create policy "Crea tornei" on public.tournaments
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_group_member(group_id, auth.uid()));

drop policy if exists "Aggiorna tornei" on public.tournaments;
create policy "Aggiorna tornei" on public.tournaments
  for update to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists "Cancella tornei" on public.tournaments;
create policy "Cancella tornei" on public.tournaments
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.play_groups g where g.id = group_id and g.owner = auth.uid())
  );

-- Colonne modificabili: del gruppo solo il nome; del torneo nome, stato,
-- dati e data di modifica (mai il gruppo o chi l'ha creato). Le partite non
-- si modificano: si cancellano e si registrano di nuovo.
revoke update on public.play_groups from anon, authenticated;
grant update (name) on public.play_groups to authenticated;
revoke update on public.group_members from anon, authenticated;
revoke update on public.group_games from anon, authenticated;
revoke update on public.tournaments from anon, authenticated;
grant update (name, status, data, updated_at) on public.tournaments to authenticated;

-- Profili: oltre ad amici e richieste, si vedono i nomi di chi è nello
-- stesso gruppo (anche se non siete amici diretti).
drop policy if exists "Vedi profili del gruppo" on public.profiles;
create policy "Vedi profili del gruppo" on public.profiles
  for select to authenticated
  using (public.share_group(auth.uid(), id));

-- ---------------------------------------------------------------------------
-- Aggiornamenti in tempo reale (risultati dei tornei e partite nuove).

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['group_members', 'group_games', 'tournaments'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
