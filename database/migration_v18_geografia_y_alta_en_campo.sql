-- ============================================================================
-- MIGRACIÓN v18 · GEOGRAFÍA DEL MUNICIPIO Y ALTA DE CASOS EN CAMPO
--
-- PARA QUÉ
--   El encargo es que un empleado pueda reportar desde territorio y que el
--   Centro de Monitoreo lo vea. Hoy eso NO ocurre: el alta desde la PWA envía
--   columnas que no existen (`coordenadas`, `es_anonima`, `origen`) y omite
--   cinco columnas `not null`, así que todo insert falla, cae al buzón offline
--   y allí se reintenta con el mismo cuerpo inválido hasta agotarse. El
--   empleado ve "guardado sin conexión" estando conectado.
--
--   Esta migración traslada a la base la parte que el navegador no puede hacer
--   bien: resolver el distrito por la ubicación real, rellenar las claves
--   foráneas obligatorias y dejar constancia de quién reportó, sin que el
--   cliente pueda falsear nada.
--
-- BLOQUEANTE QUE SE CORRIGE AQUÍ (sección 3)
--   `ck_casos_bbox_sssur` limita los casos a lat 13.50–13.85 y lng −89.40–−89.05.
--   Medido contra la cartografía oficial recién entregada, ese rectángulo deja
--   FUERA territorio real de TRES de los cinco distritos:
--       · Panchimalco       baja hasta 13.4732  (< 13.50)
--       · Rosario de Mora   baja hasta 13.4787  (< 13.50)
--       · Santiago Texacuangos llega a −89.0419 (> −89.05)
--   Es decir: un empleado en el sur de Panchimalco no puede registrar un caso.
--
-- DECISIONES DE DISEÑO
--   · El distrito NO lo manda el cliente. Se deduce del punto contra los
--     polígonos oficiales. Un teléfono puede mentir; un `ST_Intersects` contra
--     la geometría del municipio, no. Es a la vez la validación de
--     jurisdicción: si el punto no cae en ningún distrito, no hay caso.
--   · `crear_caso_campo` es SECURITY INVOKER a propósito. La autorización sigue
--     estando en la policy `casos_insert` —una sola fuente de verdad— y la
--     función se limita a resolver campos y validar. Con SECURITY DEFINER
--     habría dos sitios donde decidir quién puede crear casos.
--   · Idempotencia por `referencia_cliente`. Sin ella, un corte de red después
--     del insert pero antes de la respuesta hace que el buzón offline reintente
--     y duplique el caso. Es el modo de fallo NORMAL de una app de campo, no
--     una rareza.
--
-- REQUIERE: schema.sql, migration_v9, v11, v15 y **v16**. IDEMPOTENTE.
-- DESPUÉS:  ejecutar seed_v18_distritos_geometria.sql (obligatorio)
--           y seed_v18_colonias_san_marcos.sql (opcional, cartografía).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Comprobación previa
--
--    La sección 7 reescribe `casos_select` apoyándose en las funciones de
--    alcance que introduce la v16. Si esa migración no se ha ejecutado, sin
--    esta comprobación el fallo llegaría a mitad del script con un "function
--    does not exist" que no dice qué hay que hacer.
-- ----------------------------------------------------------------------------
do $$
declare
    v_faltan text[];
    v_nombre text;
begin
    foreach v_nombre in array array[
        'auth_ve_todo_el_municipio', 'auth_incluye_asignados_a_mi',
        'auth_cuadrillas_del_usuario', 'auth_alcance_combinador',
        'auth_distritos_visibles', 'auth_departamentos_visibles',
        'auth_categorias_visibles'
    ] loop
        if not exists (
            select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = v_nombre
        ) then
            v_faltan := array_append(v_faltan, v_nombre);
        end if;
    end loop;

    if array_length(v_faltan, 1) > 0 then
        raise exception
            'Falta ejecutar migration_v16_alcance_territorial.sql. No se encontraron: %',
            array_to_string(v_faltan, ', ');
    end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Geometría de los distritos
--
--    Hasta ahora los polígonos solo vivían en un .js del navegador
--    (services/geo-json/), así que el servidor no podía comprobar nada: era
--    imposible saber si un caso caía dentro del municipio o en qué distrito.
-- ----------------------------------------------------------------------------
alter table public.distritos
    add column if not exists geometria geometry(MultiPolygon, 4326);

