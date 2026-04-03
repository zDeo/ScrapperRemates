import type { VehiculoAnalisis } from '../types'

interface Props {
  vehiculos: VehiculoAnalisis[]
  loading: boolean
}

const EMPRESA_COLORS: Record<string, string> = {
  Karcal: 'bg-blue-50 text-blue-700 border border-blue-100',
  Zárate: 'bg-orange-50 text-orange-700 border border-orange-100',
  Reyco:  'bg-green-50 text-green-700 border border-green-100',
  Macal:  'bg-purple-50 text-purple-700 border border-purple-100',
}

const COND_COLORS: Record<string, string> = {
  chatarra:         'bg-red-50 text-red-600',
  rodante:          'bg-green-50 text-green-600',
  encendio:         'bg-yellow-50 text-yellow-700',
  encendio_rodante: 'bg-emerald-50 text-emerald-700',
  siniestrado:      'bg-orange-50 text-orange-600',
}

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString('es-CL')}` : '—'

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function HistoricoLabel({ v }: { v: VehiculoAnalisis }) {
  if (v.hist_exacto_precio && v.hist_exacto_cantidad) {
    return (
      <span className="text-gray-400 text-xs">
        Año {v.anio} · {v.hist_exacto_cantidad} remate{v.hist_exacto_cantidad !== 1 ? 's' : ''}
      </span>
    )
  }
  if (v.hist_rango_precio && v.hist_rango_cantidad) {
    return (
      <span className="text-gray-400 text-xs">
        ±1 año · {v.hist_rango_cantidad} remate{v.hist_rango_cantidad !== 1 ? 's' : ''}
      </span>
    )
  }
  if (v.hist_ref_anio && v.hist_ref_precio) {
    return (
      <span className="text-amber-500 text-xs">
        Ref. año {v.hist_ref_anio}
      </span>
    )
  }
  return <span className="text-gray-300 text-xs">Sin historial</span>
}

export function VehiculoTable({ vehiculos, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin h-9 w-9 border-4 border-blue-500 rounded-full border-t-transparent" />
        <span className="text-sm text-gray-400">Cargando vehículos...</span>
      </div>
    )
  }

  if (vehiculos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
        <span className="text-4xl">🔍</span>
        <span className="text-sm">No se encontraron vehículos con esos filtros.</span>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-semibold">Empresa</th>
            <th className="px-4 py-3 text-left font-semibold">Vehículo</th>
            <th className="px-4 py-3 text-left font-semibold">Foto</th>
            <th className="px-4 py-3 text-left font-semibold">Año</th>
            <th className="px-4 py-3 text-left font-semibold">Condición</th>
            <th className="px-4 py-3 text-left font-semibold">Análisis de precio</th>
            <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Precio est. venta</th>
            <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Fecha remate</th>
            <th className="px-4 py-3 text-left font-semibold">Links</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {vehiculos.map(v => (
            <tr key={v.id} className="hover:bg-blue-50/20 transition-colors">

              {/* Empresa */}
              <td className="px-4 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${EMPRESA_COLORS[v.empresa] ?? 'bg-gray-100 text-gray-600'}`}>
                  {v.empresa}
                </span>
              </td>

              {/* Vehículo */}
              <td className="px-4 py-4 min-w-[160px]">
                <div className="font-bold text-gray-900 leading-tight">{v.marca}</div>
                <div className="text-gray-500 text-xs mt-0.5">{v.modelo}</div>
                {v.patente && (
                  <div className="text-gray-400 text-xs mt-1 font-mono">{v.patente}</div>
                )}
                {v.kilometraje && (
                  <div className="text-gray-400 text-xs">{v.kilometraje.toLocaleString('es-CL')} km</div>
                )}
              </td>

              {/* Foto */}
              <td className="px-4 py-4">
                {v.imagen_url ? (
                  <img
                    src={v.imagen_url}
                    alt={`${v.marca} ${v.modelo}`}
                    className="w-24 h-16 object-cover rounded-lg border border-gray-100"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-24 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">🚗</div>
                )}
              </td>

              {/* Año */}
              <td className="px-4 py-4 text-gray-700 font-semibold">
                {v.anio ?? '—'}
              </td>

              {/* Condición */}
              <td className="px-4 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${COND_COLORS[v.estado_vehiculo ?? ''] ?? 'bg-gray-50 text-gray-500'}`}>
                  {v.estado_vehiculo ?? '—'}
                </span>
              </td>

              {/* Análisis de precio */}
              <td className="px-4 py-4 min-w-[200px]">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400">Precio base</span>
                    <span className="font-medium text-gray-700">{fmt(v.precio_base)}</span>
                  </div>
                  <div className="flex justify-between gap-4 items-center">
                    <span className="text-gray-400">Prom. remates</span>
                    <span className={`font-medium ${v.precio_remate_promedio ? 'text-blue-600' : 'text-gray-300'}`}>
                      {fmt(v.precio_remate_promedio)}
                    </span>
                  </div>
                  {v.precio_remate_promedio && (
                    <div className="flex justify-between gap-4 items-center">
                      <HistoricoLabel v={v} />
                    </div>
                  )}
                  {v.precio_remate_promedio && (
                    <div className="flex justify-between gap-4 pt-1 border-t border-gray-100">
                      <span className="text-gray-400 font-medium">✅ Comprar a</span>
                      <span className="font-bold text-green-700">{fmt(v.precio_sugerido_compra)}</span>
                    </div>
                  )}
                </div>
              </td>

              {/* Precio estimado de venta (mercado) */}
              <td className="px-4 py-4 min-w-[170px]">
                {v.precio_mercado_min && v.precio_mercado_max ? (
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-purple-700 text-sm">
                      {fmt(v.precio_mercado_min)}
                    </div>
                    <div className="text-purple-400 text-xs">
                      — {fmt(v.precio_mercado_max)}
                    </div>
                    <div className="text-gray-400">Chileautos · año ±1 · km ±15k</div>
                    {v.margen_porcentaje != null && (
                      <div className={`font-semibold ${v.margen_porcentaje >= 40 ? 'text-green-600' : v.margen_porcentaje >= 20 ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {v.margen_porcentaje > 0 ? '+' : ''}{v.margen_porcentaje}% margen
                      </div>
                    )}
                  </div>
                ) : v.precio_mercado ? (
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-purple-700 text-sm">{fmt(v.precio_mercado)}</div>
                    <div className="text-gray-400">Chileautos · año ±1</div>
                    {v.margen_porcentaje != null && (
                      <div className={`font-semibold ${v.margen_porcentaje >= 40 ? 'text-green-600' : v.margen_porcentaje >= 20 ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {v.margen_porcentaje > 0 ? '+' : ''}{v.margen_porcentaje}% margen
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-300 text-xs">Sin datos</span>
                )}
              </td>

              {/* Fecha remate */}
              <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">
                {fmtFecha(v.fecha_remate)}
              </td>

              {/* Links */}
              <td className="px-4 py-4">
                <div className="flex flex-col gap-1">
                  {v.url_detalle && (
                    <a href={v.url_detalle} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs font-medium">
                      Ver ficha →
                    </a>
                  )}
                  {v.url_cav && (
                    <a href={v.url_cav} target="_blank" rel="noopener noreferrer"
                      className="text-purple-600 hover:underline text-xs">
                      📋 CAV
                    </a>
                  )}
                  {v.url_inspeccion && (
                    <a href={v.url_inspeccion} target="_blank" rel="noopener noreferrer"
                      className="text-gray-500 hover:underline text-xs">
                      🔍 Inspección
                    </a>
                  )}
                </div>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400">
        {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
