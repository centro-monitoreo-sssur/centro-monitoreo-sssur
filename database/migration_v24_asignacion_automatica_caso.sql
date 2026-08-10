-- ============================================================================
-- MIGRACIÓN v24 — Resolver departamento y prioridad al dar de alta un caso
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PROBLEMA
--
--   POST /rest/v1/rpc/crear_caso_campo → 400 (Bad Request)
--   "El departamento <NULL> ya no está vigente; no se le puede asignar el caso."
--
-- El mensaje despista: no hay ningún departamento dado de baja. Lo que ocurre
-- es que `casos.departamento_actual_id` llega NULL, el trigger
-- `trg_caso_departamento_vigente` (v8) lo busca en `departamentos`, no encuentra
-- fila, y `%` imprime NULL.
--
-- La causa real: `crear_caso_campo` NO inserta dos columnas obligatorias.
--
--   Columnas NOT NULL sin default en `casos`:
--     categoria_id · distrito_id · canal_reporte_id ·
--     departamento_actual_id · prioridad_id · titulo · descripcion ·
--     direccion_referencia
--
--   Columnas que el RPC inserta (v21):
--     categoria_id · distrito_id · canal_reporte_id · creado_por_usuario_id ·
--     titulo · descripcion · direccion_referencia · ubicacion ·
--     fecha_recibido · referencia_cliente · denunciante_*
--
-- Faltan `departamento_actual_id` y `prioridad_id`. La primera revienta en el
-- trigger; si se arreglara sola, la segunda reventaría a continuación con un
-- 23502 igual de opaco.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UN TRIGGER Y NO REESCRIBIR EL RPC
--
-- El hueco no es exclusivo del alta en campo: cualquier inserción en `casos`
-- —el portal ciudadano, una carga administrativa, un script de migración—
-- tiene que resolver lo mismo, y hoy cada una tendría que acordarse por su
-- cuenta. Un trigger BEFORE INSERT lo deja resuelto en un solo sitio y no
-- obliga a reproducir las ~200 líneas del RPC, con el riesgo que eso implica
-- sobre una función que ya está en producción.
--
-- La asignación sale de la categoría, que es donde vive esa relación:
--   · `categorias_caso.departamento_responsable_id` → departamento
--   · `categorias_caso.prioridad_default_id`        → prioridad
--
-- El departamento se resuelve a través de `fn_departamento_vigente()`, de modo
-- que si el responsable fue suprimido el caso va a su sucesor en lugar de
-- fallar. Es exactamente lo que el mensaje de error venía pidiendo.
--
-- ORDEN DE DISPARO: en PostgreSQL, a igual momento (BEFORE INSERT), los
-- triggers se ejecutan en orden ALFABÉTICO por nombre. `trg_caso_completar_*`
-- va antes que `trg_caso_departamento_vigente` ('c' < 'd'), así que el hueco
-- queda relleno antes de que la guarda lo valide. No es casualidad: si se
-- renombra uno de los dos, hay que revisar que el orden se mantenga.
--
-- IDEMPOTENTE. No modifica casos existentes.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Relleno de asignación a partir de la categoría
-- ----------------------------------------------------------------------------
create or replace function public.fn_completar_asignacion_caso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cat        public.categorias_caso%rowtype;
    v_depto      bigint;
    v_prioridad  smallint;
