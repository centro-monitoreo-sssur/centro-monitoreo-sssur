-- ============================================================================
-- MIGRACIÓN v27 · INDICADORES POR DISTRITO ACOTADOS A UN PERÍODO
--
-- PARA QUÉ
--   El Cartograma tiene un filtro "Desde / Hasta" que NO filtraba nada. Lo que
--   hacía era calcular la fracción del año que abarca el rango y MULTIPLICAR
--   los contadores por ella:
--
--       factorFecha = díasDelRango / 365
--       denunciasActivas = total * factorFecha
--
--   Eso no es filtrar: es inventar. Un rango de tres meses mostraba el 25 % del
--   acumulado como si fueran los casos de ese trimestre, con un número redondo
--   y verosímil que nadie tenía forma de distinguir de un dato real. En una
--   herramienta que existe para decidir dónde se mandan cuadrillas y
--   presupuesto, eso es peor que no tener filtro.
--
--   `v_kpis_distrito` (v16) ya agrega bien, pero responde a "cómo está el
--   municipio AHORA" y no admite parámetros — una vista no puede recibirlos.
--   Esta función responde a la otra pregunta, la analítica: "de lo que entró en
--   este período, cómo hemos respondido".
--
-- SEMÁNTICA DEL PERÍODO — importa entenderla antes de leer los números
--   Se filtra por `created_at`: los casos REPORTADOS dentro del rango, con el
--   estado que tienen hoy. No por fecha de cierre.
--
--   La alternativa —contar lo cerrado en el período— mezclaría casos abiertos
--   hace un año con los de la semana pasada y no permitiría medir capacidad de
--   respuesta. Con este criterio, "resueltas / total" de un trimestre significa
--   exactamente "qué proporción de lo que nos entró ese trimestre hemos
--   cerrado", que es la pregunta que se hace una jefatura.
--
-- REQUIERE: migration_v16 (prioridades y el patrón de v_kpis_distrito).
-- IDEMPOTENTE.
-- ============================================================================

begin;

create or replace function public.kpis_distrito_periodo(
    p_desde date default null,
    p_hasta date default null
)
returns table (
    distrito_id            smallint,
    distrito_codigo        text,
    distrito_nombre        text,
    total                  bigint,
    pendientes             bigint,
    en_curso               bigint,
    resueltas              bigint,
    rechazadas             bigint,
    fuera_de_objetivo      bigint,
    criticas_abiertas      bigint,
    intervenciones_activas bigint,
    horas_promedio_cierre  numeric,
    ultimo_caso_en         timestamptz
)
language sql
stable
parallel safe
-- SECURITY INVOKER (por defecto), igual que `v_kpis_distrito`, que se declara
-- con `security_invoker = on`. Es deliberado: así la RLS de `casos` recorta lo
-- que cada usuario puede contar. Una jefatura distrital recibe las cinco filas
-- pero con ceros donde no alcanza, y el store descarta esas filas.
set search_path = public
as $$
    select
        d.id, d.codigo, d.nombre,
        count(c.id),
        count(c.id) filter (where c.estado_codigo = 'pendiente'),
        count(c.id) filter (where c.estado_codigo in ('en_revision','en_obra')),
        count(c.id) filter (where c.estado_codigo = 'resuelta'),
        count(c.id) filter (where c.estado_codigo = 'rechazada'),
        count(c.id) filter (
            where c.estado_codigo not in ('resuelta','rechazada')
              and p.tiempo_objetivo_horas is not null
              and c.created_at < now() - make_interval(hours => p.tiempo_objetivo_horas)
        ),
        count(c.id) filter (where c.prioridad_id = 1
                              and c.estado_codigo not in ('resuelta','rechazada')),
        -- Intervención = caso abierto con alguien asignado, sea persona o
        -- cuadrilla. Es la definición que ya usa `stores/intervenciones.js`, y
        -- lo que distingue "hay trabajo en marcha" de "hay trabajo pendiente
        -- de asignar", que para una jefatura no es lo mismo en absoluto.
        count(c.id) filter (
            where c.estado_codigo not in ('resuelta','rechazada')
              and (c.usuario_responsable_id is not null
                   or c.cuadrilla_responsable_id is not null)
        ),
        -- El cast a numeric es obligatorio: `round(x, n)` solo existe para
        -- numeric, y `extract(epoch ...)` devuelve double precision.
        round(
            (avg(extract(epoch from (c.fecha_cierre - c.created_at)) / 3600.0)
             filter (where c.fecha_cierre is not null))::numeric
        , 1),
        max(c.created_at)
    from public.distritos d
    left join public.casos c
           on c.distrito_id = d.id
          and c.deleted_at is null
          -- El rango va en el JOIN y NO en un WHERE: con un `where` sobre una
          -- tabla del lado derecho de un LEFT JOIN, las filas sin coincidencia
          -- quedan con NULL, la condición da NULL y el distrito DESAPARECE del
          -- resultado. Un distrito sin casos en el período tiene que salir con
          -- ceros, no ausentarse del comparativo.
          and (p_desde is null or c.created_at >= p_desde::timestamptz)
          -- `< p_hasta + 1 día` en vez de `<= p_hasta`: `p_hasta::timestamptz`
          -- es medianoche, así que `<=` dejaría fuera todo lo reportado durante
          -- el último día del rango.
          and (p_hasta is null or c.created_at < (p_hasta + 1)::timestamptz)
    left join public.prioridades p on p.id = c.prioridad_id
    where d.activo
    group by d.id, d.codigo, d.nombre
    order by d.nombre;
$$;

comment on function public.kpis_distrito_periodo is
    'Indicadores por distrito de los casos REPORTADOS entre p_desde y p_hasta '
    '(ambos inclusive, nulos = sin límite). Complementa a v_kpis_distrito, que '
    'responde al estado actual y no admite parámetros. Respeta la RLS de casos.';

revoke all on function public.kpis_distrito_periodo(date, date) from public;
grant execute on function public.kpis_distrito_periodo(date, date) to authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) Sin período: debe coincidir EXACTAMENTE con la vista.
-- select k.distrito_nombre, k.total as por_funcion, v.total as por_vista
--   from public.kpis_distrito_periodo() k
--   join public.v_kpis_distrito v on v.distrito_id = k.distrito_id
--  order by k.distrito_nombre;

-- 2) Los cinco distritos deben salir SIEMPRE, aunque no tengan casos.
-- select distrito_nombre, total from public.kpis_distrito_periodo('2020-01-01','2020-01-02');
--    → 5 filas con total = 0

-- 3) El último día del rango cuenta. Si hay un caso creado hoy:
-- select sum(total) from public.kpis_distrito_periodo(current_date, current_date);
--    → debe incluirlo, no devolver 0
