import { chromium } from 'playwright'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE    = 'https://www.chileautos.cl'
const DELAY_MS = 4_000
const KM_RANGO = 50_000
const ANIO_RANGO = 2

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function mapTransmision(t: string | null | undefined): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower.includes('manual')) return 'Manual'
  if (lower.includes('auto'))   return 'Automático'
  return null
}

function normMarca(m: string)  { return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase() }
function normModelo(m: string) {
  const base = m.split(' ')[0]
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase()
}
function slugify(s: string) { return s.toLowerCase().replace(/\s+/g, '-') }

/**
 * Genera variantes del modelo para buscar en Chileautos.
 * Ej: "GRAND VITARA 2WD 1.5 AT" → ["Grand-Vitara", "Vitara", "Grand"]
 * Ej: "NEW RAIZE 1.2"           → ["New-Raize", "Raize"]
 * Ej: "HILUX DCAB TDI 4X4 2.8" → ["Hilux"]
 * Ej: "GOL HIGHLINE 1.6"        → ["Gol"]
 * Ej: "208 BLUE HDI HB 1.5"     → ["208"]
 */
function modeloVariantes(modelo: string): string[] {
  const tokens = modelo.split(' ').filter(Boolean)
  const variantes: string[] = []

  // Palabras que son parte del nombre del modelo (no versión/motor)
  const STOPWORDS = new Set([
    '2WD','4WD','4X4','4X2','AT','MT','TDI','HDI','HB','DC','DCAB','CREW','CAB',
    'GLX','GLS','GLI','GLE','SXT','LTZ','LT','LS','RS','GT','GTS','STI','TRD',
    'AUT','MAN','AWD','RWD','FWD','SDN','SW','PLUS','PRO','MAX','SPORT','TURBO',
    'DIESEL','GASOLINA','ELECTRICO','HIBRIDO','AUTO','AUTOMATICA','MANUAL',
  ])

  // Tokens que parecen números de motor (1.5, 2.0, 5.3, etc.)
  const esMotor = (t: string) => /^\d+[\.,]\d+$/.test(t)
  // Tokens que son solo números (208, 308, etc.) — pueden ser el modelo
  const esSoloNumero = (t: string) => /^\d+$/.test(t)

  // Filtrar tokens que son parte del nombre real del modelo
  const nombreTokens = tokens.filter(t =>
    !STOPWORDS.has(t.toUpperCase()) && !esMotor(t)
  )

  if (nombreTokens.length === 0) {
    variantes.push(slugify(tokens[0]))
    return variantes
  }

  // Variante 1: primeras 2 palabras del nombre (ej: "Grand-Vitara", "New-Raize")
  if (nombreTokens.length >= 2) {
    variantes.push(slugify(nombreTokens.slice(0, 2).join(' ')))
  }

  // Variante 2: primera palabra del nombre (ej: "Vitara" cuando viene de "Vitara 2WD")
  //             o segunda palabra si la primera es adjetivo común (Grand, New, Old)
  const PREFIJOS = new Set(['GRAND','NEW','OLD','GREAT','SUPER','ALL'])
  if (PREFIJOS.has(nombreTokens[0].toUpperCase()) && nombreTokens.length >= 2) {
    variantes.push(slugify(nombreTokens[1]))       // ej: "Vitara"
    variantes.push(slugify(nombreTokens[0]))       // ej: "Grand" (por si acaso)
  } else {
    variantes.push(slugify(nombreTokens[0]))       // ej: "Gol", "Hilux", "208"
  }

  // Eliminar duplicados manteniendo orden
  return [...new Set(variantes)]
}

/**
 * Formato correcto Chileautos:
 * (And.(C.Marca.X._.Modelo.Y.)_.Tipo.Usado._.Ano.range(A..B)._.Transmisión.Z._.Kilometraje.range(C..D).)
 */
function buildQuery(marca: string, modelo: string, parts: string[]): string {
  const mm = `(C.Marca.${normMarca(marca)}._.Modelo.${normModelo(modelo)}.)`
  const filters = parts.map(p => `_.${p}.`).join('')
  return `(And.${mm}${filters})`
}

// Intento 1: año±2 + km±50k + transmisión
function buildUrl(marca: string, modelo: string, anio: number, km: number | null, transmision: string | null): string {
  const parts = ['Tipo.Usado', `Ano.range(${anio - ANIO_RANGO}..${anio + ANIO_RANGO})`]
  const trans = mapTransmision(transmision)
  if (trans) parts.push(`Transmisión.${trans}`)
  if (km != null && km > 0) parts.push(`Kilometraje.range(${Math.max(0, km - KM_RANGO)}..${km + KM_RANGO})`)
  return `${BASE}/vehiculos/?q=${encodeURIComponent(buildQuery(marca, modelo, parts))}&variant=merlin`
}

