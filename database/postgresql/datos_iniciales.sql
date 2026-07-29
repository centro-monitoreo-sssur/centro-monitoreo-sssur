-- ============================================================================
-- DATOS INICIALES - ESQUEMA NORMALIZADO V2
-- Centro de Monitoreo SSSur
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TERRITORIO
-- ----------------------------------------------------------------------------
insert into public.municipios (id, codigo, nombre) values
    (1, 'SSSUR', 'San Salvador Sur')
on conflict (id) do nothing;

insert into public.distritos (id, municipio_id, codigo, nombre) values
    (1, 1, 'PAN', 'Panchimalco'),
    (2, 1, 'RDM', 'Rosario de Mora'),
    (3, 1, 'SMC', 'San Marcos'),
    (4, 1, 'STX', 'Santiago Texacuangos'),
    (5, 1, 'STO', 'Santo Tomás')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. ESTRUCTURA ADMINISTRATIVA BASE
--    Base mínima alineada a departamentos.csv.
-- ----------------------------------------------------------------------------
insert into public.direcciones_administrativas (codigo, nombre) values
    ('101', 'Dirección De Gabinetes e Innovacion Municipal'),
    ('103', 'Direccion Distrital'),
    ('401', 'Dirección De Servicios Y Obras Municipales')
on conflict (codigo) do nothing;

insert into public.departamentos (direccion_id, codigo, nombre, estado)
select d.id, x.codigo, x.nombre, 'activo'
from public.direcciones_administrativas d
join (
    values
        ('101', '0101-18', 'Cuerpo De Agentes Municipales'),
        ('101', '0101-13', 'Unidad De Gestión De Riesgos'),
        ('101', '0101-14', 'Unidad De Medio Ambiente'),
        ('101', '0101-04', 'Unidad Contravencional'),
        ('101', '0101-05', 'Unidad De Proteccion De Animales De Compañía'),
        ('103', '0103-08', 'Unidad De Alumbrado Publico'),
        ('103', '0103-09', 'Unidad De Mantenimiento De Parques Y Jardines'),
        ('401', '0401-03', 'Unidad De Recolección De Residuos Solidos'),
        ('401', '0401-07', 'Gerencia De Obras Municipales'),
        ('401', '0401-09', 'Unidad Operativa De Obras Municipales')
) as x(codigo_direccion, codigo, nombre)
    on x.codigo_direccion = d.codigo
on conflict (codigo) do nothing;

-- ----------------------------------------------------------------------------
-- 3. ROLES Y PERMISOS
-- ----------------------------------------------------------------------------
insert into public.roles (codigo, nombre, descripcion) values
    ('admin', 'Administrador', 'Acceso total al sistema'),
    ('supervisor', 'Supervisor', 'Gestiona operación y reportes'),
    ('operador', 'Operador', 'Gestiona denuncias e incidentes'),
    ('cuadrilla', 'Cuadrilla', 'Ejecuta intervenciones de campo'),
    ('solo_lectura', 'Solo lectura', 'Consulta información sin editar')
on conflict (codigo) do nothing;

insert into public.permisos (codigo, nombre, modulo, descripcion) values
    ('usuarios.ver', 'Ver usuarios', 'usuarios', 'Consulta usuarios del sistema'),
    ('usuarios.gestionar', 'Gestionar usuarios', 'usuarios', 'Crea y actualiza usuarios'),
    ('denuncias.ver', 'Ver denuncias', 'denuncias', 'Consulta denuncias'),
    ('denuncias.crear', 'Crear denuncias', 'denuncias', 'Registra denuncias'),
    ('denuncias.editar', 'Editar denuncias', 'denuncias', 'Actualiza y deriva denuncias'),
    ('incidentes.ver', 'Ver incidentes', 'incidentes', 'Consulta incidentes'),
    ('incidentes.gestionar', 'Gestionar incidentes', 'incidentes', 'Crea y actualiza incidentes'),
    ('intervenciones.ver', 'Ver intervenciones', 'intervenciones', 'Consulta intervenciones'),
    ('intervenciones.gestionar', 'Gestionar intervenciones', 'intervenciones', 'Crea y actualiza intervenciones'),
    ('reportes.ver', 'Ver reportes', 'reportes', 'Consulta historial de reportes'),
    ('reportes.generar', 'Generar reportes', 'reportes', 'Emite reportes'),
    ('plantillas.ver', 'Ver plantillas', 'plantillas', 'Consulta plantillas'),
    ('plantillas.gestionar', 'Gestionar plantillas', 'plantillas', 'Administra plantillas y versiones'),
    ('auditoria.ver', 'Ver auditoría', 'auditoria', 'Consulta bitácora de auditoría')
