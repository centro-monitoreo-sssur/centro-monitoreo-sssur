-- ============================================================================
-- MIGRACIÓN v29 · EL ESTADO INICIAL SALE DEL FLUJO, NO DE UN LITERAL
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- SÍNTOMA
--   El Cartograma muestra a la vez «0 Denuncias activas» y «1 Fuera de plazo».
--   Los dos números son correctos por separado y la contradicción es real.
--
-- CAUSA
--   `casos.estado_codigo` se declaró con `default 'recibida'` (schema.sql:303),
--   pero 'recibida' NO EXISTE en el flujo que siembra migration_v9, que es
--   pendiente → en_revision → en_obra → resuelta → rechazada.
--
--   Existe un trigger, `trg_casos_sync_campos` (BEFORE INSERT), cuyo cometido es
--   precisamente rellenar el estado desde `categorias_caso.estado_inicial`:
--
--       if new.estado_codigo is null or new.estado_codigo = '' then
--           new.estado_codigo = coalesce(v_estado_inicial, 'recibida');
--       end if;
--
--   Nunca se ejecuta. Un DEFAULT de columna se aplica ANTES de que el trigger
--   BEFORE INSERT vea la fila, así que `new.estado_codigo` ya vale 'recibida' y
--   la condición es falsa. El respaldo estaba escrito, pero era inalcanzable.
--
--   Se confirma en `crear_caso_campo` (v21:320-338): la lista de columnas del
--   INSERT no incluye `estado_codigo`. TODO caso levantado desde territorio
--   pasa por esa ruta.
--
-- CONSECUENCIAS
--     · `pendientes` y `en_curso` no lo cuentan            → «0 activas»
--     · `fuera_de_objetivo` sí, porque solo excluye finales → «1 fuera de plazo»
--     · el badge cae al color por defecto: no hay etiqueta para 'recibida'
--     · el filtro por estado del panel de denuncias no lo alcanza nunca
--
--   Un caso reportado en campo queda invisible en los indicadores y fuera del
--   alcance de los filtros, pero contando como incumplimiento.
--
-- ----------------------------------------------------------------------------
-- QUÉ HACE ESTA MIGRACIÓN
--
--   1. Quita el DEFAULT, para que el trigger pueda hacer su trabajo.
--   2. Endurece el trigger: el respaldo deja de ser el literal 'recibida'.
--   3. Garantiza que toda categoría nazca con un flujo utilizable.
--   4. Repara los casos que ya nacieron fuera de su flujo.
--
--   Los pasos 2 y 3 no estaban en la primera versión de esta migración, y sin
--   ellos el arreglo duraba poco. Ver la justificación en cada bloque.
--
-- REQUIERE: schema.sql, migration_v9, migration_v21, migration_v26.
-- IDEMPOTENTE: se puede ejecutar más de una vez sin efectos adicionales.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Fuera el DEFAULT, para que el trigger pueda hacer su trabajo
--
--    La columna sigue siendo NOT NULL y eso no rompe nada: las restricciones
--    NOT NULL se comprueban DESPUÉS de los triggers BEFORE, así que el trigger
--    tiene su oportunidad de rellenarla.
--
--    Se arregla en el único sitio que cubre todas las rutas de inserción,
--    presentes y futuras, en lugar de parchear cada RPC.
-- ----------------------------------------------------------------------------
alter table public.casos alter column estado_codigo drop default;

comment on column public.casos.estado_codigo is
    'Estado actual según el flujo de la categoría (categorias_caso.estados_flujo). '
    'SIN valor por defecto A PROPÓSITO: lo rellena trg_casos_sync_campos desde '
    'categorias_caso.estado_inicial. Un default de columna se aplica antes que el '
    'trigger BEFORE INSERT y lo dejaría sin efecto (bug corregido en v29).';

-- ----------------------------------------------------------------------------
-- 2. El respaldo del trigger deja de ser un literal
--
--    El `coalesce(v_estado_inicial, 'recibida')` original reproducía el mismo
--    error un nivel más abajo: si una categoría no declara `estado_inicial`
--    —la columna es nullable y v26 permite a las jefaturas crear categorías—,
--    el caso volvería a nacer en 'recibida', fuera de su flujo.
--
--    La cadena de respaldo pasa a ser:
--        estado_inicial de la categoría
--          → primer estado declarado en su flujo
--            → 'pendiente'
--
--    Se reescribe la función completa porque `create or replace` la sustituye
--    entera; el resto de su lógica se conserva sin cambios.
-- ----------------------------------------------------------------------------
create or replace function public.sincronizar_campos_caso()
returns trigger language plpgsql as $$
declare
    v_departamento_id bigint;
    v_prioridad_id    smallint;
    v_estado_inicial  text;
    v_flujo           jsonb;
