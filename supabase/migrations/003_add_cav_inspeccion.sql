-- Migración 003: agregar URLs de documentos del vehículo
alter table vehiculos
  add column if not exists url_cav        text null,
  add column if not exists url_inspeccion text null;

-- Actualizar vista para incluir nuevos campos
create or replace view analisis_vehiculos as
select
  v.id,
  v.marca,
  v.modelo,
  v.anio,
  v.patente,
  v.kilometraje,
  v.mandante,
  v.combustible,
  v.traccion,
  v.transmision,
  v.precio_base,
  v.precio_final,
  v.estado_vehiculo,
  v.imagen_url,
  v.url_detalle,
  v.url_cav,
  v.url_inspeccion,
  v.vendido,
  r.fecha_remate,
  r.estado                                                          as estado_remate,
  r.url                                                             as url_remate,
  e.nombre                                                          as empresa,
  e.url_base                                                        as empresa_url,

  round(avg(v2.precio_final) over (
    partition by v.marca, v.modelo, v.anio
  ))::bigint                                                        as precio_remate_promedio,

  pm.precio_mercado,

  case
    when pm.precio_mercado is not null and
         avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) > 0
    then round(avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) * 0.8)::bigint
    when pm.precio_mercado is not null and v.precio_base is not null
    then round(v.precio_base * 0.8)::bigint
    else null
  end                                                               as precio_sugerido_compra,

  case
    when pm.precio_mercado is not null and
         avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) > 0
    then round(
      (pm.precio_mercado::numeric - avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio))
      / avg(v2.precio_final) over (partition by v.marca, v.modelo, v.anio) * 100, 1)
    when pm.precio_mercado is not null and v.precio_base is not null and v.precio_base > 0
    then round((pm.precio_mercado::numeric - v.precio_base) / v.precio_base * 100, 1)
    else null
  end                                                               as margen_porcentaje,

  case
    when pm.precio_mercado is not null and v.precio_base is not null
    then pm.precio_mercado - v.precio_base
    else null
  end                                                               as margen_estimado_clp

from vehiculos v
join remates r         on r.id  = v.remate_id
join empresas_remate e on e.id  = r.empresa_id
left join vehiculos v2
  on  v2.marca       = v.marca
  and v2.modelo      = v.modelo
  and v2.anio        = v.anio
  and v2.vendido     = true
  and v2.precio_final is not null
left join lateral (
  select precio_mercado
  from   precios_mercado
  where  marca  = v.marca
  and    modelo = v.modelo
  order  by fecha_consulta desc
  limit  1
) pm on true;

grant select on analisis_vehiculos to anon;