on conflict (codigo) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on (
    (r.codigo = 'admin')
    or (r.codigo = 'supervisor' and p.codigo in (
        'usuarios.ver',
        'denuncias.ver', 'denuncias.crear', 'denuncias.editar',
        'incidentes.ver', 'incidentes.gestionar',
        'intervenciones.ver', 'intervenciones.gestionar',
        'reportes.ver', 'reportes.generar',
        'plantillas.ver'
    ))
    or (r.codigo = 'operador' and p.codigo in (
        'denuncias.ver', 'denuncias.crear', 'denuncias.editar',
        'incidentes.ver', 'incidentes.gestionar',
        'intervenciones.ver',
        'reportes.ver'
    ))
    or (r.codigo = 'cuadrilla' and p.codigo in (
        'denuncias.ver',
        'incidentes.ver',
        'intervenciones.ver', 'intervenciones.gestionar'
    ))
    or (r.codigo = 'solo_lectura' and p.codigo in (
        'denuncias.ver',
        'incidentes.ver',
        'intervenciones.ver',
        'reportes.ver'
    ))
)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 4. CATÁLOGOS OPERATIVOS
-- ----------------------------------------------------------------------------
insert into public.prioridades (id, codigo, nombre, nivel, color_hex, tiempo_objetivo_horas) values
    (1, 'critica', 'Crítica', 1, '#dc2626', 4),
    (2, 'alta', 'Alta', 2, '#ea580c', 8),
    (3, 'media', 'Media', 3, '#d97706', 24),
    (4, 'baja', 'Baja', 4, '#2563eb', 72),
    (5, 'planificada', 'Planificada', 5, '#6b7280', 168)
on conflict (id) do nothing;

insert into public.estados_denuncia (id, codigo, nombre, orden, es_final) values
    (1, 'pendiente', 'Pendiente', 1, false),
    (2, 'en_revision', 'En revisión', 2, false),
    (3, 'asignada', 'Asignada', 3, false),
    (4, 'en_proceso', 'En proceso', 4, false),
    (5, 'resuelta', 'Resuelta', 5, true),
    (6, 'rechazada', 'Rechazada', 6, true)
on conflict (id) do nothing;

insert into public.estados_incidente (id, codigo, nombre, orden, es_final) values
    (1, 'abierto', 'Abierto', 1, false),
    (2, 'validado', 'Validado', 2, false),
    (3, 'atendido', 'Atendido', 3, false),
    (4, 'cerrado', 'Cerrado', 4, true),
    (5, 'cancelado', 'Cancelado', 5, true)
on conflict (id) do nothing;

insert into public.estados_intervencion (id, codigo, nombre, orden, es_final) values
    (1, 'programada', 'Programada', 1, false),
    (2, 'en_camino', 'En camino', 2, false),
    (3, 'en_ejecucion', 'En ejecución', 3, false),
    (4, 'completada', 'Completada', 4, true),
    (5, 'cancelada', 'Cancelada', 5, true)
on conflict (id) do nothing;

insert into public.canales_reporte (id, codigo, nombre) values
    (1, 'web_admin', 'Panel administrativo'),
    (2, 'pwa_empleado', 'PWA empleado'),
    (3, 'registro_presencial', 'Registro presencial'),
    (4, 'api_externa', 'API externa')
