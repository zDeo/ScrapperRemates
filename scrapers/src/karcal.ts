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

/** Parsea patente, km, mandante, etc. desde la página de detalle */
async function fetchDetalle(detalleUrl: string): Promise<{
  patente: string | null
  kilometraje: number | null
  mandante: string | null
  combustible: string | null
  traccion: string | null
  transmision: string | null
  estado_vehiculo: string
}> {
  try {
    const res  = await fetch(detalleUrl, { headers: HEADERS })
    const html = await res.text()
    const $    = cheerio.load(html)
    const txt  = $('body').text()

    const extract = (label: string) => {
      const m = txt.match(new RegExp(label + '[:\\s]+([\\w\\s.,-]+)', 'i'))
      return m?.[1]?.trim().split('\n')[0].trim() ?? null
    }

    // Patente
    const patente = extract('Placa') ?? extract('Patente') ?? null

    // Kilometraje
    const kmTxt = extract('Kilometraje') ?? ''
    const km    = parseInt(kmTxt.replace(/\./g, '')) || null

    // Mandante (empresa de seguros)
    const mandante = extract('Mandante') ?? null

    // Combustible, tracción, transmisión
    const combustible = extract('Combustible') ?? null
    const traccion    = extract('Tracción') ?? extract('Traccion') ?? null
    const transmision = extract('Transmisión') ?? extract('Transmision') ?? null

    // Estado del vehículo: chatarra, encendio, rodante
    const txtLower = txt.toLowerCase()
    let estado_vehiculo = 'siniestrado'
    if (txtLower.includes('chatarra'))              estado_vehiculo = 'chatarra'
    else if (txtLower.includes('se desplaz'))       estado_vehiculo = 'rodante'
    else if (txtLower.includes('encendio') || txtLower.includes('encendió')) estado_vehiculo = 'encendio'

    return { patente, kilometraje: km, mandante, combustible, traccion, transmision, estado_vehiculo }
  } catch {
    return { patente: null, kilometraje: null, mandante: null, combustible: null, traccion: null, transmision: null, estado_vehiculo: 'siniestrado' }
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

async function fetchRemates(): Promise<{ id: string; fechaTxt: string; estado: 'proximo' | 'cerrado' }[]> {
  const resultados: { id: string; fechaTxt: string; estado: 'proximo' | 'cerrado' }[] = []

  for (const estado of ['Activo', 'Inactivo'] as const) {
    const res  = await fetch(`${BASE_URL}/?EstadoRemate=${estado}`, { headers: HEADERS })
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

async function fetchVehiculos(remateExternoId: string, remateUuid: string): Promise<VehiculoInput[]> {
  const vehiculos: VehiculoInput[] = []
  const seenIds  = new Set<string>()
  let   pagina   = 1
  let   hayMas   = true

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
      const detalles = await Promise.all(batch.map(v => fetchDetalle(v.detalleUrl)))
      batch.forEach((v, j) => {
        const d = detalles[j]
        vehiculos.push({
          ...v,
          patente:        d.patente,
          kilometraje:    d.kilometraje,
          mandante:       d.mandante,
          combustible:    d.combustible,
          traccion:       d.traccion,
          transmision:    d.transmision,
          estado_vehiculo: d.estado_vehiculo,
        } as VehiculoInput)
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
    console.log(`[Karcal] Remate ${r.id}: ${vehiculos.length} vehículos`)

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
