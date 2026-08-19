-- ============================================================================
-- MIGRACIÓN v41 · UN CASO MAL CLASIFICADO SE PUEDE MOVER
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `casos_derivaciones` y su trigger `aplicar_derivacion_caso` existen desde el
-- schema original. **Nadie ha insertado nunca una fila.** No hay RPC ni
-- interfaz: en todo el frontend no aparece la palabra derivar.
--
-- Mientras el Centro clasificaba cada caso al crearlo, se notaba poco. Ahora la
-- categoría la elige el vecino desde el portal, y el vecino no conoce el
-- organigrama: un hundimiento reportado como «bache» entra en Obras y ahí se
-- queda. Con la regla de la v40 —atiende el departamento dueño de la
-- categoría— eso significa que el caso aterriza en la bandeja de una unidad que
-- no puede resolverlo y tampoco pasárselo a nadie.
--
-- ----------------------------------------------------------------------------
-- QUIÉN PUEDE DERIVAR
--
-- Se reutiliza `fn_puede_gestionar_caso()` de la v30 sin añadir un permiso
-- nuevo. En la práctica eso significa gerencia, y la jefatura que tiene el caso
-- ahora mismo.
--
-- Que la jefatura receptora pueda sacarlo es deliberado: es la única que sabe
-- que no es suyo, y obligar a que cada error de clasificación suba a gerencia
-- garantiza que los casos se pudran esperando. Lo que se exige a cambio es un
-- MOTIVO escrito, que queda en la derivación y en la bitácora del caso.
--
-- ----------------------------------------------------------------------------
-- EL PARTIDO DE PING-PONG
--
-- El riesgo evidente: dos unidades devolviéndose el caso. No se prohíbe —a
-- veces la tercera unidad es la correcta— pero a partir de la cuarta derivación
-- solo puede moverlo quien ve todo el municipio. Un caso que ya rebotó tres
-- veces no es un problema de clasificación, es una disputa de competencias, y
-- eso lo resuelve gerencia, no otro reenvío.
--
-- ----------------------------------------------------------------------------
-- LA ASIGNACIÓN NO VIAJA CON EL CASO
--
-- Al cambiar de unidad se limpian responsable y cuadrilla. La persona asignada
-- pertenecía al departamento anterior y ya no está trabajando en él; dejarla
-- puesta haría que el caso figure atendido cuando no lo está, y en los
-- indicadores cuenta como intervención en marcha. Se dice en la bitácora para
-- que nadie crea que se perdió el dato.
--
-- ----------------------------------------------------------------------------
-- REQUISITOS: schema (tabla y trigger), v14 (policies), v30
-- (`fn_puede_gestionar_caso`), v40 (avisos con departamento). Idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Motivo obligatorio en la tabla, no solo en el RPC
--
--    La columna nació opcional. Una derivación sin motivo es exactamente lo que
--    convierte el historial en una lista de rebotes sin responsable, y el
--    editor SQL es una vía de entrada tan real como el RPC.
--
--    `not valid` para no recorrer lo ya existente —que no hay nada, pero la
--    migración no puede darlo por hecho— y se valida a continuación.
-- ----------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.casos_derivaciones'::regclass
           and conname  = 'ck_derivacion_motivo'
    ) then
        alter table public.casos_derivaciones
            add constraint ck_derivacion_motivo
            check (motivo is not null and char_length(btrim(motivo)) >= 10) not valid;

        alter table public.casos_derivaciones validate constraint ck_derivacion_motivo;
    end if;

    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.casos_derivaciones'::regclass
           and conname  = 'ck_derivacion_distinta'
    ) then
        alter table public.casos_derivaciones
            add constraint ck_derivacion_distinta
            check (departamento_origen_id is distinct from departamento_destino_id) not valid;

        alter table public.casos_derivaciones validate constraint ck_derivacion_distinta;
    end if;
end $$;

create index if not exists ix_derivaciones_caso
    on public.casos_derivaciones (caso_id, created_at desc);

comment on column public.casos_derivaciones.motivo is
    'Por qué se movió el caso. Obligatorio desde la v41: sin motivo, el '
    'historial de derivaciones es una lista de rebotes sin responsable.';

