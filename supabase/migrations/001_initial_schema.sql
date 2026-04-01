-- ==========================================
-- REMATES SANTIAGO — Schema inicial
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ==========================================

create extension if not exists "uuid-ossp";

-- ==========================================
-- TABLAS
-- ==========================================

create table if not exists empresas_remate (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  url        text not null,
  activa     boolean default true,
  created_at timestamptz default now()
);

create table if not exists remates (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresas_remate(id) on delete cascade,
  remate_externo_id  text,
  fecha_remate       timestamptz,
  tipo               text,
  estado             text default 'proximo',
  url                text,
  created_at         timestamptz default now(),
  unique (empresa_id, remate_externo_id)
);

create table if not exists vehiculos (
  id               uuid primary key default gen_random_uuid(),
  remate_id        uuid not null references remates(id) on delete cascade,
  lote_id          text,
  marca            text not null,
  modelo           text not null,
  anio             integer,
  precio_base      bigint,
  precio_final     bigint,
  estado_vehiculo  text,
  imagen_url       text,
  url_detalle      text,
  vendido          boolean default false,
  created_at       timestamptz default now(),
  unique (remate_id, lote_id)
);

create table if not exists precios_mercado (
  id             uuid primary key default gen_random_uuid(),
  marca          text not null,
  modelo         text not null,
  anio           integer not null,
  precio_mercado bigint not null,
  fuente         text default 'chileautos',
  fecha_consulta timestamptz default now(),
  unique (marca, modelo, anio, fuente)
);

-- ==========================================
-- SEED: empresas
-- ==========================================
insert into empresas_remate (nombre, url) values
  ('Karcal', 'https://www.karcal.cl'),
  ('Reyco',  'https://rematesreyco.cl'),
  ('Zárate', 'https://remateszarate.cl'),
  ('Macal',  'https://www.macal.cl')
on conflict do nothing;

-- ==========================================
-- VISTA: análisis de precios
-- ==========================================
create or replace view analisis_vehiculos as
select
  v.id,
  v.lote_id,
  v.marca,
  v.modelo,
  v.anio,
  v.precio_base,
  v.precio_final,
  v.estado_vehiculo,
  v.imagen_url,
  v.url_detalle,
  v.vendido,
  v.created_at,
  e.nombre                                    as empresa,
  r.fecha_remate,
  r.estado                                    as estado_remate,
  round(avg(v2.precio_final) over (
    partition by v.marca, v.modelo, v.anio
  ))::bigint                                  as precio_remate_promedio,
  pm.precio_mercado,
  case
    when pm.precio_mercado is not null
     and avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) > 0
    then pm.precio_mercado
       - round(avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio))::bigint
    else null
  end                                         as margen_estimado_clp,
  case
    when pm.precio_mercado is not null
     and avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) > 0
    then round(
      (pm.precio_mercado - avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio))
      / avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) * 100
    )::integer
    else null
  end                                         as margen_porcentaje,
  case
    when avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) > 0
    then round(avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) * 0.8)::bigint
    else round(coalesce(v.precio_base, 0) * 0.8)::bigint
  end                                         as precio_sugerido_compra
from vehiculos v
join remates r          on r.id = v.remate_id
join empresas_remate e  on e.id = r.empresa_id
left join vehiculos v2
  on  v2.marca        = v.marca
  and v2.modelo       = v.modelo
  and v2.anio         = v.anio
  and v2.vendido      = true
  and v2.precio_final is not null
left join lateral (
  select precio_mercado
  from   precios_mercado
  where  marca  = v.marca
    and  modelo = v.modelo
    and  anio   = v.anio
  order  by fecha_consulta desc
  limit  1
) pm on true;

-- ==========================================
-- RLS
-- ==========================================
alter table empresas_remate enable row level security;
alter table remates         enable row level security;
alter table vehiculos       enable row level security;
alter table precios_mercado enable row level security;

create policy "read_authenticated" on empresas_remate
  for select to authenticated using (true);
create policy "read_authenticated" on remates
  for select to authenticated using (true);
create policy "read_authenticated" on vehiculos
  for select to authenticated using (true);
create policy "read_authenticated" on precios_mercado
  for select to authenticated using (true);
