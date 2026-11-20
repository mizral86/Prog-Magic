-- Menga Deck: limiti contro gli abusi (dimensioni e frequenza).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO tutti gli altri file (schema, friends, groups, avatar, account,
-- moderation). Si può rieseguire senza problemi.
--
-- Il piano gratuito di Supabase ha 500 MB di database: senza limiti un solo
-- account malintenzionato potrebbe riempirlo, o inondare un amico di messaggi.
-- I valori sono molto sopra l'uso normale: un utente vero non li vede mai.

-- ---------------------------------------------------------------------------
-- Dimensioni

-- Dati dell'app di un profilo (collezione, mazzi, ecc.): al massimo 6 MB,
-- più del limite di memoria di un browser (circa 5 MB).
alter table public.user_data drop constraint if exists user_data_size;
alter table public.user_data add constraint user_data_size
  check (octet_length(data::text) <= 6000000) not valid;

-- Nome da mostrare: al massimo 40 caratteri, come nell'app.
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 40) not valid;

-- Dati di un torneo (iscritti, turni, risultati): al massimo 500 KB.
alter table public.tournaments drop constraint if exists tournaments_data_size;
alter table public.tournaments add constraint tournaments_data_size
  check (octet_length(data::text) <= 500000) not valid;

-- ---------------------------------------------------------------------------
-- Frequenza

create index if not exists messages_sender_time_idx on public.messages (sender, created_at desc);
create index if not exists friendships_requester_time_idx on public.friendships (requester, created_at desc);

-- Chat: al massimo 30 messaggi al minuto e 1000 al giorno per account.
create or replace function public.limit_messages()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.messages
      where sender = new.sender and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Troppi messaggi in poco tempo: aspetta un minuto.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages
      where sender = new.sender and created_at > now() - interval '1 day') >= 1000 then
    raise exception 'Hai raggiunto il limite di messaggi di oggi: riprova domani.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_messages on public.messages;
create trigger limit_messages before insert on public.messages
  for each row execute function public.limit_messages();

-- Richieste di amicizia: al massimo 30 all'ora.
create or replace function public.limit_friend_requests()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.friendships
      where requester = new.requester and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Troppe richieste di amicizia: riprova tra un''ora.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_friend_requests on public.friendships;
create trigger limit_friend_requests before insert on public.friendships
  for each row execute function public.limit_friend_requests();

-- Gruppi: al massimo 20 creati da ciascun account; tornei: 50 per gruppo;
-- partite registrate: 200 al giorno per gruppo.
create or replace function public.limit_groups()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.play_groups where owner = new.owner) >= 20 then
    raise exception 'Hai già creato 20 gruppi: cancellane uno per crearne un altro.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_groups on public.play_groups;
create trigger limit_groups before insert on public.play_groups
  for each row execute function public.limit_groups();

create or replace function public.limit_tournaments()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.tournaments where group_id = new.group_id) >= 50 then
    raise exception 'Questo gruppo ha già 50 tornei: cancellane qualcuno vecchio.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_tournaments on public.tournaments;
create trigger limit_tournaments before insert on public.tournaments
  for each row execute function public.limit_tournaments();

create or replace function public.limit_group_games()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.group_games
      where group_id = new.group_id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Troppe partite registrate oggi in questo gruppo: riprova domani.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_group_games on public.group_games;
create trigger limit_group_games before insert on public.group_games
  for each row execute function public.limit_group_games();
