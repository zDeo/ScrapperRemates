import type { VehiculoAnalisis } from '../types'

interface Props { v: VehiculoAnalisis }

function fmt(n: number | null): string {
  if (n === null || n === 0) return '—'
  return `$${n.toLocaleString('es-CL')}`
}

export function PrecioAnalisis({ v }: Props) {
  return (
    <div className="text-xs space-y-1 min-w-[170px]">
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Precio base</span>
        <span className="font-medium text-gray-700">{fmt(v.precio_base)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Prom. remates</span>
        <span className="font-medium text-brand-600">{fmt(v.precio_remate_promedio)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-400">Mercado</span>
        <span className="font-medium text-purple-600">{fmt(v.precio_mercado)}</span>
      </div>
      <div className="border-t border-gray-100 pt-1 flex justify-between gap-3">
        <span className="text-gray-600 font-semibold">✅ Comprar a</span>
        <span className="font-bold text-green-600">{fmt(v.precio_sugerido_compra)}</span>
      </div>
    </div>
  )
}