comment on column public.distritos.geometria is
    'Límite oficial del distrito (Catastro). Fuente: limites-sssur.geojson. '
    'Es la referencia que resuelve el distrito de un caso y valida jurisdicción.';

-- Índice GIST: convierte el «¿en qué distrito cae este punto?» en una sonda
-- sobre el árbol —O(log n)— en vez de comparar contra los cinco polígonos
-- completos. Con 5 filas da igual; con las colonias de la sección 2 no.
create index if not exists ix_distritos_geometria
    on public.distritos using gist (geometria);

-- ----------------------------------------------------------------------------
-- 2. Colonias, barrios y lotificaciones
--
--    Cartografía de detalle. Da contenido al filtro por centro poblacional del
--    Mapa en Vivo, que hoy apunta a una columna inexistente y no filtra nada.
-- ----------------------------------------------------------------------------
create table if not exists public.colonias (
    id          bigint generated always as identity primary key,
    distrito_id smallint not null references public.distritos(id),
    nombre      text     not null,
    zona        smallint,
    viviendas   integer,
    geometria   geometry(MultiPolygon, 4326) not null,
    activo      boolean  not null default true,
    created_at  timestamptz not null default now(),
    -- El nombre se repite entre distritos ("Colonia San Rafael" existe en
    -- varios), pero no dentro del mismo. Es además la clave del `on conflict`
    -- que hace recargable el seed.
    constraint uq_colonias_distrito_nombre unique (distrito_id, nombre)
);

comment on table public.colonias is
    'Centros poblacionales: colonias, barrios, lotificaciones y comunidades. '
    'Cargados por distrito conforme Catastro los entrega.';

create index if not exists ix_colonias_geometria on public.colonias using gist (geometria);
create index if not exists ix_colonias_distrito  on public.colonias (distrito_id) where activo;

alter table public.colonias enable row level security;

drop policy if exists "colonias_select" on public.colonias;
create policy "colonias_select"
    on public.colonias for select to authenticated
    using (true);   -- catálogo territorial: no hay nada sensible que ocultar

