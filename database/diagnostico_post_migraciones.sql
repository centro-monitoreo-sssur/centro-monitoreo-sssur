-- ============================================================================
-- DIAGNÓSTICO POST-MIGRACIONES v6 → v9
-- Centro de Monitoreo SSSur · Municipalidad de San Salvador Sur
-- ----------------------------------------------------------------------------
-- Solo lectura: no modifica nada. Corre los bloques uno por uno y compara con
-- el resultado esperado que aparece en cada cabecera.
-- ============================================================================


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 1. SEGURIDAD — el más importante                                         │
-- │    Tablas con RLS activo pero SIN ninguna política.                      │
-- │    RLS encendido y cero policies = nadie puede leer ni escribir, ni      │
-- │    siquiera un usuario autenticado. Es el riesgo real de haber elegido   │
-- │    "Run and enable RLS" sobre una tabla que no lo tenía previsto.        │
-- │    ESPERADO: 0 filas.                                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
select n.nspname  as esquema,
       c.relname  as tabla,
       'RLS activo sin políticas — acceso totalmente bloqueado' as problema
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
  and  c.relrowsecurity
  and  not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order  by 2;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 2. Inventario de RLS y políticas por tabla                               │
-- │    Para contrastar con lo que define database/schema.sql. Si aparece una │
-- │    tabla con rls_activo = true que no esperabas, ahí actuó el botón.     │
-- └──────────────────────────────────────────────────────────────────────────┘
select c.relname                                as tabla,
       c.relrowsecurity                         as rls_activo,
       count(p.polname)                         as politicas,
       string_agg(p.polname, ', ' order by p.polname) as nombres
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
left   join pg_policy p on p.polrelid = c.oid
where  n.nspname = 'public' and c.relkind = 'r'
group  by 1, 2
order  by 2 desc, 1;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 3. ¿Aterrizaron los seeds?                                               │
-- │    ESPERADO: 8 direcciones · 82 departamentos · 19 categorías ·          │
-- │              37 asignaciones                                             │
-- └──────────────────────────────────────────────────────────────────────────┘
select (select count(*) from public.direcciones_administrativas) as direcciones,
       (select count(*) from public.departamentos)               as departamentos,
       (select count(*) from public.categorias_caso)             as categorias,
       (select count(*) from public.departamento_categorias)     as asignaciones;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 4. Integridad del reparto N:M                                            │
-- │    Toda categoría debe tener exactamente UN responsable principal.       │
-- │    ESPERADO: 0 filas.                                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
select c.codigo,
       c.nombre,
       count(*) filter (where dc.es_responsable_principal) as principales
from   public.categorias_caso c
join   public.departamento_categorias dc on dc.categoria_id = c.id
group  by 1, 2
having count(*) filter (where dc.es_responsable_principal) <> 1;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 5. El trigger de la v6 mantiene sincronizada la columna legacy           │
-- │    ESPERADO: 0 filas.                                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
select c.codigo,
       c.departamento_responsable_id as en_categorias_caso,
       dc.departamento_id            as en_tabla_puente
from   public.categorias_caso c
join   public.departamento_categorias dc
       on dc.categoria_id = c.id and dc.es_responsable_principal
where  c.departamento_responsable_id <> dc.departamento_id;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 6. Objetos que deben existir tras v6 y v8                                │
-- │    ESPERADO: 4 vistas y 5 funciones, todas en 'presente'.                │
-- └──────────────────────────────────────────────────────────────────────────┘
select v.nombre,
       v.tipo,
       case when v.existe then 'presente' else 'FALTA' end as estado
from (
    select 'v_categorias_por_departamento' as nombre, 'vista' as tipo,
           to_regclass('public.v_categorias_por_departamento') is not null as existe
    union all select 'v_organigrama_vigente',       'vista',
           to_regclass('public.v_organigrama_vigente') is not null
    union all select 'v_departamentos_historicos',  'vista',
           to_regclass('public.v_departamentos_historicos') is not null
    union all select 'departamento_categorias',     'tabla',
           to_regclass('public.departamento_categorias') is not null
    union all select 'fn_departamento_vigente',     'función',
           to_regproc('public.fn_departamento_vigente') is not null
    union all select 'fn_suprimir_departamento',    'función',
           to_regproc('public.fn_suprimir_departamento') is not null
    union all select 'fn_reasignar_direccion',      'función',
           to_regproc('public.fn_reasignar_direccion') is not null
    union all select 'fn_valida_departamento_vigente', 'función',
           to_regproc('public.fn_valida_departamento_vigente') is not null
    union all select 'sync_categoria_responsable',  'función',
           to_regproc('public.sync_categoria_responsable') is not null
) v
order by v.existe, v.tipo, v.nombre;


-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ 7. Carga de trabajo propuesta — para que cada dirección la valide        │
-- └──────────────────────────────────────────────────────────────────────────┘
select departamento_codigo,
       departamento_nombre,
       direccion_nombre,
       count(*) filter (where es_responsable_principal) as es_responsable,
       count(*) filter (where puede_intervenir)         as puede_intervenir,
       count(*)                                         as ve_en_total
from   public.v_categorias_por_departamento
group  by 1, 2, 3
order  by 4 desc, 5 desc, 1;