begin
    -- Solo se rellena lo que venga vacío: si quien inserta ya decidió el
    -- departamento —una derivación, una carga administrativa— se respeta.
    if new.departamento_actual_id is not null and new.prioridad_id is not null then
        return new;
    end if;

    select * into v_cat from public.categorias_caso where id = new.categoria_id;
    if not found then
        raise exception 'La categoría % no existe.', new.categoria_id
            using errcode = '23503';
    end if;

    -- ── Departamento ────────────────────────────────────────────────────
    if new.departamento_actual_id is null then
        if v_cat.departamento_responsable_id is null then
            -- Error accionable: dice QUÉ categoría hay que corregir y DÓNDE.
            -- El mensaje anterior ("departamento <NULL> ya no está vigente")
            -- mandaba a buscar un sucesor que nunca existió.
            raise exception
                'La categoría "%" (%) no tiene departamento responsable asignado, '
                'así que el caso no puede encaminarse a ninguna unidad. '
                'Asígnalo en Administración → Departamentos o en categorias_caso.'
                'departamento_responsable_id.',
                v_cat.nombre, v_cat.codigo
                using errcode = '23502';
        end if;

        -- Sigue la cadena de sucesión: un departamento suprimido encamina el
        -- caso a quien asumió sus funciones en vez de rechazarlo.
        v_depto := public.fn_departamento_vigente(v_cat.departamento_responsable_id);
        if v_depto is null then
            raise exception
                'El departamento responsable de la categoría "%" fue suprimido y no '
                'tiene sucesor vigente. Defínelo con fn_suprimir_departamento() o '
                'reasigna la categoría.', v_cat.nombre
                using errcode = '23502';
        end if;
        new.departamento_actual_id := v_depto;
    end if;

    -- ── Prioridad ───────────────────────────────────────────────────────
    if new.prioridad_id is null then
        v_prioridad := v_cat.prioridad_default_id;

        -- Sin prioridad por defecto en la categoría se usa la de nivel medio
        -- del catálogo. Rechazar el caso por esto sería desproporcionado: la
        -- prioridad se puede corregir después; el reporte perdido, no.
        if v_prioridad is null then
            select id into v_prioridad
              from public.prioridades
             order by abs(nivel - 3), nivel
             limit 1;
        end if;

        if v_prioridad is null then
            raise exception
                'El catálogo `prioridades` está vacío. Ejecuta migration_v11.'
                using errcode = '23502';
        end if;
        new.prioridad_id := v_prioridad;
    end if;

    return new;
end;
$$;

comment on function public.fn_completar_asignacion_caso() is
    'Rellena departamento_actual_id y prioridad_id de un caso nuevo a partir de '
    'su categoría, siguiendo la cadena de sucesión de departamentos. Se ejecuta '
    'antes que trg_caso_departamento_vigente por orden alfabético de nombre.';

drop trigger if exists trg_caso_completar_asignacion on public.casos;
create trigger trg_caso_completar_asignacion
    before insert on public.casos
    for each row
    execute function public.fn_completar_asignacion_caso();

-- ----------------------------------------------------------------------------
-- 2. Diagnóstico: categorías que no podrían encaminar un caso
-- ----------------------------------------------------------------------------
-- No falla la migración —una categoría sin departamento es un dato a corregir,
-- no un impedimento para instalar la corrección— pero deja el aviso a la vista.
do $$
declare
    v_huerfanas text;
    v_total     int;
begin
    select count(*), string_agg(c.codigo || ' (' || c.nombre || ')', ', ' order by c.codigo)
      into v_total, v_huerfanas
      from public.categorias_caso c
     where c.activo
       and c.departamento_responsable_id is null;

    if v_total > 0 then
        raise warning
            'v24: % categoría(s) activas SIN departamento responsable. Un caso de '
            'esas categorías será rechazado con un mensaje claro hasta que se '
            'asignen: %', v_total, v_huerfanas;
    else
        raise notice 'v24 OK — todas las categorías activas tienen departamento responsable.';
    end if;
end;
$$;

commit;

-- ============================================================================
-- COMPROBACIÓN MANUAL
--
-- 1) Categorías sin departamento (las que harían fallar el alta):
--
--    select c.id, c.codigo, c.nombre, c.departamento_responsable_id, c.prioridad_default_id
--      from public.categorias_caso c
--     where c.activo and (c.departamento_responsable_id is null
--                         or c.prioridad_default_id is null)
--     order by c.codigo;
--
-- 2) Orden de disparo de los triggers BEFORE INSERT (el de completar debe ir
--    ANTES que el de vigencia):
--
--    select tgname from pg_trigger
--     where tgrelid = 'public.casos'::regclass and not tgisinternal
--     order by tgname;
--
-- 3) Alta de prueba desde la sesión de un empleado (no como postgres):
--
--    select public.crear_caso_campo(
--      <categoria_id>, 'Prueba', 'Descripción de prueba con más de diez caracteres',
--      13.6551, -89.1714, 'Referencia de prueba', 'campo', 'ref-test-1', null);
-- ============================================================================
