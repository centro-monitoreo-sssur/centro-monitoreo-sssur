-- ============================================================================
-- MIGRACIÓN v38 · UNA DENUNCIA CIUDADANA AVISA AL CENTRO DE MONITOREO
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- La v37 consiguió que la denuncia se guardara. Guardada está: CASO-2026-000009.
-- Pero en el Centro de Monitoreo no apareció ningún aviso, y no es un fallo de
-- entrega: **nadie escribe nunca en `public.notificaciones`**.
--
-- La tabla existe desde el schema, la v5 le puso RLS y la añadió a la
-- publicación de Realtime, el frontend la lee, la pinta, la marca como leída y
-- lleva un contador de no leídas. Todo el circuito está montado salvo el primer
-- eslabón. El único `insert` que existe está en `stores/notificaciones.js`, o
-- sea que solo hay notificación si un operador la escribe a mano desde el
-- propio Centro de Monitoreo.
--
-- Mientras la única puerta de entrada de casos fue el propio Centro, eso no se
-- notaba: quien creaba el caso ya estaba mirando la pantalla. El portal
-- ciudadano rompe ese supuesto — ahora entran casos que nadie del Centro ha
-- visto nacer.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UN TRIGGER Y NO UN `insert` DENTRO DEL RPC
--
-- `crear_caso_ciudadano` no es el único camino: quedan las altas desde campo
-- (v18) y las que se hagan mañana. Un trigger sobre `casos` cubre todas y no
-- hay que acordarse de nada al añadir la siguiente. Además el RPC ya hace
-- bastante; el aviso no es asunto suyo.
--
-- ----------------------------------------------------------------------------
-- EL AVISO NO PUEDE TUMBAR LA DENUNCIA
--
-- Es la lección de la v37, y aquí se aplica antes de que ocurra: el trigger va
-- envuelto en su propio bloque de excepciones. Si el aviso falla —por un CHECK
-- nuevo, por un permiso, por lo que sea—, se registra un `warning` y la
-- denuncia sigue su camino. Perder un aviso es un problema; perder la denuncia
-- del vecino por culpa del aviso sería absurdo.
--
-- ----------------------------------------------------------------------------
-- A QUIÉN SE AVISA
--
-- `notificaciones.usuario_id` queda NULO, que en esta tabla significa «para el
-- Centro de Monitoreo», no «sin destinatario»: la policy `notificaciones_admin_all`
-- de la v5 ya hace que las vean admin y superadmin, que son quienes atienden la
-- bandeja. Repartir una copia por usuario sería multiplicar filas para
-- responder la misma pregunta, y obligaría a decidir hoy un reparto por
-- departamento o distrito que todavía no está definido —quién atiende la cola
-- ciudadana sigue siendo una decisión pendiente de la administración—.
--
-- El `datos` jsonb lleva ya distrito, departamento y categoría, así que el día
-- que se decida ese reparto, se filtra sin tocar el trigger.
--
-- ----------------------------------------------------------------------------
-- REQUISITOS: v5 (tabla y RLS), v11 (prioridades), v34 (denuncias ciudadanas).
-- Idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Realtime, por si acaso
--
--    La v19 añadió `casos` a la publicación y la v5 hizo lo propio con
--    `notificaciones`. Se vuelve a comprobar aquí porque sin pertenecer a la
--    publicación no llega NINGÚN evento, el canal se suscribe igual de bien y
--    en consola se lee «Escuchando cambios en casos»: un silencio que se
--    disfraza de normalidad. Con la guarda, ejecutarlo de más no cuesta nada.
-- ----------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public' and tablename = 'casos'
    ) then
        alter publication supabase_realtime add table public.casos;
        raise notice 'Tabla `casos` añadida a supabase_realtime.';
    end if;

    if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public' and tablename = 'notificaciones'
    ) then
        alter publication supabase_realtime add table public.notificaciones;
        raise notice 'Tabla `notificaciones` añadida a supabase_realtime.';
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. El aviso
--
--    SECURITY DEFINER porque quien inserta es el ciudadano, y la policy de la
--    v5 sobre `notificaciones` solo admite a admin y superadmin. Con
--    `search_path` fijo, por lo mismo que se le puso a `registrar_auditoria()`
--    en la v37.
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

        -- Los códigos de `prioridades` (v11) coinciden con los que entiende el
        -- frontend salvo `informativa`, que allí no existe.
        select case p.codigo when 'informativa' then 'baja' else p.codigo end
          into v_prioridad
          from public.prioridades p where p.id = new.prioridad_id;

        insert into public.notificaciones (
            titulo, mensaje, tipo, prioridad, origen, usuario_id, datos
        ) values (
            'Nueva denuncia ciudadana',
            coalesce(new.correlativo, 'Caso ' || new.id::text)
                || ' · ' || coalesce(v_categoria, 'Sin categoría')
                || ' · ' || coalesce(v_distrito, 'Distrito no resuelto'),
            'info',
            coalesce(v_prioridad, 'media'),
            'portal_ciudadano',
            null,                       -- para el Centro de Monitoreo, no para alguien
            jsonb_build_object(
                'caso_id',        new.id,
                'correlativo',    new.correlativo,
                'categoria_id',   new.categoria_id,
                'distrito_id',    new.distrito_id,
                'departamento_id', new.departamento_actual_id,
                'anonima',        new.denunciante_es_anonimo
            )
        );
    exception when others then
        -- Ver el encabezado: el aviso jamás puede deshacer la denuncia.
        raise warning 'No se pudo crear el aviso de la denuncia %: %',
            coalesce(new.correlativo, new.id::text), sqlerrm;
    end;

    return new;
