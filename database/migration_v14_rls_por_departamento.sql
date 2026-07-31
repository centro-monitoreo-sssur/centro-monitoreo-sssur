-- ============================================================================
-- MIGRACIÓN v14 — Alcance de casos por departamento
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Hasta ahora `casos_select` era plano: cualquier rol con permiso de ver casos
-- veía TODOS los del municipio. Una jefatura debe ver únicamente lo que le
-- corresponde a su departamento.
--
-- QUIÉN VE QUÉ
--   superadmin, admin, alcalde, directivo   → todo el municipio
--   jefe_area, empleado                     → solo su ámbito, entendido como:
--       · el caso está actualmente en su departamento, o
--       · su departamento tiene declarada competencia sobre la categoría del
--         caso en departamento_categorias (migration_v6), lo que cubre a los
--         departamentos de apoyo que intervienen sin ser responsables, o
--       · el usuario es el responsable asignado, o
--       · el caso está asignado a una cuadrilla a la que pertenece.
--
-- POR QUÉ TAMBIÉN LAS TABLAS DERIVADAS
--   `casos_adjuntos`, `historial_estados_caso` y `casos_derivaciones` tenían
--   políticas planas con `auth_tiene_permiso('casos','ver')`. Sin tocarlas, una
--   jefatura no vería un caso ajeno pero sí sus fotos, su historial y sus
--   derivaciones — una fuga por la puerta de atrás. Aquí se redefinen en
--   términos de "¿puedo ver el caso padre?": PostgreSQL aplica la RLS de
--   `public.casos` dentro del EXISTS, así que el alcance se hereda solo y no
--   hay que duplicar la lógica.
--
-- ⚠ EFECTO INMEDIATO
--   Un usuario con rol acotado y `usuarios.departamento_id` en NULL no verá
--   ningún caso. Es el comportamiento seguro, pero significa que hay que
--   asignarle departamento a cada jefatura y empleado antes de que puedan
--   trabajar. Los perfiles de visión municipal no se ven afectados.
--
-- REQUIERE: migration_v6, v10, v11, v12, v13. IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Departamento del usuario autenticado
--    Complementa a auth_distrito_id(), que schema.sql define pero no usa.
-- ----------------------------------------------------------------------------
create or replace function public.auth_departamento_id()
returns bigint
language sql
security definer
stable
set search_path = public
as $$
    select departamento_id from public.usuarios
     where id = auth.uid() and activo;
$$;

comment on function public.auth_departamento_id() is
    'Departamento del usuario autenticado. NULL si no tiene asignado, lo que '
    'en las políticas se traduce en no ver ningún caso acotado.';

-- ----------------------------------------------------------------------------
-- 2. ¿El rol actual tiene visión municipal completa?
--    Se aísla en una función para no repetir la lista en cada política y para
--    que sumar un rol directivo mañana sea un solo cambio.
-- ----------------------------------------------------------------------------
create or replace function public.auth_ve_todo_el_municipio()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select public.auth_tiene_rol('superadmin')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('alcalde')
        or public.auth_tiene_rol('directivo');
$$;

