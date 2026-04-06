-- Tabla para resultados de los agentes IA (Gemini)
create table if not exists analisis_ia (
  id              uuid primary key default gen_random_uuid(),
  vehiculo_id     uuid not null references vehiculos(id) on delete cascade,

  -- Agente 1: análisis visual de daño
  dano_nivel              text check (dano_nivel in ('leve','moderado','severo','sin_datos')),
  dano_descripcion        text,
  costo_reparacion_min    bigint,
  costo_reparacion_max    bigint,
  partes_afectadas        text[],

  -- Agente 2: recomendación de compra
  decision                text check (decision in ('comprar','analizar','evitar')),
  precio_maximo_oferta    bigint,
  margen_estimado         numeric(5,2),
  justificacion           text,

  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),

  unique (vehiculo_id)
);

-- Trigger para updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger analisis_ia_updated_at
  before update on analisis_ia
  for each row execute function set_updated_at();
