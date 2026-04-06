import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { VehiculoDetallePage } from './pages/VehiculoDetallePage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/vehiculo/:id" element={<VehiculoDetallePage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
