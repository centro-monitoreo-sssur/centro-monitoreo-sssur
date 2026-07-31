-- ============================================================================
-- MIGRACIÓN v13 — Roles directivos y retiro de roles duplicados
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Cierra el modelo de roles con los perfiles reales que usan el sistema:
--
--   superadmin  Soporte TI. Acceso total, incluida configuración.
--   admin       Gestión operativa del sistema.
--   alcalde     Máxima autoridad. Consulta total sobre el municipio, incluida
--               la configuración en modo lectura. No edita nada.
--   directivo   Directores y Gerentes. Consulta y exportación de lo operativo.
--   jefe_area   Jefaturas. Gestionan casos e intervenciones de su área.
--   empleado    Personal de campo. Ejecuta y actualiza el trabajo asignado.
--
-- Se retiran `operador` (duplicaba a `empleado`) y `lector` (sustituido por
-- `directivo`), ambos introducidos por error en la migration_v11.
-- NO se borran: usuarios.rol_id podría referenciarlos y perderíamos la
-- trazabilidad de quién tuvo qué permisos. Se desactivan.
--
-- DECISIÓN SOBRE DATOS PERSONALES
--   Ni `alcalde` ni `directivo` reciben acceso al módulo `poblacion` (DUI,
--   teléfono y distrito de ciudadanos). Es minimización de datos: un perfil
--   de consulta ejecutiva no necesita identificar personas para tomar
--   decisiones territoriales. Si legalmente se requiere, es cambiar el
--   `false` a `true` en las dos filas correspondientes.
--
-- REQUIERE: migration_v11 y migration_v12. IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Alta de los roles directivos
-- ----------------------------------------------------------------------------
insert into public.roles (codigo, nombre, descripcion, es_sistema, activo) values
    ('alcalde',   'Alcalde',                'Consulta total del municipio, incluida configuración en modo lectura', true, true),
    ('directivo', 'Director / Gerente',     'Consulta y exportación de la operación municipal',                      true, true)
on conflict (codigo) do update
    set nombre      = excluded.nombre,
        descripcion = excluded.descripcion,
        es_sistema  = excluded.es_sistema,
        activo      = true;

-- ----------------------------------------------------------------------------
-- 2. Matriz de permisos
--    Ambos perfiles son de consulta: cero crear, editar o borrar.
--    Diferencia: `alcalde` además consulta usuarios y configuración.
-- ----------------------------------------------------------------------------
insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, v.ver, v.crear, v.editar, v.borrar, v.exportar
from (values
    -- rol,         módulo,           ver,   crear, editar, borrar, exportar
    ('alcalde',    'dashboard',      true,  false, false, false, true ),
    ('alcalde',    'mapa',           true,  false, false, false, false),
    ('alcalde',    'casos',          true,  false, false, false, true ),
    ('alcalde',    'intervenciones', true,  false, false, false, true ),
    ('alcalde',    'reportes',       true,  false, false, false, true ),
    ('alcalde',    'cuadrillas',     true,  false, false, false, false),
    ('alcalde',    'poblacion',      false, false, false, false, false),
    ('alcalde',    'usuarios',       true,  false, false, false, false),
    ('alcalde',    'config',         true,  false, false, false, false),

    ('directivo',  'dashboard',      true,  false, false, false, true ),
    ('directivo',  'mapa',           true,  false, false, false, false),
    ('directivo',  'casos',          true,  false, false, false, true ),
    ('directivo',  'intervenciones', true,  false, false, false, true ),
    ('directivo',  'reportes',       true,  false, false, false, true ),
    ('directivo',  'cuadrillas',     true,  false, false, false, false),
    ('directivo',  'poblacion',      false, false, false, false, false),
    ('directivo',  'usuarios',       false, false, false, false, false),
    ('directivo',  'config',         false, false, false, false, false)
) as v(cod_rol, cod_modulo, ver, crear, editar, borrar, exportar)
join public.roles            r  on r.codigo         = v.cod_rol
join public.permisos_modulos pm on pm.codigo_modulo = v.cod_modulo
on conflict (rol_id, permiso_modulo_id) do update
    set ver      = excluded.ver,
        crear    = excluded.crear,
        editar   = excluded.editar,
        borrar   = excluded.borrar,
        exportar = excluded.exportar;

-- ----------------------------------------------------------------------------
-- 3. Retiro de operador y lector
--    Antes de desactivarlos se verifica que nadie los esté usando: un usuario
--    activo cuyo rol se desactiva queda sin permisos en silencio, porque
--    auth_tiene_rol() exige r.activo = true.
-- ----------------------------------------------------------------------------
do $$
declare
    v_afectados text;
begin
    select string_agg(u.username || ' (' || r.codigo || ')', ', ')
      into v_afectados
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
     where u.activo and r.codigo in ('operador', 'lector');

    if v_afectados is not null then
        raise exception
            'No se pueden retirar los roles: los siguientes usuarios activos los usan → %. Reasignalos primero (empleado o directivo según corresponda).',
            v_afectados;
    end if;
end $$;

update public.roles
   set activo = false
 where codigo in ('operador', 'lector');

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Modelo final: 6 roles activos, 2 inactivos, todos con permisos definidos
--   select r.codigo, r.nombre, r.activo,
--          count(*) filter (where rp.ver)      as ve,
--          count(*) filter (where rp.crear)    as crea,
--          count(*) filter (where rp.editar)   as edita,
--          count(*) filter (where rp.borrar)   as borra,
--          count(*) filter (where rp.exportar) as exporta
--     from public.roles r
--     left join public.roles_permisos rp on rp.rol_id = r.id
--    group by 1, 2, 3
--    order by r.activo desc, ve desc;
--
-- Ningún rol activo sin permisos (ESPERADO: 0 filas)
--   select r.codigo
--     from public.roles r
--     left join public.roles_permisos rp on rp.rol_id = r.id
--    where r.activo
--    group by 1 having count(rp.id) = 0;
--
-- ----------------------------------------------------------------------------
-- LIMITACIÓN VIGENTE — no la resuelve esta migración
-- ----------------------------------------------------------------------------
-- Ninguna policy de schema.sql filtra por departamento ni por distrito:
-- auth_distrito_id() está definida pero no se usa en ninguna. Por tanto un
-- `jefe_area` ve los casos de TODAS las áreas, no solo de la suya. Para
-- acotarlo hace falta una policy nueva sobre public.casos que cruce
-- usuarios.departamento_id contra casos.departamento_actual_id, apoyada en
-- la tabla departamento_categorias de la migration_v6.
