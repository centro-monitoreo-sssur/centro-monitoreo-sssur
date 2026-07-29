// ============================================================
// CONEXIÓN A SUPABASE
// Zero Trust: la anon key SOLO permite lo que las políticas RLS
// autorizan; nunca se usa service_role en el cliente. Renombramos
// la instancia a `db` para evitar la colisión con el objeto global
// `supabase` que expone el CDN.
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

// `conexionOk` es true solo cuando hay un cliente Supabase real
// configurado (es decir, when los placeholders fueron reemplazados).
export const conexionOk =
  typeof window.supabase !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('XXXXXXXXXXXXXXXXXXXX');

export let db = null;
try {
  if (conexionOk) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.error('Error inicializando Supabase:', e);
}
