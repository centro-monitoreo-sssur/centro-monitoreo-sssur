-- ============================================================================
-- MIGRACIÓN v11 — Seed de seguridad y catálogos operativos
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Cierra el resto del hueco de database/schema.sql, que no trae ningún insert.
--
-- QUÉ DESBLOQUEA
--   · permisos_modulos + roles_permisos → hoy vacías. auth_tiene_permiso()
--     agrega sobre cero filas, bool_or devuelve NULL, y toda policy con la
--     forma `using (auth_tiene_permiso(...) or auth_tiene_rol('admin') or ...)`
--     evalúa a NULL y DENIEGA. Es decir: `casos` responde vacío aunque inicies
--     sesión correctamente.
--   · municipios + distritos → distritos.municipio_id es FK not-null, así que
--     el municipio va primero.
--   · prioridades + canales_reporte → FK not-null desde `casos`. Sin ellas no
--     se puede insertar un solo caso.
--
-- ⚠ DIVERGENCIA RESUELTA AQUÍ
--   Las policies de schema.sql consultan el módulo 'casos'
--   (auth_tiene_permiso('casos','ver')), pero la matriz del panel de admin
--   en assets/js/components/admin/vista-roles.js lista el módulo como
--   'denuncias'. Se siembra 'casos' como codigo_modulo — que es lo que la
--   base evalúa — con nombre_modulo "Gestión de Denuncias", que es lo que la
--   UI muestra. Así funcionan las dos capas sin tocar el frontend.
--
-- NO TOCA public.usuarios: ya existe una fila y no se sobrescribe. Al final
-- hay una consulta para revisar que esté bien enlazada a Supabase Auth.
--
-- REQUIERE: migration_v7 (organigrama). IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Territorio
-- ----------------------------------------------------------------------------
insert into public.municipios (codigo, nombre, activo) values
    ('SSSUR', 'San Salvador Sur', true)
on conflict (codigo) do update set nombre = excluded.nombre;

insert into public.distritos (municipio_id, codigo, nombre, activo)
select m.id, v.codigo, v.nombre, true
from (values
    ('PAN', 'Panchimalco'),
    ('RDM', 'Rosario de Mora'),
    ('SMA', 'San Marcos'),
    ('STX', 'Santiago Texacuangos'),
    ('STO', 'Santo Tomás')
) as v(codigo, nombre)
cross join public.municipios m
where m.codigo = 'SSSUR'
on conflict (municipio_id, codigo) do update set nombre = excluded.nombre;

-- ----------------------------------------------------------------------------
-- 2. Prioridades
--    `nivel` tiene unique y check between 1 and 5.
--    tiempo_objetivo_horas alimenta los indicadores de cumplimiento.
-- ----------------------------------------------------------------------------
insert into public.prioridades (id, codigo, nombre, nivel, color_hex, tiempo_objetivo_horas) values
    (1, 'critica', 'Crítica', 1, '#dc2626',   4),
    (2, 'alta',    'Alta',    2, '#f97316',  24),
    (3, 'media',   'Media',   3, '#f59e0b',  72),
    (4, 'baja',    'Baja',    4, '#3b82f6', 168),
    (5, 'informativa', 'Informativa', 5, '#6b7280', null)
on conflict (id) do update
    set codigo                = excluded.codigo,
        nombre                = excluded.nombre,
        nivel                 = excluded.nivel,
        color_hex             = excluded.color_hex,
        tiempo_objetivo_horas = excluded.tiempo_objetivo_horas;

-- ----------------------------------------------------------------------------
-- 3. Canales de reporte
-- ----------------------------------------------------------------------------
insert into public.canales_reporte (id, codigo, nombre, activo) values
    (1, 'web_admin',          'Centro de Monitoreo',   true),
    (2, 'pwa_empleado',       'PWA Empleado',          true),
    (3, 'registro_presencial','Registro Presencial',   true),
    (4, 'portal_ciudadano',   'Portal Ciudadano',      true),
    (5, 'call_center',        'Call Center',           true),
    (6, 'redes_sociales',     'Redes Sociales',        true)
