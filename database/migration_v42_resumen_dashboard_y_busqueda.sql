-- ============================================================================
-- MIGRACIÓN v42 · El dashboard deja de calcular sobre muestras
-- ============================================================================
--
-- POR QUÉ EXISTE
--
-- El tablero descargaba hasta 5.000 filas de `casos` para agregar EN EL
-- NAVEGADOR: transferencia O(filas) por cada cambio de rango, y por encima
-- del tope las cifras salían de una muestra parcial (el propio store lo
-- avisa y pide esta función por su nombre). Peor: los KPI de stock
-- («Pendientes», «En atención») se contaban con estados que NO existen en el
-- flujo — 'recibida', 'en_atencion', 'cerrada' contra un catálogo real de
-- pendiente / en_revision / en_obra / resuelta / rechazada — así que el
-- Centro de Monitoreo llevaba mostrando «Pendientes: 0» con casos abiertos.
-- Una función que agrega EN LA BASE devuelve O(grupos), siempre sobre el
-- total real, y con una sola definición de cada número.
--
-- SEGURIDAD: SECURITY INVOKER, a propósito. La función corre con los permisos
-- de quien pregunta, así que RLS aplica y cada jefatura recibe el resumen de
-- SU ámbito — el mismo recorte que ya rige en las listas. Aquí no hay nada
-- que un SECURITY DEFINER deba saltarse.
--
-- ZONA HORARIA: los cortes de día son de El Salvador (UTC-6, sin horario de
-- verano). Si el día se cortara en UTC, los casos de las 6 de la tarde
-- contarían como «mañana» y la serie diaria no cuadraría con lo que el
-- operador ve por la ventana.
--
-- «VENCIDA» NO SE INVENTA AQUÍ: es la misma regla de v_kpis_distrito (v16) —
-- caso abierto cuyo `created_at` superó `prioridades.tiempo_objetivo_horas`.
-- Dos definiciones de «vencida» en dos pantallas es como un mismo distrito
-- sale ámbar en una y rojo en otra.
-- ============================================================================

create or replace function public.resumen_dashboard(p_dias integer default 7)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
    c_zona       constant text := 'America/El_Salvador';
    v_hoy        date;
    v_desde      date;         -- inicio del periodo actual (incluido)
    v_desde_prev date;         -- inicio del periodo anterior (incluido)
    v_resultado  jsonb;
begin
    if p_dias is null or p_dias < 1 or p_dias > 366 then
        raise exception 'p_dias debe estar entre 1 y 366 (llegó %)', p_dias;
    end if;

    v_hoy        := (now() at time zone c_zona)::date;
    v_desde      := v_hoy - (p_dias - 1);
    v_desde_prev := v_desde - p_dias;

    with base as (
        -- Una sola pasada sobre la ventana de ambos periodos. RLS ya filtró.
        select c.id,
               c.correlativo,
               c.titulo,
               c.direccion_referencia,
               c.estado_codigo,
               c.categoria_id,
               c.departamento_actual_id,
               c.prioridad_id,
               (c.created_at   at time zone c_zona)::date as dia_alta,
               (c.fecha_cierre at time zone c_zona)::date as dia_cierre,
               c.created_at
        from public.casos c
        where c.deleted_at is null
    ),
    flujo as (
        select
            count(*) filter (where dia_alta   between v_desde      and v_hoy)          as nuevos,
            count(*) filter (where dia_alta   between v_desde_prev and v_desde - 1)    as nuevos_prev,
            count(*) filter (where dia_cierre between v_desde      and v_hoy)          as resueltos,
            count(*) filter (where dia_cierre between v_desde_prev and v_desde - 1)    as resueltos_prev
        from base
    ),
    stock as (
        -- Foto de AHORA, sin ventana: pendientes y vencidas no dependen del rango.
        select
            count(*) filter (where b.estado_codigo = 'pendiente')                       as pendientes,
            count(*) filter (where b.estado_codigo in ('en_revision','en_obra'))        as en_curso,
            count(*) filter (
                where b.estado_codigo not in ('resuelta','rechazada')
                  and p.tiempo_objetivo_horas is not null
                  and b.created_at < now() - make_interval(hours => p.tiempo_objetivo_horas)
            )                                                                           as vencidas
        from base b
        left join public.prioridades p on p.id = b.prioridad_id
    ),
    serie as (
        -- Un punto por día del periodo actual, con ceros incluidos: una serie
        -- con huecos hace que la sparkline dibuje una recta falsa entre picos.
        select coalesce(jsonb_agg(jsonb_build_object(
                   'dia',       d.dia,
                   'nuevos',    coalesce(a.nuevos, 0),
                   'resueltos', coalesce(r.resueltos, 0)
               ) order by d.dia), '[]'::jsonb) as puntos
        from generate_series(v_desde, v_hoy, interval '1 day') as d(dia)
        left join (select dia_alta   as dia, count(*) as nuevos    from base where dia_alta   >= v_desde group by 1) a using (dia)
        left join (select dia_cierre as dia, count(*) as resueltos from base where dia_cierre >= v_desde group by 1) r using (dia)
    ),
    por_departamento as (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.departamento_actual_id, 'total', x.total)
                                  order by x.total desc), '[]'::jsonb) as lista
        from (
            select departamento_actual_id, count(*) as total
            from base
            where dia_alta between v_desde and v_hoy
              and departamento_actual_id is not null
            group by 1
        ) x
    ),
    atencion as (
        -- Los cinco abiertos MÁS PASADOS de su objetivo, no los más antiguos:
        -- un caso crítico de ayer (objetivo 4 h) urge más que uno informativo
        -- de hace un mes que no tiene objetivo.
        select coalesce(jsonb_agg(jsonb_build_object(
                   'id',            y.id,
                   'correlativo',   y.correlativo,
                   'titulo',        y.titulo,
                   'direccion',     y.direccion_referencia,
                   'categoria_id',  y.categoria_id,
                   'estado_codigo', y.estado_codigo,
                   'horas_exceso',  y.horas_exceso
               ) order by y.horas_exceso desc), '[]'::jsonb) as lista
        from (
            select b.*,
                   round((extract(epoch from (now() - b.created_at)) / 3600.0
                          - p.tiempo_objetivo_horas)::numeric, 1) as horas_exceso
            from base b
            join public.prioridades p on p.id = b.prioridad_id
            where b.estado_codigo not in ('resuelta','rechazada')
              and p.tiempo_objetivo_horas is not null
              and b.created_at < now() - make_interval(hours => p.tiempo_objetivo_horas)
            order by horas_exceso desc
            limit 5
        ) y
    )
    select jsonb_build_object(
        'nuevos',           f.nuevos,
        'nuevos_prev',      f.nuevos_prev,
        'resueltos',        f.resueltos,
        'resueltos_prev',   f.resueltos_prev,
        'pendientes',       s.pendientes,
        'en_curso',         s.en_curso,
        'vencidas',         s.vencidas,
        'serie',            se.puntos,
        'por_departamento', pd.lista,
        'atencion',         at.lista,
        'generado_en',      now()
    )
    into v_resultado
    from flujo f, stock s, serie se, por_departamento pd, atencion at;

    return v_resultado;
