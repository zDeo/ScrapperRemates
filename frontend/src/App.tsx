import { useSession }      from './hooks/useSession'
import { LoginPage }       from './pages/LoginPage'
import { DashboardPage }   from './pages/DashboardPage'

function App() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-9 w-9 border-4 border-brand-500 rounded-full border-t-transparent" />
          <span className="text-sm text-gray-400">Cargando...</span>
        </div>
      </div>
    )
  }

  return session ? <DashboardPage /> : <LoginPage />
}

export default App
