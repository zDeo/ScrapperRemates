import { supabase } from './supabase-client.js'
import type { PrecioMercadoInput } from './types.js'

const BASE       = 'https://api.mercadolibre.com'
const SITE       = 'MLC'
const ANIO_RANGO = 2
const DELAY_MS   = 800
const MAX_ITEMS  = 30

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

interface MLItem {
  id:         string
  title:      string
  price:      number
  condition:  string
  permalink:  string
  attributes: Array<{ id: string; value_name: string | null }>
}

interface MLResponse {
  results: MLItem[]
  paging:  { total: number }
}

function attrVal(item: MLItem, id: string): string | null {
  return item.attributes.find(a => a.id === id)?.value_name ?? null
}

async function buscarEnML(marca: string, modelo: string, anio: number | null): Promise<MLItem[]> {
  // Construir query — solo tokens significativos del modelo
  const query = encodeURIComponent(`${marca} ${modelo.split(' ').slice(0, 2).join(' ')}`)

  const url = `${BASE}/sites/${SITE}/search?q=${query}&condition=used&limit=${MAX_ITEMS}`

  try {
    const res  = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as MLResponse

    let items = data.results ?? []

    // Filtrar por año si está disponible
    if (anio && items.length > 0) {
      const filtrados = items.filter(item => {
        const anioStr = attrVal(item, 'VEHICLE_YEAR')
        if (!anioStr) return true // si no tiene año, incluir igual
        const anioItem = parseInt(anioStr)
        return Math.abs(anioItem - anio) <= ANIO_RANGO
      })
      // Solo usar filtro si no deja vacío
      if (filtrados.length > 0) items = filtrados
    }

    return items
  } catch (err) {
    console.error(`  [ML] Error buscando "${marca} ${modelo}": ${(err as Error).message}`)
    return []
  }
}

function calcularEstadisticas(precios: number[]): {
  mediana: number; min: number; max: number; cantidad: number
} | null {
  if (precios.length === 0) return null
  const sorted = [...precios].sort((a, b) => a - b)

  // Eliminar outliers (2σ) si hay suficientes datos
  let filtrados = sorted
  if (sorted.length >= 5) {
    const media = sorted.reduce((s, n) => s + n, 0) / sorted.length
    const std   = Math.sqrt(sorted.reduce((s, n) => s + (n - media) ** 2, 0) / sorted.length)
    filtrados   = sorted.filter(n => Math.abs(n - media) <= 2 * std)
  }
  if (filtrados.length === 0) filtrados = sorted

  return {
    mediana:  filtrados[Math.floor(filtrados.length / 2)],
    min:      filtrados[0],
    max:      filtrados[filtrados.length - 1],
    cantidad: filtrados.length,
  }
}

export async function scrapeMercadoLibre(): Promise<void> {
  console.log('[MercadoLibre] Iniciando búsqueda de precios...')

  const hoy = new Date().toISOString()
  const { data: vehiculos, error } = await supabase
    .from('vehiculos')
    .select(`id, marca, modelo, anio, remates!inner(estado, fecha_remate)`)
    .eq('remates.estado', 'proximo')
    .gte('remates.fecha_remate', hoy)

  if (error || !vehiculos) {
    console.error('[MercadoLibre] Error leyendo BD:', error?.message)
    return
  }

  console.log(`[MercadoLibre] ${vehiculos.length} vehículos a consultar`)

  for (const v of vehiculos as any[]) {
    console.log(`\n[ML] ${v.marca} ${v.modelo} ${v.anio ?? ''}`)

    await sleep(DELAY_MS)
    const items = await buscarEnML(v.marca, v.modelo, v.anio)

    if (items.length === 0) {
      console.log('  → Sin resultados')
      continue
    }

    const precios = items.map(i => i.price).filter(p => p > 500_000 && p < 500_000_000)
    const stats   = calcularEstadisticas(precios)

    if (!stats) {
      console.log('  → Sin precios válidos')
      continue
    }

    // Log de muestra
    items.slice(0, 3).forEach(item => {
      const anioItem = attrVal(item, 'VEHICLE_YEAR') ?? '?'
      const kmItem   = attrVal(item, 'MILEAGE') ?? '?'
      console.log(`  ✓ ${item.title.slice(0, 50)} | $${item.price.toLocaleString('es-CL')} | ${anioItem} | ${kmItem} km`)
    })
    console.log(`  → Mediana $${stats.mediana.toLocaleString('es-CL')} | ${stats.cantidad} pub. | $${stats.min.toLocaleString('es-CL')} – $${stats.max.toLocaleString('es-CL')}`)

    const input: PrecioMercadoInput = {
      vehiculo_id:            v.id,
      marca:                  v.marca,
      modelo:                 v.modelo,
      anio:                   v.anio ?? 0,
      precio_mercado:         stats.mediana,
      precio_min:             stats.min,
      precio_max:             stats.max,
      cantidad_publicaciones: stats.cantidad,
      fuente:                 'mercadolibre',
    }

    const { error: uErr } = await supabase
      .from('precios_mercado')
      .upsert(input, { onConflict: 'vehiculo_id,fuente' })
    if (uErr) console.error('  → Error upsert:', uErr.message)
  }

  console.log('\n[MercadoLibre] Completado.')
}
