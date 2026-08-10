-- ============================================================================
-- MIGRACIÓN v25 — Prioridad por defecto de cada categoría
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PROBLEMA
--
-- Las 19 categorías de `categorias_caso` tienen `prioridad_default_id` en NULL:
-- migration_v9 las sembró sin asignarla y nada falló de forma visible, porque
-- ninguna vista la exigía hasta que v24 tuvo que resolverla al dar de alta.
--
-- Consecuencia: todos los casos nacen con la misma prioridad de respaldo, y el
-- SLA definido en migration_v11 queda inerte.
--
--   Crítica     nivel 1 →   4 h
--   Alta        nivel 2 →  24 h
--   Media       nivel 3 →  72 h
--   Baja        nivel 4 → 168 h
--   Informativa nivel 5 →  sin objetivo
--
-- Con todo en "Media", un incendio y un trámite documental comparten plazo de
-- 72 horas. Además:
--   · `v_kpis_distrito.fuera_de_objetivo` mide a todos contra el mismo reloj.
--   · `v_kpis_distrito.criticas_abiertas` es SIEMPRE 0, y con ella la primera
--     rama de `semaforo()` en stores/territorio.js nunca se evalúa.
--
-- ----------------------------------------------------------------------------
-- ⚠ ESTO ES UNA PROPUESTA, NO UN DATO OFICIAL
--
-- El criterio usado es el riesgo para las personas y la velocidad a la que el
-- problema se agrava, no la importancia administrativa del área:
--
--   Crítica → hay riesgo inmediato para la vida o la integridad.
--   Alta    → daña bienes, la seguridad o la salubridad, y empeora con los días.
--   Media   → afecta la convivencia o el uso del espacio, sin agravarse solo.
--   Baja    → deterioro o gestión que admite programación.
--
-- Debe validarse con cada dirección antes de darse por buena, igual que el
-- mapeo categoría↔departamento de v9 (ver §12.4 del doc técnico). Cambiar una
-- prioridad después es un UPDATE de una fila; el efecto sobre la operación
-- —a qué hora se considera vencido un caso— no lo es.
--
-- NO se tocan los casos ya creados: su prioridad es parte del histórico y
-- reescribirla falsearía cualquier medición de cumplimiento pasada.
--
-- IDEMPOTENTE. Solo rellena; no pisa una prioridad ya asignada a mano.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Asignación por código de categoría
-- ----------------------------------------------------------------------------
-- Se empareja por `codigo`, no por id: los ids son de catálogo y podrían
-- reordenarse en otra instalación; el código es el identificador estable.
with propuesta(cod_categoria, cod_prioridad, motivo) as (values
    -- ── Crítica (4 h): riesgo inmediato para las personas ──────────────
    ('RIE-INCENDIO',   'critica', 'Fuego activo o humo: riesgo para la vida'),
    ('RIE-ESTRUCTURA', 'critica', 'Riesgo de colapso sobre vía o vivienda'),
    ('RIE-ARBOL',      'critica', 'Caída o deslizamiento: puede bloquear vía y herir'),
    ('SOC-MENOR',      'critica', 'Niñez en riesgo: obligación de protección inmediata'),

    -- ── Alta (24 h): daña bienes, seguridad o salubridad y empeora ─────
    ('ANI-ABANDONO',   'alta',    'Animal peligroso suelto: riesgo de agresión'),
    ('VIA-DESAGUE',    'alta',    'Con lluvia se convierte en inundación'),
    ('ALU-LUMINARIA',  'alta',    'Oscuridad: percepción de inseguridad nocturna'),
    ('VIA-BACHE',      'alta',    'Daña vehículos y se agranda con cada lluvia'),
    ('RES-BASURA',     'alta',    'Salubridad: vectores y malos olores en días'),

    -- ── Media (72 h): afecta convivencia o uso, sin agravarse solo ─────
    ('VIA-ACERA',      'media',   'Riesgo de tropiezo, sin agravamiento rápido'),
    ('CONV-RUIDO',     'media',   'Molestia recurrente, requiere verificación'),
    ('CONV-VECINAL',   'media',   'Mediación entre partes'),
    ('COM-INFORMAL',   'media',   'Ordenamiento del espacio público'),
    ('COM-MERCADO',    'media',   'Incidencia en instalación municipal en operación'),
    ('DIS-LIMPIEZA',   'media',   'Barrido programable'),

    -- ── Baja (168 h): deterioro o gestión programable ──────────────────
    ('AMB-PARQUE',     'baja',    'Mantenimiento de área verde'),
    ('DIS-ESPACIO',    'baja',    'Mobiliario urbano deteriorado'),
    ('ADM-CEMENTERIO', 'baja',    'Gestión de instalación con horario propio'),
    ('ADM-TRAMITE',    'baja',    'Gestión documental, sin componente territorial')
)
update public.categorias_caso c
   set prioridad_default_id = p.id
  from propuesta pr
  join public.prioridades p on p.codigo = pr.cod_prioridad
 where c.codigo = pr.cod_categoria
   -- No pisa lo ya decidido: si alguien ajustó una prioridad desde la
   -- administración, esta migración la respeta.
   and c.prioridad_default_id is null;

