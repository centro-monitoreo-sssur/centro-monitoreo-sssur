-- ============================================================================
-- MIGRACIÓN v26 — Cada jefatura gestiona el catálogo de su departamento
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- PARA QUÉ
--
-- En la municipalidad, las jefaturas ya gestionan de hecho a su personal y su
-- ámbito de trabajo. Obligarlas a pedir al administrador del sistema que dé de
-- alta una categoría convierte a esa persona en un cuello de botella y traslada
-- a Sistemas una decisión que es de la unidad que resuelve el problema.
--
-- Esta migración delega en `jefe_area` la gestión del catálogo de su propio
-- departamento, conservando en la gerencia lo único que no puede delegarse sin
-- generar conflictos entre unidades: el ENRUTAMIENTO.
--
-- ----------------------------------------------------------------------------
-- REPARTO DE COMPETENCIAS
--
--   Jefatura (rol `jefe_area`), solo sobre SU departamento:
--     · Crear categorías nuevas para su unidad.
--     · Editar nombre, descripción, icono, color, prioridad, flujo de estados
--       y activar/desactivar las categorías de su departamento.
--     · Declarar en qué categorías su unidad `puede_intervenir`.
--
--   Gerencia (`admin` / `superadmin`), en exclusiva:
--     · Cambiar a qué departamento se enruta una categoría existente
--       (`categorias_caso.departamento_responsable_id`).
--     · Marcar `es_responsable_principal` en la tabla puente.
--
-- POR QUÉ EL ENRUTAMIENTO NO SE DELEGA
--
-- Solo un departamento puede ser responsable principal de una categoría (índice
-- único parcial de v6). Si una jefatura pudiera reclamarlo, podría desviar
-- hacia sí —o lejos de sí— el trabajo de otra unidad sin que esta se entere.
-- No es una restricción técnica: es evitar que una decisión entre pares se
-- resuelva por orden de clic.
--
-- ----------------------------------------------------------------------------
-- LA CATEGORÍA QUE NACE YA ENRUTADA
--
-- Combinar "la jefatura crea categorías" con "solo la gerencia enruta" dejaría
-- categorías recién creadas sin departamento responsable, y con v24 un caso de
-- esa categoría sería rechazado. Sería una función que no se puede usar.
--
-- Se resuelve así: al CREAR, la categoría se enruta automáticamente al
-- departamento de quien la crea. No hay conflicto que arbitrar —nadie más la
-- reclamaba— y la unidad puede usarla de inmediato. La reserva de la gerencia
-- aplica a REASIGNAR el enrutamiento de una categoría existente, que es donde
-- sí hay dos partes interesadas.
--
-- ----------------------------------------------------------------------------
-- CONVENCIÓN DE CÓDIGOS
--
-- `categorias_caso.codigo` es único en todo el sistema y su prefijo agrupa en
-- el clasificador de la PWA (`utils/grupos-categorias.js`). Para que cinco
-- jefaturas creando categorías a la vez no colisionen ni fragmenten la
-- taxonomía, las categorías creadas por una jefatura llevan el prefijo del
-- código de su departamento. Lo aplica el trigger, no la interfaz: así vale
-- también para altas por SQL.
--
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Módulo de permisos `categorias`
-- ----------------------------------------------------------------------------
-- Se da de alta aquí, junto al código que lo usa, según la regla de v22: un
-- módulo que ninguna pantalla evalúa es un permiso decorativo.
insert into public.permisos_modulos (codigo_modulo, nombre_modulo, descripcion, activo)
values ('categorias', 'Catálogo de Categorías',
        'Tipos de incidencia que atiende cada departamento', true)
on conflict (codigo_modulo) do update
   set nombre_modulo = excluded.nombre_modulo,
       descripcion   = excluded.descripcion,
       activo        = true;

-- Jefaturas: alta y edición. `borrar` queda en false a propósito — una
-- categoría con casos históricos se desactiva, no se elimina, o el histórico
-- pierde su clasificación.
insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, true, true, true, false, false
  from public.roles r
  join public.permisos_modulos pm on pm.codigo_modulo = 'categorias'
 where r.codigo in ('jefe_area', 'admin', 'superadmin')
on conflict (rol_id, permiso_modulo_id) do update
   set ver = true, crear = true, editar = true;

