-- ============================================================================
-- MIGRACIÓN v28 · PERFIL DEL DISTRITO Y ANALÍTICA DEL CARTOGRAMA
--
-- Cierra las seis carencias que hacían del Cartograma una pantalla bonita en
-- lugar de una herramienta de decisión.
--
-- 1. LOS DATOS OFICIALES SALEN DEL CÓDIGO
--    Población, altitud, teléfono y perfil de cada distrito vivían en un objeto
--    literal de `admin/vista-cartograma.js`. Cuando llegue el próximo censo,
--    actualizarlos exigía un despliegue y un desarrollador. Ahora es una tabla
--    con `fuente` y `actualizado_en`: quien lea una cifra puede saber de dónde
--    sale y desde cuándo, que es la diferencia entre un dato y un rumor.
--
-- 2. LA SUPERFICIE SE MIDE, NO SE DECLARA
--    `extensionKm2` sumaba 198,67 km² escritos a mano. Medida sobre los
--    polígonos oficiales que cargó la v18, la superficie real es ~217 km², con
--    la diferencia concentrada en Panchimalco (89,97 declarados frente a ~97,8
--    medidos). Como la densidad poblacional es uno de los modos del cartograma,
--    ese 9 % de error se propagaba a una de las cuatro vistas de análisis.
--
--    La superficie ya NO se almacena: se calcula con `st_area` sobre la
--    geometría. Si Catastro entrega cartografía corregida, el número se corrige
--    solo y no queda una constante vieja contradiciendo al mapa.
--
-- 3. INDICADORES QUE ACCIONAN
--    Se añaden al RPC del período: antigüedad del caso abierto más viejo y las
--    tres categorías que más pesan en cada distrito. Saber que "Panchimalco
--    tiene carga alta" no dice a quién mandar; saber que son baches, luminarias
--    y desagües, sí.
--
-- REQUIERE: migration_v11 (distritos), v18 (geometría), v27 (RPC de período).
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Perfil de cada distrito
-- ----------------------------------------------------------------------------
create table if not exists public.distritos_perfil (
    distrito_id   smallint primary key references public.distritos(id) on delete cascade,
    poblacion     integer,
    altitud_msnm  integer,
    telefono      text,
    icono         text,
    color_hex     text,
    economia      text,
    descripcion   text,
    destacados    text[] not null default '{}',
    -- Trazabilidad. Sin esto, dentro de dos años nadie sabrá si la población
    -- es del censo, de una proyección o de una estimación de alguien.
    fuente        text,
    actualizado_en timestamptz not null default now()
);

comment on table public.distritos_perfil is
    'Datos de referencia de cada distrito: censales, de contacto y descriptivos. '
    'Separado de `distritos` porque ahí solo va lo que el sistema necesita para '
    'operar; esto es material de consulta y lo mantiene la Gerencia, no TI.';

comment on column public.distritos_perfil.fuente is
    'Origen y fecha del dato poblacional. Obligatorio de facto: una cifra sin '
    'procedencia no debería usarse para repartir presupuesto.';

-- La superficie NO es columna: se deriva de `distritos.geometria`. Ver la
-- cabecera, punto 2.

create or replace function public.tocar_distritos_perfil()
returns trigger language plpgsql as $$
begin
    new.actualizado_en := now();
    return new;
end $$;

drop trigger if exists trg_distritos_perfil_touch on public.distritos_perfil;
create trigger trg_distritos_perfil_touch
    before update on public.distritos_perfil
    for each row execute function public.tocar_distritos_perfil();

alter table public.distritos_perfil enable row level security;

drop policy if exists "distritos_perfil_select" on public.distritos_perfil;
create policy "distritos_perfil_select"
    on public.distritos_perfil for select to authenticated
    using (true);   -- datos de consulta pública, nada sensible

