import * as cheerio from 'cheerio'
import { VehiculoInput, RemateInput } from './types.js'
import { supabase } from './supabase-client.js'

const BASE_URL = 'https://www.karcal.cl'
const HEADERS  = { 'User-Agent': 'Mozilla/5.0 (compatible; RematesSantiagoBot/1.0)' }

/** "$1.300.000" → 1300000 | null */
export function parseKarcalPrecio(texto: string): number | null {
  const limpio = texto.replace(/[$\s.]/g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return isNaN(n) || n <= 0 ? null : n
}

interface DetalleVehiculo {
  patente: string | null
  kilometraje: number | null
  mandante: string | null
  combustible: string | null
  traccion: string | null
  transmision: string | null
  estado_vehiculo: string
  fecha_remate_exacta: string | null
  url_cav: string | null
  url_inspeccion: string | null
  precio_final: number | null
  deuda_total: number | null
  deuda_detalle: string | null
  imagenes: string[]
}

/** Parsea todos los datos desde la página de detalle de Karcal */
async function fetchDetalle(detalleUrl: string, vehiculoId: string): Promise<DetalleVehiculo> {
  const fallback: DetalleVehiculo = {
    patente: null, kilometraje: null, mandante: null, combustible: null,
    traccion: null, transmision: null, estado_vehiculo: 'siniestrado',
    fecha_remate_exacta: null, url_cav: null, url_inspeccion: null, precio_final: null,
    deuda_total: null, deuda_detalle: null, imagenes: [],
  }
  try {
    const res  = await fetch(detalleUrl, { headers: HEADERS })
    const html = await res.text()
    const $    = cheerio.load(html)
    const txt  = $('body').text()

    const extract = (label: string) => {
      const m = txt.match(new RegExp(label + '[:\\s]+([\\w\\s.,-/]+)', 'i'))
      return m?.[1]?.trim().split('\n')[0].trim() ?? null
    }

    // Patente
    const patente = extract('Placa') ?? extract('Patente') ?? null

    // Kilometraje
    const kmTxt = extract('Kilometraje') ?? ''
    const km    = parseInt(kmTxt.replace(/\./g, '').replace(/\s/g, '')) || null

    // Mandante
    const mandante = extract('Mandante') ?? null

    // Especificaciones
    const combustible = extract('Combustible') ?? null
    const traccion    = extract('Tracción') ?? extract('Traccion') ?? null
    const transmision = extract('Transmisión') ?? extract('Transmision') ?? null

    // Fecha exacta del remate con hora: "Remate: 09-04-2026 15:00"
    const fechaM = txt.match(/Remate[:\s]+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})/i)
    let fecha_remate_exacta: string | null = null
    if (fechaM) {
      const [d, mo, y] = fechaM[1].split('-')
      fecha_remate_exacta = `${y}-${mo}-${d}T${fechaM[2]}:00-04:00`
    }

    // CAV: patrón /Detalle/DescargarPDF/?bienId=X&CatId=7
    const cavHref = $('a[href*="DescargarPDF"][href*="CatId=7"]').first().attr('href')
      ?? `/Detalle/DescargarPDF/?bienId=${vehiculoId}&CatId=7`
    const url_cav = `${BASE_URL}${cavHref.startsWith('/') ? cavHref : '/' + cavHref}`

    // Inspección General
    const inspHref = $('a[href*="DescargarPDF"]')
      .filter((_, el) => /inspecci/i.test($(el).text()))
      .first().attr('href') ?? null
    const url_inspeccion = inspHref
      ? `${BASE_URL}${inspHref.startsWith('/') ? inspHref : '/' + inspHref}`
      : null

    // Estado del vehículo (condición renderizada en imagen — solo inferencia por texto)
    const txtLower = txt.toLowerCase()
    let estado_vehiculo = 'siniestrado'
    if (txtLower.includes('chatarra'))                                     estado_vehiculo = 'chatarra'
    else if (txtLower.includes('se desplaz') && txtLower.includes('encendi')) estado_vehiculo = 'encendio_rodante'
    else if (txtLower.includes('se desplaz'))                              estado_vehiculo = 'rodante'
    else if (txtLower.includes('encendi'))                                 estado_vehiculo = 'encendio'

    // Oferta ganadora (remates cerrados)
    const ofertaM  = txt.match(/Oferta\s+ganadora\s*\$?([\d.,]+)/i)
    const precio_final = ofertaM ? parseKarcalPrecio(ofertaM[1].replace(/\./g, '')) : null

    // Deudas / multas pendientes
    const deudaItems: { label: string; monto: number }[] = []
    // Buscar patrones: "TAG $1.234.567", "Prenda $1.234.567", "Multa $1.234.567"
    const deudaRe = /(TAG|Prenda|Multa|Anotación|Anotacion|Deuda\s+\w+)\s*[:\-]?\s*\$([\d.,]+)/gi
    let dm: RegExpExecArray | null
    while ((dm = deudaRe.exec(txt)) !== null) {
      const monto = parseKarcalPrecio(dm[2].replace(/\./g, ''))
      if (monto && monto > 0) deudaItems.push({ label: dm[1].trim(), monto })
    }
    const deuda_total   = deudaItems.length > 0 ? deudaItems.reduce((s, d) => s + d.monto, 0) : null
    const deuda_detalle = deudaItems.length > 0
      ? deudaItems.map(d => `${d.label} $${d.monto.toLocaleString('es-CL')}`).join(' · ')
      : null

    // Imágenes adicionales del detalle
    const imagenes: string[] = []
    $('img').each((_, el) => {
      const src = $(el).attr('src') ?? ''
      if (!src) return
      // Excluir logos, iconos, botones (src muy cortos o con palabras clave)
      if (/logo|icon|btn|banner|arrow|sprite|gif$/i.test(src)) return
      // Solo imágenes con extensiones de foto o rutas de galería
      if (!/\.(jpg|jpeg|png|webp)/i.test(src) && !/foto|foto|galeria|image|photo/i.test(src)) return
      const fullSrc = src.startsWith('http') ? src : `${BASE_URL}${src.startsWith('/') ? src : '/' + src}`
      if (!imagenes.includes(fullSrc)) imagenes.push(fullSrc)
    })

    return { patente, kilometraje: km, mandante, combustible, traccion, transmision,
             estado_vehiculo, fecha_remate_exacta, url_cav, url_inspeccion, precio_final,
             deuda_total, deuda_detalle, imagenes }
  } catch {
    return fallback
  }
}

