import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Page } from 'playwright'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

// Registrar stealth una sola vez
chromium.use(StealthPlugin())

const BASE      = 'https://www.chileautos.cl'
const DELAY_MS  = 2_500
const KM_RANGO  = 50_000
const ANIO_RANGO = 2
const MAX_FICHAS = 10   // máximo de fichas individuales a visitar por vehículo

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function mapTransmision(t: string | null | undefined): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower.includes('manual')) return 'Manual'
  if (lower.includes('auto'))   return 'Automático'
  return null
}

// ─── Paso 1: Construir URL de listado Chileautos desde marca/modelo ──────────

const STOPWORDS = new Set([
  '2WD','4WD','4X4','4X2','AT','MT','TDI','HDI','HB','DC','DCAB','CREW','CAB',
  'GLX','GLS','GLI','GLE','SXT','LTZ','LT','LS','RS','GT','GTS','STI','TRD',
  'AUT','MAN','AWD','RWD','FWD','SDN','SW','PLUS','PRO','MAX','SPORT','TURBO',
  'DIESEL','GASOLINA','AUTO','III','II','IV','V','VI','S','E','SE',
])

/**
 * Devuelve variantes de URL Chileautos a probar, de más específica a más amplia.
 * PORSCHE / MACAN GTS III 4X4 2.9 AUT →
 *   [0] .../porsche/macan/          (modelo base)
 *   [1] .../porsche/                (solo marca)
 */
function buildUrlsChileautos(marca: string, modelo: string): string[] {
  const tokens = modelo.split(' ').filter(t => t && !STOPWORDS.has(t.toUpperCase()) && !/^\d+[\.,]\d+$/.test(t))
  const base   = slugify(marca)
  const urls: string[] = []

  // Variante 1: marca + primer token real del modelo
  if (tokens.length > 0) {
    urls.push(`${BASE}/vehiculos/autos-veh%C3%ADculo/${base}/${slugify(tokens[0])}/`)
  }
  // Variante 2: marca + dos tokens
  if (tokens.length > 1) {
    urls.push(`${BASE}/vehiculos/autos-veh%C3%ADculo/${base}/${slugify(tokens[0])}-${slugify(tokens[1])}/`)
  }
  // Variante 3: solo marca
  urls.push(`${BASE}/vehiculos/autos-veh%C3%ADculo/${base}/`)

  return [...new Set(urls)]
}

// ─── Paso 2: Desde el listado, extraer links de fichas individuales ────────────

async function cerrarPopup(page: Page): Promise<void> {
  // Popup "Te invitamos a ser parte de nuestro cambio" → botón "Cerrar invitación"
  try {
    const selector = [
      'button:has-text("Cerrar invitación")',
      'button:has-text("Cerrar")',
      'button:has-text("cerrar")',
      '[class*="close"]',
      '[aria-label*="close"]',
      '[aria-label*="cerrar"]',
    ].join(', ')

    await page.waitForSelector(selector, { timeout: 5_000 })
    await page.click(selector, { timeout: 2_000 }).catch(() => {})
    console.log('  [Popup] cerrado')
    await sleep(800)
  } catch { /* sin popup */ }
}

