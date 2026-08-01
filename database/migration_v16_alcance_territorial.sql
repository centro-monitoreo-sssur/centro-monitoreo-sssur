-- ============================================================================
-- MIGRACIÓN v16 — Alcance de datos territorial y organizacional
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- QUÉ RESUELVE
--   El municipio se organiza en 5 distritos (Panchimalco, Rosario de Mora,
--   San Marcos, Santiago Texacuangos, Santo Tomás), cada uno con una Jefatura
--   de Distrito que debe supervisar TODO lo que ocurre en su territorio, sin
--   importar qué departamento atienda cada caso.
--
--   Hasta v15 no existía ese rol y el alcance solo se acotaba por departamento.
--   `auth_distrito_id()` estaba definida en schema.sql desde el principio pero
--   ninguna política la usaba.
--
-- LA DECISIÓN DE DISEÑO
--   `roles_permisos` responde "¿qué módulo y qué verbo?".
--   `rol_alcance_datos` responde "¿sobre qué filas?".
--   Son preguntas ortogonales. Mezclarlas en una sola tabla es lo que hacía
--   inextensible el modelo anterior: para dar visión distrital había que
--   inventar módulos falsos tipo 'casos_de_mi_distrito'.
--
-- COMPATIBILIDAD CON v14
--   La semilla de `rol_alcance_datos` reproduce exactamente el comportamiento
--   de v14. Con alcance_territorial = 'municipio' la cláusula territorial
--   devuelve los 5 distritos y queda neutralizada, así que `jefe_area` y
--   `empleado` ven lo mismo que antes de esta migración. v14 pasa a ser un
--   caso particular de v16.
--
-- RENDIMIENTO — POR QUÉ ARRAYS Y NO BOOLEANOS
--   v14 usa `auth_caso_en_mi_ambito(departamento_actual_id, categoria_id, ...)`,
--   que recibe columnas de la fila. Eso la vuelve una subconsulta CORRELACIONADA:
--   PostgreSQL la ejecuta una vez por fila evaluada, y cada ejecución dispara a
--   su vez 2-3 subconsultas más.
--
--   Aquí las funciones no reciben nada de la fila y devuelven un array. La
--   política queda como `distrito_id = any ((select auth_distritos_visibles())::smallint[])`.
--   Al no haber correlación, el planificador lo compila como InitPlan y lo
--   evalúa UNA SOLA VEZ por consulta. Además `= any(array)` se compila a
--   ScalarArrayOpExpr, que sí puede usar un índice B-tree — cosa imposible con
--   una función booleana opaca.
--
-- ⚠ EFECTO INMEDIATO
--   Un usuario con rol `jefe_distrito` y `usuarios.distrito_id` en NULL no verá
--   ningún caso. Es el comportamiento seguro (igual que v14 con departamento_id),
--   pero hay que asignar distrito antes de que pueda trabajar. El bloque final
--   de verificación los lista.
--
-- REQUIERE: v6, v10, v11, v12, v13, v14, v15. IDEMPOTENTE.
-- ============================================================================

begin;

-- ============================================================================
-- 1. ROL DE JEFATURA DE DISTRITO
-- ============================================================================

insert into public.roles (codigo, nombre, descripcion, es_sistema, activo) values
    ('jefe_distrito', 'Jefatura de Distrito',
     'Coordina y supervisa la operación de todos los departamentos dentro de su distrito',
     true, true)
on conflict (codigo) do update
    set nombre      = excluded.nombre,
        descripcion = excluded.descripcion,
        es_sistema  = excluded.es_sistema,
        activo      = true;

