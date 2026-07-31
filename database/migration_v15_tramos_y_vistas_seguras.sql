-- ============================================================================
-- MIGRACIÓN v15 — Tramos de intervención + vistas con security_invoker
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PARTE A · TRAMOS
--   Un empleado o una jefatura registran una intervención desde el módulo
--   ?contexto=empleados y marcan el trayecto recorrido. Ese tramo debe verse
--   en el Mapa en Vivo del Centro de Monitoreo.
--
--   Un tramo NO es una entidad aparte: es un caso cuya geometría es una línea
--   en lugar de un punto. Por eso vive en `casos` y no en una tabla nueva —
--   hereda estado, categoría, departamento, responsable, adjuntos, historial
--   y, sobre todo, la RLS por departamento de la migration_v14. Una tabla
--   separada habría obligado a duplicar las seis cosas.
--
--   Dos formas de captura, según lo que ocurre en campo:
--     manual              El tramo es rural y no existe en la base de calles
--                         de OpenStreetMap: se dibuja vértice a vértice.
--     trazado_inteligente Se marcan inicio y fin, OSRM traza sobre la vía real,
--                         y el usuario corrige si la ruta se desvía por calles
--                         que no forman parte de la intervención.
--
--   `recorrido_vertices` guarda los puntos de control que definió la persona
--   (inicio, fin y correcciones). Sin eso, un tramo trazado con OSRM no se
--   podría volver a editar: solo quedaría la polilínea resultante y se
--   perdería la intención original.
--
-- PARTE B · SEGURIDAD DE LAS VISTAS
--   Ninguna de las vistas del proyecto declara security_invoker. En Postgres
--   una vista se ejecuta con los privilegios de su DUEÑO, y el dueño aquí es
--   `postgres`, que tiene BYPASSRLS. Como PostgREST expone las vistas, hoy
--   cualquier usuario autenticado que consulte v_casos_mapa obtiene TODOS los
--   casos del municipio y esquiva el alcance por departamento de la v14.
--   Con security_invoker = on la vista se evalúa con los permisos de quien
--   consulta, y la RLS vuelve a aplicarse.
--
-- REQUIERE: migration_v14. PostGIS. IDEMPOTENTE.
-- ============================================================================

begin;

-- ============================================================================
-- PARTE A — Modelo de tramos
-- ============================================================================

alter table public.casos
    add column if not exists recorrido          geography(LineString, 4326),
    add column if not exists recorrido_modo     text,
    add column if not exists recorrido_vertices jsonb;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_casos_recorrido_modo') then
        alter table public.casos add constraint chk_casos_recorrido_modo
            check (recorrido_modo is null
                   or recorrido_modo in ('manual', 'trazado_inteligente'));
    end if;

    -- Coherencia: o hay recorrido y modo, o no hay ninguno de los dos.
    if not exists (select 1 from pg_constraint where conname = 'chk_casos_recorrido_completo') then
        alter table public.casos add constraint chk_casos_recorrido_completo
            check ((recorrido is null and recorrido_modo is null)
                   or (recorrido is not null and recorrido_modo is not null));
    end if;

    -- Mismo encierre territorial que ya aplica a `ubicacion`: el trazo completo
    -- debe caer dentro del bounding box de San Salvador Sur. Evita que un GPS
    -- descalibrado meta una línea que cruce el país.
    if not exists (select 1 from pg_constraint where conname = 'chk_casos_recorrido_bbox') then
        alter table public.casos add constraint chk_casos_recorrido_bbox
            check (
                recorrido is null or (
                    st_ymin(recorrido::geometry) >= 13.50
                    and st_ymax(recorrido::geometry) <= 13.85
                    and st_xmin(recorrido::geometry) >= -89.40
                    and st_xmax(recorrido::geometry) <= -89.05
                )
            );
    end if;
end $$;

comment on column public.casos.recorrido is
    'Trayecto de la intervención como línea. NULL en los casos puntuales. '
    'Su presencia es lo que separa la capa "Tramos en Intervención" de la de '
    'intervenciones puntuales en el Mapa en Vivo.';

comment on column public.casos.recorrido_modo is
    'manual = dibujado vértice a vértice (zonas rurales sin cobertura OSM). '
    'trazado_inteligente = ruteado sobre la vía real y corregido por el usuario.';

comment on column public.casos.recorrido_vertices is
    'Puntos de control que definió la persona, formato [[lat,lng], ...]. '
    'Permite reabrir y reeditar un tramo trazado con OSRM sin perder la '
    'intención original; la polilínea sola no basta.';

create index if not exists idx_casos_recorrido
    on public.casos using gist (recorrido);

-- Índice parcial: la capa de tramos del mapa siempre filtra por "tiene línea".
create index if not exists idx_casos_con_recorrido
    on public.casos (id) where recorrido is not null and deleted_at is null;

-- ============================================================================
-- PARTE B — Vistas
-- ============================================================================

-- v_casos_mapa: se añade la geometría de tramo y su longitud.
-- ST_AsGeoJSON entrega coordenadas [lng, lat]; Leaflet las espera [lat, lng],
-- así que el store del frontend debe invertirlas al construir la polilínea.
--
-- Se SUELTA y recrea en lugar de usar `create or replace`: esa forma solo
-- admite añadir columnas al final, y aquí las de tramo se insertan junto a
-- lat/lng para que la vista se lea agrupada por concepto. Sin el drop,
-- PostgreSQL aborta con
-- "cannot change name of view column caso_padre_id to recorrido_geojson".
--
-- Sin CASCADE a propósito: nada depende de esta vista (v_mis_intervenciones
-- lee de public.casos directamente), y si algún día algo dependiera, es mejor
-- que la migración falle y lo revisemos a que se lleve objetos por delante.
drop view if exists public.v_casos_mapa;

