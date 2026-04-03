export interface EmpresaRemate {
  id: string
  nombre: string
  url: string
  activa: boolean
}

export interface RemateInput {
  empresa_id: string
  remate_externo_id: string
  fecha_remate: string | null
  tipo: string
  estado: 'proximo' | 'activo' | 'cerrado'
  url: string
}

export interface VehiculoInput {
  remate_id: string
  lote_id: string
  marca: string
  modelo: string
  anio: number | null
  precio_base: number | null
  precio_final: number | null
  estado_vehiculo: string | null
  imagen_url: string | null
  url_detalle: string | null
  patente?: string | null
  kilometraje?: number | null
  mandante?: string | null
  combustible?: string | null
  traccion?: string | null
  transmision?: string | null
  url_cav?: string | null
  url_inspeccion?: string | null
  vendido?: boolean
}

export interface PrecioMercadoInput {
  vehiculo_id: string
  marca: string
  modelo: string
  anio: number
  precio_mercado: number
  precio_min: number
  precio_max: number
  cantidad_publicaciones: number
  fuente: string
}
