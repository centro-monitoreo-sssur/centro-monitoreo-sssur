-- Tabla base: una fila por unidad territorial (distrito/cantón/colonia)
create table zonas_poblacion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nivel text not null check (nivel in ('distrito','canton','colonia')),
  distrito_padre text,              -- para drill-down jerárquico
  geojson_real jsonb not null,      -- forma geográfica real
  geojson_cartograma jsonb,         -- forma distorsionada (nullable hasta precomputar)
  poblacion integer not null default 0,
  densidad numeric,
  indicador_secundario numeric,     -- pobreza, cobertura, incidencias, lo que definan
  fuente text,                      -- ej. "Censo 2024" — trazabilidad, nunca inventar cifras
  actualizado_en timestamptz default now()
);

-- RLS: Zero Trust real, no solo de nombre
alter table zonas_poblacion enable row level security;

create policy "lectura_publica_autenticada"
  on zonas_poblacion for select
  using (auth.role() = 'authenticated');

-- Nadie escribe desde el cliente. Esto solo lo toca el job de precómputo
-- con service_role key, nunca con la anon key del frontend.
create policy "sin_escritura_cliente"
  on zonas_poblacion for insert
  with check (false);
