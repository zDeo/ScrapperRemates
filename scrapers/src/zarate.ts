import { chromium } from 'playwright'
import { VehiculoInput, RemateInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE_URL = 'https://remateszarate.cl'

const MARCAS = [
  'TOYOTA','CHEVROLET','SUZUKI','HYUNDAI','NISSAN','FORD','VOLKSWAGEN','KIA',
  'MAZDA','MITSUBISHI','PEUGEOT','RENAULT','HONDA','FIAT','RAM','JEEP','BMW',
  'MERCEDES','AUDI','SUBARU','CITROËN','VOLVO','LAND ROVER','LEXUS','PORSCHE',
]
const MARCAS_RE = new RegExp(MARCAS.join('|'), 'i')

function parsePrecio(texto: string): number | null {
  const n = parseInt(texto.replace(/[$\s.,]/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

function parseFecha(texto: string): string | null {
  const m = texto.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00-04:00`
}

export async function scrapeZarate(empresaId: string): Promise<void> {
  console.log('[Zárate] Iniciando...')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page    = await browser.newPage()

  try {
    // Intentar la página de próximos remates
    await page.goto(`${BASE_URL}/proximos-remates/`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000)

    const datos = await page.evaluate((marcasRe: string) => {
      const re      = new RegExp(marcasRe, 'i')
      const reAnio  = /\b(19[89]\d|20[012]\d)\b/
      const rePrecio = /\$[\d.,]+/
      const items: Record<string, string>[] = []

      // Buscar en posts/cards de WordPress
      const contenedores = document.querySelectorAll(
        'article, .post, .entry, .remate-item, .vehiculo, [class*="remate"], [class*="auction"]'
      )
      contenedores.forEach(el => {
        const texto    = el.textContent?.trim() ?? ''
        const marcaM   = texto.match(re)
        const fechaM   = texto.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)
        const anioM    = texto.match(reAnio)
        const precioM  = texto.match(rePrecio)
        const enlace   = (el.querySelector('a') as HTMLAnchorElement)?.href ?? ''
        const img      = (el.querySelector('img') as HTMLImageElement)?.src ?? ''

        if (marcaM) {
          items.push({
            marca:  marcaM[0].toUpperCase(),
            fecha:  fechaM?.[0] ?? '',
            anio:   anioM?.[0] ?? '',
            precio: precioM?.[0] ?? '',
            href:   enlace,
            img,
            texto:  texto.substring(0, 300),
          })
        }
      })

      // Fallback: buscar en toda la página si no hay contenedores específicos
      if (items.length === 0) {
        const todosLosParrafos = document.querySelectorAll('p, h2, h3, li')
        todosLosParrafos.forEach(el => {
          const texto  = el.textContent?.trim() ?? ''
          const marcaM = texto.match(re)
          if (marcaM && texto.length > 10) {
            items.push({
              marca:  marcaM[0].toUpperCase(),
              fecha:  texto.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)?.[0] ?? '',
              anio:   texto.match(reAnio)?.[0] ?? '',
              precio: texto.match(rePrecio)?.[0] ?? '',
              href:   '',
              img:    '',
              texto:  texto.substring(0, 200),
            })
          }
        })
      }
      return items
    }, MARCAS_RE.source)

    if (datos.length === 0) {
      console.log('[Zárate] No se encontraron vehículos')
      return
    }

    const fechaRef   = datos.find(d => d.fecha)?.fecha ?? ''
    const fechaISO   = parseFecha(fechaRef) ?? new Date().toISOString()

    const remateInput: RemateInput = {
      empresa_id:        empresaId,
      remate_externo_id: `zarate-${fechaISO.slice(0, 10)}`,
      fecha_remate:      fechaISO,
      tipo:              'multiple',
      estado:            'proximo',
      url:               `${BASE_URL}/proximos-remates/`,
    }

    const { data: remateRow, error } = await supabase
      .from('remates')
      .upsert(remateInput, { onConflict: 'empresa_id,remate_externo_id' })
      .select('id')
      .single()

    if (error || !remateRow) { console.error('[Zárate] Error remate:', error?.message); return }

    const vehiculos: VehiculoInput[] = datos.map((d, i) => ({
      remate_id:       remateRow.id,
      lote_id:         `zarate-${i}-${fechaISO.slice(0, 10)}`,
      marca:           d.marca,
      modelo:          extraerModelo(d.texto, d.marca),
      anio:            parseInt(d.anio) || null,
      precio_base:     parsePrecio(d.precio),
      precio_final:    null,
      estado_vehiculo: 'siniestrado',
      imagen_url:      d.img || null,
      url_detalle:     d.href || null,
    }))

    const { error: vErr } = await supabase
      .from('vehiculos')
      .upsert(vehiculos, { onConflict: 'remate_id,lote_id' })
    if (vErr) console.error('[Zárate] Error vehiculos:', vErr.message)
    else console.log(`[Zárate] ✓ ${vehiculos.length} vehículos`)
  } finally {
    await browser.close()
  }
  console.log('[Zárate] Completado.')
}

function extraerModelo(texto: string, marca: string): string {
  const re  = new RegExp(marca + '\\s+([\\w\\s]{2,40})', 'i')
  const m   = texto.match(re)
  return m?.[1]?.trim().toUpperCase().substring(0, 50) ?? 'SIN MODELO'
}
