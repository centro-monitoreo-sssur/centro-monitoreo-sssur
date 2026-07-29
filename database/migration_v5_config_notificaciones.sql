-- ============================================================================
-- MIGRACIÓN: Tablas nuevas de configuracion, configuracion_smtp y notificaciones
-- Aplicar en Supabase SQL Editor SOLO si estas tablas no existen aún.
-- ============================================================================

-- 1. Configuración del sistema (clave/valor JSON)
create table if not exists public.configuracion (
    clave                   text primary key,
    valor                   jsonb not null default '{}'::jsonb,
    descripcion             text,
    updated_at              timestamptz not null default now()
);

alter table public.configuracion enable row level security;

create policy "config_admin_select"
    on public.configuracion for select to authenticated
    using (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'));

create policy "config_superadmin_write"
    on public.configuracion for all to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

create trigger trg_configuracion_updated_at
    before update on public.configuracion
    for each row execute function public.set_updated_at();

insert into public.configuracion (clave, descripcion)
values ('global', 'Configuración global del sistema')
on conflict do nothing;


-- 2. Configuración SMTP (fila única, sin exponer al frontend)
create table if not exists public.configuracion_smtp (
    id                      smallint primary key default 1,
    host                    text not null,
    port                    integer not null default 587,
    usuario                 text not null,
    password_encriptada     text not null,
    requiere_tls            boolean not null default true,
    remitente_email         text not null,
    remitente_nombre        text not null,
    updated_at              timestamptz not null default now(),
    check (id = 1)
);

alter table public.configuracion_smtp enable row level security;

create policy "smtp_superadmin_only"
    on public.configuracion_smtp for all to authenticated
    using (public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('superadmin'));

create trigger trg_configuracion_smtp_updated_at
    before update on public.configuracion_smtp
    for each row execute function public.set_updated_at();


-- 3. Notificaciones del sistema
create table if not exists public.notificaciones (
    id                      bigint generated always as identity primary key,
    titulo                  text not null,
    mensaje                 text not null,
    tipo                    text not null default 'info',
    prioridad               text not null default 'media',
    leida                   boolean not null default false,
    datos                   jsonb,
    origen                  text not null default 'sistema',
    usuario_id              uuid references public.usuarios(id),
    created_at              timestamptz not null default now()
);

create index if not exists idx_notificaciones_leida on public.notificaciones(leida) where not leida;
create index if not exists idx_notificaciones_created_at on public.notificaciones(created_at desc);

alter table public.notificaciones enable row level security;

create policy "notificaciones_admin_all"
    on public.notificaciones for all to authenticated
    using (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'))
    with check (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'));

-- Habilitar Realtime
alter publication supabase_realtime add table public.notificaciones;
