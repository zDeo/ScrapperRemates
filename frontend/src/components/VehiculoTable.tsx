import { useState } from 'react'
import type { VehiculoAnalisis } from '../types'
import { ImagenModal } from './ImagenModal'

interface Props {
  vehiculos: VehiculoAnalisis[]
  loading:   boolean
}

const EMPRESA_COLORS: Record<string, string> = {
  Karcal: 'bg-blue-100 text-blue-700 border border-blue-200',
  Zárate: 'bg-orange-100 text-orange-700 border border-orange-200',
  Reyco:  'bg-green-100 text-green-700 border border-green-200',
  Macal:  'bg-purple-100 text-purple-700 border border-purple-200',
}

const COND_COLORS: Record<string, { bg: string; label: string }> = {
  chatarra:         { bg: 'bg-red-100 text-red-700 border border-red-200',             label: 'Chatarra' },
  rodante:          { bg: 'bg-green-100 text-green-700 border border-green-200',       label: 'Rodante' },
  encendio:         { bg: 'bg-yellow-100 text-yellow-700 border border-yellow-200',    label: 'Enciende' },
  encendio_rodante: { bg: 'bg-emerald-100 text-emerald-700 border border-emerald-200', label: 'Enciende y rueda' },
  siniestrado:      { bg: 'bg-orange-100 text-orange-700 border border-orange-200',    label: 'Siniestrado' },
}

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString('es-CL')}` : '—'

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return {
    fecha: d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora:  d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
  }
}

function estimarPorAnio(precioRef: number, anioRef: number, anioVehiculo: number): number {
  return Math.round(precioRef * Math.pow(0.93, anioRef - anioVehiculo))
}

function HistoricoInfo({ v }: { v: VehiculoAnalisis }) {
  // Nivel 1: modelo exacto + año exacto
  if (v.hist_exacto_precio && v.hist_exacto_cantidad) {
    return (
      <div className="text-gray-400 text-xs">
        Año {v.anio} · {v.hist_exacto_cantidad} remate{v.hist_exacto_cantidad !== 1 ? 's' : ''}
      </div>
    )
  }
  // Nivel 2: modelo exacto + ±1 año
  if (v.hist_rango_precio && v.hist_rango_cantidad) {
    return (
      <div className="text-gray-400 text-xs">
        Años ±1 · {v.hist_rango_cantidad} remate{v.hist_rango_cantidad !== 1 ? 's' : ''}
      </div>
    )
  }
  // Nivel 3: modelo exacto + año de referencia más cercano
  if (v.hist_ref_anio && v.hist_ref_precio) {
    const anioVeh  = v.anio ?? v.hist_ref_anio
    const anioDiff = Math.abs(v.hist_ref_anio - anioVeh)
    const estimado = anioDiff > 0 ? estimarPorAnio(v.hist_ref_precio, v.hist_ref_anio, anioVeh) : null

    const diffs: string[] = []
    if (v.hist_ref_transmision && v.transmision &&
        v.hist_ref_transmision.toLowerCase() !== v.transmision.toLowerCase())
      diffs.push(`Trans: ${v.hist_ref_transmision} vs ${v.transmision}`)
    if (v.hist_ref_combustible && v.combustible &&
        v.hist_ref_combustible.toLowerCase() !== v.combustible.toLowerCase())
      diffs.push(`Comb: ${v.hist_ref_combustible} vs ${v.combustible}`)
    if (v.hist_ref_traccion && v.traccion &&
        v.hist_ref_traccion.toLowerCase() !== v.traccion.toLowerCase())
      diffs.push(`Trac: ${v.hist_ref_traccion} vs ${v.traccion}`)

    return (
      <div className="space-y-1">
        <div className="text-amber-600 text-xs font-medium">
          Ref. año {v.hist_ref_anio} · {fmt(v.hist_ref_precio)}
        </div>
        {diffs.map((d, i) => (
          <div key={i} className="text-xs text-amber-500 bg-amber-50 rounded px-1.5 py-0.5">⚠ {d}</div>
        ))}
        {estimado && anioDiff > 0 && (
          <div className="text-orange-600 text-xs font-medium">
            Est. año {anioVeh}: {fmt(estimado)}
          </div>
        )}
      </div>
    )
  }
  // Nivel 4: modelos similares (MACAN ≈ MACAN GTS ≈ MACAN S)
  if (v.hist_similar_precio && v.hist_similar_resumen) {
    const variantes = v.hist_similar_resumen.split(', ')
    return (
      <div className="space-y-1">
        <div className="text-amber-600 text-xs font-medium">
          Modelos similares · {v.hist_similar_cantidad} remate{(v.hist_similar_cantidad ?? 0) !== 1 ? 's' : ''}
        </div>
        <div className="space-y-0.5">
          {variantes.map((item, i) => (
            <div key={i} className="text-xs text-gray-500 font-mono">
              ${item}
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function VehiculoTable({ vehiculos, loading }: Props) {
  const [modalData, setModalData] = useState<{ images: string[]; alt: string } | null>(null)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent" />
        <span className="text-sm text-gray-400">Cargando vehículos...</span>
      </div>
    )
  }

  if (vehiculos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
        <span className="text-5xl">🔍</span>
        <span className="text-sm">No se encontraron vehículos con esos filtros.</span>
      </div>
    )
  }

  return (
    <>
    {modalData && (
      <ImagenModal
        images={modalData.images}
        alt={modalData.alt}
        onClose={() => setModalData(null)}
      />
    )}
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Empresa</th>
              <th className="px-3 py-3 text-left font-semibold">Vehículo</th>
              <th className="px-3 py-3 text-left font-semibold">Foto</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Condición</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Análisis de precio</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Valor est. venta</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Deudas</th>
              <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Fecha remate</th>
              <th className="px-3 py-3 text-left font-semibold">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vehiculos.map(v => {
              const fecha  = fmtFecha(v.fecha_remate)
              const cond   = COND_COLORS[v.estado_vehiculo ?? '']
              const images = [v.imagen_url, ...(v.imagenes ?? [])].filter(Boolean) as string[]
              return (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors">

                  {/* Empresa */}
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${EMPRESA_COLORS[v.empresa] ?? 'bg-gray-100 text-gray-600'}`}>
                      {v.empresa}
                    </span>
                  </td>

                  {/* Vehículo */}
                  <td className="px-3 py-3 min-w-[160px]">
                    <div className="font-bold text-gray-900 text-sm leading-tight">{v.marca}</div>
                    <div className="text-gray-500 text-xs mt-0.5 leading-snug">{v.modelo}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {v.anio && (
                        <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-1.5 py-0.5 rounded">
                          {v.anio}
                        </span>
                      )}
                      {v.patente && (
                        <span className="text-gray-400 text-xs font-mono bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                          {v.patente}
                        </span>
                      )}
                    </div>
                    {v.kilometraje != null && (
                      <div className="text-gray-400 text-xs mt-0.5">
                        {v.kilometraje.toLocaleString('es-CL')} km
                      </div>
                    )}
                    {v.transmision && (
                      <div className="text-gray-400 text-xs">{v.transmision}</div>
                    )}
                  </td>

                  {/* Foto */}
                  <td className="px-3 py-3">
                    {images.length > 0 ? (
                      <button
                        onClick={() => setModalData({ images, alt: `${v.marca} ${v.modelo}` })}
                        className="block group relative w-32 h-20 rounded-lg overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-zoom-in"
                      >
                        <img
                          src={images[0]}
                          alt={`${v.marca} ${v.modelo}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={e => { (e.target as HTMLImageElement).closest('button')!.style.display = 'none' }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium bg-black/50 px-2 py-0.5 rounded-full">
                            {images.length > 1 ? `🔍 +${images.length}` : '🔍 Ver'}
                          </span>
                        </div>
                      </button>
                    ) : (
                      <div className="w-32 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-3xl border border-gray-100">
                        🚗
                      </div>
                    )}
                  </td>

                  {/* Condición */}
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cond?.bg ?? 'bg-gray-100 text-gray-500'}`}>
                      {cond?.label ?? v.estado_vehiculo ?? '—'}
                    </span>
                  </td>

                  {/* Análisis de precio */}
                  <td className="px-3 py-3 min-w-[210px]">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400 whitespace-nowrap">Precio base</span>
                        <span className="font-semibold text-gray-700 whitespace-nowrap">{fmt(v.precio_base)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400 whitespace-nowrap">Prom. remates</span>
                        <span className={`font-semibold whitespace-nowrap ${v.precio_remate_promedio ? 'text-blue-600' : 'text-gray-300'}`}>
                          {fmt(v.precio_remate_promedio)}
                        </span>
                      </div>
                      {v.precio_remate_promedio
                        ? <HistoricoInfo v={v} />
                        : <span className="text-gray-300 italic">Sin historial en Karcal</span>
                      }
                    </div>
                  </td>

                  {/* Valor estimado de venta */}
                  <td className="px-3 py-3 min-w-[170px]">
                    {v.precio_mercado_min && v.precio_mercado_max ? (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400 whitespace-nowrap">Rango publicaciones</div>
                        <div className="font-bold text-purple-700">{fmt(v.precio_mercado_min)}</div>
                        <div className="text-purple-400 text-xs whitespace-nowrap">— {fmt(v.precio_mercado_max)}</div>
                        <div className="text-gray-400 text-xs whitespace-nowrap">
                          Chileautos · {v.precio_mercado_cantidad ?? '?'} pub.
                        </div>
                        {v.margen_porcentaje != null && (
                          <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            v.margen_porcentaje >= 40
                              ? 'bg-green-100 text-green-700'
                              : v.margen_porcentaje >= 20
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
                            {v.margen_porcentaje > 0 ? '↑' : '↓'} {Math.abs(v.margen_porcentaje)}% margen
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs italic">Sin datos</span>
                    )}
                  </td>

                  {/* Deudas / multas */}
                  <td className="px-3 py-3 min-w-[130px]">
                    {v.deuda_total ? (
                      <div className="space-y-0.5">
                        <div className="font-semibold text-red-600 text-xs whitespace-nowrap">
                          {fmt(v.deuda_total)}
                        </div>
                        {v.deuda_detalle && (
                          <div className="text-gray-400 text-xs leading-tight">{v.deuda_detalle}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Fecha remate */}
                  <td className="px-3 py-3 min-w-[110px]">
                    {typeof fecha === 'object' ? (
                      <div>
                        <div className="text-gray-700 font-medium text-xs whitespace-nowrap">{fecha.fecha}</div>
                        <div className="text-gray-400 text-xs whitespace-nowrap">{fecha.hora}</div>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Links */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1 min-w-[80px]">
                      {v.url_detalle && (
                        <a href={v.url_detalle} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded-lg transition-colors whitespace-nowrap">
                          Ver ficha →
                        </a>
                      )}
                      {v.url_cav && (
                        <a href={v.url_cav} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-lg transition-colors whitespace-nowrap">
                          📋 CAV
                        </a>
                      )}
                      {v.url_inspeccion && (
                        <a href={v.url_inspeccion} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-lg transition-colors whitespace-nowrap">
                          🔍 Insp.
                        </a>
                      )}
                    </div>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2.5 border-t bg-gray-50 text-xs text-gray-400">
        {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''} encontrado{vehiculos.length !== 1 ? 's' : ''}
      </div>
    </div>
    </>
  )
}
