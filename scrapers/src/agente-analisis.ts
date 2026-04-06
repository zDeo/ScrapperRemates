import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from './supabase-client.js'

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' })

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function conRetry<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  for (let i = 0; i < intentos; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const msg = String(err?.message ?? '')
      const delay = msg.match(/retry in (\d+)s/i)?.[1]
      if (msg.includes('429') && i < intentos - 1) {
        const espera = delay ? parseInt(delay) * 1000 : (i + 1) * 60_000
        console.log(`  [Rate limit] Esperando ${espera / 1000}s antes de reintentar...`)
        await sleep(espera)
        continue
      }
      throw err
    }
  }
  throw new Error('Sin intentos restantes')
}

// ─── Agente 1: Análisis de imagen (daño mecánico visual) ─────────────────────

async function analizarImagen(imagenUrl: string): Promise<{
  dano_nivel: 'leve' | 'moderado' | 'severo' | 'sin_datos'
  dano_descripcion: string
  costo_reparacion_estimado_min: number | null
  costo_reparacion_estimado_max: number | null
  partes_afectadas: string[]
}> {
  try {
    const prompt = `Eres un mecánico experto evaluando un vehículo en un remate en Chile.
Analiza la imagen y responde SOLO en JSON válido con esta estructura exacta:
{
  "dano_nivel": "leve" | "moderado" | "severo" | "sin_datos",
  "dano_descripcion": "descripción breve de daños visibles",
  "costo_reparacion_estimado_min": número en pesos chilenos o null,
  "costo_reparacion_estimado_max": número en pesos chilenos o null,
  "partes_afectadas": ["lista", "de", "partes"]
}

Criterios:
- leve: rasguños, abolladuras menores, sin daño mecánico visible
- moderado: deformaciones, daño en partes removibles, posible daño mecánico
- severo: estructura comprometida, motor/tren delantero afectado, pérdida total probable
- sin_datos: imagen no permite evaluar

Precios en CLP (pesos chilenos). Si no puedes ver daños, usa sin_datos.`

    const imageResp = await fetch(imagenUrl)
    if (!imageResp.ok) throw new Error(`HTTP ${imageResp.status}`)
    const buffer = await imageResp.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = imageResp.headers.get('content-type') || 'image/jpeg'

    const result = await conRetry(() => model.generateContent([
      { inlineData: { mimeType: mimeType as any, data: base64 } },
      prompt,
    ]))

    const texto = result.response.text().trim()
    const jsonStr = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error(`  [Imagen] Error: ${(err as Error).message}`)
    return {
      dano_nivel: 'sin_datos',
      dano_descripcion: 'No se pudo analizar la imagen',
      costo_reparacion_estimado_min: null,
      costo_reparacion_estimado_max: null,
      partes_afectadas: [],
    }
  }
}

// ─── Agente 2: Síntesis y recomendación de compra ────────────────────────────

async function generarRecomendacion(datos: {
  marca: string
  modelo: string
  anio: number | null
  precio_base: number | null
  precio_mercado: number | null
  precio_remate_promedio: number | null
  dano_nivel: string
  costo_reparacion_min: number | null
  costo_reparacion_max: number | null
  deuda_total: number | null
}): Promise<{
  decision: 'comprar' | 'analizar' | 'evitar'
  precio_maximo_oferta: number | null
  margen_estimado: number | null
  justificacion: string
}> {
  try {
    const prompt = `Eres un experto en remates de vehículos en Chile. Evalúa si conviene comprar este vehículo.

Datos:
- Vehículo: ${datos.marca} ${datos.modelo} ${datos.anio ?? 'S/A'}
- Precio base remate: ${datos.precio_base ? `$${datos.precio_base.toLocaleString('es-CL')}` : 'Sin datos'}
- Valor mercado (Chileautos): ${datos.precio_mercado ? `$${datos.precio_mercado.toLocaleString('es-CL')}` : 'Sin datos'}
- Promedio remates pasados: ${datos.precio_remate_promedio ? `$${datos.precio_remate_promedio.toLocaleString('es-CL')}` : 'Sin datos'}
- Nivel de daño: ${datos.dano_nivel}
- Costo reparación estimado: ${datos.costo_reparacion_min ? `$${datos.costo_reparacion_min.toLocaleString('es-CL')} - $${datos.costo_reparacion_max?.toLocaleString('es-CL')}` : 'Sin datos'}
- Deudas pendientes: ${datos.deuda_total ? `$${datos.deuda_total.toLocaleString('es-CL')}` : 'Sin deudas'}

Responde SOLO en JSON válido:
{
  "decision": "comprar" | "analizar" | "evitar",
  "precio_maximo_oferta": número en CLP o null,
  "margen_estimado": porcentaje estimado de ganancia (número) o null,
  "justificacion": "explicación breve en español"
}

Criterios:
- comprar: margen > 20% después de reparación y deudas
- analizar: margen 5-20% o datos incompletos pero prometedor
- evitar: margen < 5%, pérdida probable, o deudas muy altas`

    const result = await conRetry(() => model.generateContent(prompt))
    const texto = result.response.text().trim()
    const jsonStr = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error(`  [Recomendación] Error: ${(err as Error).message}`)
    return {
      decision: 'analizar',
      precio_maximo_oferta: null,
      margen_estimado: null,
      justificacion: 'No se pudo generar recomendación automática',
    }
  }
}