on conflict (id) do nothing;

insert into public.tipos_incidente (id, codigo, nombre) values
    (1, 'derivado_denuncia', 'Derivado de denuncia'),
    (2, 'operativo_programado', 'Operativo programado'),
    (3, 'emergencia', 'Emergencia')
on conflict (id) do nothing;

insert into public.tipos_intervencion (id, codigo, nombre) values
    (1, 'inspeccion', 'Inspección'),
    (2, 'atencion', 'Atención'),
    (3, 'mantenimiento', 'Mantenimiento'),
    (4, 'cierre', 'Cierre de incidente')
on conflict (id) do nothing;

insert into public.tipos_reporte (id, codigo, nombre, descripcion) values
    (1, 'denuncias', 'Reporte de denuncias', 'Consolidado por estado, categoría y distrito'),
    (2, 'incidentes', 'Reporte de incidentes', 'Seguimiento de incidentes y tiempos'),
    (3, 'intervenciones', 'Reporte de intervenciones', 'Ejecución operativa de cuadrillas'),
    (4, 'desempeno', 'Reporte de desempeño', 'Indicadores por área y usuario')
on conflict (id) do nothing;

insert into public.tipos_documento (id, codigo, nombre, entidad_base) values
    (1, 'reporte', 'Reporte', 'reporte'),
    (2, 'comprobante_denuncia', 'Comprobante de denuncia', 'denuncia'),
    (3, 'comprobante_incidente', 'Comprobante de incidente', 'incidente'),
    (4, 'comprobante_intervencion', 'Comprobante de intervención', 'intervencion')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. CATEGORÍAS BASE
--    Base mínima. La carga completa debe venir de categoria_denuncias.csv.
-- ----------------------------------------------------------------------------
insert into public.categorias_denuncia (codigo, nombre, descripcion, icono, color_hex, departamento_responsable_id)
select x.codigo, x.nombre, x.descripcion, x.icono, x.color_hex, d.id
from public.departamentos d
join (
    values
        ('alumbrado', 'Alumbrado Público', 'Incidencias de luminarias y cobertura de alumbrado', 'fa-lightbulb', '#2563eb', '0103-08'),
        ('cam', 'CAM', 'Problemas de orden y uso del espacio público', 'fa-users', '#dc2626', '0101-18'),
        ('obras', 'Obras Municipales', 'Infraestructura pública y obras', 'fa-road', '#d97706', '0401-07'),
        ('medio_ambiente', 'Medio Ambiente', 'Riesgos y afectaciones ambientales', 'fa-leaf', '#16a34a', '0101-14'),
        ('proteccion_civil', 'Protección Civil', 'Riesgos, derrumbes y emergencias', 'fa-triangle-exclamation', '#b91c1c', '0101-13'),
        ('contravencional', 'Contravencional', 'Incumplimientos a ordenanzas municipales', 'fa-scale-balanced', '#7c3aed', '0101-04'),
        ('proteccion_animal', 'Protección Animal', 'Casos de bienestar animal', 'fa-paw', '#ec4899', '0101-05'),
        ('residuos', 'Residuos Sólidos', 'Basura, recolección y desechos', 'fa-trash-alt', '#b45309', '0401-03'),
        ('vias_drenajes', 'Vías y Drenajes', 'Calles, drenajes y tragantes', 'fa-road-circle-exclamation', '#0f766e', '0401-09')
) as x(codigo, nombre, descripcion, icono, color_hex, codigo_departamento)
    on x.codigo_departamento = d.codigo
on conflict (codigo) do nothing;