on conflict (id) do update
    set codigo = excluded.codigo,
        nombre = excluded.nombre,
        activo = excluded.activo;

-- ----------------------------------------------------------------------------
-- 4. Roles
--    Ya existen 4 en la base; el upsert por código solo normaliza nombres y
--    marca como es_sistema los que la UI no debe permitir borrar.
-- ----------------------------------------------------------------------------
insert into public.roles (codigo, nombre, descripcion, es_sistema, activo) values
    ('superadmin', 'Superadministrador', 'Acceso total al sistema',                true,  true),
    ('admin',      'Administrador',      'Gestión operativa del sistema',          true,  true),
    ('operador',   'Operador de Campo',  'Gestión de denuncias e intervenciones',  true,  true),
    ('lector',     'Lector',             'Solo lectura y exportación de reportes', false, true)
on conflict (codigo) do update
    set nombre      = excluded.nombre,
        descripcion = excluded.descripcion,
        es_sistema  = excluded.es_sistema;

-- ----------------------------------------------------------------------------
-- 5. Módulos de la matriz de permisos
--    'casos' es el código que evalúan las policies; 'Gestión de Denuncias' es
--    la etiqueta que renderiza el panel de admin. Ver nota de la cabecera.
--    'cuadrillas' y 'poblacion' los exige migration_v10.
-- ----------------------------------------------------------------------------
insert into public.permisos_modulos (codigo_modulo, nombre_modulo, descripcion, activo) values
    ('dashboard',      'Dashboard y Métricas',        'Indicadores y tableros ejecutivos',            true),
    ('mapa',           'Mapa en Vivo y Cartograma',   'Visualización geoespacial de incidencias',     true),
    ('casos',          'Gestión de Denuncias',        'Denuncias e incidencias del municipio',        true),
    ('intervenciones', 'Intervenciones en Campo',     'Trabajo operativo de las cuadrillas',          true),
    ('reportes',       'Generación de Reportes',      'Reportes consolidados y exportaciones',        true),
    ('cuadrillas',     'Cuadrillas de Campo',         'Equipos operativos y su composición',          true),
    ('poblacion',      'Ciudadanos Registrados',      'Datos personales de ciudadanos del portal',    true),
    ('usuarios',       'Usuarios y Roles',            'Personal institucional y sus permisos',        true),
    ('config',         'Configuración del Sistema',   'Parámetros generales y notificaciones',        true)
on conflict (codigo_modulo) do update
    set nombre_modulo = excluded.nombre_modulo,
        descripcion   = excluded.descripcion,
        activo        = excluded.activo;

