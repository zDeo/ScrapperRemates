export interface VehiculoAnalisis {
  id: string
  marca: string
  modelo: string
  anio: number | null
  patente: string | null
  kilometraje: number | null
  mandante: string | null
  combustible: string | null
  traccion: string | null
  transmision: string | null
  precio_base: number | null
  precio_final: number | null
  estado_vehiculo: string | null
  imagen_url: string | null
  url_detalle: string | null
  url_cav: string | null
  url_inspeccion: string | null
  vendido: boolean
  empresa: string
  fecha_remate: string | null
  estado_remate: string
  precio_remate_promedio: number | null
  precio_mercado: number | null
  precio_mercado_min: number | null
  precio_mercado_max: number | null
  precio_mercado_cantidad: number | null
  margen_estimado_clp: number | null
  margen_porcentaje: number | null
  precio_sugerido_compra: number | null
  hist_exacto_precio: number | null
  hist_exacto_cantidad: number | null
  hist_rango_precio: number | null
  hist_rango_cantidad: number | null
  hist_ref_anio: number | null
  hist_ref_precio: number | null
  hist_ref_transmision: string | null
  hist_ref_combustible: string | null
  hist_ref_traccion: string | null
}

export interface Filtros {
  empresa: string
  marca: string
  modelo: string
  anioMin: number | null
  anioMax: number | null
  promedioMin: number | null
  promedioMax: number | null
}