drop policy if exists "distritos_perfil_write" on public.distritos_perfil;
create policy "distritos_perfil_write"
    on public.distritos_perfil for all to authenticated
    using (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'));

-- ----------------------------------------------------------------------------
-- 2. Semilla — trasvase de lo que estaba en el JavaScript
--
--    Las cifras se trasladan TAL CUAL estaban en el código, y se marcan como
--    pendientes de verificar. No las doy por buenas: no consta de qué censo o
--    proyección salieron, y sumadas dan 166 671 habitantes, un número que la
--    Gerencia debería contrastar antes de usarlo para repartir recursos.
-- ----------------------------------------------------------------------------
insert into public.distritos_perfil
    (distrito_id, poblacion, altitud_msnm, telefono, icono, color_hex,
     economia, descripcion, destacados, fuente)
select d.id, v.poblacion, v.altitud, v.telefono, v.icono, v.color,
       v.economia, v.descripcion, v.destacados,
       'Trasvase de admin/vista-cartograma.js (v28). PENDIENTE DE VERIFICAR con Catastro/DIGESTYC.'
from (values
    ('PAN', 44404, 570, '2299-8300', '🏛️', '#e91e63',
     'Artesanía, turismo cultural, agricultura.',
     'Conocida como la "Ciudad de los Arcos". Corazón cultural e indígena Náhuat-Pipil del municipio.',
     array['Iglesia La Asunción (s. XVII)','Festival de Las Palmas','Arte indígena Náhuat']),
    ('RDM', 12993, 520, '2399-0600', '🌿', '#ff9800',
     'Agricultura, ganadería, artesanías.',
     'Vocación rural con naturaleza exuberante y vistas al volcán de San Salvador.',
     array['Miradores naturales','Senderos de montaña','Ecoturismo rural']),
    ('SMA', 57094, 760, '2510-4400', '🏢', '#2196f3',
     'Comercio, industria manufacturera, educación.',
     'El distrito más urbanizado. Centro administrativo con alta actividad comercial e industrial.',
     array['Centro histórico','Mercado Central','Arte urbano mural']),
    ('STX', 20081, 820, '2510-4400', '🌸', '#673ab7',
     'Floricultura, viveros, horticultura, comercio.',
     'Famoso por sus flores ornamentales que abastecen los mercados del AMSS.',
     array['Festival de Las Flores','Viveros de orquídeas','Fiestas patronales']),
    ('STO', 32099, 700, '2213-3100', '⛰️', '#4caf50',
     'Residencial, comercio local, servicios, pequeña industria.',
     'Combina vocación urbano-residencial con reservas naturales. Pulmón verde del AMSS.',
     array['Cerro El Chulo','Mirador Lago de Ilopango','Gestión ambiental'])
) as v(codigo, poblacion, altitud, telefono, icono, color, economia, descripcion, destacados)
join public.distritos d on d.codigo = v.codigo
on conflict (distrito_id) do nothing;   -- no pisa correcciones ya hechas

-- ----------------------------------------------------------------------------
-- 3. RPC del período, ampliado
--
--    Se reescribe con CTEs en lugar del LEFT JOIN con condiciones de rango.
--    Además de leerse mejor, evita de raíz la trampa de filtrar el lado débil
--    de un LEFT JOIN en el WHERE, que haría desaparecer del comparativo a los
--    distritos sin casos en el período.
--
--    DROP obligatorio: cambia el tipo de retorno, y `create or replace` no
--    puede alterarlo.
-- ----------------------------------------------------------------------------
drop function if exists public.kpis_distrito_periodo(date, date);

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
    ultimo_caso_en         timestamptz,
    -- Nuevas
    dias_mas_antiguo       integer,   -- antigüedad del caso ABIERTO más viejo
    area_km2               numeric,   -- medida sobre la geometría oficial
    poblacion              integer,
    categorias_top         jsonb      -- [{nombre, total}] hasta 3
)
language sql
stable
parallel safe
-- SECURITY INVOKER a propósito: la RLS de `casos` recorta lo que cada usuario
-- puede contar, igual que en `v_kpis_distrito`.
set search_path = public
as $$
    with casos_periodo as (
        -- El filtro de período vive AQUÍ, sobre `casos` y solo sobre `casos`.
        select c.id, c.distrito_id, c.categoria_id, c.estado_codigo, c.created_at,
               c.fecha_cierre, c.prioridad_id,
               c.usuario_responsable_id, c.cuadrilla_responsable_id,
               p.tiempo_objetivo_horas
          from public.casos c
          left join public.prioridades p on p.id = c.prioridad_id
         where c.deleted_at is null
           and (p_desde is null or c.created_at >= p_desde::timestamptz)
           -- `< p_hasta + 1 día` y no `<= p_hasta`: la fecha se castea a
           -- medianoche, así que `<=` dejaría fuera todo el último día.
           and (p_hasta is null or c.created_at < (p_hasta + 1)::timestamptz)
    ),
    agregado as (
        select
            c.distrito_id,
            count(*)                                                             as total,
            count(*) filter (where c.estado_codigo = 'pendiente')                as pendientes,
            count(*) filter (where c.estado_codigo in ('en_revision','en_obra')) as en_curso,
            count(*) filter (where c.estado_codigo = 'resuelta')                 as resueltas,
            count(*) filter (where c.estado_codigo = 'rechazada')                as rechazadas,
            count(*) filter (
                where c.estado_codigo not in ('resuelta','rechazada')
                  and c.tiempo_objetivo_horas is not null
                  and c.created_at < now() - make_interval(hours => c.tiempo_objetivo_horas)
            )                                                                    as fuera_de_objetivo,
            count(*) filter (where c.prioridad_id = 1
                               and c.estado_codigo not in ('resuelta','rechazada')) as criticas_abiertas,
            count(*) filter (
                where c.estado_codigo not in ('resuelta','rechazada')
                  and (c.usuario_responsable_id is not null
                       or c.cuadrilla_responsable_id is not null)
            )                                                                    as intervenciones_activas,
            round(
                (avg(extract(epoch from (c.fecha_cierre - c.created_at)) / 3600.0)
                 filter (where c.fecha_cierre is not null))::numeric
            , 1)                                                                 as horas_promedio_cierre,
            max(c.created_at)                                                    as ultimo_caso_en,
            -- Antigüedad del pendiente más viejo. Un distrito con 10 casos
            -- abiertos hace seis meses está peor que uno con 40 de ayer, y el
            -- recuento por sí solo no lo distingue.
            extract(day from now() - min(c.created_at)
                    filter (where c.estado_codigo not in ('resuelta','rechazada')))::integer
                                                                                 as dias_mas_antiguo
          from casos_periodo c
         group by c.distrito_id
    ),
    top_categorias as (
        -- Las tres categorías con más casos ABIERTOS. Es lo que convierte
        -- "este distrito va mal" en "manda Obras y Alumbrado".
        select r.distrito_id,
               jsonb_agg(jsonb_build_object('nombre', r.nombre, 'total', r.n)
                         order by r.orden) as top
          from (
            select c.distrito_id, cc.nombre, count(*) as n,
                   row_number() over (partition by c.distrito_id
                                      order by count(*) desc, cc.nombre) as orden
              from casos_periodo c
              join public.categorias_caso cc on cc.id = c.categoria_id
             where c.estado_codigo not in ('resuelta','rechazada')
             group by c.distrito_id, cc.nombre
          ) r
         where r.orden <= 3
         group by r.distrito_id
    )
    select
        d.id, d.codigo, d.nombre,
        coalesce(a.total, 0),
        coalesce(a.pendientes, 0),
        coalesce(a.en_curso, 0),
        coalesce(a.resueltas, 0),
        coalesce(a.rechazadas, 0),
        coalesce(a.fuera_de_objetivo, 0),
        coalesce(a.criticas_abiertas, 0),
        coalesce(a.intervenciones_activas, 0),
        a.horas_promedio_cierre,
        a.ultimo_caso_en,
        a.dias_mas_antiguo,
        -- Superficie MEDIDA sobre el polígono oficial, no declarada a mano.
        -- `::geography` hace que `st_area` devuelva metros cuadrados sobre el
        -- elipsoide; en `geometry` con SRID 4326 devolvería grados cuadrados,
        -- que no significan nada como superficie.
        case when d.geometria is null then null
             else round((st_area(d.geometria::geography) / 1e6)::numeric, 2) end,
        pf.poblacion,
        coalesce(t.top, '[]'::jsonb)
      from public.distritos d
      left join agregado          a  on a.distrito_id = d.id
      left join top_categorias    t  on t.distrito_id = d.id
      left join public.distritos_perfil pf on pf.distrito_id = d.id
     where d.activo
     order by d.nombre;
