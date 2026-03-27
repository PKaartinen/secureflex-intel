import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import CommandCenter from './pages/CommandCenter'
import IntelligenceMap from './pages/IntelligenceMap'
import TenderRadar from './pages/TenderRadar'
import PipelineManager from './pages/PipelineManager'
import ProspectExplorer from './pages/ProspectExplorer'
import CompetitorWatch from './pages/CompetitorWatch'
import SignalFeed from './pages/SignalFeed'
import ResearchBriefs from './pages/ResearchBriefs'
import Analytics from './pages/Analytics'
import ScanControl from './pages/ScanControl'
import Settings from './pages/Settings'

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
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<CommandCenter />} />
        <Route path="map" element={<IntelligenceMap />} />
        <Route path="tenders" element={<TenderRadar />} />
        <Route path="pipeline" element={<PipelineManager />} />
        <Route path="prospects" element={<ProspectExplorer />} />
        <Route path="competitors" element={<CompetitorWatch />} />
        <Route path="signals" element={<SignalFeed />} />
        <Route path="briefs" element={<ResearchBriefs />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="scans" element={<ScanControl />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
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
