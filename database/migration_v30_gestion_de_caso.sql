-- ============================================================================
-- MIGRACIÓN v30 · GESTIONAR EL CASO DESDE EL CENTRO DE MONITOREO
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PARA QUÉ
--
-- El flujo terminaba en un callejón: el empleado levanta el caso en territorio,
-- aparece en el mapa en vivo al instante, y en la consola no se podía hacer
-- NADA con él. `vista-denuncias.js` tenía 218 líneas y cero escrituras;
-- `casos.cuadrilla_responsable_id` existe desde schema.sql y jamás se escribía.
--
-- Esta migración aporta las dos operaciones que faltaban:
--
--     asignar_caso(...)         quién responde: persona y/o cuadrilla
--     cambiar_estado_caso(...)  mover el caso por el flujo de su categoría
--
-- ----------------------------------------------------------------------------
-- POR QUÉ SON RPC Y NO UN `update` DIRECTO DESDE EL NAVEGADOR
--
-- Dos razones, y ninguna es de comodidad:
--
--   1. EL ESTADO DEBE PERTENECER AL FLUJO DE SU CATEGORÍA. Cada categoría
--      declara el suyo en `categorias_caso.estados_flujo`, y `casos.estado_codigo`
--      es texto libre, no una FK. Una policy de UPDATE no puede expresar «el
--      valor nuevo tiene que estar en un JSONB de otra tabla». Sin esta
--      validación se repite exactamente el defecto que corrigió la v29, solo
--      que por la puerta de delante.
--
--   2. EL CAMBIO Y SU BITÁCORA SON UNA SOLA COSA. `historial_estados_caso` es
--      la trazabilidad del caso. Si el UPDATE y el INSERT van en dos peticiones
--      desde el navegador, una caída de red entre ambas deja un caso que cambió
--      de estado sin que conste quién lo cambió. Aquí ocurren en la misma
--      transacción o no ocurren.
--
-- SOBRE `SECURITY DEFINER`
--   Necesario para leer el caso y su categoría antes de decidir, igual que en
--   `crear_caso_campo` (v18/v21) y `cerrar_caso_campo` (v20). Como se salta la
--   RLS, la autorización se comprueba de forma explícita con el MISMO criterio
--   que la policy `casos_update` de la v16. Está factorizada en
--   `fn_puede_gestionar_caso` para que las dos funciones no puedan divergir.
--
-- REQUIERE: schema.sql, v9, v10, v14, v16, v29.
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Ayudantes de flujo
--
--    Se valida la PERTENENCIA al flujo, no la ADYACENCIA. `estados_flujo` es un
--    array, no un grafo: no declara qué transiciones son legítimas. Exigir que
--    el estado destino sea el siguiente de la lista impediría cosas correctas y
--    frecuentes, como rechazar un caso que está en 'pendiente' sin pasar por
--    'en_revision' y 'en_obra'. Si algún día se necesitan transiciones
--    restringidas, el sitio es el propio JSONB, no este código.
-- ----------------------------------------------------------------------------
create or replace function public.fn_estado_en_flujo(p_categoria_id bigint, p_estado text)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.categorias_caso c,
               lateral jsonb_array_elements(
                   case when jsonb_typeof(c.estados_flujo) = 'array'
                        then c.estados_flujo else '[]'::jsonb end
               ) e
         where c.id = p_categoria_id
           and e ->> 'id' = p_estado
    );
$$;

comment on function public.fn_estado_en_flujo(bigint, text) is
    'True si el estado pertenece al flujo declarado por la categoría.';

create or replace function public.fn_estado_es_final(p_categoria_id bigint, p_estado text)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = public
as $$
    select coalesce(bool_or((e ->> 'es_final')::boolean), false)
      from public.categorias_caso c,
           lateral jsonb_array_elements(
               case when jsonb_typeof(c.estados_flujo) = 'array'
                    then c.estados_flujo else '[]'::jsonb end
           ) e
     where c.id = p_categoria_id
       and e ->> 'id' = p_estado;
$$;

comment on function public.fn_estado_es_final(bigint, text) is
    'True si el estado cierra el caso según el flujo de su categoría.';

