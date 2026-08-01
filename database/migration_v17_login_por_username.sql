-- ============================================================================
-- MIGRACIÓN v17 — Inicio de sesión por username o correo
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PROBLEMA QUE RESUELVE
-- Supabase Auth autentica ÚNICAMENTE por correo (o teléfono). El formulario de
-- login pide "usuario" y envía ese texto tal cual a signInWithPassword(), así
-- que un `usuarios.username` válido siempre falla con "Invalid login
-- credentials" — indistinguible de una contraseña equivocada.
--
-- Traducir username → correo exige leer public.usuarios ANTES de autenticar,
-- cuando el solicitante todavía es `anon`, y la policy
-- `usuarios_select_propio_o_admin` lo impide (correctamente). De ahí que haga
-- falta una función `security definer` con una superficie mínima y explícita.
--
-- ⚠ NOTA DE SEGURIDAD — LÉASE ANTES DE APLICAR
-- Esta función permite ENUMERAR usuarios: quien pruebe cadenas al azar puede
-- descubrir qué usernames existen, su correo institucional y si tienen cuenta
-- de acceso creada. Es un intercambio deliberado:
--   · El sistema es de uso interno municipal y los correos siguen un patrón
--     público conocido (nombre.apellido@sansalvadorsur.gob.sv), así que lo que
--     se revela es poco más que lo ya deducible.
--   · A cambio, soporte puede distinguir "no existe el usuario", "existe pero
--     no tiene cuenta de acceso" y "contraseña incorrecta", que hoy son el
--     mismo mensaje y provocan horas perdidas.
-- Si se prefiere no exponerlo, el apartado 3 deja preparada la variante
-- endurecida: comentar el `grant ... to anon` y devolver siempre NULL salvo
-- coincidencia exacta de correo.
--
-- REQUIERE: database/schema.sql (tabla public.usuarios).
-- IDEMPOTENTE: se puede correr varias veces sin efectos secundarios.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Resolución de identificador
--
--    Devuelve jsonb en vez de un simple text para poder informar de POR QUÉ
--    no se puede entrar sin obligar al cliente a adivinarlo:
--      · encontrado    → el identificador corresponde a un usuario
--      · email         → correo con el que hay que llamar a signInWithPassword
--      · tiene_cuenta  → existe fila en auth.users (perfil creado por SQL sin
--                        cuenta de acceso es el fallo más común al sembrar
--                        usuarios a mano)
--      · activo        → el perfil no está dado de baja
-- ----------------------------------------------------------------------------
create or replace function public.resolver_identificador_login(p_identificador text)
returns jsonb
language sql
security definer
stable
parallel safe
set search_path = public
as $$
    -- `username` y `email_institucional` son citext: la comparación ya es
    -- insensible a mayúsculas sin necesidad de lower() ni de un índice extra.
    select jsonb_build_object(
               'encontrado',   true,
               'email',        u.email_institucional,
               'activo',       u.activo,
               'tiene_cuenta', exists (select 1 from auth.users au where au.id = u.id)
           )
      from public.usuarios u
     where btrim(p_identificador) <> ''
       and (u.username = btrim(p_identificador)::citext
            or u.email_institucional = btrim(p_identificador)::citext)
     limit 1;
$$;

comment on function public.resolver_identificador_login(text) is
    'Traduce un username o correo al correo institucional con el que Supabase '
    'Auth puede autenticar. SECURITY DEFINER porque el solicitante todavía es '
    'anon. Devuelve NULL si no hay coincidencia. Permite enumeración de '
    'usuarios: ver la nota de seguridad de migration_v17.';

-- ----------------------------------------------------------------------------
-- 2. Permisos de ejecución
--    `anon` es imprescindible: la llamada ocurre antes de autenticar.
--    Se revoca primero de public para no dejar el permiso implícito de
--    PostgreSQL, que concede EXECUTE a todo el mundo por defecto.
-- ----------------------------------------------------------------------------
revoke all on function public.resolver_identificador_login(text) from public;
grant execute on function public.resolver_identificador_login(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Índice de apoyo
--    El login consulta por username en cada intento. `usuarios.username` ya es
--    UNIQUE (y por tanto indexado); `email_institucional` también. No hace
--    falta índice adicional: se deja constancia para que nadie lo añada por si
--    acaso y duplique estructura.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 4. VARIANTE ENDURECIDA (opcional, no aplicada)
--    Si más adelante se decide no exponer la enumeración, basta con:
--
--      revoke execute on function public.resolver_identificador_login(text) from anon;
--
--    El login seguirá funcionando con correo — el frontend degrada solo — y se
--    perderá únicamente el acceso por username.
-- ----------------------------------------------------------------------------

commit;

-- ============================================================================
-- VERIFICACIÓN — correr después del commit
-- ============================================================================
-- 1) Resolver un username conocido (sustituye el valor):
--      select public.resolver_identificador_login('soporte.ti');
--    Esperado: {"activo": true, "email": "...", "encontrado": true, "tiene_cuenta": true}
--
-- 2) Identificador inexistente (debe devolver NULL):
--      select public.resolver_identificador_login('no-existe-xyz');
--
-- 3) PERFILES SIN CUENTA DE ACCESO — la causa más común de "no puedo entrar".
--    Lista los usuarios de public.usuarios que NO tienen fila en auth.users:
--
--      select u.email_institucional, u.username, u.nombres, u.apellidos
--        from public.usuarios u
--       where not exists (select 1 from auth.users au where au.id = u.id);
--
--    Si alguno aparece aquí, ese usuario NO puede iniciar sesión con ninguna
--    contraseña: su perfil se insertó por SQL sin crear la cuenta. La solución
--    es darlo de alta desde Administración → Usuarios → Nuevo usuario, que crea
--    ambas cosas, o crearlo en Authentication → Users con el MISMO id.
-- ============================================================================
