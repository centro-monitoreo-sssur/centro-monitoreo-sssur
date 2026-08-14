-- ============================================================================
-- MIGRACIÓN v36 · COMUNICADOS CON AUDIENCIA
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- La sección «Noticias» del portal ciudadano lee hoy cuatro avisos escritos a
-- mano en `assets/js/utils/noticias-demo.js`. La municipalidad quiere usarla
-- para publicar sus propios avisos, y poder decidir a quién van dirigidos.
--
-- ----------------------------------------------------------------------------
-- DOS TABLAS QUE SE PARECEN Y NO SON LO MISMO
--
--   `notificaciones` (v5) → TRANSACCIONAL. La genera el sistema y va dirigida a
--       una persona: «se te asignó el caso #412». No se «publica».
--
--   `noticias` (schema v4) → EDITORIAL. Alguien la escribe y decide publicarla.
--       Tiene título, cuerpo, imagen, distritos y trazado en mapa.
--
-- No se unifican: mezclarlas es justo lo que hace difícil razonar sobre las dos.
-- Los comunicados son lo editorial, así que van sobre `noticias`.
--
-- En la interfaz conviene llamarlos «Comunicados» y no «Noticias», para que
-- nadie los confunda con la campana de notificaciones que ya existe.
--
-- ----------------------------------------------------------------------------
-- LO QUE FALTABA: A QUIÉN VA DIRIGIDO
--
-- La policy vigente es `for select to authenticated using (activa = true)`.
-- Es decir: en cuanto el portal ciudadano tenga sesiones reales —y desde la
-- v32 las tiene— **un vecino vería también los avisos internos**. No es una
-- posibilidad teórica; es el comportamiento de hoy.
--
-- Se añade un eje de audiencia con tres valores:
--
--     publico    → ciudadanos, en el portal
--     empleados  → personal de campo, en la PWA
--     interno    → usuarios del Centro de Monitoreo
--
-- Es un ARREGLO y no un valor único porque los casos reales son mixtos: un
-- cierre de vía por fiestas patronales le importa al vecino Y a la cuadrilla
-- que tiene que rodear la zona. Con un solo valor habría que publicar el mismo
-- aviso dos veces y mantener las copias sincronizadas a mano.
--
-- Se combina con los distritos que ya existen: la audiencia responde A QUÉ
-- PÚBLICO, `noticias_distritos` responde EN QUÉ TERRITORIO. Sin distritos
-- asociados, el comunicado es municipal.
--
-- REQUIERE: schema.sql, v11, v26, v32. IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Audiencia y vigencia
-- ----------------------------------------------------------------------------
alter table public.noticias
    add column if not exists audiencias        text[] not null default '{publico}',
    add column if not exists fecha_publicacion timestamptz,
    add column if not exists fecha_expiracion  timestamptz;

comment on column public.noticias.audiencias is
    'A quién va dirigido: publico, empleados, interno. Arreglo porque un mismo '
    'aviso puede interesar a varios —un cierre de vía, al vecino y a la cuadrilla—.';
comment on column public.noticias.fecha_publicacion is
    'Programación. Nulo = visible desde que se crea.';
comment on column public.noticias.fecha_expiracion is
    'Caducidad. Nulo = no caduca. Un aviso de corte de agua de hace tres meses '
    'estorba más de lo que informa.';

-- Las filas que ya existan quedan como públicas, que es lo que eran: la tabla
-- se creó para el portal ciudadano. Así la migración no cambia lo ya publicado.
update public.noticias set audiencias = '{publico}'
 where audiencias is null or cardinality(audiencias) = 0;

-- Solo valores conocidos, y al menos uno: un comunicado sin audiencia no lo
-- vería nadie y sería imposible darse cuenta de por qué.
alter table public.noticias drop constraint if exists ck_noticias_audiencias;
alter table public.noticias add constraint ck_noticias_audiencias check (
    cardinality(audiencias) > 0
    and audiencias <@ array['publico', 'empleados', 'interno']::text[]
);

-- GIN para que `'publico' = any(audiencias)` no recorra la tabla. Con volumen
-- municipal da igual hoy; cuesta nada y evita revisarlo dentro de dos años.
create index if not exists idx_noticias_audiencias
    on public.noticias using gin (audiencias) where activa;

