-- Migración 009: deudas/multas + imágenes adicionales + historial modelos similares

alter table vehiculos
  add column if not exists deuda_total    bigint,
  add column if not exists deuda_detalle  text,
  add column if not exists imagenes       text[];

-- Recrear vista con lateral joins limpios y soporte de modelos similares
drop view if exists analisis_vehiculos;

create view analisis_vehiculos as
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
  v.imagenes,
  v.url_detalle,
  v.url_cav,
  v.url_inspeccion,
  v.vendido,
  v.deuda_total,
  v.deuda_detalle,
  r.fecha_remate,
  r.estado          as estado_remate,
  r.url             as url_remate,
  e.nombre          as empresa,
  e.url             as empresa_url,

  -- 1. Exacto: mismo modelo + mismo año
  hist_exacto.precio    as hist_exacto_precio,
  hist_exacto.cantidad  as hist_exacto_cantidad,

  -- 2. Rango ±1 año: mismo modelo
  hist_rango.precio     as hist_rango_precio,
  hist_rango.cantidad   as hist_rango_cantidad,

  -- 3. Referencia: mismo modelo, año más cercano con mejores características
  hr.anio          as hist_ref_anio,
  hr.precio        as hist_ref_precio,
  hr.transmision   as hist_ref_transmision,
  hr.combustible   as hist_ref_combustible,
  hr.traccion      as hist_ref_traccion,

  -- 4. Modelos similares: misma marca + primer token del modelo (MACAN ≈ MACAN GTS ≈ MACAN S)
  hist_similar.precio    as hist_similar_precio,
  hist_similar.cantidad  as hist_similar_cantidad,
  hs_resumen.items       as hist_similar_resumen,

  -- Precio consolidado: exacto → rango → ref → similar
  coalesce(
    hist_exacto.precio,
    hist_rango.precio,
    hr.precio,
    hist_similar.precio
  ) as precio_remate_promedio,

  pm.precio_mercado,
  pm.precio_min              as precio_mercado_min,
  pm.precio_max              as precio_mercado_max,
  pm.cantidad_publicaciones  as precio_mercado_cantidad,

  -- Precio sugerido de compra (80% del promedio de remates, o base si no hay historial)
  case
    when coalesce(hist_exacto.precio, hist_rango.precio, hr.precio, hist_similar.precio) is not null
    then round(coalesce(hist_exacto.precio, hist_rango.precio, hr.precio, hist_similar.precio)::numeric * 0.8)::bigint
    when pm.precio_mercado is not null and v.precio_base is not null
    then round(v.precio_base::numeric * 0.8)::bigint
    else null
  end as precio_sugerido_compra,

  -- Margen estimado
  case
    when pm.precio_mercado is not null
      and coalesce(hist_exacto.precio, hist_rango.precio) is not null
      and coalesce(hist_exacto.precio, hist_rango.precio) > 0
    then round(
      (pm.precio_mercado::numeric - coalesce(hist_exacto.precio, hist_rango.precio))
      / coalesce(hist_exacto.precio, hist_rango.precio) * 100, 1)
    when pm.precio_mercado is not null and v.precio_base is not null and v.precio_base > 0
    then round((pm.precio_mercado::numeric - v.precio_base) / v.precio_base * 100, 1)
    else null
  end as margen_porcentaje,

  case
    when pm.precio_mercado is not null and v.precio_base is not null
    then pm.precio_mercado - v.precio_base
    else null
  end as margen_estimado_clp

from vehiculos v
join remates r         on r.id  = v.remate_id
join empresas_remate e on e.id  = r.empresa_id

-- Lateral: exacto (mismo modelo + año)
left join lateral (
  select
    round(avg(h.precio_final))::bigint as precio,
    count(*)::int                      as cantidad
  from vehiculos h
  join remates rh on rh.id = h.remate_id
  join empresas_remate eh on eh.id = rh.empresa_id
  where h.marca = v.marca and h.modelo = v.modelo
    and h.anio  = v.anio
    and h.vendido = true and h.precio_final is not null
    and eh.nombre = 'Karcal'
) hist_exacto on true

