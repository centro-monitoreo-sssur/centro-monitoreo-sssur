-- ============================================================================
-- MIGRACIÓN v22 — Gestión de roles y permisos
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PROBLEMA
--
-- `database/schema.sql` enciende RLS en `roles`, `permisos_modulos` y
-- `roles_permisos` (líneas 798-800) pero solo crea políticas de SELECT
-- ("catalogos_select_roles", "catalogos_select_permisos_modulos",
-- "catalogos_select_roles_permisos", líneas 835-842).
--
-- RLS activo sin política para una operación la DENIEGA. Es decir: hoy
-- **nadie** —tampoco el superadmin— puede crear, modificar ni eliminar un rol,
-- ni cambiar una casilla de la matriz de permisos. La pantalla "Roles y
-- Permisos" es de solo lectura no por diseño de producto, sino porque la base
-- rechaza toda escritura.
--
-- Síntoma que llega al usuario: los botones no responden o la operación
-- "no hace nada". PostgREST devuelve 42501 o simplemente 0 filas afectadas,
-- que sin manejo explícito en el cliente es indistinguible de un éxito.
--
-- ----------------------------------------------------------------------------
-- CRITERIO DE AUTORIZACIÓN
--
-- La escritura se restringe a `superadmin`, NO a `admin`.
--
-- Razón: estas tres tablas SON el modelo de seguridad. Si `admin` pudiera
-- editarlas, le bastaría marcar sus propias casillas para concederse cualquier
-- permiso del sistema — el control de acceso dejaría de ser un control.
-- Es la misma lógica por la que en Postgres un usuario no puede darse a sí
-- mismo SUPERUSER.
--
-- Consecuencia deliberada: un `admin` sigue viendo la pantalla (SELECT), pero
-- en modo consulta. La UI se lo indica en vez de dejarle pulsar botones que
-- van a fallar.
--
-- Nota sobre bloquearse a uno mismo: las políticas de abajo dependen de
-- `auth_tiene_rol('superadmin')`, que mira `usuarios.rol_id`, NO la matriz de
-- permisos. Un superadmin que se quite todas las casillas seguirá pudiendo
-- entrar aquí y devolvérselas. Si dependieran de `auth_tiene_permiso()`, la
-- primera casilla mal desmarcada dejaría el sistema sin administración posible
-- y solo se recuperaría desde el SQL Editor de Supabase.
--
-- ----------------------------------------------------------------------------
-- PROTECCIONES DE INTEGRIDAD
--
--   1. Los roles `es_sistema` no se pueden eliminar. `superadmin`, `admin`,
--      `jefe_area` y `empleado` están citados por código en las policies de
--      `casos` y en el frontend; borrarlos rompe la autorización entera.
--   2. El `codigo` de un rol de sistema no se puede cambiar. `auth_tiene_rol()`
--      compara contra esa cadena: renombrar 'superadmin' equivale a borrarlo,
--      pero en silencio.
--   3. No se puede desactivar el rol `superadmin`.
--   4. Eliminar un rol con usuarios asignados ya lo impide la FK
--      `usuarios.rol_id` (sin ON DELETE): Postgres devuelve 23503. Es el
--      comportamiento correcto — reasignar antes de borrar es una decisión
--      administrativa, no algo que deba resolver una cascada.
--
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Guardas de integridad sobre `roles`
-- ----------------------------------------------------------------------------
create or replace function public.fn_protege_roles_sistema()
returns trigger language plpgsql as $$
begin
    if (tg_op = 'DELETE') then
        if old.es_sistema then
            raise exception
                'El rol "%" es un rol de sistema y no se puede eliminar. '
                'Si ya no se usa, desactívalo en lugar de borrarlo.', old.nombre
                using errcode = 'restrict_violation';
        end if;
        return old;
    end if;

    -- UPDATE
    if old.es_sistema and new.codigo is distinct from old.codigo then
        raise exception
            'No se puede cambiar el código del rol de sistema "%". '
            'Las políticas de seguridad de la base lo referencian por ese '
            'código; renombrarlo dejaría sin efecto sus permisos.', old.codigo
            using errcode = 'restrict_violation';
    end if;

    if old.codigo = 'superadmin' and new.activo = false then
        raise exception
            'El rol superadmin no se puede desactivar: es el único que puede '
            'administrar roles y permisos.'
            using errcode = 'restrict_violation';
    end if;

    return new;