create view public.v_casos_mapa as
select
    c.id,
    c.correlativo,
    c.titulo,
    c.descripcion,
    c.estado_codigo,
    c.prioridad_id,
    p.nombre       as prioridad_nombre,
    p.color_hex    as prioridad_color,
    c.categoria_id,
    cat.nombre     as categoria_nombre,
    cat.icono      as categoria_icono,
    cat.color_hex  as categoria_color,
    c.distrito_id,
    d.nombre       as distrito_nombre,
    c.departamento_actual_id,
    dep.nombre     as departamento_nombre,
    case when c.ubicacion is null then null
         else st_y(c.ubicacion::geometry) end as lat,
    case when c.ubicacion is null then null
         else st_x(c.ubicacion::geometry) end as lng,
    -- Tramo
    case when c.recorrido is null then null
         else st_asgeojson(c.recorrido::geometry) end as recorrido_geojson,
    c.recorrido_modo,
    c.recorrido_vertices,
    case when c.recorrido is null then null
         else round(st_length(c.recorrido)::numeric, 1) end as recorrido_metros,
    (c.recorrido is not null) as es_tramo,
    -- Asignación, para separar intervenciones activas de denuncias sin atender
    c.usuario_responsable_id,
    c.cuadrilla_responsable_id,
    c.caso_padre_id,
    c.fecha_cierre,
    c.created_at,
    c.updated_at
from public.casos c
join public.distritos d on d.id = c.distrito_id
join public.prioridades p on p.id = c.prioridad_id
join public.categorias_caso cat on cat.id = c.categoria_id
join public.departamentos dep on dep.id = c.departamento_actual_id
where c.deleted_at is null;

-- Al soltar la vista se perdieron sus permisos: hay que reponerlos o PostgREST
-- responderá 401/404 al consultarla. Solo `authenticated`, en coherencia con
-- que todas las políticas del proyecto son `to authenticated`.
grant select on public.v_casos_mapa to authenticated;

comment on view public.v_casos_mapa is
    'Casos vigentes para el Mapa en Vivo. `es_tramo` separa la capa de tramos '
    '(geometría de línea) de la de incidencias puntuales.';

-- ----------------------------------------------------------------------------
-- security_invoker en TODAS las vistas del proyecto.
-- Requiere PostgreSQL 15 o superior; Supabase ya lo cumple. Si la instancia
-- fuera anterior, la migración avisa en lugar de fallar en silencio.
-- ----------------------------------------------------------------------------
do $$
declare
    v_vista text;
begin
    if current_setting('server_version_num')::int < 150000 then
        raise warning
            'PostgreSQL % no soporta security_invoker. Las vistas SIGUEN esquivando la RLS: hay que actualizar el servidor o dejar de exponerlas vía PostgREST.',
            current_setting('server_version');
        return;
    end if;

    foreach v_vista in array array[
        'v_casos_mapa',
        'v_mis_intervenciones',
        'v_categorias_por_departamento',
        'v_organigrama_vigente',
        'v_departamentos_historicos'
    ] loop
        if to_regclass('public.' || v_vista) is not null then
            execute format('alter view public.%I set (security_invoker = on)', v_vista);
        end if;
    end loop;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Todas las vistas deben salir con security_invoker=on (ESPERADO: 0 filas)
--   select c.relname as vista_sin_security_invoker
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'v'
--      and not coalesce((select option_value = 'true'
--                          from pg_options_to_table(c.reloptions)
--                         where option_name = 'security_invoker'), false);
--
-- Columnas de tramo presentes:
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'casos'
--      and column_name like 'recorrido%'
--    order by 1;
--
-- ----------------------------------------------------------------------------
-- TRAMO DE PRUEBA — para ver la capa funcionando antes de tener la UI de
-- captura. Traza ~500 m sobre la Calle Principal de San Marcos.
-- Ajusta categoria/distrito/departamento a ids que existan en tu base.
-- ----------------------------------------------------------------------------
-- insert into public.casos (
--     categoria_id, distrito_id, canal_reporte_id, departamento_actual_id,
--     estado_codigo, prioridad_id, titulo, descripcion, direccion_referencia,
--     recorrido, recorrido_modo, recorrido_vertices
-- )
-- select cat.id, dis.id, 2, dep.id,
--        'en_obra', 3,
--        'Bacheo Calle Principal San Marcos',
--        'Reparación de carpeta asfáltica en tramo de 500 m',
--        'Calle Principal, entre 3a Calle y el parque central',
--        st_geogfromtext('LINESTRING(-89.1830 13.6570, -89.1822 13.6578, -89.1815 13.6585)'),
--        'trazado_inteligente',
--        '[[13.6570,-89.1830],[13.6585,-89.1815]]'::jsonb
--   from public.categorias_caso cat,
--        public.distritos       dis,
--        public.departamentos   dep
--  where cat.codigo = 'VIA-BACHE'
--    and dis.codigo = 'SMA'
--    and dep.codigo = '0401-09';
--
-- Comprobar que aparece como tramo:
--   select id, titulo, es_tramo, recorrido_modo, recorrido_metros
--     from public.v_casos_mapa where es_tramo;
