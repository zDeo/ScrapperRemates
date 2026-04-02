import { useEffect, useState } from 'react'
import { supabase } from '../supabase-client'
import type { VehiculoAnalisis, Filtros } from '../types'

export function useVehiculos(filtros: Filtros) {
  const [data, setData]       = useState<VehiculoAnalisis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const hoy = new Date().toISOString()

    let query = supabase
      .from('analisis_vehiculos')
      .select('*')
      .eq('estado_remate', 'proximo')        // solo remates próximos
      .gte('fecha_remate', hoy)             // fecha futura o de hoy
      .order('fecha_remate', { ascending: true })
      .limit(300)

    if (filtros.empresa)      query = query.eq('empresa', filtros.empresa)
    if (filtros.marca)        query = query.ilike('marca', `%${filtros.marca}%`)
    if (filtros.modelo)       query = query.ilike('modelo', `%${filtros.modelo}%`)
    if (filtros.anioMin)      query = query.gte('anio', filtros.anioMin)
    if (filtros.anioMax)      query = query.lte('anio', filtros.anioMax)
    if (filtros.promedioMin)  query = query.gte('precio_remate_promedio', filtros.promedioMin)
    if (filtros.promedioMax)  query = query.lte('precio_remate_promedio', filtros.promedioMax)

    query.then(({ data: rows, error: err }) => {
      setData(rows ?? [])
      setError(err?.message ?? null)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)])

  return { data, loading, error }
}
