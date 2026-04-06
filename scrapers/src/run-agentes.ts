import { correrAgentesAnalisis } from './agente-analisis.js'

async function main() {
  console.log('====================================')
  console.log('  Agentes IA — Análisis Vehículos   ')
  console.log(`  ${new Date().toLocaleString('es-CL')}`)
  console.log('====================================')

  await correrAgentesAnalisis()

  console.log('\n✅ Proceso completado.')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