/**
 * Extrae un VehiculoInput básico desde el HTML de una card del listado.
 * Estructura real del sitio:
 *   <a href="/Detalle/Ficha/ID/N"><img alt="MARCA MODELO AÑO PATENTE"> N</a>
 *   MARCA / MODELO / AÑO / Valor Inicial $X / Ver Auto
 */
export function parseKarcalVehiculo(html: string, remateId: string): VehiculoInput | null {
  const $ = cheerio.load(html)

  // Link y ID del vehículo
  const href = $('a[href*="/Detalle/Ficha/"]').first().attr('href') ?? ''
  const loteMatch = href.match(/\/Detalle\/Ficha\/(\d+)/)
  if (!loteMatch) return null

  const allText = $('body').text()

  // Precio: "Valor Inicial $5.400.000"
  const precioRaw = allText.match(/Valor\s+Inicial\s*(\$[\d.,]+)/i)?.[1]
    ?? allText.match(/\$\s*[\d.,]+/)?.[0]
    ?? ''

  // Año
  const anioTxt = allText.match(/\b(19[89]\d|20[012]\d)\b/)?.[0] ?? ''

  // Imagen
  const imgSrc = $('img').first().attr('src') ?? null
  const imgUrl = imgSrc
    ? imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`
    : null

  // Marca y modelo desde alt de imagen: "RAM 1500 2024 TFFX56"
  let marca = '', modelo = ''
  const alt = $('img').first().attr('alt') ?? ''
  if (alt.trim()) {
    const parts  = alt.trim().split(/\s+/)
    const anioIdx = parts.findIndex(p => /^(19[89]\d|20[012]\d)$/.test(p))
    if (anioIdx > 0) {
      marca  = parts[0]
      modelo = parts.slice(1, anioIdx).join(' ')
    } else {
      marca  = parts[0]
      modelo = parts.slice(1, 3).join(' ')
    }
  }

  // Fallback texto
  if (!marca) {
    const lines = allText
      .split(/[\n\r]+/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 1 && l.length < 50)
      .filter((l: string) => !/valor inicial|ver auto|agregar al carro|\$/i.test(l))
      .filter((l: string) => !/^\d{4}$/.test(l))
    marca  = lines[0] ?? ''
    modelo = lines[1] ?? ''
  }

  if (!marca) return null

  return {
    remate_id:       remateId,
    lote_id:         loteMatch[1],
    marca:           marca.toUpperCase().trim(),
    modelo:          (modelo || 'SIN MODELO').toUpperCase().trim().substring(0, 50),
    anio:            parseInt(anioTxt) || null,
    precio_base:     parseKarcalPrecio(precioRaw),
    precio_final:    null,
    estado_vehiculo: 'siniestrado',
    imagen_url:      imgUrl,
    url_detalle:     href ? `${BASE_URL}${href}` : null,
  }
}

async function fetchRemates(maxPaginasInactivo = 2): Promise<{ id: string; fechaTxt: string; estado: 'proximo' | 'cerrado' }[]> {
  const resultados: { id: string; fechaTxt: string; estado: 'proximo' | 'cerrado' }[] = []
  const vistosIds = new Set<string>()

  // Activos (solo primera página)
  const resA  = await fetch(`${BASE_URL}/?EstadoRemate=Activo`, { headers: HEADERS })
  const htmlA = await resA.text()
  const $A    = cheerio.load(htmlA)
  $A('a[href*="/Listado/Index/"]').each((_, el) => {
    const href    = $A(el).attr('href') ?? ''
    const idMatch = href.match(/\/Listado\/Index\/(\d+)/)
    if (!idMatch || vistosIds.has(idMatch[1])) return
    vistosIds.add(idMatch[1])
    const contenedor = $A(el).closest('tr, li, div').text().trim()
    const fechaMatch = contenedor.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)
    resultados.push({ id: idMatch[1], fechaTxt: fechaMatch?.[0] ?? '', estado: 'proximo' })
  })

  // Inactivos con paginación controlada
  for (let pag = 1; pag <= maxPaginasInactivo; pag++) {
    const url  = `${BASE_URL}/?EstadoRemate=Inactivo&NumPag=${pag}`
    const res  = await fetch(url, { headers: HEADERS })
    const html = await res.text()
    const $    = cheerio.load(html)
    let   hayNuevos = false

    $('a[href*="/Listado/Index/"]').each((_, el) => {
      const href    = $(el).attr('href') ?? ''
      const idMatch = href.match(/\/Listado\/Index\/(\d+)/)
      if (!idMatch || vistosIds.has(idMatch[1])) return
      vistosIds.add(idMatch[1])
      hayNuevos = true
      const contenedor = $(el).closest('tr, li, div').text().trim()
      const fechaMatch = contenedor.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)
      resultados.push({ id: idMatch[1], fechaTxt: fechaMatch?.[0] ?? '', estado: 'cerrado' })
    })

    if (!hayNuevos) break
    await sleep(500)
  }

  return resultados
}

async function fetchVehiculos(remateExternoId: string, remateUuid: string): Promise<{ vehiculos: VehiculoInput[]; fechaExacta: string | null }> {
  const vehiculos: VehiculoInput[] = []
  const seenIds  = new Set<string>()
  let   pagina   = 1
  let   hayMas   = true
  let   fechaExactaRemate: string | null = null

  while (hayMas) {
    const url  = `${BASE_URL}/Listado/Index/${remateExternoId}?NumPag=${pagina}`
    const res  = await fetch(url, { headers: HEADERS })
    const html = await res.text()
    const $    = cheerio.load(html)

    // Recolectar IDs únicos de fichas
    const fichaMap = new Map<string, string>()
    $('a[href*="/Detalle/Ficha/"]').each((_, el) => {
      const href  = $(el).attr('href') ?? ''
      const match = href.match(/\/Detalle\/Ficha\/(\d+)/)
      if (match && !seenIds.has(match[1])) fichaMap.set(match[1], href)
    })

    if (fichaMap.size === 0) { hayMas = false; break }

    // Parsear cards básicas
    const vehiculosBasicos: (VehiculoInput & { detalleUrl: string })[] = []
    fichaMap.forEach((href, fichaId) => {
      seenIds.add(fichaId)
      const link      = $(`a[href="${href}"]`).first()
      const container = link.closest('[class*="col"], [class*="card"], [class*="item"], li, article')
      const cardHtml  = $.html(container.length ? container : link.parent().parent())
      const v         = parseKarcalVehiculo(cardHtml, remateUuid)
      if (v) vehiculosBasicos.push({ ...v, detalleUrl: `${BASE_URL}${href}` })
    })

    // Enriquecer con datos de la página de detalle (en batches de 5)
    for (let i = 0; i < vehiculosBasicos.length; i += 5) {
      const batch   = vehiculosBasicos.slice(i, i + 5)
      const detalles = await Promise.all(batch.map(v => fetchDetalle(v.detalleUrl, v.lote_id)))
      batch.forEach((v, j) => {
        const d = detalles[j]
        // Excluir detalleUrl (campo interno, no existe en DB)
        const { detalleUrl: _url, ...vehiculoBase } = v as VehiculoInput & { detalleUrl: string }
        vehiculos.push({
          ...vehiculoBase,
          patente:         d.patente,
          kilometraje:     d.kilometraje,
          mandante:        d.mandante,
          combustible:     d.combustible,
          traccion:        d.traccion,
          transmision:     d.transmision,
          estado_vehiculo: d.estado_vehiculo,
          url_cav:         d.url_cav,
          url_inspeccion:  d.url_inspeccion,
          precio_final:    d.precio_final,
          vendido:         d.precio_final !== null,
          deuda_total:     d.deuda_total,
          deuda_detalle:   d.deuda_detalle,
          imagenes:        d.imagenes.length > 0 ? d.imagenes : null,
        } as VehiculoInput)
        // Guardar fecha exacta para actualizar el remate
        if (d.fecha_remate_exacta && !fechaExactaRemate) {
          fechaExactaRemate = d.fecha_remate_exacta
        }
      })
    }

    // Paginación
    const paginaTexto = $('[class*="pagination"], .pagination').text()
    const totalMatch  = paginaTexto.match(/de\s+(\d+)/i)
    const total       = totalMatch ? parseInt(totalMatch[1]) : 1
    hayMas = pagina < total
    pagina++

    await sleep(800)
  }
  return { vehiculos, fechaExacta: fechaExactaRemate }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function parseFechaChilena(texto: string): string | null {
  const m = texto.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00-04:00`
}

