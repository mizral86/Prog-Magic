-- Prog Magic: tabella dei dati di ogni profilo.
-- Da incollare una volta in Supabase → SQL Editor → New query → Run.
--
-- Ogni utente ha una riga con tutti i suoi dati dell'app (collezione, mazzi,
-- raccoglitori, wishlist, impostazioni) in un unico campo JSON.
-- Le regole RLS fanno sì che ognuno possa leggere e scrivere solo la propria riga.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Leggi i tuoi dati" on public.user_data;
create policy "Leggi i tuoi dati" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "Crea i tuoi dati" on public.user_data;
create policy "Crea i tuoi dati" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "Aggiorna i tuoi dati" on public.user_data;
create policy "Aggiorna i tuoi dati" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Cancella i tuoi dati" on public.user_data;
create policy "Cancella i tuoi dati" on public.user_data
  for delete using (auth.uid() = user_id);
