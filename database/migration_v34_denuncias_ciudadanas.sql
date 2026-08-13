-- ============================================================================
-- MIGRACIÓN v34 · LA DENUNCIA CIUDADANA LLEGA AL CENTRO DE MONITOREO
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Bloque 3 del plan. Con la v32 el vecino ya tiene identidad; aquí gana la
-- capacidad de reportar y de seguir lo suyo.
--
-- Hoy una denuncia del portal se queda en `localStorage` y desaparece al borrar
-- los datos del navegador. Nunca llega a nadie.
--
-- ----------------------------------------------------------------------------
-- LO QUE HACE FALTA Y POR QUÉ
--
-- 1. La RLS vigente deja CIEGO al ciudadano. `casos_select` (v18) tiene una
--    rama de autoría, pero compara contra `creado_por_usuario_id` —la columna
--    de EMPLEADOS— y va dentro de `auth_tiene_permiso('casos','ver')`, que lee
--    de `public.usuarios`. Un ciudadano no tiene fila ahí: `bool_or` sobre cero
--    filas da NULL, el `coalesce` lo vuelve falso, y no vería ni sus propias
--    denuncias.
--
-- 2. `casos_insert` tiene el mismo problema, así que tampoco podría crearlas.
--    Y se deja así A PROPÓSITO: obliga a que toda alta pase por el RPC, que es
--    donde viven las validaciones y el tope diario. Abrir el INSERT directo
--    permitiría saltárselos desde la consola del navegador.
--
-- ----------------------------------------------------------------------------
-- ⚠ SOBRE «DENUNCIA ANÓNIMA» — LEER ANTES DE PROMETERLO EN LA INTERFAZ
--
-- La v21 dejó escrito, con razón:
--
--     «Anónimo tiene que significar que EL DATO NO ESTÁ, no que una bandera
--      pida no mirarlo mientras el nombre sigue en la columna.»
--
-- Desde el portal eso NO se puede cumplir del todo, y conviene decirlo claro:
-- `ck_casos_creador` exige que todo caso tenga autor —empleado o ciudadano— y
-- un caso del portal solo puede llevar `creado_por_ciudadano_id`. Sin él no hay
-- «Mis Denuncias», ni forma de avisar del resultado, ni control de abuso.
--
-- Así que aquí «anónima» significa exactamente esto:
--
--     · Los campos de denunciante quedan VACÍOS: el operador que atiende el
--       caso no ve nombre ni teléfono. Es real y es lo que la RLS enseña.
--     · El vínculo de autoría SÍ existe en `creado_por_ciudadano_id`. Quien
--       tenga acceso a la base puede saber quién lo reportó.
--
-- Es anonimato FRENTE AL OPERADOR, no frente a la institución. La interfaz debe
-- decirlo con esas palabras —«no mostrar mi nombre a quien atienda el caso»— y
-- no «denuncia anónima» a secas, que promete más de lo que se cumple.
--
-- REQUIERE: schema.sql, v11, v18, v21, v29, v32. IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Qué categorías se ofrecen al público
--
-- Por defecto NINGUNA. Se abre lo que se decida explícitamente, en vez de
-- exponer el catálogo interno entero y tener que ir cerrando.
--
-- Cierra además un desajuste que ya existía: el portal ofrecía 27 categorías
-- escritas a mano en `assets/js/utils/categorias-denuncias.js`, con ids que no
-- tienen ninguna relación con `categorias_caso`. Daba igual porque nada se
-- guardaba; en cuanto se guarda, importa mucho.
-- ----------------------------------------------------------------------------
alter table public.categorias_caso
    add column if not exists visible_ciudadano boolean not null default false;

comment on column public.categorias_caso.visible_ciudadano is
    'Si esta categoría se ofrece en el portal ciudadano. Por defecto FALSE: se '
    'abre lo que se decida, no se cierra lo que sobra.';

-- Índice parcial: la consulta del portal siempre filtra por las dos banderas y
-- son un puñado de filas frente al catálogo completo.
create index if not exists idx_categorias_visibles_ciudadano
    on public.categorias_caso (id) where activo and visible_ciudadano;

