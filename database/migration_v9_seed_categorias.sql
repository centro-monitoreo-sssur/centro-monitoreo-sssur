-- ============================================================================
-- MIGRACIÓN v9 — Seed de categorías de caso y su reparto entre departamentos
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Llena `categorias_caso` (hoy vacía, motivo por el que el Centro de Monitoreo
-- mostraba las categorías de demo de assets/js/utils/demo-data.js) y su reparto
-- N:M en `departamento_categorias`.
--
-- ⚠ EL REPARTO DEPARTAMENTO↔CATEGORÍA ES UNA PROPUESTA, NO UN DATO OFICIAL.
--   Está deducido de los nombres de las unidades en database/departamentos.csv.
--   Cada dirección debe validar qué le corresponde atender antes de operar en
--   producción. Corregir es barato: se ajusta el bloque `values` del punto 2 y
--   se vuelve a correr esta migración (es idempotente).
--
-- Los iconos usan nomenclatura Font Awesome 6 (index.html carga 6.6.0). El
-- fallback de demo-data.js traía `fa-bench` y `fa-trash-alt`, que no existen en
-- FA6 y se renderizaban en blanco; aquí quedan como `fa-tree-city` y
-- `fa-trash-can`.
--
-- REQUIERE: migration_v6 (departamento_categorias) y migration_v7 (organigrama).
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Categorías de caso
--
--    El flujo de estados por defecto va como CTE. Esta migración no crea
--    ninguna relación nueva: solo inserta filas. Si el editor de Supabase
--    muestra el aviso de Row Level Security, es que quedó texto viejo en la
--    pestaña — limpiala por completo antes de pegar.
--
--    El flujo coincide con assets/js/utils/badge.js (estadosPosibles), que es
--    lo que hoy entienden todas las vistas. Cada categoría puede sobrescribirlo
--    después desde la administración: para eso existe categorias_caso.estados_flujo.
--
--    El departamento responsable se resuelve por código; es el mismo que en el
--    punto 2 aparece marcado como responsable principal.
-- ----------------------------------------------------------------------------
with flujo_default as (
    select '[
      {"id":"pendiente",   "nombre":"Pendiente",   "icono":"fa-inbox",             "color":"red",     "es_final":false},
      {"id":"en_revision", "nombre":"En revisión", "icono":"fa-magnifying-glass",  "color":"blue",    "es_final":false},
      {"id":"en_obra",     "nombre":"En obra",     "icono":"fa-screwdriver-wrench","color":"amber",   "es_final":false},
      {"id":"resuelta",    "nombre":"Resuelta",    "icono":"fa-circle-check",      "color":"emerald", "es_final":true},
      {"id":"rechazada",   "nombre":"Rechazada",   "icono":"fa-circle-xmark",      "color":"gray",    "es_final":true}
    ]'::jsonb as flujo
)
insert into public.categorias_caso
    (codigo, nombre, descripcion, icono, color_hex,
     departamento_responsable_id, requiere_ubicacion, estados_flujo, estado_inicial, activo)
select v.codigo, v.nombre, v.descripcion, v.icono, v.color_hex,
       d.id, true, f.flujo, 'pendiente', true