// ─── Orquestador principal ────────────────────────────────────────────────────

export async function correrAgentesAnalisis(): Promise<void> {
  console.log('[Agentes] Iniciando análisis IA de vehículos...')

  const hoy = new Date().toISOString()
  const { data: vehiculos, error } = await supabase
    .from('vehiculos')
    .select(`
      id, marca, modelo, anio, precio_base, imagen_url, deuda_total,
      remates!inner(estado, fecha_remate),
      precios_mercado(precio_mercado)
    `)
    .eq('remates.estado', 'proximo')
    .gte('remates.fecha_remate', hoy)
    .not('imagen_url', 'is', null)

  if (error || !vehiculos) {
    console.error('[Agentes] Error leyendo BD:', error?.message)
    return
  }

  // Excluir vehículos ya analizados hoy
  const { data: yaAnalizados } = await supabase
    .from('analisis_ia')
    .select('vehiculo_id')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const analizadosSet = new Set((yaAnalizados ?? []).map((r: any) => r.vehiculo_id))
  const pendientes = vehiculos.filter((v: any) => !analizadosSet.has(v.id))

  console.log(`[Agentes] ${pendientes.length} vehículos a analizar (${vehiculos.length - pendientes.length} ya procesados hoy)`)

  for (const v of pendientes as any[]) {
    console.log(`\n[Agentes] ${v.marca} ${v.modelo} ${v.anio}`)

    // ── Agente 1: análisis visual de daño ────────────────────────────────────
    console.log('  → Agente 1: analizando imagen...')
    const imagenAnalisis = await analizarImagen(v.imagen_url)
    console.log(`  ✓ Daño: ${imagenAnalisis.dano_nivel} | ${imagenAnalisis.dano_descripcion}`)

    await sleep(5_000) // respetar rate limit Gemini free tier (15 RPM)

    // ── Agente 2: recomendación de compra ────────────────────────────────────
    console.log('  → Agente 2: generando recomendación...')
    const precioMercado = v.precios_mercado?.[0]?.precio_mercado ?? null
    const recomendacion = await generarRecomendacion({
      marca:                    v.marca,
      modelo:                   v.modelo,
      anio:                     v.anio,
      precio_base:              v.precio_base,
      precio_mercado:           precioMercado,
      precio_remate_promedio:   null, // viene del view analisis_vehiculos
      dano_nivel:               imagenAnalisis.dano_nivel,
      costo_reparacion_min:     imagenAnalisis.costo_reparacion_estimado_min,
      costo_reparacion_max:     imagenAnalisis.costo_reparacion_estimado_max,
      deuda_total:              v.deuda_total,
    })
    console.log(`  ✓ Decisión: ${recomendacion.decision} | Margen: ${recomendacion.margen_estimado ?? '?'}%`)

    await sleep(5_000)

    // ── Guardar resultados en Supabase ────────────────────────────────────────
    const { error: uErr } = await supabase
      .from('analisis_ia')
      .upsert({
        vehiculo_id:                    v.id,
        dano_nivel:                     imagenAnalisis.dano_nivel,
        dano_descripcion:               imagenAnalisis.dano_descripcion,
        costo_reparacion_min:           imagenAnalisis.costo_reparacion_estimado_min,
        costo_reparacion_max:           imagenAnalisis.costo_reparacion_estimado_max,
        partes_afectadas:               imagenAnalisis.partes_afectadas,
        decision:                       recomendacion.decision,
        precio_maximo_oferta:           recomendacion.precio_maximo_oferta,
        margen_estimado:                recomendacion.margen_estimado,
        justificacion:                  recomendacion.justificacion,
      }, { onConflict: 'vehiculo_id' })

    if (uErr) console.error('  → Error guardando:', uErr.message)
  }

  console.log('\n[Agentes] Análisis completado.')
}