create index if not exists idx_noticias_vigencia
    on public.noticias (fecha_publicacion desc nulls first) where activa;

-- ----------------------------------------------------------------------------
-- 2. Quién ve qué
--
-- Tres detalles que no son cosméticos:
--
--   · `(select ...)` envolviendo cada función. Sin el subselect PostgreSQL la
--     evalúa una vez POR FILA; con él la compila como InitPlan y la ejecuta una
--     sola vez por consulta. Mismo criterio que la v16.
--
--   · `coalesce(..., false)` sobre `auth_tiene_permiso`: devuelve NULL cuando
--     quien pregunta no está en `usuarios`, y un NULL dentro de un `or` no
--     deniega, deja la expresión indeterminada.
--
--   · La rama de empleados se define POR NEGACIÓN (`not es_ciudadano`) y no por
--     tener permisos de módulo, para que un empleado de campo sin acceso al
--     panel siga recibiendo los avisos que le tocan.
-- ----------------------------------------------------------------------------
drop policy if exists "noticias_select_autenticado" on public.noticias;
drop policy if exists "noticias_select_por_audiencia" on public.noticias;
create policy "noticias_select_por_audiencia"
    on public.noticias for select to authenticated
    using (
        activa = true
        and (fecha_publicacion is null or fecha_publicacion <= now())
        and (fecha_expiracion  is null or fecha_expiracion  >  now())
        and (
            'publico' = any (audiencias)
            or ('empleados' = any (audiencias)
                and not (select public.auth_es_ciudadano()))
            or ('interno' = any (audiencias)
                and coalesce((select public.auth_tiene_permiso('noticias', 'ver')), false))
        )
    );

-- La escritura no cambia de manos: sigue siendo de gerencia. Se reescribe solo
-- para envolver las funciones en `(select ...)`, igual que arriba.
drop policy if exists "noticias_write_admin" on public.noticias;
create policy "noticias_write_admin"
    on public.noticias for all to authenticated
    using (
        (select public.auth_tiene_rol('admin')) or (select public.auth_tiene_rol('superadmin'))
    )
    with check (
        (select public.auth_tiene_rol('admin')) or (select public.auth_tiene_rol('superadmin'))
    );

-- ----------------------------------------------------------------------------
-- 3. Qué se ha leído
--
-- Tabla aparte y no una columna `leida`: el mismo comunicado lo leen muchas
-- personas, así que el dato es de la PAREJA comunicado-lector.
--
-- `lector_id` NO lleva clave foránea a propósito. Apunta a `auth.users`, que
-- puede ser un empleado o un ciudadano, y una FK solo puede apuntar a una
-- tabla. Referenciar `auth.users` desde `public` tampoco es buena idea: ata el
-- esquema de la aplicación al de Supabase Auth.
-- ----------------------------------------------------------------------------
create table if not exists public.noticias_lecturas (
    noticia_id bigint      not null references public.noticias(id) on delete cascade,
    lector_id  uuid        not null,
    leida_at   timestamptz not null default now(),
    primary key (noticia_id, lector_id)
);

comment on table public.noticias_lecturas is
    'Qué comunicado ha leído quién. `lector_id` es auth.uid() y puede ser '
    'personal o ciudadano, por eso no lleva clave foránea.';

-- Contar los no leídos de una persona es la consulta más frecuente: la hace el
-- distintivo del menú inferior en cada arranque.
create index if not exists idx_noticias_lecturas_lector
    on public.noticias_lecturas (lector_id);

alter table public.noticias_lecturas enable row level security;