end;
$$;

comment on function public.fn_protege_roles_sistema() is
    'Impide borrar roles de sistema, renombrar su código y desactivar superadmin.';

drop trigger if exists trg_protege_roles_sistema on public.roles;
create trigger trg_protege_roles_sistema
    before update or delete on public.roles
    for each row execute function public.fn_protege_roles_sistema();

-- ----------------------------------------------------------------------------
-- 2. Políticas de escritura — public.roles
-- ----------------------------------------------------------------------------
drop policy if exists "roles_insert_superadmin" on public.roles;
create policy "roles_insert_superadmin"
    on public.roles for insert to authenticated
    with check (public.auth_tiene_rol('superadmin'));

drop policy if exists "roles_update_superadmin" on public.roles;
create policy "roles_update_superadmin"
    on public.roles for update to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

-- El `using` excluye los roles de sistema además del trigger: la policy evita
-- el intento y el trigger da el mensaje explicativo si llega por otra vía
-- (SQL Editor, service_role, un script).
drop policy if exists "roles_delete_superadmin" on public.roles;
create policy "roles_delete_superadmin"
    on public.roles for delete to authenticated
    using (public.auth_tiene_rol('superadmin') and es_sistema = false);

-- ----------------------------------------------------------------------------
-- 3. Políticas de escritura — public.permisos_modulos
-- ----------------------------------------------------------------------------
-- Solo UPDATE: `codigo_modulo` es la clave que evalúan las policies de `casos`
-- y el menú del frontend (`gruposNav` en stores/navegacion.js). Insertar un
-- módulo que ningún código conoce crea una fila de la matriz que no gobierna
-- nada — un permiso decorativo. Alta y baja de módulos se hacen por migración,
-- junto al código que los usa.
drop policy if exists "permisos_modulos_update_superadmin" on public.permisos_modulos;
create policy "permisos_modulos_update_superadmin"
    on public.permisos_modulos for update to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

-- ----------------------------------------------------------------------------
-- 4. Políticas de escritura — public.roles_permisos (la matriz)
-- ----------------------------------------------------------------------------
-- `for all` cubre el upsert: la UI hace INSERT ... ON CONFLICT (rol_id,
-- permiso_modulo_id) DO UPDATE, y Postgres evalúa la policy de INSERT y la de
-- UPDATE en la misma sentencia.
drop policy if exists "roles_permisos_write_superadmin" on public.roles_permisos;
create policy "roles_permisos_write_superadmin"
    on public.roles_permisos for all to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

-- ----------------------------------------------------------------------------
-- 5. Verificación
-- ----------------------------------------------------------------------------
do $$
declare
    faltan text;
begin
    select string_agg(t.tabla, ', ')
      into faltan
      from (values ('roles'), ('permisos_modulos'), ('roles_permisos')) as t(tabla)
     where not exists (
        select 1 from pg_policies p
         where p.schemaname = 'public'
           and p.tablename = t.tabla
           and p.cmd <> 'SELECT'
     );

    if faltan is not null then
        raise exception 'v22 incompleta: sin políticas de escritura en %', faltan;
    end if;

    raise notice 'v22 OK — roles, permisos_modulos y roles_permisos son escribibles por superadmin.';
end;
$$;

commit;

-- ============================================================================
-- COMPROBACIÓN MANUAL (ejecutar como el usuario de la aplicación, no como
-- postgres — `postgres` tiene BYPASSRLS y siempre pasaría):
--
--   select public.auth_tiene_rol('superadmin');        -- debe dar true
--   update public.roles set descripcion = descripcion where id = 1;  -- 1 fila
--
-- Si la segunda devuelve 0 filas, el usuario conectado no es superadmin:
-- revisar `usuarios.rol_id` contra `roles.codigo = 'superadmin'`.
-- ============================================================================
