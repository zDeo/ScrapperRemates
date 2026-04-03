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

  const totalConMargen     = data.filter(v => (v.margen_porcentaje ?? 0) > 20).length
  const totalConMargenAlto = data.filter(v => (v.margen_porcentaje ?? 0) >= 40).length
  const empresasActivas    = [...new Set(data.map(v => v.empresa))].length
  const rematesProximos    = [...new Set(
    data.filter(v => v.estado_remate === 'proximo').map(v => v.fecha_remate)
  )].filter(Boolean).length

  const kpis = [
    { label: 'Vehículos',       value: data.length,         color: 'text-blue-700',   bg: 'bg-blue-50',   icon: '🚗' },
    { label: 'Margen >20%',     value: totalConMargen,      color: 'text-yellow-700', bg: 'bg-yellow-50', icon: '📈' },
    { label: 'Margen >40%',     value: totalConMargenAlto,  color: 'text-green-700',  bg: 'bg-green-50',  icon: '🔥' },
    { label: 'Empresas',        value: empresasActivas,     color: 'text-purple-700', bg: 'bg-purple-50', icon: '🏢' },
    { label: 'Remates próximos',value: rematesProximos,     color: 'text-orange-700', bg: 'bg-orange-50', icon: '📅' },
  ]

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white rounded-xl p-2 text-xl">🚗</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Remates Santiago</h1>
              <p className="text-xs text-gray-400">Tracker de vehículos en remate</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalConMargenAlto > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 text-sm font-semibold px-3 py-1.5 rounded-full">
                🔥 {totalConMargenAlto} con margen &gt;40%
              </span>
            )}
            {totalConMargen > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 text-sm font-medium px-3 py-1.5 rounded-full">
                📈 {totalConMargen} con margen &gt;20%
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpis.map(kpi => (
            <div key={kpi.label} className={`${kpi.bg} rounded-xl border border-white shadow-sm p-4 flex items-center gap-3`}>
              <span className="text-2xl">{kpi.icon}</span>
              <div>
                <div className={`text-2xl font-bold leading-tight ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-gray-500 leading-tight mt-0.5">{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <FiltroBar filtros={filtros} onChange={setFiltros} />

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-5 py-3 text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>Error al cargar datos: {error}</span>
          </div>
        )}

        {/* Tabla */}
        <VehiculoTable vehiculos={data} loading={loading} />
      </main>
    </div>
  )
}