-- ----------------------------------------------------------------------------
-- 2. Red de seguridad para categorías nuevas o no contempladas
-- ----------------------------------------------------------------------------
-- Cualquier categoría activa que siga sin prioridad queda en "media". Es
-- preferible un valor explícito y revisable a un NULL que obliga al trigger de
-- v24 a adivinar en cada alta.
update public.categorias_caso c
   set prioridad_default_id = (select id from public.prioridades where codigo = 'media')
 where c.activo
   and c.prioridad_default_id is null;

-- ----------------------------------------------------------------------------
-- 3. Verificación
-- ----------------------------------------------------------------------------
do $$
declare
    v_sin      int;
    v_resumen  text;
begin
    select count(*) into v_sin
      from public.categorias_caso
     where activo and prioridad_default_id is null;

    if v_sin > 0 then
        raise exception 'v25 incompleta: quedan % categorías activas sin prioridad.', v_sin;
    end if;

    select string_agg(linea, E'\n' order by linea)
      into v_resumen
      from (
        select '    ' || p.nombre || ' (' || p.tiempo_objetivo_horas || ' h): ' || count(*) || ' categorías' as linea
          from public.categorias_caso c
          join public.prioridades p on p.id = c.prioridad_default_id
         where c.activo
         group by p.nombre, p.nivel, p.tiempo_objetivo_horas
      ) t;

    raise notice E'v25 OK — reparto de prioridades:\n%', v_resumen;
end;
$$;

commit;

-- ============================================================================
-- COMPROBACIÓN MANUAL
--
-- 1) Cómo quedó cada categoría:
--
--    select c.codigo, c.nombre, p.nombre as prioridad, p.tiempo_objetivo_horas as horas
--      from public.categorias_caso c
--      left join public.prioridades p on p.id = c.prioridad_default_id
--     where c.activo
--     order by p.nivel, c.codigo;
--
-- 2) Para cambiar una (es lo esperable tras revisarlo con las direcciones):
--
--    update public.categorias_caso
--       set prioridad_default_id = (select id from public.prioridades where codigo = 'alta')
--     where codigo = 'VIA-ACERA';
--
-- 3) Los casos YA creados conservan su prioridad. Si tras validar el mapeo se
--    quisiera realinear los casos ABIERTOS —nunca los cerrados, que son
--    histórico— sería algo como:
--
--    update public.casos c
--       set prioridad_id = cc.prioridad_default_id
--      from public.categorias_caso cc
--     where cc.id = c.categoria_id
--       and c.fecha_cierre is null
--       and c.deleted_at is null;
--
--    No se ejecuta aquí: cambia el reloj de vencimiento de casos vivos y esa
--    es una decisión de operación, no de migración.
-- ============================================================================
