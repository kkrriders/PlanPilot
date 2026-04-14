import { create } from 'zustand'
import api from '../services/api'

interface AuthState {
  user: { id: string; email: string; full_name?: string } | null
  isAuthenticated: boolean
  isRehydrated: boolean
  rehydrate: () => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName?: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isRehydrated: false,

  rehydrate: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token')
      set({ isAuthenticated: !!token, isRehydrated: true })
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/api/v1/auth/login', { email, password })
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    try {
      const payload = JSON.parse(atob(data.access_token.split('.')[1]))
      set({ user: { id: payload.sub, email }, isAuthenticated: true, isRehydrated: true })
    } catch {
      // Token is valid (server accepted it) but client decode failed — still mark authenticated
      set({ user: { id: '', email }, isAuthenticated: true, isRehydrated: true })
    }
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
