import type { Filtros } from '../types'

interface Props {
  filtros: Filtros
  onChange: (f: Filtros) => void
}

const EMPRESAS = ['', 'Karcal', 'Zárate']

const FILTROS_VACIO: Filtros = {
  empresa: '', marca: '', modelo: '',
  anioMin: null, anioMax: null,
  promedioMin: null, promedioMax: null,
}

const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'text-xs font-semibold text-gray-400 uppercase tracking-wide'

export function FiltroBar({ filtros, onChange }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    onChange({ ...filtros, [k]: v })

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-4 items-end">

      {/* Empresa */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Empresa</label>
        <select
          className={inputCls}
          value={filtros.empresa}
          onChange={e => set('empresa', e.target.value)}
        >
          {EMPRESAS.map(e => <option key={e} value={e}>{e || 'Todas'}</option>)}
        </select>
      </div>

      {/* Marca */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Marca</label>
        <input
          type="text"
          className={`${inputCls} w-32`}
          placeholder="ej: TOYOTA"
          value={filtros.marca}
          onChange={e => set('marca', e.target.value.toUpperCase())}
        />
      </div>

      {/* Modelo */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Modelo</label>
        <input
          type="text"
          className={`${inputCls} w-36`}
          placeholder="ej: COROLLA"
          value={filtros.modelo}
          onChange={e => set('modelo', e.target.value.toUpperCase())}
        />
      </div>

      {/* Año */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Año</label>
        <div className="flex gap-1 items-center">
          <input
            type="number" min={2000} max={2030}
            className={`${inputCls} w-20`}
            placeholder="Desde"
            value={filtros.anioMin ?? ''}
            onChange={e => set('anioMin', e.target.value ? parseInt(e.target.value) : null)}
          />
          <span className="text-gray-300 text-sm">—</span>
          <input
            type="number" min={2000} max={2030}
            className={`${inputCls} w-20`}
            placeholder="Hasta"
            value={filtros.anioMax ?? ''}
            onChange={e => set('anioMax', e.target.value ? parseInt(e.target.value) : null)}
          />
        </div>
      </div>

      {/* Promedio remates pasados */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Prom. remates ($)</label>
        <div className="flex gap-1 items-center">
          <input
            type="number" min={0} step={100000}
            className={`${inputCls} w-28`}
            placeholder="Desde"
            value={filtros.promedioMin ?? ''}
            onChange={e => set('promedioMin', e.target.value ? parseInt(e.target.value) : null)}
          />
          <span className="text-gray-300 text-sm">—</span>
          <input
            type="number" min={0} step={100000}
            className={`${inputCls} w-28`}
            placeholder="Hasta"
            value={filtros.promedioMax ?? ''}
            onChange={e => set('promedioMax', e.target.value ? parseInt(e.target.value) : null)}
          />
        </div>
      </div>

      {/* Limpiar */}
      <button
        className="ml-auto px-4 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        onClick={() => onChange(FILTROS_VACIO)}
      >
        Limpiar
      </button>
    </div>
  )
}
