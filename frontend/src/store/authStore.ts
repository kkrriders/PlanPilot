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
      if (!token) {
        set({ isAuthenticated: false, isRehydrated: true })
        return
      }
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const isExpired = payload.exp * 1000 < Date.now()
        if (isExpired) {
          // Try to refresh silently before giving up
          const refresh = localStorage.getItem('refresh_token')
          if (refresh) {
            import('../services/api').then(({ default: api }) => {
              api.post('/api/v1/auth/refresh', { refresh_token: refresh })
                .then(({ data }) => {
                  localStorage.setItem('access_token', data.access_token)
                  localStorage.setItem('refresh_token', data.refresh_token)
                  set({ isAuthenticated: true, isRehydrated: true })
                })
                .catch(() => {
                  localStorage.removeItem('access_token')
                  localStorage.removeItem('refresh_token')
                  set({ isAuthenticated: false, isRehydrated: true })
                })
            })
          } else {
            localStorage.removeItem('access_token')
            set({ isAuthenticated: false, isRehydrated: true })
          }
          return
        }
        set({ isAuthenticated: true, isRehydrated: true })
      } catch {
        // Malformed token — treat as unauthenticated
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ isAuthenticated: false, isRehydrated: true })
      }
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
    const refresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
    if (refresh) {
      // Fire-and-forget — revoke on server so the token can't be reused
      import('../services/api').then(({ default: api }) => {
        api.post('/api/v1/auth/logout', { refresh_token: refresh }).catch(() => {})
      })
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false })
  },
}))
