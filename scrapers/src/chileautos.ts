import { chromium } from 'playwright'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE    = 'https://www.chileautos.cl'
const DELAY_MS = 4_000
const KM_RANGO = 15_000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function mapTransmision(t: string | null | undefined): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower.includes('manual')) return 'Manual'
  if (lower.includes('auto'))   return 'Automático'
  return null
}

function buildUrl(
  marca:       string,
  modelo:      string,
  anio:        number,
  km:          number | null,
  transmision: string | null,
): string {
  const marcaNorm  = marca.charAt(0).toUpperCase()  + marca.slice(1).toLowerCase()
  const modeloBase = modelo.split(' ')[0]
  const modeloNorm = modeloBase.charAt(0).toUpperCase() + modeloBase.slice(1).toLowerCase()

  const filters: string[] = [
    `(C.Marca.${marcaNorm}._.Modelo.${modeloNorm}.)`,
    `Tipo.Usado`,
    `Ano.range(${anio - 1}..${anio + 1})`,
  ]

  const trans = mapTransmision(transmision)
  if (trans) filters.push(`Transmisión.${trans}`)

  if (km != null && km > 0) {
    const kmMin = Math.max(0, km - KM_RANGO)
    const kmMax = km + KM_RANGO
    filters.push(`Kilometraje.range(${kmMin}..${kmMax})`)
  }

  const q = encodeURIComponent(`(And.${filters.join('._.')}.`)
  return `${BASE}/vehiculos/?q=${q}&variant=merlin`
}

/** Fallback: solo marca+modelo+año±1, sin filtros de km ni transmisión */
function buildUrlFallback(marca: string, modelo: string, anio: number): string {
  const marcaNorm  = marca.charAt(0).toUpperCase()  + marca.slice(1).toLowerCase()
  const modeloBase = modelo.split(' ')[0]
  const modeloNorm = modeloBase.charAt(0).toUpperCase() + modeloBase.slice(1).toLowerCase()

  const filters = [
    `(C.Marca.${marcaNorm}._.Modelo.${modeloNorm}.)`,
    `Tipo.Usado`,
    `Ano.range(${anio - 1}..${anio + 1})`,
  ]

  const q = encodeURIComponent(`(And.${filters.join('._.')}.`)
  return `${BASE}/vehiculos/?q=${q}&variant=merlin`

}

/** Fallback 2: solo marca+modelo, sin año ni otros filtros */
function buildUrlFallbackSinAnio(marca: string, modelo: string): string {
  const marcaNorm  = marca.charAt(0).toUpperCase()  + marca.slice(1).toLowerCase()
  const modeloBase = modelo.split(' ')[0]
  const modeloNorm = modeloBase.charAt(0).toUpperCase() + modeloBase.slice(1).toLowerCase()

  const filters = [
    `(C.Marca.${marcaNorm}._.Modelo.${modeloNorm}.)`,
    `Tipo.Usado`,
  ]

  const q = encodeURIComponent(`(And.${filters.join('._.')}.`)
  return `${BASE}/vehiculos/?q=${q}&variant=merlin`
}

interface PrecioRango {
  min:      number
  max:      number
  mediana:  number
  cantidad: number
}

async function extraerPrecios(url: string): Promise<PrecioRango | null> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page    = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // Esperar a que carguen los listados
    await page.waitForTimeout(3_000)

    const nums: number[] = await page.evaluate(() => {
      const found: number[] = []

      // Selectores en orden de especificidad
      const SELECTORES = [
        '[data-price]',
        '[class*="price"]',
        '[class*="Price"]',
        '[class*="precio"]',
        '.listing-item__price',
      ]

      for (const sel of SELECTORES) {
        document.querySelectorAll(sel).forEach(el => {
          // atributo data-price numérico
          const attr = (el as HTMLElement).dataset?.price
          if (attr) {
            const n = parseInt(attr.replace(/\D/g, ''))
            if (n >= 1_000_000 && n <= 500_000_000) { found.push(n); return }
          }
          // texto con patrón $X.XXX.XXX
          const txt   = el.textContent?.trim() ?? ''
          const match = txt.match(/\$([\d.,]+)/)
          if (match) {
            const n = parseInt(match[1].replace(/[.,]/g, ''))
            if (n >= 1_000_000 && n <= 500_000_000) found.push(n)
          }
        })
        if (found.length >= 3) break
      }

      // Fallback: buscar en todo el texto visible
      if (found.length === 0) {
        const all = document.body.innerText
        const matches = all.matchAll(/\$\s*([\d]{1,3}(?:[.,][\d]{3})+)/g)
        for (const m of matches) {
          const n = parseInt(m[1].replace(/[.,]/g, ''))
          if (n >= 1_000_000 && n <= 500_000_000) found.push(n)
        }
      }

      return found
    })

    if (nums.length === 0) return null

    const unicos = [...new Set(nums)].sort((a, b) => a - b)

    // Eliminar outliers (2σ) si hay suficientes datos
    let filtrados = unicos
    if (unicos.length >= 5) {
      const media = unicos.reduce((s, n) => s + n, 0) / unicos.length
      const std   = Math.sqrt(unicos.reduce((s, n) => s + Math.pow(n - media, 2), 0) / unicos.length)
      filtrados   = unicos.filter(n => Math.abs(n - media) <= 2 * std)
    }
    if (filtrados.length === 0) filtrados = unicos

    return {
      min:      filtrados[0],
      max:      filtrados[filtrados.length - 1],
      mediana:  filtrados[Math.floor(filtrados.length / 2)],
      cantidad: filtrados.length,
    }
  } catch (err) {
    console.error('[Chileautos] Error playwright:', (err as Error).message)
    return null
  } finally {
    await browser.close()
  }
}

export async function scrapeChileautos(): Promise<void> {
  console.log('[Chileautos] Iniciando scraping de precios de mercado...')

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
    console.log(`[Chileautos] ${v.marca} ${v.modelo} ${v.anio} (${v.kilometraje ?? '?'} km, ${v.transmision ?? '-'})`)

    // Intento 1: filtros completos (año±1 + km±15k + transmisión)
    let url = buildUrl(v.marca, v.modelo, v.anio, v.kilometraje, v.transmision)
    console.log(`  URL 1: ${url}`)
    let precios = await extraerPrecios(url)

    // Intento 2: solo año±1 (sin km ni transmisión)
    if (!precios) {
      console.log(`  → Sin resultados, intentando sin km/transmisión...`)
      url = buildUrlFallback(v.marca, v.modelo, v.anio)
      console.log(`  URL 2: ${url}`)
      precios = await extraerPrecios(url)
      await sleep(DELAY_MS)
    }

    // Intento 3: solo marca+modelo sin año
    if (!precios) {
      console.log(`  → Sin resultados, intentando sin año...`)
      url = buildUrlFallbackSinAnio(v.marca, v.modelo)
      console.log(`  URL 3: ${url}`)
      precios = await extraerPrecios(url)
      await sleep(DELAY_MS)
    }

    if (!precios) {
      console.log(`  → Sin resultados en ningún intento`)
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
