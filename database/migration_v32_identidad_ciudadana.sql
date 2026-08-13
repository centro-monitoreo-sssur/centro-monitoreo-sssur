-- ============================================================================
-- MIGRACIÓN v32 · IDENTIDAD CIUDADANA
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- El portal de Población tiene ocho vistas y ninguna llama a Supabase. El
-- «registro» escribe un objeto en `localStorage` y `ciudadano_autenticado` es
-- un booleano que cualquiera pone a `true` desde la consola del navegador.
--
-- Sin fila en `auth.users` no hay `auth.uid()`, y sin `auth.uid()` NINGUNA
-- regla de RLS puede funcionar. Por eso esta migración va primero: la v33
-- (alta de denuncias) y la v34 (comunicados) se apoyan enteras en ella.
--
-- ----------------------------------------------------------------------------
-- DECISIONES YA TOMADAS
--
--   · Registro con CORREO Y CONTRASEÑA. El SMS es más natural para el vecino
--     promedio, pero Supabase cobra cada envío y no entra en el plan gratuito.
--   · Cuenta SIEMPRE obligatoria. La casilla «anónima» del formulario pasará a
--     significar que el operador no ve el nombre del denunciante, no que no
--     haya cuenta detrás. Sin cuenta no hay «Mis Denuncias», no hay forma de
--     avisar del resultado, y un `insert` público no se puede proteger del
--     abuso. (Eso se implementa en la v33.)
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UN TRIGGER SOBRE auth.users Y NO UN RPC DESPUÉS DEL signUp
--
-- Un RPC llamado a continuación deja una ventana en la que la cuenta existe y
-- el perfil no: si el navegador se cae, pierde cobertura o el vecino cierra la
-- pestaña justo ahí, queda una cuenta huérfana que además ocupa el correo, de
-- modo que reintentar el registro falla con «ya existe».
--
-- El trigger corre DENTRO de la misma transacción que la inserción en
-- `auth.users`. Si algo no cuadra, la transacción entera se deshace y no queda
-- ni cuenta ni perfil: el vecino puede reintentar con el mismo correo.
--
-- ----------------------------------------------------------------------------
-- CÓMO SE DISTINGUE UN CIUDADANO DE UN EMPLEADO
--
-- Comprobado en `assets/js/stores/usuarios.js:164`: el alta de personal TAMBIÉN
-- usa `signUp`, sobre un cliente aislado, porque `auth.admin.createUser` exige
-- la service_role key y esa no puede viajar al navegador.
--
-- Es decir: este trigger dispara también cuando la gerencia da de alta a un
-- empleado. Sin discriminar, cada alta de personal crearía un ciudadano
-- fantasma con datos vacíos —y fallaría, porque `nombres` es NOT NULL—.
--
-- El alta de personal no manda metadatos (`signUp({ email, password })` y nada
-- más), así que `raw_user_meta_data` llega vacío. El portal ciudadano sí los
-- mandará. La condición es esa y solo esa:
--
--     raw_user_meta_data->>'perfil' = 'ciudadano'
--
-- REQUIERE: schema.sql, migration_v10. IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Completar la tabla `ciudadanos`
--
-- El formulario de registro recoge nueve campos y la tabla tiene cinco.
--
-- El CORREO no se añade a propósito: vive en `auth.users.email`, que es la
-- fuente de verdad —la que valida Supabase, la que se usa para recuperar la
-- contraseña—. Duplicarlo aquí garantiza que algún día los dos valores
-- discrepen. El frontend lo lee del SDK con `getUser()`.
-- ----------------------------------------------------------------------------
alter table public.ciudadanos add column if not exists fecha_nacimiento date;
alter table public.ciudadanos add column if not exists genero           text;
alter table public.ciudadanos add column if not exists direccion        text;
alter table public.ciudadanos add column if not exists foto_url         text;

comment on column public.ciudadanos.fecha_nacimiento is
    'El portal exige mayoría de edad. Se guarda la fecha y no la edad: la edad '
    'caduca sola y habría que recalcularla.';
comment on column public.ciudadanos.genero is
    'Dato demográfico declarado por la persona. Opcional en base de datos '
    'aunque el formulario lo pida, para no bloquear altas presenciales.';

-- Valores admitidos. Se rehace la restricción en vez de darla por buena, para
-- que la migración sea idempotente y para poder ampliar la lista después.
alter table public.ciudadanos drop constraint if exists ciudadanos_genero_check;
alter table public.ciudadanos add  constraint ciudadanos_genero_check
    check (genero is null or genero in ('masculino', 'femenino', 'otro', 'prefiero_no_decir'));

