-- ============================================================================
-- MIGRACIÓN v20 · CIERRE DE UN CASO DESDE TERRITORIO
--
-- PARA QUÉ
--   Cierra el ciclo que abrió la v18. Un empleado que resuelve una intervención
--   tiene que poder darla por terminada desde el teléfono, con su descripción de
--   resolución y su evidencia fotográfica.
--
--   La versión anterior hacía un `update` suelto desde el navegador con
--   `estado_codigo: 'resuelta'` fijo y no escribía historial. Tres problemas:
--
--     1. NO ERA ATÓMICO. Estado, fecha de cierre e historial son tres
--        escrituras. Si fallaba la última, el caso quedaba cerrado sin rastro
--        de quién ni cuándo — justo lo que una bitácora de auditoría existe
--        para impedir.
--     2. EL ESTADO ESTABA FIJO. Cada categoría define su propio flujo en
--        `categorias_caso.estados_flujo`; 'resuelta' no tiene por qué ser el
--        estado final de todas.
--     3. NO VALIDABA LA TRANSICIÓN. Se podía "cerrar" un caso ya cerrado y
--        sobrescribir la resolución y la fecha originales.
--
-- IDEMPOTENCIA
--   Igual que en la v18, un caso ya cerrado no es un error: es un reintento del
--   buzón offline. Se responde `ya_cerrado: true` con los datos del cierre
--   original, sin tocar nada.
--
-- REQUIERE: migration_v18. IDEMPOTENTE.
-- ============================================================================

begin;