-- ----------------------------------------------------------------------------
-- 2. El ciudadano ve sus propias denuncias
--
-- Se reproduce la policy de la v18 TAL CUAL y se añade UNA rama, colocada
-- FUERA del `auth_tiene_permiso`: el ciudadano nunca lo va a satisfacer, así
-- que meterla dentro no serviría de nada.
-- ----------------------------------------------------------------------------
drop policy if exists "casos_select" on public.casos;
create policy "casos_select"
    on public.casos for select to authenticated
    using (
        -- Autoría ciudadana. Va la primera porque es la más barata de evaluar
        -- y resuelve el caso completo del portal sin tocar nada más.
        creado_por_ciudadano_id = (select auth.uid())
        or (select public.auth_ve_todo_el_municipio())
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

-- `casos_adjuntos` e `historial_estados_caso` NO se tocan: sus policies (v14)
-- son `exists (select 1 from casos c where c.id = caso_id)`, así que heredan la
-- rama nueva gratis. Ese diseño es correcto y conviene preservarlo.

-- Los ciudadanos consultan por autoría; sin este índice sería recorrido de tabla.
create index if not exists idx_casos_creado_por_ciudadano
    on public.casos (creado_por_ciudadano_id, created_at desc)
    where creado_por_ciudadano_id is not null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- 3. Alta de una denuncia ciudadana
--
-- `SECURITY DEFINER` por la misma razón documentada en `crear_caso_campo`:
-- PostgreSQL aplica las policies de SELECT a la salida de `INSERT … RETURNING`.
-- Aquí la rama de autoría ciudadana ya cubriría el caso, pero se mantiene
-- `definer` porque la función también escribe en `historial_estados_caso`, que
-- el ciudadano no puede tocar directamente, y porque el tope diario debe
-- contarse sobre TODAS sus denuncias, no sobre las que su RLS le deje ver.
-- ----------------------------------------------------------------------------
create or replace function public.crear_caso_ciudadano(
    p_categoria_id          bigint,
    p_descripcion           text,
    p_direccion_referencia  text,
    p_lat                   double precision,
    p_lng                   double precision,
    p_anonima               boolean default false,
    p_titulo                text    default null,
    p_referencia_cliente    text    default null,
    p_adjuntos              jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    -- Tope diario. Un formulario abierto al público sin límite es una
    -- invitación a inundar la bandeja. Diez cabe de sobra en un uso legítimo
    -- —varios baches de una misma calle— y corta un guion automatizado.
    c_tope_diario constant integer := 10;

    v_ciudadano   public.ciudadanos;
    v_categoria   public.categorias_caso;
    v_distrito_id smallint;
    v_exacto      boolean;
    v_canal_id    smallint;
    v_caso_id     bigint;
    v_correlativo text;
    v_estado      text;
    v_existente   bigint;
    v_adjunto     jsonb;
    v_hoy         integer;
    v_uid         uuid;
begin
    v_uid := auth.uid();

    -- ── Identidad ────────────────────────────────────────────────────────
    if v_uid is null then
        raise exception 'Sesión no válida. Vuelve a iniciar sesión.'
            using errcode = '28000';
    end if;

    select * into v_ciudadano from public.ciudadanos where id = v_uid;
    if not found then
        raise exception 'Esta cuenta no es del portal ciudadano.'
            using errcode = '42501';
    end if;
    if not v_ciudadano.activo then
        raise exception 'Tu cuenta está desactivada. Acude a la Alcaldía.'
            using errcode = '42501';
    end if;

    -- ── Idempotencia ─────────────────────────────────────────────────────
    -- Permite reintentar sin duplicar cuando el envío se corta a media
    -- conexión, que en territorio con mala cobertura pasa a menudo.
    if p_referencia_cliente is not null then
        select c.id, c.correlativo into v_existente, v_correlativo
          from public.casos c
         where c.referencia_cliente = p_referencia_cliente;
        if v_existente is not null then
            return jsonb_build_object(
                'ok', true, 'caso_id', v_existente, 'correlativo', v_correlativo,
                'duplicado', true,
                'mensaje', 'Esta denuncia ya estaba registrada.'
            );
        end if;
    end if;

    -- ── Tope diario ──────────────────────────────────────────────────────
    -- Se cuenta antes de validar el contenido: si ya topó, no tiene sentido
    -- hacerle corregir la descripción para luego rechazarla igual.
    select count(*) into v_hoy
      from public.casos
     where creado_por_ciudadano_id = v_uid
       and created_at >= now() - interval '24 hours';

    if v_hoy >= c_tope_diario then
        raise exception
            'Has registrado % denuncias en las últimas 24 horas, que es el máximo. '
            'Vuelve a intentarlo más tarde.', v_hoy
            using errcode = '54000';
    end if;

    -- ── Categoría ────────────────────────────────────────────────────────
    select * into v_categoria
      from public.categorias_caso
     where id = p_categoria_id and activo and visible_ciudadano;

    if not found then
        raise exception 'Esa categoría no está disponible para reportes ciudadanos.'
            using errcode = '23503';
    end if;

    -- ── Contenido ────────────────────────────────────────────────────────
    -- Se valida aquí y no solo con los CHECK de la tabla para poder dar un
    -- mensaje entendible: `char_length between 10 and 2000` no le dice nada a
    -- un vecino.
    if p_descripcion is null or char_length(trim(p_descripcion)) < 10 then
        raise exception 'Cuenta un poco más: la descripción necesita al menos 10 caracteres.'
            using errcode = '23514';
    end if;
    if char_length(trim(p_descripcion)) > 2000 then
        raise exception 'La descripción no puede pasar de 2000 caracteres.'
            using errcode = '23514';
    end if;
    if p_direccion_referencia is null or char_length(trim(p_direccion_referencia)) < 5 then
        raise exception 'Indica un punto de referencia de al menos 5 caracteres.'
            using errcode = '23514';
    end if;

    -- ── Ubicación y jurisdicción ─────────────────────────────────────────
    if v_categoria.requiere_ubicacion and (p_lat is null or p_lng is null) then
        raise exception 'Marca en el mapa dónde ocurre el problema.'
            using errcode = '23502';
    end if;

    if p_lat is not null and p_lng is not null then
        select r.distrito_id, r.exacto into v_distrito_id, v_exacto
          from public.resolver_distrito(p_lat, p_lng) r;

        if v_distrito_id is null then
            raise exception
                'Ese punto está fuera de San Salvador Sur. Corrígelo en el mapa.'
                using errcode = '23514';
        end if;
    else
        -- Sin coordenada, el caso se adscribe al distrito declarado por el
        -- vecino en su perfil.
        v_distrito_id := v_ciudadano.distrito_id;
        v_exacto := false;

        if v_distrito_id is null then
            raise exception
                'No marcaste el punto y tu perfil no tiene distrito. Añádelo en Mi Perfil.'
                using errcode = '23502';
        end if;
    end if;

    -- ── Canal ────────────────────────────────────────────────────────────
    -- Forzado, no es parámetro: la procedencia de un caso no la decide quien
    -- lo envía.
    select id into v_canal_id
      from public.canales_reporte where codigo = 'portal_ciudadano' and activo;
    if v_canal_id is null then
        raise exception 'El canal «portal_ciudadano» no está configurado.'
            using errcode = '23503';
    end if;

    -- ── Alta ─────────────────────────────────────────────────────────────
    -- `departamento_actual_id`, `prioridad_id`, `estado_codigo` y `correlativo`
    -- se dejan nulos: los rellena el trigger de sincronización desde la
    -- categoría, antes de que se comprueben los NOT NULL. Un ciudadano no
    -- clasifica la urgencia ni el departamento de su propio reporte.
    --
    -- Los campos de denunciante siguen la restricción `ck_casos_denunciante_anonimo`
    -- de la v21: si es anónima, los TRES van nulos. Ver el aviso del encabezado
    -- sobre qué garantiza y qué no.
    insert into public.casos (
        categoria_id, distrito_id, canal_reporte_id,
        creado_por_ciudadano_id, titulo, descripcion, direccion_referencia,
        ubicacion, fecha_recibido, referencia_cliente,
        denunciante_es_anonimo, denunciante_nombre,
        denunciante_telefono, denunciante_ciudadano_id
    ) values (
        p_categoria_id, v_distrito_id, v_canal_id,
        v_uid,
        coalesce(nullif(trim(p_titulo), ''), v_categoria.nombre),
        trim(p_descripcion),
        trim(p_direccion_referencia),
        case when p_lat is not null and p_lng is not null
             then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
             else null end,
        now(),
        p_referencia_cliente,
        coalesce(p_anonima, false),
        case when coalesce(p_anonima, false) then null
             else trim(coalesce(v_ciudadano.nombres, '') || ' ' || coalesce(v_ciudadano.apellidos, '')) end,
        case when coalesce(p_anonima, false) then null else v_ciudadano.telefono end,
        case when coalesce(p_anonima, false) then null else v_uid end
    )
    returning id, correlativo, estado_codigo
         into v_caso_id, v_correlativo, v_estado;

    -- ── Evidencias ───────────────────────────────────────────────────────
    -- Las fotos viven en cPanel; aquí solo se guarda la referencia. Un adjunto
    -- mal formado no debe tumbar una denuncia que ya es válida.
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
    -- `cambiado_por_usuario_id` va NULO: la columna referencia `usuarios` y
    -- quien reportó no está ahí. La procedencia queda en la observación, que es
    -- lo que lee un operador.
    insert into public.historial_estados_caso (
        caso_id, estado_codigo_anterior, estado_codigo_nuevo,
        cambiado_por_usuario_id, observacion
    ) values (
        v_caso_id, null, v_estado, null,
        'Alta desde el portal ciudadano' ||
        case when v_exacto is false then ' (ubicación aproximada)' else '' end
    );

    return jsonb_build_object(
        'ok', true,
        'caso_id', v_caso_id,
        'correlativo', v_correlativo,
        'distrito_id', v_distrito_id,
        'ubicacion_exacta', coalesce(v_exacto, false),
        'duplicado', false,
        'mensaje', 'Denuncia registrada con el número ' || v_correlativo || '.'
    );
end;
$$;

comment on function public.crear_caso_ciudadano(bigint, text, text, double precision, double precision, boolean, text, text, jsonb) is
    'Alta de denuncia desde el portal. Canal forzado, sin elección de prioridad '
    'ni departamento, solo categorías con visible_ciudadano y con tope diario.';

revoke all on function public.crear_caso_ciudadano(bigint, text, text, double precision, double precision, boolean, text, text, jsonb) from public;
grant execute on function public.crear_caso_ciudadano(bigint, text, text, double precision, double precision, boolean, text, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Lo que el ciudadano ve de su propia denuncia
--
-- `security_invoker = on`: la vista se evalúa con los permisos de quien
-- consulta, así que la RLS de `casos` sigue aplicando y cada quien ve lo suyo.
-- Sin esto la vista correría con los del creador y las enseñaría todas.
--
-- QUÉ SE DEJA FUERA, Y NO ES POR LIMPIEZA
--   · `observaciones_internas` — notas del personal entre ellos.
--   · `usuario_responsable_id` y la cuadrilla — el vecino no tiene por qué
--     saber el nombre del empleado que atiende su caso. Es privacidad DEL
--     PERSONAL, y evita que se le busque por fuera del canal oficial.
--   · Las derivaciones entre departamentos — política interna.
--
-- Sí ve: en qué estado está, cuándo lo puso, de qué es, dónde, y la resolución
-- cuando exista. Que es lo que se le prometió al aceptar la denuncia.
-- ----------------------------------------------------------------------------
drop view if exists public.v_mis_denuncias_ciudadano;
create view public.v_mis_denuncias_ciudadano
with (security_invoker = on) as
select
    c.id,
    c.correlativo,
    c.titulo,
    c.descripcion,
    c.direccion_referencia,
    c.estado_codigo,
    c.categoria_id,
    cat.nombre        as categoria_nombre,
    cat.icono         as categoria_icono,
    cat.color_hex     as categoria_color,
    c.distrito_id,
    d.nombre          as distrito_nombre,
    -- Se exponen como números y no como geografía: el navegador dibuja con
    -- lat/lng, y PostgREST serializa `geography` de formas distintas según
    -- versión —ya obligó a escribir un decodificador de EWKB en el frontend—.
    st_y(c.ubicacion::geometry) as lat,
    st_x(c.ubicacion::geometry) as lng,
    c.denunciante_es_anonimo,
    c.resolucion,
    c.fecha_recibido,
    c.fecha_cierre,
    c.created_at,
    c.updated_at
  from public.casos c
  left join public.categorias_caso cat on cat.id = c.categoria_id
  left join public.distritos       d   on d.id  = c.distrito_id
 where c.deleted_at is null;

comment on view public.v_mis_denuncias_ciudadano is
    'Seguimiento para el portal. La RLS de `casos` decide las filas; esta vista '
    'decide las COLUMNAS: fuera notas internas y datos del personal asignado.';

grant select on public.v_mis_denuncias_ciudadano to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Entrar con DUI
--
-- El login del portal decía «DUI O EMAIL» y el DUI no autenticaba: Supabase
-- Auth solo acepta correo, y `resolver_identificador_login` (v17) traduce
-- `usuarios.username`, que es del personal. Un ciudadano fallaba con
-- «credenciales incorrectas» —el mismo mensaje que una contraseña mal escrita—,
-- así que no había forma de entender por qué.
--
-- Se AÑADE una rama a la función existente en vez de crear otra: el formulario
-- de acceso es el mismo y dos funciones darían dos sitios donde arreglar lo
-- mismo. La rama de personal se conserva intacta y va primero.
--
-- El correo del ciudadano vive en `auth.users`, así que hay que ir a buscarlo
-- allí; por eso la función ya era `security definer`.
-- ----------------------------------------------------------------------------
create or replace function public.resolver_identificador_login(p_identificador text)
returns jsonb
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    with entrada as (select btrim(p_identificador) as txt),
    -- Personal: `username` y `email_institucional` son citext, así que la
    -- comparación ya es insensible a mayúsculas.
    personal as (
        select jsonb_build_object(
                   'encontrado',   true,
                   'email',        u.email_institucional,
                   'activo',       u.activo,
                   'tiene_cuenta', exists (select 1 from auth.users au where au.id = u.id)
               ) as r
          from public.usuarios u
         cross join entrada e
         where e.txt <> ''
           and (u.username = e.txt::citext or u.email_institucional = e.txt::citext)
         limit 1
    ),
    -- Ciudadanía: solo por DUI. El correo no hace falta traducirlo —si el
    -- vecino escribe su correo, Supabase ya lo entiende tal cual—.
    ciudadania as (
        select jsonb_build_object(
                   'encontrado',   true,
                   'email',        au.email,
                   'activo',       c.activo,
                   'tiene_cuenta', true
               ) as r
          from public.ciudadanos c
          join auth.users au on au.id = c.id
         cross join entrada e
         where e.txt <> ''
           and c.dui = e.txt
         limit 1
    )
    select coalesce(
        (select r from personal),
        (select r from ciudadania)
    );
$$;

comment on function public.resolver_identificador_login(text) is
    'Traduce lo que se escribió en el login al correo con el que Supabase puede '
    'autenticar: username de personal, o DUI de ciudadano. El correo pasa tal cual.';

grant execute on function public.resolver_identificador_login(text) to anon, authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Columna y policy nuevas:
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='categorias_caso'
--    and column_name='visible_ciudadano';
--
-- select pg_get_expr(polqual, polrelid) like '%creado_por_ciudadano_id%' as tiene_rama_ciudadana
--   from pg_policy where polrelid='public.casos'::regclass and polname='casos_select';
--
-- 2) ABRIR CATEGORÍAS AL PÚBLICO. Nada es visible hasta que se decida.
--    Revisa primero qué hay y decide con la jefatura correspondiente:
--
-- select id, codigo, nombre, activo, visible_ciudadano
--   from public.categorias_caso order by nombre;
--
--    Y después abre las que correspondan, por ejemplo:
--
-- update public.categorias_caso set visible_ciudadano = true
--  where codigo in ('ALUMBRADO_DEFECTUOSO', 'BACHES', 'DESECHOS_SOLIDOS');
--
--    ⚠ Mientras no se abra ninguna, el portal no ofrecerá categorías y no se
--    podrá reportar. Es deliberado, pero conviene no olvidarlo.
--
-- 3) La vista existe y respeta la RLS:
--
-- select table_name from information_schema.views
--  where table_schema='public' and table_name='v_mis_denuncias_ciudadano';
--
-- 4) Login por DUI — debe devolver el correo de la cuenta:
--
-- select public.resolver_identificador_login('<dui-del-ciudadano-de-prueba>');
--
--    Y el personal debe seguir resolviendo igual que antes:
--
-- select public.resolver_identificador_login('soporte.ti@sansalvadorsur.gob.sv');
--
-- ----------------------------------------------------------------------------
-- PRUEBA DE HUMO
-- ----------------------------------------------------------------------------
-- Se hace desde el portal, con sesión de ciudadano, porque la función lee
-- `auth.uid()`. Tras crear una denuncia:
--
-- select c.correlativo, c.estado_codigo, c.distrito_id, c.canal_reporte_id,
--        c.denunciante_es_anonimo, c.denunciante_nombre, c.creado_por_ciudadano_id
--   from public.casos c
--  where c.creado_por_ciudadano_id is not null
--  order by c.created_at desc limit 5;
--
-- Debe aparecer también en el Centro de Monitoreo, en Gestión de Denuncias.
-- ============================================================================
