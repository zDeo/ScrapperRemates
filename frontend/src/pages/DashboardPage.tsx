import { useState } from 'react'
import { useVehiculos }    from '../hooks/useVehiculos'
import { FiltroBar }       from '../components/FiltroBar'
import { VehiculoTable }   from '../components/VehiculoTable'
import type { Filtros }    from '../types'

const FILTROS_INIT: Filtros = {
  empresa: '', marca: '', modelo: '',
  anioMin: null, anioMax: null,
  promedioMin: null, promedioMax: null,
}

export function DashboardPage() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INIT)
  const { data, loading, error } = useVehiculos(filtros)

  const totalConMargen    = data.filter(v => (v.margen_porcentaje ?? 0) > 20).length
  const totalConMargenAlto = data.filter(v => (v.margen_porcentaje ?? 0) >= 40).length
  const empresasActivas   = [...new Set(data.map(v => v.empresa))].length
  const rematesProximos   = [...new Set(
    data.filter(v => v.estado_remate === 'proximo').map(v => v.fecha_remate)
  )].filter(Boolean).length

  const kpis = [
    { label: 'Vehículos totales',  value: data.length,         color: 'text-brand-700',  icon: '🚗' },
    { label: 'Margen >20%',        value: totalConMargen,      color: 'text-yellow-600', icon: '📈' },
    { label: 'Margen >40% 🔥',     value: totalConMargenAlto,  color: 'text-green-600',  icon: '🔥' },
    { label: 'Empresas activas',   value: empresasActivas,     color: 'text-purple-600', icon: '🏢' },
    { label: 'Remates próximos',   value: rematesProximos,     color: 'text-orange-600', icon: '📅' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚗</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Remates Santiago</h1>
              <p className="text-xs text-gray-400">Tracker de vehículos en remate</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalConMargen > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 text-sm font-medium px-3 py-1.5 rounded-full">
                📈 {totalConMargen} con margen &gt;20%
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-6 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">{kpi.icon}</span>
                <span className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</span>
              </div>
              <div className="text-xs text-gray-400 leading-tight">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <FiltroBar filtros={filtros} onChange={setFiltros} />

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            ⚠️ Error al cargar datos: {error}
          </div>
        )}

        {/* Tabla */}
        <VehiculoTable vehiculos={data} loading={loading} />
      </main>
    </div>
  )
}
