-- ============================================================================
-- MIGRACIÓN v39 · UN COMUNICADO PUEDE DECIR DÓNDE
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `noticias` se diseñó desde el principio para lo que hace SOSAFE: tiene
-- `imagen_url`, `ubicacion geography(Point)` y `trazado_geojson` para los
-- cierres de vía. El portal ciudadano ya sabe pintar el trazado —polilínea
-- roja discontinua, marcadores de inicio y fin, encuadre automático— y sabe
-- centrar el mapa en un punto.
--
-- Ese código no se ha ejecutado nunca:
--
--   · `trazado_geojson` no está en el formulario del Centro de Monitoreo ni en
--     lo que guarda `comunicados-admin.js`. No hay forma de publicar un cierre.
--   · `ubicacion` sí se puede escribir, pero el portal no la lee. Y aunque la
--     pidiera, PostgREST serializa `geography` como WKB hexadecimal, no como
--     coordenadas: es el mismo problema que llevó a leer los casos desde
--     `v_casos_mapa` en lugar de la tabla.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ COLUMNAS GENERADAS Y NO UNA VISTA
--
-- Para los casos se resolvió con `v_casos_mapa`, que expone `st_y`/`st_x`. Aquí
-- no sirve: el portal lee `noticias` con el embebido `noticias_distritos(...)`,
-- y PostgREST solo sabe embeber a través de claves foráneas declaradas. Desde
-- una vista, esa relación desaparece y habría que reescribir la consulta y el
-- filtrado por distrito, que es lo que decide qué ve cada vecino.
--
-- Dos columnas generadas resuelven lo mismo sin tocar nada de eso. Son STORED,
-- así que no se calculan en cada lectura, y al derivarse de `ubicacion` no
-- pueden desincronizarse: no hay forma de escribir un punto y unas coordenadas
-- que no coincidan.
--
-- `st_y`/`st_x` sobre el cast a `geometry` son IMMUTABLE, que es lo que exige
-- una columna generada.
--
-- ----------------------------------------------------------------------------
-- EL FORMATO DEL TRAZADO
--
-- `trazado_geojson` NO es GeoJSON pese al nombre —queda así por compatibilidad
-- con la columna existente—. Es un arreglo de pares `[[lat, lng], …]`, que es
-- exactamente lo que consume `L.polyline` sin conversión. GeoJSON usa el orden
-- contrario, [lng, lat], y mezclarlos dibuja el trazo en el océano Índico; el
-- CHECK que se añade aquí al menos garantiza la forma.
--
-- ----------------------------------------------------------------------------
-- REQUISITOS: schema.sql (tabla `noticias`), PostGIS. Idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Coordenadas legibles desde el navegador
-- ----------------------------------------------------------------------------
alter table public.noticias
    add column if not exists lat double precision
        generated always as (st_y(ubicacion::geometry)) stored;

alter table public.noticias
    add column if not exists lng double precision
        generated always as (st_x(ubicacion::geometry)) stored;

comment on column public.noticias.lat is
    'Latitud derivada de `ubicacion`. Existe porque PostgREST entrega la '
    'columna geography como WKB hexadecimal, inservible en el navegador. '
    'Generada: no se puede escribir, y por eso no puede contradecir al punto.';

comment on column public.noticias.lng is
    'Longitud derivada de `ubicacion`. Ver el comentario de `lat`.';

-- ----------------------------------------------------------------------------
-- 2. El trazado, con forma comprobada
--
--    Sin esto, un arreglo mal formado —GeoJSON de verdad, o pares invertidos—
--    no falla al guardar: falla al dibujar, en el móvil del vecino, y allí no
--    hay quien lo vea. Se comprueba que sea un arreglo de al menos dos pares
--    numéricos dentro del rango de El Salvador.
--
--    `not valid` para no recorrer las filas ya existentes al añadirlo; se
--    valida acto seguido, cuando la tabla todavía es pequeña.
-- ----------------------------------------------------------------------------
create or replace function public.fn_trazado_es_valido(p_trazado jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
    select p_trazado is null
        or (
            jsonb_typeof(p_trazado) = 'array'
            and jsonb_array_length(p_trazado) between 2 and 500
            and not exists (
                select 1
                  from jsonb_array_elements(p_trazado) as par
                 where jsonb_typeof(par.value) <> 'array'
                    or jsonb_array_length(par.value) <> 2
                    or jsonb_typeof(par.value -> 0) <> 'number'
                    or jsonb_typeof(par.value -> 1) <> 'number'
                    -- Rango de El Salvador, holgado. Ataja el error clásico de
                    -- guardar [lng, lat]: con el orden invertido, la latitud
                    -- caería en -89 y se rechaza aquí.
                    or (par.value ->> 0)::double precision not between 13.0 and 14.5
                    or (par.value ->> 1)::double precision not between -90.5 and -87.5
            )
        );
$$;

comment on function public.fn_trazado_es_valido(jsonb) is
    'Comprueba que `noticias.trazado_geojson` sea un arreglo de pares '
    '[lat, lng] numéricos y dentro del país. El nombre de la columna dice '
    'GeoJSON pero el orden es el de Leaflet, no el del estándar.';

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.noticias'::regclass
           and conname  = 'ck_noticias_trazado'
    ) then
        alter table public.noticias
            add constraint ck_noticias_trazado
            check (public.fn_trazado_es_valido(trazado_geojson)) not valid;

        alter table public.noticias validate constraint ck_noticias_trazado;
    end if;
end $$;

comment on column public.noticias.trazado_geojson is
    'Cierre de vía: arreglo de pares [lat, lng] en el orden que consume '
    'L.polyline, NO el orden [lng, lat] del estándar GeoJSON. El nombre de la '
    'columna es herencia; la forma la garantiza `ck_noticias_trazado` (v39).';

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Las columnas existen y son generadas:
--
-- select column_name, is_generated, generation_expression
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'noticias'
--    and column_name in ('lat','lng');
--    -- is_generated debe ser ALWAYS en las dos.
--
-- 2) El CHECK quedó validado:
--
-- select conname, convalidated from pg_constraint
--  where conrelid = 'public.noticias'::regclass and conname = 'ck_noticias_trazado';
--
-- 3) Que rechaza lo que debe rechazar. Las tres primeras deben dar `false`:
--
-- select public.fn_trazado_es_valido('[[-89.18, 13.65],[-89.19, 13.66]]'::jsonb)  as invertido,
--        public.fn_trazado_es_valido('[[13.65, -89.18]]'::jsonb)                  as un_solo_punto,
--        public.fn_trazado_es_valido('[[13.65]]'::jsonb)                          as par_incompleto,
--        public.fn_trazado_es_valido('[[13.65, -89.18],[13.66, -89.19]]'::jsonb)   as correcto;
--
-- 4) Prueba de extremo a extremo: publica un comunicado desde el Centro de
--    Monitoreo marcando un punto, y otro trazando un cierre de calle. Ábrelos
--    en el portal ciudadano: el primero debe centrar el mapa en el punto; el
--    segundo debe dibujar la vía en rojo con las banderas de inicio y fin.
-- ============================================================================
