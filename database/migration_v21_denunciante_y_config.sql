-- ============================================================================
-- MIGRACIÓN v21 · DATOS DEL DENUNCIANTE Y LECTURA DE CONFIGURACIÓN
--
-- 1. DENUNCIANTE
--    El esquema confundía "quién lo tecleó" con "quién lo reportó". `casos`
--    tiene `creado_por_usuario_id` y `creado_por_ciudadano_id` con una
--    restricción que exige EXACTAMENTE UNA de las dos, así que registrar un
--    reporte a nombre del ciudadano borraba al empleado que lo levantó.
--
--    Son dos cosas distintas y ahora tienen campos distintos: el creador sigue
--    siendo siempre el empleado —no falsificable, sale de auth.uid()— y el
--    denunciante es un dato aparte, opcional y anónimo por defecto.
--
--    Nota sobre el DUI: NO se almacena en `casos`. Sirve para BUSCAR a un
--    ciudadano ya registrado (sección 2), pero no se copia al caso. Guardar el
--    documento de identidad en cada denuncia multiplica la superficie de dato
--    sensible sin aportar nada operativo: para volver a contactar basta el
--    teléfono.
--
-- 2. BÚSQUEDA DE CIUDADANO
--    Por DUI o teléfono, nunca por nombre: dos personas comparten nombre con
--    facilidad y el empleado acabaría vinculando el caso a quien no es.
--    Coincidencia EXACTA y de una sola fila, sin comodines, para que la función
--    no sirva de listado de la población.
--
-- 3. CONFIGURACIÓN
--    `config_admin_select` (v5) solo deja leer a admin y superadmin. Cualquier
--    otro rol recibe cero filas y el `.single()` del frontend lo convierte en un
--    406 en consola en cada arranque. Además dejaba sin efecto el interruptor
--    `accesoContextos` para quien no fuera administrador: al no poder leerlo, la
--    app caía a los valores por defecto, donde todo está encendido.
--
-- REQUIERE: migration_v5, v18. IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Columnas del denunciante
-- ----------------------------------------------------------------------------
alter table public.casos
    add column if not exists denunciante_es_anonimo   boolean not null default true,
    add column if not exists denunciante_nombre       text,
    add column if not exists denunciante_telefono     text,
    add column if not exists denunciante_ciudadano_id uuid references public.ciudadanos(id);

comment on column public.casos.denunciante_es_anonimo is
    'true = la persona que reportó no quiso identificarse. Es el valor por defecto.';
comment on column public.casos.denunciante_nombre is
    'Nombre de quien reportó, cuando accede a darlo. NO es quien creó el caso: '
    'eso es creado_por_usuario_id, que siempre guarda al empleado.';
comment on column public.casos.denunciante_ciudadano_id is
    'Enlace a public.ciudadanos si la persona ya estaba registrada en el portal. '
    'Se resuelve con buscar_ciudadano() por DUI o teléfono.';

-- "Anónimo" tiene que significar que EL DATO NO ESTÁ, no que una bandera pida
-- no mirarlo mientras el nombre sigue en la columna. Es la diferencia entre una
-- promesa y una garantía, y es lo que se le puede enseñar a quien pregunte.
--
-- NOT VALID: si quedaron filas de prueba incoherentes, la migración no debe
-- abortar. Las filas nuevas sí se comprueban, que es lo que protege de aquí en
-- adelante.
alter table public.casos drop constraint if exists ck_casos_denunciante_anonimo;
alter table public.casos add constraint ck_casos_denunciante_anonimo check (
    not denunciante_es_anonimo
    or (denunciante_nombre is null
        and denunciante_telefono is null
        and denunciante_ciudadano_id is null)
) not valid;

-- Un denunciante identificado necesita al menos un dato con el que volver a
-- contactarle; si no, identificarlo no sirve de nada.
alter table public.casos drop constraint if exists ck_casos_denunciante_identificado;
alter table public.casos add constraint ck_casos_denunciante_identificado check (
    denunciante_es_anonimo
    or coalesce(denunciante_nombre, denunciante_telefono, denunciante_ciudadano_id::text) is not null
) not valid;