async function extraerLinksPublicaciones(page: Page, listadoUrl: string, debug = false): Promise<string[]> {
  try {
    // networkidle espera a que el JS cargue los cards dinámicos
    await page.goto(listadoUrl, { waitUntil: 'networkidle', timeout: 45_000 })

    // Cerrar popup antes de que bloquee la carga de fichas
    await cerrarPopup(page)

    // Espera adicional por si el SPA necesita renderizar tras el popup
    await sleep(2_000)

    // Extraer links via DOM renderizado
    const links: string[] = await page.evaluate(() => {
      const urls = new Set<string>()
      document.querySelectorAll('a[href]').forEach(el => {
        const href = (el as HTMLAnchorElement).href ?? ''
        if (href.includes('/vehiculos/detalles/') || href.includes('/detalles/')) {
          urls.add(href.split('?')[0].split('#')[0])
        }
      })
      return [...urls]
    })

    // Fallback: regex sobre el HTML si el DOM no dio resultados
    if (links.length === 0) {
      const html = await page.content()
      for (const m of html.matchAll(/["']((?:https?:\/\/(?:www\.)?chileautos\.cl)?\/vehiculos\/detalles\/[^"'?#\s]+)/g)) {
        const url = m[1].startsWith('http') ? m[1] : `https://www.chileautos.cl${m[1]}`
        links.push(url)
      }
    }

    // Screenshot de diagnóstico cuando no se encuentran resultados
    if (links.length === 0 && debug) {
      const ts   = Date.now()
      const path = `/tmp/chileautos_debug_${ts}.png`
      await page.screenshot({ path, fullPage: false })
      console.log(`  [Debug] Screenshot guardado: ${path}`)
      // Imprimir primeros 500 chars del HTML para ver qué devolvió el server
      const html = await page.content()
      console.log(`  [Debug] HTML inicio: ${html.slice(0, 500)}`)
    }

    const unicos = [...new Set(links)].slice(0, MAX_FICHAS)
    console.log(`  [Listado] ${unicos.length} publicaciones encontradas en: ${listadoUrl}`)
    return unicos
  } catch (err) {
    console.error(`  [Listado] Error: ${(err as Error).message}`)
    return []
  }
}

// ─── Paso 3: Extraer precio desde una ficha individual ────────────────────────

async function extraerPrecioFicha(page: Page, url: string): Promise<number | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await Promise.race([
      page.waitForSelector('[data-default-price], [data-price]', { timeout: 6_000 }).catch(() => {}),
      sleep(6_000),
    ])

    const html = await page.content()

    // Patrón 1: data-default-price="16700000" (número)
    for (const m of html.matchAll(/data-default-price="(\d+)"/g)) {
      const n = parseInt(m[1])
      if (n >= 1_000_000 && n <= 500_000_000) return n
    }

    // Patrón 2: data-price="16700000"
    for (const m of html.matchAll(/data-price="(\d+)"/g)) {
      const n = parseInt(m[1])
      if (n >= 1_000_000 && n <= 500_000_000) return n
    }

    // Patrón 3: value="$16.700.000" o value="16700000" en elemento de precio
    for (const m of html.matchAll(/col[^"]*price[^>]+value="([^"]+)"/gi)) {
      const raw = m[1].replace(/[$.\s]/g, '').replace(',', '')
      const n = parseInt(raw)
      if (n >= 1_000_000 && n <= 500_000_000) return n
    }

    // Patrón 4: "$16.700.000" o "$16,700,000" en texto
    for (const m of html.matchAll(/\$\s*([\d]{1,3}(?:[.,][\d]{3})+)/g)) {
      const n = parseInt(m[1].replace(/[.,]/g, ''))
      if (n >= 1_000_000 && n <= 500_000_000) return n
    }

    // Patrón 5: "price":16700000 en JSON embebido
    for (const m of html.matchAll(/"price"\s*:\s*(\d{7,9})/g)) {
      const n = parseInt(m[1])
      if (n >= 1_000_000 && n <= 500_000_000) return n
    }

    return null
  } catch {
    return null
  }
}

// ─── Construir stats desde array de precios ───────────────────────────────────

interface PrecioRango { min: number; max: number; mediana: number; cantidad: number }

function calcularRango(precios: number[]): PrecioRango | null {
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
    min:      filtrados[0],
    max:      filtrados[filtrados.length - 1],
    mediana:  filtrados[Math.floor(filtrados.length / 2)],
    cantidad: filtrados.length,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string) { return s.toLowerCase().replace(/\s+/g, '-') }

function agregarFiltroAnio(baseUrl: string, anio: number): string {
  const url = baseUrl.split('?')[0].replace(/\/$/, '')
  const q   = `(And._.Ano.range(${anio - ANIO_RANGO}..${anio + ANIO_RANGO})._.)`
  return `${url}/?q=${encodeURIComponent(q)}&variant=merlin`
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

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1366,768',
    ],
  })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: { 'Accept-Language': 'es-CL,es;q=0.9' },
  })
  const page = await context.newPage()

  // Ocultar WebDriver flag adicional (doble capa con stealth)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  try {
    for (const v of vehiculos as any[]) {
      console.log(`\n[Chileautos] ${v.marca} ${v.modelo} ${v.anio}`)

      // ── 1. Construir URLs candidatas desde marca/modelo ────────────────────
      const candidatas = buildUrlsChileautos(v.marca, v.modelo)
      console.log(`  [URLs] Candidatas: ${candidatas.join(' | ')}`)

      // ── 2. Probar cada URL (con y sin filtro año) hasta obtener fichas ─────
      let fichaLinks: string[] = []

      for (const listadoUrl of candidatas) {
        // Primero intentar con filtro de año
        if (v.anio) {
          const urlConAnio = agregarFiltroAnio(listadoUrl, v.anio)
          await sleep(DELAY_MS)
          fichaLinks = await extraerLinksPublicaciones(page, urlConAnio, true)
          if (fichaLinks.length > 0) break
          console.log(`  [Listado] Sin resultados con año, probando sin filtro...`)
        }

        // Sin filtro de año
        await sleep(DELAY_MS)
        fichaLinks = await extraerLinksPublicaciones(page, listadoUrl, true)
        if (fichaLinks.length > 0) break
      }

      if (fichaLinks.length === 0) {
        console.log(`  → Sin publicaciones encontradas`)
        continue
      }

      // ── 3. Visitar cada ficha y extraer precio ─────────────────────────────
      const precios: number[] = []
      for (const fichaUrl of fichaLinks) {
        await sleep(DELAY_MS)
        const precio = await extraerPrecioFicha(page, fichaUrl)
        if (precio) {
          precios.push(precio)
          console.log(`  ✓ ${fichaUrl.split('/').slice(-3, -1).join('/')} → $${precio.toLocaleString('es-CL')}`)
        } else {
          console.log(`  ✗ ${fichaUrl.split('/').slice(-3, -1).join('/')} → sin precio`)
        }
      }

      const resultado = calcularRango(precios)
      if (!resultado) {
        console.log(`  → Sin precios extraídos`)
        continue
      }

      console.log(`  → $${resultado.min.toLocaleString('es-CL')} – $${resultado.max.toLocaleString('es-CL')} (${resultado.cantidad} pub., mediana $${resultado.mediana.toLocaleString('es-CL')})`)

      const input: PrecioMercadoInput = {
        vehiculo_id:            v.id,
        marca:                  v.marca,
        modelo:                 v.modelo,
        anio:                   v.anio,
        precio_mercado:         resultado.mediana,
        precio_min:             resultado.min,
        precio_max:             resultado.max,
        cantidad_publicaciones: resultado.cantidad,
        fuente:                 'chileautos',
      }

      const { error: uErr } = await supabase
        .from('precios_mercado')
        .upsert(input, { onConflict: 'vehiculo_id,fuente' })
      if (uErr) console.error('  → Error upsert:', uErr.message)
    }
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }

  console.log('\n[Chileautos] Completado.')
}