-- ----------------------------------------------------------------------------
-- 2. Autorización, con el mismo criterio que la policy `casos_update` (v16)
--
--    Se lee el caso otra vez en lugar de recibir sus columnas por parámetro: es
--    una fila por llamada, indexada por clave primaria, y a cambio no hay forma
--    de que quien llame se equivoque al pasar los datos y se autorice de más.
-- ----------------------------------------------------------------------------
create or replace function public.fn_puede_gestionar_caso(p_caso_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_caso public.casos%rowtype;
begin
    select * into v_caso from public.casos where id = p_caso_id and deleted_at is null;
    if not found then return false; end if;

    if coalesce(public.auth_ve_todo_el_municipio(), false) then return true; end if;

    -- Sin permiso de edición sobre el módulo, ninguna de las vías siguientes
    -- aplica. Es la misma puerta que abre la policy.
    if not coalesce(public.auth_tiene_permiso('casos', 'editar'), false) then
        return false;
    end if;

    -- Vía 1: está asignado a quien lo pide, o a una cuadrilla suya.
    if coalesce(public.auth_incluye_asignados_a_mi(), false)
       and (
            v_caso.usuario_responsable_id = auth.uid()
            or v_caso.cuadrilla_responsable_id
               = any (coalesce(public.auth_cuadrillas_del_usuario(), '{}')::bigint[])
       ) then
        return true;
    end if;

    -- Vía 2: entra dentro del alcance territorial / organizacional del rol.
    if public.auth_alcance_combinador() = 'and' then
        return v_caso.distrito_id
                 = any (coalesce(public.auth_distritos_visibles(), '{}')::smallint[])
           and (
                v_caso.departamento_actual_id
                  = any (coalesce(public.auth_departamentos_visibles(), '{}')::bigint[])
             or v_caso.categoria_id
                  = any (coalesce(public.auth_categorias_visibles(), '{}')::bigint[])
           );
    end if;

    return v_caso.distrito_id
             = any (coalesce(public.auth_distritos_visibles(), '{}')::smallint[])
        or v_caso.departamento_actual_id
             = any (coalesce(public.auth_departamentos_visibles(), '{}')::bigint[])
        or v_caso.categoria_id
             = any (coalesce(public.auth_categorias_visibles(), '{}')::bigint[]);
end;
$$;

comment on function public.fn_puede_gestionar_caso(bigint) is
    'Réplica del criterio de la policy casos_update, para las RPC SECURITY '
    'DEFINER que se saltan la RLS. Si cambia la policy, cambia esto.';

-- ----------------------------------------------------------------------------
-- 3. asignar_caso — quién responde por el caso
--
--    CONVENIO DE LOS PARÁMETROS: los dos destinatarios se fijan de forma
--    EXPLÍCITA. `null` no significa «déjalo como está», significa «desasignar».
--    El panel de gestión muestra ambos selectores a la vez y envía ambos, así
--    que la lectura es la que se ve en pantalla. Un convenio de «null = no
--    tocar» habría hecho imposible desasignar.
--
--    No se cambia el estado. Asignar y mover el caso por su flujo son dos
--    decisiones distintas y quedan en dos entradas separadas de la bitácora;
--    mezclarlas haría ilegible el historial. La interfaz puede encadenarlas.
-- ----------------------------------------------------------------------------
drop function if exists public.asignar_caso(bigint, uuid, bigint, text);

create or replace function public.asignar_caso(
    p_caso_id      bigint,
    p_usuario_id   uuid    default null,
    p_cuadrilla_id bigint  default null,
    p_observacion  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor        uuid := auth.uid();
    v_caso         public.casos%rowtype;
    v_nombre_pers  text;
    v_nombre_cuad  text;
    v_tenia        boolean;
    v_tiene        boolean;
    v_detalle      text;
begin
    if v_actor is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.' using errcode = '28000';
    end if;

    select * into v_caso from public.casos where id = p_caso_id and deleted_at is null;
    if not found then
        raise exception 'El caso no existe o fue eliminado.' using errcode = '23503';
    end if;

    if not public.fn_puede_gestionar_caso(p_caso_id) then
        raise exception 'Tu rol no permite gestionar este caso.' using errcode = '42501';
    end if;

    -- ── Validación de los destinatarios ──────────────────────────────────
    if p_usuario_id is not null then
        select nullif(trim(concat_ws(' ', u.nombres, u.apellidos)), '')
          into v_nombre_pers
          from public.usuarios u
         where u.id = p_usuario_id and u.activo;
        if v_nombre_pers is null then
            raise exception 'La persona indicada no existe o está dada de baja.'
                using errcode = '23503';
        end if;
    end if;

    if p_cuadrilla_id is not null then
        select c.nombre into v_nombre_cuad
          from public.cuadrillas c
         where c.id = p_cuadrilla_id and c.activo;
        if v_nombre_cuad is null then
            -- Una cuadrilla desactivada no se ofrece para asignar; si llega
            -- aquí es por una pantalla con datos viejos.
            raise exception 'La cuadrilla indicada no existe o está desactivada.'
                using errcode = '23503';
        end if;
    end if;

    v_tenia := v_caso.usuario_responsable_id is not null
            or v_caso.cuadrilla_responsable_id is not null;
    v_tiene := p_usuario_id is not null or p_cuadrilla_id is not null;

    -- Nada que hacer. Se responde en vez de escribir una entrada de bitácora
    -- que diría que no cambió nada: el doble clic no debe ensuciar el historial.
    if v_caso.usuario_responsable_id is not distinct from p_usuario_id
       and v_caso.cuadrilla_responsable_id is not distinct from p_cuadrilla_id then
        return jsonb_build_object(
            'ok', true, 'caso_id', p_caso_id, 'sin_cambio', true,
            'mensaje', 'El caso ya estaba asignado así.'
        );
    end if;

    update public.casos
       set usuario_responsable_id   = p_usuario_id,
           cuadrilla_responsable_id = p_cuadrilla_id,
           -- Marca cuándo empezó a haber alguien respondiendo. Se limpia al
           -- desasignar para que no quede una fecha que ya no significa nada.
           fecha_asignado = case
               when not v_tiene then null
               when not v_tenia then now()
               else coalesce(v_caso.fecha_asignado, now())
           end
     where id = p_caso_id;

    -- ── Trazabilidad ─────────────────────────────────────────────────────
    -- La asignación no cambia el estado, así que anterior y nuevo coinciden.
    -- Se registra igual: `historial_estados_caso` es la bitácora del caso, y
    -- «quién pasó a responder por esto y cuándo» pertenece a ella.
    v_detalle := case
        when not v_tiene then 'Asignación retirada'
        else 'Asignado a ' || concat_ws(' · ', v_nombre_pers, v_nombre_cuad)
    end;

    insert into public.historial_estados_caso (
        caso_id, estado_codigo_anterior, estado_codigo_nuevo,
        cambiado_por_usuario_id, observacion
    ) values (
        p_caso_id, v_caso.estado_codigo, v_caso.estado_codigo, v_actor,
        v_detalle || coalesce('. ' || nullif(trim(p_observacion), ''), '')
    );

    return jsonb_build_object(
        'ok', true,
        'caso_id', p_caso_id,
        'correlativo', v_caso.correlativo,
        'sin_cambio', false,
        'usuario_responsable_id', p_usuario_id,
        'cuadrilla_responsable_id', p_cuadrilla_id,
        'mensaje', v_detalle || '.'
    );
end;
$$;

comment on function public.asignar_caso(bigint, uuid, bigint, text) is
    'Fija responsable y/o cuadrilla de un caso. null DESASIGNA, no "deja igual". '
    'Registra la decisión en historial_estados_caso sin alterar el estado.';

grant execute on function public.asignar_caso(bigint, uuid, bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. cambiar_estado_caso — mover el caso por su flujo
-- ----------------------------------------------------------------------------
drop function if exists public.cambiar_estado_caso(bigint, text, text, text);

create or replace function public.cambiar_estado_caso(
    p_caso_id       bigint,
    p_estado_codigo text,
    p_observacion   text default null,
    p_resolucion    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor     uuid := auth.uid();
    v_caso      public.casos%rowtype;
    v_estado    text := nullif(trim(p_estado_codigo), '');
    v_es_final  boolean;
    v_era_final boolean;
begin
    if v_actor is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.' using errcode = '28000';
    end if;
    if v_estado is null then
        raise exception 'Falta indicar el estado destino.' using errcode = '23502';
    end if;

    select * into v_caso from public.casos where id = p_caso_id and deleted_at is null;
    if not found then
        raise exception 'El caso no existe o fue eliminado.' using errcode = '23503';
    end if;

    if not public.fn_puede_gestionar_caso(p_caso_id) then
        raise exception 'Tu rol no permite gestionar este caso.' using errcode = '42501';
    end if;

    -- ── El estado tiene que existir en el flujo de SU categoría ──────────
    if not public.fn_estado_en_flujo(v_caso.categoria_id, v_estado) then
        raise exception
            'El estado "%" no pertenece al flujo de la categoría de este caso.', v_estado
            using errcode = '23514';
    end if;

    -- Idempotente: repetir el mismo estado no genera una entrada de bitácora.
    if v_caso.estado_codigo = v_estado then
        return jsonb_build_object(
            'ok', true, 'caso_id', p_caso_id, 'sin_cambio', true,
            'estado', v_estado, 'mensaje', 'El caso ya estaba en ese estado.'
        );
    end if;

    v_es_final  := public.fn_estado_es_final(v_caso.categoria_id, v_estado);
    v_era_final := public.fn_estado_es_final(v_caso.categoria_id, v_caso.estado_codigo);

    -- ── Cerrar exige decir cómo se resolvió ──────────────────────────────
    -- Un caso cerrado sin resolución es un caso que nadie puede auditar: seis
    -- meses después no hay forma de saber qué se hizo. Se acepta la que ya
    -- tuviera el caso si viene de un cierre previo reabierto.
    if v_es_final
       and coalesce(nullif(trim(p_resolucion), ''), nullif(trim(v_caso.resolucion), '')) is null then
        raise exception
            'Para cerrar el caso hay que registrar cómo se resolvió.'
            using errcode = '23502';
    end if;

    update public.casos
       set estado_codigo = v_estado,
           resolucion = case
               when nullif(trim(p_resolucion), '') is not null then trim(p_resolucion)
               else resolucion
           end,
           -- Reabrir limpia la fecha de cierre: dejarla puesta haría que el
           -- indicador de tiempo medio de cierre contara un caso todavía abierto.
           fecha_cierre = case
               when v_es_final then now()
               when v_era_final then null
               else fecha_cierre
           end
     where id = p_caso_id;

    insert into public.historial_estados_caso (
        caso_id, estado_codigo_anterior, estado_codigo_nuevo,
        cambiado_por_usuario_id, observacion
    ) values (
        p_caso_id, v_caso.estado_codigo, v_estado, v_actor,
        coalesce(
            nullif(trim(p_observacion), ''),
            case when v_era_final and not v_es_final
                 then 'Caso reabierto desde el Centro de Monitoreo'
                 else 'Cambio de estado desde el Centro de Monitoreo' end
        )
    );

    return jsonb_build_object(
        'ok', true,
        'caso_id', p_caso_id,
        'correlativo', v_caso.correlativo,
        'sin_cambio', false,
        'estado_anterior', v_caso.estado_codigo,
        'estado', v_estado,
        'es_final', v_es_final,
        'reabierto', v_era_final and not v_es_final,
        'mensaje', 'Estado actualizado.'
    );
end;
$$;

comment on function public.cambiar_estado_caso(bigint, text, text, text) is
    'Mueve un caso a otro estado de su flujo, validando pertenencia (no '
    'adyacencia) y registrando la bitácora en la misma transacción.';

grant execute on function public.cambiar_estado_caso(bigint, text, text, text) to authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) Las cuatro funciones existen y están concedidas.
-- select p.proname,
--        pg_get_function_identity_arguments(p.oid) as argumentos,
--        has_function_privilege('authenticated', p.oid, 'execute') as puede_authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('asignar_caso','cambiar_estado_caso',
--                      'fn_estado_en_flujo','fn_estado_es_final','fn_puede_gestionar_caso')
--  order by 1;
--    → 5 filas; asignar_caso y cambiar_estado_caso con puede_authenticated = true

-- 2) NINGUNA sobrecarga duplicada. Añadir un parámetro a una función crea una
--    sobrecarga en lugar de reemplazarla, y PostgREST elige entre ellas de forma
--    impredecible. Por eso arriba hay un `drop function` antes de cada `create`.
-- select proname, count(*)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and proname in ('asignar_caso','cambiar_estado_caso')
--  group by 1;
--    → 1 cada una

-- 3) El flujo se valida de verdad. Sustituye <ID> por un caso real:
-- select public.cambiar_estado_caso(<ID>, 'inventado');
--    → ERROR 23514: El estado "inventado" no pertenece al flujo…

-- 4) Cerrar sin resolución se rechaza:
-- select public.cambiar_estado_caso(<ID>, 'resuelta');
--    → ERROR 23502: Para cerrar el caso hay que registrar cómo se resolvió.

-- ⚠ Las pruebas 3 y 4 fallarán con «Sesión no válida» si se ejecutan desde el
--   editor SQL de Supabase: ahí no hay `auth.uid()`. Es la función defendiéndose
--   correctamente. Estas dos rutas se prueban desde la aplicación, con sesión.
