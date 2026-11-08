// Collegamento al progetto Supabase che conserva account e dati dei profili.
//
// L'indirizzo e la chiave "anon" (pubblica) si trovano in Supabase →
// Project Settings → API. La chiave anon è fatta apposta per stare dentro il
// sito: i dati restano protetti dalle regole del database (supabase/schema.sql),
// per cui ogni utente vede solo i propri.
//
// Si possono anche passare in fase di build con le variabili d'ambiente
// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY, che hanno la precedenza.

const URL_IN_CODE = "";
const ANON_KEY_IN_CODE = "";

export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || URL_IN_CODE;
export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || ANON_KEY_IN_CODE;

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