from (values
    -- código,           nombre,                                    descripción,                                              icono,                   color,       depto responsable
    ('VIA-BACHE',        'Calle dañada / Baches',                   'Deterioro de la superficie de rodaje en vía pública',     'fa-road',               '#8b5cf6',  '0401-09'),
    ('VIA-ACERA',        'Acera dañada / Rota',                     'Daño en acera o paso peatonal',                           'fa-person-walking',     '#8b5cf6',  '0401-09'),
    ('VIA-DESAGUE',      'Desagüe obstruido / Inundación',          'Obstrucción de drenaje o encharcamiento en vía',          'fa-water',              '#3b82f6',  '0401-09'),
    ('RES-BASURA',       'Promontorio de basura',                   'Acumulación de residuos sólidos en espacio público',      'fa-trash-can',          '#14b8a6',  '0401-03'),
    ('DIS-LIMPIEZA',     'Limpieza de área pública',                'Solicitud de barrido o limpieza de espacio público',      'fa-broom',              '#84cc16',  '0401-04'),
    ('ALU-LUMINARIA',    'Luminaria dañada / Apagada',              'Falla en el alumbrado público',                           'fa-lightbulb',          '#facc15',  '0103-08'),
    ('AMB-PARQUE',       'Parque / Área verde deteriorada',         'Deterioro de parques, jardines o zonas verdes',           'fa-tree',               '#22c55e',  '0103-09'),
    ('DIS-ESPACIO',      'Espacio público deteriorado',             'Mobiliario o infraestructura de espacio público dañada',  'fa-tree-city',          '#a3e635',  '0103-07'),
    ('CONV-RUIDO',       'Ruidos molestos',                         'Contaminación sonora que afecta la convivencia',          'fa-volume-high',        '#f97316',  '0101-18'),
    ('CONV-VECINAL',     'Problemas vecinales',                     'Conflicto entre vecinos susceptible de mediación',        'fa-users',              '#6366f1',  '0101-03'),
    ('ANI-ABANDONO',     'Animal abandonado / Peligroso',           'Animal en abandono o que representa riesgo',              'fa-dog',                '#f59e0b',  '0101-05'),
    ('SOC-MENOR',        'Menor en situación de riesgo',            'Niñez o adolescencia en condición de vulnerabilidad',     'fa-child',              '#ef4444',  '0301-08'),
    ('RIE-ARBOL',        'Árbol caído / Deslizamiento',             'Caída de árbol o movimiento de tierra',                   'fa-tree',               '#f97316',  '0101-13'),
    ('RIE-INCENDIO',     'Incendio / Humo',                         'Conato de incendio o presencia de humo',                  'fa-fire',               '#ef4444',  '0101-13'),
    ('RIE-ESTRUCTURA',   'Estructura en riesgo',                    'Edificación o muro con riesgo de colapso',                'fa-building',           '#dc2626',  '0101-13'),
    ('COM-INFORMAL',     'Comercio informal / Ambulante',           'Venta no autorizada en espacio público',                  'fa-store',              '#06b6d4',  '0402-07'),
    ('COM-MERCADO',      'Problema en mercado municipal',           'Incidencia dentro de un mercado municipal',               'fa-shop',               '#0891b2',  '0402-06'),
    ('ADM-TRAMITE',      'Trámite documental',                      'Solicitud o queja sobre trámites y documentación',        'fa-file-lines',         '#64748b',  '0101-07'),
    ('ADM-CEMENTERIO',   'Problema en cementerio',                  'Incidencia en cementerios municipales',                   'fa-monument',           '#78716c',  '0103-05')
) as v(codigo, nombre, descripcion, icono, color_hex, cod_dpto)
join public.departamentos d on d.codigo = v.cod_dpto
cross join flujo_default f
on conflict (codigo) do update
    set nombre                      = excluded.nombre,
        descripcion                 = excluded.descripcion,
        icono                       = excluded.icono,
        color_hex                   = excluded.color_hex,
        departamento_responsable_id = excluded.departamento_responsable_id,
        activo                      = excluded.activo;

-- ----------------------------------------------------------------------------
-- 2. Reparto N:M — quién atiende qué
--
--    principal  = a este departamento le nace el caso (uno solo por categoría)
--    interviene = puede ejecutar trabajo de campo sobre la categoría
--                 false ⇒ solo la ve en el mapa y el tablero, no la trabaja
--
--    ⚠ PROPUESTA A VALIDAR CON CADA DIRECCIÓN — ver cabecera del archivo.
-- ----------------------------------------------------------------------------
insert into public.departamento_categorias
    (departamento_id, categoria_id, es_responsable_principal, puede_intervenir)
