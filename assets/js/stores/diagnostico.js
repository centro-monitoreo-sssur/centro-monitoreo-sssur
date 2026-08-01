// ============================================================
// STORE: diagnóstico del sistema
//
// Responde "¿está el sistema sano?" con datos reales, no con supuestos.
// Hasta ahora esa información vivía repartida entre `console.error` (donde
// nadie mira), el SQL Editor de Supabase y bloques `raise warning` de las
// migraciones. Aquí se consolida en algo que el superadmin puede leer.
//
// LÍMITE CONOCIDO: PostgREST no expone `pg_policies` ni `pg_database_size`,
// así que la existencia de cada migración se comprueba SONDEANDO los objetos
// que creó. Un sondeo que falla prueba que el objeto no está o no es legible;
// uno que responde prueba que sí. No sustituye a revisar el SQL, pero
// distingue "v16 aplicada" de "v16 escrita y nunca ejecutada", que es la
// pregunta que de verdad se hace uno.
// ============================================================
import { ref, computed } from '../core/vue.js';
import { db } from '../core/supabase.js';

const ESTADOS = { OK: 'ok', AVISO: 'aviso', CRITICO: 'critico', DESCONOCIDO: 'desconocido' };

const resultados = ref([]);
const ejecutando = ref(false);
const ultimaEjecucion = ref(null);

// PostgREST responde con estos códigos cuando la tabla, vista o función no
// existe en el esquema expuesto. Es la señal de "migración no aplicada".
const CODIGOS_NO_EXISTE = ['PGRST202', 'PGRST205', '42P01', '42883'];
const noExiste = (error) =>
  CODIGOS_NO_EXISTE.includes(error?.code) ||
  /does not exist|could not find|not find the/i.test(error?.message || '');

function anotar(lista, item) {
  lista.push({ estado: ESTADOS.DESCONOCIDO, detalle: '', accion: '', ...item });
}