-- ----------------------------------------------------------------------------
-- 2. Derivar
-- ----------------------------------------------------------------------------
create or replace function public.derivar_caso(
    p_caso_id                bigint,
    p_departamento_destino_id bigint,
    p_motivo                 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    -- A partir de aquí solo gerencia puede seguir moviéndolo. Ver el
    -- encabezado: tres rebotes ya no son un error de clasificación.
    c_tope_rebotes constant integer := 3;

    v_actor       uuid := auth.uid();
    v_caso        public.casos%rowtype;
    v_destino     public.departamentos%rowtype;
    v_origen_txt  text;
    v_rebotes     integer;
    v_tenia_quien boolean;
begin
    if v_actor is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.' using errcode = '28000';
    end if;

    if p_motivo is null or char_length(btrim(p_motivo)) < 10 then
        raise exception 'Explica en pocas palabras por qué no corresponde a esta unidad (mínimo 10 caracteres).'
            using errcode = '23514';
    end if;

    select * into v_caso from public.casos where id = p_caso_id and deleted_at is null;
    if not found then
        raise exception 'El caso no existe o fue eliminado.' using errcode = '23503';
    end if;

    if not public.fn_puede_gestionar_caso(p_caso_id) then
        raise exception 'Tu rol no permite gestionar este caso.' using errcode = '42501';
    end if;

    select * into v_destino
      from public.departamentos where id = p_departamento_destino_id and activo;
    if not found then
        raise exception 'La unidad de destino no existe o está desactivada.'
            using errcode = '23503';
    end if;

    if v_caso.departamento_actual_id is not distinct from p_departamento_destino_id then
        raise exception 'El caso ya está en esa unidad.' using errcode = '23514';
    end if;

    -- ── Freno al ping-pong ────────────────────────────────────────────────
    select count(*) into v_rebotes
      from public.casos_derivaciones where caso_id = p_caso_id;

    if v_rebotes >= c_tope_rebotes
       and not coalesce(public.auth_ve_todo_el_municipio(), false) then
        raise exception
            'Este caso ya se derivó % veces. A partir de aquí solo puede moverlo '
            'la gerencia: escala el conflicto de competencias en vez de reenviarlo.', v_rebotes
            using errcode = '42501';
    end if;

    select nombre into v_origen_txt
      from public.departamentos where id = v_caso.departamento_actual_id;

    -- ── La derivación. El trigger `trg_derivaciones_caso` mueve el caso ───
    insert into public.casos_derivaciones (
        caso_id, departamento_origen_id, departamento_destino_id,
        derivado_por_usuario_id, motivo
    ) values (
        p_caso_id, v_caso.departamento_actual_id, p_departamento_destino_id,
        v_actor, btrim(p_motivo)
    );

    -- ── La asignación se queda en la unidad anterior ──────────────────────
    v_tenia_quien := v_caso.usuario_responsable_id is not null
                  or v_caso.cuadrilla_responsable_id is not null;

    if v_tenia_quien then
        update public.casos
           set usuario_responsable_id   = null,
               cuadrilla_responsable_id = null,
               updated_at               = now()
         where id = p_caso_id;
    end if;

    -- ── Bitácora del caso ─────────────────────────────────────────────────
    -- El ESTADO no cambia: se repite el actual en las dos columnas para no
    -- inventar una transición que no ocurrió. Lo que se registra es el
    -- movimiento, en la observación.
    insert into public.historial_estados_caso (
        caso_id, estado_codigo_anterior, estado_codigo_nuevo,
        cambiado_por_usuario_id, observacion
    ) values (
        p_caso_id, v_caso.estado_codigo, v_caso.estado_codigo, v_actor,
        'Derivado de ' || coalesce(v_origen_txt, 'sin unidad')
            || ' a ' || v_destino.nombre || '. Motivo: ' || btrim(p_motivo)
            || case when v_tenia_quien
                    then ' (se retiró la asignación anterior).' else '' end
    );

    -- ── Aviso a la unidad que lo recibe ───────────────────────────────────
    -- Mismo mecanismo que la v40. Sin esto, el caso aparece en su lista sin que
    -- nadie sepa cuándo llegó ni por qué, que es el problema que la v40 vino a
    -- resolver para las denuncias nuevas.
    begin
        insert into public.notificaciones (
            titulo, mensaje, tipo, prioridad, origen,
            usuario_id, departamento_id, distrito_id, datos
        ) values (
            'Caso derivado a tu unidad',
            coalesce(v_caso.correlativo, 'Caso ' || p_caso_id::text)
                || ' · viene de ' || coalesce(v_origen_txt, 'sin unidad')
                || ' · ' || btrim(p_motivo),
            'advertencia',
            'alta',
            'derivacion',
            null,
            p_departamento_destino_id,
            v_caso.distrito_id,
            jsonb_build_object(
                'caso_id',      p_caso_id,
                'correlativo',  v_caso.correlativo,
                'origen_id',    v_caso.departamento_actual_id,
                'destino_id',   p_departamento_destino_id,
                'motivo',       btrim(p_motivo)
            )
        );
    exception when others then
        -- La lección de la v37 y la v38: el aviso nunca deshace la operación.
        raise warning 'No se pudo avisar de la derivación del caso %: %',
            coalesce(v_caso.correlativo, p_caso_id::text), sqlerrm;
    end;

    return jsonb_build_object(
        'ok', true,
        'caso_id', p_caso_id,
        'correlativo', v_caso.correlativo,
        'destino', v_destino.nombre,
        'derivaciones', v_rebotes + 1,
        'asignacion_retirada', v_tenia_quien,
        'mensaje', 'Caso derivado a ' || v_destino.nombre || '.'
    );
end;
$$;

comment on function public.derivar_caso(bigint, bigint, text) is
    'Mueve un caso a otra unidad. Exige motivo, retira la asignación —que '
    'pertenecía a la unidad anterior—, escribe en la bitácora del caso y avisa '
    'al destino. A partir de la cuarta derivación solo gerencia puede seguir '
    'moviéndolo (v41).';

grant execute on function public.derivar_caso(bigint, bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. El historial de derivaciones se puede leer
--
--    La policy `derivaciones_select` de la v14 ya hereda el alcance de `casos`,
--    así que no hace falta tocarla. Lo que faltaba era una vista que resuelva
--    los nombres: sin ella el panel mostraría ids de departamento.
--
--    `security_invoker = on` — regla del proyecto para toda vista sobre `casos`.
--    Olvidarlo no da error: filtra por el dueño de la vista y filtra datos entre
--    departamentos en silencio.
-- ----------------------------------------------------------------------------
create or replace view public.v_derivaciones_caso
with (security_invoker = on) as
select d.id,
       d.caso_id,
       d.created_at,
       d.motivo,
       d.departamento_origen_id,
       o.nombre as departamento_origen,
       d.departamento_destino_id,
       t.nombre as departamento_destino,
       d.derivado_por_usuario_id,
       nullif(btrim(concat_ws(' ', u.nombres, u.apellidos)), '') as derivado_por
  from public.casos_derivaciones d
  left join public.departamentos o on o.id = d.departamento_origen_id
  left join public.departamentos t on t.id = d.departamento_destino_id
  left join public.usuarios      u on u.id = d.derivado_por_usuario_id;

comment on view public.v_derivaciones_caso is
    'Historial de derivaciones con nombres resueltos. Hereda el alcance de '
    '`casos` por la policy de la v14 y `security_invoker` (v41).';

grant select on public.v_derivaciones_caso to authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Restricciones y vista:
--
-- select conname, convalidated from pg_constraint
--  where conrelid = 'public.casos_derivaciones'::regclass
--    and conname like 'ck_derivacion%';
--
-- select table_name from information_schema.views
--  where table_schema='public' and table_name='v_derivaciones_caso';
--
-- 2) El motivo es obligatorio. Debe FALLAR:
--
-- select public.derivar_caso(9, 1, 'corto');
--
-- 3) Derivación real. Sustituye el id de caso y el de destino:
--
-- select id, nombre from public.departamentos where activo order by nombre;
-- select id, correlativo, departamento_actual_id, usuario_responsable_id
--   from public.casos where id = 9;
--
-- select public.derivar_caso(9, <ID_DESTINO>,
--        'Es un hundimiento de la vía, no un bache: corresponde a otra unidad.');
--
--    Después, comprobar los cuatro efectos:
--
-- select departamento_actual_id, usuario_responsable_id, cuadrilla_responsable_id
--   from public.casos where id = 9;                    -- movido y sin asignar
-- select * from public.v_derivaciones_caso where caso_id = 9;
-- select observacion from public.historial_estados_caso
--  where caso_id = 9 order by created_at desc limit 1;
-- select titulo, departamento_id from public.notificaciones
--  order by created_at desc limit 1;                   -- avisa al destino
--
-- 4) El freno al ping-pong: deriva el mismo caso cuatro veces con una cuenta de
--    jefatura. La cuarta debe rechazarse con el mensaje de escalar a gerencia,
--    y con una cuenta admin debe pasar.
-- ============================================================================