select d.id, c.id, v.principal, v.interviene
from (values
    -- ── Vía pública y obras ──────────────────────────────────────────────────
    ('VIA-BACHE',      '0401-09', true,  true ),   -- Unidad Operativa De Obras Municipales
    ('VIA-BACHE',      '0401-08', false, false),   -- Planificación De Obras (supervisa)
    ('VIA-ACERA',      '0401-09', true,  true ),
    ('VIA-DESAGUE',    '0401-09', true,  true ),
    ('VIA-DESAGUE',    '0101-13', false, true ),   -- Gestión De Riesgos ante inundación

    -- ── Residuos y limpieza ──────────────────────────────────────────────────
    ('RES-BASURA',     '0401-03', true,  true ),   -- Recolección De Residuos Solidos
    ('RES-BASURA',     '0401-04', false, true ),   -- Barrido De Calles
    ('RES-BASURA',     '0401-02', false, false),   -- Gerencia GIRS (supervisa)
    ('DIS-LIMPIEZA',   '0401-04', true,  true ),
    ('DIS-LIMPIEZA',   '0103-04', false, true ),   -- Mantenimiento Interno

    -- ── Alumbrado y espacio público ──────────────────────────────────────────
    ('ALU-LUMINARIA',  '0103-08', true,  true ),   -- Unidad De Alumbrado Publico
    ('ALU-LUMINARIA',  '0103-01', false, false),   -- Direccion Distrital (supervisa)
    ('AMB-PARQUE',     '0103-09', true,  true ),   -- Parques Y Jardines
    ('AMB-PARQUE',     '0103-07', false, true ),   -- Dinamizacion De Espacios Publicos
    ('DIS-ESPACIO',    '0103-07', true,  true ),
    ('DIS-ESPACIO',    '0103-09', false, true ),

    -- ── Convivencia ciudadana ────────────────────────────────────────────────
    ('CONV-RUIDO',     '0101-18', true,  true ),   -- Cuerpo De Agentes Municipales
    ('CONV-RUIDO',     '0101-04', false, true ),   -- Unidad Contravencional (sanción)
    ('CONV-VECINAL',   '0101-03', true,  true ),   -- Mediación Municipal
    ('CONV-VECINAL',   '0101-18', false, true ),   -- CAM como apoyo
    ('ANI-ABANDONO',   '0101-05', true,  true ),   -- Proteccion De Animales De Compañía
    ('ANI-ABANDONO',   '0101-18', false, true ),
    ('SOC-MENOR',      '0301-08', true,  true ),   -- Niñez Y Adolescencia
    ('SOC-MENOR',      '0101-18', false, false),   -- CAM solo observa (materia sensible)

    -- ── Gestión de riesgos ───────────────────────────────────────────────────
    ('RIE-ARBOL',      '0101-13', true,  true ),   -- Unidad De Gestión De Riesgos
    ('RIE-ARBOL',      '0401-09', false, true ),   -- Obras despeja la vía
    ('RIE-ARBOL',      '0101-14', false, false),   -- Medio Ambiente dictamina
    ('RIE-INCENDIO',   '0101-13', true,  true ),
    ('RIE-INCENDIO',   '0101-18', false, true ),
    ('RIE-ESTRUCTURA', '0101-13', true,  true ),
    ('RIE-ESTRUCTURA', '0401-08', false, false),   -- Planificación De Obras dictamina

    -- ── Actividad económica ──────────────────────────────────────────────────
    ('COM-INFORMAL',   '0402-07', true,  true ),   -- Ordenamiento Comercial
    ('COM-INFORMAL',   '0101-18', false, true ),
    ('COM-MERCADO',    '0402-06', true,  true ),   -- Administracion De Mercados
    ('COM-MERCADO',    '0402-07', false, true ),

    -- ── Administrativo ───────────────────────────────────────────────────────
    ('ADM-TRAMITE',    '0101-07', true,  true ),   -- Gestión Documental Y Archivo
    ('ADM-CEMENTERIO', '0103-05', true,  true )    -- Administracion De Cementerios
) as v(cod_categoria, cod_dpto, principal, interviene)
join public.categorias_caso c on c.codigo = v.cod_categoria
join public.departamentos   d on d.codigo = v.cod_dpto
on conflict (departamento_id, categoria_id) do update
    set es_responsable_principal = excluded.es_responsable_principal,
        puede_intervenir         = excluded.puede_intervenir,
        activo                   = true;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 19 categorías, 37 asignaciones:
--   select (select count(*) from public.categorias_caso)          as categorias,
--          (select count(*) from public.departamento_categorias)  as asignaciones;
--
-- Toda categoría debe tener exactamente un responsable principal (0 filas):
--   select c.codigo, count(*) filter (where dc.es_responsable_principal) as principales
--     from public.categorias_caso c
--     join public.departamento_categorias dc on dc.categoria_id = c.id
--    group by 1 having count(*) filter (where dc.es_responsable_principal) <> 1;
--
-- Carga de trabajo propuesta por departamento:
--   select departamento_codigo, departamento_nombre,
--          count(*) filter (where es_responsable_principal) as es_responsable,
--          count(*) filter (where puede_intervenir)         as puede_intervenir,
--          count(*)                                        as ve_en_total
--     from public.v_categorias_por_departamento
--    group by 1, 2 order by 3 desc, 4 desc;
--
-- Espejo legacy sincronizado por el trigger de la v6 (0 filas):
--   select c.codigo from public.categorias_caso c
--     join public.departamento_categorias dc
--       on dc.categoria_id = c.id and dc.es_responsable_principal
--    where c.departamento_responsable_id <> dc.departamento_id;
