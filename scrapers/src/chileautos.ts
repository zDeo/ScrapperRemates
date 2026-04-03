import { chromium, Browser, Page } from 'playwright'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE     = 'https://www.chileautos.cl'
const DELAY_MS = 3_000
const KM_RANGO = 50_000
const ANIO_RANGO = 2

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function mapTransmision(t: string | null | undefined): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower.includes('manual')) return 'Manual'
  if (lower.includes('auto'))   return 'Automático'
  return null
}

// ─── Paso 1: Google → URL de Chileautos ───────────────────────────────────────

/**
 * Busca en Google "[modelo] [marca] chileautos" y devuelve el primer link
 * de Chileautos /vehiculos/ que aparezca en los resultados.
 */
async function buscarUrlViaGoogle(
  browser: Browser,
  marca: string,
  modelo: string,
): Promise<string | null> {
  const query = `${modelo} ${marca} chileautos`
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=es`
  console.log(`  [Google] "${query}"`)

  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({ 'User-Agent': USER_AGENT, 'Accept-Language': 'es-CL,es;q=0.9' })
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await sleep(2_000)

    // Google envuelve URLs en href="/url?q=URL&..." o directamente
    const found = await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('a[href]'))) {
        const href = el.getAttribute('href') ?? ''

        // Patrón 1: /url?q=https://www.chileautos.cl/vehiculos/...
        const m1 = href.match(/[?&]q=(https?:\/\/www\.chileautos\.cl\/vehiculos\/[^&]+)/)
        if (m1) return decodeURIComponent(m1[1])

        // Patrón 2: link directo a chileautos
        if (href.startsWith('https://www.chileautos.cl/vehiculos/')) return href
      }
      return null
    })

    if (found) {
      console.log(`  [Google] → ${found}`)
    } else {
      console.log(`  [Google] → sin resultados de Chileautos`)
    }
    return found
  } catch (err) {
    console.error(`  [Google] Error: ${(err as Error).message}`)
    return null
  } finally {
    await page.close()
  }
}

// ─── Paso 2: Navegar Chileautos y extraer precios ─────────────────────────────

interface PrecioRango {
  min:      number
  max:      number
  mediana:  number
  cantidad: number
}

async function extraerPrecios(page: Page, url: string): Promise<PrecioRango | null> {
  console.log(`  [Chileautos] GET ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    await Promise.race([
      page.waitForSelector('[data-price], [class*="price"], [class*="Price"]', { timeout: 6_000 }).catch(() => {}),
      sleep(6_000),
    ])

    const html = await page.content()
    const nums: number[] = []

    for (const m of html.matchAll(/data-price="(\d+)"/g)) {
      const n = parseInt(m[1])
      if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
    }

    if (nums.length === 0) {
      for (const m of html.matchAll(/\$\s*([\d]{1,3}(?:[.,][\d]{3})+)/g)) {
        const n = parseInt(m[1].replace(/[.,]/g, ''))
        if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
      }
    }

    if (nums.length === 0) {
      for (const m of html.matchAll(/"price"\s*:\s*(\d{7,9})/g)) {
        const n = parseInt(m[1])
        if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
      }
    }

    console.log(`  → ${nums.length} precios encontrados`)
    if (nums.length === 0) return null

    const unicos = [...new Set(nums)].sort((a, b) => a - b)
    let filtrados = unicos
    if (unicos.length >= 5) {
      const media = unicos.reduce((s, n) => s + n, 0) / unicos.length
      const std   = Math.sqrt(unicos.reduce((s, n) => s + (n - media) ** 2, 0) / unicos.length)
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
    console.error(`  [Chileautos] Error: ${(err as Error).message}`)
    return null
  }
}

/**
 * Dado un URL base de Chileautos (obtenido de Google), intenta añadir filtros
 * de año, km y transmisión para afinar los resultados.
 *
 * Chileautos acepta parámetros ?q=(...) en URLs de categoría.
 */
function agregarFiltros(
  baseUrl: string,
  anio: number,
  km: number | null,
  transmision: string | null,
): string {
  // Limpiar params existentes
  const url = baseUrl.split('?')[0].replace(/\/$/, '')

  const partes: string[] = [
    `Ano.range(${anio - ANIO_RANGO}..${anio + ANIO_RANGO})`,
  ]
  const trans = mapTransmision(transmision)
  if (trans)              partes.push(`Transmisión.${trans}`)
  if (km != null && km > 0) partes.push(`Kilometraje.range(${Math.max(0, km - KM_RANGO)}..${km + KM_RANGO})`)

  const q = `(And._.${partes.join('._.') }._.)`
  return `${url}/?q=${encodeURIComponent(q)}&variant=merlin`
}

