import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
})

let isRefreshing = false

// Attach access token to every request (SSR-safe)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-refresh on 401 (SSR-safe, re-entrancy guarded)
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401 && !isRefreshing) {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        isRefreshing = true
        try {
          const { data } = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/refresh`,
            { refresh_token: refresh }
          )
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          error.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(error.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        } finally {
          isRefreshing = false
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
