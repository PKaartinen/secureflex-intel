import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './auth'
import { DossierProvider } from './lib/dossier-context'
import Layout from './components/Layout'
import DossierPanel from './components/DossierPanel'
import Login from './pages/Login'
import MissionControl from './pages/MissionControl'
import MarketIntelligence from './pages/MarketIntelligence'
import IntelligenceMap from './pages/IntelligenceMap'
import TenderRadar from './pages/TenderRadar'
import PipelineManager from './pages/PipelineManager'
import SignalFeed from './pages/SignalFeed'
import System from './pages/System'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function ProtectedRoutes() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <DossierProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Primary routes */}
          <Route index element={<MissionControl />} />
          <Route path="map" element={<IntelligenceMap />} />
          <Route path="tenders" element={<TenderRadar />} />
          <Route path="market" element={<MarketIntelligence />} />
          <Route path="signals" element={<SignalFeed />} />
          <Route path="pipeline" element={<PipelineManager />} />
          {/* Admin */}
          <Route path="system" element={<System />} />
          {/* Redirects for removed/renamed routes */}
          <Route path="prospects" element={<Navigate to="/market" replace />} />
          <Route path="competitors" element={<Navigate to="/market" replace />} />
          <Route path="analytics" element={<Navigate to="/" replace />} />
          <Route path="briefs" element={<Navigate to="/" replace />} />
          <Route path="scans" element={<Navigate to="/system" replace />} />
          <Route path="settings" element={<Navigate to="/system" replace />} />
          <Route path="command" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <DossierPanel />
    </DossierProvider>
  )
}

function LoginRoute() {
  const { user } = useAuth()
  if (user) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
