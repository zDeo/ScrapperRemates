import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE = 'https://www.chileautos.cl'
const KM_RANGO = 15_000   // ±15.000 km de tolerancia
const DELAY_MS = 3_000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Mapea transmisión de la BD al formato de Chileautos */
function mapTransmision(t: string | null | undefined): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower.includes('manual'))  return 'Manual'
  if (lower.includes('auto'))    return 'Automático'
  return null
}

/**
 * Construye la URL de búsqueda de Chileautos con filtros de
 * marca, modelo, año ±1, km ±15k y transmisión.
 */
function buildUrl(
  marca:      string,
  modelo:     string,
  anio:       number,
  km:         number | null,
  transmision: string | null,
): string {
  const anioMin = anio - 1
  const anioMax = anio + 1

  // Primer token del modelo (ej: "SAIL 4P" → "Sail")
  const modeloNorm = modelo.split(' ')[0]
    .charAt(0).toUpperCase() + modelo.split(' ')[0].slice(1).toLowerCase()
  const marcaNorm  = marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase()

  const parts: string[] = [
    `(C.Marca.${marcaNorm}._.Modelo.${modeloNorm}.)`,
    `Tipo.Usado`,
    `Ano.range(${anioMin}..${anioMax}).`,
  ]

  const trans = mapTransmision(transmision)
  if (trans) parts.push(`Transmisión.${trans}.`)

  if (km != null && km > 0) {
    const kmMin = Math.max(0, km - KM_RANGO)
    const kmMax = km + KM_RANGO
    parts.push(`Kilometraje.range(${kmMin}..${kmMax}).`)
  }

  const q = encodeURIComponent(`(And.${parts.join('_.')}.)`)
  return `${BASE}/vehiculos/?q=${q}&variant=merlin`
}

interface PrecioRango {
  min:    number
  max:    number
  mediana: number
  cantidad: number
}

/** Extrae todos los precios de una página de Chileautos usando fetch + cheerio */
async function extraerPrecios(url: string): Promise<PrecioRango | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
        'Accept-Language': 'es-CL,es;q=0.9',
      },
      redirect: 'follow',
    })

    if (!res.ok) {
      console.warn(`[Chileautos] HTTP ${res.status} para ${url}`)
      return null
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    const nums: number[] = []

    // Chileautos renderiza precios en elementos con data-price o en texto "$X.XXX.XXX"
    const SELECTORES = [
      '[data-price]',
      '[class*="price"]',
      '[class*="Price"]',
      '[class*="precio"]',
      '.listing-item__price',
      '.price',
      'span[class*="price"]',
    ]

    for (const sel of SELECTORES) {
      $(sel).each((_, el) => {
        // data-price attr (numérico directo)
        const attrVal = $(el).attr('data-price')
        if (attrVal) {
          const n = parseInt(attrVal.replace(/\D/g, ''))
          if (n >= 1_000_000 && n <= 500_000_000) { nums.push(n); return }
        }
        // texto "$X.XXX.XXX"
        const txt = $(el).text().trim()
        const match = txt.match(/\$[\s]?([\d.,]+)/)
        if (match) {
          const n = parseInt(match[1].replace(/[.,]/g, ''))
          if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
        }
      })
      if (nums.length >= 3) break
    }

    // Fallback: buscar cualquier patrón de precio en el HTML completo
    if (nums.length === 0) {
      const matches = html.matchAll(/\$\s*([\d]{1,3}(?:[.,][\d]{3})+)/g)
      for (const m of matches) {
        const n = parseInt(m[1].replace(/[.,]/g, ''))
        if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
      }
    }

    if (nums.length === 0) return null

    // Deduplicar y ordenar
    const unicos = [...new Set(nums)].sort((a, b) => a - b)

    // Eliminar outliers extremos (fuera de 2 desviaciones estándar) si hay suficientes datos
    let filtrados = unicos
    if (unicos.length >= 5) {
      const media = unicos.reduce((s, n) => s + n, 0) / unicos.length
      const std   = Math.sqrt(unicos.reduce((s, n) => s + Math.pow(n - media, 2), 0) / unicos.length)
      filtrados   = unicos.filter(n => Math.abs(n - media) <= 2 * std)
    }

    if (filtrados.length === 0) filtrados = unicos

    const mediana = filtrados[Math.floor(filtrados.length / 2)]

    return {
      min:      filtrados[0],
      max:      filtrados[filtrados.length - 1],
      mediana,
      cantidad: filtrados.length,
    }
  } catch (err) {
    console.error('[Chileautos] Error fetch:', err)
    return null
  }
}

export async function scrapeChileautos(): Promise<void> {
  console.log('[Chileautos] Iniciando scraping de precios de mercado...')

  // Obtener vehículos próximos (estado proximo, fecha futura)
  const hoy = new Date().toISOString()
  const { data: vehiculos, error } = await supabase
    .from('vehiculos')
    .select(`
      id, marca, modelo, anio, kilometraje, transmision,
      remates!inner(estado, fecha_remate)
    `)
    .eq('remates.estado', 'proximo')
    .gte('remates.fecha_remate', hoy)
    .not('anio', 'is', null)

  if (error || !vehiculos) {
    console.error('[Chileautos] Error leyendo BD:', error?.message)
    return
  }

  console.log(`[Chileautos] ${vehiculos.length} vehículos próximos a consultar`)

  for (const v of vehiculos as any[]) {
    const url = buildUrl(v.marca, v.modelo, v.anio, v.kilometraje, v.transmision)
    console.log(`[Chileautos] Buscando ${v.marca} ${v.modelo} ${v.anio} (${v.kilometraje ?? '?'} km, ${v.transmision ?? 'sin trans.'})`)
    console.log(`  URL: ${url}`)

    const precios = await extraerPrecios(url)

    if (!precios) {
      console.log(`  → Sin resultados`)
      await sleep(DELAY_MS)
      continue
    }

    console.log(`  → $${precios.min.toLocaleString('es-CL')} — $${precios.max.toLocaleString('es-CL')} (${precios.cantidad} publ., mediana $${precios.mediana.toLocaleString('es-CL')})`)

    const input: PrecioMercadoInput = {
      vehiculo_id:    v.id,
      marca:          v.marca,
      modelo:         v.modelo,
      anio:           v.anio,
      precio_mercado: precios.mediana,
      precio_min:     precios.min,
      precio_max:     precios.max,
      fuente:         'chileautos',
    }

    const { error: uErr } = await supabase
      .from('precios_mercado')
      .upsert(input, { onConflict: 'vehiculo_id,fuente' })

    if (uErr) console.error('  → Error upsert:', uErr.message)

    await sleep(DELAY_MS)
  }

  console.log('[Chileautos] Completado.')
}
