import { create } from 'zustand'
import api from '../services/api'

interface AuthState {
  user: { id: string; email: string; full_name?: string } | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (email, password) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    // Decode user from token (JWT payload)
    const payload = JSON.parse(atob(data.access_token.split('.')[1]))
    set({ user: { id: payload.sub, email }, isAuthenticated: true })
  },

  register: async (email, password, fullName) => {
    await api.post('/api/v1/auth/register', { email, password, full_name: fullName })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false })
  },
}))
