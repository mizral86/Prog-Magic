-- Menga Magic: amici, stato online e chat.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run.
-- Si può rieseguire senza problemi (non cancella amici né messaggi).
--
-- Cosa crea:
--   profiles     nome utente pubblico di ogni account (niente email)
--   friendships  richieste di amicizia: "pending" finché l'altro non accetta
--   messages     messaggi della chat, solo tra amici
-- Le regole RLS fanno sì che ognuno veda solo le proprie amicizie e i propri
-- messaggi, e possa scrivere solo ai propri amici.

-- ---------------------------------------------------------------------------
-- Profili

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,20}$')
);
create unique index if not exists profiles_username_key on public.profiles (username);

-- Immagine profilo: illustrazione di un planeswalker scelta dalla galleria
-- (solo immagini di Scryfall). Per chi aveva già eseguito questo file prima
-- delle immagini c'è anche supabase/avatar.sql, che fa solo questa parte.
alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_url;
alter table public.profiles add constraint profiles_avatar_url check (
  avatar is null
  or avatar ~ '^sym:[WUBRGC]{1,3}$'
  or (avatar ~ '^https://cards\.scryfall\.io/[^"''()[:space:]]+$' and char_length(avatar) <= 300)
);

-- ---------------------------------------------------------------------------
-- Amicizie

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friendships_not_self check (requester <> addressee)
);
-- Una sola amicizia per coppia, in qualunque direzione.
create unique index if not exists friendships_pair_key on public.friendships (
  least(requester, addressee), greatest(requester, addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- Vero se i due account sono amici (richiesta accettata).
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- Vero se tra i due c'è una richiesta o un'amicizia (serve per vedere il nome).
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where (f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)
  );
$$;

-- ---------------------------------------------------------------------------
-- Messaggi

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  receiver uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair_idx on public.messages (
  least(sender, receiver), greatest(sender, receiver), created_at desc
);
create index if not exists messages_unread_idx on public.messages (receiver) where read_at is null;

-- ---------------------------------------------------------------------------
-- Regole di accesso (RLS)

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;

-- Profili: vedi il tuo e quelli delle persone con cui hai una richiesta o
-- un'amicizia. Per trovare qualcuno di nuovo si usa search_profiles().
drop policy if exists "Vedi profili collegati" on public.profiles;
create policy "Vedi profili collegati" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.are_connected(auth.uid(), id));

drop policy if exists "Crea il tuo profilo" on public.profiles;
create policy "Crea il tuo profilo" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "Aggiorna il tuo profilo" on public.profiles;
create policy "Aggiorna il tuo profilo" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Amicizie: le vedono solo i due interessati.
drop policy if exists "Vedi le tue amicizie" on public.friendships;
create policy "Vedi le tue amicizie" on public.friendships
  for select to authenticated
  using (auth.uid() in (requester, addressee));

-- Mandi richieste solo a tuo nome e sempre "in attesa".
drop policy if exists "Manda richieste" on public.friendships;
create policy "Manda richieste" on public.friendships
  for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');

-- Solo chi riceve la richiesta la può accettare.
drop policy if exists "Accetta richieste" on public.friendships;
create policy "Accetta richieste" on public.friendships
  for update to authenticated
  using (addressee = auth.uid())
  with check (addressee = auth.uid() and status = 'accepted');

-- Rifiutare, annullare o togliere un amico: lo può fare ciascuno dei due.
drop policy if exists "Togli amicizie" on public.friendships;
create policy "Togli amicizie" on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- Messaggi: li vedono mittente e destinatario.
drop policy if exists "Vedi i tuoi messaggi" on public.messages;
create policy "Vedi i tuoi messaggi" on public.messages
  for select to authenticated
  using (auth.uid() in (sender, receiver));

-- Scrivi solo a tuo nome e solo ai tuoi amici.
drop policy if exists "Scrivi agli amici" on public.messages;
create policy "Scrivi agli amici" on public.messages
  for insert to authenticated
  with check (sender = auth.uid() and public.are_friends(sender, receiver));

-- Chi riceve segna i messaggi come letti.
drop policy if exists "Segna come letto" on public.messages;
create policy "Segna come letto" on public.messages
  for update to authenticated
  using (receiver = auth.uid()) with check (receiver = auth.uid());

-- Chi scrive può cancellare i propri messaggi.
drop policy if exists "Cancella i tuoi messaggi" on public.messages;
create policy "Cancella i tuoi messaggi" on public.messages
  for delete to authenticated
  using (sender = auth.uid());

-- Colonne modificabili: chi accetta cambia solo stato e data, chi legge solo
-- read_at; nessuno può riscrivere mittente, destinatario o testo.
revoke update on public.friendships from anon, authenticated;
grant update (status, accepted_at) on public.friendships to authenticated;
revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, last_seen, avatar) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Ricerca di nuovi amici: per nome utente (inizio del nome) o per email
-- esatta. Restituisce solo id, nome utente, nome visualizzato e immagine,
-- mai l'email.

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
-- Aggiornamenti in tempo reale (nuovi messaggi e richieste senza ricaricare).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
    ) then
      alter publication supabase_realtime add table public.friendships;
    end if;
  end if;
end $$;

