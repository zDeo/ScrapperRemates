import { describe, it, expect } from 'vitest'
import { parseKarcalPrecio, parseKarcalVehiculo } from '../src/karcal.js'

describe('parseKarcalPrecio', () => {
  it('convierte $1.300.000 → 1300000', () => {
    expect(parseKarcalPrecio('$1.300.000')).toBe(1300000)
  })
  it('convierte $10.000.000 → 10000000', () => {
    expect(parseKarcalPrecio('$10.000.000')).toBe(10000000)
  })
  it('retorna null para string vacío', () => {
    expect(parseKarcalPrecio('')).toBeNull()
  })
  it('retorna null para texto sin número', () => {
    expect(parseKarcalPrecio('precio a consultar')).toBeNull()
  })
})

describe('parseKarcalVehiculo', () => {
  it('extrae lote_id desde el href', () => {
    const html = `
      <div>
        <a href="/Detalle/Ficha/101427/11">
          <div class="marca">MITSUBISHI</div>
          <div class="modelo">LANCER R GT 2.0</div>
          <div class="anio">2012</div>
          <div class="precio">$1.300.000</div>
        </a>
      </div>`
    const v = parseKarcalVehiculo(html, 'remate-uuid-test')
    expect(v).not.toBeNull()
    expect(v?.lote_id).toBe('101427')
    expect(v?.marca).toBe('MITSUBISHI')
    expect(v?.modelo).toBe('LANCER R GT 2.0')
    expect(v?.anio).toBe(2012)
    expect(v?.precio_base).toBe(1300000)
    expect(v?.remate_id).toBe('remate-uuid-test')
  })

  it('retorna null si no hay href con /Detalle/Ficha/', () => {
    const html = `<div><a href="/otra-pagina">texto</a></div>`
    expect(parseKarcalVehiculo(html, 'uuid')).toBeNull()
  })
})
