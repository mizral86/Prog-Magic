-- Menga Magic: immagine profilo (illustrazione di un planeswalker).
-- Da incollare una volta in Supabase → SQL Editor → New query → Run,
-- DOPO friends.sql. Si può rieseguire senza problemi (non cancella nulla).
--
-- Aggiunge ai profili la colonna "avatar": l'indirizzo dell'immagine scelta
-- dalla galleria (solo immagini di Scryfall, cards.scryfall.io). Chi vede il
-- tuo profilo (amici, richieste, gruppi) vede anche l'immagine.

alter table public.profiles add column if not exists avatar text;

alter table public.profiles drop constraint if exists profiles_avatar_url;
alter table public.profiles add constraint profiles_avatar_url check (
  avatar is null
  or (avatar ~ '^https://cards\.scryfall\.io/[^"''()[:space:]]+$' and char_length(avatar) <= 300)
);

-- Ognuno può cambiare la propria immagine (le regole RLS già limitano
-- l'aggiornamento al proprio profilo).
grant update (avatar) on public.profiles to authenticated;

-- La ricerca di nuovi amici restituisce anche l'immagine.
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
