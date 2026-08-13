-- ============================================================================
-- MIGRACIÓN v33 · EL FORMULARIO DE REGISTRO NECESITA VER LOS DISTRITOS
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- La pantalla de registro del portal ciudadano pide el distrito de residencia.
-- Desde el bloque 2 lee el catálogo real en vez de cinco opciones escritas a
-- mano —la tabla exige `distrito_id`, no un nombre—, pero:
--
--     create policy "catalogos_select_distritos"
--         on public.distritos for select to authenticated using (true);
--
-- Quien se está registrando TODAVÍA NO TIENE CUENTA. Consulta como `anon`, la
-- policy no le alcanza y PostgREST devuelve cero filas sin error. El
-- desplegable sale vacío y no hay forma de completar el registro.
--
-- Es el modo de fallo habitual de RLS: no da un error, da una lista vacía. De
-- hecho `stores/catalogos.js` lo interpretaba como «la tabla está VACÍA,
-- ejecuta la v11», que apunta al sitio equivocado. Ese mensaje se corrige
-- también en el frontend.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UNA POLICY Y NO UNA FUNCIÓN
--
-- Se valoró un RPC `security definer` que devolviera solo id y nombre, como se
-- hizo con `dui_ciudadano_disponible` en la v32. Ahí tenía sentido porque la
-- alternativa era abrir las fichas de los ciudadanos.
--
-- Aquí no: la tabla `distritos` tiene id, municipio_id, codigo, nombre y
-- activo. Los cinco distritos del municipio están publicados en el sitio web
-- de la Alcaldía y en el cartograma. No hay nada que proteger, y una función
-- obligaría a `catalogos.js` a ramificar según haya sesión o no —una rama más
-- que mantener para esconder un dato que es público—.
--
-- ----------------------------------------------------------------------------
-- QUÉ NO SE ABRE
--
-- Solo `distritos`, y solo los activos. `municipios`,
-- `direcciones_administrativas`, `departamentos` y el resto de catálogos
-- siguen exigiendo sesión: el registro no los necesita.
--
-- Recordatorio para quien amplíe esto: la clave `anon` viaja en el frontend,
-- así que conceder algo a `anon` es publicarlo en internet. Es aceptable para
-- una lista de distritos; no lo sería para casi nada más.
--
-- REQUIERE: schema.sql. IDEMPOTENTE.
-- ============================================================================

begin;

-- La policy de `authenticated` se conserva tal cual: esta es ADICIONAL. Las
-- policies de PostgreSQL se combinan con OR, así que un usuario con sesión
-- sigue viendo también los distritos desactivados, que es lo que necesita el
-- panel de administración para mantenerlos.
drop policy if exists "distritos_select_publico" on public.distritos;
create policy "distritos_select_publico"
    on public.distritos for select to anon
    using (activo);

comment on policy "distritos_select_publico" on public.distritos is
    'El formulario de registro ciudadano necesita los distritos ANTES de que '
    'exista la cuenta. Solo los activos: un distrito dado de baja no debe '
    'ofrecerse como residencia.';

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) La policy existe y apunta al rol `anon`:
--
-- select polname,
--        (select array_agg(rolname) from pg_roles where oid = any(polroles)) as roles,
--        pg_get_expr(polqual, polrelid) as condicion
--   from pg_policy
--  where polrelid = 'public.distritos'::regclass
--  order by polname;
--
--    Deben salir DOS filas: `catalogos_select_distritos` (authenticated) y
--    `distritos_select_publico` (anon, con condición `activo`).
--
-- 2) Prueba real como visitante sin sesión. Desde una consola del navegador,
--    en una pestaña SIN sesión abierta del portal:
--
--    fetch('https://<tu-proyecto>.supabase.co/rest/v1/distritos?select=id,nombre&activo=eq.true', {
--      headers: { apikey: '<clave-anon>' }
--    }).then(r => r.json()).then(console.log)
--
--    Debe devolver los cinco distritos. Antes devolvía [].
--
-- 3) Comprobación de que no se abrió de más — esto debe seguir devolviendo []
--    para un visitante sin sesión:
--
--    .../rest/v1/municipios?select=id,nombre
-- ============================================================================