-- Lateral: rango ±1 año (mismo modelo)
left join lateral (
  select
    round(avg(h.precio_final))::bigint as precio,
    count(*)::int                      as cantidad
  from vehiculos h
  join remates rh on rh.id = h.remate_id
  join empresas_remate eh on eh.id = rh.empresa_id
  where h.marca = v.marca and h.modelo = v.modelo
    and h.anio between coalesce(v.anio, 0) - 1 and coalesce(v.anio, 9999) + 1
    and h.vendido = true and h.precio_final is not null
    and eh.nombre = 'Karcal'
) hist_rango on true

-- Lateral: año más cercano con prioridad de características (mismo modelo exacto)
left join lateral (
  select
    h.anio, h.transmision, h.combustible, h.traccion,
    (select round(avg(h2.precio_final))::bigint
     from vehiculos h2
     join remates rh2 on rh2.id = h2.remate_id
     join empresas_remate eh2 on eh2.id = rh2.empresa_id
     where h2.marca = v.marca and h2.modelo = v.modelo
       and h2.vendido = true and h2.precio_final is not null
       and eh2.nombre = 'Karcal' and h2.anio = h.anio
       and (h.transmision is null or h2.transmision = h.transmision)
       and (h.combustible is null or h2.combustible = h.combustible)
    ) as precio
  from vehiculos h
  join remates rh on rh.id = h.remate_id
  join empresas_remate eh on eh.id = rh.empresa_id
  where h.marca = v.marca and h.modelo = v.modelo
    and h.vendido = true and h.precio_final is not null
    and eh.nombre = 'Karcal'
  order by
    case when v.transmision is not null and h.transmision = v.transmision then 0 else 1 end,
    case when v.combustible  is not null and h.combustible  = v.combustible  then 0 else 1 end,
    case when v.traccion     is not null and h.traccion     = v.traccion     then 0 else 1 end,
    abs(h.anio - coalesce(v.anio, 2020))
  limit 1
) hr on true

-- Lateral: modelos similares (misma marca, primer token del modelo coincide)
left join lateral (
  select
    round(avg(h.precio_final))::bigint as precio,
    count(*)::int                      as cantidad
  from vehiculos h
  join remates rh on rh.id = h.remate_id
  join empresas_remate eh on eh.id = rh.empresa_id
  where h.marca = v.marca
    and split_part(h.modelo, ' ', 1) = split_part(v.modelo, ' ', 1)
    and h.vendido = true and h.precio_final is not null
    and eh.nombre = 'Karcal'
) hist_similar on true

-- Lateral: items por variante con URL de la ficha más reciente
left join lateral (
  select json_agg(
    json_build_object(
      'modelo',  modelo,
      'precio',  avg_precio,
      'url',     url_reciente
    )
    order by avg_precio desc
  ) as items
  from (
    select
      h.modelo,
      round(avg(h.precio_final))::bigint as avg_precio,
      (
        select h2.url_detalle
        from vehiculos h2
        join remates rh2 on rh2.id = h2.remate_id
        join empresas_remate eh2 on eh2.id = rh2.empresa_id
        where h2.marca = v.marca and h2.modelo = h.modelo
          and h2.vendido = true and h2.precio_final is not null
          and eh2.nombre = 'Karcal'
        order by rh2.fecha_remate desc
        limit 1
      ) as url_reciente
    from vehiculos h
    join remates rh on rh.id = h.remate_id
    join empresas_remate eh on eh.id = rh.empresa_id
    where h.marca = v.marca
      and split_part(h.modelo, ' ', 1) = split_part(v.modelo, ' ', 1)
      and h.vendido = true and h.precio_final is not null
      and eh.nombre = 'Karcal'
    group by h.modelo
  ) sub
) hs_resumen on true

-- Lateral: precio de mercado más reciente
left join lateral (
  select precio_mercado, precio_min, precio_max, cantidad_publicaciones
  from   precios_mercado
  where  vehiculo_id = v.id and fuente = 'chileautos'
  order  by fecha_consulta desc
  limit  1
) pm on true;

grant select on analisis_vehiculos to anon;