-- Matriz CRUD. Puede gestionar casos e intervenciones de su territorio, pero
-- no borra (la baja lógica de un caso es competencia de administración) ni
-- toca configuración ni el padrón de población.
insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, v.ver, v.crear, v.editar, v.borrar, v.exportar
from (values
    -- rol,             módulo,           ver,   crear, editar, borrar, exportar
    ('jefe_distrito', 'dashboard',      true,  false, false, false, true ),
    ('jefe_distrito', 'mapa',           true,  false, false, false, false),
    ('jefe_distrito', 'casos',          true,  true,  true,  false, true ),
    ('jefe_distrito', 'intervenciones', true,  true,  true,  false, true ),
    ('jefe_distrito', 'reportes',       true,  false, false, false, true ),
    ('jefe_distrito', 'cuadrillas',     true,  false, true,  false, false),
    ('jefe_distrito', 'poblacion',      false, false, false, false, false),
    ('jefe_distrito', 'usuarios',       true,  false, false, false, false),
    ('jefe_distrito', 'config',         false, false, false, false, false)
) as v(cod_rol, cod_modulo, ver, crear, editar, borrar, exportar)
join public.roles            r  on r.codigo         = v.cod_rol
join public.permisos_modulos pm on pm.codigo_modulo = v.cod_modulo
on conflict (rol_id, permiso_modulo_id) do update
    set ver      = excluded.ver,
        crear    = excluded.crear,
        editar   = excluded.editar,
        borrar   = excluded.borrar,
        exportar = excluded.exportar;

-- ============================================================================
-- 2. ALCANCE DE DATOS POR ROL
-- ============================================================================

create table if not exists public.rol_alcance_datos (
    rol_id                  bigint primary key references public.roles(id) on delete cascade,

    -- Eje territorial: qué distritos alcanza
    alcance_territorial     text not null default 'municipio'
        check (alcance_territorial in ('municipio','distrito_propio','distritos_asignados','ninguno')),

    -- Eje organizacional: qué parte del organigrama alcanza
    alcance_organizacional  text not null default 'municipio'
        check (alcance_organizacional in ('municipio','direccion_propia','departamento_propio','solo_asignados','ninguno')),

    -- 'and' = intersección (el caso debe cumplir ambos ejes)
    -- 'or'  = unión (basta con cumplir uno)
    combinador              text not null default 'and'
        check (combinador in ('and','or')),

    -- Extiende el eje organizacional con la competencia declarada en
    -- departamento_categorias (v6): cubre a los departamentos de apoyo que
    -- intervienen sobre una categoría sin ser su responsable principal.
    incluye_competencia_categoria boolean not null default true,

    -- Salvoconducto: ver siempre lo asignado a mí o a mi cuadrilla, aunque
    -- caiga fuera del ámbito. Sin esto un empleado prestado a otro distrito
    -- perdería de vista su propia tarea.
    incluye_asignados_a_mi  boolean not null default true,

    notas                   text,
    updated_at              timestamptz not null default now()
);

comment on table public.rol_alcance_datos is
    'Qué FILAS puede ver cada rol. Complementa roles_permisos, que define qué '
    'MÓDULOS y qué verbos CRUD. Las dos preguntas son ortogonales.';

comment on column public.rol_alcance_datos.combinador is
    'and = el caso debe estar en mi territorio Y en mi ámbito organizacional. '
    'or = basta con uno de los dos. La jefatura de distrito usa territorial='
    'distrito_propio con organizacional=municipio, así que ve todo lo de su '
    'territorio sin importar el departamento que lo atienda.';

-- Semilla. Reproduce el comportamiento de v14 y añade el rol nuevo.
insert into public.rol_alcance_datos
    (rol_id, alcance_territorial, alcance_organizacional, combinador,
     incluye_competencia_categoria, incluye_asignados_a_mi, notas)
select r.id, v.territorial, v.organizacional, v.combinador,
       v.competencia, v.asignados, v.notas
from (values
    -- rol,             territorial,        organizacional,        comb,  compet, asign, notas
    ('superadmin',    'municipio',       'municipio',           'and', false, true,  'Visión total del municipio'),
    ('admin',         'municipio',       'municipio',           'and', false, true,  'Visión total del municipio'),
    ('alcalde',       'municipio',       'municipio',           'and', false, true,  'Visión total, solo lectura'),
    ('directivo',     'municipio',       'municipio',           'and', false, true,  'Visión total, solo lectura'),
    ('jefe_distrito', 'distrito_propio', 'municipio',           'and', false, true,  'Todo lo que ocurre en su distrito, sea del departamento que sea'),
    ('jefe_area',     'municipio',       'departamento_propio', 'and', true,  true,  'Su departamento a través de los 5 distritos (equivale a v14)'),
    ('empleado',      'municipio',       'solo_asignados',      'and', true,  true,  'Solo su trabajo asignado (equivale a v14)')
) as v(cod_rol, territorial, organizacional, combinador, competencia, asignados, notas)
join public.roles r on r.codigo = v.cod_rol
on conflict (rol_id) do update
    set alcance_territorial           = excluded.alcance_territorial,
        alcance_organizacional        = excluded.alcance_organizacional,
        combinador                    = excluded.combinador,
        incluye_competencia_categoria = excluded.incluye_competencia_categoria,
        incluye_asignados_a_mi        = excluded.incluye_asignados_a_mi,
        notas                         = excluded.notas,
        updated_at                    = now();