$$;

comment on function public.kpis_distrito_periodo is
    'Indicadores por distrito de los casos REPORTADOS entre p_desde y p_hasta '
    '(nulos = sin límite), más superficie medida sobre la geometría oficial, '
    'población del perfil y las 3 categorías con más casos abiertos. '
    'Respeta la RLS de casos.';

revoke all on function public.kpis_distrito_periodo(date, date) from public;
grant execute on function public.kpis_distrito_periodo(date, date) to authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) Superficie medida frente a la que estaba escrita a mano.
--    Esperado ≈ 217 km² en total, con Panchimalco cerca de 97,8.
-- select distrito_nombre, area_km2, poblacion,
--        round(poblacion / nullif(area_km2, 0), 0) as hab_km2
--   from public.kpis_distrito_periodo()
--  order by area_km2 desc;

-- 2) Los cinco distritos deben salir SIEMPRE, con ceros si no hay casos.
-- select distrito_nombre, total, dias_mas_antiguo, categorias_top
--   from public.kpis_distrito_periodo('2020-01-01','2020-01-02');

-- 3) Sin período debe coincidir con la vista del Mapa en Vivo.
-- select k.distrito_nombre, k.total as rpc, v.total as vista
--   from public.kpis_distrito_periodo() k
--   join public.v_kpis_distrito v on v.distrito_id = k.distrito_id
--  where k.total <> v.total;
--    → 0 filas

-- 4) Perfiles cargados y su procedencia.
-- select d.nombre, pf.poblacion, pf.fuente, pf.actualizado_en
--   from public.distritos d
--   left join public.distritos_perfil pf on pf.distrito_id = d.id
--  order by d.nombre;
