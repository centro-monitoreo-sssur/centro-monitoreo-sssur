-- ============================================================================
-- MIGRACIÓN v8 — Ciclo de vida del organigrama
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Las líneas y sublíneas de trabajo cambian: se suprimen, se renombran, se
-- unifican, o una dirección desaparece y sus dependencias pasan a otra.
--
-- PRINCIPIO RECTOR
--   La historia es inmutable, el trabajo abierto migra.
--   Un departamento NUNCA se borra. Se marca sin vigencia y se apunta a su
--   sucesor. Los casos ya cerrados siguen colgando de la unidad que realmente
--   los atendió — si se reasignaran, los reportes del año pasado cambiarían
--   solos y la bitácora de auditoría dejaría de cuadrar. Lo que sí se mueve es
--   lo vivo: casos abiertos, personal, cuadrillas, categorías y plantillas.
--
--   Renombrar NO usa este mecanismo: es la misma unidad con otra etiqueta, se
--   resuelve actualizando el CSV y re-corriendo la migración v7.
--
-- REQUIERE: migration_v6 (departamento_categorias) y migration_v7 (seed).
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Columnas de vigencia y sucesión
-- ----------------------------------------------------------------------------
alter table public.direcciones_administrativas
    add column if not exists sucedida_por_id bigint references public.direcciones_administrativas(id),
    add column if not exists vigente_desde   date not null default current_date,
    add column if not exists vigente_hasta   date,
    add column if not exists motivo_baja     text;