export async function scrapeKarcalHistorico(empresaId: string, maxPaginas = 11): Promise<void> {
  return scrapeKarcal(empresaId, maxPaginas)
}

export async function scrapeKarcal(empresaId: string, maxPaginasInactivo = 2): Promise<void> {
  console.log(`[Karcal] Iniciando (max ${maxPaginasInactivo} páginas inactivo)...`)
  const remates = await fetchRemates(maxPaginasInactivo)
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

    const { vehiculos, fechaExacta } = await fetchVehiculos(r.id, remateRow.id)
    console.log(`[Karcal] Remate ${r.id}: ${vehiculos.length} vehículos`)

    // Actualizar fecha exacta del remate si la obtuvimos de la ficha
    if (fechaExacta) {
      await supabase.from('remates').update({ fecha_remate: fechaExacta }).eq('id', remateRow.id)
      console.log(`[Karcal] Fecha remate actualizada: ${fechaExacta}`)
    }

    if (vehiculos.length > 0) {
      const { error: vErr } = await supabase
        .from('vehiculos')
        .upsert(vehiculos as any, { onConflict: 'remate_id,lote_id' })
      if (vErr) console.error('[Karcal] Error upserting vehiculos:', vErr.message)
      else console.log(`[Karcal] ✓ ${vehiculos.length} vehículos guardados del remate ${r.id}`)
    }
  }
  console.log('[Karcal] Completado.')
}
