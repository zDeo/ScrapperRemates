import { Resend } from '@resend/node'
import { supabase } from './supabase-client.js'

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface VehiculoAlerta {
  id: string
  marca: string
  modelo: string
  anio: number | null
  precio_base: number | null
  precio_sugerido_compra: number | null
  precio_mercado: number | null
  margen_porcentaje: number | null
  margen_estimado_clp: number | null
  empresa: string
  fecha_remate: string | null
  url_detalle: string | null
}

export function filtrarVehiculosAlerta(
  vehiculos: VehiculoAlerta[],
  umbral: number,
): VehiculoAlerta[] {
  return vehiculos.filter(v => v.margen_porcentaje !== null && v.margen_porcentaje > umbral)
}

export function formatearEmailHtml(vehiculos: VehiculoAlerta[]): string {
  const fmt = (n: number | null) =>
    n !== null ? `$${n.toLocaleString('es-CL')}` : '—'

  const filas = vehiculos
    .map(v => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#1d4ed8">${v.empresa}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">
          <strong>${v.marca} ${v.modelo}</strong><br>
          <span style="color:#6b7280;font-size:12px">${v.anio ?? '—'}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#374151">${fmt(v.precio_base)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#7c3aed">${fmt(v.precio_mercado)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">
          <span style="background:#dcfce7;color:#16a34a;padding:3px 8px;border-radius:999px;font-weight:700;font-size:13px">
            📈 ${v.margen_porcentaje}%
          </span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#16a34a;font-weight:700">${fmt(v.precio_sugerido_compra)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">
          ${v.url_detalle
            ? `<a href="${v.url_detalle}" style="color:#2563eb;text-decoration:none">Ver →</a>`
            : '—'}
        </td>
      </tr>`)
    .join('')

  return `
    <!DOCTYPE html>
    <html lang="es">
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;margin:0;padding:0;background:#f9fafb">
      <div style="max-width:900px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,.08)">
        <div style="background:linear-gradient(135deg,#1d4ed8,#1e40af);padding:28px 32px;color:#fff">
          <h1 style="margin:0;font-size:22px">🚗 Remates Santiago</h1>
          <p style="margin:6px 0 0;opacity:.85;font-size:14px">
            ${vehiculos.length} vehículo${vehiculos.length > 1 ? 's' : ''} con margen &gt; 20% — ${new Date().toLocaleDateString('es-CL', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>
        <div style="padding:24px 32px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr style="background:#f8fafc;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
                <th style="padding:10px 12px;text-align:left;font-weight:600">Empresa</th>
                <th style="padding:10px 12px;text-align:left;font-weight:600">Vehículo</th>
                <th style="padding:10px 12px;text-align:left;font-weight:600">Precio base</th>
                <th style="padding:10px 12px;text-align:left;font-weight:600">Mercado</th>
                <th style="padding:10px 12px;text-align:left;font-weight:600">Margen</th>
                <th style="padding:10px 12px;text-align:left;font-weight:600">Comprar a</th>
                <th style="padding:10px 12px;text-align:left;font-weight:600">Link</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #f0f0f0;padding-top:16px">
            Generado automáticamente por Remates Santiago Tracker ·
            El precio "Comprar a" es el 80% del promedio histórico de remates.
          </p>
        </div>
      </div>
    </body>
    </html>`
}

export async function enviarAlertasEmail(): Promise<void> {
  const emailDestino = process.env.ALERT_EMAIL
  const emailFrom    = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  if (!emailDestino) {
    console.warn('[Alertas] ALERT_EMAIL no configurado, saltando...')
    return
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[Alertas] RESEND_API_KEY no configurado, saltando...')
    return
  }

  const { data: vehiculos, error } = await supabase
    .from('analisis_vehiculos')
    .select('*')
    .eq('estado_remate', 'proximo')
    .not('margen_porcentaje', 'is', null)
    .gt('margen_porcentaje', 20)
    .order('margen_porcentaje', { ascending: false })
    .limit(50)

  if (error) { console.error('[Alertas] Error query:', error.message); return }

  const lista = filtrarVehiculosAlerta((vehiculos ?? []) as VehiculoAlerta[], 20)

  if (lista.length === 0) {
    console.log('[Alertas] No hay vehículos con margen > 20% hoy')
    return
  }

  const html = formatearEmailHtml(lista)

  const { error: emailErr } = await resend.emails.send({
    from:    emailFrom,
    to:      [emailDestino],
    subject: `🚗 ${lista.length} vehículo${lista.length > 1 ? 's' : ''} con margen >20% — ${new Date().toLocaleDateString('es-CL')}`,
    html,
  })

  if (emailErr) console.error('[Alertas] Error enviando email:', JSON.stringify(emailErr))
  else console.log(`[Alertas] ✓ Email enviado con ${lista.length} vehículos a ${emailDestino}`)
}
