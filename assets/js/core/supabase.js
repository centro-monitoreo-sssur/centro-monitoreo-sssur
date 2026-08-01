// ============================================================
// CONEXIÓN A SUPABASE
// Zero Trust: la anon key SOLO permite lo que las políticas RLS
// autorizan; nunca se usa service_role en el cliente. Renombramos
// la instancia a `db` para evitar la colisión con el objeto global
// `supabase` que expone el CDN.
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { CLAVE_SESION, CONTEXTO } from './app-contexto.js';

// `conexionOk` es true solo cuando hay un cliente Supabase real
// configurado (es decir, when los placeholders fueron reemplazados).
export const conexionOk =
  typeof window.supabase !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('XXXXXXXXXXXXXXXXXXXX');

export let db = null;
try {
  if (conexionOk) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Una clave de sesión POR CONTEXTO.
        //
        // Con la clave que Supabase deriva por defecto del proyecto, las tres
        // aplicaciones comparten sesión: iniciar sesión como empleado en una
        // pestaña cerraba la del Centro de Monitoreo en la otra, y ambas
        // acababan siendo el mismo usuario. Es lo que impedía validar los
        // flujos de campo y de monitoreo a la vez en el mismo navegador.
        //
        // Separar la clave separa además el canal de sincronización entre
        // pestañas: el SDK lo nombra a partir de ella, así que dos contextos
        // con claves distintas dejan de propagarse `onAuthStateChange`.
        storageKey: CLAVE_SESION,
      },
    });
    window.__supabaseDbActivo = true; // Flag global para componentes
    console.info(`[supabase] Contexto "${CONTEXTO}" · sesión en "${CLAVE_SESION}"`);
  }
} catch (e) {
  console.error('Error inicializando Supabase:', e);
}

// ============================================================
// Cliente aislado — SOLO para dar de alta usuarios
//
// `db.auth.signUp()` inicia sesión con la cuenta recién creada y sobrescribe
// la del administrador: quien registra a un empleado acabaría dentro del
// sistema como ese empleado. Con `persistSession: false` y
// `autoRefreshToken: false` este cliente no escribe en localStorage ni emite
// eventos de auth, así que la sesión del administrador queda intacta.
//
// Sigue usando la anon key. La service_role NUNCA entra al navegador: quien
// necesite `auth.admin.createUser` tiene que hacerlo desde una Edge Function.
// ============================================================
export function crearClienteAislado() {
  if (!conexionOk) return null;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Sin clave propia, el cliente aislado compartiría el mismo slot de
      // almacenamiento aunque no persista, y podría pisar la sesión activa.
      storageKey: 'sb-alta-usuarios-efimero',
    },
  });
}
