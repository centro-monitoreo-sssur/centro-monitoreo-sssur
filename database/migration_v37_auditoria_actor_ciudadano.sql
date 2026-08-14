-- ============================================================================
-- MIGRACIÓN v37 · LA AUDITORÍA ACEPTA QUE UN CIUDADANO TAMBIÉN ACTÚA
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- Ninguna denuncia ciudadana llegaba a registrarse. El portal enviaba, el RPC
-- validaba, el caso se insertaba… y entonces reventaba todo:
--
--     insert or update on table "bitacora_auditoria" violates foreign key
--     constraint "bitacora_auditoria_usuario_id_fkey"
--     Key (usuario_id)=(871d1a09-…) is not present in table "usuarios".
--
-- La cadena completa:
--
--   1. `trg_auditoria_casos` es AFTER INSERT sobre `casos` y llama a
--      `registrar_auditoria()`.
--   2. Esa función escribe `usuario_id = auth.uid()` en `bitacora_auditoria`.
--   3. `bitacora_auditoria.usuario_id` referencia `public.usuarios`, es decir,
--      EMPLEADOS.
--   4. Un ciudadano no está en `usuarios`: vive en `public.ciudadanos` desde la
--      v32, con el mismo id que en `auth.users`.
--   5. La clave foránea falla, y como el trigger corre dentro de la misma
--      transacción que el alta, **se deshace el caso entero**.
--
-- El vecino veía «no se pudo registrar» y en consola aparecía un 409 pelado,
-- porque PostgREST traduce el 23503 de PostgreSQL a 409 Conflict — el mismo
-- código que un choque de clave única, que fue exactamente lo que despistó el
-- diagnóstico durante dos rondas.
--
-- Es el último supuesto de «todo el que actúa es un empleado» que quedaba vivo
-- de antes del portal ciudadano. La v36 ya lo había resuelto a su manera en
-- `noticias_lecturas`, donde `lector_id` se dejó DELIBERADAMENTE sin clave
-- foránea por esta misma razón. Aquí no vale esa salida: la bitácora es la
-- prueba de quién hizo qué, y una columna sin integridad referencial deja de
-- ser prueba.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ UNA SEGUNDA COLUMNA Y NO OTRA COSA
--
-- · Quitar la clave foránea — la bitácora aceptaría cualquier uuid, incluido
--   uno inventado o uno de un usuario ya borrado. Justo la garantía por la que
--   existe la tabla.
--
-- · Apuntar `usuario_id` a `auth.users` — la bitácora del Centro de Monitoreo
--   une contra `usuarios` para mostrar nombre y correo institucional; con
--   `auth.users` esa unión desaparece, y encima `auth` es un esquema que
--   administra GoTrue, no nosotros.
--
-- · Meter al ciudadano en `usuarios` — sería confundir a un vecino con un
--   empleado en la tabla de la que cuelgan roles, permisos, departamento y
--   distrito de trabajo. Es lo que la v32 decidió NO hacer, y con razón.
--
-- Queda entonces una columna `ciudadano_id` con su propia clave foránea, y un
-- trigger que encamina `auth.uid()` a la que corresponde. Las dos son opcionales
-- y se excluyen: o empleado, o vecino, o ninguno (procesos del sistema, que ya
-- hoy escriben con `usuario_id` nulo).
--
-- ----------------------------------------------------------------------------
-- REQUISITOS: schema.sql (bloque 8.4) y v32 (tabla `ciudadanos`).
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. El segundo actor posible
--
--    Sin `on delete`, igual que `usuario_id`: a un vecino se le desactiva con
--    `activo = false`, no se le borra, y si algún día se borrara, la clave
--    foránea debe impedirlo mientras su rastro siga en la bitácora. Perder al
--    responsable de una acción registrada es perder el registro.
-- ----------------------------------------------------------------------------
alter table public.bitacora_auditoria
    add column if not exists ciudadano_id uuid references public.ciudadanos(id);

comment on column public.bitacora_auditoria.ciudadano_id is
    'Vecino del portal ciudadano que ejecutó la acción. Excluyente con '
    '`usuario_id`: quien actúa es empleado o es ciudadano, nunca ambos. Los dos '
    'nulos significan que actuó el sistema (service_role, disparadores, cargas).';

comment on column public.bitacora_auditoria.usuario_id is
    'Empleado que ejecutó la acción. Nulo si la ejecutó un ciudadano —ver '
    '`ciudadano_id`— o el propio sistema.';

-- Un actor, no dos. Se declara `not valid` y se valida aparte: así la
-- comprobación de las filas ya existentes no bloquea la tabla durante el
-- `alter`, que es lo que importa en una bitácora, la tabla que más crece.
do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.bitacora_auditoria'::regclass
           and conname  = 'ck_bitacora_actor_unico'
    ) then
        alter table public.bitacora_auditoria
            add constraint ck_bitacora_actor_unico
            check (usuario_id is null or ciudadano_id is null) not valid;

        alter table public.bitacora_auditoria
            validate constraint ck_bitacora_actor_unico;
    end if;
