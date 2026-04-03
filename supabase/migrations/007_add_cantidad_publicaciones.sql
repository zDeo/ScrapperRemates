-- Migración 007: agregar cantidad de publicaciones a precios_mercado

alter table precios_mercado
  add column if not exists cantidad_publicaciones integer;

-- Recrear vista para exponer el nuevo campo
drop view if exists analisis_vehiculos;

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
  r.estado          as estado_remate,
  r.url             as url_remate,
  e.nombre          as empresa,
  e.url             as empresa_url,

  -- 1. Promedio año exacto (solo Karcal)
  (select round(avg(h.precio_final))::bigint
   from vehiculos h
   join remates rh on rh.id = h.remate_id
   join empresas_remate eh on eh.id = rh.empresa_id
   where h.marca = v.marca and h.modelo = v.modelo
     and h.anio = v.anio
     and h.vendido = true and h.precio_final is not null
     and eh.nombre = 'Karcal'
  ) as hist_exacto_precio,

  (select count(*)::int
   from vehiculos h
   join remates rh on rh.id = h.remate_id
   join empresas_remate eh on eh.id = rh.empresa_id
   where h.marca = v.marca and h.modelo = v.modelo
     and h.anio = v.anio
     and h.vendido = true and h.precio_final is not null
     and eh.nombre = 'Karcal'
  ) as hist_exacto_cantidad,

  -- 2. Promedio ±1 año (solo Karcal)
  (select round(avg(h.precio_final))::bigint
   from vehiculos h
   join remates rh on rh.id = h.remate_id
   join empresas_remate eh on eh.id = rh.empresa_id
   where h.marca = v.marca and h.modelo = v.modelo
     and h.anio between coalesce(v.anio, 0) - 1 and coalesce(v.anio, 9999) + 1
     and h.vendido = true and h.precio_final is not null
     and eh.nombre = 'Karcal'
  ) as hist_rango_precio,

  (select count(*)::int
   from vehiculos h
   join remates rh on rh.id = h.remate_id
   join empresas_remate eh on eh.id = rh.empresa_id
   where h.marca = v.marca and h.modelo = v.modelo
     and h.anio between coalesce(v.anio, 0) - 1 and coalesce(v.anio, 9999) + 1
     and h.vendido = true and h.precio_final is not null
     and eh.nombre = 'Karcal'
  ) as hist_rango_cantidad,

  -- 3. Año más cercano disponible (solo Karcal)
  (select h.anio
   from vehiculos h
   join remates rh on rh.id = h.remate_id
   join empresas_remate eh on eh.id = rh.empresa_id
   where h.marca = v.marca and h.modelo = v.modelo
     and h.vendido = true and h.precio_final is not null
     and eh.nombre = 'Karcal'
   order by abs(h.anio - coalesce(v.anio, 2020))
   limit 1
  ) as hist_ref_anio,

  (select round(avg(h2.precio_final))::bigint
   from vehiculos h2
   join remates rh2 on rh2.id = h2.remate_id
   join empresas_remate eh2 on eh2.id = rh2.empresa_id
   where h2.marca = v.marca and h2.modelo = v.modelo
     and h2.vendido = true and h2.precio_final is not null
     and eh2.nombre = 'Karcal'
     and h2.anio = (
       select h.anio from vehiculos h
       join remates rh on rh.id = h.remate_id
       join empresas_remate eh on eh.id = rh.empresa_id
       where h.marca = v.marca and h.modelo = v.modelo
         and h.vendido = true and h.precio_final is not null
         and eh.nombre = 'Karcal'
       order by abs(h.anio - coalesce(v.anio, 2020))
       limit 1
     )
  ) as hist_ref_precio,

  -- Precio consolidado: exacto → ±1 año → año más cercano
  coalesce(
    (select round(avg(h.precio_final))::bigint from vehiculos h
     join remates rh on rh.id = h.remate_id
     join empresas_remate eh on eh.id = rh.empresa_id
     where h.marca=v.marca and h.modelo=v.modelo and h.anio=v.anio
       and h.vendido=true and h.precio_final is not null
       and eh.nombre='Karcal'),
    (select round(avg(h.precio_final))::bigint from vehiculos h
     join remates rh on rh.id = h.remate_id
     join empresas_remate eh on eh.id = rh.empresa_id
     where h.marca=v.marca and h.modelo=v.modelo
       and h.anio between coalesce(v.anio,0)-1 and coalesce(v.anio,9999)+1
       and h.vendido=true and h.precio_final is not null
       and eh.nombre='Karcal'),
    (select round(avg(h2.precio_final))::bigint
     from vehiculos h2
     join remates rh2 on rh2.id = h2.remate_id
     join empresas_remate eh2 on eh2.id = rh2.empresa_id
     where h2.marca=v.marca and h2.modelo=v.modelo
       and h2.vendido=true and h2.precio_final is not null
       and eh2.nombre='Karcal'
       and h2.anio = (
         select h.anio from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal'
         order by abs(h.anio - coalesce(v.anio, 2020))
         limit 1
       )
    )
  ) as precio_remate_promedio,

  -- Precio de mercado Chileautos
  pm.precio_mercado,
  pm.precio_min              as precio_mercado_min,
  pm.precio_max              as precio_mercado_max,
  pm.cantidad_publicaciones  as precio_mercado_cantidad,

  -- Precio sugerido de compra = 80% del mejor promedio histórico
  case
    when coalesce(
      (select round(avg(h.precio_final))::bigint from vehiculos h
       join remates rh on rh.id = h.remate_id
       join empresas_remate eh on eh.id = rh.empresa_id
       where h.marca=v.marca and h.modelo=v.modelo and h.anio=v.anio
         and h.vendido=true and h.precio_final is not null
         and eh.nombre='Karcal'),
      (select round(avg(h.precio_final))::bigint from vehiculos h
       join remates rh on rh.id = h.remate_id
       join empresas_remate eh on eh.id = rh.empresa_id
       where h.marca=v.marca and h.modelo=v.modelo
         and h.anio between coalesce(v.anio,0)-1 and coalesce(v.anio,9999)+1
         and h.vendido=true and h.precio_final is not null
         and eh.nombre='Karcal'),
      (select round(avg(h2.precio_final))::bigint
       from vehiculos h2
       join remates rh2 on rh2.id = h2.remate_id
       join empresas_remate eh2 on eh2.id = rh2.empresa_id
       where h2.marca=v.marca and h2.modelo=v.modelo
         and h2.vendido=true and h2.precio_final is not null
         and eh2.nombre='Karcal'
         and h2.anio = (
           select h.anio from vehiculos h
           join remates rh on rh.id = h.remate_id
           join empresas_remate eh on eh.id = rh.empresa_id
           where h.marca=v.marca and h.modelo=v.modelo
             and h.vendido=true and h.precio_final is not null
             and eh.nombre='Karcal'
           order by abs(h.anio - coalesce(v.anio, 2020))
           limit 1
         )
      )
    ) is not null
    then round(
      coalesce(
        (select round(avg(h.precio_final))::bigint from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo and h.anio=v.anio
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal'),
        (select round(avg(h.precio_final))::bigint from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo
           and h.anio between coalesce(v.anio,0)-1 and coalesce(v.anio,9999)+1
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal'),
        (select round(avg(h2.precio_final))::bigint
         from vehiculos h2
         join remates rh2 on rh2.id = h2.remate_id
         join empresas_remate eh2 on eh2.id = rh2.empresa_id
         where h2.marca=v.marca and h2.modelo=v.modelo
           and h2.vendido=true and h2.precio_final is not null
           and eh2.nombre='Karcal'
           and h2.anio = (
             select h.anio from vehiculos h
             join remates rh on rh.id = h.remate_id
             join empresas_remate eh on eh.id = rh.empresa_id
             where h.marca=v.marca and h.modelo=v.modelo
               and h.vendido=true and h.precio_final is not null
               and eh.nombre='Karcal'
             order by abs(h.anio - coalesce(v.anio, 2020))
             limit 1
           )
        )
      ) * 0.8
    )::bigint
    when pm.precio_mercado is not null and v.precio_base is not null
    then round(v.precio_base * 0.8)::bigint
    else null
  end as precio_sugerido_compra,

  -- Margen estimado (solo con exacto o ±1 año)
  case
    when pm.precio_mercado is not null and
      coalesce(
        (select round(avg(h.precio_final))::bigint from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo and h.anio=v.anio
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal'),
        (select round(avg(h.precio_final))::bigint from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo
           and h.anio between coalesce(v.anio,0)-1 and coalesce(v.anio,9999)+1
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal')
      ) > 0
    then round(
      (pm.precio_mercado::numeric - coalesce(
        (select avg(h.precio_final) from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo and h.anio=v.anio
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal'),
        (select avg(h.precio_final) from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo
           and h.anio between coalesce(v.anio,0)-1 and coalesce(v.anio,9999)+1
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal')
      )) / coalesce(
        (select avg(h.precio_final) from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo and h.anio=v.anio
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal'),
        (select avg(h.precio_final) from vehiculos h
         join remates rh on rh.id = h.remate_id
         join empresas_remate eh on eh.id = rh.empresa_id
         where h.marca=v.marca and h.modelo=v.modelo
           and h.anio between coalesce(v.anio,0)-1 and coalesce(v.anio,9999)+1
           and h.vendido=true and h.precio_final is not null
           and eh.nombre='Karcal')
      ) * 100, 1)
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
left join lateral (
  select precio_mercado, precio_min, precio_max, cantidad_publicaciones
  from   precios_mercado
  where  vehiculo_id = v.id
    and  fuente = 'chileautos'
  order  by fecha_consulta desc
  limit  1
) pm on true;

grant select on analisis_vehiculos to anon;
