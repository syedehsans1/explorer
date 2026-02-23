<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import authService from '@/api/auth-service'
import { useToast } from 'vue-toastification'

const toast = useToast()

const router = useRouter()

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const showPassword = ref(false)
const rememberMe = ref(false)

function validateForm(): boolean {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter both email and password'
    toast.error(errorMessage.value)
    return false
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    errorMessage.value = 'Please enter a valid email address'
    toast.error(errorMessage.value)
    return false
  }

  return true
}

async function handleLogin() {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    await authService.login(email.value, password.value)

    // Login successful
    toast.success('Login successful!')
    // Login successful - redirect to user's personal tokens page
    router.push('/account/user')
  } catch (error: any) {
    const msg = error.message || 'Login failed. Please check your credentials and try again.'
    errorMessage.value = msg
    toast.error(msg)
  } finally {
    isLoading.value = false
  }
}

function goToForgotPassword() {
  // Implement forgot password flow
  // For now, just show alert
  toast.info('Forgot password email will be sent.')
}  

function goToRegister() {
  toast.info('Redirecting to registration...')
  router.push('/')
  // Open registration modal after redirect (you can emit event or use state management)
}

function goToHome() {
  toast.info('Redirecting to home...')
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800">
          <div class="flex items-center gap-3 mb-2">
            <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
            </svg>
            <h1 class="text-2xl font-bold text-white">Welcome Back</h1>
          </div>
          <p class="text-blue-100 text-sm">Login to manage your API tokens and account</p>
        </div>

        <!-- Form -->
        <div class="px-8 py-8 space-y-5">
          <!-- Error Message -->
          <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
          </div>

          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Email Address
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="your.email@example.com"
              autocomplete="email"
              class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              @keyup.enter="handleLogin"
            />
          </div>

          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Password
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                autocomplete="current-password"
                class="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                @keyup.enter="handleLogin"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg v-if="!showPassword" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke="currentColor" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Remember Me & Forgot Password -->
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="rememberMe"
                type="checkbox"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">Remember me</span>
            </label>

            <button
              @click="goToForgotPassword"
              class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
          <button
            @click="handleLogin"
            :disabled="isLoading"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center gap-2"
          >
            <svg v-if="!isLoading" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
            </svg>
            <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            {{ isLoading ? 'Logging in...' : 'Login' }}
          </button>

          <div class="flex items-center gap-3">
            <div class="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
            <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Or</span>
            <div class="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
          </div>

          <button
            @click="goToRegister"
            class="w-full py-3 bg-white hover:bg-gray-50 dark:bg-[#374151] dark:hover:bg-[#4b5563] text-gray-900 dark:text-white font-semibold rounded-xl transition-all duration-200 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            Create New Account
          </button>

          <button
            @click="goToHome"
            class="w-full py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Additional animations if needed */
</style>
