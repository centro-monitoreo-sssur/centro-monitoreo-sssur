-- ============================================================================
-- MIGRACIÓN v6 — Relación N:M entre departamentos y categorías de caso
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Base: database/schema.sql (el schema que indica docs/despliegue.md).
--
-- PROBLEMA QUE RESUELVE
-- `categorias_caso.departamento_responsable_id` es 1:1. Eso obliga a que un
-- "Árbol caído sobre la vía" pertenezca a Protección Civil O a Obras, nunca a
-- ambos, cuando en la operación real las dos áreas intervienen. La alternativa
-- sin esta tabla es duplicar categorías, lo que rompe los conteos del mapa y
-- los reportes ejecutivos.
--
-- MODELO
-- La tabla puente pasa a ser la fuente de verdad de "quién atiende qué".
-- `categorias_caso.departamento_responsable_id` se conserva (lo usa el código
-- actual y tiene FK not null) y un trigger lo mantiene sincronizado con la
-- fila marcada como responsable principal. Un solo lugar donde editar.
--
-- IDEMPOTENTE: se puede correr varias veces sin efectos secundarios.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tabla puente
-- ----------------------------------------------------------------------------
create table if not exists public.departamento_categorias (
    id                       bigint generated always as identity primary key,
    departamento_id          bigint  not null references public.departamentos(id)   on delete cascade,
    categoria_id             bigint  not null references public.categorias_caso(id) on delete cascade,

    -- Enrutamiento: a este departamento le nace el caso por defecto.
    -- Exactamente uno por categoría (ver índice parcial más abajo).
    es_responsable_principal boolean not null default false,

    -- Distingue "puede ejecutar trabajo de campo sobre esta categoría" de
    -- "solo necesita verla en el tablero". Ej: CAM observa incidentes de
    -- Protección Civil sin intervenirlos.
    puede_intervenir         boolean not null default true,

    activo                   boolean not null default true,
    created_at               timestamptz not null default now(),

    unique (departamento_id, categoria_id)
);

comment on table public.departamento_categorias is
    'Qué categorías de caso puede atender cada departamento. Reemplaza el 1:1 '
    'de categorias_caso.departamento_responsable_id, que queda como espejo '
    'sincronizado del responsable principal.';

comment on column public.departamento_categorias.es_responsable_principal is
    'Departamento al que se enruta el caso al crearse. Único por categoría.';

comment on column public.departamento_categorias.puede_intervenir is
    'false = el departamento ve la categoría en el mapa/tablero pero no ejecuta '
    'intervenciones sobre ella.';

-- Un solo responsable principal por categoría.
create unique index if not exists uq_categoria_responsable_principal
    on public.departamento_categorias (categoria_id)
    where es_responsable_principal;

create index if not exists idx_depcat_departamento
    on public.departamento_categorias (departamento_id) where activo;

create index if not exists idx_depcat_categoria
    on public.departamento_categorias (categoria_id) where activo;

-- ----------------------------------------------------------------------------
-- 2. Backfill desde el modelo 1:1 existente
-- ----------------------------------------------------------------------------
insert into public.departamento_categorias
       (departamento_id, categoria_id, es_responsable_principal, puede_intervenir)
select c.departamento_responsable_id, c.id, true, true
from   public.categorias_caso c
on conflict (departamento_id, categoria_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Sincronización: la tabla puente manda, la columna legacy la sigue
-- ----------------------------------------------------------------------------
create or replace function public.sync_categoria_responsable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (tg_op in ('INSERT', 'UPDATE')) and new.es_responsable_principal then
        update public.categorias_caso
           set departamento_responsable_id = new.departamento_id
         where id = new.categoria_id
           and departamento_responsable_id is distinct from new.departamento_id;
    end if;
    return new;
end;
$$;

comment on function public.sync_categoria_responsable() is
    'Mantiene categorias_caso.departamento_responsable_id alineado con la fila '
    'marcada es_responsable_principal en departamento_categorias.';

drop trigger if exists trg_sync_categoria_responsable on public.departamento_categorias;
create trigger trg_sync_categoria_responsable
    after insert or update of departamento_id, es_responsable_principal
    on public.departamento_categorias
    for each row
    execute function public.sync_categoria_responsable();

-- ----------------------------------------------------------------------------
-- 4. Vista de consumo para el frontend
--    Una fila por (departamento, categoría) con todo lo que el panel de Capas
--    del Centro de Monitoreo necesita, sin joins del lado del cliente.
-- ----------------------------------------------------------------------------
create or replace view public.v_categorias_por_departamento as
select dc.departamento_id,
       d.codigo                    as departamento_codigo,
       d.nombre                    as departamento_nombre,
       d.direccion_id,
       da.nombre                   as direccion_nombre,
       c.id                        as categoria_id,
       c.codigo                    as categoria_codigo,
       c.nombre                    as categoria_nombre,
       c.icono,
       c.color_hex,
       c.estados_flujo,
       c.estado_inicial,
       dc.es_responsable_principal,
       dc.puede_intervenir
from   public.departamento_categorias dc
join   public.categorias_caso            c  on c.id  = dc.categoria_id
join   public.departamentos              d  on d.id  = dc.departamento_id
join   public.direcciones_administrativas da on da.id = d.direccion_id
where  dc.activo
  and  c.activo
  and  d.estado = 'activo';

comment on view public.v_categorias_por_departamento is
    'Catálogo aplanado para el panel de Capas y el filtro por departamento del '
    'Mapa en Vivo.';

-- ----------------------------------------------------------------------------
-- 5. RLS — mismas convenciones que schema.sql
--    Lectura libre para autenticados (es catálogo); escritura solo admin.
-- ----------------------------------------------------------------------------
alter table public.departamento_categorias enable row level security;

drop policy if exists "catalogos_select_departamento_categorias" on public.departamento_categorias;
create policy "catalogos_select_departamento_categorias"
    on public.departamento_categorias for select to authenticated using (true);

drop policy if exists "departamento_categorias_write_admin" on public.departamento_categorias;
create policy "departamento_categorias_write_admin"
    on public.departamento_categorias for all to authenticated
    using       (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'))
    with check  (public.auth_tiene_rol('admin') or public.auth_tiene_rol('superadmin'));

commit;

-- ============================================================================
-- VERIFICACIÓN — correr después del commit
-- ============================================================================
-- Categorías sin responsable principal (debe devolver 0 filas):
--   select c.id, c.nombre
--     from public.categorias_caso c
--    where not exists (select 1 from public.departamento_categorias dc
--                       where dc.categoria_id = c.id and dc.es_responsable_principal);
--
-- Cuántas categorías atiende cada departamento:
--   select departamento_nombre, count(*) filter (where puede_intervenir) as interviene,
--          count(*) as total
--     from public.v_categorias_por_departamento
--    group by 1 order by 3 desc;
