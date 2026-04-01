import { supabase }          from './supabase-client.js'
import { scrapeKarcal }      from './karcal.js'
import { scrapeReyco }       from './reyco.js'
import { scrapeZarate }      from './zarate.js'
import { scrapeMacal }       from './macal.js'
import { enviarAlertasEmail } from './alertas.js'

async function main() {
  console.log('====================================')
  console.log('   Remates Santiago — Scraper Init  ')
  console.log(`   ${new Date().toLocaleString('es-CL')}`)
  console.log('====================================')

  const { data: empresas, error } = await supabase
    .from('empresas_remate')
    .select('id, nombre')
    .eq('activa', true)

  if (error || !empresas) {
    console.error('Error cargando empresas:', error?.message)
    process.exit(1)
  }

  const getId = (nombre: string) =>
    empresas.find(e => e.nombre === nombre)?.id ?? ''

  // Correr todos los scrapers en paralelo
  const resultados = await Promise.allSettled([
    scrapeKarcal(getId('Karcal')),
    scrapeReyco(getId('Reyco')),
    scrapeZarate(getId('Zárate')),
    scrapeMacal(getId('Macal')),
  ])

  resultados.forEach((r, i) => {
    const nombres = ['Karcal', 'Reyco', 'Zárate', 'Macal']
    if (r.status === 'rejected') {
      console.error(`[${nombres[i]}] FALLÓ:`, r.reason)
    }
  })

  console.log('\n[Alertas] Verificando vehículos con margen > 20%...')
  await enviarAlertasEmail()

  console.log('\n✅ Proceso completado.')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
