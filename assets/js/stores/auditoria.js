import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const logs = ref([]);
const cargando = ref(false);

/**
 * Quién firmó la acción: empleado, vecino del portal, o el propio sistema.
 *
 * La bitácora admitía un solo actor —`usuario_id`, contra la tabla de
 * empleados— y desde la v37 admite también `ciudadano_id`. Ambos nulos son un
 * proceso interno, no un dato que falte.
 */
function nombreDelActor(fila) {
  const empleado = fila.usuarios;
  if (empleado) {
    const nombre = `${empleado.nombres || ''} ${empleado.apellidos || ''}`.trim();
    return nombre || empleado.email_institucional;
  }

  const vecino = fila.ciudadanos;
  if (vecino) {
    const nombre = `${vecino.nombres || ''} ${vecino.apellidos || ''}`.trim();
    return `${nombre || 'Ciudadano'} · vecino`;
  }

  return 'Sistema';
}

export function useAuditoria() {
  async function cargarLogs() {
    cargando.value = true;
    try {
      if (db) {
        const { data, error } = await db
          .from('bitacora_auditoria')
          .select(`
            id,
            accion,
            tabla_afectada,
            registro_id,
            valores_anteriores,
            valores_nuevos,
            ip_cliente,
            created_at,
            usuarios!bitacora_auditoria_usuario_id_fkey ( email_institucional, nombres, apellidos ),
            ciudadanos!bitacora_auditoria_ciudadano_id_fkey ( nombres, apellidos )
          `)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        logs.value = (data || []).map(l => ({
          id: l.id,
          fecha: l.created_at,
          /* Tres actores posibles desde la v37, no dos. Sin la rama del
             ciudadano, todo lo que hace un vecino desde el portal aparecía
             firmado como «Sistema»: una bitácora que atribuye mal es peor que
             no tenerla. Se marca como vecino para que nadie lo confunda con
             personal municipal. */
          usuario: nombreDelActor(l),
          accion: l.accion,
          modulo: l.tabla_afectada,
          detalle: `Registro ${l.registro_id} modificado`,
          ip: l.ip_cliente || 'N/A'
        }));
      }
    } catch (e) {
      // La unión con `ciudadanos` necesita la columna de la v37. Sin ella,
      // PostgREST rechaza la consulta entera y la bitácora sale vacía: hay que
      // decir por qué, o el síntoma no se parece en nada a la causa.
      const faltaV37 = /bitacora_auditoria_ciudadano_id_fkey|ciudadano_id/i.test(e.message || '');
      console.warn(
        faltaV37
          ? '[auditoria] Falta la v37. Ejecuta database/migration_v37_auditoria_actor_ciudadano.sql.'
          : '[auditoria] No se pudo leer bitacora_auditoria: ' + e.message
      );
    } finally {
      cargando.value = false;
    }
  }

  return {
    logs,
    cargando,
    cargarLogs
  };
}