alter table public.departamentos
    add column if not exists sucedido_por_id bigint references public.departamentos(id),
    add column if not exists vigente_desde   date not null default current_date,
    add column if not exists vigente_hasta   date,
    add column if not exists motivo_baja     text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_dep_motivo_baja') then
        alter table public.departamentos add constraint chk_dep_motivo_baja
            check (motivo_baja is null or motivo_baja in ('supresion', 'unificacion', 'reestructuracion'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'chk_dir_motivo_baja') then
        alter table public.direcciones_administrativas add constraint chk_dir_motivo_baja
            check (motivo_baja is null or motivo_baja in ('supresion', 'unificacion', 'reestructuracion'));
    end if;
    -- Una unidad no puede sucederse a sí misma.
    if not exists (select 1 from pg_constraint where conname = 'chk_dep_no_autosucesion') then
        alter table public.departamentos add constraint chk_dep_no_autosucesion
            check (sucedido_por_id is null or sucedido_por_id <> id);
    end if;
end $$;

comment on column public.departamentos.sucedido_por_id is
    'Departamento que absorbió a este al suprimirlo o unificarlo. NULL = sigue '
    'vigente, o se suprimió sin sucesor (su trabajo abierto se cerró o reasignó '
    'manualmente).';

comment on column public.departamentos.vigente_hasta is
    'Fecha en que la unidad dejó de existir. NULL = vigente. Los casos cerrados '
    'antes de esta fecha se conservan apuntando aquí a propósito.';

create index if not exists idx_departamentos_vigentes
    on public.departamentos (id) where vigente_hasta is null;

-- ----------------------------------------------------------------------------
-- 2. Resolución de la cadena de sucesión
--    Un departamento pudo ser absorbido por otro que a su vez fue absorbido.
--    Para consolidar reportes hay que llegar hasta la unidad viva.
-- ----------------------------------------------------------------------------
create or replace function public.fn_departamento_vigente(p_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_actual bigint := p_id;
    v_sig    bigint;
    v_saltos int := 0;
begin
    loop
        select sucedido_por_id into v_sig
          from public.departamentos where id = v_actual;

        exit when v_sig is null;

        v_saltos := v_saltos + 1;
        -- Guarda anti-ciclo: A→B→A dejaría el loop colgado indefinidamente.
        if v_saltos > 50 then
            raise warning 'Cadena de sucesión sospechosa (¿ciclo?) desde departamento %', p_id;
            return v_actual;
        end if;

        v_actual := v_sig;
    end loop;

    return v_actual;
end;
$$;

comment on function public.fn_departamento_vigente(bigint) is
    'Sigue la cadena sucedido_por_id hasta el departamento vigente. Úsala en '
    'reportes consolidados para que el trabajo de unidades ya suprimidas se '
    'sume bajo la que hoy asume esa competencia.';

-- ----------------------------------------------------------------------------
-- 3. Supresión / unificación de un departamento
--    Una sola llamada deja la base consistente.
-- ----------------------------------------------------------------------------
create or replace function public.fn_suprimir_departamento(
    p_codigo          text,
    p_codigo_sucesor  text default null,
    p_motivo          text default 'supresion',
    p_fecha           date default current_date
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id       bigint;
    v_sucesor  bigint;
    v_casos    int := 0;
    v_usuarios int := 0;
    v_cuad     int := 0;
    v_cats     int := 0;
    v_plant    int := 0;
begin
    select id into v_id from public.departamentos where codigo = p_codigo;
    if v_id is null then
        raise exception 'No existe el departamento con código %', p_codigo;
    end if;

    if p_codigo_sucesor is not null then
        select id into v_sucesor from public.departamentos where codigo = p_codigo_sucesor;
        if v_sucesor is null then
            raise exception 'No existe el departamento sucesor con código %', p_codigo_sucesor;
        end if;
        if v_sucesor = v_id then
            raise exception 'Un departamento no puede ser su propio sucesor (%)', p_codigo;
        end if;
    end if;

    -- ── Lo vivo migra ────────────────────────────────────────────────────────
    if v_sucesor is not null then

        -- Casos ABIERTOS. Los cerrados se quedan: son historia.
        update public.casos
           set departamento_actual_id = v_sucesor
         where departamento_actual_id = v_id
           and fecha_cierre is null;
        get diagnostics v_casos = row_count;

        update public.usuarios set departamento_id = v_sucesor where departamento_id = v_id;
        get diagnostics v_usuarios = row_count;

        update public.cuadrillas set departamento_id = v_sucesor where departamento_id = v_id;
        get diagnostics v_cuad = row_count;

        update public.plantillas_documento set departamento_id = v_sucesor where departamento_id = v_id;
        get diagnostics v_plant = row_count;

        -- Categorías: si el sucesor ya atendía la misma, se fusionan los
        -- permisos en su fila y se descarta la duplicada; si no, se traslada.
        update public.departamento_categorias suc
           set puede_intervenir         = suc.puede_intervenir or org.puede_intervenir,
               es_responsable_principal = suc.es_responsable_principal or org.es_responsable_principal,
               activo                   = suc.activo or org.activo
          from public.departamento_categorias org
         where org.departamento_id = v_id
           and suc.departamento_id = v_sucesor
           and suc.categoria_id    = org.categoria_id;

        delete from public.departamento_categorias org
         where org.departamento_id = v_id
           and exists (select 1 from public.departamento_categorias suc
                        where suc.departamento_id = v_sucesor
                          and suc.categoria_id    = org.categoria_id);

        update public.departamento_categorias
           set departamento_id = v_sucesor
         where departamento_id = v_id;
        get diagnostics v_cats = row_count;

    else
        -- Sin sucesor no se puede suprimir si queda trabajo abierto: dejaría
        -- casos vivos apuntando a una unidad inexistente.
        if exists (select 1 from public.casos
                    where departamento_actual_id = v_id and fecha_cierre is null) then
            raise exception
                'El departamento % tiene casos abiertos. Indica un sucesor o cierra/reasigna esos casos primero.',
                p_codigo;
        end if;
        if exists (select 1 from public.departamento_categorias
                    where departamento_id = v_id and es_responsable_principal) then
            raise exception
                'El departamento % es responsable principal de al menos una categoría. Indica un sucesor.',
                p_codigo;
        end if;
    end if;

    -- ── La unidad se marca sin vigencia, nunca se borra ──────────────────────
    update public.departamentos
       set estado          = 'inactivo',
           vigente_hasta   = p_fecha,
           motivo_baja     = p_motivo,
           sucedido_por_id = v_sucesor
     where id = v_id;

    return format(
        'Departamento %s dado de baja (%s). Migrados al sucesor %s: %s casos abiertos, %s usuarios, %s cuadrillas, %s categorías, %s plantillas.',
        p_codigo, p_motivo, coalesce(p_codigo_sucesor, '—'),
        v_casos, v_usuarios, v_cuad, v_cats, v_plant);
end;
$$;

comment on function public.fn_suprimir_departamento(text, text, text, date) is
    'Da de baja un departamento migrando su trabajo abierto al sucesor y '
    'preservando los casos cerrados. Ej: '
    'select public.fn_suprimir_departamento(''0103-05'', ''0103-04'', ''unificacion'');';

-- ----------------------------------------------------------------------------
-- 4. Supresión de una dirección: sus departamentos pasan a otra
-- ----------------------------------------------------------------------------
create or replace function public.fn_reasignar_direccion(
    p_codigo          text,
    p_codigo_sucesora text,
    p_motivo          text default 'reestructuracion',
    p_fecha           date default current_date
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id      bigint;
    v_sucesora bigint;
    v_deps    int := 0;
begin
    select id into v_id        from public.direcciones_administrativas where codigo = p_codigo;
    select id into v_sucesora  from public.direcciones_administrativas where codigo = p_codigo_sucesora;

    if v_id is null       then raise exception 'No existe la dirección %', p_codigo; end if;
    if v_sucesora is null then raise exception 'No existe la dirección sucesora %', p_codigo_sucesora; end if;
    if v_id = v_sucesora  then raise exception 'Una dirección no puede sucederse a sí misma (%)', p_codigo; end if;

    -- Los departamentos siguen siendo los mismos, solo cambian de padre.
    update public.departamentos set direccion_id = v_sucesora where direccion_id = v_id;
    get diagnostics v_deps = row_count;

    update public.direcciones_administrativas
       set activo          = false,
           vigente_hasta   = p_fecha,
           motivo_baja     = p_motivo,
           sucedida_por_id = v_sucesora
     where id = v_id;

    return format('Dirección %s dada de baja (%s). %s departamentos reasignados a %s.',
                  p_codigo, p_motivo, v_deps, p_codigo_sucesora);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Guarda: no asignar trabajo nuevo a una unidad sin vigencia
-- ----------------------------------------------------------------------------
create or replace function public.fn_valida_departamento_vigente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_vigente boolean;
    v_codigo  text;
begin
    select (vigente_hasta is null and estado = 'activo'), codigo
      into v_vigente, v_codigo
      from public.departamentos
     where id = new.departamento_actual_id;

    if not coalesce(v_vigente, false) then
        raise exception
            'El departamento % ya no está vigente; no se le puede asignar el caso. Usa fn_departamento_vigente() para ubicar al sucesor.',
            v_codigo;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_caso_departamento_vigente on public.casos;
create trigger trg_caso_departamento_vigente
    before insert or update of departamento_actual_id
    on public.casos
    for each row
    execute function public.fn_valida_departamento_vigente();

-- ----------------------------------------------------------------------------
-- 6. Vistas de consumo
-- ----------------------------------------------------------------------------
create or replace view public.v_organigrama_vigente as
select d.id             as departamento_id,
       d.codigo         as departamento_codigo,
       d.nombre         as departamento_nombre,
       da.id            as direccion_id,
       da.codigo        as direccion_codigo,
       da.nombre        as direccion_nombre
from   public.departamentos d
join   public.direcciones_administrativas da on da.id = d.direccion_id
where  d.vigente_hasta is null
  and  d.estado = 'activo'
  and  da.vigente_hasta is null
  and  da.activo;

comment on view public.v_organigrama_vigente is
    'Solo unidades vigentes. Es lo que deben ofrecer los selectores de la UI; '
    'para reportes históricos consulta las tablas base.';

create or replace view public.v_departamentos_historicos as
select d.id,
       d.codigo,
       d.nombre,
       d.estado,
       d.vigente_desde,
       d.vigente_hasta,
       d.motivo_baja,
       suc.codigo as sucesor_codigo,
       suc.nombre as sucesor_nombre,
       public.fn_departamento_vigente(d.id) as departamento_vigente_id
from   public.departamentos d
left   join public.departamentos suc on suc.id = d.sucedido_por_id;

comment on view public.v_departamentos_historicos is
    'Trazabilidad del organigrama: qué unidad existió, hasta cuándo, por qué se '
    'dio de baja y quién asumió su competencia.';

commit;

-- ============================================================================
-- USO
-- ============================================================================
-- Unificar Administración de Cementerios dentro de Mantenimiento Interno:
--   select public.fn_suprimir_departamento('0103-05', '0103-04', 'unificacion');
--
-- Suprimir sin sucesor (falla si hay casos abiertos, a propósito):
--   select public.fn_suprimir_departamento('0101-20', null, 'supresion');
--
-- Mover los departamentos de una dirección que desaparece:
--   select public.fn_reasignar_direccion('0102', '0101', 'reestructuracion');
--
-- Reporte consolidado que suma el trabajo de unidades ya suprimidas bajo la
-- que hoy asume su competencia:
--   select v.departamento_nombre, count(*) as casos
--     from public.casos c
--     join public.v_organigrama_vigente v
--       on v.departamento_id = public.fn_departamento_vigente(c.departamento_actual_id)
--    group by 1 order by 2 desc;
--
-- VERIFICACIÓN
--   select * from public.v_departamentos_historicos where vigente_hasta is not null;
