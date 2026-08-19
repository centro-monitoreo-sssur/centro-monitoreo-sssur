-- ============================================================================
-- MIGRACIÓN v40 · EL AVISO LLEGA A QUIEN TIENE QUE ATENDERLO
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- LA REGLA DE NEGOCIO QUE ESTO IMPLEMENTA
--
-- Quien atiende una denuncia ciudadana es el DEPARTAMENTO responsable de la
-- categoría que el vecino eligió, y esa jefatura asigna al personal que la
-- resuelve. Es la regla que ya seguía el enrutamiento del caso:
-- `categorias_caso.departamento_responsable_id` decide
-- `casos.departamento_actual_id`. Aquí solo se hace que el AVISO siga al caso.
--
-- Queda pendiente de confirmación de la Alcaldía. No se inventa política nueva:
-- se alinea el aviso con el reparto que el sistema YA aplica, así que si la
-- decisión final fuera otra, lo que cambia es el reparto —en un solo sitio— y
-- esto lo sigue sin tocarse.
--
-- ----------------------------------------------------------------------------
-- EL FALLO QUE ARREGLA
--
-- La v38 crea el aviso con `usuario_id` nulo, y lo documenté como «para el
-- Centro de Monitoreo». Con la regla de arriba eso está mal: la policy
-- `notificaciones_admin_all` de la v5 solo deja ver la tabla a admin y
-- superadmin, así que **la jefatura que debe atender la denuncia nunca ve el
-- aviso de que existe**. El caso sí le llega —la RLS de `casos` lo enruta bien—
-- pero se entera solo si mira la lista por su cuenta, que es exactamente lo que
-- el aviso venía a evitar.
--
-- ----------------------------------------------------------------------------
-- QUÉ SIGNIFICA «LEÍDA» EN UN AVISO DE UNIDAD
--
-- No es una bandeja personal, es una cola de trabajo: marcarla leída significa
-- «alguien de esta unidad ya lo vio», y desaparece para toda la unidad. Es la
-- semántica correcta de una cola —si dos personas lo ven, el trabajo se hace
-- una vez— y ahorra una tabla de lecturas por usuario como la de comunicados.
--
-- Se marca por RPC y no abriendo un UPDATE: la RLS no distingue COLUMNAS, y con
-- permiso de UPDATE sobre la fila se podría reescribir el texto del aviso.
--
-- ----------------------------------------------------------------------------
-- REQUISITOS: v5 (tabla y RLS), v14 o v16 (alcance), v38 (el trigger).
-- Idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. A quién va dirigido
-- ----------------------------------------------------------------------------
alter table public.notificaciones
    add column if not exists departamento_id bigint   references public.departamentos(id),
    add column if not exists distrito_id     smallint references public.distritos(id);

comment on column public.notificaciones.departamento_id is
    'Unidad que debe atender el aviso. Nulo = es para el Centro de Monitoreo. '
    'En la práctica excluyente con `usuario_id`, que dirige a una persona (v40).';

comment on column public.notificaciones.distrito_id is
    'Territorio del hecho que originó el aviso. Informativo por ahora; permite '
    'acotar por distrito el día que una jefatura distrital tenga bandeja propia.';

create index if not exists ix_notificaciones_departamento
    on public.notificaciones (departamento_id, created_at desc)
    where not leida;

