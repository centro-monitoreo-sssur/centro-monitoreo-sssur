// ============================================================
// CONEXIÓN A SUPABASE
// Zero Trust: la anon key SOLO permite lo que las políticas RLS
// autorizan; nunca se usa service_role en el cliente. Renombramos
// la instancia a `db` para evitar la colisión con el objeto global
// `supabase` que expone el CDN.
// ============================================================
export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'TU-ANON-KEY-PUBLICA';

// `conexionOk` es true solo cuando hay un cliente Supabase real
// configurado (es decir, when los placeholders fueron reemplazados).
export const conexionOk =
  typeof window.supabase !== 'undefined' && !SUPABASE_URL.includes('TU-PROYECTO');

export let db = null;
try {
  if (conexionOk) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.error('Error inicializando Supabase:', e);
}