-- ----------------------------------------------------------------------------
-- 3. ¿El caso cae dentro del ámbito del usuario?
-- ----------------------------------------------------------------------------
create or replace function public.auth_caso_en_mi_ambito(
    p_departamento_actual_id bigint,
    p_categoria_id           bigint,
    p_usuario_responsable_id uuid,
    p_cuadrilla_id           bigint
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select
        -- Responsable directo: siempre ve su propio trabajo.
        p_usuario_responsable_id = auth.uid()
        -- Asignado a una cuadrilla a la que pertenezco.
        or exists (
            select 1 from public.cuadrilla_integrantes ci
             where ci.usuario_id   = auth.uid()
               and ci.cuadrilla_id = p_cuadrilla_id
        )
        -- El caso está hoy en mi departamento.
        or (public.auth_departamento_id() is not null
            and p_departamento_actual_id = public.auth_departamento_id())
        -- Mi departamento tiene competencia declarada sobre esa categoría.
        or (public.auth_departamento_id() is not null and exists (
            select 1 from public.departamento_categorias dc
             where dc.categoria_id    = p_categoria_id
               and dc.departamento_id = public.auth_departamento_id()
               and dc.activo
        ));
$$;

comment on function public.auth_caso_en_mi_ambito(bigint, bigint, uuid, bigint) is
    'Regla de alcance para roles acotados (jefe_area, empleado). Se recibe por '
    'parámetros en lugar de leer public.casos para evitar recursión de RLS.';

-- ----------------------------------------------------------------------------
-- 4. Políticas sobre casos
-- ----------------------------------------------------------------------------
drop policy if exists "casos_select" on public.casos;
create policy "casos_select"
    on public.casos for select to authenticated
    using (
        public.auth_ve_todo_el_municipio()
        or (
            public.auth_tiene_permiso('casos', 'ver')
            and public.auth_caso_en_mi_ambito(
                    departamento_actual_id, categoria_id,
                    usuario_responsable_id, cuadrilla_responsable_id)
        )
    );

drop policy if exists "casos_update" on public.casos;
create policy "casos_update"
    on public.casos for update to authenticated
    using (
        public.auth_ve_todo_el_municipio()
        or (
            public.auth_tiene_permiso('casos', 'editar')
            and public.auth_caso_en_mi_ambito(
                    departamento_actual_id, categoria_id,
                    usuario_responsable_id, cuadrilla_responsable_id)
        )
    )
    with check (
        public.auth_ve_todo_el_municipio()
        or (
            public.auth_tiene_permiso('casos', 'editar')
            and public.auth_caso_en_mi_ambito(
                    departamento_actual_id, categoria_id,
                    usuario_responsable_id, cuadrilla_responsable_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 5. Tablas derivadas: heredan el alcance del caso padre
--    El EXISTS sobre public.casos se evalúa con la RLS de esa tabla aplicada,
--    así que basta con preguntar si el caso es visible.
-- ----------------------------------------------------------------------------
drop policy if exists "casos_adjuntos_select" on public.casos_adjuntos;
create policy "casos_adjuntos_select"
    on public.casos_adjuntos for select to authenticated
    using (exists (select 1 from public.casos c where c.id = caso_id));

drop policy if exists "casos_adjuntos_write" on public.casos_adjuntos;
create policy "casos_adjuntos_write"
    on public.casos_adjuntos for all to authenticated
    using (
        public.auth_tiene_permiso('casos', 'editar')
        and exists (select 1 from public.casos c where c.id = caso_id)
    )
    with check (
        public.auth_tiene_permiso('casos', 'editar')
        and exists (select 1 from public.casos c where c.id = caso_id)
    );

drop policy if exists "historial_select" on public.historial_estados_caso;
create policy "historial_select"
    on public.historial_estados_caso for select to authenticated
    using (exists (select 1 from public.casos c where c.id = caso_id));

drop policy if exists "historial_write" on public.historial_estados_caso;
create policy "historial_write"
    on public.historial_estados_caso for all to authenticated
    using (
        public.auth_tiene_permiso('casos', 'editar')
        and exists (select 1 from public.casos c where c.id = caso_id)
    )
    with check (
        public.auth_tiene_permiso('casos', 'editar')
        and exists (select 1 from public.casos c where c.id = caso_id)
    );

drop policy if exists "derivaciones_select" on public.casos_derivaciones;
create policy "derivaciones_select"
    on public.casos_derivaciones for select to authenticated
    using (exists (select 1 from public.casos c where c.id = caso_id));

drop policy if exists "derivaciones_write" on public.casos_derivaciones;
create policy "derivaciones_write"
    on public.casos_derivaciones for all to authenticated
    using (
        public.auth_tiene_permiso('casos', 'editar')
        and exists (select 1 from public.casos c where c.id = caso_id)
    )
    with check (
        public.auth_tiene_permiso('casos', 'editar')
        and exists (select 1 from public.casos c where c.id = caso_id)
    );

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Usuarios con rol acotado y sin departamento: NO VERÁN NINGÚN CASO.
-- Hay que asignarles departamento antes de que puedan operar.
--   select u.username, u.email_institucional, r.codigo as rol
--     from public.usuarios u
--     join public.roles r on r.id = u.rol_id
--    where u.activo
--      and r.codigo in ('jefe_area', 'empleado')
--      and u.departamento_id is null;
--
-- Asignar departamento a una jefatura (ejemplo, Alumbrado Público):
--   update public.usuarios
--      set departamento_id = (select id from public.departamentos where codigo = '0103-08')
--    where username = 'nombre.usuario';
--
-- Simular qué vería una jefatura ANTES de crearle el acceso: cuántos casos
-- caerían en el ámbito de cada departamento según su competencia declarada.
--   select d.codigo, d.nombre, count(distinct c.id) as casos_en_ambito
--     from public.departamentos d
--     left join public.departamento_categorias dc
--            on dc.departamento_id = d.id and dc.activo
--     left join public.casos c
--            on (c.departamento_actual_id = d.id or c.categoria_id = dc.categoria_id)
--           and c.deleted_at is null
--    where d.estado = 'activo'
--    group by 1, 2 having count(distinct c.id) > 0
--    order by 3 desc;
--
-- Políticas activas sobre casos y derivadas:
--   select tablename, policyname, cmd
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('casos','casos_adjuntos','historial_estados_caso','casos_derivaciones')
--    order by 1, 3, 2;