-- `updated_at` existía sin nadie que la escribiera: la columna estaba puesta
-- desde schema.sql pero ciudadanos nunca tuvo el trigger que sí tienen
-- `usuarios` y las demás. Se quedaba con la fecha del alta para siempre.
drop trigger if exists trg_ciudadanos_updated_at on public.ciudadanos;
create trigger trg_ciudadanos_updated_at
    before update on public.ciudadanos
    for each row execute function public.set_updated_at();

-- Búsqueda por DUI en el registro presencial y en la comprobación de
-- disponibilidad. El UNIQUE ya crea índice, así que no hace falta otro.

-- Los comunicados se filtran por distrito del ciudadano.
create index if not exists idx_ciudadanos_distrito
    on public.ciudadanos (distrito_id) where activo;

-- ----------------------------------------------------------------------------
-- 2. Ayudantes de identidad
--
-- `stable` y no `volatile` para que PostgreSQL pueda evaluarlas una sola vez
-- por consulta cuando se usen dentro de un `(select ...)` en una policy —el
-- mismo criterio que ya sigue la v16—.
--
-- `security definer` porque quien pregunta puede no tener permiso de lectura
-- sobre `ciudadanos`: un empleado necesita poder saber que NO es ciudadano.
-- ----------------------------------------------------------------------------
create or replace function public.auth_es_ciudadano()
returns boolean
language sql
stable
security definer
parallel safe
set search_path = public
as $$
    select exists (select 1 from public.ciudadanos where id = auth.uid());
$$;

comment on function public.auth_es_ciudadano() is
    'Si quien pide tiene ficha en `ciudadanos`. Sirve para ramificar las '
    'policies: un ciudadano no tiene fila en `usuarios`, así que '
    'auth_tiene_permiso() le devuelve NULL y toda regla apoyada en él lo '
    'excluye por accidente.';

create or replace function public.auth_ciudadano_distrito()
returns smallint
language sql
stable
security definer
parallel safe
set search_path = public
as $$
    select distrito_id from public.ciudadanos where id = auth.uid();
$$;

comment on function public.auth_ciudadano_distrito() is
    'Distrito declarado por el ciudadano. Lo usará la v34 para filtrar los '
    'comunicados que le tocan.';

-- ----------------------------------------------------------------------------
-- 3. ¿Está libre este DUI?
--
-- Hace falta porque la RLS impide que un ciudadano vea las fichas de los demás:
-- el navegador NO puede comprobarlo por sí mismo antes de registrar.
--
-- Sin esta función, un DUI repetido solo se detecta cuando ya falla la
-- inserción, y GoTrue traduce cualquier excepción del trigger a un genérico
-- «Database error saving new user». El vecino se queda sin saber qué corregir.
--
-- Lo único que revela es si un DUI está tomado. Es enumerable en teoría, pero
-- el DUI no es un secreto y la alternativa —un registro que falla sin explicar
-- por qué— es peor. Se acepta a sabiendas.
-- ----------------------------------------------------------------------------
create or replace function public.dui_ciudadano_disponible(p_dui text)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = public
as $$
    select not exists (
        select 1 from public.ciudadanos
         where dui = nullif(trim(p_dui), '')
    );
$$;

comment on function public.dui_ciudadano_disponible(text) is
    'Comprobación previa al registro. La RLS oculta las fichas ajenas, así que '
    'el navegador no puede saberlo de otro modo.';

