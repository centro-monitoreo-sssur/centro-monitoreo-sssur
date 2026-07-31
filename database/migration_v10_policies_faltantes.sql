-- ============================================================================
-- MIGRACIÓN v10 — Políticas RLS faltantes
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- database/schema.sql enciende Row Level Security en `cuadrillas`,
-- `cuadrilla_integrantes` y `ciudadanos` (líneas 802-804) pero ninguna de sus
-- 36 políticas las cubre. RLS activo sin políticas deniega TODO: ni un
-- superadmin autenticado puede leerlas.
--
-- Consecuencia en producción:
--   · `ciudadanos`            → el registro del portal ciudadano falla en silencio
--   · `cuadrillas`            → el módulo de empleados y la capa de intervenciones
--                               del mapa no pueden resolver a qué cuadrilla
--                               pertenece un caso
--   · `cuadrilla_integrantes` → no se puede armar ni consultar una cuadrilla
--
-- Este hueco existe desde el despliegue inicial; NO lo provocó el botón
-- "Run and enable RLS" del editor de Supabase.
--
-- CRITERIO
--   Cuadrillas es estructura organizativa: cualquier usuario institucional
--   autenticado puede consultarla, igual que el resto de catálogos.
--   Ciudadanos es dato personal (DUI, teléfono, distrito): se aplica acceso
--   propio + personal autorizado, nunca lectura abierta a todo autenticado.
--
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. cuadrillas — catálogo operativo
-- ----------------------------------------------------------------------------
drop policy if exists "cuadrillas_select_autenticado" on public.cuadrillas;
create policy "cuadrillas_select_autenticado"
    on public.cuadrillas for select to authenticated
    using (true);

drop policy if exists "cuadrillas_write_gestion" on public.cuadrillas;
create policy "cuadrillas_write_gestion"
    on public.cuadrillas for all to authenticated
    using (
        public.auth_tiene_permiso('cuadrillas', 'editar')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    )
    with check (
        public.auth_tiene_permiso('cuadrillas', 'editar')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    );

-- ----------------------------------------------------------------------------
-- 2. cuadrilla_integrantes — composición de las cuadrillas
-- ----------------------------------------------------------------------------
drop policy if exists "cuadrilla_integrantes_select_autenticado" on public.cuadrilla_integrantes;
create policy "cuadrilla_integrantes_select_autenticado"
    on public.cuadrilla_integrantes for select to authenticated
    using (true);

drop policy if exists "cuadrilla_integrantes_write_gestion" on public.cuadrilla_integrantes;
create policy "cuadrilla_integrantes_write_gestion"
    on public.cuadrilla_integrantes for all to authenticated
    using (
        public.auth_tiene_permiso('cuadrillas', 'editar')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    )
    with check (
        public.auth_tiene_permiso('cuadrillas', 'editar')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    );

-- ----------------------------------------------------------------------------
-- 3. ciudadanos — dato personal, acceso restringido
--    `ciudadanos.id` referencia auth.users(id), así que `id = auth.uid()`
--    identifica al propio titular sin necesidad de columnas extra.
-- ----------------------------------------------------------------------------
drop policy if exists "ciudadanos_select_propio_o_autorizado" on public.ciudadanos;
create policy "ciudadanos_select_propio_o_autorizado"
    on public.ciudadanos for select to authenticated
    using (
        id = auth.uid()
        or public.auth_tiene_permiso('poblacion', 'ver')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    );

-- Alta: el propio ciudadano al registrarse, o personal autorizado en un
-- registro presencial.
drop policy if exists "ciudadanos_insert_propio_o_autorizado" on public.ciudadanos;
create policy "ciudadanos_insert_propio_o_autorizado"
    on public.ciudadanos for insert to authenticated
    with check (
        id = auth.uid()
        or public.auth_tiene_permiso('poblacion', 'crear')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    );

drop policy if exists "ciudadanos_update_propio_o_autorizado" on public.ciudadanos;
create policy "ciudadanos_update_propio_o_autorizado"
    on public.ciudadanos for update to authenticated
    using (
        id = auth.uid()
        or public.auth_tiene_permiso('poblacion', 'editar')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    )
    with check (
        id = auth.uid()
        or public.auth_tiene_permiso('poblacion', 'editar')
        or public.auth_tiene_rol('admin')
        or public.auth_tiene_rol('superadmin')
    );

-- Baja: nunca el propio titular. Un ciudadano se desactiva (activo = false),
-- no se borra: sus casos históricos lo referencian.
drop policy if exists "ciudadanos_delete_admin" on public.ciudadanos;
create policy "ciudadanos_delete_admin"
    on public.ciudadanos for delete to authenticated
    using (public.auth_tiene_rol('superadmin'));

commit;

-- ============================================================================
-- VERIFICACIÓN — debe devolver 0 filas
-- ============================================================================
-- select n.nspname as esquema, c.relname as tabla
-- from   pg_class c
-- join   pg_namespace n on n.oid = c.relnamespace
-- where  n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
--   and  not exists (select 1 from pg_policy p where p.polrelid = c.oid)
-- order  by 2;
