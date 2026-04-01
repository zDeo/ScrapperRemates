import { chromium } from 'playwright'
import { VehiculoInput, RemateInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE_URL    = 'https://rematesreyco.cl'
const PLATAFORMA  = 'https://webrematereyco.plataformagroup.cl'

function parsePrecio(texto: string): number | null {
  const n = parseInt(texto.replace(/[$\s.,]/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function scrapeReyco(empresaId: string): Promise<void> {
  console.log('[Reyco] Iniciando...')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page    = await browser.newPage()

  try {
    // 1. Obtener fechas de remate desde la página principal
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 })
    await sleep(2000)

    const remateInfo = await page.evaluate(() => {
      const info: { fecha: string; url: string }[] = []
      document.querySelectorAll('a[href]').forEach(a => {
        const href  = (a as HTMLAnchorElement).href
        const texto = a.closest('section, article, div')?.textContent?.trim() ?? ''
        const fecha = texto.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)?.[0] ?? ''
        if (href.includes('plataformagroup') || href.toLowerCase().includes('remate')) {
          if (fecha) info.push({ fecha, url: href })
        }
      })
      return info
    })

    // 2. Ir al catálogo de la plataforma
    await page.goto(`${PLATAFORMA}/Catalogo`, { waitUntil: 'networkidle', timeout: 40000 })
    await sleep(3000)

    // Esperar tabla o cards
    await page.waitForSelector('table tr, .lote, .vehiculo, [class*="card"]', { timeout: 10000 })
      .catch(() => null)

    const vehiculosRaw = await page.evaluate(() => {
      const rows: Record<string, string>[] = []

      // Intento 1: tabla estructurada
      document.querySelectorAll('table tbody tr').forEach(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() ?? '')
        if (tds.length >= 2 && tds.some(t => t.length > 1)) {
          rows.push({ lote: tds[0], marca: tds[1], modelo: tds[2] ?? '', anio: tds[3] ?? '', precio: tds[4] ?? '' })
        }
      })

      // Intento 2: cards
      if (rows.length === 0) {
        document.querySelectorAll('[class*="lote"], [class*="vehiculo"], [class*="card"]').forEach(el => {
          const t = el.textContent?.trim() ?? ''
          if (t.length > 5) {
            const marcaM  = t.match(/TOYOTA|CHEVROLET|SUZUKI|HYUNDAI|NISSAN|FORD|VOLKSWAGEN|KIA|MAZDA|MITSUBISHI|PEUGEOT|RENAULT|HONDA|FIAT|RAM|JEEP|BMW|MERCEDES|AUDI|SUBARU|CITROËN|VOLVO/i)
            const anioM   = t.match(/\b(19[89]\d|20[012]\d)\b/)
            const precioM = t.match(/\$[\d.,]+/)
            rows.push({
              lote:   '',
              marca:  marcaM?.[0] ?? '',
              modelo: '',
              anio:   anioM?.[0] ?? '',
              precio: precioM?.[0] ?? '',
            })
          }
        })
      }
      return rows
    })

    const vehiculosValidos = vehiculosRaw.filter(v => v.marca)
    if (vehiculosValidos.length === 0) {
      console.log('[Reyco] No se encontraron vehículos')
      return
    }

    // Upsert remate
    const fechaHoy   = remateInfo[0]?.fecha ?? ''
    const fechaISO   = parseFecha(fechaHoy) ?? new Date().toISOString()
    const remateInput: RemateInput = {
      empresa_id:        empresaId,
      remate_externo_id: `reyco-${fechaISO.slice(0, 10)}`,
      fecha_remate:      fechaISO,
      tipo:              'siniestrado',
      estado:            'proximo',
      url:               `${PLATAFORMA}/Catalogo`,
    }

    const { data: remateRow, error } = await supabase
      .from('remates')
      .upsert(remateInput, { onConflict: 'empresa_id,remate_externo_id' })
      .select('id')
      .single()

    if (error || !remateRow) { console.error('[Reyco] Error remate:', error?.message); return }

    const vehiculos: VehiculoInput[] = vehiculosValidos.map((v, i) => ({
      remate_id:       remateRow.id,
      lote_id:         v.lote || `reyco-${i}-${fechaISO.slice(0, 10)}`,
      marca:           v.marca.toUpperCase().trim(),
      modelo:          v.modelo.toUpperCase().trim() || 'SIN MODELO',
      anio:            parseInt(v.anio) || null,
      precio_base:     parsePrecio(v.precio),
      precio_final:    null,
      estado_vehiculo: 'siniestrado',
      imagen_url:      null,
      url_detalle:     null,
    }))

    const { error: vErr } = await supabase
      .from('vehiculos')
      .upsert(vehiculos, { onConflict: 'remate_id,lote_id' })
    if (vErr) console.error('[Reyco] Error vehiculos:', vErr.message)
    else console.log(`[Reyco] ✓ ${vehiculos.length} vehículos`)
  } finally {
    await browser.close()
  }
  console.log('[Reyco] Completado.')
}

function parseFecha(texto: string): string | null {
  const m = texto.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00-04:00`
}