// Intento 2: año±2 sin km ni transmisión
function buildUrlFallback(marca: string, modelo: string, anio: number): string {
  const parts = ['Tipo.Usado', `Ano.range(${anio - ANIO_RANGO}..${anio + ANIO_RANGO})`]
  return `${BASE}/vehiculos/?q=${encodeURIComponent(buildQuery(marca, modelo, parts))}&variant=merlin`
}

// Intento 3: año±5
function buildUrlFallbackAnioAmplio(marca: string, modelo: string, anio: number): string {
  const parts = ['Tipo.Usado', `Ano.range(${anio - 5}..${anio + 5})`]
  return `${BASE}/vehiculos/?q=${encodeURIComponent(buildQuery(marca, modelo, parts))}&variant=merlin`
}

// Intento 4: ruta correcta /vehiculos/autos-vehículo/marca/modelo/
function buildUrlRuta(marca: string, modelo: string): string {
  return `${BASE}/vehiculos/autos-veh%C3%ADculo/${slugify(marca)}/${slugify(modelo.split(' ')[0])}/`
}

// Intento 5: solo marca+modelo sin año (query)
function buildUrlFallbackSinAnio(marca: string, modelo: string): string {
  const parts = ['Tipo.Usado']
  return `${BASE}/vehiculos/?q=${encodeURIComponent(buildQuery(marca, modelo, parts))}&variant=merlin`
}

// Intento 6: ruta solo marca /vehiculos/autos-vehículo/marca/
function buildUrlRutaMarca(marca: string): string {
  return `${BASE}/vehiculos/autos-veh%C3%ADculo/${slugify(marca)}/`
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
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
      'Accept-Language': 'es-CL,es;q=0.9',
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Esperar a que aparezca algún precio o que pasen 6 segundos
    await Promise.race([
      page.waitForSelector('[data-price], [class*="price"], [class*="Price"]', { timeout: 6_000 }).catch(() => {}),
      sleep(6_000),
    ])

    // Volcar todo el HTML para analizar
    const html = await page.content()

    // Extraer precios directamente del HTML con regex
    const nums: number[] = []

    // Patrón 1: data-price="1234567"
    for (const m of html.matchAll(/data-price="(\d+)"/g)) {
      const n = parseInt(m[1])
      if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
    }

    // Patrón 2: "$X.XXX.XXX" o "$X,XXX,XXX" en el texto
    if (nums.length === 0) {
      for (const m of html.matchAll(/\$\s*([\d]{1,3}(?:[.,][\d]{3})+)/g)) {
        const n = parseInt(m[1].replace(/[.,]/g, ''))
        if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
      }
    }

    // Patrón 3: números grandes en JSON embebido (ej: "price":5990000)
    if (nums.length === 0) {
      for (const m of html.matchAll(/"price"\s*:\s*(\d{7,9})/g)) {
        const n = parseInt(m[1])
        if (n >= 1_000_000 && n <= 500_000_000) nums.push(n)
      }
    }

    console.log(`    → ${nums.length} precios encontrados en HTML`)
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

    const variantes = modeloVariantes(v.modelo)
    console.log(`  Variantes modelo: ${variantes.join(', ')}`)

    let precios: PrecioRango | null = null
    let url = ''

    // Para cada variante del modelo, probar con distintos niveles de filtros
    for (const variante of variantes) {
      if (precios) break

      // A: año±2 + km±50k + transmisión
      url = buildUrl(v.marca, variante, v.anio, v.kilometraje, v.transmision)
      console.log(`  [A:${variante}] año±2+km+trans: ${url}`)
      precios = await extraerPrecios(url)
      if (precios) break
      await sleep(DELAY_MS)

      // B: año±2 sin km/trans
      url = buildUrlFallback(v.marca, variante, v.anio)
      console.log(`  [B:${variante}] año±2: ${url}`)
      precios = await extraerPrecios(url)
      if (precios) break
      await sleep(DELAY_MS)

      // C: año±5
      url = buildUrlFallbackAnioAmplio(v.marca, variante, v.anio)
      console.log(`  [C:${variante}] año±5: ${url}`)
      precios = await extraerPrecios(url)
      if (precios) break
      await sleep(DELAY_MS)

      // D: ruta /vehiculos/autos-vehículo/marca/variante/
      url = buildUrlRuta(v.marca, variante)
      console.log(`  [D:${variante}] ruta: ${url}`)
      precios = await extraerPrecios(url)
      if (precios) break
      await sleep(DELAY_MS)

      // E: query sin año
      url = buildUrlFallbackSinAnio(v.marca, variante)
      console.log(`  [E:${variante}] sin año: ${url}`)
      precios = await extraerPrecios(url)
      if (precios) break
      await sleep(DELAY_MS)
    }

    // Último recurso: solo marca
    if (!precios) {
      url = buildUrlRutaMarca(v.marca)
      console.log(`  [F] ruta solo marca: ${url}`)
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

    await sleep(DELAY_MS)
  }

  console.log('[Chileautos] Completado.')
}