insert into public.subcategorias_denuncia (categoria_id, codigo, nombre, descripcion, prioridad_default_id)
select c.id, x.codigo, x.nombre, x.descripcion, x.prioridad_default_id
from public.categorias_denuncia c
join (
    values
        ('alumbrado', 'ALUMBRADO_PUBLICO_DEFECTUOSO', 'Alumbrado público defectuoso', 'Lámpara apagada, parpadeando o encendida fuera de horario', 3),
        ('alumbrado', 'SOLICITUD_NUEVO_ALUMBRADO', 'Solicitud de nuevo alumbrado', 'Solicitud de cobertura nueva en zona oscura', 4),
        ('cam', 'OBSTRUCCION_VIA_PUBLICA', 'Obstrucción vía pública', 'Talleres, ventas o elementos que bloquean espacio público', 2),
        ('cam', 'VEHICULO_ABANDONADO', 'Vehículo abandonado', 'Vehículo en aparente abandono en vía pública', 3),
        ('obras', 'OBRAS_SIN_SENALIZACION', 'Obras en vía pública sin señalización', 'Obra peligrosa por falta de señalización', 2),
        ('obras', 'DETERIORO_INFRAESTRUCTURA_PUBLICA', 'Deterioro de infraestructura pública', 'Puentes, gradas, muros u otra infraestructura dañada', 3),
        ('medio_ambiente', 'BASURA_EN_LUGARES_PROHIBIDOS', 'Basura en lugares prohibidos', 'Acumulación ilegal de basura', 3),
        ('medio_ambiente', 'QUEMA_DESECHOS', 'Quema de desechos', 'Quema al aire libre con contaminación', 2),
        ('proteccion_civil', 'PELIGRO_DERRUMBE', 'Peligro de derrumbe', 'Taludes o estructuras con riesgo de colapso', 1),
        ('proteccion_civil', 'ARBOL_RAMA_PELIGROSA', 'Árbol o rama peligrosa', 'Solicitud de poda urgente o remoción', 2),
        ('contravencional', 'MOLESTIAS_RUIDO', 'Molestias por ruido', 'Ruido excesivo en horarios no permitidos', 3),
        ('contravencional', 'VERTIMIENTO_AGUAS_RESIDUALES', 'Vertimiento de aguas residuales', 'Descarga de aguas sucias en vía pública', 2),
        ('contravencional', 'VENTA_ILEGAL_ALCOHOL', 'Venta ilegal de alcohol', 'Venta sin permisos correspondientes', 2),
        ('proteccion_animal', 'PROTECCION_ANIMAL', 'Protección animal', 'Maltrato o crueldad animal', 2),
        ('proteccion_animal', 'ANIMALES_ABANDONADOS', 'Animales abandonados', 'Animales de compañía abandonados', 3),
        ('residuos', 'ACUMULACION_INADECUADA_BASURA', 'Acumulación inadecuada de basura', 'Montones de basura fuera de horario o contenedor', 3),
        ('vias_drenajes', 'DRENAJE_PLUVIAL_AFECTADO', 'Drenaje pluvial afectado', 'Alcantarillas o tragantes con problemas', 2),
        ('vias_drenajes', 'DETERIORO_CALLES', 'Deterioro de calles', 'Baches, hundimientos o falta de pavimento', 3)
) as x(categoria_codigo, codigo, nombre, descripcion, prioridad_default_id)
    on x.categoria_codigo = c.codigo
on conflict (codigo) do nothing;

-- ----------------------------------------------------------------------------
-- 6. IMPORTACIÓN RECOMENDADA DESDE CSV
-- ----------------------------------------------------------------------------
-- departamentos.csv:
--   1. Cargar a tabla staging_departamentos.
--   2. Insertar distinct codigo_direccion/nombre_direccion en direcciones_administrativas.
--   3. Insertar cod_dpto/nombre_dpto en departamentos.
--
-- categoria_denuncias.csv:
--   1. Convertir el archivo a UTF-8 antes de importar.
--   2. Tratar cada fila del CSV como subcategoría.
--   3. Agruparlas manualmente bajo categorias_denuncia curadas por negocio.
--   4. No volver a guardar dpto_responsable como texto libre.
