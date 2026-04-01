import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../supabase-client'

export function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🚗</div>
          <h1 className="text-2xl font-bold text-gray-900">Remates Santiago</h1>
          <p className="text-gray-500 mt-1 text-sm">Tracker de vehículos en remate</p>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand:       '#1d4ed8',
                  brandAccent: '#1e40af',
                },
                borderWidths: { buttonBorderWidth: '1px', inputBorderWidth: '1px' },
                radii:        { borderRadiusButton: '8px', inputBorderRadius: '8px' },
              },
            },
          }}
          providers={[]}
          localization={{
            variables: {
              sign_in: {
                email_label:     'Email',
                password_label:  'Contraseña',
                button_label:    'Ingresar',
                link_text:       '¿Ya tienes cuenta? Ingresar',
              },
              forgotten_password: {
                link_text:    '¿Olvidaste tu contraseña?',
                button_label: 'Enviar enlace de recuperación',
              },
            },
          }}
        />
      </div>
    </div>
  )
}
