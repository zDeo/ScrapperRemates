import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase-client'
import { ImagenModal } from '../components/ImagenModal'
import type { VehiculoAnalisis } from '../types'

interface AnalisisIA {
  dano_nivel: 'leve' | 'moderado' | 'severo' | 'sin_datos' | null
  dano_descripcion: string | null
  costo_reparacion_min: number | null
  costo_reparacion_max: number | null
  partes_afectadas: string[] | null
  decision: 'comprar' | 'analizar' | 'evitar' | null
  precio_maximo_oferta: number | null
  margen_estimado: number | null
  justificacion: string | null
}

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString('es-CL')}` : '—'

const DANO_STYLES = {
  leve:      { bg: 'bg-green-100 text-green-700 border-green-200',   label: 'Daño leve' },
  moderado:  { bg: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Daño moderado' },
  severo:    { bg: 'bg-red-100 text-red-700 border-red-200',          label: 'Daño severo' },
  sin_datos: { bg: 'bg-gray-100 text-gray-500 border-gray-200',       label: 'Sin datos' },
}

const DECISION_STYLES = {
  comprar:  { bg: 'bg-green-500',  label: '✓ Comprar',    text: 'text-green-700 bg-green-50 border-green-200' },
  analizar: { bg: 'bg-yellow-500', label: '? Analizar',   text: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  evitar:   { bg: 'bg-red-500',    label: '✗ Evitar',     text: 'text-red-700 bg-red-50 border-red-200' },
}

export function VehiculoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [v, setV] = useState<VehiculoAnalisis | null>(null)
  const [ia, setIa] = useState<AnalisisIA | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('analisis_vehiculos').select('*').eq('id', id).single(),
      supabase.from('analisis_ia').select('*').eq('vehiculo_id', id).single(),
    ]).then(([{ data: vData }, { data: iaData }]) => {
      setV(vData as VehiculoAnalisis)
      setIa(iaData as AnalisisIA)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent" />
      </div>
    )
  }

  if (!v) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">
        Vehículo no encontrado.
      </div>
    )
  }

  const images = [v.imagen_url, ...(v.imagenes ?? [])].filter(Boolean) as string[]
  const dano   = ia?.dano_nivel ? DANO_STYLES[ia.dano_nivel] : null
  const dec    = ia?.decision   ? DECISION_STYLES[ia.decision] : null

  return (
    <div className="min-h-screen bg-gray-50">
      {modal && (
        <ImagenModal
          images={images}
          alt={`${v.marca} ${v.modelo}`}
          onClose={() => setModal(false)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1 transition-colors"
          >
            ← Volver
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <span className="font-bold text-gray-900">{v.marca} {v.modelo}</span>
          {v.anio && <span className="text-gray-400 text-sm">{v.anio}</span>}
          {v.patente && (
            <span className="font-mono text-xs border border-gray-200 bg-gray-50 px-2 py-0.5 rounded">
              {v.patente}
            </span>
          )}
          {dec && (
            <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full border ${dec.text}`}>
              {dec.label}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Columna izquierda: imágenes + info básica */}
          <div className="lg:col-span-2 space-y-4">

            {/* Carrusel de imágenes */}
            {images.length > 0 ? (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div
                  className="relative w-full h-72 cursor-zoom-in"
                  onClick={() => setModal(true)}
                >
                  <img
                    src={images[imgIdx]}
                    alt={`${v.marca} ${v.modelo}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                    {imgIdx + 1} / {images.length}
                  </span>
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length) }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                      >‹</button>
                      <button
                        onClick={e => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                      >›</button>
                    </>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-1.5 p-2 overflow-x-auto bg-gray-50">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`flex-shrink-0 w-14 h-10 rounded overflow-hidden border-2 transition-all ${i === imgIdx ? 'border-blue-500' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm h-72 flex items-center justify-center text-6xl text-gray-200">
                🚗
              </div>
            )}

            {/* Info técnica */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Información técnica</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  ['Empresa', v.empresa],
                  ['Marca', v.marca],
                  ['Modelo', v.modelo],
                  ['Año', v.anio],
                  ['Patente', v.patente],
                  ['Kilometraje', v.kilometraje != null ? `${v.kilometraje.toLocaleString('es-CL')} km` : null],
                  ['Transmisión', v.transmision],
                  ['Combustible', v.combustible],
                  ['Tracción', v.traccion],
                  ['Condición', v.estado_vehiculo],
                  ['Mandante', v.mandante],
                ].filter(([, val]) => val != null).map(([label, val]) => (
                  <div key={label as string} className="flex justify-between gap-2 py-1 border-b border-gray-50">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-medium text-gray-700 text-right">{String(val)}</span>
                  </div>
                ))}
              </div>

              {/* Links */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {v.url_detalle && (
                  <a href={v.url_detalle} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded-lg transition-colors">
                    Ver ficha remate →
                  </a>
                )}
                {v.url_cav && (
                  <a href={v.url_cav} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1 rounded-lg transition-colors">
                    📋 CAV
                  </a>
                )}
                {v.url_inspeccion && (
                  <a href={v.url_inspeccion} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1 rounded-lg transition-colors">
                    🔍 Inspección
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Columna derecha: análisis */}
          <div className="space-y-4">

            {/* Recomendación IA */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Análisis IA</h3>
              {ia ? (
                <div className="space-y-3">
                  {dano && (
                    <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg border inline-block ${dano.bg}`}>
                      {dano.label}
                    </div>
                  )}
                  {ia.dano_descripcion && (
                    <p className="text-xs text-gray-600 leading-relaxed">{ia.dano_descripcion}</p>
                  )}
                  {ia.partes_afectadas && ia.partes_afectadas.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Partes afectadas</div>
                      <div className="flex flex-wrap gap-1">
                        {ia.partes_afectadas.map((p, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(ia.costo_reparacion_min || ia.costo_reparacion_max) && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Costo reparación est.</span>
                      <span className="font-semibold text-orange-600">
                        {fmt(ia.costo_reparacion_min)} – {fmt(ia.costo_reparacion_max)}
                      </span>
                    </div>
                  )}
                  {dec && (
                    <div className={`mt-2 p-3 rounded-lg border ${dec.text}`}>
                      <div className="font-bold text-sm">{dec.label}</div>
                      {ia.precio_maximo_oferta && (
                        <div className="text-xs mt-1">
                          Precio máximo: <span className="font-semibold">{fmt(ia.precio_maximo_oferta)}</span>
                        </div>
                      )}
                      {ia.margen_estimado != null && (
                        <div className="text-xs">Margen est.: {ia.margen_estimado}%</div>
                      )}
                      {ia.justificacion && (
                        <p className="text-xs mt-2 leading-relaxed opacity-80">{ia.justificacion}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Análisis IA pendiente — ejecuta el workflow de agentes.</p>
              )}
            </div>

            {/* Precios */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Precios</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Precio base remate', v.precio_base, 'text-gray-700'],
                  ['Prom. remates pasados', v.precio_remate_promedio, 'text-blue-600'],
                  ['Valor mercado', v.precio_mercado, 'text-purple-700'],
                ].map(([label, val, cls]) => (
                  <div key={label as string} className="flex justify-between gap-2">
                    <span className="text-gray-400">{label as string}</span>
                    <span className={`font-semibold ${val ? cls as string : 'text-gray-300'}`}>{fmt(val as number | null)}</span>
                  </div>
                ))}
                {v.precio_mercado_min && v.precio_mercado_max && (
                  <div className="text-gray-400 text-right">
                    {fmt(v.precio_mercado_min)} – {fmt(v.precio_mercado_max)}
                  </div>
                )}
                {v.margen_porcentaje != null && (
                  <div className={`mt-2 text-center text-xs font-bold px-3 py-1.5 rounded-full ${
                    v.margen_porcentaje >= 40 ? 'bg-green-100 text-green-700' :
                    v.margen_porcentaje >= 20 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {v.margen_porcentaje > 0 ? '↑' : '↓'} {Math.abs(v.margen_porcentaje)}% margen estimado
                  </div>
                )}
              </div>
            </div>

            {/* Deudas */}
            {(v.deuda_total || v.deuda_detalle) && (
              <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
                <h3 className="font-semibold text-red-600 text-sm mb-2">Deudas / Multas</h3>
                {v.deuda_total && (
                  <div className="text-lg font-bold text-red-600">{fmt(v.deuda_total)}</div>
                )}
                {v.deuda_detalle && (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{v.deuda_detalle}</p>
                )}
              </div>
            )}

            {/* Remates similares */}
            {Array.isArray(v.hist_similar_resumen) && v.hist_similar_resumen.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-semibold text-gray-700 text-sm mb-3">Remates similares</h3>
                <div className="space-y-1">
                  {v.hist_similar_resumen.map((item, i) =>
                    item.url ? (
                      <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                        className="flex justify-between items-center text-xs py-1 text-blue-600 hover:underline">
                        <span>{item.modelo}</span>
                        <span className="font-mono font-semibold">${parseFloat((item.precio / 1_000_000).toFixed(1))}M</span>
                      </a>
                    ) : (
                      <div key={i} className="flex justify-between text-xs py-1 text-gray-500">
                        <span>{item.modelo}</span>
                        <span className="font-mono">${parseFloat((item.precio / 1_000_000).toFixed(1))}M</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
