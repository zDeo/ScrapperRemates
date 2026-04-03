import { chromium, Browser, Page } from 'playwright'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE      = 'https://www.chileautos.cl'
const DELAY_MS  = 2_500
const KM_RANGO  = 50_000
const ANIO_RANGO = 2
const MAX_FICHAS = 10   // máximo de fichas individuales a visitar por vehículo

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function mapTransmision(t: string | null | undefined): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower.includes('manual')) return 'Manual'
  if (lower.includes('auto'))   return 'Automático'
  return null
}

// ─── Paso 1: Búsqueda web → URL de listado Chileautos ────────────────────────

/**
 * Extrae la primera URL de chileautos.cl/vehiculos/ (no detalle) desde un HTML.
 * Funciona con Google, DuckDuckGo y cualquier página con links en texto.
 */
function extraerUrlChileautos(html: string): string | null {
  // Patrón 1: URL completa en href o texto (Google redirect /url?q=... o link directo)
  for (const m of html.matchAll(/(?:q=|href=["'])(https?:\/\/(?:www\.)?chileautos\.cl\/vehiculos\/[^"'&\s<>]+)/g)) {
    const url = decodeURIComponent(m[1])
    if (!url.includes('/detalles/')) return url.split('?')[0]
  }
  // Patrón 2: URL relativa
  for (const m of html.matchAll(/href=["'](\/vehiculos\/autos-veh[^"'?]+)/g)) {
    return `https://www.chileautos.cl${m[1]}`
  }
  return null
}

async function buscarUrlViaWeb(browser: Browser, marca: string, modelo: string): Promise<string | null> {
  const query = `${modelo} ${marca} chileautos`

  // Intentar DuckDuckGo primero (más amigable con bots)
  const engines = [
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=web`,
    `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=es`,
  ]

  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({ 'User-Agent': USER_AGENT, 'Accept-Language': 'es-CL,es;q=0.9' })

    for (const searchUrl of engines) {
      const motor = searchUrl.includes('duckduckgo') ? 'DDG' : 'Google'
      console.log(`  [${motor}] "${query}"`)
      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        await sleep(3_000)
        const html  = await page.content()
        const found = extraerUrlChileautos(html)
        if (found) {
          console.log(`  [${motor}] → ${found}`)
          return found
        }
        console.log(`  [${motor}] → sin resultados, probando siguiente motor...`)
      } catch (err) {
        console.error(`  [${motor}] Error: ${(err as Error).message}`)
      }
    }
    return null
  } finally {
    await page.close()
  }
}

// ─── Paso 2: Desde el listado, extraer links de fichas individuales ────────────

async function extraerLinksPublicaciones(page: Page, listadoUrl: string): Promise<string[]> {
  try {
    await page.goto(listadoUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await sleep(8_000)  // Esperar carga JS completa

    const html  = await page.content()
    const links = new Set<string>()

    // Regex sobre el HTML completo — más robusto que selectores CSS
    // Patrón 1: URL completa en href o texto
    for (const m of html.matchAll(/["'](https?:\/\/(?:www\.)?chileautos\.cl\/vehiculos\/detalles\/[^"'?#]+)/g)) {
      links.add(m[1])
    }
    // Patrón 2: URL relativa
    for (const m of html.matchAll(/["'](\/vehiculos\/detalles\/[^"'?#]+)/g)) {
      links.add(`https://www.chileautos.cl${m[1]}`)
    }

    console.log(`  [Listado] ${links.size} publicaciones encontradas en: ${listadoUrl}`)
    return [...links].slice(0, MAX_FICHAS)
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

// ─── Fallbacks de URL si Google no encuentra nada ────────────────────────────

function slugify(s: string) { return s.toLowerCase().replace(/\s+/g, '-') }

function buildUrlRuta(marca: string, modelo: string): string {
  return `${BASE}/vehiculos/autos-veh%C3%ADculo/${slugify(marca)}/${slugify(modelo.split(' ')[0])}/`
}

function buildUrlRutaMarca(marca: string): string {
  return `${BASE}/vehiculos/autos-veh%C3%ADculo/${slugify(marca)}/`
}

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

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page    = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'User-Agent': USER_AGENT, 'Accept-Language': 'es-CL,es;q=0.9' })

  try {
    for (const v of vehiculos as any[]) {
      console.log(`\n[Chileautos] ${v.marca} ${v.modelo} ${v.anio}`)

      // ── 1. Google → URL de listado ─────────────────────────────────────────
      let listadoUrl = await buscarUrlViaWeb(browser, v.marca, v.modelo)

      // Si Google da una ficha individual, subir un nivel al listado
      if (listadoUrl?.includes('/detalles/')) {
        listadoUrl = listadoUrl.split('/detalles/')[0] + '/'
        console.log(`  [URL] Subida a listado: ${listadoUrl}`)
      }

      // Fallbacks si Google no encuentra nada
      if (!listadoUrl) {
        listadoUrl = buildUrlRuta(v.marca, v.modelo)
        console.log(`  [Fallback] ${listadoUrl}`)
      }

      // Si hay año, agregar filtro de año al listado
      const listadoUrlConAnio = v.anio ? agregarFiltroAnio(listadoUrl, v.anio) : listadoUrl

      await sleep(DELAY_MS)

      // ── 2. Ir al listado → extraer links de fichas ─────────────────────────
      let fichaLinks = await extraerLinksPublicaciones(page, listadoUrlConAnio)

      // Si no hay fichas con filtro año, probar sin filtro
      if (fichaLinks.length === 0 && listadoUrlConAnio !== listadoUrl) {
        console.log(`  [Listado] Sin resultados con año, probando sin filtro...`)
        await sleep(DELAY_MS)
        fichaLinks = await extraerLinksPublicaciones(page, listadoUrl)
      }

      // Último recurso: solo marca
      if (fichaLinks.length === 0) {
        const urlMarca = buildUrlRutaMarca(v.marca)
        console.log(`  [Fallback marca] ${urlMarca}`)
        await sleep(DELAY_MS)
        fichaLinks = await extraerLinksPublicaciones(page, urlMarca)
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
    await browser.close()
  }

  console.log('\n[Chileautos] Completado.')
}
