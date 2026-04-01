interface Props { margen: number | null }

export function AlertaBadge({ margen }: Props) {
  if (margen === null) {
    return <span className="text-gray-300 text-xs">Sin datos</span>
  }
  if (margen >= 40) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
        🔥 {margen}%
      </span>
    )
  }
  if (margen >= 20) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">
        📈 {margen}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-400 border border-red-100">
      📉 {margen}%
    </span>
  )
}
