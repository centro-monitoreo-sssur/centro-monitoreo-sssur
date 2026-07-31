-- ============================================================================
-- MIGRACIÓN v12 — Permisos para los roles jefe_area y empleado
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- La migration_v11 sembró la matriz para superadmin, admin, operador y lector,
-- que son los roles que lista el frontend en vista-roles.js. Pero la base ya
-- tenía otros dos roles propios de la municipalidad, `jefe_area` y `empleado`,
-- que quedaron sin ninguna fila en roles_permisos.
--
-- Un rol sin filas en roles_permisos está completamente bloqueado: no es
-- admin ni superadmin, así que auth_tiene_permiso() agrega sobre cero filas,
-- devuelve NULL, y toda policy lo deniega.
--
-- CRITERIO
--   jefe_area  Jefaturas. Dirigen la operación de su área: gestionan casos e
--              intervenciones, consultan y exportan reportes, ven las
--              cuadrillas. No administran usuarios ni configuración, y no
--              acceden a datos personales de ciudadanos.
--   empleado   Personal de campo. Ve y actualiza el trabajo asignado y
--              registra intervenciones. No crea denuncias desde el panel
--              administrativo, no exporta, no ve datos de ciudadanos.
--
-- REQUIERE: migration_v11. IDEMPOTENTE.
-- ============================================================================

begin;

insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, v.ver, v.crear, v.editar, v.borrar, v.exportar
from (values
    -- rol,        módulo,           ver,   crear, editar, borrar, exportar
    ('jefe_area', 'dashboard',      true,  false, false, false, true ),
    ('jefe_area', 'mapa',           true,  false, false, false, false),
    ('jefe_area', 'casos',          true,  true,  true,  false, true ),
    ('jefe_area', 'intervenciones', true,  true,  true,  false, true ),
    ('jefe_area', 'reportes',       true,  true,  false, false, true ),
    ('jefe_area', 'cuadrillas',     true,  false, true,  false, false),
    ('jefe_area', 'poblacion',      false, false, false, false, false),
    ('jefe_area', 'usuarios',       false, false, false, false, false),
    ('jefe_area', 'config',         false, false, false, false, false),

    ('empleado',  'dashboard',      true,  false, false, false, false),
    ('empleado',  'mapa',           true,  false, false, false, false),
    ('empleado',  'casos',          true,  false, true,  false, false),
    ('empleado',  'intervenciones', true,  true,  true,  false, false),
    ('empleado',  'reportes',       false, false, false, false, false),
    ('empleado',  'cuadrillas',     true,  false, false, false, false),
    ('empleado',  'poblacion',      false, false, false, false, false),
    ('empleado',  'usuarios',       false, false, false, false, false),
    ('empleado',  'config',         false, false, false, false, false)
) as v(cod_rol, cod_modulo, ver, crear, editar, borrar, exportar)
join public.roles            r  on r.codigo         = v.cod_rol
join public.permisos_modulos pm on pm.codigo_modulo = v.cod_modulo
on conflict (rol_id, permiso_modulo_id) do update
    set ver      = excluded.ver,
        crear    = excluded.crear,
        editar   = excluded.editar,
        borrar   = excluded.borrar,
        exportar = excluded.exportar;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Ningún rol activo debe quedarse sin permisos (ESPERADO: 0 filas)
--   select r.codigo, count(rp.id) as filas_de_permisos
--     from public.roles r
--     left join public.roles_permisos rp on rp.rol_id = r.id
--    where r.activo
--    group by 1 having count(rp.id) = 0;
--
-- Resumen de la matriz por rol:
--   select r.codigo,
--          count(*) filter (where rp.ver)      as ve,
--          count(*) filter (where rp.crear)    as crea,
--          count(*) filter (where rp.editar)   as edita,
--          count(*) filter (where rp.borrar)   as borra,
--          count(*) filter (where rp.exportar) as exporta
--     from public.roles r
--     join public.roles_permisos rp on rp.rol_id = r.id
--    group by 1 order by 2 desc;
--
-- ----------------------------------------------------------------------------
-- PENDIENTE DE DECISIÓN — no se aplica aquí a propósito
-- ----------------------------------------------------------------------------
-- 1. Los roles `operador` (id 7) y `lector` (id 8) los introdujo la v11 y
--    posiblemente dupliquen la semántica de `empleado` y de una futura figura
--    directiva. Si se retiran, no se borran: se desactivan, porque
--    usuarios.rol_id los podría referenciar.
--      update public.roles set activo = false where codigo in ('operador','lector');
--
-- 2. No existe rol para Alcalde, Directores ni Gerentes, que son perfiles de
--    consulta ejecutiva sobre todo el municipio.
--
-- 3. LIMITACIÓN VIGENTE: ninguna policy de schema.sql filtra por departamento
--    ni por distrito — auth_distrito_id() está definida pero no se usa en
--    ninguna. Por tanto un `jefe_area` ve los casos de TODAS las áreas, no
--    solo la suya. Acotarlo exige políticas nuevas sobre public.casos.
