// ============================================================================
// GENERADOR: GeoJSON → SQL
//
// Convierte la cartografía que entrega Catastro (exportada de QGIS) en
// sentencias SQL cargables en Supabase. Es una herramienta de construcción, no
// código de la aplicación: se ejecuta a mano cuando llega cartografía nueva y
// su salida se revisa y se versiona.
//
// Existe porque los polígonos del municipio suman ~26 000 vértices. Escribir
// eso a mano no es viable, y pegarlo sin normalizar arrastra tres problemas que
// esta herramienta resuelve:
//
//   1. COORDENADA Z. QGIS exporta [lng, lat, 0]. Una columna declarada
//      `geometry(MultiPolygon, 4326)` es 2D y RECHAZA una geometría 3D.
//   2. PRECISIÓN INÚTIL. El origen trae hasta 15 decimales (~1 nm). Se redondea
//      a 6 (~11 cm), muy por debajo del error del GPS de un teléfono, y el
//      archivo baja de 1,1 MB a ~630 KB.
//   3. GEOMETRÍAS INVÁLIDAS. Un «dissolve» de QGIS deja auto-intersecciones con
//      normalidad. `ST_Contains` sobre una geometría inválida da resultados
//      incorrectos en vez de fallar, así que la carga aplica `ST_MakeValid`.
//
// USO
//   node database/herramientas/geojson-a-sql.mjs distritos \
//        assets/js/services/geo-json/limites-sssur.geojson \
//        database/seed_v18_distritos_geometria.sql
//
//   node database/herramientas/geojson-a-sql.mjs colonias \
//        assets/js/services/geo-json/colonias-san-marcos.geojson \
//        database/seed_v18_colonias_san_marcos.sql
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const DECIMALES = 6;
const FACTOR = 10 ** DECIMALES;

// `Municipio` del GeoJSON → `distritos.codigo`. El origen viene en mayúsculas y
// sin tildes; la base usa el topónimo correcto. Se emparejan por código, que no
// depende de la ortografía de ninguno de los dos lados.
const CODIGO_POR_MUNICIPIO = {
  'PANCHIMALCO': 'PAN',
  'ROSARIO DE MORA': 'RDM',
  'SAN MARCOS': 'SMA',
  'SANTIAGO TEXACUANGOS': 'STX',
  'SANTO TOMAS': 'STO',
};

/**
 * Redondea a `DECIMALES` y descarta la altitud.
 *
 * Recursiva sobre la estructura anidada de coordenadas (Polygon lleva 3
 * niveles, MultiPolygon 4). Coste O(v) sobre el número de vértices, que es el
 * mínimo posible: hay que tocar cada uno exactamente una vez.
 */
function normalizar(coords) {
  // Caso base: un vértice es [lng, lat] o [lng, lat, z].
  if (typeof coords[0] === 'number') {
    return [Math.round(coords[0] * FACTOR) / FACTOR,
            Math.round(coords[1] * FACTOR) / FACTOR];
  }
  return coords.map(normalizar);
}

function geometriaNormalizada(geometry) {
  return JSON.stringify({
    type: geometry.type,
    coordinates: normalizar(geometry.coordinates),
  });
}

// Literal SQL con comillas dobladas. Solo para textos cortos (nombres); la
// geometría usa dólar-comillas y no necesita escapado.
const texto = (v) =>
  v === null || v === undefined || String(v).trim() === ''
    ? 'null'
    : `'${String(v).trim().replace(/'/g, "''")}'`;

const numero = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? 'null' : Number(v));

// `ST_MakeValid` puede devolver una colección (polígonos + restos lineales) si
// la entrada estaba rota. `ST_CollectionExtract(..., 3)` se queda solo con la
// parte poligonal y `ST_Multi` fuerza el MultiPolygon que declara la columna.
const expresionGeometria = (json) =>
  `st_multi(st_collectionextract(st_makevalid(` +
  `st_setsrid(st_geomfromgeojson($geo$${json}$geo$), 4326)), 3))`;

const cabecera = (titulo, detalle) => `-- ============================================================================
-- ${titulo}
--
${detalle.split('\n').map((l) => `-- ${l}`.trimEnd()).join('\n')}
--
-- GENERADO por database/herramientas/geojson-a-sql.mjs — no editar a mano.
-- REQUIERE: migration_v18_geografia_y_alta_en_campo.sql (crea las columnas).
-- IDEMPOTENTE: se puede volver a ejecutar sin duplicar nada.
-- ============================================================================

begin;
`;