-- El resto de roles ve el catálogo pero no lo toca.
insert into public.roles_permisos (rol_id, permiso_modulo_id, ver, crear, editar, borrar, exportar)
select r.id, pm.id, true, false, false, false, false
  from public.roles r
  join public.permisos_modulos pm on pm.codigo_modulo = 'categorias'
 where r.codigo in ('empleado', 'alcalde', 'directivo')
on conflict (rol_id, permiso_modulo_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Guarda de enrutamiento y de convención de códigos
-- ----------------------------------------------------------------------------
create or replace function public.fn_protege_enrutamiento_categoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_es_gerencia boolean;
    v_mi_depto    bigint;
    v_prefijo     text;
begin
    v_es_gerencia := coalesce(public.auth_tiene_rol('admin'), false)
                  or coalesce(public.auth_tiene_rol('superadmin'), false);

    -- La gerencia no tiene restricciones: puede enrutar donde haga falta.
    if v_es_gerencia then
        return new;
    end if;

    v_mi_depto := public.auth_departamento_id();
    if v_mi_depto is null then
        raise exception
            'Tu usuario no tiene departamento asignado, así que no se puede '
            'determinar para qué unidad estarías creando la categoría. '
            'Pide a la gerencia que te asigne uno.'
            using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
        -- La categoría nace enrutada a la unidad de quien la crea. Se fuerza en
        -- lugar de validar: si se rechazara, la interfaz tendría que conocer el
        -- departamento del usuario para rellenarlo, y eso es dato del servidor.
        new.departamento_responsable_id := v_mi_depto;

        -- Prefijo por departamento, para que dos unidades no colisionen en
        -- `codigo` ni fragmenten los grupos del clasificador.
        select upper(regexp_replace(coalesce(d.codigo, 'DEP'), '[^A-Za-z0-9]', '', 'g'))
          into v_prefijo
          from public.departamentos d
         where d.id = v_mi_depto;

        v_prefijo := left(coalesce(nullif(v_prefijo, ''), 'DEP'), 6);
        if new.codigo is null or new.codigo !~ ('^' || v_prefijo || '-') then
            new.codigo := v_prefijo || '-' ||
                          upper(regexp_replace(coalesce(new.codigo, new.nombre), '[^A-Za-z0-9]+', '-', 'g'));
        end if;
        return new;
    end if;

    -- UPDATE
    if new.departamento_responsable_id is distinct from old.departamento_responsable_id then
        raise exception
            'Cambiar a qué departamento se enrutan los casos de "%" es competencia '
            'de la gerencia, porque afecta a otra unidad. Solicítalo a la '
            'administración del sistema.', old.nombre
            using errcode = '42501';
    end if;

    if old.departamento_responsable_id is distinct from v_mi_depto then
        raise exception
            'La categoría "%" pertenece a otro departamento; solo puedes editar '
            'las de tu unidad.', old.nombre
            using errcode = '42501';
    end if;

    return new;
end;
$$;

comment on function public.fn_protege_enrutamiento_categoria() is
    'Fuerza que una jefatura solo cree/edite categorías de su propio '
    'departamento y no reasigne el enrutamiento. La gerencia queda exenta.';

drop trigger if exists trg_categoria_enrutamiento on public.categorias_caso;
create trigger trg_categoria_enrutamiento
    before insert or update on public.categorias_caso
    for each row execute function public.fn_protege_enrutamiento_categoria();

-- ----------------------------------------------------------------------------
-- 3. RLS de `categorias_caso`
-- ----------------------------------------------------------------------------
-- La policy de schema.sql:859 ("categorias_write_admin") cubre `for all` solo
-- para admin/superadmin. Se conserva y se añade la de jefatura: en PostgreSQL
-- las policies permisivas se suman con OR, así que la gerencia no pierde nada.
drop policy if exists "categorias_insert_jefatura" on public.categorias_caso;
create policy "categorias_insert_jefatura"
    on public.categorias_caso for insert to authenticated
    with check (
        coalesce(public.auth_tiene_permiso('categorias', 'crear'), false)
        and public.auth_departamento_id() is not null
    );

drop policy if exists "categorias_update_jefatura" on public.categorias_caso;
create policy "categorias_update_jefatura"
    on public.categorias_caso for update to authenticated
    using (
        coalesce(public.auth_tiene_permiso('categorias', 'editar'), false)
        and departamento_responsable_id = public.auth_departamento_id()
    )
    with check (
        coalesce(public.auth_tiene_permiso('categorias', 'editar'), false)
        and departamento_responsable_id = public.auth_departamento_id()
    );

-- No se añade policy de DELETE para jefaturas: se desactiva con `activo`.

-- ----------------------------------------------------------------------------
-- 4. Tabla puente: qué atiende cada unidad
-- ----------------------------------------------------------------------------
-- v6 solo permitía escribir a admin. La jefatura pasa a gestionar las filas de
-- SU departamento, que es la parte de "qué atiende mi unidad".
drop policy if exists "departamento_categorias_jefatura" on public.departamento_categorias;
create policy "departamento_categorias_jefatura"
    on public.departamento_categorias for all to authenticated
    using (
        coalesce(public.auth_tiene_permiso('categorias', 'editar'), false)
        and departamento_id = public.auth_departamento_id()
    )
    with check (
        coalesce(public.auth_tiene_permiso('categorias', 'editar'), false)
        and departamento_id = public.auth_departamento_id()
    );

-- `es_responsable_principal` sigue siendo de la gerencia: es el enrutamiento
-- visto desde la otra tabla, y dejarlo abierto por aquí sería una puerta
-- trasera a lo que el punto 2 protege.
create or replace function public.fn_protege_responsable_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(public.auth_tiene_rol('admin'), false)
       or coalesce(public.auth_tiene_rol('superadmin'), false) then
        return new;
    end if;

    if new.es_responsable_principal
       and (tg_op = 'INSERT' or not coalesce(old.es_responsable_principal, false)) then
        raise exception
            'Marcar un departamento como responsable principal de una categoría '
            'define a quién le nacen los casos y afecta a otras unidades: es '
            'competencia de la gerencia. Puedes declarar que tu unidad "puede '
            'intervenir" sin cambiar el enrutamiento.'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_depcat_responsable_principal on public.departamento_categorias;
create trigger trg_depcat_responsable_principal
    before insert or update on public.departamento_categorias
    for each row execute function public.fn_protege_responsable_principal();

-- ----------------------------------------------------------------------------
-- 5. Verificación
-- ----------------------------------------------------------------------------
do $$
declare
    v_modulo   bigint;
    v_jefatura boolean;
begin
    select id into v_modulo from public.permisos_modulos where codigo_modulo = 'categorias';
    if v_modulo is null then
        raise exception 'v26 incompleta: no se creó el módulo `categorias`.';
    end if;

    select rp.crear into v_jefatura
      from public.roles_permisos rp
      join public.roles r on r.id = rp.rol_id
     where r.codigo = 'jefe_area' and rp.permiso_modulo_id = v_modulo;

    if not coalesce(v_jefatura, false) then
        raise exception 'v26 incompleta: `jefe_area` no quedó con permiso de creación.';
    end if;

    raise notice
        'v26 OK — las jefaturas gestionan el catálogo de su departamento. '
        'El enrutamiento sigue siendo de la gerencia.';
end;
$$;

commit;

-- ============================================================================
-- COMPROBACIÓN MANUAL
--
-- Requisito previo: cada jefatura debe tener `usuarios.departamento_id`. Sin
-- él, el trigger rechaza el alta con un mensaje explícito. Para revisarlo:
--
--   select u.username, u.email_institucional,
--          u.nombres || ' ' || u.apellidos as nombre,
--          r.codigo as rol, u.departamento_id, d.nombre as departamento
--     from public.usuarios u
--     join public.roles r on r.id = u.rol_id
--     left join public.departamentos d on d.id = u.departamento_id
--    where r.codigo = 'jefe_area'
--    order by u.apellidos;
--
-- Con la sesión de una jefatura (no como postgres, que tiene BYPASSRLS):
--
--   -- debe funcionar y quedar enrutada a su propio departamento:
--   insert into public.categorias_caso (codigo, nombre, descripcion, departamento_responsable_id)
--   values ('PRUEBA', 'Categoría de prueba', 'Alta desde jefatura', 1)
--   returning codigo, departamento_responsable_id;
--
--   -- debe fallar con 42501:
--   update public.categorias_caso set departamento_responsable_id = 99 where codigo like '%-PRUEBA';
-- ============================================================================
