import { scrapeChileautos } from './chileautos.js'
import { scrapeMercadoLibre } from './mercadolibre.js'

async function main() {
  console.log('====================================')
  console.log('  Scraper Precios Mercado           ')
  console.log(`  ${new Date().toLocaleString('es-CL')}`)
  console.log('====================================')

  // MercadoLibre primero — API pura, sin browser, sin bot detection
  console.log('\n── MercadoLibre ─────────────────────')
  await scrapeMercadoLibre()

  // Chileautos segundo — browser headless, más lento
  console.log('\n── Chileautos ───────────────────────')
  await scrapeChileautos()

  console.log('\n✅ Proceso completado.')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
