import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/shared/Layout'
import LoginPage from './app/auth/LoginPage'
import RegisterPage from './app/auth/RegisterPage'
import DashboardPage from './app/dashboard/DashboardPage'
import PlanListPage from './app/plans/PlanListPage'
import PlanCreatePage from './app/plans/PlanCreatePage'
import PlanDetailPage from './app/plans/PlanDetailPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <Layout>{children}</Layout> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/plans" element={<PrivateRoute><PlanListPage /></PrivateRoute>} />
        <Route path="/plans/new" element={<PrivateRoute><PlanCreatePage /></PrivateRoute>} />
        <Route path="/plans/:planId" element={<PrivateRoute><PlanDetailPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
