// ============================================================
// STORE: Gestión de población registrada
// Estado compartido (singleton de módulo) con fallback local.
// ============================================================
import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';
import { poblacionDemo } from '../utils/demo-data.js';

const poblacion = ref(poblacionDemo);
const cargandoPoblacion = ref(false);

async function cargarPoblacion() {
  cargandoPoblacion.value = true;
  try {
    if (db) {
      const { data, error } = await db
        .from('ciudadanos')
        .select(`
          id,
          dui,
          telefono,
          nombres,
          apellidos,
          activo,
          created_at,
          distrito_id,
          distritos ( nombre )
        `);
      if (error) throw error;
      if (data) {
        poblacion.value = data.map(c => ({
          id: c.id,
          dui: c.dui || '',
          telefono: c.telefono || '',
          nombre: `${c.nombres} ${c.apellidos}`,
          nombres: c.nombres,
          apellidos: c.apellidos,
          distrito_id: c.distrito_id,
          email: '', // email requeriría auth.users view, lo dejamos vacío por ahora
          distrito: c.distritos?.nombre || 'Desconocido',
          estado: c.activo ? 'activo' : 'inactivo',
          fechaRegistro: c.created_at,
          // `public.ciudadanos` NO tiene columna `verificado`; antes esto era
          // `true` fijo, así que el badge decía "verificado" para todos por
          // igual. Se deriva de `activo`, que es el único dato real, hasta que
          // exista un flujo de verificación de identidad en la BD.
          verificado: c.activo === true
        }));
      }
    } else {
      await new Promise((r) => setTimeout(r, 200)); // latencia simulada
    }
  } catch (e) {
    console.warn('Usando datos demo de población:', e.message);
  } finally {
    cargandoPoblacion.value = false;
  }
}

function buscarCiudadano(id) {
  return poblacion.value.find((c) => c.id === id) || {};
}

function mensajeDeError(error, contexto) {
  const codigo = error?.code;
  if (codigo === '23505') return 'Ese DUI ya está registrado por otro ciudadano.';
  if (codigo === '23503') return 'El distrito seleccionado no existe.';
  if (codigo === '42501' || /row-level security/i.test(error?.message || '')) {
    return 'Tu rol no tiene permiso para modificar ciudadanos.';
  }
  console.error(`[poblacion] ${contexto}:`, error);
  return error?.message || 'Error desconocido al guardar.';
}

// Igual que `usuarios`, `ciudadanos.id` es FK a `auth.users`: el alta ocurre
// cuando el ciudadano se registra en el portal, no desde el escritorio.
async function actualizarCiudadano(datos) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  if (!datos?.id) return { ok: false, error: 'Los ciudadanos se registran desde el portal de población.' };

  const partes = String(datos.nombre || '').trim().split(/\s+/).filter(Boolean);
  const payload = {
    nombres:   partes.length > 1 ? partes.slice(0, -1).join(' ') : (partes[0] || ''),
    apellidos: partes.length > 1 ? partes[partes.length - 1] : '',
    dui:       (datos.dui || '').trim() || null,       // null, no '': `dui` es UNIQUE
    telefono:  (datos.telefono || '').trim() || null,   // y varias cadenas vacías chocarían
    distrito_id: datos.distrito_id ? Number(datos.distrito_id) : null,
    activo:    datos.estado !== 'inactivo',
    updated_at: new Date().toISOString(),
  };

  if (!payload.nombres) return { ok: false, error: 'El nombre es obligatorio.' };

  try {
    const { error } = await db.from('ciudadanos').update(payload).eq('id', datos.id);
    if (error) throw error;
    await cargarPoblacion();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'actualizarCiudadano') };
  }
}

async function cambiarEstadoCiudadano(id, activo) {
  if (!db) return { ok: false, error: 'Sin conexión a la base de datos.' };
  try {
    const { error } = await db.from('ciudadanos')
      .update({ activo, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await cargarPoblacion();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e, 'cambiarEstadoCiudadano') };
  }
}

export function usePoblacion() {
  return {
    poblacion, cargandoPoblacion, cargarPoblacion, buscarCiudadano,
    actualizarCiudadano, cambiarEstadoCiudadano,
  };
}