revoke all on function public.dui_ciudadano_disponible(text) from public;
grant execute on function public.dui_ciudadano_disponible(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Alta del perfil al crear la cuenta
--
-- Se valida aquí y no solo en el navegador porque el navegador es del vecino:
-- cualquiera puede llamar a `signUp` directamente con los metadatos que
-- quiera. Esta es la única barrera que no se puede saltar.
-- ----------------------------------------------------------------------------
create or replace function public.fn_crear_ciudadano_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    -- Se declara vacía y se rellena en el cuerpo. Usar `new.` en el valor por
    -- defecto de un DECLARE funciona, pero ninguna migración del proyecto lo
    -- hace todavía y no es el sitio donde estrenarlo.
    v_meta        jsonb;
    v_nombres     text;
    v_apellidos   text;
    v_dui         text;
    v_telefono    text;
    v_direccion   text;
    v_genero      text;
    v_distrito    smallint;
    v_nacimiento  date;
begin
    v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

    -- Solo las altas del portal ciudadano. El alta de personal pasa por aquí
    -- igualmente —también usa signUp— y debe seguir de largo.
    if v_meta->>'perfil' is distinct from 'ciudadano' then
        return new;
    end if;

    v_nombres   := nullif(trim(v_meta->>'nombres'), '');
    v_apellidos := nullif(trim(v_meta->>'apellidos'), '');
    v_dui       := nullif(trim(v_meta->>'dui'), '');
    v_telefono  := nullif(trim(v_meta->>'telefono'), '');
    v_direccion := nullif(trim(v_meta->>'direccion'), '');
    v_genero    := nullif(trim(v_meta->>'genero'), '');

    if v_nombres is null or v_apellidos is null then
        raise exception 'Faltan los nombres o los apellidos.'
            using errcode = '22023';
    end if;

    -- Formato salvadoreño: ocho dígitos, guion, dígito verificador.
    if v_dui is null or v_dui !~ '^\d{8}-\d$' then
        raise exception 'El DUI debe tener el formato 00000000-0.'
            using errcode = '22023';
    end if;

    -- Se comprueba explícitamente para poder dar un mensaje entendible. El
    -- UNIQUE de la columna sigue siendo la garantía real: entre esta consulta
    -- y la inserción cabe una carrera, y ahí gana la restricción.
    if exists (select 1 from public.ciudadanos where dui = v_dui) then
        raise exception 'Ya existe un registro con el DUI %.', v_dui
            using errcode = '23505';
    end if;

    -- `::smallint` sobre texto libre reventaría con un valor inventado, así que
    -- el casteo va dentro de un bloque que lo convierte en «sin distrito».
    --
    -- Se degrada en vez de abortar a propósito: un distrito ilegible es un
    -- fallo del formulario, no del vecino, y tumbar el registro por eso le
    -- dejaría sin cuenta y con un mensaje que GoTrue además convierte en un
    -- genérico. Sin distrito la cuenta funciona; lo único que pierde son los
    -- comunicados dirigidos a su territorio, y puede ponerlo él mismo desde Mi
    -- Perfil, que sí permite cambiarlo.
    begin
        v_distrito := (v_meta->>'distrito_id')::smallint;
    exception when others then
        v_distrito := null;
    end;

    if v_distrito is not null
       and not exists (select 1 from public.distritos where id = v_distrito) then
        raise exception 'El distrito indicado no existe.'
            using errcode = '23503';
    end if;

    begin
        v_nacimiento := (v_meta->>'fecha_nacimiento')::date;
    exception when others then
        v_nacimiento := null;
    end;

    -- Mayoría de edad. El formulario ya lo valida, pero el formulario está en
    -- el navegador de quien se registra.
    if v_nacimiento is not null and v_nacimiento > (current_date - interval '18 years') then
        raise exception 'El registro está reservado a personas mayores de edad.'
            using errcode = '22023';
    end if;

    if v_genero is not null
       and v_genero not in ('masculino', 'femenino', 'otro', 'prefiero_no_decir') then
        v_genero := null;
    end if;

    insert into public.ciudadanos (
        id, dui, telefono, nombres, apellidos,
        distrito_id, fecha_nacimiento, genero, direccion
    ) values (
        new.id, v_dui, v_telefono, v_nombres, v_apellidos,
        v_distrito, v_nacimiento, v_genero, v_direccion
    );

    return new;
end;
$$;

comment on function public.fn_crear_ciudadano_al_registrarse() is
    'Crea la ficha en `ciudadanos` cuando el alta viene del portal, dentro de '
    'la misma transacción que auth.users para no dejar cuentas sin perfil. '
    'Ignora las altas de personal, que también pasan por signUp.';

drop trigger if exists trg_crear_ciudadano_al_registrarse on auth.users;
create trigger trg_crear_ciudadano_al_registrarse
    after insert on auth.users
    for each row execute function public.fn_crear_ciudadano_al_registrarse();

-- ----------------------------------------------------------------------------
-- 5. El ciudadano edita su contacto, no su identidad
--
-- Mismo mecanismo y misma razón que la v31 para `usuarios`: **RLS decide qué
-- FILAS se tocan, no qué COLUMNAS**. La policy
-- `ciudadanos_update_propio_o_autorizado` (v10) autoriza la fila entera, así
-- que sin esto un ciudadano podría reactivarse tras una baja (`activo`) o
-- cambiarse el DUI para suplantar a otro.
--
-- Qué se congela y por qué:
--   · `dui`, `nombres`, `apellidos`, `fecha_nacimiento` — son la identidad.
--     Corregirlos es trabajo de TI desde el panel, igual que se decidió para el
--     personal.
--   · `activo` — una baja la levanta la administración, no el interesado.
--   · `id`, `created_at` — nunca cambian.
--
-- Qué sí puede cambiar: teléfono, dirección, distrito, foto y género. La gente
-- se muda y cambia de número; bloquearlo obligaría a abrir un ticket para algo
-- que no tiene ninguna consecuencia de seguridad.
-- ----------------------------------------------------------------------------
create or replace function public.fn_protege_ficha_ciudadano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- La gerencia y quien tenga el módulo de población administran las fichas.
    -- Es la vía por la que TI corrige un DUI mal escrito.
    if coalesce(public.auth_tiene_rol('admin'), false)
       or coalesce(public.auth_tiene_rol('superadmin'), false)
       or coalesce(public.auth_tiene_permiso('poblacion', 'editar'), false) then
        return new;
    end if;

    -- Sin sesión (migraciones, editor SQL, tareas del servidor) no se
    -- interviene: ahí manda quien tenga acceso a la base.
    if auth.uid() is null then
        return new;
    end if;

    if new.id is distinct from auth.uid() then
        raise exception 'No puedes modificar la ficha de otra persona.'
            using errcode = '42501';
    end if;

    -- Se restaura el valor anterior en vez de rechazar: la pantalla de perfil
    -- envía la fila completa, y fallar por reenviar un campo intacto sería un
    -- error incomprensible para quien solo cambió su teléfono.
    new.id               := old.id;
    new.dui              := old.dui;
    new.nombres          := old.nombres;
    new.apellidos        := old.apellidos;
    new.fecha_nacimiento := old.fecha_nacimiento;
    new.activo           := old.activo;
    new.created_at       := old.created_at;

    return new;
end;
$$;

comment on function public.fn_protege_ficha_ciudadano() is
    'Un ciudadano solo cambia su contacto: telefono, direccion, distrito, foto '
    'y genero. La identidad y el estado de la cuenta los administra TI.';

-- El nombre empieza por «a_» a propósito: PostgreSQL dispara los triggers en
-- orden alfabético, y este tiene que correr ANTES que
-- trg_ciudadanos_updated_at, para que la marca de tiempo refleje el cambio ya
-- saneado. Es la misma razón que en la v31.
drop trigger if exists a_trg_ciudadanos_ficha_propia on public.ciudadanos;
create trigger a_trg_ciudadanos_ficha_propia
    before update on public.ciudadanos
    for each row execute function public.fn_protege_ficha_ciudadano();

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- Ejecutar DESPUÉS de aplicar la migración. Las cuatro deben salir como se
-- indica; si alguna no, no continuar con la v33.
--
-- 1) Columnas nuevas — deben aparecer las cuatro:
--
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'ciudadanos'
--    and column_name in ('fecha_nacimiento','genero','direccion','foto_url')
--  order by column_name;
--
-- 2) Triggers — deben salir tres:
--    a_trg_ciudadanos_ficha_propia, trg_ciudadanos_updated_at (en public.ciudadanos)
--    y trg_crear_ciudadano_al_registrarse (en auth.users).
--
-- select c.relname as tabla, t.tgname as trigger
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--  where not t.tgisinternal
--    and (c.relname = 'ciudadanos' or t.tgname = 'trg_crear_ciudadano_al_registrarse')
--  order by 1, 2;
--
-- 3) Funciones — deben salir las cuatro:
--
-- select proname from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('auth_es_ciudadano','auth_ciudadano_distrito',
--                    'dui_ciudadano_disponible','fn_crear_ciudadano_al_registrarse',
--                    'fn_protege_ficha_ciudadano')
--  order by proname;
--
-- 4) DUI libre — debe devolver true:
--
-- select public.dui_ciudadano_disponible('00000000-0');
--
-- ----------------------------------------------------------------------------
-- PRUEBA DE HUMO (opcional, deja rastro)
-- ----------------------------------------------------------------------------
-- El alta real se prueba desde el portal, porque `signUp` la hace GoTrue y no
-- se puede simular con un `insert` a mano en auth.users sin dejar una cuenta
-- inconsistente. Tras registrar un ciudadano de prueba:
--
-- select c.id, c.dui, c.nombres, c.apellidos, c.distrito_id, u.email
--   from public.ciudadanos c
--   join auth.users u on u.id = c.id
--  order by c.created_at desc limit 5;
--
-- Para borrarlo después (borra la cuenta y la ficha por el cascade):
-- delete from auth.users where email = 'prueba@ejemplo.com';
-- ============================================================================