-- Casos de un mismo vecino: permite ver reincidencias por teléfono.
create index if not exists ix_casos_denunciante_telefono
    on public.casos (denunciante_telefono) where denunciante_telefono is not null;
create index if not exists ix_casos_denunciante_ciudadano
    on public.casos (denunciante_ciudadano_id) where denunciante_ciudadano_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Búsqueda de un ciudadano registrado
--
--    Índices funcionales sobre el valor NORMALIZADO. Los DUI se teclean con
--    guion y los teléfonos con espacios o con +503, así que comparar en crudo
--    falla la mitad de las veces. Sin estos índices la comparación normalizada
--    obligaría a recorrer la tabla entera en cada pulsación; con ellos es una
--    búsqueda directa por igualdad.
-- ----------------------------------------------------------------------------
create index if not exists ix_ciudadanos_dui_normalizado
    on public.ciudadanos ((regexp_replace(coalesce(dui, ''), '\D', '', 'g')))
    where dui is not null;

create index if not exists ix_ciudadanos_telefono_normalizado
    on public.ciudadanos ((regexp_replace(coalesce(telefono, ''), '\D', '', 'g')))
    where telefono is not null;

create or replace function public.buscar_ciudadano(p_identificador text)
returns table (
    ciudadano_id uuid,
    nombres      text,
    apellidos    text,
    distrito_id  smallint,
    distrito     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_digitos text;
begin
    -- Solo personal autenticado que pueda registrar casos. Sin esto, la función
    -- sería un directorio consultable de la población del municipio.
    if auth.uid() is null then
        raise exception 'Sesión no válida.' using errcode = '28000';
    end if;
    if not (
        coalesce(public.auth_tiene_permiso('casos', 'crear'), false)
        or coalesce(public.auth_tiene_rol('admin'), false)
        or coalesce(public.auth_tiene_rol('superadmin'), false)
    ) then
        raise exception 'Tu rol no permite consultar el padrón de ciudadanos.'
            using errcode = '42501';
    end if;

    v_digitos := regexp_replace(coalesce(p_identificador, ''), '\D', '', 'g');

    -- El código de país llega según cómo lo teclee cada quien.
    if length(v_digitos) = 11 and left(v_digitos, 3) = '503' then
        v_digitos := substring(v_digitos from 4);
    end if;

    -- 9 dígitos = DUI, 8 = teléfono. Cualquier otra longitud no es ninguno de
    -- los dos: se responde vacío en vez de buscar coincidencias parciales, que
    -- es lo que convertiría esto en un buscador de personas.
    if length(v_digitos) = 9 then
        return query
            select c.id, c.nombres, c.apellidos, c.distrito_id, d.nombre
              from public.ciudadanos c
              left join public.distritos d on d.id = c.distrito_id
             where c.activo
               and regexp_replace(coalesce(c.dui, ''), '\D', '', 'g') = v_digitos
             limit 1;
    elsif length(v_digitos) = 8 then
        return query
            select c.id, c.nombres, c.apellidos, c.distrito_id, d.nombre
              from public.ciudadanos c
              left join public.distritos d on d.id = c.distrito_id
             where c.activo
               and regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') = v_digitos
             limit 1;
    end if;
    -- Sin coincidencia: cero filas. No es un error — la mayoría de quienes
    -- reportan en la calle no están registrados en el portal.
end;
$$;

comment on function public.buscar_ciudadano is
    'Localiza un ciudadano registrado por DUI (9 dígitos) o teléfono (8). '
    'Coincidencia exacta sobre el valor normalizado; nunca por nombre ni parcial, '
    'para que no sirva de listado de la población. No devuelve el DUI.';

-- ----------------------------------------------------------------------------
-- 3. Alta en campo, ahora con denunciante
--
--    DROP antes del CREATE: añadir parámetros —aunque sea con valor por
--    defecto— genera una SOBRECARGA, y con dos versiones vivas PostgREST elige
--    una de forma impredecible. Se elimina la firma anterior de la v18.
-- ----------------------------------------------------------------------------
drop function if exists public.crear_caso_campo(
    bigint, text, text, double precision, double precision, text, text, text, jsonb);

create or replace function public.crear_caso_campo(
    p_categoria_id            bigint,
    p_descripcion             text,
    p_direccion_referencia    text,
    p_lat                     double precision,
    p_lng                     double precision,
    p_titulo                  text    default null,
    p_canal_codigo            text    default 'pwa_empleado',
    p_referencia_cliente      text    default null,
    p_adjuntos                jsonb   default '[]'::jsonb,
    p_denunciante_anonimo     boolean default true,
    p_denunciante_nombre      text    default null,
    p_denunciante_telefono    text    default null,
    p_denunciante_ciudadano_id uuid   default null
)
returns jsonb
language plpgsql
-- SECURITY DEFINER: PostgreSQL aplica las policies de SELECT a la salida de
-- `INSERT … RETURNING`, y un empleado con alcance `solo_asignados` no pasa su
-- propia `casos_select` sobre un caso recién creado sin responsable. La
-- autorización se comprueba abajo con el mismo predicado que `casos_insert`.
security definer
set search_path = public
as $$
declare
    v_usuario_id   uuid := auth.uid();
    v_categoria    public.categorias_caso%rowtype;
    v_distrito_id  smallint;
    v_exacto       boolean;
    v_canal_id     smallint;
    v_caso_id      bigint;
    v_correlativo  text;
    v_estado       text;
    v_existente    bigint;
    v_adjunto      jsonb;
    v_anonimo      boolean;
    v_nombre       text;
    v_telefono     text;
    v_ciudadano    uuid;
begin
    -- ── Identidad ────────────────────────────────────────────────────────
    if v_usuario_id is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.' using errcode = '28000';
    end if;
    if not exists (select 1 from public.usuarios u where u.id = v_usuario_id and u.activo) then
        raise exception 'Tu usuario no está activo en el sistema.' using errcode = '28000';
    end if;

    -- ── Autorización ─────────────────────────────────────────────────────
    if not (
        coalesce(public.auth_tiene_permiso('casos', 'crear'), false)
        or coalesce(public.auth_tiene_rol('admin'), false)
        or coalesce(public.auth_tiene_rol('superadmin'), false)
    ) then
        raise exception 'Tu rol no tiene permiso para registrar casos.' using errcode = '42501';
    end if;

    -- ── Idempotencia ─────────────────────────────────────────────────────
    if p_referencia_cliente is not null then
        select c.id, c.correlativo into v_existente, v_correlativo
          from public.casos c where c.referencia_cliente = p_referencia_cliente;
        if v_existente is not null then
            return jsonb_build_object(
                'ok', true, 'caso_id', v_existente, 'correlativo', v_correlativo,
                'duplicado', true, 'mensaje', 'Este reporte ya estaba registrado.');
        end if;
    end if;

    -- ── Categoría ────────────────────────────────────────────────────────
    select * into v_categoria from public.categorias_caso where id = p_categoria_id and activo;
    if not found then
        raise exception 'La categoría seleccionada no existe o está desactivada.' using errcode = '23503';
    end if;

    -- ── Contenido ────────────────────────────────────────────────────────
    if p_descripcion is null or char_length(trim(p_descripcion)) < 10 then
        raise exception 'La descripción debe tener al menos 10 caracteres.' using errcode = '23514';
    end if;
    if char_length(trim(p_descripcion)) > 2000 then
        raise exception 'La descripción no puede pasar de 2000 caracteres.' using errcode = '23514';
    end if;
    if p_direccion_referencia is null or char_length(trim(p_direccion_referencia)) < 5 then
        raise exception 'Indica una referencia de dirección de al menos 5 caracteres.' using errcode = '23514';
    end if;

    -- ── Denunciante ──────────────────────────────────────────────────────
    -- Se NORMALIZA aquí, no se confía en el cliente. Si viene marcado anónimo,
    -- los datos personales se descartan en el servidor: así "anónimo" no
    -- depende de que el navegador se acuerde de vaciar los campos.
    v_anonimo := coalesce(p_denunciante_anonimo, true);
    if v_anonimo then
        v_nombre := null; v_telefono := null; v_ciudadano := null;
    else
        v_nombre    := nullif(trim(coalesce(p_denunciante_nombre, '')), '');
        v_telefono  := nullif(regexp_replace(coalesce(p_denunciante_telefono, ''), '\D', '', 'g'), '');
        v_ciudadano := p_denunciante_ciudadano_id;

        -- Sin ningún dato de contacto, "identificado" no significa nada. Se
        -- degrada a anónimo en vez de rechazar el reporte: el incidente de la
        -- calle importa más que la ficha de quien lo contó.
        if v_nombre is null and v_telefono is null and v_ciudadano is null then
            v_anonimo := true;
        end if;

        if v_ciudadano is not null
           and not exists (select 1 from public.ciudadanos c where c.id = v_ciudadano and c.activo) then
            raise exception 'El ciudadano seleccionado no existe o está inactivo.' using errcode = '23503';
        end if;
    end if;

    -- ── Ubicación y jurisdicción ─────────────────────────────────────────
    if v_categoria.requiere_ubicacion and (p_lat is null or p_lng is null) then
        raise exception 'Esta categoría exige ubicación y no se recibió ninguna.' using errcode = '23502';
    end if;

    if p_lat is not null and p_lng is not null then
        select r.distrito_id, r.exacto into v_distrito_id, v_exacto
          from public.resolver_distrito(p_lat, p_lng) r;
        if v_distrito_id is null then
            raise exception
                'La ubicación está fuera de San Salvador Sur. Acércate al punto del incidente o corrígelo en el mapa.'
                using errcode = '23514';
        end if;
    else
        select u.distrito_id into v_distrito_id from public.usuarios u where u.id = v_usuario_id;
        v_exacto := false;
        if v_distrito_id is null then
            raise exception 'No hay ubicación y tu usuario no tiene distrito asignado.' using errcode = '23502';
        end if;
    end if;

    -- ── Canal ────────────────────────────────────────────────────────────
    select id into v_canal_id from public.canales_reporte where codigo = p_canal_codigo and activo;
    if v_canal_id is null then
        raise exception 'Canal de reporte "%" desconocido.', p_canal_codigo using errcode = '23503';
    end if;

    -- ── Alta ─────────────────────────────────────────────────────────────
    -- `creado_por_usuario_id` es SIEMPRE el empleado. El denunciante va en sus
    -- propias columnas, así que el Centro de Monitoreo ve las dos cosas: quién
    -- reportó y quién lo registró.
    insert into public.casos (
        categoria_id, distrito_id, canal_reporte_id,
        creado_por_usuario_id, titulo, descripcion, direccion_referencia,
        ubicacion, fecha_recibido, referencia_cliente,
        denunciante_es_anonimo, denunciante_nombre, denunciante_telefono,
        denunciante_ciudadano_id
    ) values (
        p_categoria_id, v_distrito_id, v_canal_id,
        v_usuario_id,
        coalesce(nullif(trim(p_titulo), ''), v_categoria.nombre),
        trim(p_descripcion),
        trim(p_direccion_referencia),
        case when p_lat is not null and p_lng is not null
             then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography else null end,
        now(),
        p_referencia_cliente,
        v_anonimo, v_nombre, v_telefono, v_ciudadano
    )
    returning id, correlativo, estado_codigo into v_caso_id, v_correlativo, v_estado;

    -- ── Evidencias ───────────────────────────────────────────────────────
    for v_adjunto in select * from jsonb_array_elements(coalesce(p_adjuntos, '[]'::jsonb))
    loop
        if coalesce(v_adjunto ->> 'url', '') <> '' then
            insert into public.casos_adjuntos (
                caso_id, tipo_archivo, es_evidencia, url_supabase,
                nombre_archivo, mime_type, tamano_bytes
            ) values (
                v_caso_id, coalesce(v_adjunto ->> 'tipo', 'foto'), false,
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
        v_caso_id, null, v_estado, v_usuario_id,
        'Alta desde territorio'
        || case when v_exacto is false then ' (ubicación asignada por cercanía)' else '' end
        || case when v_anonimo then ' · denunciante anónimo' else ' · denunciante identificado' end
    );

    return jsonb_build_object(
        'ok', true,
        'caso_id', v_caso_id,
        'correlativo', v_correlativo,
        'distrito_id', v_distrito_id,
        'ubicacion_exacta', coalesce(v_exacto, false),
        'denunciante_anonimo', v_anonimo,
        'duplicado', false,
        'mensaje', 'Reporte registrado con el número ' || v_correlativo || '.'
    );
end;
$$;

comment on function public.crear_caso_campo is
    'Alta de un caso desde la PWA de campo. El creador es siempre el empleado '
    '(auth.uid()); el denunciante es un dato aparte, anónimo por defecto y '
    'normalizado en el servidor. Idempotente por referencia_cliente.';

-- ----------------------------------------------------------------------------
-- 4. Lectura de la configuración global
--
--    `configuracion.valor` guarda preferencias de presentación —colores de KPI,
--    estado inicial del mapa, tonos de alerta— y el interruptor de contextos.
--    No hay secretos: las credenciales SMTP viven en `configuracion_smtp`, que
--    es otra tabla y sigue cerrada. La escritura NO se toca: superadmin.
-- ----------------------------------------------------------------------------
drop policy if exists "config_admin_select" on public.configuracion;
drop policy if exists "config_lectura_autenticados" on public.configuracion;
create policy "config_lectura_autenticados"
    on public.configuracion for select to authenticated
    using (true);

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) Alta anónima (por defecto). `denunciante_anonimo` debe volver true.
-- select public.crear_caso_campo(
--          (select id from public.categorias_caso where codigo = 'VIA-BACHE'),
--          'Bache profundo frente al portón del mercado municipal.',
--          'Calle principal, frente al mercado', 13.6560, -89.1830);

