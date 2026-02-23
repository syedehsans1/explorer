<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import authService from '@/api/auth-service'
import { useToast } from 'vue-toastification'

const toast = useToast()

const route = useRoute()
const router = useRouter()

const token = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const isSuccess = ref(false)
const errorMessage = ref('')
const showPassword = ref(false)

function validateForm(): boolean {
  if (!newPassword.value) {
    errorMessage.value = 'Please enter a new password'
    toast.error(errorMessage.value)
    return false
  }

  if (newPassword.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters long'
    toast.error(errorMessage.value)
    return false
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match'
    toast.error(errorMessage.value)
    return false
  }

  return true
}

async function handleResetPassword() {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }

  isLoading.value = true

  try {
    await authService.resetPassword(token.value, newPassword.value)
    isSuccess.value = true
    // Success toast
    toast.success('Your password has been reset successfully!')
  } catch (error: any) {
    const msg = error.message || 'Password reset failed. Please try again or request a new reset link.'
    errorMessage.value = msg
    // Error toast
    toast.error(msg)
  } finally {
    isLoading.value = false
  }
}

function goToLogin() {
  toast.info('Redirecting to login page...')
  router.push('/login')
}

function goToHome() {
  toast.info('Redirecting to Home...')
  router.push('/pocket-mainnet')
}

onMounted(() => {
  const queryToken = route.query.token as string
  if (!queryToken) {
    errorMessage.value = 'Invalid password reset link. Token is missing.'
    toast.error(errorMessage.value)
  } else {
    token.value = queryToken
  }
})
</script>

<template>
  <div class=" flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full">
      <!-- Success State -->
      <div v-if="isSuccess" class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
        <div class="flex justify-center mb-6">
          <div class="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
            <svg class="w-12 h-12 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        </div>

        <h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">Password Reset Successful!</h1>
        <p class="text-gray-600 dark:text-gray-400 text-center mb-6">
          Your password has been successfully reset. You can now login with your new password.
        </p>

        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <p class="text-sm text-blue-800 dark:text-blue-300">
            For security reasons, all active sessions have been logged out. Please login again with your new password.
          </p>
        </div>

        <div class="space-y-3">
          <button
            @click="goToLogin"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
            </svg>
            Go to Login
          </button>

          <button
            @click="goToHome"
            class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>

      <!-- Reset Password Form -->
      <div v-else class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden mt-[6rem]">
        <!-- Header -->
        <div class="px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800">
          <div class="flex items-center gap-3 mb-2">
            <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            <h1 class="text-2xl font-bold text-white">Reset Password</h1>
          </div>
          <p class="text-blue-100 text-sm">Enter your new password below</p>
        </div>

        <!-- Form -->
        <div class="px-8 py-8 space-y-5">
          <!-- Error Message -->
          <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
          </div>

          <!-- New Password -->
          <div>
            <label for="newPassword" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              New Password
            </label>
            <div class="relative">
              <input
                id="newPassword"
                v-model="newPassword"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your new password"
                class="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                @keyup.enter="handleResetPassword"
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
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">Must be at least 8 characters long</p>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirmPassword" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Confirm your new password"
              class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              @keyup.enter="handleResetPassword"
            />
          </div>

          <!-- Info Box -->
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div class="flex gap-3">
              <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div class="text-sm text-blue-800 dark:text-blue-300">
                <p class="font-semibold mb-1">Security Notice:</p>
                <p class="text-xs">After resetting your password, all active sessions will be logged out for security.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
          <button
            @click="handleResetPassword"
            :disabled="isLoading || !token"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center gap-2"
          >
            <svg v-if="!isLoading" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            {{ isLoading ? 'Resetting Password...' : 'Reset Password' }}
          </button>

          <button
            @click="goToHome"
            class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Additional animations if needed */
</style>
