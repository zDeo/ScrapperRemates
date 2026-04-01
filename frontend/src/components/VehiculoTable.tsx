import type { VehiculoAnalisis } from '../types'
import { AlertaBadge }   from './AlertaBadge'
import { PrecioAnalisis } from './PrecioAnalisis'

interface Props {
  vehiculos: VehiculoAnalisis[]
  loading: boolean
}

const EMPRESA_COLORS: Record<string, string> = {
  Karcal: 'bg-blue-50 text-blue-700',
  Reyco:  'bg-green-50 text-green-700',
  Zárate: 'bg-orange-50 text-orange-700',
  Macal:  'bg-purple-50 text-purple-700',
}

export function VehiculoTable({ vehiculos, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin h-9 w-9 border-4 border-brand-500 rounded-full border-t-transparent" />
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
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            {['Empresa','Vehículo','Año','Cond.','Análisis de precios','Margen','Fecha remate','Link'].map(h => (
              <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {vehiculos.map(v => (
            <tr key={v.id} className="hover:bg-blue-50/30 transition-colors">
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${EMPRESA_COLORS[v.empresa] ?? 'bg-gray-100 text-gray-600'}`}>
                  {v.empresa}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-gray-800 leading-tight">{v.marca}</div>
                <div className="text-gray-400 text-xs mt-0.5 leading-tight">{v.modelo}</div>
              </td>
              <td className="px-4 py-3 text-gray-600 font-medium">{v.anio ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                  {v.estado_vehiculo ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <PrecioAnalisis v={v} />
              </td>
              <td className="px-4 py-3">
                <AlertaBadge margen={v.margen_porcentaje} />
              </td>
              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                {v.fecha_remate
                  ? new Date(v.fecha_remate).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' })
                  : '—'}
              </td>
              <td className="px-4 py-3">
                {v.url_detalle ? (
                  <a
                    href={v.url_detalle}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-800 hover:underline text-xs font-medium"
                  >
                    Ver →
                  </a>
                ) : '—'}
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
