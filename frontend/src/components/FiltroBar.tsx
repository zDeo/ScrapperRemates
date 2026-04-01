import type { Filtros } from '../types'

interface Props {
  filtros: Filtros
  onChange: (f: Filtros) => void
}

const EMPRESAS = ['', 'Karcal', 'Reyco', 'Zárate', 'Macal']

export function FiltroBar({ filtros, onChange }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    onChange({ ...filtros, [k]: v })

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-end">
      {/* Empresa */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Empresa</label>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={filtros.empresa}
          onChange={e => set('empresa', e.target.value)}
        >
          {EMPRESAS.map(e => <option key={e} value={e}>{e || 'Todas'}</option>)}
        </select>
      </div>

      {/* Marca */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Marca</label>
        <input
          type="text"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="ej: TOYOTA"
          value={filtros.marca}
          onChange={e => set('marca', e.target.value.toUpperCase())}
        />
      </div>

      {/* Modelo */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Modelo</label>
        <input
          type="text"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="ej: COROLLA"
          value={filtros.modelo}
          onChange={e => set('modelo', e.target.value.toUpperCase())}
        />
      </div>

      {/* Año rango */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Año</label>
        <div className="flex gap-1 items-center">
          <input
            type="number" min={2000} max={2030}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Desde"
            value={filtros.anioMin ?? ''}
            onChange={e => set('anioMin', e.target.value ? parseInt(e.target.value) : null)}
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="number" min={2000} max={2030}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Hasta"
            value={filtros.anioMax ?? ''}
            onChange={e => set('anioMax', e.target.value ? parseInt(e.target.value) : null)}
          />
        </div>
      </div>

      {/* Solo con margen */}
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
        <input
          type="checkbox"
          className="w-4 h-4 accent-brand-600 cursor-pointer"
          checked={filtros.soloConMargen}
          onChange={e => set('soloConMargen', e.target.checked)}
        />
        Solo margen &gt;20%
      </label>

      {/* Limpiar */}
      <button
        className="ml-auto px-4 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors pb-2"
        onClick={() => onChange({ empresa: '', marca: '', modelo: '', anioMin: null, anioMax: null, soloConMargen: false })}
      >
        Limpiar
      </button>
    </div>
  )
}