drop policy if exists "colonias_write" on public.colonias;
create policy "colonias_write"
    on public.colonias for all to authenticated
    using (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'));

-- ----------------------------------------------------------------------------
-- 3. Corrección del rectángulo de cobertura
--
--    Valores nuevos medidos sobre la cartografía oficial, con ~2 km de margen:
--        lat 13.4732 … 13.6784   →   13.45 … 13.70
--        lng −89.2381 … −89.0419 →  −89.26 … −89.02
--    Ojo: el nuevo rectángulo es MÁS ESTRECHO por el oeste (el anterior llegaba
--    a −89.40, que es San Salvador capital) y más ancho por el sur y el este.
--
--    Se añaden como NOT VALID: si quedaron filas de prueba fuera del municipio,
--    la migración no debe abortar por ellas. Las filas NUEVAS sí se validan,
--    que es lo que protege de aquí en adelante.
-- ----------------------------------------------------------------------------
alter table public.casos drop constraint if exists ck_casos_bbox_sssur;
alter table public.casos add constraint ck_casos_bbox_sssur check (
    ubicacion is null or (
        st_y(ubicacion::geometry) between 13.45 and 13.70
        and st_x(ubicacion::geometry) between -89.26 and -89.02
    )
) not valid;

alter table public.casos drop constraint if exists chk_casos_recorrido_bbox;
alter table public.casos add constraint chk_casos_recorrido_bbox check (
    recorrido is null or (
        st_ymin(recorrido::geometry) >= 13.45
        and st_ymax(recorrido::geometry) <= 13.70
        and st_xmin(recorrido::geometry) >= -89.26
        and st_xmax(recorrido::geometry) <= -89.02
    )
) not valid;

-- ----------------------------------------------------------------------------
-- 4. Idempotencia del alta en campo
--
--    `referencia_cliente` es el identificador que genera la PWA para cada
--    operación encolada. Si la respuesta se pierde y el buzón reintenta, el
--    segundo intento reconoce la referencia y devuelve el caso ya creado en
--    lugar de duplicarlo.
--
--    Índice PARCIAL: solo indexa lo que no es nulo. Los casos creados desde el
--    Centro de Monitoreo no llevan referencia, y sin el `where` todos ellos
--    competirían por el valor NULL y engordarían el índice sin aportar nada.
-- ----------------------------------------------------------------------------
alter table public.casos
    add column if not exists referencia_cliente text;

comment on column public.casos.referencia_cliente is
    'Identificador de la operación offline que originó el caso. Hace idempotente '
    'el reintento del buzón de la PWA. Nulo si el caso nació en el Centro de Monitoreo.';

create unique index if not exists uq_casos_referencia_cliente
    on public.casos (referencia_cliente) where referencia_cliente is not null;

-- ----------------------------------------------------------------------------
-- 5. Resolución territorial de un punto
--
--    Devuelve el distrito que contiene la coordenada y si la correspondencia
--    fue exacta.
--
--    Por qué dos etapas:
--      · `ST_Intersects` y no `ST_Contains`: un punto justo SOBRE el límite no
--        está "contenido" en ningún polígono, y el límite entre dos distritos
--        es exactamente donde más se reporta (una calle divisoria).
--      · Cercanía como respaldo: el GPS de un teléfono en una quebrada tiene
--        30–50 m de error con normalidad. Rechazar un reporte legítimo porque
--        la lectura derivó 20 m al otro lado de la línea es peor que asignarlo
--        al distrito contiguo, que además casi siempre es el correcto. El
--        llamador recibe `exacto = false` para poder avisarlo.
--
--    SECURITY DEFINER: `distritos` es catálogo público y así la función no
--    depende de que el rol tenga select sobre él. STABLE y PARALLEL SAFE para
--    que el planificador la pueda usar dentro de otras consultas.
-- ----------------------------------------------------------------------------
create or replace function public.resolver_distrito(
    p_lat               double precision,
    p_lng               double precision,
    p_tolerancia_metros integer default 150
)
returns table (distrito_id smallint, exacto boolean)
language plpgsql
stable
parallel safe
security definer
set search_path = public
as $$
declare
    v_punto geometry := st_setsrid(st_makepoint(p_lng, p_lat), 4326);
    v_id    smallint;
begin
    if p_lat is null or p_lng is null then
        return;   -- sin coordenada no hay nada que resolver: cero filas
    end if;

    -- Etapa 1 · pertenencia real. `st_intersects` aprovecha el índice GIST:
    -- descarta por caja envolvente y solo hace la prueba exacta contra el
    -- polígono candidato, en vez de recorrer los cinco completos.
    select d.id into v_id
      from public.distritos d
     where d.activo
       and d.geometria is not null
       and st_intersects(d.geometria, v_punto)
     -- Un punto sobre la línea divisoria intersecta con los DOS distritos.
     -- Ordenar hace la respuesta determinista en vez de depender del plan.
     order by d.id
     limit 1;

    if v_id is not null then
        distrito_id := v_id; exacto := true; return next; return;
    end if;

    -- Etapa 2 · respaldo por cercanía. Se llega aquí solo si la etapa 1 falló,
    -- que es lo que justifica plpgsql en vez de un UNION: el cálculo de
    -- distancias, mucho más caro, no se ejecuta en el caso normal.
    select d.id into v_id
      from public.distritos d
     where d.activo
       and d.geometria is not null
       and st_dwithin(d.geometria::geography, v_punto::geography, p_tolerancia_metros)
     order by st_distance(d.geometria::geography, v_punto::geography), d.id
     limit 1;

    if v_id is not null then
        distrito_id := v_id; exacto := false; return next;
    end if;
    -- Sin coincidencia: cero filas. El llamador decide si eso es un rechazo.
end;
$$;

comment on function public.resolver_distrito is
    'Distrito que corresponde a una coordenada. `exacto=false` significa que el '
    'punto cayó fuera de todo polígono y se asignó por cercanía dentro de la '
    'tolerancia; conviene avisarlo en la interfaz.';

-- ----------------------------------------------------------------------------
-- 6. Alta de un caso desde territorio
--
--    Fachada: una sola llamada atómica que valida, resuelve las claves
--    foráneas obligatorias, crea el caso y adjunta las evidencias. El cliente
--    envía lo que de verdad conoce —qué, dónde y una descripción— y nada más.
--
--    Lo que NO recibe del cliente, a propósito:
--      · el usuario que reporta  → `auth.uid()`, no es falsificable
--      · el distrito             → se deduce del punto (sección 5)
--      · departamento y prioridad→ los rellena `trg_casos_sync_campos` desde
--                                   la categoría, que ya existía y nadie usaba
--      · el estado inicial       → `categorias_caso.estado_inicial`. El cliente
--                                   mandaba 'recibida', pero el flujo sembrado
--                                   en v9 arranca en 'pendiente': los casos
--                                   nacían en un estado fuera de su propio flujo.
-- ----------------------------------------------------------------------------
create or replace function public.crear_caso_campo(
    p_categoria_id          bigint,
    p_descripcion           text,
    p_direccion_referencia  text,
    p_lat                   double precision,
    p_lng                   double precision,
    p_titulo                text    default null,
    p_canal_codigo          text    default 'pwa_empleado',
    p_referencia_cliente    text    default null,
    p_adjuntos              jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
-- SECURITY DEFINER, y no invoker, por una razón concreta y comprobada:
-- PostgreSQL aplica las policies de SELECT a la salida de `INSERT … RETURNING`,
-- y `casos_select` (v16) no contempla «lo que yo reporté». Un empleado con
-- alcance `solo_asignados` crea un caso que todavía no tiene responsable, así
-- que no pasaría su propia policy de lectura y el RETURNING fallaría — es decir,
-- fallaría justo para el usuario al que va dirigida esta función.
--
-- A cambio, la autorización se comprueba aquí de forma explícita, con el MISMO
-- predicado que usa la policy `casos_insert`. El resto de garantías no dependen
-- del modo: el usuario y el distrito no se reciben del cliente, se deducen.
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
begin
    -- ── Identidad ────────────────────────────────────────────────────────
    if v_usuario_id is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.'
            using errcode = '28000';
    end if;

    if not exists (select 1 from public.usuarios u where u.id = v_usuario_id and u.activo) then
        raise exception 'Tu usuario no está activo en el sistema.'
            using errcode = '28000';
    end if;

    -- ── Autorización ─────────────────────────────────────────────────────
    -- Mismo predicado que la policy `casos_insert`. `auth_tiene_permiso` usa
    -- `bool_or`, que sobre cero filas devuelve NULL: sin el `coalesce` la
    -- condición sería NULL y el `if not` no entraría — denegar por NULL es
    -- denegar por accidente, no por diseño.
    if not (
        coalesce(public.auth_tiene_permiso('casos', 'crear'), false)
        or coalesce(public.auth_tiene_rol('admin'), false)
        or coalesce(public.auth_tiene_rol('superadmin'), false)
    ) then
        raise exception 'Tu rol no tiene permiso para registrar casos.'
            using errcode = '42501';
    end if;

    -- ── Idempotencia ─────────────────────────────────────────────────────
    -- Antes de trabajar: si esta operación ya se registró, se devuelve el
    -- mismo caso. Es lo que permite al buzón offline reintentar sin miedo.
    if p_referencia_cliente is not null then
        select c.id, c.correlativo into v_existente, v_correlativo
          from public.casos c
         where c.referencia_cliente = p_referencia_cliente;
        if v_existente is not null then
            return jsonb_build_object(
                'ok', true, 'caso_id', v_existente, 'correlativo', v_correlativo,
                'duplicado', true,
                'mensaje', 'Este reporte ya estaba registrado.'
            );
        end if;
    end if;

    -- ── Categoría ────────────────────────────────────────────────────────
    select * into v_categoria
      from public.categorias_caso
     where id = p_categoria_id and activo;

    if not found then
        raise exception 'La categoría seleccionada no existe o está desactivada.'
            using errcode = '23503';
    end if;

    -- ── Contenido ────────────────────────────────────────────────────────
    -- Se valida aquí y no solo con los CHECK de la tabla para poder dar un
    -- mensaje que el empleado entienda: `char_length between 10 and 2000` en
    -- crudo no le dice nada a nadie en territorio.
    if p_descripcion is null or char_length(trim(p_descripcion)) < 10 then
        raise exception 'La descripción debe tener al menos 10 caracteres.'
            using errcode = '23514';
    end if;
    if char_length(trim(p_descripcion)) > 2000 then
        raise exception 'La descripción no puede pasar de 2000 caracteres.'
            using errcode = '23514';
    end if;
    if p_direccion_referencia is null or char_length(trim(p_direccion_referencia)) < 5 then
        raise exception 'Indica una referencia de dirección de al menos 5 caracteres.'
            using errcode = '23514';
    end if;

    -- ── Ubicación y jurisdicción ─────────────────────────────────────────
    if v_categoria.requiere_ubicacion and (p_lat is null or p_lng is null) then
        raise exception 'Esta categoría exige ubicación y no se recibió ninguna.'
            using errcode = '23502';
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
        -- Sin coordenada, el caso se adscribe al distrito del propio empleado.
        select u.distrito_id into v_distrito_id
          from public.usuarios u where u.id = v_usuario_id;
        v_exacto := false;

        if v_distrito_id is null then
            raise exception 'No hay ubicación y tu usuario no tiene distrito asignado.'
                using errcode = '23502';
        end if;
    end if;

    -- ── Canal ────────────────────────────────────────────────────────────
    select id into v_canal_id
      from public.canales_reporte where codigo = p_canal_codigo and activo;
    if v_canal_id is null then
        raise exception 'Canal de reporte "%" desconocido.', p_canal_codigo
            using errcode = '23503';
    end if;

    -- ── Alta ─────────────────────────────────────────────────────────────
    -- `departamento_actual_id`, `prioridad_id`, `estado_codigo` y `correlativo`
    -- se dejan nulos: los rellena trg_casos_sync_campos (schema.sql:580) desde
    -- la categoría, antes de que se comprueben los NOT NULL.
    insert into public.casos (
        categoria_id, distrito_id, canal_reporte_id,
        creado_por_usuario_id, titulo, descripcion, direccion_referencia,
        ubicacion, fecha_recibido, referencia_cliente
    ) values (
        p_categoria_id, v_distrito_id, v_canal_id,
        v_usuario_id,
        coalesce(nullif(trim(p_titulo), ''), v_categoria.nombre),
        trim(p_descripcion),
        trim(p_direccion_referencia),
        case when p_lat is not null and p_lng is not null
             then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
             else null end,
        now(),
        p_referencia_cliente
    )
    returning id, correlativo, estado_codigo
         into v_caso_id, v_correlativo, v_estado;

    -- ── Evidencias ───────────────────────────────────────────────────────
    -- Las fotos viven en cPanel; aquí solo se guarda la referencia. Un adjunto
    -- mal formado no debe tumbar un reporte que ya es válido, así que se
    -- omiten los que no traigan url.
    for v_adjunto in select * from jsonb_array_elements(coalesce(p_adjuntos, '[]'::jsonb))
    loop
        if coalesce(v_adjunto ->> 'url', '') <> '' then
            insert into public.casos_adjuntos (
                caso_id, tipo_archivo, es_evidencia, url_supabase,
                nombre_archivo, mime_type, tamano_bytes
            ) values (
                v_caso_id,
                coalesce(v_adjunto ->> 'tipo', 'foto'),
                false,                                   -- referencia inicial, no cierre
                v_adjunto ->> 'url',
                v_adjunto ->> 'nombre',
                v_adjunto ->> 'mime',
                (v_adjunto ->> 'tamano')::bigint
            );
        end if;
    end loop;

    -- ── Trazabilidad ─────────────────────────────────────────────────────
    -- El estado sale del RETURNING de arriba y no de una relectura de `casos`:
    -- releer obligaría a pasar por `casos_select`, y un caso recién creado sin
    -- responsable no la pasa para un empleado con alcance `solo_asignados`. La
    -- fila de historial se habría perdido en silencio.
    insert into public.historial_estados_caso (
        caso_id, estado_codigo_anterior, estado_codigo_nuevo,
        cambiado_por_usuario_id, observacion
    ) values (
        v_caso_id, null, v_estado, v_usuario_id,
        'Alta desde territorio' ||
        case when v_exacto is false then ' (ubicación asignada por cercanía)' else '' end
    );

    return jsonb_build_object(
        'ok', true,
        'caso_id', v_caso_id,
        'correlativo', v_correlativo,
        'distrito_id', v_distrito_id,
        'ubicacion_exacta', coalesce(v_exacto, false),
        'duplicado', false,
        'mensaje', 'Reporte registrado con el número ' || v_correlativo || '.'
    );
end;
$$;

comment on function public.crear_caso_campo is
    'Alta de un caso desde la PWA de campo. Deduce distrito por la ubicación, '
    'rellena las FK obligatorias vía trg_casos_sync_campos y es idempotente por '
    'referencia_cliente para que el buzón offline pueda reintentar sin duplicar.';

-- ----------------------------------------------------------------------------
-- 7. «Lo que yo reporté es mío»
--
--    Hueco real en `casos_select` (v16): la policy contempla lo asignado al
--    usuario y lo de su cuadrilla, pero NO lo que él mismo creó. Un empleado
--    con alcance `solo_asignados` levanta un parte —que aún no tiene
--    responsable— y desaparece de su vista: no puede consultarlo, ni ver en qué
--    estado quedó, ni comprobar que llegó. Para una app de campo eso solo
--    puede leerse de una forma: "no se guardó".
--
--    Se reproduce la policy de v16 tal cual y se añade UNA rama. Va dentro de
--    la comprobación de permiso 'ver': quien no puede ver casos tampoco ve los
--    suyos. Y fuera del salvoconducto de `auth_incluye_asignados_a_mi`, porque
--    ese interruptor habla de asignación, no de autoría.
-- ----------------------------------------------------------------------------
drop policy if exists "casos_select" on public.casos;
create policy "casos_select"
    on public.casos for select to authenticated
    using (
        (select public.auth_ve_todo_el_municipio())
        or (
            coalesce((select public.auth_tiene_permiso('casos', 'ver')), false)
            and (
                -- Autoría: lo que yo reporté siempre lo puedo consultar
                creado_por_usuario_id = (select auth.uid())
                -- Salvoconducto: lo mío siempre es mío
                or (
                    (select public.auth_incluye_asignados_a_mi())
                    and (
                        usuario_responsable_id = (select auth.uid())
                        or cuadrilla_responsable_id = any ((select public.auth_cuadrillas_del_usuario())::bigint[])
                    )
                )
                or case (select public.auth_alcance_combinador())
                    when 'and' then
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        and (
                            departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                            or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                        )
                    else
                        distrito_id = any ((select public.auth_distritos_visibles())::smallint[])
                        or departamento_actual_id = any ((select public.auth_departamentos_visibles())::bigint[])
                        or categoria_id = any ((select public.auth_categorias_visibles())::bigint[])
                end
            )
        )
    );

-- ----------------------------------------------------------------------------
-- 8. Permisos de ejecución
--    Solo usuarios autenticados. `anon` no crea casos: el portal ciudadano
--    tiene su propio camino y sus propias reglas.
-- ----------------------------------------------------------------------------
revoke all on function public.resolver_distrito(double precision, double precision, integer) from public;
revoke all on function public.crear_caso_campo(bigint, text, text, double precision, double precision, text, text, text, jsonb) from public;

grant execute on function public.resolver_distrito(double precision, double precision, integer) to authenticated;
grant execute on function public.crear_caso_campo(bigint, text, text, double precision, double precision, text, text, text, jsonb) to authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN — ejecutar después de los seeds
-- ============================================================================

-- 1) Los cinco distritos con geometría válida y superficie razonable.
--    San Salvador Sur ronda los 290 km² en total.
-- select codigo, nombre,
--        round((st_area(geometria::geography) / 1e6)::numeric, 2) as km2,
--        st_npoints(geometria) as vertices,
--        st_isvalid(geometria) as valida
--   from public.distritos order by codigo;

-- 2) Resolución de un punto conocido (parque central de San Marcos).
--    Debe devolver el distrito SMA con exacto = true.
-- select d.codigo, d.nombre, r.exacto
--   from public.resolver_distrito(13.6560, -89.1830) r
--   join public.distritos d on d.id = r.distrito_id;

-- 3) Un punto claramente fuera (centro de San Salvador) no debe resolver nada.
-- select * from public.resolver_distrito(13.6989, -89.1914);

-- 4) Filas históricas que incumplen el nuevo rectángulo. Si devuelve algo, son
--    datos de prueba fuera del municipio: hay que corregirlos o borrarlos antes
--    de ejecutar `alter table public.casos validate constraint ck_casos_bbox_sssur`.
-- select id, correlativo, st_y(ubicacion::geometry) as lat, st_x(ubicacion::geometry) as lng
--   from public.casos
--  where ubicacion is not null
--    and not (st_y(ubicacion::geometry) between 13.45 and 13.70
--             and st_x(ubicacion::geometry) between -89.26 and -89.02);

-- 5) Alta de prueba. Debe devolver ok:true con correlativo, y repetirla con la
--    MISMA referencia debe devolver duplicado:true sin crear un segundo caso.
-- select public.crear_caso_campo(
--          (select id from public.categorias_caso where codigo = 'VIA-BACHE'),
--          'Bache profundo frente al portón del mercado municipal.',
--          'Calle principal, frente al mercado',
--          13.6560, -89.1830,
--          null, 'pwa_empleado', 'prueba-v18-001');