begin
    select c.departamento_responsable_id, c.prioridad_default_id,
           c.estado_inicial, c.estados_flujo
      into v_departamento_id, v_prioridad_id, v_estado_inicial, v_flujo
      from public.categorias_caso c
     where c.id = new.categoria_id;

    if new.departamento_actual_id is null then
        new.departamento_actual_id = v_departamento_id;
    end if;

    if new.prioridad_id is null then
        new.prioridad_id = coalesce(v_prioridad_id, 3);
    end if;

    -- El estado inicial SIEMPRE debe pertenecer al flujo de la categoría.
    if new.estado_codigo is null or new.estado_codigo = '' then
        new.estado_codigo = coalesce(
            nullif(trim(v_estado_inicial), ''),
            (select e ->> 'id'
               from jsonb_array_elements(
                        case when jsonb_typeof(v_flujo) = 'array'
                             then v_flujo else '[]'::jsonb end
                    ) with ordinality as t(e, orden)
              order by t.orden
              limit 1),
            'pendiente'
        );
    end if;

    if new.correlativo is null then
        new.correlativo = 'CASO-' || extract(year from now())::text
                         || '-' || lpad(new.id::text, 6, '0');
    end if;

    return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Toda categoría nace con un flujo utilizable
--
--    `categorias_caso.estados_flujo` tiene `default '[]'::jsonb` y
--    `estado_inicial` es nullable. La v26 habilitó a las jefaturas para crear
--    categorías: en cuanto exista la pantalla, una categoría creada sin flujo
--    produciría casos sin ningún estado válido, y el paso 2 solo podría
--    salvarlos con el respaldo genérico.
--
--    Se cierra aquí para que el arreglo no dependa de que quien cree una
--    categoría se acuerde de declarar el flujo.
--
--    Es un TRIGGER y no un DEFAULT de columna: un formulario que envíe `[]`
--    explícitamente esquivaría el default. Y en esta migración, precisamente,
--    ya sabemos cómo termina eso.
-- ----------------------------------------------------------------------------
create or replace function public.fn_categoria_flujo_por_defecto()
returns trigger language plpgsql as $$
declare
    -- El mismo flujo que siembra migration_v9 para las 17 categorías base.
    v_flujo_estandar constant jsonb := '[
      {"id":"pendiente",   "nombre":"Pendiente",   "icono":"fa-inbox",             "color":"red",     "es_final":false},
      {"id":"en_revision", "nombre":"En revisión", "icono":"fa-magnifying-glass",  "color":"blue",    "es_final":false},
      {"id":"en_obra",     "nombre":"En obra",     "icono":"fa-screwdriver-wrench","color":"amber",   "es_final":false},
      {"id":"resuelta",    "nombre":"Resuelta",    "icono":"fa-circle-check",      "color":"emerald", "es_final":true},
      {"id":"rechazada",   "nombre":"Rechazada",   "icono":"fa-circle-xmark",      "color":"gray",    "es_final":true}
    ]'::jsonb;
begin
    if new.estados_flujo is null
       or jsonb_typeof(new.estados_flujo) <> 'array'
       or jsonb_array_length(new.estados_flujo) = 0 then
        new.estados_flujo := v_flujo_estandar;
    end if;

    -- El estado inicial debe existir DENTRO del flujo. Si no se declara, o si
    -- se declara uno que el flujo no contiene, se toma el primero.
    if nullif(trim(coalesce(new.estado_inicial, '')), '') is null
       or not exists (
            select 1 from jsonb_array_elements(new.estados_flujo) e
             where e ->> 'id' = new.estado_inicial
          ) then
        new.estado_inicial := (select e ->> 'id'
                                 from jsonb_array_elements(new.estados_flujo)
                                          with ordinality as t(e, orden)
                                order by t.orden
                                limit 1);
    end if;

    return new;
end;
$$;

-- Se dispara también en UPDATE: una categoría a la que se le vacíe el flujo
-- queda tan inservible como una que nace sin él.
drop trigger if exists trg_categoria_flujo_por_defecto on public.categorias_caso;
create trigger trg_categoria_flujo_por_defecto
    before insert or update on public.categorias_caso
    for each row execute function public.fn_categoria_flujo_por_defecto();

-- Aplicar la regla a las categorías que ya existen.
--
-- ⚠ Hay que apagar `trg_categoria_enrutamiento` (v26) mientras tanto. Ese
--   trigger exige que quien edite una categoría tenga departamento asignado, y
--   lo determina con `auth.uid()`. En el editor SQL de Supabase la sesión es
--   `postgres` sin usuario autenticado: `auth.uid()` es NULL, no se le reconoce
--   el rol de gerencia, y aborta la migración con «Tu usuario no tiene
--   departamento asignado». Es el trigger haciendo bien su trabajo sobre una
--   sesión que no es la que él contempla.
--
--   El DDL en PostgreSQL es transaccional: si algo falla más abajo, el ROLLBACK
--   también revierte el `disable`. El trigger no puede quedarse apagado.
alter table public.categorias_caso disable trigger trg_categoria_enrutamiento;

-- El `where` evita reescribir las que ya están bien: sin él, este UPDATE
-- tocaría las 17 filas en cada ejecución.
update public.categorias_caso
   set estado_inicial = estado_inicial          -- el trigger hace el trabajo
 where estados_flujo is null
    or jsonb_typeof(estados_flujo) <> 'array'
    or jsonb_array_length(estados_flujo) = 0
    or nullif(trim(coalesce(estado_inicial, '')), '') is null
    or not exists (
         select 1 from jsonb_array_elements(
                        case when jsonb_typeof(estados_flujo) = 'array'
                             then estados_flujo else '[]'::jsonb end
                      ) e
          where e ->> 'id' = estado_inicial
       );

