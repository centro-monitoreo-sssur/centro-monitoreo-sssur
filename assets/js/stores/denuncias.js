// ============================================================
// STORE: denuncias
// Fuente única de los datos de denuncia. Expone refs, carga con fallback
// demo y suscripción realtime (Zero Trust: la vista `denuncias_publicas`
// ya excluye PII en la base de datos).
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { denunciasDemo } from '../utils/demo-data.js';
import { useCatalogos } from './catalogos.js';

const denuncias = ref([]);
const cargandoDenuncias = ref(true);
const filtroTipo = ref(null);

async function cargarDenuncias() {
  cargandoDenuncias.value = true;
  try {
    if (db) {
      // `denuncias_publicas` excluye PII — frontera Zero Trust en la BD.
      const { data, error } = await db
        .from('denuncias_publicas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      denuncias.value = data;
    } else {
      await new Promise((r) => setTimeout(r, 400)); // simula latencia real para el skeleton
      denuncias.value = denunciasDemo;
    }
  } catch (e) {
    console.error('Error cargando denuncias:', e);
    denuncias.value = denunciasDemo; // degradación controlada, nunca pantalla rota
  } finally {
    cargandoDenuncias.value = false;
  }
}

// Realtime: requiere habilitar Realtime en Supabase para `denuncias`.
// Se degrada en silencio si no hay conexión.
function suscribirRealtime() {
  if (!db) return;
  db.channel('denuncias-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'denuncias' }, () => cargarDenuncias())
    .subscribe();
}

const { nombreDeTipo, colorDeTipo } = useCatalogos();

const conteoPorTipo = computed(() => {
  const acc = {};
  denuncias.value.forEach((d) => { acc[d.tipo_id] = (acc[d.tipo_id] || 0) + 1; });
  return acc;
});

const denunciasFiltradas = computed(() =>
  filtroTipo.value ? denuncias.value.filter((d) => d.tipo_id === filtroTipo.value) : denuncias.value
);

const denunciasPendientesCount = computed(() =>
  denuncias.value.filter((d) => d.estado === 'pendiente').length
);

export function useDenuncias() {
  return {
    denuncias, cargandoDenuncias, filtroTipo,
    cargarDenuncias, suscribirRealtime,
    conteoPorTipo, denunciasFiltradas, denunciasPendientesCount,
    nombreDeTipo, colorDeTipo,
  };
}
