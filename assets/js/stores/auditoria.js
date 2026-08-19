import { ref } from '../core/vue.js';
import { db } from '../core/supabase.js';

const logs = ref([]);
const cargando = ref(false);
const cargandoMas = ref(false);
// Total real del rango (cabecera Content-Range, sin traer filas de más) y si
// quedan páginas por debajo del último id cargado.
const totalLogs = ref(0);
const hayMasLogs = ref(false);

/* Una auditoría crece sin techo: la página es fija y el resto se pide por
   cursor. 100 filas por viaje es suficiente para leer y barato de traer. */
const LOGS_POR_PAGINA = 100;

/* El rango vigente vive en el store: `cargarMasLogs` tiene que repetir el
   MISMO corte de fechas o el cursor mezclaría rangos distintos. */
const filtroDesde = ref('');   // 'YYYY-MM-DD' o vacío
const filtroHasta = ref('');

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

const COLUMNAS_LOG = `
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
`;

function mapearLog(l) {
  return {
    id: l.id,
    fecha: l.created_at,
    /* Tres actores posibles desde la v37, no dos. Sin la rama del ciudadano,
       todo lo que hace un vecino desde el portal aparecía firmado como
       «Sistema»: una bitácora que atribuye mal es peor que no tenerla. */
    usuario: nombreDelActor(l),
    accion: l.accion,
    modulo: l.tabla_afectada,
    detalle: `Registro ${l.registro_id} modificado`,
    ip: l.ip_cliente || 'N/A',
  };
}

/** Aplica el corte de fechas vigente a una consulta.
 *  `hasta` es inclusivo para quien lo elige: internamente se corta ANTES del
 *  día siguiente, que es lo que un humano espera de «hasta el 19». */
function conRangoDeFechas(consulta) {
  if (filtroDesde.value) {
    consulta = consulta.gte('created_at', new Date(filtroDesde.value + 'T00:00:00').toISOString());
  }
  if (filtroHasta.value) {
    const fin = new Date(filtroHasta.value + 'T00:00:00');
    fin.setDate(fin.getDate() + 1);
    consulta = consulta.lt('created_at', fin.toISOString());
  }
  return consulta;
}

export function useAuditoria() {
  /**
   * Primera página del rango. Antes esto era un `limit(100)` fijo y el campo
   * de fechas de la pantalla era un adorno `readonly`: parecía un filtro y no
   * filtraba nada — el tipo de control que enseña a desconfiar del panel.
   */
  async function cargarLogs({ desde, hasta } = {}) {
    if (desde !== undefined) filtroDesde.value = desde;
    if (hasta !== undefined) filtroHasta.value = hasta;

    cargando.value = true;
    try {
      if (db) {
        const { data, error, count } = await conRangoDeFechas(
          db.from('bitacora_auditoria')
            .select(COLUMNAS_LOG, { count: 'exact' })
        )
          .order('created_at', { ascending: false })
          // Desempate estable para que el cursor por id no salte ni repita.
          .order('id', { ascending: false })
          .limit(LOGS_POR_PAGINA);

        if (error) throw error;
        logs.value = (data || []).map(mapearLog);
        totalLogs.value = count ?? logs.value.length;
        hayMasLogs.value = logs.value.length < totalLogs.value;
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
      logs.value = [];
      totalLogs.value = 0;
      hayMasLogs.value = false;
    } finally {
      cargando.value = false;
    }
  }

  /**
   * Siguiente página, por cursor sobre `id` (la PK ya lo indexa). Nunca
   * OFFSET: leer y descartar N filas por página está prohibido por
   * docs/arquitectura/CONTEXTO_CRITICO.md §2.2 y aquí N solo crece.
   */
  async function cargarMasLogs() {
    if (!db || cargandoMas.value || !hayMasLogs.value || !logs.value.length) return;
    cargandoMas.value = true;
    try {
      const ultimoId = logs.value[logs.value.length - 1].id;
      const { data, error } = await conRangoDeFechas(
        db.from('bitacora_auditoria').select(COLUMNAS_LOG)
      )
        .lt('id', ultimoId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(LOGS_POR_PAGINA);

      if (error) throw error;
      const nuevas = (data || []).map(mapearLog);
      logs.value = [...logs.value, ...nuevas];
      hayMasLogs.value = nuevas.length === LOGS_POR_PAGINA && logs.value.length < totalLogs.value;
    } catch (e) {
      console.warn('[auditoria] No se pudo cargar la siguiente página: ' + e.message);
    } finally {
      cargandoMas.value = false;
    }
  }

  return {
    logs,
    cargando,
    cargandoMas,
    totalLogs,
    hayMasLogs,
    filtroDesde,
    filtroHasta,
    cargarLogs,
    cargarMasLogs,
  };
}
