/**
 * Script de carga histórica — scrapea TODAS las páginas de remates cerrados de Karcal.
 * Úsalo manualmente o en el workflow semanal.
 * Tiempo estimado: 15-25 minutos (11 páginas × varios remates × 15 vehículos).
 */
import { supabase }             from './supabase-client.js'
import { scrapeKarcalHistorico } from './karcal.js'

async function main() {
  console.log('============================================')
  console.log('   Remates Santiago — Carga Histórica       ')
  console.log(`   ${new Date().toLocaleString('es-CL')}`)
  console.log('============================================')

  const { data: empresas, error } = await supabase
    .from('empresas_remate')
    .select('id, nombre')
    .eq('activa', true)

  if (error || !empresas) {
    console.error('Error cargando empresas:', error?.message)
    process.exit(1)
  }

  const karcalId = empresas.find(e => e.nombre === 'Karcal')?.id ?? ''
  if (!karcalId) {
    console.error('No se encontró la empresa Karcal en la DB')
    process.exit(1)
  }

  console.log('[Histórico] Scrapeando TODAS las páginas de Karcal (puede tardar 20-30 min)...')
  await scrapeKarcalHistorico(karcalId, 11)

  console.log('\n✅ Carga histórica completada.')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