-- 2) Alta identificada. El caso debe guardar AL EMPLEADO como creador y al
--    vecino como denunciante, las dos cosas a la vez.
-- select public.crear_caso_campo(
--          (select id from public.categorias_caso where codigo = 'VIA-BACHE'),
--          'Luminaria apagada desde hace una semana en la entrada.',
--          'Entrada de la colonia, poste esquinero', 13.6560, -89.1830,
--          null, 'pwa_empleado', null, '[]'::jsonb,
--          false, 'María Elena Portillo', '7712-3456');

-- 3) Comprobar que se ven las dos autorías:
-- select c.correlativo,
--        u.nombres || ' ' || u.apellidos      as registrado_por_empleado,
--        c.denunciante_es_anonimo,
--        c.denunciante_nombre, c.denunciante_telefono
--   from public.casos c
--   join public.usuarios u on u.id = c.creado_por_usuario_id
--  order by c.id desc limit 5;

-- 4) La restricción de anonimato debe RECHAZAR esto:
-- update public.casos set denunciante_es_anonimo = true
--  where denunciante_nombre is not null;
--    → ERROR: new row violates check constraint "ck_casos_denunciante_anonimo"

-- 5) Búsqueda por DUI y por teléfono, con y sin formato.
-- select * from public.buscar_ciudadano('01234567-8');
-- select * from public.buscar_ciudadano('+503 7712 3456');
-- select * from public.buscar_ciudadano('Maria');   -- debe devolver 0 filas
