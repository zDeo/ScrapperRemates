export interface VehiculoAnalisis {
  id: string
  lote_id: string | null
  marca: string
  modelo: string
  anio: number | null
  precio_base: number | null
  precio_final: number | null
  estado_vehiculo: string | null
  imagen_url: string | null
  url_detalle: string | null
  vendido: boolean
  created_at: string
  empresa: string
  fecha_remate: string | null
  estado_remate: string
  precio_remate_promedio: number | null
  precio_mercado: number | null
  margen_estimado_clp: number | null
  margen_porcentaje: number | null
  precio_sugerido_compra: number | null
}

export interface Filtros {
  empresa: string
  marca: string
  modelo: string
  anioMin: number | null
  anioMax: number | null
  soloConMargen: boolean
}