end $$;

-- «Todo lo que hizo este vecino», que es como se consulta una bitácora cuando
-- se consulta. Parcial: las filas de empleados no tienen nada que aportar aquí
-- y son la inmensa mayoría.
create index if not exists ix_bitacora_ciudadano
    on public.bitacora_auditoria (ciudadano_id, created_at desc)
    where ciudadano_id is not null;

-- ----------------------------------------------------------------------------
-- 2. El trigger encamina al actor
--
--    Dos búsquedas por clave primaria más que antes, y solo la primera en el
--    caso habitual: si `auth.uid()` está en `usuarios` no se toca `ciudadanos`.
--    Son accesos por índice único sobre una tabla de centenares de filas; al
--    lado del `to_jsonb(new)` que ya hace la función, no se notan.
--
--    Se aprovecha para dos arreglos que estaban pendientes:
--
--    · `set search_path = public` — una función SECURITY DEFINER sin search_path
--      fijo resuelve los nombres con el del invocante. Quien pueda crear un
--      esquema por delante en esa ruta puede suplantar `usuarios` y hacer que la
--      auditoría escriba lo que él quiera, con permisos de dueño.
--
--    · La impersonación se busca solo si quien actúa es empleado. Un ciudadano
--      no puede ser impersonado —no hay a quién— y esa consulta sobraba.
-- ----------------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid             uuid := auth.uid();
    v_usuario_id      uuid;
    v_ciudadano_id    uuid;
    v_superadmin_id   uuid;
    v_fue_impersonado boolean := false;
begin
    -- ¿De qué lado está quien actúa? Nulo en los dos si la acción viene del
    -- sistema: sin sesión, `auth.uid()` es nulo y no hay nada que buscar.
    if v_uid is not null then
        select u.id into v_usuario_id
          from public.usuarios u where u.id = v_uid;

        if v_usuario_id is null then
            select c.id into v_ciudadano_id
              from public.ciudadanos c where c.id = v_uid;
        end if;
    end if;

    if v_usuario_id is not null then
        select si.superadmin_id into v_superadmin_id
          from public.sesiones_impersonacion si
         where si.usuario_impersonado_id = v_usuario_id
           and si.fecha_fin is null
         limit 1;

        v_fue_impersonado := v_superadmin_id is not null;
    end if;

    insert into public.bitacora_auditoria (
        usuario_id, ciudadano_id, fue_impersonado, superadmin_real_id,
        accion, tabla_afectada, registro_id,
        valores_anteriores, valores_nuevos
    ) values (
        v_usuario_id,
        v_ciudadano_id,
        v_fue_impersonado,
        v_superadmin_id,
        TG_OP,
        TG_TABLE_NAME,
        coalesce(new.id, old.id)::text,
        case when TG_OP = 'DELETE'  then to_jsonb(old) else null end,
        case when TG_OP <> 'DELETE' then to_jsonb(new) else null end
    );

    return coalesce(new, old);
end;
$$;

comment on function public.registrar_auditoria() is
    'Trigger de auditoría. Encamina auth.uid() a `usuario_id` si es empleado o '
    'a `ciudadano_id` si es vecino del portal; ambos nulos si actuó el sistema. '
    'Antes escribía siempre en `usuario_id`, y la clave foránea contra '
    '`usuarios` deshacía toda alta hecha por un ciudadano (v37).';

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) La columna, la restricción y el índice están:
--
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'bitacora_auditoria'
--    and column_name in ('usuario_id','ciudadano_id');
--
-- select conname, convalidated from pg_constraint
--  where conrelid = 'public.bitacora_auditoria'::regclass
--    and conname = 'ck_bitacora_actor_unico';
--    -- convalidated debe ser `t`.
--
-- 2) La función quedó con el search_path fijo:
--
-- select proname, proconfig from pg_proc
--  where oid = 'public.registrar_auditoria'::regclass::oid;
--    -- proconfig debe contener {search_path=public}.
--
-- 3) LA PRUEBA DE VERDAD: entra al portal ciudadano con una cuenta de vecino y
--    envía una denuncia. Debe registrarse y aparecer en «Mis Denuncias».
--    Después, aquí:
--
-- select b.id, b.accion, b.tabla_afectada, b.registro_id,
--        b.usuario_id, b.ciudadano_id,
--        coalesce(c.nombres || ' ' || c.apellidos, 'empleado o sistema') as actor
--   from public.bitacora_auditoria b
--   left join public.ciudadanos c on c.id = b.ciudadano_id
--  order by b.created_at desc limit 5;
--
--    La fila del alta debe traer `usuario_id` nulo, `ciudadano_id` con el uuid
--    del vecino, y su nombre en `actor`.
--
-- 4) No regresión de los empleados: crea o edita un caso desde el Centro de
--    Monitoreo y comprueba que esa fila sigue trayendo `usuario_id` relleno y
--    `ciudadano_id` nulo.
-- ============================================================================
