import { chromium } from 'playwright'
import { PrecioMercadoInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE = 'https://www.chileautos.cl'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Busca la mediana de precios en Chileautos para marca+modelo+año */
export async function buscarPrecioMercado(
  marca: string,
  modelo: string,
  anio: number,
): Promise<number | null> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page    = await browser.newPage()

  try {
    // Chileautos tiene búsqueda por URL
    const query = encodeURIComponent(`${marca} ${modelo.split(' ')[0]}`)
    const url   = `${BASE}/autos/?q=${query}&year-from=${anio}&year-to=${anio}`

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await sleep(2000)

    const precios = await page.evaluate(() => {
      const nums: number[] = []
      const SELECTORES = [
        '[data-testid*="price"]',
        '[class*="price"]',
        '[class*="precio"]',
        '.listing-item__price',
        '.price',
      ]
      for (const sel of SELECTORES) {
        document.querySelectorAll(sel).forEach(el => {
          const txt   = el.textContent?.trim() ?? ''
          const match = txt.match(/[\d.,]{3,}/)
          if (match) {
            const n = parseInt(match[0].replace(/[.,]/g, ''))
            // Filtrar: precios razonables entre 500K y 500M CLP
            if (n >= 500_000 && n <= 500_000_000) nums.push(n)
          }
        })
        if (nums.length > 0) break
      }
      return nums
    })

    if (precios.length === 0) return null

    // Mediana para evitar outliers
    precios.sort((a, b) => a - b)
    return precios[Math.floor(precios.length / 2)]
  } catch (err) {
    console.error(`[Chileautos] Error buscando ${marca} ${modelo} ${anio}:`, err)
    return null
  } finally {
    await browser.close()
  }
}

export async function scrapeChileautos(): Promise<void> {
  console.log('[Chileautos] Iniciando scraping de precios de mercado...')

  // Obtener combinaciones únicas en la BD
  const { data: combis, error } = await supabase
    .from('vehiculos')
    .select('marca, modelo, anio')
    .not('anio', 'is', null)

  if (error || !combis) { console.error('[Chileautos] Error leyendo BD:', error?.message); return }

  // Deduplicar
  const mapa = new Map<string, { marca: string; modelo: string; anio: number }>()
  combis.forEach(v => {
    if (!v.anio) return
    const key = `${v.marca}|${v.modelo}|${v.anio}`
    if (!mapa.has(key)) mapa.set(key, { marca: v.marca, modelo: v.modelo, anio: v.anio })
  })

  const unicos = [...mapa.values()]
  console.log(`[Chileautos] ${unicos.length} combinaciones únicas a buscar`)

  for (const v of unicos) {
    const precio = await buscarPrecioMercado(v.marca, v.modelo, v.anio)

    if (!precio) {
      console.log(`[Chileautos] Sin precio: ${v.marca} ${v.modelo} ${v.anio}`)
      await sleep(2000)
      continue
    }

    const input: PrecioMercadoInput = {
      marca:          v.marca,
      modelo:         v.modelo,
      anio:           v.anio,
      precio_mercado: precio,
      fuente:         'chileautos',
    }

    const { error: uErr } = await supabase
      .from('precios_mercado')
      .upsert(input, { onConflict: 'marca,modelo,anio,fuente' })

    if (uErr) console.error('[Chileautos] Error upsert:', uErr.message)
    else console.log(`[Chileautos] ✓ ${v.marca} ${v.modelo} ${v.anio} → $${precio.toLocaleString('es-CL')}`)

    await sleep(2500) // Respetar el servidor
  }

  console.log('[Chileautos] Completado.')
}
