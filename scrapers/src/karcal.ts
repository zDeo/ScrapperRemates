import * as cheerio from 'cheerio'
import { VehiculoInput, RemateInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE_URL = 'https://www.karcal.cl'

/** "$1.300.000" → 1300000 | null */
export function parseKarcalPrecio(texto: string): number | null {
  const limpio = texto.replace(/[$\s.]/g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return isNaN(n) || n <= 0 ? null : n
}

/** Extrae un VehiculoInput desde el HTML de una card */
export function parseKarcalVehiculo(html: string, remateId: string): VehiculoInput | null {
  const $ = cheerio.load(html)
  const href      = $('a[href*="/Detalle/Ficha/"]').first().attr('href') ?? ''
  const loteMatch = href.match(/\/Detalle\/Ficha\/(\d+)/)
  if (!loteMatch) return null

  // Los campos están en divs con clases específicas o en texto estructurado
  const allText = $('*').first().text().trim()

  // Karcal muestra: MARCA | MODELO | AÑO en el listing
  // Intentamos extraer de los elementos del card
  const marca  = $('.marca, [class*="marca"]').first().text().trim()
    || extractField($, 'marca')
  const modelo = $('.modelo, [class*="modelo"]').first().text().trim()
    || extractField($, 'modelo')
  const anioTxt = $('.anio, .year, [class*="anio"], [class*="year"]').first().text().trim()
    || allText.match(/\b(19[89]\d|20[012]\d)\b/)?.[0] || ''
  const precioTxt = $('.precio, [class*="precio"], [class*="price"]').first().text().trim()
    || allText.match(/\$[\d.,]+/)?.[0] || ''
  const imgUrl = $('img').first().attr('src') ?? null

  // Fallback: si no encontramos marca/modelo por clases, intentamos por texto
  if (!marca && !modelo) return null

  return {
    remate_id:       remateId,
    lote_id:         loteMatch[1],
    marca:           (marca || 'DESCONOCIDA').toUpperCase().trim(),
    modelo:          (modelo || 'SIN MODELO').toUpperCase().trim(),
    anio:            parseInt(anioTxt) || null,
    precio_base:     parseKarcalPrecio(precioTxt),
    precio_final:    null,
    estado_vehiculo: 'siniestrado',
    imagen_url:      imgUrl ? (imgUrl.startsWith('http') ? imgUrl : `${BASE_URL}${imgUrl}`) : null,
    url_detalle:     href ? `${BASE_URL}${href}` : null,
  }
}

function extractField($: cheerio.CheerioAPI, field: string): string {
  // Busca cualquier elemento que contenga el texto del campo como label
  let val = ''
  $('td, div, span').each((_, el) => {
    const txt = $(el).text().toLowerCase()
    if (txt.includes(field + ':') || txt.includes(field + ' :')) {
      val = txt.split(':')[1]?.trim() ?? ''
      return false
    }
  })
  return val
}

/** Lista remates activos y cerrados de Karcal */
async function fetchRemates(): Promise<{ id: string; fechaTxt: string; estado: 'proximo' | 'cerrado' }[]> {
  const resultados: { id: string; fechaTxt: string; estado: 'proximo' | 'cerrado' }[] = []

  for (const estado of ['Activo', 'Inactivo'] as const) {
    const res  = await fetch(`${BASE_URL}/?EstadoRemate=${estado}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RematesSantiagoBot/1.0)' },
    })
    const html = await res.text()
    const $    = cheerio.load(html)

    $('a[href*="/Listado/Index/"]').each((_, el) => {
      const href    = $(el).attr('href') ?? ''
      const idMatch = href.match(/\/Listado\/Index\/(\d+)/)
      if (!idMatch) return
      const contenedor = $(el).closest('tr, li, div').text().trim()
      const fechaMatch = contenedor.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)
      resultados.push({
        id:       idMatch[1],
        fechaTxt: fechaMatch?.[0] ?? '',
        estado:   estado === 'Activo' ? 'proximo' : 'cerrado',
      })
    })
  }
  return resultados
}

/** Scrapea todos los vehículos de un remate paginado */
async function fetchVehiculos(remateExternoId: string, remateUuid: string): Promise<VehiculoInput[]> {
  const vehiculos: VehiculoInput[] = []
  let pagina = 1
  let hayMas = true

  while (hayMas) {
    const url = `${BASE_URL}/Listado/Index/${remateExternoId}?NumPag=${pagina}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RematesSantiagoBot/1.0)' },
    })
    const html = await res.text()
    const $    = cheerio.load(html)

    // Cada vehículo es un <a href="/Detalle/Ficha/...">
    const cards = $('a[href*="/Detalle/Ficha/"]')
    if (cards.length === 0) { hayMas = false; break }

    cards.each((_, el) => {
      const cardHtml = $.html($(el).parent())
      const v = parseKarcalVehiculo(cardHtml, remateUuid)
      if (v) vehiculos.push(v)
    })

    // Detectar paginación: busca "Página X de Y"
    const paginaTexto = $('[class*="pagination"], .pagination').text()
    const totalMatch  = paginaTexto.match(/de\s+(\d+)/i)
    const total       = totalMatch ? parseInt(totalMatch[1]) : 1
    hayMas = pagina < total
    pagina++

    await sleep(600)
  }
  return vehiculos
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function parseFechaChilena(texto: string): string | null {
  const m = texto.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00-04:00`
}

export async function scrapeKarcal(empresaId: string): Promise<void> {
  console.log('[Karcal] Iniciando...')
  const remates = await fetchRemates()
  console.log(`[Karcal] ${remates.length} remates encontrados`)

  for (const r of remates) {
    const input: RemateInput = {
      empresa_id:        empresaId,
      remate_externo_id: r.id,
      fecha_remate:      parseFechaChilena(r.fechaTxt),
      tipo:              'siniestrado',
      estado:            r.estado,
      url:               `${BASE_URL}/Listado/Index/${r.id}`,
    }

    const { data: remateRow, error } = await supabase
      .from('remates')
      .upsert(input, { onConflict: 'empresa_id,remate_externo_id' })
      .select('id')
      .single()

    if (error || !remateRow) {
      console.error('[Karcal] Error upserting remate:', error?.message)
      continue
    }

    const vehiculos = await fetchVehiculos(r.id, remateRow.id)
    if (vehiculos.length > 0) {
      const { error: vErr } = await supabase
        .from('vehiculos')
        .upsert(vehiculos, { onConflict: 'remate_id,lote_id' })
      if (vErr) console.error('[Karcal] Error upserting vehiculos:', vErr.message)
      else console.log(`[Karcal] ✓ ${vehiculos.length} vehículos del remate ${r.id}`)
    }
  }
  console.log('[Karcal] Completado.')
}
