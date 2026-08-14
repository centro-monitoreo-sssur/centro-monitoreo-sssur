-- ============================================================================
-- MIGRACIÓN v35 · ABRIR UNA CATEGORÍA AL PÚBLICO ES DECISIÓN DE GERENCIA
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- La v34 añadió `categorias_caso.visible_ciudadano`, y la v26 dejó que cada
-- jefatura administre las categorías de SU departamento:
--
--     create policy "categorias_update_jefatura"
--         on public.categorias_caso for update to authenticated
--         using (auth_tiene_permiso('categorias','editar')
--                and departamento_responsable_id = auth_departamento_id());
--
-- Las dos cosas juntas significan que cualquier jefe de área puede abrir sus
-- propias categorías al portal ciudadano por su cuenta. Y eso no es un ajuste
-- interno como el color o el icono:
--
--   · Publica un canal de entrada hacia su unidad.
--   · La compromete a atender lo que llegue por él.
--   · Y no se puede deshacer del todo: lo que un vecino ya envió, enviado está.
--
-- Es una decisión de gobierno del servicio, no de configuración. Va donde van
-- las demás decisiones de ese nivel en este sistema: en gerencia.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UN TRIGGER Y NO UNA POLICY
--
-- Es la misma razón de la v31 y la v32, y ya van tres: **RLS decide QUÉ FILAS
-- se tocan, no QUÉ COLUMNAS**. La policy de la v26 autoriza la fila entera a la
-- jefatura responsable; no hay forma de escribir «puede actualizar esta fila
-- salvo esta columna».
--
-- `GRANT UPDATE (columna)` sí distingue columnas, pero en Supabase todos los
-- autenticados comparten el rol `authenticated`: no puede separar a un jefe de
-- área de un administrador.
--
-- Queda el trigger BEFORE UPDATE que devuelve la columna a su valor anterior.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ REVERTIR EN SILENCIO Y NO ABORTAR
--
-- Igual que en la v31: la pantalla de catálogo envía la fila completa al
-- guardar. Si abortara, una jefatura que solo corrigió una descripción vería un
-- error incomprensible por reenviar un campo que no tocó.
--
-- Revertir tiene un coste: quien lo intente no se entera de que no se aplicó.
-- Por eso el store del frontend RELEE el valor devuelto y avisa si difiere del
-- que pidió, en vez de dar por bueno el envío.
--
-- REQUIERE: v26, v34. IDEMPOTENTE.
-- ============================================================================

begin;

create or replace function public.fn_protege_visibilidad_publica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Nada que vigilar si la columna no cambia. Es el caso de la inmensa
    -- mayoría de ediciones —nombre, color, prioridad— y salir aquí evita
    -- resolver los roles en cada guardado del catálogo.
    if new.visible_ciudadano is not distinct from old.visible_ciudadano then
        return new;
    end if;

    -- La gerencia decide qué se abre al público.
    if coalesce(public.auth_tiene_rol('admin'), false)
       or coalesce(public.auth_tiene_rol('superadmin'), false) then
        return new;
    end if;

    -- Sin sesión (migraciones, editor SQL, tareas del servidor) no se
    -- interviene: ahí manda quien tenga acceso a la base. Es además la vía por
    -- la que se abren las primeras categorías tras aplicar la v34.
    if auth.uid() is null then
        return new;
    end if;

    -- Se revierte y se deja constancia en el log del servidor: el intento no es
    -- necesariamente malicioso —lo normal es que una jefatura no sepa que esto
    -- es competencia de gerencia— pero conviene que quede registrado.
    raise warning
        'Intento de cambiar visible_ciudadano en la categoria % por el usuario %; revertido.',
        old.id, auth.uid();

    new.visible_ciudadano := old.visible_ciudadano;
    return new;
end;
$$;

comment on function public.fn_protege_visibilidad_publica() is
    'Solo gerencia abre o cierra una categoria al portal ciudadano. La policy de '
    'la v26 autoriza a cada jefatura la fila entera, y RLS no distingue columnas.';

-- El prefijo «a_» no es decorativo: PostgreSQL dispara los triggers en orden
-- alfabético y este debe correr ANTES que `trg_categoria_enrutamiento`, que
-- puede abortar por motivos suyos. Mismo criterio que la v31 y la v32.
drop trigger if exists a_trg_categoria_visibilidad_publica on public.categorias_caso;
create trigger a_trg_categoria_visibilidad_publica
    before update on public.categorias_caso
    for each row execute function public.fn_protege_visibilidad_publica();

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) El trigger existe y corre antes que el de enrutamiento:
--
-- select tgname from pg_trigger
--  where tgrelid = 'public.categorias_caso'::regclass and not tgisinternal
--  order by tgname;
--
--    Debe salir `a_trg_categoria_visibilidad_publica` ANTES que
--    `trg_categoria_enrutamiento`.
--
-- 2) Desde el editor SQL no hay sesión, así que esto SÍ funciona — y es la vía
--    para abrir las primeras categorías:
--
-- select id, codigo, nombre, departamento_responsable_id, visible_ciudadano
--   from public.categorias_caso where activo order by codigo;
--
-- update public.categorias_caso set visible_ciudadano = true
--  where codigo in ('...', '...');
--
-- 3) Prueba real: entra al Centro de Monitoreo con una cuenta de jefatura (no
--    admin) y abre Catálogo. El botón del globo no debe aparecer en ninguna
--    fila, ni siquiera en las de su propio departamento.
--
--    Con una cuenta admin sí aparece, y al pulsarlo el distintivo «Pública»
--    cambia de inmediato.
-- ============================================================================
