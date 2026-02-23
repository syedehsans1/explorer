import axios from 'axios'
import authService from './auth-service'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - API token ya JWT token add karta hai
api.interceptors.request.use((config) => {
  // Pehle API token check karo (data endpoints ke liye)
  const apiTokens = authService.getStoredApiTokens()
  if (apiTokens.length > 0) {
    // Pehla active token use karo
    const activeToken = apiTokens.find(t => t.status === 'active')
    if (activeToken) {
      config.headers.Authorization = `Bearer ${activeToken.token}`
    }
  }

  // Agar auth endpoint hai to JWT token use karo
  if (config.url?.includes('/v1/auth/')) {
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
  }

  return config
})

// Response interceptor - token refresh handle karta hai
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Agar 401 error aaye aur retry nahi kiya ho
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          const response = await authService.refreshToken(refreshToken)
          const { accessToken, refreshToken: newRefreshToken } = response.data

          // Naye tokens store karo
          localStorage.setItem('access_token', accessToken)
          localStorage.setItem('refresh_token', newRefreshToken)

          // Original request ko naye token ke saath retry karo
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Refresh token bhi invalid hai, logout kar do
        authService.clearAuthData()
        if (typeof window !== 'undefined') {
          window.location.href = '/'
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api