-- ============================================================================
-- 3. EXCEPCIONES POR USUARIO
-- ============================================================================
-- Casos reales: la jefatura de Santo Tomás cubre Panchimalco durante una
-- incapacidad; un jefe de área queda excluido de un departamento sensible.

create table if not exists public.usuario_ambitos (
    id              bigint generated always as identity primary key,
    usuario_id      uuid not null references public.usuarios(id) on delete cascade,

    tipo            text not null check (tipo in ('distrito','departamento','direccion')),
    distrito_id     smallint references public.distritos(id) on delete cascade,
    departamento_id bigint   references public.departamentos(id) on delete cascade,
    direccion_id    bigint   references public.direcciones_administrativas(id) on delete cascade,

    -- 'denegar' siempre gana sobre 'conceder'
    modo            text not null default 'conceder' check (modo in ('conceder','denegar')),

    vigente_desde   timestamptz not null default now(),
    vigente_hasta   timestamptz,                 -- NULL = permanente
    motivo          text not null,               -- obligatorio: esto se audita
    creado_por      uuid references public.usuarios(id),
    created_at      timestamptz not null default now(),

    constraint ck_ambito_coherente check (
        (tipo = 'distrito'     and distrito_id is not null and departamento_id is null and direccion_id is null) or
        (tipo = 'departamento' and departamento_id is not null and distrito_id is null and direccion_id is null) or
        (tipo = 'direccion'    and direccion_id is not null and distrito_id is null and departamento_id is null)
    ),
    constraint ck_ambito_vigencia check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

comment on table public.usuario_ambitos is
    'Excepciones individuales al alcance que da el rol. Permite delegaciones '
    'temporales y exclusiones puntuales sin inventar roles nuevos.';

-- Índice sin predicado de vigencia: `now()` no es IMMUTABLE y PostgreSQL
-- rechaza usarlo en un índice parcial. La vigencia se filtra en la función.
create index if not exists idx_usuario_ambitos_lookup
    on public.usuario_ambitos (usuario_id, tipo, modo);

-- ============================================================================
-- 4. FUNCIONES DE ALCANCE
-- ============================================================================
-- Todas devuelven arrays y NO reciben columnas de la fila. Ver la nota de
-- rendimiento en la cabecera.

-- ----------------------------------------------------------------------------
-- 4.1 Configuración de alcance del usuario autenticado
-- ----------------------------------------------------------------------------
create or replace function public.auth_alcance_territorial()
returns text
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    select coalesce(a.alcance_territorial, 'ninguno')
      from public.usuarios u
      left join public.rol_alcance_datos a on a.rol_id = u.rol_id
     where u.id = auth.uid() and u.activo;
$$;

create or replace function public.auth_alcance_organizacional()
returns text
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    select coalesce(a.alcance_organizacional, 'ninguno')
      from public.usuarios u
      left join public.rol_alcance_datos a on a.rol_id = u.rol_id
     where u.id = auth.uid() and u.activo;
$$;

create or replace function public.auth_alcance_combinador()
returns text
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    select coalesce(a.combinador, 'and')
      from public.usuarios u
      left join public.rol_alcance_datos a on a.rol_id = u.rol_id
     where u.id = auth.uid() and u.activo;
$$;

create or replace function public.auth_incluye_asignados_a_mi()
returns boolean
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    select coalesce(a.incluye_asignados_a_mi, true)
      from public.usuarios u
      left join public.rol_alcance_datos a on a.rol_id = u.rol_id
     where u.id = auth.uid() and u.activo;
$$;

-- ----------------------------------------------------------------------------
-- 4.2 Distritos visibles
-- ----------------------------------------------------------------------------
create or replace function public.auth_distritos_visibles()
returns smallint[]
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    with base as (
        select case public.auth_alcance_territorial()
            when 'municipio' then
                array(select d.id from public.distritos d where d.activo)
            when 'distrito_propio' then
                array(select u.distrito_id from public.usuarios u
                       where u.id = auth.uid() and u.distrito_id is not null)
            -- 'distritos_asignados' se apoya exclusivamente en usuario_ambitos
            else '{}'::smallint[]
        end as ids
    ),
    concedidos as (
        select coalesce(array_agg(ua.distrito_id), '{}'::smallint[]) as ids
          from public.usuario_ambitos ua
         where ua.usuario_id = auth.uid()
           and ua.tipo = 'distrito'
           and ua.modo = 'conceder'
           and ua.vigente_desde <= now()
           and (ua.vigente_hasta is null or ua.vigente_hasta > now())
    ),
    denegados as (
        select coalesce(array_agg(ua.distrito_id), '{}'::smallint[]) as ids
          from public.usuario_ambitos ua
         where ua.usuario_id = auth.uid()
           and ua.tipo = 'distrito'
           and ua.modo = 'denegar'
           and ua.vigente_desde <= now()
           and (ua.vigente_hasta is null or ua.vigente_hasta > now())
    )
    select coalesce(array(
        select x from unnest((select ids from base) || (select ids from concedidos)) as x
        where x is not null
          and x <> all ((select ids from denegados)::smallint[])
    ), '{}'::smallint[]);
$$;

comment on function public.auth_distritos_visibles() is
    'Distritos que alcanza el usuario autenticado, ya resueltas las excepciones '
    'de usuario_ambitos. Devuelve array para que las políticas lo usen como '
    'InitPlan (una evaluación por consulta, no por fila).';

-- ----------------------------------------------------------------------------
-- 4.3 Departamentos visibles
-- ----------------------------------------------------------------------------
create or replace function public.auth_departamentos_visibles()
returns bigint[]
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    with base as (
        select case public.auth_alcance_organizacional()
            when 'municipio' then
                array(select d.id from public.departamentos d where d.estado = 'activo')
            when 'direccion_propia' then
                array(select d2.id
                        from public.departamentos d2
                       where d2.direccion_id = (
                            select d3.direccion_id
                              from public.usuarios u
                              join public.departamentos d3 on d3.id = u.departamento_id
                             where u.id = auth.uid()))
            when 'departamento_propio' then
                array(select u.departamento_id from public.usuarios u
                       where u.id = auth.uid() and u.departamento_id is not null)
            -- 'solo_asignados' no alcanza departamentos: el empleado ve su
            -- propio trabajo por la vía de incluye_asignados_a_mi.
            else '{}'::bigint[]
        end as ids
    ),
    concedidos as (
        select coalesce(array_agg(ua.departamento_id), '{}'::bigint[]) as ids
          from public.usuario_ambitos ua
         where ua.usuario_id = auth.uid()
           and ua.tipo = 'departamento'
           and ua.modo = 'conceder'
           and ua.vigente_desde <= now()
           and (ua.vigente_hasta is null or ua.vigente_hasta > now())
    ),
    por_direccion as (
        select coalesce(array_agg(d.id), '{}'::bigint[]) as ids
          from public.usuario_ambitos ua
          join public.departamentos d on d.direccion_id = ua.direccion_id
         where ua.usuario_id = auth.uid()
           and ua.tipo = 'direccion'
           and ua.modo = 'conceder'
           and ua.vigente_desde <= now()
           and (ua.vigente_hasta is null or ua.vigente_hasta > now())
    ),
    denegados as (
        select coalesce(array_agg(ua.departamento_id), '{}'::bigint[]) as ids
          from public.usuario_ambitos ua
         where ua.usuario_id = auth.uid()
           and ua.tipo = 'departamento'
           and ua.modo = 'denegar'
           and ua.vigente_desde <= now()
           and (ua.vigente_hasta is null or ua.vigente_hasta > now())
    )
    select coalesce(array(
        select x from unnest(
            (select ids from base)
            || (select ids from concedidos)
            || (select ids from por_direccion)) as x
        where x is not null
          and x <> all ((select ids from denegados)::bigint[])
    ), '{}'::bigint[]);
$$;

-- ----------------------------------------------------------------------------
-- 4.4 Categorías sobre las que mi departamento tiene competencia declarada
-- ----------------------------------------------------------------------------
create or replace function public.auth_categorias_visibles()
returns bigint[]
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    select case
        when not coalesce((
            select a.incluye_competencia_categoria
              from public.usuarios u
              join public.rol_alcance_datos a on a.rol_id = u.rol_id
             where u.id = auth.uid() and u.activo
        ), false) then '{}'::bigint[]
        else coalesce((
            select array_agg(distinct dc.categoria_id)
              from public.departamento_categorias dc
             where dc.activo
               and dc.departamento_id = any (public.auth_departamentos_visibles())
        ), '{}'::bigint[])
    end;
$$;

-- ----------------------------------------------------------------------------
-- 4.5 Cuadrillas del usuario
-- ----------------------------------------------------------------------------
create or replace function public.auth_cuadrillas_del_usuario()
returns bigint[]
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    select coalesce(array_agg(ci.cuadrilla_id), '{}'::bigint[])
      from public.cuadrilla_integrantes ci
     where ci.usuario_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 4.6 RPC para el frontend: qué alcance tengo
--     La UI la usa solo para NO ofrecer controles inútiles (p. ej. ocultar el
--     selector de distrito a quien solo tiene uno). La verdad la impone la RLS,
--     nunca al revés.
-- ----------------------------------------------------------------------------
create or replace function public.mi_alcance()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
    select jsonb_build_object(
        'rol',                    (select r.codigo from public.usuarios u
                                     join public.roles r on r.id = u.rol_id
                                    where u.id = auth.uid()),
        'distrito_id',            (select u.distrito_id from public.usuarios u where u.id = auth.uid()),
        'departamento_id',        (select u.departamento_id from public.usuarios u where u.id = auth.uid()),
        'alcance_territorial',    public.auth_alcance_territorial(),
        'alcance_organizacional', public.auth_alcance_organizacional(),
        'combinador',             public.auth_alcance_combinador(),
        've_todo_el_municipio',   public.auth_ve_todo_el_municipio(),
        'distritos_visibles',     to_jsonb(public.auth_distritos_visibles()),
        'departamentos_visibles', to_jsonb(public.auth_departamentos_visibles())
    );
$$;

grant execute on function public.mi_alcance() to authenticated;

-- ============================================================================
-- 5. POLÍTICAS DE CASOS
-- ============================================================================
-- Nota sobre coalesce: auth_tiene_permiso() agrega con bool_or, que sobre cero
-- filas devuelve NULL, no false. Una política que evalúa a NULL deniega, así
-- que hoy funciona por accidente; al componerla con más ramas deja de ser
-- predecible. Se fuerza a false explícitamente.

drop policy if exists "casos_select" on public.casos;
create policy "casos_select"
    on public.casos for select to authenticated
    using (
        (select public.auth_ve_todo_el_municipio())
        or (
            coalesce((select public.auth_tiene_permiso('casos', 'ver')), false)
            and (
                -- Salvoconducto: lo mío siempre es mío
                (
                    (select public.auth_incluye_asignados_a_mi())
                    and (
                        usuario_responsable_id = (select auth.uid())
                        or cuadrilla_responsable_id = any ((select public.auth_cuadrillas_del_usuario())::bigint[])
                    )
                )
                or case (select public.auth_alcance_combinador())
                    when 'and' then
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        and (
                            departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                            or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                        )
                    else
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        or departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                        or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                end
            )
        )
    );

drop policy if exists "casos_update" on public.casos;
create policy "casos_update"
    on public.casos for update to authenticated
    using (
        (select public.auth_ve_todo_el_municipio())
        or (
            coalesce((select public.auth_tiene_permiso('casos', 'editar')), false)
            and (
                (
                    (select public.auth_incluye_asignados_a_mi())
                    and (
                        usuario_responsable_id = (select auth.uid())
                        or cuadrilla_responsable_id = any ((select public.auth_cuadrillas_del_usuario())::bigint[])
                    )
                )
                or case (select public.auth_alcance_combinador())
                    when 'and' then
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        and (
                            departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                            or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                        )
                    else
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        or departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                        or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                end
            )
        )
    )
    with check (
        (select public.auth_ve_todo_el_municipio())
        or (
            coalesce((select public.auth_tiene_permiso('casos', 'editar')), false)
            and (
                (
                    (select public.auth_incluye_asignados_a_mi())
                    and (
                        usuario_responsable_id = (select auth.uid())
                        or cuadrilla_responsable_id = any ((select public.auth_cuadrillas_del_usuario())::bigint[])
                    )
                )
                or case (select public.auth_alcance_combinador())
                    when 'and' then
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        and (
                            departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                            or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                        )
                    else
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        or departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                        or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                end
            )
        )
    );

-- Las políticas de casos_adjuntos, historial_estados_caso y casos_derivaciones
-- creadas en v14 NO se tocan: preguntan `exists (select 1 from casos c where
-- c.id = caso_id)`, así que PostgreSQL les aplica la RLS de casos por dentro y
-- heredan este alcance nuevo sin duplicar la lógica.

-- `auth_caso_en_mi_ambito()` queda viva pero sin uso en public.casos. No se
-- elimina por si alguna política fuera del alcance de esta migración la llama.
comment on function public.auth_caso_en_mi_ambito(bigint, bigint, uuid, bigint) is
    'OBSOLETA desde v16. Sustituida por la composición de auth_distritos_visibles() '
    'y auth_departamentos_visibles(), que no se correlacionan con la fila y por '
    'tanto se evalúan una vez por consulta en lugar de una vez por caso.';

-- ============================================================================
-- 6. RLS DE LAS TABLAS DE CONFIGURACIÓN
-- ============================================================================
-- Lectura abierta a `authenticated`: el frontend necesita saber su propio
-- alcance para pintar la UI. Escritura solo superadmin.

alter table public.rol_alcance_datos enable row level security;
alter table public.usuario_ambitos   enable row level security;

drop policy if exists "rol_alcance_select" on public.rol_alcance_datos;
create policy "rol_alcance_select"
    on public.rol_alcance_datos for select to authenticated
    using (true);

drop policy if exists "rol_alcance_write" on public.rol_alcance_datos;
create policy "rol_alcance_write"
    on public.rol_alcance_datos for all to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

-- Cada quien ve sus propias excepciones; el superadmin ve todas.
drop policy if exists "usuario_ambitos_select" on public.usuario_ambitos;
create policy "usuario_ambitos_select"
    on public.usuario_ambitos for select to authenticated
    using (usuario_id = (select auth.uid()) or public.auth_tiene_rol('superadmin'));

drop policy if exists "usuario_ambitos_write" on public.usuario_ambitos;
create policy "usuario_ambitos_write"
    on public.usuario_ambitos for all to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

-- ============================================================================
-- 7. ÍNDICES DE APOYO
-- ============================================================================
-- `= any(array)` se compila a ScalarArrayOpExpr y sí aprovecha un B-tree.

create index if not exists idx_casos_distrito_estado
    on public.casos (distrito_id, estado_codigo) where deleted_at is null;

create index if not exists idx_casos_distrito_id_desc
    on public.casos (distrito_id, id desc) where deleted_at is null;

create index if not exists idx_casos_depto_distrito
    on public.casos (departamento_actual_id, distrito_id) where deleted_at is null;

-- ============================================================================
-- 8. VISTA DE KPIs POR DISTRITO
-- ============================================================================
-- El umbral de vencimiento NO es un literal: sale de
-- prioridades.tiempo_objetivo_horas, que v11 ya siembra (4 h crítica, 24 h alta,
-- 72 h media, 168 h baja, sin objetivo para informativa).

drop view if exists public.v_kpis_distrito;
create view public.v_kpis_distrito as
select
    d.id                     as distrito_id,
    d.codigo                 as distrito_codigo,
    d.nombre                 as distrito_nombre,
    count(c.id)                                                          as total,
    count(c.id) filter (where c.estado_codigo = 'pendiente')             as pendientes,
    count(c.id) filter (where c.estado_codigo in ('en_revision','en_obra')) as en_curso,
    count(c.id) filter (where c.estado_codigo = 'resuelta')              as resueltas,
    count(c.id) filter (where c.estado_codigo = 'rechazada')             as rechazadas,
    -- Fuera de objetivo: abierto y ya superó el tiempo de su prioridad
    count(c.id) filter (
        where c.estado_codigo not in ('resuelta','rechazada')
          and p.tiempo_objetivo_horas is not null
          and c.created_at < now() - make_interval(hours => p.tiempo_objetivo_horas)
    )                                                                    as fuera_de_objetivo,
    count(c.id) filter (where c.prioridad_id = 1
                          and c.estado_codigo not in ('resuelta','rechazada')) as criticas_abiertas,
    -- Los paréntesis alrededor del agregado no son decorativos: sin ellos el
    -- `::numeric` queda pegado al cierre del FILTER y el intérprete puede
    -- leerlo como un cast de la condición. Además el cast es obligatorio:
    -- `round(x, n)` solo existe para numeric, no para double precision, y
    -- `extract(epoch ...)` devuelve uno u otro según la versión de PostgreSQL.
    round(
        (avg(extract(epoch from (c.fecha_cierre - c.created_at)) / 3600.0)
         filter (where c.fecha_cierre is not null))::numeric
    , 1)                                                                 as horas_promedio_cierre,
    max(c.created_at)                                                    as ultimo_caso_en
from public.distritos d
left join public.casos c
       on c.distrito_id = d.id
      and c.deleted_at is null
left join public.prioridades p on p.id = c.prioridad_id
where d.activo
group by d.id, d.codigo, d.nombre;

alter view public.v_kpis_distrito set (security_invoker = on);

grant select on public.v_kpis_distrito to authenticated;

comment on view public.v_kpis_distrito is
    'Tablero comparativo por distrito. Con security_invoker el left join a casos '
    'aplica la RLS de quien consulta: la jefatura de un distrito obtiene ceros en '
    'los otros cuatro. El frontend debe ocultar los distritos ajenos usando '
    'mi_alcance() en lugar de mostrar un cero engañoso.';

commit;

-- ============================================================================
-- VERIFICACIÓN — ejecutar después de aplicar
-- ============================================================================

-- 1. Usuarios que quedarían ciegos por falta de distrito o departamento.
do $$
declare
    v_sin_distrito     text;
    v_sin_departamento text;
begin
    select string_agg(u.username || ' <' || coalesce(u.email_institucional, 's/correo') || '>', ', ')
      into v_sin_distrito
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
      join public.rol_alcance_datos a on a.rol_id = r.id
     where u.activo and a.alcance_territorial = 'distrito_propio'
       and u.distrito_id is null;

    select string_agg(u.username || ' <' || coalesce(u.email_institucional, 's/correo') || '>', ', ')
      into v_sin_departamento
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
      join public.rol_alcance_datos a on a.rol_id = r.id
     where u.activo and a.alcance_organizacional in ('departamento_propio','direccion_propia')
       and u.departamento_id is null;

    if v_sin_distrito is not null then
        raise warning 'Usuarios con alcance distrital y SIN distrito_id (no verán ningún caso): %', v_sin_distrito;
    end if;
    if v_sin_departamento is not null then
        raise warning 'Usuarios con alcance departamental y SIN departamento_id (no verán ningún caso): %', v_sin_departamento;
    end if;
    if v_sin_distrito is null and v_sin_departamento is null then
        raise notice 'OK: todos los usuarios con alcance acotado tienen su ámbito asignado.';
    end if;
end $$;

-- 2. Configuración de alcance resultante.
-- select r.codigo, r.nombre, a.alcance_territorial, a.alcance_organizacional,
--        a.combinador, a.incluye_asignados_a_mi
--   from public.rol_alcance_datos a
--   join public.roles r on r.id = a.rol_id
--  where r.activo
--  order by r.id;

-- 3. Alcance del usuario que ejecuta (probar con cada rol).
-- select public.mi_alcance();

-- 4. No regresión: un jefe_area debe seguir viendo lo mismo que antes de v16.
--    Ejecutar con su sesión, antes y después.
-- select count(*) from public.casos;

-- 5. Comparativo territorial.
-- select * from public.v_kpis_distrito order by distrito_nombre;