alter table public.categorias_caso enable trigger trg_categoria_enrutamiento;

-- ----------------------------------------------------------------------------
-- 4. Reparar los casos que ya nacieron fuera de su flujo
--
--    Solo se tocan los que están en un estado que NO aparece en el flujo de su
--    categoría. Un caso legítimamente en 'pendiente' o 'en_obra' no se toca.
--
--    Se excluyen las categorías sin flujo declarado: ahí no se puede saber cuál
--    sería el estado correcto, y el paso 3 ya las habrá corregido si existían.
--
--    El UPDATE y su registro en la bitácora van en una sola sentencia con CTE
--    de modificación. La primera versión de esta migración los separaba y
--    localizaba las filas tocadas con `updated_at >= now() - interval '1 minute'`:
--    esa heurística también habría capturado cualquier caso modificado por otra
--    vía en ese minuto, y anotaba 'recibida' como estado anterior sin
--    comprobarlo. Aquí el `returning` devuelve exactamente las filas corregidas
--    y su estado previo real.
-- ----------------------------------------------------------------------------
with mal_estado as (
    select c.id,
           c.estado_codigo as estado_previo,
           coalesce(
               nullif(trim(cc.estado_inicial), ''),
               (select e ->> 'id'
                  from jsonb_array_elements(cc.estados_flujo)
                           with ordinality as t(e, orden)
                 order by t.orden
                 limit 1)
           ) as estado_correcto
      from public.casos c
      join public.categorias_caso cc on cc.id = c.categoria_id
     where c.deleted_at is null
       and jsonb_typeof(cc.estados_flujo) = 'array'
       and jsonb_array_length(cc.estados_flujo) > 0
       and not exists (
             select 1 from jsonb_array_elements(cc.estados_flujo) e
              where e ->> 'id' = c.estado_codigo
           )
),
corregidos as (
    update public.casos c
       set estado_codigo = m.estado_correcto
      from mal_estado m
     where c.id = m.id
       and m.estado_correcto is not null
    returning c.id, m.estado_previo, c.estado_codigo as estado_nuevo
)
-- Deja constancia. Es un cambio de estado hecho por el sistema, y la bitácora
-- del caso no debería tener un salto sin explicar.
insert into public.historial_estados_caso
    (caso_id, estado_codigo_anterior, estado_codigo_nuevo,
     cambiado_por_usuario_id, observacion)
select id, estado_previo, estado_nuevo, null::uuid,
       format('Corrección automática (v29): el caso nació en «%s» por el default de columna, y ese estado no pertenecía al flujo de su categoría.', estado_previo)
  from corregidos;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- Ejecutar DESPUÉS del commit. Las cuatro deben cumplirse.
-- ============================================================================

-- 1) El default ya no está.
-- select column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'casos'
--    and column_name = 'estado_codigo';
--    → null

-- 2) Ningún caso fuera del flujo de su categoría.
-- select c.id, c.correlativo, c.estado_codigo, cc.nombre as categoria
--   from public.casos c
--   join public.categorias_caso cc on cc.id = c.categoria_id
--  where c.deleted_at is null
--    and not exists (select 1 from jsonb_array_elements(cc.estados_flujo) e
--                     where e ->> 'id' = c.estado_codigo);
--    → 0 filas

-- 3) Ninguna categoría sin flujo utilizable.
-- select id, codigo, estado_inicial, jsonb_array_length(estados_flujo) as estados
--   from public.categorias_caso
--  where jsonb_typeof(estados_flujo) <> 'array'
--     or jsonb_array_length(estados_flujo) = 0
--     or not exists (select 1 from jsonb_array_elements(estados_flujo) e
--                     where e ->> 'id' = estado_inicial);
--    → 0 filas

-- 4) La contradicción del Cartograma desaparece: donde hay casos fuera de
--    plazo tiene que haber al menos esa cantidad de activos.
-- select distrito_nombre, pendientes + en_curso as activas, fuera_de_objetivo
--   from public.kpis_distrito_periodo()
--  where fuera_de_objetivo > (pendientes + en_curso);
--    → 0 filas

-- ----------------------------------------------------------------------------
-- PRUEBA DE ALTA (opcional, crea un caso real — borrarlo después)
-- ----------------------------------------------------------------------------
-- select public.crear_caso_campo(
--          (select id from public.categorias_caso where codigo = 'VIA-BACHE'),
--          'Prueba de estado inicial tras la v29.',
--          'Calle principal, frente al mercado', 13.6560, -89.1830);
--
-- select correlativo, estado_codigo
--   from public.casos order by id desc limit 1;
--    → estado_codigo = 'pendiente'   (antes de la v29 salía 'recibida')
--
-- Para deshacer la prueba:
-- delete from public.casos where correlativo = '<el correlativo devuelto>';
