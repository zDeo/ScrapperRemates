import { describe, it, expect } from 'vitest'
import { filtrarVehiculosAlerta, formatearEmailHtml } from '../src/alertas.js'
import type { VehiculoAlerta } from '../src/alertas.js'

const MOCK: VehiculoAlerta[] = [
  { id:'1', marca:'TOYOTA',     modelo:'COROLLA', anio:2020, precio_base:1_000_000, precio_mercado:1_500_000, margen_porcentaje:25, margen_estimado_clp:500_000, precio_sugerido_compra:800_000, empresa:'Karcal', fecha_remate:null, url_detalle:'https://karcal.cl/1' },
  { id:'2', marca:'KIA',        modelo:'RIO',     anio:2019, precio_base:800_000,   precio_mercado:880_000,   margen_porcentaje:10, margen_estimado_clp:80_000,  precio_sugerido_compra:640_000, empresa:'Reyco',  fecha_remate:null, url_detalle:null },
  { id:'3', marca:'FORD',       modelo:'F-150',   anio:2018, precio_base:3_000_000, precio_mercado:5_000_000, margen_porcentaje:35, margen_estimado_clp:2_000_000, precio_sugerido_compra:2_400_000, empresa:'Zárate', fecha_remate:null, url_detalle:null },
  { id:'4', marca:'FIAT',       modelo:'UNO',     anio:2015, precio_base:500_000,   precio_mercado:null,      margen_porcentaje:null, margen_estimado_clp:null, precio_sugerido_compra:400_000, empresa:'Macal', fecha_remate:null, url_detalle:null },
]

describe('filtrarVehiculosAlerta', () => {
  it('retorna solo vehículos con margen > umbral', () => {
    const r = filtrarVehiculosAlerta(MOCK, 20)
    expect(r).toHaveLength(2)
    expect(r.map(v => v.marca)).toEqual(['TOYOTA', 'FORD'])
  })

  it('retorna vacío si nadie supera el umbral', () => {
    expect(filtrarVehiculosAlerta(MOCK, 50)).toHaveLength(0)
  })

  it('excluye vehículos con margen null', () => {
    const r = filtrarVehiculosAlerta(MOCK, 5)
    expect(r.some(v => v.margen_porcentaje === null)).toBe(false)
  })
})

describe('formatearEmailHtml', () => {
  it('incluye los datos de cada vehículo en el HTML', () => {
    const html = formatearEmailHtml([MOCK[0], MOCK[2]])
    expect(html).toContain('TOYOTA')
    expect(html).toContain('COROLLA')
    expect(html).toContain('25%')
    expect(html).toContain('FORD')
    expect(html).toContain('35%')
  })

  it('incluye link si hay url_detalle', () => {
    const html = formatearEmailHtml([MOCK[0]])
    expect(html).toContain('href="https://karcal.cl/1"')
  })

  it('muestra — cuando precio es null', () => {
    const html = formatearEmailHtml([MOCK[3]])
    expect(html).toContain('—')
  })
})