// ── Distritos ───────────────────────────────────────────────────────────────
function generarDistritos(geojson) {
  const partes = [cabecera(
    'SEED v18a · GEOMETRÍA DE LOS 5 DISTRITOS',
    'Límites oficiales de San Salvador Sur.\n' +
    'Fuente: assets/js/services/geo-json/limites-sssur.geojson (Catastro).\n\n' +
    'Se emparejan por `distritos.codigo`, no por nombre: el GeoJSON trae los\n' +
    'topónimos en mayúsculas y sin tildes.'
  )];

  const vistos = new Set();
  for (const f of geojson.features) {
    const municipio = String(f.properties.Municipio || '').trim().toUpperCase();
    const codigo = CODIGO_POR_MUNICIPIO[municipio];
    if (!codigo) {
      console.error(`  ✗ Sin correspondencia en la base: "${municipio}". Se omite.`);
      continue;
    }
    if (vistos.has(codigo)) {
      console.error(`  ✗ "${municipio}" aparece dos veces. Se omite la repetición.`);
      continue;
    }
    vistos.add(codigo);

    const json = geometriaNormalizada(f.geometry);
    partes.push(`
-- ${municipio} → ${codigo}  (${json.length.toLocaleString('es')} caracteres)
update public.distritos
   set geometria = ${expresionGeometria(json)}
 where codigo = ${texto(codigo)};
`);
    console.error(`  ✓ ${municipio.padEnd(22)} → ${codigo}  ${(json.length / 1024).toFixed(0)} KB`);
  }

  partes.push(`
-- ── Verificación ──────────────────────────────────────────────────────────
-- Los 5 distritos deben quedar con geometría válida y sin solapes entre sí.
do $$
declare
    v_sin_geometria int;
    v_invalidas     int;
begin
    select count(*) into v_sin_geometria from public.distritos where geometria is null and activo;
    select count(*) into v_invalidas     from public.distritos where geometria is not null and not st_isvalid(geometria);

    if v_sin_geometria > 0 then
        raise warning 'Quedan % distritos activos sin geometría. El alta en campo los rechazará.', v_sin_geometria;
    end if;
    if v_invalidas > 0 then
        raise warning 'Hay % geometrías inválidas pese a ST_MakeValid. Revisa el origen.', v_invalidas;
    end if;
end $$;

commit;

-- Comprobación manual sugerida (área en km² y vértices por distrito):
--   select codigo, nombre,
--          round((st_area(geometria::geography) / 1e6)::numeric, 2) as km2,
--          st_npoints(geometria) as vertices,
--          st_isvalid(geometria) as valida
--     from public.distritos order by codigo;
`);
  return partes.join('');
}

// ── Colonias ────────────────────────────────────────────────────────────────
function generarColonias(geojson, codigoDistrito) {
  const partes = [cabecera(
    `SEED v18b · COLONIAS DEL DISTRITO ${codigoDistrito}`,
    'Cartografía de colonias, barrios, lotificaciones y comunidades.\n' +
    'Fuente: assets/js/services/geo-json/colonias-san-marcos.geojson (Catastro).\n\n' +
    'Alimenta el filtro por centro poblacional del Mapa en Vivo, que hasta\n' +
    'ahora apuntaba a una columna inexistente y no filtraba nada.'
  )];

  partes.push(`
-- El distrito se resuelve una vez y se reutiliza. Si no existe, el insert no
-- escribe nada en vez de fallar con una violación de FK poco informativa.
do $$
declare
    v_distrito_id smallint;
begin
    select id into v_distrito_id from public.distritos where codigo = ${texto(codigoDistrito)};
    if v_distrito_id is null then
        raise exception 'No existe el distrito con código %. Ejecuta migration_v11 primero.', ${texto(codigoDistrito)};
    end if;
end $$;
`);

  let n = 0;
  for (const f of geojson.features) {
    const nombre = String(f.properties.text_1 || '').trim();
    if (!nombre) {
      console.error('  ✗ Colonia sin nombre. Se omite.');
      continue;
    }
    const json = geometriaNormalizada(f.geometry);
    partes.push(`
insert into public.colonias (distrito_id, nombre, zona, viviendas, geometria)
select d.id, ${texto(nombre)}, ${numero(f.properties.zona)}, ${numero(f.properties.viviendas)},
       ${expresionGeometria(json)}
  from public.distritos d where d.codigo = ${texto(codigoDistrito)}
on conflict (distrito_id, nombre) do update
   set zona      = excluded.zona,
       viviendas = excluded.viviendas,
       geometria = excluded.geometria;
`);
    n++;
  }
  console.error(`  ✓ ${n} colonias para ${codigoDistrito}`);

  partes.push(`
do $$
declare v_total int; v_invalidas int;
begin
    select count(*) into v_total from public.colonias;
    select count(*) into v_invalidas from public.colonias where not st_isvalid(geometria);
    raise notice 'Colonias cargadas: %. Inválidas: %.', v_total, v_invalidas;
end $$;

commit;
`);
  return partes.join('');
}

// ── Punto de entrada ────────────────────────────────────────────────────────
const [modo, entrada, salida] = process.argv.slice(2);

if (!modo || !entrada || !salida) {
  console.error('Uso: node geojson-a-sql.mjs <distritos|colonias> <entrada.geojson> <salida.sql>');
  process.exit(1);
}

const geojson = JSON.parse(readFileSync(entrada, 'utf8'));
console.error(`Leído ${entrada}: ${geojson.features.length} entidades`);

let sql;
if (modo === 'distritos')      sql = generarDistritos(geojson);
else if (modo === 'colonias')  sql = generarColonias(geojson, 'SMA');
else { console.error(`Modo desconocido: ${modo}`); process.exit(1); }

writeFileSync(salida, sql, 'utf8');
console.error(`Escrito ${salida}: ${(sql.length / 1024).toFixed(0)} KB`);
