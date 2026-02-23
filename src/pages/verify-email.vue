<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import authService from '@/api/auth-service'
import { useToast } from 'vue-toastification'

const toast = useToast()

const route = useRoute()
const router = useRouter()

const isVerifying = ref(true)
const isSuccess = ref(false)
const errorMessage = ref('')
const apiToken = ref('')
const tokenCopied = ref(false)

async function verifyEmail() {
  const token = route.query.token as string

  if (!token) {
    isVerifying.value = false
    errorMessage.value = 'Invalid verification link. Token is missing.'
    toast.error(errorMessage.value)
    return
  }

  try {
    const response = await authService.verifyEmail(token)
    console.log('Verification Response:', response)
    console.log('Access Token:', localStorage.getItem('access_token'))
    console.log('Refresh Token:', localStorage.getItem('refresh_token'))
    
    isSuccess.value = true
    toast.success('Email verified successfully! Your account is now active.')

    // Agar token response mein hai (full account verification)
    if (response.data.token && response.data.token.token) {
      apiToken.value = response.data.token.token
      toast.success('Your API token is ready. You can copy it now.')
    }
  } catch (error: any) {
    isSuccess.value = false
    const msg = error.message || 'Email verification failed. Please try again or request a new verification link.'
    errorMessage.value = msg
    toast.error(msg)
  } finally {
    isVerifying.value = false
  }
}

function copyToken() {
  if (!apiToken.value) return
  navigator.clipboard.writeText(apiToken.value)
  tokenCopied.value = true

  setTimeout(() => {
    tokenCopied.value = false
  }, 2000)
}

function goToAccount() {
  // Redirect to login page
  toast.info('Redirecting to login page...')
  router.push('/login')
}

function goToHome() {
  toast.info('Redirecting to home...')
  router.push('/poket-mainnet')
}

onMounted(() => {
  verifyEmail()
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center px-4 py-12 mt-[4rem]">
    <div class="max-w-md w-full">
      <!-- Verifying State -->
      <div v-if="isVerifying" class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
        <div class="flex justify-center mb-6">
          <svg class="w-16 h-16 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verifying Email...</h1>
        <p class="text-gray-600 dark:text-gray-400">Please wait while we verify your email address.</p>
      </div>

      <!-- Success State -->
      <div v-else-if="isSuccess" class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <!-- Header Section -->
        <div class="bg-gradient-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700 px-8 py-6">
          <div class="flex items-center gap-4">
            <div class="p-3 bg-white/20 rounded-full">
              <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div>
              <h1 class="text-2xl font-bold text-white">Your email has been successfully verified.</h1>
            </div>
          </div>
        </div>

        <!-- Token Display Section -->
        <div class="p-8">
          <div v-if="apiToken" class="mb-6">
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <div class="flex gap-3">
                <svg class="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-sm text-yellow-800 dark:text-yellow-300">
                  <p class="font-semibold mb-1">Your New API Token</p>
                  <p>Please save this token securely. You won't be able to see it again!</p>
                </div>
              </div>
            </div>

            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              API Token
            </label>
            <div class="flex items-center gap-3 mb-6">
              <input
                type="text"
                :value="apiToken"
                readonly
                class="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-mono text-sm focus:outline-none break-all"
              />
              <button
                @click="copyToken"
                class="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors flex items-center gap-2 flex-shrink-0"
                title="Copy token"
              >
                <svg v-if="!tokenCopied" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                </svg>
                <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 13l4 4L19 7"/>
                </svg>
                {{ tokenCopied ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>

          <!-- Information Message -->
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p class="text-sm text-blue-800 dark:text-blue-300">
              ✅ Your email has been verified! Your API token will be used for API requests.<br>
              <br>
              To manage your account and tokens, please login with your credentials.
            </p>
          </div>

          <!-- Action Button -->
          <button
            @click="goToAccount"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h12.5a1.5 1.5 0 010 3H7"/>
            </svg>
            Proceed to Login
          </button>
        </div>
      </div>

      <!-- Error State -->
      <div v-else class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
        <div class="flex justify-center mb-6">
          <div class="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
            <svg class="w-12 h-12 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </div>
        </div>

        <h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">Verification Failed</h1>
        <p class="text-gray-600 dark:text-gray-400 text-center mb-6">
          {{ errorMessage }}
        </p>

        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p class="text-sm text-red-800 dark:text-red-300">
            If your verification link has expired, you can request a new one from the registration page.
          </p>
        </div>

        <div class="space-y-3">
          <button
            @click="goToHome"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
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
