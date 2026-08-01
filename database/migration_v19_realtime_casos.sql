-- ============================================================================
-- MIGRACIÓN v19 · TIEMPO REAL SOBRE `casos`
--
-- PARA QUÉ
--   El Mapa en Vivo se suscribe a los cambios de `casos` desde el primer día
--   (stores/denuncias.js), y el canal responde SUBSCRIBED sin quejarse. Pero no
--   llega ni un solo evento, porque una suscripción de `postgres_changes` solo
--   recibe cambios de las tablas incluidas en la publicación `supabase_realtime`
--   — y ahí únicamente se añadió `notificaciones` (migration_v5, línea 85).
--
--   Consecuencia: "en vivo" nunca lo ha sido. Un caso levantado en territorio
--   aparece en la consola cuando alguien recarga la página, no cuando ocurre.
--   Con el alta de campo ya funcionando (v18), esto es lo único que separa al
--   Centro de Monitoreo de ver el territorio conforme se reporta.
--
-- SOBRE `replica identity`
--   Se deja en DEFAULT a propósito. Con FULL, el WAL carga la fila COMPLETA en
--   cada UPDATE y DELETE, y en el plan gratuito el ancho de banda de replicación
--   es un recurso escaso. El frontend solo necesita saber QUÉ cambió para
--   recargar, no el valor anterior de cada columna. Si algún día se pasa a
--   parcheo incremental con el registro previo, se sube a FULL entonces.
--
-- REQUIERE: schema.sql. IDEMPOTENTE.
-- ============================================================================

begin;

-- `alter publication ... add table` FALLA si la tabla ya es miembro, así que
-- no se puede ejecutar dos veces a pelo. El guardia lo hace recargable.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'casos'
    ) then
        alter publication supabase_realtime add table public.casos;
        raise notice 'Tabla `casos` añadida a la publicación supabase_realtime.';
    else
        raise notice 'La tabla `casos` ya estaba en la publicación. Nada que hacer.';
    end if;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) Qué tablas emiten eventos de tiempo real. Deben aparecer al menos
--    `casos` y `notificaciones`.
-- select schemaname, tablename
--   from pg_publication_tables
--  where pubname = 'supabase_realtime'
--  order by tablename;

-- 2) Prueba de extremo a extremo, con el Centro de Monitoreo abierto en el
--    navegador y la consola visible:
--      · Debe verse `[realtime] Escuchando cambios en casos.`
--      · Al ejecutar el UPDATE de abajo, el mapa debe refrescarse SIN recargar.
-- update public.casos
--    set updated_at = now()
--  where id = (select max(id) from public.casos);

-- ⚠ Recordatorio: Realtime respeta la RLS. Cada cliente recibe únicamente los
--   cambios de las filas que su propia policy `casos_select` le deja ver, así
--   que una jefatura distrital no verá moverse los casos de otro distrito.
--   Es el comportamiento correcto, pero conviene tenerlo presente al probar:
--   si no llega nada, antes de culpar a Realtime hay que confirmar que ese
--   usuario puede SELECT esa fila.