create or replace function public.cerrar_caso_campo(
    p_caso_id            bigint,
    p_resolucion         text,
    p_observaciones      text    default null,
    p_estado_codigo      text    default null,   -- null = el primer estado final del flujo
    p_adjuntos           jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
-- SECURITY DEFINER por el mismo motivo que `crear_caso_campo`: hace falta leer
-- el caso y su categoría para decidir el estado final, y un empleado con
-- alcance `solo_asignados` no siempre pasa `casos_select` sobre la fila que va
-- a cerrar. La autorización se comprueba abajo, de forma explícita.
security definer
set search_path = public
as $$
declare
    v_usuario_id  uuid := auth.uid();
    v_caso        public.casos%rowtype;
    v_flujo       jsonb;
    v_estado      text;
    v_es_final    boolean;
    v_adjunto     jsonb;
    v_puede       boolean;
begin
    -- ── Identidad ────────────────────────────────────────────────────────
    if v_usuario_id is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.' using errcode = '28000';
    end if;

    select * into v_caso from public.casos where id = p_caso_id and deleted_at is null;
    if not found then
        raise exception 'El caso no existe o fue eliminado.' using errcode = '23503';
    end if;

    -- ── Autorización ─────────────────────────────────────────────────────
    -- Mismo criterio que la policy `casos_update`: o es tuyo, o tienes permiso
    -- de edición sobre el módulo. Se calcula aquí porque SECURITY DEFINER se
    -- salta la policy.
    v_puede :=
        v_caso.usuario_responsable_id = v_usuario_id
        or v_caso.cuadrilla_responsable_id = any (coalesce(public.auth_cuadrillas_del_usuario(), '{}')::bigint[])
        or coalesce(public.auth_tiene_permiso('casos', 'editar'), false)
        or coalesce(public.auth_tiene_rol('admin'), false)
        or coalesce(public.auth_tiene_rol('superadmin'), false);

    if not v_puede then
        raise exception 'Este caso no está asignado a ti y tu rol no permite editarlo.'
            using errcode = '42501';
    end if;

    -- ── Flujo de la categoría ────────────────────────────────────────────
    select coalesce(c.estados_flujo, '[]'::jsonb) into v_flujo
      from public.categorias_caso c where c.id = v_caso.categoria_id;

    -- ¿El caso YA está en un estado final? Entonces esto es un reintento del
    -- buzón, no un cierre nuevo: se responde sin sobrescribir la resolución ni
    -- la fecha originales.
    select coalesce(bool_or((e ->> 'es_final')::boolean), false) into v_es_final
      from jsonb_array_elements(v_flujo) e
     where e ->> 'id' = v_caso.estado_codigo;

    if v_es_final then
        return jsonb_build_object(
            'ok', true, 'caso_id', v_caso.id, 'correlativo', v_caso.correlativo,
            'estado', v_caso.estado_codigo, 'ya_cerrado', true,
            'mensaje', 'Este caso ya estaba cerrado el ' ||
                       to_char(coalesce(v_caso.fecha_cierre, v_caso.updated_at), 'DD/MM/YYYY') || '.'
        );
    end if;

    -- ── Estado destino ───────────────────────────────────────────────────
    if p_estado_codigo is not null then
        -- Si lo pide el cliente, tiene que existir en el flujo Y ser final.
        select coalesce(bool_or((e ->> 'es_final')::boolean), false) into v_es_final
          from jsonb_array_elements(v_flujo) e
         where e ->> 'id' = p_estado_codigo;

        if not v_es_final then
            raise exception 'El estado "%" no es un estado de cierre válido para esta categoría.',
                p_estado_codigo using errcode = '23514';
        end if;
        v_estado := p_estado_codigo;
    else
        -- Por defecto, el primer estado final que declare el flujo. Se respeta
        -- el ORDEN del array: es el que definió quien configuró la categoría.
        select e ->> 'id' into v_estado
          from jsonb_array_elements(v_flujo) with ordinality as t(e, orden)
         where (e ->> 'es_final')::boolean
         order by t.orden
         limit 1;

        -- Sin flujo configurado se cae a 'resuelta', que es el final del flujo
        -- por defecto sembrado en migration_v9.
        v_estado := coalesce(v_estado, 'resuelta');
    end if;

    -- ── Resolución ───────────────────────────────────────────────────────
    if p_resolucion is null or char_length(trim(p_resolucion)) < 10 then
        raise exception 'Describe la resolución con al menos 10 caracteres.' using errcode = '23514';
    end if;

    -- ── Cierre ───────────────────────────────────────────────────────────
    update public.casos
       set estado_codigo = v_estado,
           resolucion    = trim(p_resolucion),
           fecha_cierre  = now(),
           -- Las observaciones del empleado se ACUMULAN, no se reemplazan: son
           -- notas de campo y machacar lo que anotó otro es perder información.
           observaciones_internas = case
               when coalesce(trim(p_observaciones), '') = '' then observaciones_internas
               when coalesce(observaciones_internas, '') = '' then trim(p_observaciones)
               else observaciones_internas || E'\n---\n' || trim(p_observaciones)
           end
     where id = p_caso_id;

    -- ── Evidencia fotográfica ────────────────────────────────────────────
    -- `es_evidencia = true` las distingue de las fotos de referencia que se
    -- adjuntaron al levantar el caso (ver el comentario de la columna).
    for v_adjunto in select * from jsonb_array_elements(coalesce(p_adjuntos, '[]'::jsonb))
    loop
        if coalesce(v_adjunto ->> 'url', '') <> '' then
            insert into public.casos_adjuntos (
                caso_id, tipo_archivo, es_evidencia, url_supabase,
                nombre_archivo, mime_type, tamano_bytes
            ) values (
                p_caso_id, coalesce(v_adjunto ->> 'tipo', 'foto'), true,
                v_adjunto ->> 'url', v_adjunto ->> 'nombre',
                v_adjunto ->> 'mime', (v_adjunto ->> 'tamano')::bigint
            );
        end if;
    end loop;

    -- ── Trazabilidad ─────────────────────────────────────────────────────
    insert into public.historial_estados_caso (
        caso_id, estado_codigo_anterior, estado_codigo_nuevo,
        cambiado_por_usuario_id, observacion
    ) values (
        p_caso_id, v_caso.estado_codigo, v_estado, v_usuario_id,
        'Cierre desde territorio'
    );

    return jsonb_build_object(
        'ok', true,
        'caso_id', p_caso_id,
        'correlativo', v_caso.correlativo,
        'estado', v_estado,
        'ya_cerrado', false,
        'mensaje', 'Cierre registrado para el caso ' || coalesce(v_caso.correlativo, p_caso_id::text) || '.'
    );
end;
$$;

comment on function public.cerrar_caso_campo is
    'Cierre atómico de un caso desde la PWA: estado final tomado del flujo de la '
    'categoría, fecha de cierre, evidencia y fila de historial en una sola '
    'operación. Idempotente: un caso ya cerrado responde ya_cerrado=true.';

revoke all on function public.cerrar_caso_campo(bigint, text, text, text, jsonb) from public;
grant execute on function public.cerrar_caso_campo(bigint, text, text, text, jsonb) to authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) Cerrar un caso abierto. Debe devolver ok:true y ya_cerrado:false.
-- select public.cerrar_caso_campo(
--          (select id from public.casos where fecha_cierre is null order by id desc limit 1),
--          'Se repuso la luminaria y se verificó el encendido.');

-- 2) Repetir la MISMA llamada: debe devolver ya_cerrado:true sin sobrescribir.
--    Es lo que ocurre cuando el buzón offline reintenta.

-- 3) El historial debe tener las dos filas del ciclo: alta y cierre.
-- select h.caso_id, h.estado_codigo_anterior, h.estado_codigo_nuevo,
--        h.observacion, h.created_at
--   from public.historial_estados_caso h
--  order by h.id desc limit 5;