-- ----------------------------------------------------------------------------
-- 2. Quién puede ver cada aviso
--
--    Una sola función, consumida por la policy Y por el RPC de marcar leída.
--    Duplicar la condición en dos sitios es como se acaba pudiendo marcar leído
--    lo que no se puede ver.
--
--    Se apoya en el alcance de la v16 si está aplicada y, si no, en el
--    departamento propio de la v14. Las dos existen en este proyecto y desde el
--    SQL no hay forma de saber cuál está viva, así que se intenta la buena y se
--    cae a la otra.
-- ----------------------------------------------------------------------------
create or replace function public.auth_ve_notificacion(
    p_usuario_id      uuid,
    p_departamento_id bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_mis_departamentos bigint[];
begin
    if coalesce(public.auth_tiene_rol('admin'), false)
       or coalesce(public.auth_tiene_rol('superadmin'), false) then
        return true;
    end if;

    -- Dirigido a esta persona en concreto.
    if p_usuario_id is not null and p_usuario_id = auth.uid() then
        return true;
    end if;

    -- Sin departamento es un aviso del Centro de Monitoreo: no es de nadie más.
    if p_departamento_id is null then
        return false;
    end if;

    begin
        v_mis_departamentos := public.auth_departamentos_visibles();
    exception when undefined_function then
        v_mis_departamentos := array_remove(array[public.auth_departamento_id()], null);
    end;

    return p_departamento_id = any (coalesce(v_mis_departamentos, '{}'::bigint[]));
end;
$$;

comment on function public.auth_ve_notificacion(uuid, bigint) is
    'Regla única de visibilidad de `notificaciones`: admin, destinatario '
    'personal, o miembro de la unidad a la que va dirigido el aviso (v40).';

drop policy if exists "notificaciones_select_por_ambito" on public.notificaciones;
create policy "notificaciones_select_por_ambito"
    on public.notificaciones for select to authenticated
    using (public.auth_ve_notificacion(usuario_id, departamento_id));

-- La escritura sigue siendo de gerencia: `notificaciones_admin_all` de la v5 se
-- conserva tal cual. Esta policy solo AÑADE lectura, nunca quita.

-- ----------------------------------------------------------------------------
-- 3. Marcar leída sin poder reescribir el aviso
-- ----------------------------------------------------------------------------
create or replace function public.marcar_notificacion_leida(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_usuario_id      uuid;
    v_departamento_id bigint;
begin
    if auth.uid() is null then
        raise exception 'Sesión no válida.' using errcode = '28000';
    end if;

    select n.usuario_id, n.departamento_id
      into v_usuario_id, v_departamento_id
      from public.notificaciones n where n.id = p_id;
    if not found then return false; end if;

    -- SECURITY DEFINER se salta la RLS, así que la visibilidad se comprueba a
    -- mano y con la MISMA función que usa la policy.
    if not public.auth_ve_notificacion(v_usuario_id, v_departamento_id) then
        raise exception 'Ese aviso no es de tu ámbito.' using errcode = '42501';
    end if;

    update public.notificaciones set leida = true where id = p_id;
    return true;
end;
$$;

comment on function public.marcar_notificacion_leida(bigint) is
    'Marca un aviso como leído. En un aviso de unidad, leído significa que '
    'ALGUIEN de esa unidad ya lo vio: es una cola de trabajo, no una bandeja '
    'personal. Va por RPC porque la RLS no distingue columnas y un UPDATE '
    'abierto permitiría reescribir el texto del aviso (v40).';

grant execute on function public.marcar_notificacion_leida(bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. El trigger de la v38 dirige el aviso
-- ----------------------------------------------------------------------------
create or replace function public.fn_notifica_denuncia_ciudadana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_categoria  text;
    v_distrito   text;
    v_prioridad  text;
begin
    begin
        select c.nombre into v_categoria
          from public.categorias_caso c where c.id = new.categoria_id;

        select d.nombre into v_distrito
          from public.distritos d where d.id = new.distrito_id;

        select case p.codigo when 'informativa' then 'baja' else p.codigo end
          into v_prioridad
          from public.prioridades p where p.id = new.prioridad_id;

        insert into public.notificaciones (
            titulo, mensaje, tipo, prioridad, origen,
            usuario_id, departamento_id, distrito_id, datos
        ) values (
            'Nueva denuncia ciudadana',
            coalesce(new.correlativo, 'Caso ' || new.id::text)
                || ' · ' || coalesce(v_categoria, 'Sin categoría')
                || ' · ' || coalesce(v_distrito, 'Distrito no resuelto'),
            'info',
            coalesce(v_prioridad, 'media'),
            'portal_ciudadano',
            null,
            /* La unidad que lo tiene que atender. Sale del CASO y no de la
               categoría porque el enrutamiento ya lo resolvió el trigger de
               sincronización y puede haberse afinado. Si viniera nulo, el aviso
               queda para el Centro de Monitoreo: mejor que lo vea gerencia a
               que no lo vea nadie. */
            new.departamento_actual_id,
            new.distrito_id,
            jsonb_build_object(
                'caso_id',         new.id,
                'correlativo',     new.correlativo,
                'categoria_id',    new.categoria_id,
                'distrito_id',     new.distrito_id,
                'departamento_id', new.departamento_actual_id,
                'anonima',         new.denunciante_es_anonimo
            )
        );
    exception when others then
        raise warning 'No se pudo crear el aviso de la denuncia %: %',
            coalesce(new.correlativo, new.id::text), sqlerrm;
    end;

    return new;
end;
$$;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Columnas y policies:
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='notificaciones'
--    and column_name in ('departamento_id','distrito_id');
--
-- select policyname from pg_policies
--  where tablename='notificaciones' order by policyname;
--    -- Deben salir `notificaciones_admin_all` y `notificaciones_select_por_ambito`.
--
-- 2) Los avisos que ya existen no llevan departamento, así que hoy solo los ve
--    gerencia. Se les asigna el de su caso, UNA vez:
--
-- update public.notificaciones n
--    set departamento_id = c.departamento_actual_id,
--        distrito_id     = c.distrito_id
--   from public.casos c
--  where (n.datos ->> 'caso_id')::bigint = c.id
--    and n.departamento_id is null;
--
-- 3) Con una cuenta de jefatura (NO admin):
--
-- select id, titulo, departamento_id, leida from public.notificaciones
--  order by created_at desc limit 10;
--    -- Debe devolver SOLO los avisos de su unidad. Con admin, todos.
--
-- 4) Prueba de extremo a extremo: envía una denuncia desde el portal eligiendo
--    una categoría cuyo departamento responsable NO sea el de tu cuenta, y entra
--    al Centro con una cuenta de esa jefatura. El aviso debe estar en la campana.
-- ============================================================================
