import { scrapeChileautos } from './chileautos.js'

async function main() {
  console.log('====================================')
  console.log('  Chileautos — Scraper Precios Init ')
  console.log(`  ${new Date().toLocaleString('es-CL')}`)
  console.log('====================================')

  await scrapeChileautos()

  console.log('\n✅ Proceso completado.')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
