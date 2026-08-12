-- ============================================================================
-- MIGRACIÓN v31 · UN USUARIO PUEDE EDITARSE, NO ASCENDERSE
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- `usuarios_update_propio_o_admin` (schema.sql:875) autoriza a cualquiera a
-- actualizar SU PROPIA fila:
--
--     using       (id = auth.uid() or auth_tiene_rol('admin') or ...)
--     with check  (id = auth.uid() or auth_tiene_rol('admin') or ...)
--
-- Row Level Security decide QUÉ FILAS se pueden tocar. No decide qué COLUMNAS.
-- Y todo el modelo de permisos se apoya en columnas de esa misma fila:
--
--     auth_tiene_rol()      lee usuarios.rol_id
--     auth_tiene_permiso()  lee usuarios.rol_id
--     auth_distritos_visibles(), auth_departamentos_visibles()
--                           leen usuarios.distrito_id / departamento_id
--
-- Consecuencia: cualquier empleado con sesión válida puede escalar a
-- superadministrador con una sola petición a PostgREST, usando su propio token
-- y la clave anónima que viaja en el frontend:
--
--     PATCH /rest/v1/usuarios?id=eq.<su-uuid>     { "rol_id": 1 }
--
-- Y con menos ruido: cambiarse `distrito_id` para ver los casos de otro
-- distrito, o `activo` para reactivarse tras una baja.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UN TRIGGER Y NO UNA POLICY
--
-- PostgreSQL no permite condicionar una policy a las columnas modificadas.
-- `GRANT UPDATE (columna)` sí existe y sería lo idiomático, pero en Supabase
-- todos los autenticados comparten el rol `authenticated`: un GRANT no puede
-- distinguir a un empleado de un administrador.
--
-- La única forma que discrimina por identidad Y por columna es un trigger
-- BEFORE UPDATE que devuelva a su valor anterior lo que no está autorizado a
-- cambiar. Se restaura en silencio en lugar de abortar: la interfaz legítima
-- envía la fila entera y no tiene por qué fallar al reenviar campos que no ha
-- tocado. Un intento de escalada no necesita un mensaje de error; necesita no
-- surtir efecto.
--
-- ----------------------------------------------------------------------------
-- QUÉ PUEDE CAMBIARSE UNO MISMO
--
--   telefono          · dato de contacto propio
--   foto_perfil_url   · su fotografía
--
-- Todo lo demás —rol, departamento, distrito, cuadrilla, alta/baja, correo,
-- usuario, DUI, nombres y cargo— es dato institucional y lo modifica la
-- administración desde el panel. Es la decisión que tomó la Gerencia el
-- 12 de agosto de 2026.
--
-- REQUIERE: schema.sql. IDEMPOTENTE.
-- ============================================================================

begin;

create or replace function public.fn_protege_perfil_propio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- La gerencia administra a todo el mundo, incluida a sí misma.
    if coalesce(public.auth_tiene_rol('admin'), false)
       or coalesce(public.auth_tiene_rol('superadmin'), false) then
        return new;
    end if;

    -- Sin sesión (migraciones, tareas del servidor, editor SQL) no se
    -- interviene: ahí manda quien tenga acceso a la base.
    if auth.uid() is null then
        return new;
    end if;

    -- Editar la ficha de OTRA persona sin ser gerencia no se contempla. La
    -- policy ya debería haberlo impedido; esto es la segunda barrera.
    if new.id is distinct from auth.uid() then
        raise exception 'No puedes modificar la ficha de otro usuario.'
            using errcode = '42501';
    end if;

    -- ── Congelar todo lo que no sea contacto propio ──────────────────────
    -- Se restaura el valor anterior en vez de rechazar: la pantalla de perfil
    -- envía la fila completa, y fallar por reenviar un campo intacto sería un
    -- error incomprensible para quien solo cambió su teléfono.
    new.id                  := old.id;
    new.rol_id              := old.rol_id;
    new.departamento_id     := old.departamento_id;
    new.distrito_id         := old.distrito_id;
    new.cuadrilla_id        := old.cuadrilla_id;
    new.activo              := old.activo;
    new.username            := old.username;
    new.email_institucional := old.email_institucional;
    new.dui                 := old.dui;
    new.nombres             := old.nombres;
    new.apellidos           := old.apellidos;
    new.puesto_cargo        := old.puesto_cargo;
    new.created_at          := old.created_at;

    return new;
end;
$$;

comment on function public.fn_protege_perfil_propio() is
    'Un usuario no gerencial solo puede cambiar su telefono y su foto_perfil_url. '
    'RLS controla filas, no columnas: sin este trigger, cualquiera podría '
    'ascenderse a superadmin editando su propio rol_id.';

-- El nombre empieza por «a_» a propósito: PostgreSQL dispara los triggers en
-- orden alfabético, y este tiene que correr ANTES que trg_usuarios_updated_at,
-- para que la marca de tiempo refleje el cambio ya saneado.
drop trigger if exists a_trg_usuarios_perfil_propio on public.usuarios;
create trigger a_trg_usuarios_perfil_propio
    before update on public.usuarios
    for each row execute function public.fn_protege_perfil_propio();

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- 1) El trigger existe y corre antes que el de updated_at.
-- select tgname from pg_trigger
--  where tgrelid = 'public.usuarios'::regclass and not tgisinternal
--  order by tgname;
--    → a_trg_usuarios_perfil_propio aparece ANTES que trg_usuarios_updated_at

-- 2) La prueba que importa, y hay que hacerla DESDE LA APLICACIÓN, no aquí:
--    el editor SQL no tiene auth.uid() y el trigger se aparta a propósito.
--
--    En la consola del navegador, con sesión de un usuario NO administrador:
--
--      const { data } = await db.from('usuarios')
--        .update({ rol_id: 1, telefono: '7777-7777' })
--        .eq('id', (await db.auth.getSession()).data.session.user.id)
--        .select();
--      console.log(data[0].rol_id, data[0].telefono);
--
--    → el rol_id debe seguir siendo el suyo y el teléfono sí debe cambiar.
--      Si el rol_id cambia, el trigger no está activo.

-- 3) Un administrador sí puede cambiar el rol de cualquiera. Comprobarlo desde
--    el panel de Usuarios, que es la vía prevista.
