-- ============================================================================
-- MIGRACIÓN v23 — El rol `empleado` puede registrar casos desde el territorio
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PROBLEMA
--
-- Un usuario con rol `empleado` recibe 403 al enviar una denuncia desde la PWA
-- de campo:
--
--   POST /rest/v1/rpc/crear_caso_campo → 403 (Forbidden)
--   "Tu rol no tiene permiso para registrar casos."
--
-- El mensaje es correcto y el código está bien: `crear_caso_campo`
-- (migration_v18, redefinida en v21) exige el mismo predicado que la policy
-- `casos_insert` de schema.sql:888 —
--
--   auth_tiene_permiso('casos','crear') or auth_tiene_rol('admin')
--                                       or auth_tiene_rol('superadmin')
--
-- …y la matriz sembrada por migration_v12 concede al empleado:
--
--   ('empleado', 'casos', ver=true, crear=FALSE, editar=true, borrar=false, exportar=false)
--
-- Es decir: el permiso simplemente nunca se otorgó.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ PASÓ, Y POR QUÉ CONCEDERLO ES LO CORRECTO
--
-- v12 se escribió con el empleado entendido como ejecutor: "actualiza el
-- trabajo que se le asigna", de ahí `editar=true, crear=false`. Bajo ese
-- modelo, los casos nacían en el Centro de Monitoreo o en el portal ciudadano.
--
-- v18 cambió el modelo al añadir el alta en campo (`crear_caso_campo`) y toda
-- la vista "Levantar Denuncia" de la PWA — una función cuyo único destinatario
-- es el personal de territorio. Nadie actualizó la matriz de permisos, así que
-- el sistema quedó con una pantalla que no puede cumplir su propósito: el
-- empleado llena el formulario completo, pulsa Enviar y recibe un rechazo.
--
-- Conceder `crear` sobre `casos` al rol `empleado` es lo que alinea el permiso
-- con la funcionalidad que ya existe. No amplía el alcance de lo que ve: la
-- RLS de v14/v16 sigue acotando qué casos puede consultar y modificar.
--
-- Lo que NO se toca:
--   · `borrar` sigue en false — dar de baja un caso es decisión de jefatura.
--   · `exportar` sigue en false — la descarga masiva de datos no es de campo.
--   · `alcalde` y `directivo` siguen siendo de solo lectura por diseño (v13).
--
-- IDEMPOTENTE. Reejecutar no duplica filas ni revierte otros permisos.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Conceder `crear` sobre el módulo `casos` al rol `empleado`
-- ----------------------------------------------------------------------------
-- Se hace con upsert sobre (rol_id, permiso_modulo_id) y tocando SOLO la
-- columna `crear`: un `insert ... on conflict do update` que reescribiera las
-- cinco columnas pisaría cualquier ajuste hecho desde la pantalla de Roles.
insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, true, true, true, false, false
  from public.roles r
  join public.permisos_modulos pm on pm.codigo_modulo = 'casos'
 where r.codigo = 'empleado'
on conflict (rol_id, permiso_modulo_id) do update
   set crear = true,
       -- `ver` es condición necesaria: no se puede crear en un módulo al que
       -- no se tiene acceso, y la UI lo oculta si no puede verlo.
       ver   = true;

-- ----------------------------------------------------------------------------
-- 2. Verificación
-- ----------------------------------------------------------------------------
do $$
declare
    v_ok boolean;
begin
    select rp.crear
      into v_ok
      from public.roles_permisos rp
      join public.roles r             on r.id  = rp.rol_id
      join public.permisos_modulos pm on pm.id = rp.permiso_modulo_id
     where r.codigo = 'empleado'
       and pm.codigo_modulo = 'casos';

    if v_ok is null then
        raise exception
            'v23 incompleta: no existe la fila (empleado, casos) en roles_permisos. '
            '¿Está aplicada migration_v11 (módulos) y migration_v12 (matriz base)?';
    end if;
    if not v_ok then
        raise exception 'v23 incompleta: el permiso `crear` sigue en false para empleado/casos.';
    end if;

    raise notice 'v23 OK — el rol empleado ya puede registrar casos desde campo.';
end;
$$;

commit;

-- ============================================================================
-- COMPROBACIÓN MANUAL
--
-- 1) Matriz efectiva del rol:
--
--    select r.codigo as rol, pm.codigo_modulo as modulo,
--           rp.ver, rp.crear, rp.editar, rp.borrar, rp.exportar
--      from public.roles_permisos rp
--      join public.roles r             on r.id  = rp.rol_id
--      join public.permisos_modulos pm on pm.id = rp.permiso_modulo_id
--     where r.codigo = 'empleado'
--     order by pm.codigo_modulo;
--
-- 2) Con la sesión del empleado (no como postgres, que tiene BYPASSRLS):
--
--    select public.auth_tiene_permiso('casos', 'crear');   -- debe dar true
--
-- Si (2) sigue devolviendo false o null con la fila ya en true, revisar que
-- `usuarios.rol_id` del empleado apunte realmente al rol `empleado`:
--
--    select u.username, u.email_institucional, r.codigo
--      from public.usuarios u join public.roles r on r.id = u.rol_id
--     where u.email_institucional = '<correo del empleado>';
-- ============================================================================