end;
$$;

comment on function public.resumen_dashboard(integer) is
    'Agregados del tablero en una sola llamada: flujo del periodo y del '
    'anterior, stock actual (pendientes, en curso, vencidas con la regla de '
    'v_kpis_distrito), serie diaria, reparto por departamento y los cinco '
    'casos más pasados de su tiempo objetivo. SECURITY INVOKER: RLS decide '
    'qué casos entran, así que cada jefatura ve el resumen de su ámbito.';

grant execute on function public.resumen_dashboard(integer) to authenticated;

-- ============================================================================
-- ÍNDICES · lo que las consultas nuevas van a pedir
-- ============================================================================

-- El resumen y las listas recorren por fecha de alta dentro de los vivos.
create index if not exists idx_casos_created_at
    on public.casos (created_at desc)
    where deleted_at is null;

-- La bitácora gana rango de fechas real y paginación por cursor (id). La PK
-- ya cubre el cursor; este cubre el corte por fechas.
create index if not exists idx_bitacora_created_at
    on public.bitacora_auditoria (created_at desc);

-- ============================================================================
-- BÚSQUEDA DE DENUNCIAS EN EL SERVIDOR
-- ============================================================================
-- El buscador de Gestión de Denuncias pasa a preguntarle a la base cuando hay
-- más casos que los cargados: un `ilike '%texto%'` sin índice es un recorrido
-- completo de la tabla en cada tecleo. pg_trgm lo convierte en búsqueda por
-- trigramas sobre las tres columnas que la gente realmente escribe.
-- (En Supabase la extensión vive en el esquema `extensions`; los operadores
-- se resuelven igual.)

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_casos_trgm_direccion
    on public.casos using gin (direccion_referencia extensions.gin_trgm_ops)
    where deleted_at is null;

create index if not exists idx_casos_trgm_titulo
    on public.casos using gin (titulo extensions.gin_trgm_ops)
    where deleted_at is null;

create index if not exists idx_casos_trgm_correlativo
    on public.casos using gin (correlativo extensions.gin_trgm_ops)
    where deleted_at is null;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
do $$
declare
    v jsonb;
begin
    v := public.resumen_dashboard(7);
    raise notice 'resumen_dashboard(7) responde: % nuevos, % pendientes, % vencidas',
        v->>'nuevos', v->>'pendientes', v->>'vencidas';
end $$;