-- Cada quien administra sus propias marcas y no ve las de nadie más. Saber qué
-- ha leído un vecino concreto no le hace falta a nadie para operar.
drop policy if exists "noticias_lecturas_propias" on public.noticias_lecturas;
create policy "noticias_lecturas_propias"
    on public.noticias_lecturas for all to authenticated
    using (lector_id = (select auth.uid()))
    with check (lector_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. Marcar como leído
--
-- Un RPC y no un `insert` directo desde el navegador para que `lector_id` lo
-- ponga el servidor. Con `insert` habría que confiar en que el cliente mande su
-- propio uid —lo hace la RLS, sí, pero entonces el error de mandarlo mal es un
-- 403 silencioso en vez de algo que no puede ocurrir—.
--
-- `on conflict do nothing`: volver a abrir un comunicado ya leído no debe
-- fallar ni cambiar la fecha de la primera lectura.
-- ----------------------------------------------------------------------------
create or replace function public.marcar_noticia_leida(p_noticia_id bigint)
returns void
language sql
security invoker
set search_path = public
as $$
    insert into public.noticias_lecturas (noticia_id, lector_id)
    values (p_noticia_id, auth.uid())
    on conflict (noticia_id, lector_id) do nothing;
$$;

comment on function public.marcar_noticia_leida(bigint) is
    'Marca un comunicado como leído por quien llama. `security invoker` a '
    'propósito: la RLS de noticias_lecturas debe seguir aplicando.';

grant execute on function public.marcar_noticia_leida(bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. El módulo, para que la gerencia pueda darle permisos
--
-- `noticias` no estaba declarada en `permisos_modulos`, así que
-- `auth_tiene_permiso('noticias', …)` devolvía NULL para TODO EL MUNDO. Sin
-- esto, la rama `interno` de la policy de arriba no se cumpliría nunca.
-- ----------------------------------------------------------------------------
insert into public.permisos_modulos (codigo_modulo, nombre_modulo, descripcion, activo)
values ('noticias', 'Comunicados',
        'Avisos que publica la municipalidad, con audiencia y vigencia.', true)
on conflict (codigo_modulo) do update
    set nombre_modulo = excluded.nombre_modulo,
        descripcion   = excluded.descripcion,
        activo        = excluded.activo;

-- Gerencia lo administra; el resto ni lo ve en el menú. Quién publica —solo
-- Comunicaciones, o también las jefaturas de distrito para su territorio— es
-- una decisión pendiente; mientras tanto queda en gerencia, que es la opción
-- que no compromete a nadie por accidente.
do $$
declare
    v_modulo bigint;
    v_rol    bigint;
begin
    select id into v_modulo from public.permisos_modulos where codigo_modulo = 'noticias';
    if v_modulo is null then
        raise warning 'No se pudo registrar el módulo `noticias`; revisa permisos_modulos.';
        return;
    end if;

    for v_rol in select id from public.roles where codigo in ('admin', 'superadmin')
    loop
        insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
        values (v_rol, v_modulo, true, true, true, true, true)
        on conflict (rol_id, permiso_modulo_id) do update
            set ver = true, crear = true, editar = true, borrar = true, exportar = true;
    end loop;
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Columnas y restricción:
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='noticias'
--    and column_name in ('audiencias','fecha_publicacion','fecha_expiracion');
--
-- 2) La policy nueva reemplazó a la vieja — debe salir SOLO la de audiencia:
--
-- select polname from pg_policy
--  where polrelid='public.noticias'::regclass and polcmd='r';
--
-- 3) El módulo quedó registrado y con permisos para gerencia:
--
-- select r.codigo, rp.ver, rp.crear
--   from public.roles_permisos rp
--   join public.roles r on r.id = rp.rol_id
--   join public.permisos_modulos pm on pm.id = rp.permiso_modulo_id
--  where pm.codigo_modulo = 'noticias' order by r.codigo;
--
-- 4) Comunicado de prueba. Desde el editor SQL no hay sesión, así que la RLS
--    de escritura no interviene:
--
-- insert into public.noticias (titulo, categoria, descripcion, audiencias, autor)
-- values ('Prueba interna', 'Servicios', 'No debe verse desde el portal.',
--         '{interno}', 'Gerencia de Tecnología');
--
-- insert into public.noticias (titulo, categoria, descripcion, audiencias, autor)
-- values ('Prueba pública', 'Servicios', 'Esta sí debe verse en el portal.',
--         '{publico}', 'Alcaldía de San Salvador Sur');
--
--    Ahora, desde el portal ciudadano, en Noticias debe aparecer SOLO la
--    segunda. Si aparecen las dos, la policy no se aplicó.
--
-- Para limpiar:
-- delete from public.noticias where titulo like 'Prueba %';
-- ============================================================================