function agregarFiltroAnio(baseUrl: string, anio: number): string {
  const url = baseUrl.split('?')[0].replace(/\/$/, '')
  const q = `(And._.Ano.range(${anio - ANIO_RANGO}..${anio + ANIO_RANGO})._.)`
  return `${url}/?q=${encodeURIComponent(q)}&variant=merlin`
}

// ─── Fallbacks clásicos (si Google no encuentra nada) ─────────────────────────

function slugify(s: string) { return s.toLowerCase().replace(/\s+/g, '-') }

function buildUrlRuta(marca: string, modelo: string): string {
  const base = modelo.split(' ')[0]
  return `${BASE}/vehiculos/autos-veh%C3%ADculo/${slugify(marca)}/${slugify(base)}/`
}

function buildUrlRutaMarca(marca: string): string {
  return `${BASE}/vehiculos/autos-veh%C3%ADculo/${slugify(marca)}/`
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function scrapeChileautos(): Promise<void> {
  console.log('[Chileautos] Iniciando scraping de precios de mercado...')

  const hoy = new Date().toISOString()
  const { data: vehiculos, error } = await supabase
    .from('vehiculos')
    .select(`id, marca, modelo, anio, kilometraje, transmision, remates!inner(estado, fecha_remate)`)
    .eq('remates.estado', 'proximo')
    .gte('remates.fecha_remate', hoy)
    .not('anio', 'is', null)

  if (error || !vehiculos) {
    console.error('[Chileautos] Error leyendo BD:', error?.message)
    return
  }

  console.log(`[Chileautos] ${vehiculos.length} vehículos próximos a consultar`)

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

  try {
    for (const v of vehiculos as any[]) {
      console.log(`\n[Chileautos] ${v.marca} ${v.modelo} ${v.anio} (${v.kilometraje ?? '?'} km, ${v.transmision ?? '-'})`)

      let precios: PrecioRango | null = null
      const page = await browser.newPage()
      await page.setExtraHTTPHeaders({ 'User-Agent': USER_AGENT, 'Accept-Language': 'es-CL,es;q=0.9' })

      try {
        // ── Paso 1: Google → URL base de Chileautos ──────────────────────────
        const baseUrl = await buscarUrlViaGoogle(browser, v.marca, v.modelo)

        if (baseUrl) {
          await sleep(DELAY_MS)

          // ── Paso 2a: URL + año + km + transmisión ─────────────────────────
          if (v.anio) {
            const urlFiltros = agregarFiltros(baseUrl, v.anio, v.kilometraje, v.transmision)
            precios = await extraerPrecios(page, urlFiltros)
            await sleep(DELAY_MS)
          }

          // ── Paso 2b: URL + solo año ───────────────────────────────────────
          if (!precios && v.anio) {
            const urlAnio = agregarFiltroAnio(baseUrl, v.anio)
            precios = await extraerPrecios(page, urlAnio)
            await sleep(DELAY_MS)
          }

          // ── Paso 2c: URL base sin filtros ─────────────────────────────────
          if (!precios) {
            precios = await extraerPrecios(page, baseUrl)
            await sleep(DELAY_MS)
          }
        }

        // ── Paso 3: Fallback ruta /marca/modelo/ ──────────────────────────────
        if (!precios) {
          const urlRuta = buildUrlRuta(v.marca, v.modelo)
          console.log(`  [Fallback-ruta] ${urlRuta}`)
          precios = await extraerPrecios(page, urlRuta)
          await sleep(DELAY_MS)
        }

        // ── Paso 4: Fallback solo marca ───────────────────────────────────────
        if (!precios) {
          const urlMarca = buildUrlRutaMarca(v.marca)
          console.log(`  [Fallback-marca] ${urlMarca}`)
          precios = await extraerPrecios(page, urlMarca)
          await sleep(DELAY_MS)
        }

      } finally {
        await page.close()
      }

      if (!precios) {
        console.log(`  → Sin resultados en ningún intento`)
        continue
      }

      console.log(`  → $${precios.min.toLocaleString('es-CL')} — $${precios.max.toLocaleString('es-CL')} (${precios.cantidad} publ., mediana $${precios.mediana.toLocaleString('es-CL')})`)

      const input: PrecioMercadoInput = {
        vehiculo_id:            v.id,
        marca:                  v.marca,
        modelo:                 v.modelo,
        anio:                   v.anio,
        precio_mercado:         precios.mediana,
        precio_min:             precios.min,
        precio_max:             precios.max,
        cantidad_publicaciones: precios.cantidad,
        fuente:                 'chileautos',
      }

      const { error: uErr } = await supabase
        .from('precios_mercado')
        .upsert(input, { onConflict: 'vehiculo_id,fuente' })
      if (uErr) console.error('  → Error upsert:', uErr.message)
    }
  } finally {
    await browser.close()
  }

  console.log('\n[Chileautos] Completado.')
}
