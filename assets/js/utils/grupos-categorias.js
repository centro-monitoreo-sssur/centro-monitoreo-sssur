// ============================================================
// UTIL: agrupación de categorías de caso para el clasificador
//
// Problema que resuelve: agrupar por DEPARTAMENTO RESPONSABLE produce ~15
// pestañas con nombres de 4 palabras ("Unidad Operativa De Obras
// Municipales"). En un teléfono eso desborda la fila de tabs y obliga al
// empleado a conocer el organigrama para poder reportar un bache.
//
// El empleado piensa en el PROBLEMA, no en qué unidad lo atiende. El ruteo al
// departamento ya lo resuelve la BD vía categorias_caso.departamento_responsable_id,
// así que la UI no necesita exponerlo como criterio de navegación.
//
// Inspiración: SOSAFE agrupa en 2 macro-grupos (Seguridad / Ciudad).
// ============================================================

// Macro-grupos. El orden es el orden de las pestañas.
export const GRUPOS_CATEGORIA = [
  {
    id: 'ciudad',
    nombre: 'Ciudad',
    descripcion: 'Infraestructura y servicios municipales',
    icono: 'fa-city',
    color: '#0ea5e9',
  },
  {
    id: 'seguridad',
    nombre: 'Seguridad',
    descripcion: 'Riesgos, convivencia y protección',
    icono: 'fa-shield-halved',
    color: '#ef4444',
  },
  {
    id: 'tramites',
    nombre: 'Trámites',
    descripcion: 'Comercio y gestión administrativa',
    icono: 'fa-file-lines',
    color: '#8b5cf6',
  },
];

const GRUPO_POR_DEFECTO = 'ciudad';

// Prefijo del `codigo` de categorias_caso → macro-grupo.
// Se incluyen también los prefijos del `id` de demo-data.js para que el
// clasificador siga agrupando bien cuando el catálogo cae en fallback.
const PREFIJO_A_GRUPO = {
  // Códigos reales (migration_v9_seed_categorias.sql)
  VIA: 'ciudad',      // baches, aceras, desagües
  ALU: 'ciudad',      // alumbrado público
  RES: 'ciudad',      // residuos sólidos
  DIS: 'ciudad',      // distrital: limpieza y espacio público
  AMB: 'ciudad',      // parques y áreas verdes
  RIE: 'seguridad',   // gestión de riesgos
  CONV: 'seguridad',  // convivencia
  ANI: 'seguridad',   // protección animal
  SOC: 'seguridad',   // niñez y adolescencia
  COM: 'tramites',    // comercio y mercados
  ADM: 'tramites',    // trámites y cementerios

  // Prefijos de demo-data.js (fallback sin BD)
  OBRAS: 'ciudad',
  RESIDUOS: 'ciudad',
  ALUMBRADO: 'ciudad',
  CIVIL: 'seguridad',
  SOCIAL: 'seguridad',
  ECO: 'tramites',
  ADMIN: 'tramites',
};

// Red de seguridad para categorías nuevas que un departamento cree con un
// código que aún no está en el mapa de arriba. Se evalúa en orden: la primera
// regla que coincida gana, por eso `seguridad` va antes que `ciudad`
// ("Árbol caído / Deslizamiento" debe caer en seguridad, no en ciudad).
const REGLAS_POR_NOMBRE = [
  {
    grupo: 'seguridad',
    re: /riesgo|incendio|humo|derrumbe|deslizamiento|colapso|emergencia|violen|robo|hurto|acoso|menor|animal|ruido|vecin|disturbio|seguridad/i,
  },
  {
    grupo: 'tramites',
    re: /tr[áa]mite|documento|expediente|comercio|ambulante|mercado|cementerio|impuesto|tasa|licencia|permiso|solvencia/i,
  },
  {
    grupo: 'ciudad',
    re: /calle|acera|bache|v[íi]a|luminar|alumbrado|basura|residuo|desecho|limpieza|barrido|parque|jard[íi]n|[áa]rea verde|agua|desag[üu]e|drenaje|inundaci[óo]n|espacio p[úu]blico|mobiliario/i,
  },
];

/**
 * Resuelve el macro-grupo de una categoría.
 * @param {{codigo?: string, id?: string|number, nombre?: string}} categoria
 * @returns {string} id de un grupo de GRUPOS_CATEGORIA
 */
export function grupoDeCategoria(categoria) {
  if (!categoria) return GRUPO_POR_DEFECTO;

  // 1) Prefijo del código (o del id, que en demo-data cumple el mismo papel).
  //    'VIA-BACHE' → 'VIA' · 'Obras-Calle' → 'OBRAS'
  const clave = String(categoria.codigo || categoria.id || '');
  const prefijo = clave.split(/[-_]/)[0].toUpperCase();
  if (PREFIJO_A_GRUPO[prefijo]) return PREFIJO_A_GRUPO[prefijo];

  // 2) Palabras clave del nombre visible.
  const nombre = String(categoria.nombre || '');
  const regla = REGLAS_POR_NOMBRE.find((r) => r.re.test(nombre));
  if (regla) return regla.grupo;

  // 3) Sin señal: a Ciudad, que es el grupo de mayor volumen operativo.
  return GRUPO_POR_DEFECTO;
}

/**
 * Reparte las categorías en los macro-grupos, descartando los que quedan vacíos
 * para no mostrar pestañas muertas.
 * @param {Array} categorias
 * @returns {Array<{id,nombre,descripcion,icono,color,categorias:Array}>}
 */
export function agruparCategorias(categorias) {
  const buckets = {};
  GRUPOS_CATEGORIA.forEach((g) => { buckets[g.id] = []; });

  (categorias || []).forEach((cat) => {
    const grupo = grupoDeCategoria(cat);
    (buckets[grupo] || buckets[GRUPO_POR_DEFECTO]).push(cat);
  });

  return GRUPOS_CATEGORIA
    .map((g) => ({ ...g, categorias: buckets[g.id] }))
    .filter((g) => g.categorias.length > 0);
}

/**
 * Normaliza texto para buscar sin acentos ni mayúsculas: "Desagüe" ≈ "desague".
 */
export function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