-- ----------------------------------------------------------------------------
-- 6. Matriz rol × módulo
--
--    superadmin  todo
--    admin       todo, salvo configuración que solo consulta
--    operador    opera denuncias e intervenciones; el resto solo consulta
--    lector      consulta y exporta; nada de datos personales ni configuración
-- ----------------------------------------------------------------------------
insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, v.ver, v.crear, v.editar, v.borrar, v.exportar
from (values
    -- rol,         módulo,          ver,  crear, editar, borrar, exportar
    ('superadmin', 'dashboard',      true,  true,  true,  true,  true ),
    ('superadmin', 'mapa',           true,  true,  true,  true,  true ),
    ('superadmin', 'casos',          true,  true,  true,  true,  true ),
    ('superadmin', 'intervenciones', true,  true,  true,  true,  true ),
    ('superadmin', 'reportes',       true,  true,  true,  true,  true ),
    ('superadmin', 'cuadrillas',     true,  true,  true,  true,  true ),
    ('superadmin', 'poblacion',      true,  true,  true,  true,  true ),
    ('superadmin', 'usuarios',       true,  true,  true,  true,  true ),
    ('superadmin', 'config',         true,  true,  true,  true,  true ),

    ('admin',      'dashboard',      true,  true,  true,  true,  true ),
    ('admin',      'mapa',           true,  true,  true,  true,  true ),
    ('admin',      'casos',          true,  true,  true,  true,  true ),
    ('admin',      'intervenciones', true,  true,  true,  true,  true ),
    ('admin',      'reportes',       true,  true,  true,  true,  true ),
    ('admin',      'cuadrillas',     true,  true,  true,  true,  true ),
    ('admin',      'poblacion',      true,  true,  true,  false, true ),
    ('admin',      'usuarios',       true,  true,  true,  false, true ),
    ('admin',      'config',         true,  false, false, false, false),

    ('operador',   'dashboard',      true,  false, false, false, false),
    ('operador',   'mapa',           true,  false, false, false, false),
    ('operador',   'casos',          true,  true,  true,  false, false),
    ('operador',   'intervenciones', true,  true,  true,  false, false),
    ('operador',   'reportes',       true,  false, false, false, true ),
    ('operador',   'cuadrillas',     true,  false, false, false, false),
    ('operador',   'poblacion',      false, false, false, false, false),
    ('operador',   'usuarios',       false, false, false, false, false),
    ('operador',   'config',         false, false, false, false, false),

    ('lector',     'dashboard',      true,  false, false, false, true ),
    ('lector',     'mapa',           true,  false, false, false, false),
    ('lector',     'casos',          true,  false, false, false, true ),
    ('lector',     'intervenciones', true,  false, false, false, true ),
    ('lector',     'reportes',       true,  false, false, false, true ),
    ('lector',     'cuadrillas',     true,  false, false, false, false),
    ('lector',     'poblacion',      false, false, false, false, false),
    ('lector',     'usuarios',       false, false, false, false, false),
    ('lector',     'config',         false, false, false, false, false)
) as v(cod_rol, cod_modulo, ver, crear, editar, borrar, exportar)
join public.roles            r  on r.codigo        = v.cod_rol
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
-- Conteos esperados: 1 municipio · 5 distritos · 5 prioridades ·
--                    6 canales · 4 roles · 9 módulos · 36 permisos
--   select (select count(*) from public.municipios)        as municipios,
--          (select count(*) from public.distritos)         as distritos,
--          (select count(*) from public.prioridades)       as prioridades,
--          (select count(*) from public.canales_reporte)   as canales,
--          (select count(*) from public.roles)             as roles,
--          (select count(*) from public.permisos_modulos)  as modulos,
--          (select count(*) from public.roles_permisos)    as permisos;
--
-- ----------------------------------------------------------------------------
-- TU USUARIO — revisar a mano, esta migración no lo toca
-- ----------------------------------------------------------------------------
-- ¿Está enlazado a Supabase Auth y con qué rol?
--   select u.id, u.email_institucional, u.nombres, u.apellidos, u.activo,
--          r.codigo as rol,
--          (au.id is not null) as existe_en_auth_users
--     from public.usuarios u
--     left join public.roles r    on r.id = u.rol_id
--     left join auth.users  au    on au.id = u.id;
--
-- Requisitos para que las policies te dejen ver `casos`:
--   · u.id debe ser EXACTAMENTE el UID de Authentication → Users
--   · u.activo = true
--   · r.codigo in ('admin', 'superadmin')   ó bien el rol debe tener
--     ver = true sobre el módulo 'casos' en roles_permisos
--
-- Si el rol quedó nulo o incorrecto:
--   update public.usuarios
--      set rol_id = (select id from public.roles where codigo = 'superadmin'),
--          activo = true
--    where id = 'PEGA-AQUI-TU-UID';
--
-- Comprobación final, ya autenticado desde la aplicación (no desde el editor
-- SQL, que corre como postgres y se salta RLS):
--   select public.auth_tiene_rol('superadmin')        as soy_superadmin,
--          public.auth_tiene_permiso('casos', 'ver')  as puedo_ver_casos;
