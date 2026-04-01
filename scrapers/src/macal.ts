import { chromium } from 'playwright'
import { VehiculoInput, RemateInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE_URL = 'https://www.macal.cl'

const MARCAS_RE = /TOYOTA|CHEVROLET|SUZUKI|HYUNDAI|NISSAN|FORD|VOLKSWAGEN|KIA|MAZDA|MITSUBISHI|PEUGEOT|RENAULT|HONDA|FIAT|RAM|JEEP|BMW|MERCEDES|AUDI|SUBARU|CITROËN|VOLVO|LAND ROVER|LEXUS|PORSCHE|KIA/i

function parsePrecio(texto: string): number | null {
  const n = parseInt(texto.replace(/[$\s.,]/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

function parseFecha(texto: string): string | null {
  const m = texto.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00-04:00`
}

export async function scrapeMacal(empresaId: string): Promise<void> {
  console.log('[Macal] Iniciando...')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page    = await browser.newPage()

  // Interceptar llamadas API de la SPA
  const apiResponses: unknown[] = []
  page.on('response', async response => {
    const url         = response.url()
    const contentType = response.headers()['content-type'] ?? ''
    if (
      contentType.includes('application/json') &&
      (url.includes('/api') || url.includes('/vehiculo') || url.includes('/remate') || url.includes('/lote'))
    ) {
      try {
        const json = await response.json()
        apiResponses.push(json)
      } catch { /* ignorar */ }
    }
  })

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 40000 })
    await page.waitForTimeout(4000)

    // Intentar navegar a sección de remates dentro de la SPA
    const links = await page.$$eval('a, button, nav a', els =>
      els
        .map(e => ({
          texto: e.textContent?.toLowerCase().trim() ?? '',
          href:  (e as HTMLAnchorElement).href ?? '',
        }))
        .filter(e => /remat|catálog|catalogo|vehículo|vehiculo|lote/i.test(e.texto))
    )

    for (const link of links.slice(0, 3)) {
      if (link.href && link.href !== BASE_URL) {
        await page.goto(link.href, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(3000)
        break
      }
    }

    // Extraer datos del DOM renderizado
    const vehiculosDOM = await page.evaluate((marcasRe: string) => {
      const re = new RegExp(marcasRe, 'i')
      const items: Record<string, string>[] = []
      const SELECTORES = [
        '[class*="vehiculo"]', '[class*="vehicle"]', '[class*="lote"]',
        '[class*="card"]', '[class*="item"]', 'article',
      ]

      for (const sel of SELECTORES) {
        const els = document.querySelectorAll(sel)
        if (els.length < 2) continue

        els.forEach(el => {
          const texto    = el.textContent?.trim() ?? ''
          const marcaM   = texto.match(re)
          if (!marcaM || texto.length < 5) return
          const anioM    = texto.match(/\b(19[89]\d|20[012]\d)\b/)
          const precioM  = texto.match(/\$[\d.,]+|\d{3,}\.?\d{3}/)
          const fechaM   = texto.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)
          const img      = (el.querySelector('img') as HTMLImageElement)?.src ?? ''
          const href     = (el.querySelector('a') as HTMLAnchorElement)?.href ?? ''
          items.push({
            marca:  marcaM[0].toUpperCase(),
            anio:   anioM?.[0] ?? '',
            precio: precioM?.[0] ?? '',
            fecha:  fechaM?.[0] ?? '',
            img,
            href,
            texto:  texto.substring(0, 300),
          })
        })
        if (items.length > 0) break
      }
      return items
    }, MARCAS_RE.source)

    // Combinar DOM + API responses
    const vehiculosAPI: Record<string, string>[] = []
    for (const resp of apiResponses) {
      const arr = Array.isArray(resp) ? resp : (resp as any)?.data ?? (resp as any)?.vehiculos ?? []
      if (Array.isArray(arr)) {
        arr.forEach((item: any) => {
          if (item.marca || item.brand) {
            vehiculosAPI.push({
              marca:  String(item.marca || item.brand || '').toUpperCase(),
              modelo: String(item.modelo || item.model || '').toUpperCase(),
              anio:   String(item.anio || item.year || item.año || ''),
              precio: String(item.precio || item.price || item.precio_base || ''),
              img:    String(item.imagen || item.image || item.imagen_url || ''),
              href:   String(item.url || item.link || ''),
              texto:  '',
            })
          }
        })
      }
    }

    const todosVehiculos = vehiculosAPI.length > 0 ? vehiculosAPI : vehiculosDOM
    if (todosVehiculos.length === 0) {
      console.log('[Macal] No se encontraron vehículos')
      return
    }

    const fechaRef = todosVehiculos.find(v => v.fecha)?.fecha ?? ''
    const fechaISO = parseFecha(fechaRef) ?? new Date().toISOString()

    const remateInput: RemateInput = {
      empresa_id:        empresaId,
      remate_externo_id: `macal-${fechaISO.slice(0, 10)}`,
      fecha_remate:      fechaISO,
      tipo:              'siniestrado',
      estado:            'proximo',
      url:               BASE_URL,
    }

    const { data: remateRow, error } = await supabase
      .from('remates')
      .upsert(remateInput, { onConflict: 'empresa_id,remate_externo_id' })
      .select('id')
      .single()

    if (error || !remateRow) { console.error('[Macal] Error remate:', error?.message); return }

    const vehiculos: VehiculoInput[] = todosVehiculos.map((v, i) => ({
      remate_id:       remateRow.id,
      lote_id:         `macal-${i}-${fechaISO.slice(0, 10)}`,
      marca:           v.marca || 'DESCONOCIDA',
      modelo:          v.modelo || extraerModelo(v.texto, v.marca),
      anio:            parseInt(v.anio) || null,
      precio_base:     parsePrecio(v.precio),
      precio_final:    null,
      estado_vehiculo: 'siniestrado',
      imagen_url:      v.img || null,
      url_detalle:     v.href || null,
    }))

    const { error: vErr } = await supabase
      .from('vehiculos')
      .upsert(vehiculos, { onConflict: 'remate_id,lote_id' })
    if (vErr) console.error('[Macal] Error vehiculos:', vErr.message)
    else console.log(`[Macal] ✓ ${vehiculos.length} vehículos`)
  } finally {
    await browser.close()
  }
  console.log('[Macal] Completado.')
}

function extraerModelo(texto: string, marca: string): string {
  if (!texto || !marca) return 'SIN MODELO'
  const re = new RegExp(marca + '\\s+([\\w\\s]{2,40})', 'i')
  const m  = texto.match(re)
  return m?.[1]?.trim().toUpperCase().substring(0, 50) ?? 'SIN MODELO'
}