end;
$$;

comment on function public.fn_notifica_denuncia_ciudadana() is
    'Crea el aviso en `notificaciones` cuando entra una denuncia por el portal '
    'ciudadano. Nunca falla hacia fuera: si el aviso no se puede crear, avisa por '
    'warning y deja pasar la denuncia (v38).';

drop trigger if exists trg_notifica_denuncia_ciudadana on public.casos;

-- Solo las que nacen en el portal. La condición va en el `when` y no dentro de
-- la función para que PostgreSQL ni la llame en las altas del Centro y de
-- campo, que son la mayoría.
create trigger trg_notifica_denuncia_ciudadana
    after insert on public.casos
    for each row
    when (new.creado_por_ciudadano_id is not null)
    execute function public.fn_notifica_denuncia_ciudadana();

-- La bandeja se consulta siempre igual: lo no leído, lo más reciente primero.
create index if not exists ix_notificaciones_no_leidas
    on public.notificaciones (created_at desc)
    where not leida;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Las dos tablas publican en Realtime. Si alguna falta, el Centro se entera
--    de los cambios solo al recargar:
--
-- select tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and schemaname = 'public'
--    and tablename in ('casos','notificaciones');
--    -- Deben salir las dos.
--
-- 2) El trigger está y solo dispara para el portal:
--
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.casos'::regclass and tgname = 'trg_notifica_denuncia_ciudadana';
--
-- 3) Aviso retroactivo de la denuncia que ya entró sin él. Se ejecuta UNA vez:
--
-- insert into public.notificaciones (titulo, mensaje, tipo, prioridad, origen, datos)
-- select 'Nueva denuncia ciudadana',
--        c.correlativo || ' · ' || cat.nombre || ' · ' || coalesce(d.nombre,'—'),
--        'info', 'media', 'portal_ciudadano',
--        jsonb_build_object('caso_id', c.id, 'correlativo', c.correlativo)
--   from public.casos c
--   join public.categorias_caso cat on cat.id = c.categoria_id
--   left join public.distritos d on d.id = c.distrito_id
--  where c.creado_por_ciudadano_id is not null
--    and not exists (
--        select 1 from public.notificaciones n
--         where (n.datos ->> 'caso_id')::bigint = c.id
--    );
--
-- 4) LA PRUEBA DE VERDAD: con el Centro de Monitoreo ABIERTO en una ventana,
--    envía una denuncia desde el portal en otra. La campana debe subir el
--    contador sola, sin recargar, y el caso aparecer en la lista.
-- ============================================================================