// Cuenta filas sin traerlas: `head: true` emite un HEAD y el total llega en la
// cabecera Content-Range. Traer las filas solo para contarlas gastaría ancho de
// banda y, con `casos`, podría ser mucho.
async function contar(tabla, aplicarFiltros) {
  let q = db.from(tabla).select('id', { count: 'exact', head: true });
  if (aplicarFiltros) q = aplicarFiltros(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// 1. Estructura de base de datos
// ─────────────────────────────────────────────────────────────
async function revisarEstructura(lista) {
  const objetos = [
    { nombre: 'departamento_categorias', tipo: 'tabla',  migracion: 'v6',  para: 'Reparto de categorías entre departamentos' },
    { nombre: 'v_casos_mapa',            tipo: 'vista',  migracion: 'v15', para: 'Coordenadas de los casos en el Mapa en Vivo' },
    { nombre: 'rol_alcance_datos',       tipo: 'tabla',  migracion: 'v16', para: 'Alcance de datos por rol' },
    { nombre: 'usuario_ambitos',         tipo: 'tabla',  migracion: 'v16', para: 'Permisos granulares por usuario' },
    { nombre: 'v_kpis_distrito',         tipo: 'vista',  migracion: 'v16', para: 'Tablero comparativo de distritos' },
  ];

  for (const o of objetos) {
    try {
      const { error } = await db.from(o.nombre).select('*').limit(1);
      if (error) throw error;
      anotar(lista, {
        grupo: 'Estructura', titulo: `${o.migracion} · ${o.nombre}`,
        estado: ESTADOS.OK, detalle: `${o.tipo} disponible — ${o.para}`,
      });
    } catch (e) {
      anotar(lista, {
        grupo: 'Estructura', titulo: `${o.migracion} · ${o.nombre}`,
        estado: noExiste(e) ? ESTADOS.CRITICO : ESTADOS.DESCONOCIDO,
        detalle: noExiste(e)
          ? `No existe. ${o.para} no funcionará.`
          : `No se pudo comprobar: ${e.message}`,
        accion: noExiste(e) ? `Ejecuta database/migration_${o.migracion}*.sql en Supabase.` : '',
      });
    }
  }

  // La RPC es la que consume el frontend; que exista la tabla no garantiza
  // que la función se haya creado.
  try {
    const { error } = await db.rpc('mi_alcance');
    if (error) throw error;
    anotar(lista, {
      grupo: 'Estructura', titulo: 'v16 · función mi_alcance()',
      estado: ESTADOS.OK, detalle: 'Responde. El alcance territorial se resuelve en la base.',
    });
  } catch (e) {
    anotar(lista, {
      grupo: 'Estructura', titulo: 'v16 · función mi_alcance()',
      estado: ESTADOS.CRITICO,
      detalle: `No responde: ${e.message}`,
      accion: 'Sin ella la consola no sabe qué distritos puede ver el usuario.',
    });
  }

  // v17: sin esta función, iniciar sesión con el `username` es imposible —
  // Supabase Auth solo autentica por correo.
  try {
    const { error } = await db.rpc('resolver_identificador_login', { p_identificador: '' });
    if (error) throw error;
    anotar(lista, {
      grupo: 'Estructura', titulo: 'v17 · función resolver_identificador_login()',
      estado: ESTADOS.OK, detalle: 'Disponible. Se puede iniciar sesión con usuario o con correo.',
    });
  } catch (e) {
    anotar(lista, {
      grupo: 'Estructura', titulo: 'v17 · función resolver_identificador_login()',
      estado: noExiste(e) ? ESTADOS.AVISO : ESTADOS.DESCONOCIDO,
      detalle: noExiste(e)
        ? 'No existe. Solo se puede iniciar sesión con el correo institucional.'
        : `No se pudo comprobar: ${e.message}`,
      accion: noExiste(e) ? 'Ejecuta database/migration_v17_login_por_username.sql.' : '',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Catálogos
// Un catálogo vacío NO lanza error: PostgREST devuelve []. Por eso los stores
// caen a demo-data.js y la interfaz enseña datos inventados como si fueran
// reales. Esta comprobación es la que hace visible ese caso.
// ─────────────────────────────────────────────────────────────
async function revisarCatalogos(lista) {
  const catalogos = [
    { tabla: 'roles',                       minimo: 1, critico: true,  para: 'Sin roles nadie puede iniciar sesión con permisos' },
    { tabla: 'permisos_modulos',            minimo: 1, critico: true,  para: 'Sin módulos la matriz de permisos queda vacía' },
    { tabla: 'roles_permisos',              minimo: 1, critico: true,  para: 'Sin filas, `auth_tiene_permiso` deniega todo' },
    { tabla: 'distritos',                   minimo: 1, critico: true,  para: 'Eje de todo el alcance territorial de v16' },
    { tabla: 'direcciones_administrativas', minimo: 1, critico: true,  para: 'No se podrán crear departamentos' },
    { tabla: 'departamentos',               minimo: 1, critico: true,  para: 'Los casos no tendrían a quién enrutarse' },
    { tabla: 'categorias_caso',             minimo: 1, critico: true,  para: 'El clasificador de denuncias mostraría datos de demo' },
    { tabla: 'prioridades',                 minimo: 1, critico: true,  para: 'Sin prioridades no hay SLA ni semáforo' },
    { tabla: 'canales_reporte',             minimo: 1, critico: false, para: 'No se podría registrar el origen de una denuncia' },
  ];

  for (const c of catalogos) {
    try {
      const total = await contar(c.tabla);
      const vacio = total < c.minimo;
      anotar(lista, {
        grupo: 'Catálogos', titulo: c.tabla,
        estado: vacio ? (c.critico ? ESTADOS.CRITICO : ESTADOS.AVISO) : ESTADOS.OK,
        detalle: vacio ? `VACÍO — ${c.para}` : `${total} registro${total === 1 ? '' : 's'}`,
        accion: vacio ? 'Ejecuta los seeds de database/ (migraciones v7, v9 y v11).' : '',
      });
    } catch (e) {
      anotar(lista, {
        grupo: 'Catálogos', titulo: c.tabla,
        estado: ESTADOS.DESCONOCIDO, detalle: `No legible: ${e.message}`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Alcance de los usuarios
//
// El fallo silencioso más probable de v16: un rol con alcance
// 'distrito_propio' y `usuarios.distrito_id` nulo no ve NINGÚN caso. El
// usuario reporta que "el sistema perdió los datos" y en realidad la RLS está
// haciendo exactamente lo que se le pidió.
// ─────────────────────────────────────────────────────────────
async function revisarAlcanceUsuarios(lista) {
  try {
    const [resAlcance, resUsuarios] = await Promise.all([
      db.from('rol_alcance_datos').select('rol_id, alcance_territorial, alcance_organizacional'),
      db.from('usuarios')
        .select('id, nombres, apellidos, rol_id, distrito_id, departamento_id, roles ( nombre )')
        .eq('activo', true),
    ]);
    if (resAlcance.error) throw resAlcance.error;
    if (resUsuarios.error) throw resUsuarios.error;

    const porRol = new Map((resAlcance.data || []).map((a) => [a.rol_id, a]));
    const huerfanos = [];

    for (const u of resUsuarios.data || []) {
      const a = porRol.get(u.rol_id);
      if (!a) continue;
      const faltaDistrito = a.alcance_territorial === 'distrito_propio' && !u.distrito_id;
      const faltaDepto = a.alcance_organizacional === 'departamento_propio' && !u.departamento_id;
      if (faltaDistrito || faltaDepto) {
        huerfanos.push(
          `${u.nombres} ${u.apellidos} (${u.roles?.nombre || 'sin rol'}) — falta ` +
          [faltaDistrito && 'distrito', faltaDepto && 'departamento'].filter(Boolean).join(' y ')
        );
      }
    }

    anotar(lista, {
      grupo: 'Alcance de datos', titulo: 'Usuarios sin ámbito asignado',
      estado: huerfanos.length ? ESTADOS.CRITICO : ESTADOS.OK,
      detalle: huerfanos.length
        ? `${huerfanos.length} usuario(s) NO verán ningún caso:\n· ${huerfanos.join('\n· ')}`
        : 'Todos los usuarios con rol de alcance restringido tienen su ámbito asignado.',
      accion: huerfanos.length ? 'Asígnales distrito y/o departamento en Organización → Usuarios.' : '',
    });

    // Delegaciones vigentes: no son un fallo, pero un superadmin debe saber
    // quién tiene acceso extra ahora mismo y hasta cuándo.
    const { data: ambitos, error } = await db
      .from('usuario_ambitos')
      .select('id, modo, tipo, vigente_hasta')
      .lte('vigente_desde', new Date().toISOString());
    if (!error) {
      const vigentes = (ambitos || []).filter(
        (a) => !a.vigente_hasta || new Date(a.vigente_hasta) > new Date()
      );
      const concedidos = vigentes.filter((a) => a.modo === 'conceder').length;
      const denegados = vigentes.filter((a) => a.modo === 'denegar').length;
      anotar(lista, {
        grupo: 'Alcance de datos', titulo: 'Excepciones vigentes',
        estado: vigentes.length ? ESTADOS.AVISO : ESTADOS.OK,
        detalle: vigentes.length
          ? `${concedidos} concesión(es) y ${denegados} denegación(es) activas sobre el alcance de rol.`
          : 'Nadie tiene excepciones: todos operan con el alcance de su rol.',
      });
    }
  } catch (e) {
    anotar(lista, {
      grupo: 'Alcance de datos', titulo: 'Revisión de ámbitos',
      estado: ESTADOS.DESCONOCIDO,
      detalle: `No se pudo comprobar: ${e.message}`,
      accion: 'Requiere migration_v16 aplicada y rol administrador.',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Integridad de los datos operativos
// ─────────────────────────────────────────────────────────────
async function revisarDatos(lista) {
  try {
    const total = await contar('casos', (q) => q.is('deleted_at', null));
    const sinUbicacion = await contar('casos', (q) => q.is('deleted_at', null).is('ubicacion', null));

    anotar(lista, {
      grupo: 'Datos operativos', titulo: 'Casos registrados',
      estado: total > 0 ? ESTADOS.OK : ESTADOS.AVISO,
      detalle: total > 0
        ? `${total} caso(s) activos.`
        : 'No hay casos. Los KPIs en cero de la consola son correctos, no un fallo.',
    });

    if (total > 0) {
      // Un caso sin coordenadas no aparece en el mapa y nadie lo echa de menos:
      // no hay ninguna pantalla que liste "lo que no se está viendo".
      const pct = Math.round((sinUbicacion / total) * 100);
      anotar(lista, {
        grupo: 'Datos operativos', titulo: 'Casos sin ubicación',
        estado: sinUbicacion === 0 ? ESTADOS.OK : (pct >= 10 ? ESTADOS.CRITICO : ESTADOS.AVISO),
        detalle: sinUbicacion === 0
          ? 'Todos los casos tienen coordenadas.'
          : `${sinUbicacion} de ${total} (${pct}%) no se dibujan en el Mapa en Vivo.`,
        accion: sinUbicacion ? 'Revisa el flujo de captura: `requiere_ubicacion` en categorias_caso.' : '',
      });
    }
  } catch (e) {
    anotar(lista, {
      grupo: 'Datos operativos', titulo: 'Casos',
      estado: ESTADOS.DESCONOCIDO, detalle: `No legible: ${e.message}`,
    });
  }

  // Prioridades sin SLA: `tiempo_objetivo_horas` alimenta el semáforo del
  // tablero territorial. Una prioridad sin él nunca se marca como vencida.
  try {
    const { data, error } = await db
      .from('prioridades').select('codigo, nombre, nivel, tiempo_objetivo_horas').order('nivel');
    if (error) throw error;
    const sinSla = (data || []).filter((p) => p.tiempo_objetivo_horas == null && p.nivel < 5);
    anotar(lista, {
      grupo: 'Datos operativos', titulo: 'SLA por prioridad',
      estado: sinSla.length ? ESTADOS.AVISO : ESTADOS.OK,
      detalle: sinSla.length
        ? `Sin tiempo objetivo: ${sinSla.map((p) => p.nombre).join(', ')}. Nunca se marcarán como vencidas.`
        : (data || []).map((p) => `${p.nombre}: ${p.tiempo_objetivo_horas ?? '—'} h`).join(' · '),
    });
  } catch (e) {
    anotar(lista, {
      grupo: 'Datos operativos', titulo: 'SLA por prioridad',
      estado: ESTADOS.DESCONOCIDO, detalle: `No legible: ${e.message}`,
    });
  }

  // Categorías sin responsable principal: sus casos no sabrían a qué
  // departamento enrutarse. La verificación de v6 hace esta misma consulta.
  try {
    const [totalCat, conResponsable] = await Promise.all([
      contar('categorias_caso', (q) => q.eq('activo', true)),
      db.from('departamento_categorias')
        .select('categoria_id')
        .eq('es_responsable_principal', true)
        .eq('activo', true),
    ]);
    if (conResponsable.error) throw conResponsable.error;
    const cubiertas = new Set((conResponsable.data || []).map((r) => r.categoria_id)).size;
    const huerfanas = Math.max(0, totalCat - cubiertas);
    anotar(lista, {
      grupo: 'Datos operativos', titulo: 'Enrutamiento de categorías',
      estado: huerfanas ? ESTADOS.CRITICO : ESTADOS.OK,
      detalle: huerfanas
        ? `${huerfanas} categoría(s) activas sin departamento responsable principal.`
        : `Las ${totalCat} categorías activas tienen departamento responsable.`,
      accion: huerfanas ? 'Asígnalo en el maestro de categorías.' : '',
    });
  } catch (e) {
    anotar(lista, {
      grupo: 'Datos operativos', titulo: 'Enrutamiento de categorías',
      estado: ESTADOS.DESCONOCIDO, detalle: `No comprobable: ${e.message}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Límites del plan Supabase FREE
// Ver docs/arquitectura/CONTEXTO_CRITICO.md: al tocar los 500 MB la base
// entra en SOLO LECTURA. Enterarse cuando deje de funcionar no es opción.
// ─────────────────────────────────────────────────────────────
async function revisarLimites(lista) {
  try {
    const filas = await contar('bitacora_auditoria');
    // El peso real en MB necesita `pg_database_size`, que PostgREST no expone.
    // El conteo de filas es el proxy disponible; el umbral es una estimación
    // conservadora (~1 KB por fila con los jsonb de valores).
    const estimadoMb = Math.round((filas * 1024) / (1024 * 1024));
    anotar(lista, {
      grupo: 'Límites del plan', titulo: 'Bitácora de auditoría',
      estado: filas > 300000 ? ESTADOS.CRITICO : (filas > 100000 ? ESTADOS.AVISO : ESTADOS.OK),
      detalle: `${filas.toLocaleString('es-SV')} registros (~${estimadoMb} MB estimados de los 500 MB del plan).`,
      accion: filas > 100000
        ? 'Programa la purga de registros con más de 6 meses (CONTEXTO_CRITICO §2.1).'
        : '',
    });

    const antiguedad = await db
      .from('bitacora_auditoria').select('created_at')
      .order('created_at', { ascending: true }).limit(1);
    if (!antiguedad.error && antiguedad.data?.length) {
      const dias = Math.floor((Date.now() - new Date(antiguedad.data[0].created_at)) / 86400000);
      anotar(lista, {
        grupo: 'Límites del plan', titulo: 'Antigüedad de la bitácora',
        estado: dias > 180 ? ESTADOS.AVISO : ESTADOS.OK,
        detalle: `El registro más antiguo tiene ${dias} días. La política de retención son 180.`,
        accion: dias > 180 ? 'La purga automática sigue sin implementarse.' : '',
      });
    }
  } catch (e) {
    anotar(lista, {
      grupo: 'Límites del plan', titulo: 'Bitácora de auditoría',
      estado: ESTADOS.DESCONOCIDO, detalle: `No legible: ${e.message}`,
    });
  }
}

async function ejecutar() {
  if (ejecutando.value) return;
  if (!db) {
    resultados.value = [{
      grupo: 'Conexión', titulo: 'Supabase', estado: ESTADOS.CRITICO,
      detalle: 'Sin cliente configurado. Revisa assets/js/core/supabase-config.js.', accion: '',
    }];
    return;
  }

  ejecutando.value = true;
  const lista = [];
  try {
    // Secuencial a propósito: son decenas de peticiones y lanzarlas todas a la
    // vez contra el plan FREE es la forma más rápida de comerse un 429.
    await revisarEstructura(lista);
    await revisarCatalogos(lista);
    await revisarAlcanceUsuarios(lista);
    await revisarDatos(lista);
    await revisarLimites(lista);
  } finally {
    resultados.value = lista;
    ultimaEjecucion.value = new Date();
    ejecutando.value = false;
  }
}

export function useDiagnostico() {
  const contarPorEstado = (estado) =>
    computed(() => resultados.value.filter((r) => r.estado === estado).length);

  const criticos = contarPorEstado(ESTADOS.CRITICO);
  const avisos = contarPorEstado(ESTADOS.AVISO);
  const correctos = contarPorEstado(ESTADOS.OK);
  const desconocidos = contarPorEstado(ESTADOS.DESCONOCIDO);

  // Agrupado conservando el orden en que se ejecutaron las comprobaciones.
  const porGrupo = computed(() => {
    const mapa = new Map();
    for (const r of resultados.value) {
      if (!mapa.has(r.grupo)) mapa.set(r.grupo, []);
      mapa.get(r.grupo).push(r);
    }
    return Array.from(mapa, ([grupo, items]) => ({ grupo, items }));
  });

  const salud = computed(() => {
    if (!resultados.value.length) return 'sin-ejecutar';
    if (criticos.value > 0) return 'critico';
    if (avisos.value > 0) return 'aviso';
    return 'ok';
  });

  const claseEstado = (estado) => ({
    ok:          'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800',
    aviso:       'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800',
    critico:     'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800',
    desconocido: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700',
  }[estado] || '');

  const iconoEstado = (estado) => ({
    ok: 'fa-circle-check text-emerald-500',
    aviso: 'fa-triangle-exclamation text-amber-500',
    critico: 'fa-circle-xmark text-red-500',
    desconocido: 'fa-circle-question text-gray-400',
  }[estado] || 'fa-circle text-gray-400');

  return {
    resultados, ejecutando, ultimaEjecucion, ejecutar,
    criticos, avisos, correctos, desconocidos,
    porGrupo, salud, claseEstado, iconoEstado,
  };
}
