<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import authService from '@/api/auth-service'
import { useToast } from 'vue-toastification'

const toast = useToast()

const router = useRouter()

const showModal = ref(false)
const showEmailModal = ref(false)
const showVerificationMessage = ref(false)
const showLoginModal = ref(false)
const showGetTokenEmailModal = ref(false)
const showForgotPasswordModal = ref(false)
const forgotPasswordEmail = ref('')
const forgotPasswordLoading = ref(false)
const showLoginPassword = ref(false)  // Toggle password visibility

const formData = ref({
  name: '',
  email: '',
  password: '',
  organization: ''
})

const emailOnly = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function openModal() {
  // Check if user is already logged in
  const isAuthenticated = authService.isAuthenticated()
  
  if (isAuthenticated) {
    // User already logged in - redirect to account page directly
    console.log('✓ User is authenticated, redirecting to /account/user')
    router.push('/account/user')
  } else {
    // User not logged in - show login/registration modal
    console.log('User not authenticated, showing modal')
    showModal.value = true
    errorMessage.value = ''
  }
}

function closeModal() {
  showModal.value = false
  resetForm()
}

function resetForm() {
  formData.value = {
    name: '',
    email: '',
    password: '',
    organization: ''
  }
  errorMessage.value = ''
  isLoading.value = false
}

// Full Registration (with password) - Real API call
async function handleSignUp() {
  const { name, email, password, organization } = formData.value

  if (!name || !email || !password) {
    errorMessage.value = 'Please fill all required fields'
    return
  }

  if (!isValidEmail(email)) {
    errorMessage.value = 'Invalid email address'
    return
  }

  if (password.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await authService.fullRegister(
      email,
      password,
      name,
      organization || undefined
    )

    // Check karein ke verification required hai ya nahi
    if (response.requiresVerification) {
      // Verification email bhej di gayi hai
      showVerificationMessage.value = true
      closeModal()

      // Success toast dikhaein
      setTimeout(() => {
        toast.success(
          'Registration successful! Please check your email to verify your account and receive your API token.'
        )
      }, 300)
    } else {
      // Agar verification required nahi hai (edge case)
      closeModal()
      router.push('/account/user')

      // Optional: success toast
      toast.success('Registration successful!')
    }
  } catch (error: any) {
    const message =
      error.message || 'Registration failed. Please try again.'

    errorMessage.value = message

    // Error toast
    toast.error(message)
  } finally {
    isLoading.value = false
  }
}

function handleGetToken() {
  showModal.value = false
  showEmailModal.value = true
  errorMessage.value = ''
}

const showTokenModal = ref(false)
const currentToken = ref('')
const copied = ref(false)
const getTokenEmail = ref('')

// Login form data
const loginData = ref({
  email: '',
  password: '',
})

function openTokenModal(token: string) {
  currentToken.value = token
  copied.value = false
  showTokenModal.value = true
}

function openLoginModal() {
  // Check if user is already logged in
  const isAuthenticated = authService.isAuthenticated()
  
  if (isAuthenticated) {
    // User already logged in - redirect to account page directly
    console.log('✓ User is authenticated, redirecting to /account/user')
    router.push('/account/user')
  } else {
    // User not logged in - show login modal
    console.log('User not authenticated, showing login modal')
    showModal.value = false
    showLoginModal.value = true
    errorMessage.value = ''
    loginData.value = { email: '', password: '' }
  }
}

function closeLoginModal() {
  showLoginModal.value = false
  loginData.value = { email: '', password: '' }
  errorMessage.value = ''
  showLoginPassword.value = false  // Hide password when modal closes
}

// Login function
async function handleLogin() {
  const { email, password } = loginData.value

  if (!email || !password) {
    errorMessage.value = 'Please enter both email and password'
    return
  }

  if (!isValidEmail(email)) {
    errorMessage.value = 'Please enter a valid email address'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    // Step 1: Login to get JWT tokens
    await authService.login(email, password)

    // Step 2: Check if user already has API tokens
    const existingTokens = await authService.listTokens()

    // Step 3: Agar koi token nahi hai to automatically create kar do
    const tokensList = Array.isArray(existingTokens.data) ? existingTokens.data : (existingTokens.data.tokens || [])
    if (tokensList.length === 0) {
      try {
        // Automatically create a default API token
        await authService.createToken('Default API Token', null)
      } catch (tokenError) {
        console.error('Failed to create automatic token:', tokenError)
        // Token create fail ho gaya but login successful hai, continue kar do
      }
    }

    // Step 4: Login successful - close modal and redirect to user's personal tokens
    closeLoginModal()
    toast.success('Login successful!')
    router.push('/account/user')
  } catch (error: any) {
    const msg = error.message || 'Login failed. Please check your credentials.'
    errorMessage.value = msg
    toast.error(msg)
  } finally {
    isLoading.value = false
  }
}

function closeTokenModal() {
  showTokenModal.value = false
  currentToken.value = ''
  copied.value = false

  // Token modal close karne ke baad user's personal tokens page par redirect karo
  router.push('/account/user')
}

function copyCurrentToken() {
  if (!currentToken.value) return
  navigator.clipboard.writeText(currentToken.value)
  copied.value = true

  // Hide token after copy
  setTimeout(() => {
    currentToken.value = '************'
  }, 300)
}

// Quick Registration (email-only) - Real API call
async function submitEmailToken() {
  if (!emailOnly.value || !isValidEmail(emailOnly.value)) {
    errorMessage.value = 'Invalid email address'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await authService.quickRegister(emailOnly.value)

    // API token turant mil gaya (quick registration)
    if (response.data.token && response.data.token.token) {
      const fullToken = response.data.token.token

      // Token modal mein dikhao
      showEmailModal.value = false
      emailOnly.value = ''
      openTokenModal(fullToken)
    } else {
      throw new Error('Token not received from server')
    }
  } catch (error: any) {
    const msg = error.message || 'Failed to generate token. Please try again.'
    errorMessage.value = msg
    toast.error(msg)
  } finally {
    isLoading.value = false
  }
}

// Handle "Get Token via Email" button click
function handleOpenGetTokenEmailModal() {
  showModal.value = false
  showGetTokenEmailModal.value = true
  getTokenEmail.value = ''
  errorMessage.value = ''
}

// Generate token via email
async function handleGenerateTokenViaEmail() {
  if (!getTokenEmail.value || !isValidEmail(getTokenEmail.value)) {
    errorMessage.value = 'Valid email address required hai'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await authService.generateTokenViaEmail(getTokenEmail.value)
    console.log('Token response:', response)

    // Response structure per documentation: { data: { account, token }, message, ... }
    const { data } = response || {}
    
    if (data && data.token && data.token.token) {
      const fullToken = data.token.token
      
      // Close the email modal and show token
      showGetTokenEmailModal.value = false
      openTokenModal(fullToken)
      
      // Alert user
      setTimeout(() => {
        toast.success('Token successfully generated! You can start using the API immediately.')
      }, 300)
    } else {
      throw new Error('Token not received from server')
    }
  } catch (error: any) {
    console.error('Generate token error:', error)
    
    // Better error messages
    let errorMsg = 'Failed to generate token. Please try again.'
    
    if (error.response?.status === 401) {
      errorMsg = 'Authentication failed. Please try again.'
    } else if (error.response?.data?.error) {
      errorMsg = error.response.data.error
    } else if (error.message) {
      errorMsg = error.message
    }
    
    errorMessage.value = errorMsg
    toast.error(errorMsg)
  } finally {
    isLoading.value = false
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showModal.value = false
    showEmailModal.value = false
    showTokenModal.value = false
    showLoginModal.value = false
    showGetTokenEmailModal.value = false
    showForgotPasswordModal.value = false
  }
}

// Forgot Password Functions
function openForgotPasswordModal() {
  showLoginModal.value = false
  showForgotPasswordModal.value = true
  forgotPasswordEmail.value = ''
  errorMessage.value = ''
}

function closeForgotPasswordModal() {
  showForgotPasswordModal.value = false
  forgotPasswordEmail.value = ''
  errorMessage.value = ''
  forgotPasswordLoading.value = false
}

async function handleForgotPasswordSubmit() {
  if (!forgotPasswordEmail.value) {
    errorMessage.value = 'Please enter your email address'
    return
  }

  if (!isValidEmail(forgotPasswordEmail.value)) {
    errorMessage.value = 'Please enter a valid email address'
    return
  }

  forgotPasswordLoading.value = true
  errorMessage.value = ''

  try {
    console.log('📧 Sending forgot password request for:', forgotPasswordEmail.value)
    const response = await authService.forgotPassword(forgotPasswordEmail.value)
    console.log('✓ Forgot password response:', response.message)
    
    // Show success message
    toast.success('Password reset link has been sent to your email. Please check your inbox and spam folder.')
    closeForgotPasswordModal()
    closeLoginModal()
  } catch (error: any) {
    console.error('❌ Forgot password error:', error)
    errorMessage.value = error.message || 'Failed to send password reset link. Please try again.'
    toast.error(errorMessage.value)
  } finally {
    forgotPasswordLoading.value = false
  }
}

watch([showModal, showEmailModal, showTokenModal, showLoginModal, showGetTokenEmailModal, showForgotPasswordModal], ([modal, emailModal, tokenModal, loginModal, getTokenEmailModal, forgotPasswordModal]) => {
  document.body.style.overflow = modal || emailModal || tokenModal || loginModal || getTokenEmailModal || forgotPasswordModal ? 'hidden' : ''
})

onMounted(() => {
  const yearEl = document.getElementById('currentYear')
  if (yearEl) yearEl.textContent = new Date().getFullYear().toString()

  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- Footer -->
  <footer
    class="bg-[#0f1419] dark:bg-[#0f1419] text-white px-4 sm:px-6 lg:px-8 py-12 lg:py-16"
    role="contentinfo"
  >
    <div class="max-w-7xl mx-auto">
      <!-- Main Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        <!-- Left Column: Logo & Description -->
        <div class="lg:col-span-4">
          <a href="/" aria-label="Pocket Network" class="inline-block mb-6">
            <img
              src="https://pocket.network/wp-content/uploads/2025/01/logo-white.png"
              alt="Pocket Network"
              class="h-10 w-auto"
            />
          </a>
          <p class="text-gray-300 dark:text-gray-400 text-[18px] leading-relaxed max-w-sm">
            Unstoppable open data for the decentralized web. High-performance,
            self-healing access to any public data anywhere.
          </p>
        </div>

        <!-- Right Columns: Navigation Links -->
        <div class="lg:col-span-8">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <!-- RESOURCES Column -->
            <div>
              <h3 class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Resources
              </h3>
              <ul class="space-y-3">
                <li>
                  <a href="/documentation" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="https://forum.pokt.network/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Forum
                  </a>
                </li>
                <li>
                  <a href="https://github.com/pokt-network" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    GitHub
                  </a>
                </li>
                <li>
                  <button
                    @click="openModal"
                    class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm"
                  >
                    Get API Token
                  </button>
                </li>
              </ul>
            </div>

            <!-- NETWORK Column -->
            <div>
              <h3 class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Network
              </h3>
              <ul class="space-y-3">
                <li>
                  <a href="https://wallet.pocket.network/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Wallet
                  </a>
                </li>
                <li>
                  <a href="https://pocket.network/shannon-upgrade-faq/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Shannon Upgrade FAQ
                  </a>
                </li>
                <li>
                  <a href="https://pocket.network/press-kit/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Press Kit
                  </a>
                </li>
                <li>
                  <a href="https://coinmarketcap.com/currencies/pocket-network/markets/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Buy POKT
                  </a>
                </li>
              </ul>
            </div>

            <!-- LEGAL Column -->
            <div>
              <h3 class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Legal
              </h3>
              <ul class="space-y-3">
                <li>
                  <a href="https://pocket.network/privacy-policy/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="https://pocket.network/terms-of-use/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Terms of Use
                  </a>
                </li>
                <li>
                  <a href="https://pocket.network/protocol-logging-practices/" target="_blank" class="text-gray-200 dark:text-gray-300 hover:text-white dark:hover:text-white transition-colors duration-200 text-sm">
                    Logging Practices
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-gray-700 dark:border-gray-800 mt-10 lg:mt-12"></div>

      <!-- Bottom Section -->
      <div class="flex flex-col-reverse lg:flex-row justify-between items-center gap-4 pt-6 lg:pt-8">
        <div class="flex flex-col lg:flex-row items-center lg:items-start gap-2 lg:gap-4">
          <div class="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
            <span>© <span id="currentYear"></span> Pocket Network. All rights reserved.</span><span>Powered by</span>
            <a href="https://stakenodes.org" target="_blank" class="flex items-center gap-1.5 hover:text-white dark:hover:text-white transition-colors duration-200">
              <img src="https://stakenodes.org/favicon.png" alt="Stakenodes" class="h-5 w-5"/>
              <span class="text-base font-medium">Stakenodes</span>
            </a>
          </div>
        </div>
        <div class="flex items-center gap-6 text-gray-400 dark:text-gray-500 text-sm">
          <a href="https://pocket.network/privacy-policy/" target="_blank" class="hover:text-white dark:hover:text-white transition-colors duration-200">
            Privacy
          </a>
          <a href="https://pocket.network/terms-of-use/" target="_blank" class="hover:text-white dark:hover:text-white transition-colors duration-200">
            Terms
          </a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Sign Up Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        @click.self="closeModal"
      >
        <div class="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-lg transform transition-all overflow-hidden">
          <div class="relative px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800">
            <button
              @click="closeModal"
              class="absolute top-6 right-6 text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
              aria-label="Close modal"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
            <div class="pr-10">
              <h2 class="text-2xl font-bold text-white mb-2">Get API Token</h2>
              <p class="text-blue-100 text-sm">Create your account or request a token via email</p>
            </div>
          </div>

          <div class="px-8 py-8 space-y-5 bg-white dark:bg-[#1f2937]">
            <div>
              <label for="name" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Full Name
              </label>
              <input
                id="name"
                v-model="formData.name"
                type="text"
                placeholder="Enter your full name"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              />
            </div>

            <div>
              <label for="email" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Email Address
              </label>
              <input
                id="email"
                v-model="formData.email"
                type="email"
                placeholder="your.email@example.com"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              />
            </div>

            <div>
              <label for="password" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Password
              </label>
              <input
                id="password"
                v-model="formData.password"
                type="password"
                placeholder="Create a secure password"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              />
            </div>

            <div>
              <label for="organization" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Organization <span class="text-gray-400 text-xs font-normal">(Optional)</span>
              </label>
              <input
                id="organization"
                v-model="formData.organization"
                type="text"
                placeholder="Your company or project name"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              />
            </div>
          </div>

          <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
            <!-- Error Message -->
            <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
            </div>

            <button
              @click="handleSignUp"
              :disabled="isLoading"
              class="w-full px-6 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center gap-2"
            >
              <svg v-if="!isLoading" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h14m-7-7v14"/>
              </svg>
              <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              {{ isLoading ? 'Creating Account...' : 'Create Account' }}
            </button>

            <div class="flex items-center gap-3">
              <div class="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Or</span>
              <div class="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
            </div>

            <button
              @click="openLoginModal"
              :disabled="isLoading"
              class="w-full px-6 py-3.5 bg-white hover:bg-gray-50 dark:bg-[#374151] dark:hover:bg-[#4b5563] disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white font-semibold rounded-xl transition-all duration-200 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center gap-2"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
              </svg>
              Login to Existing Account
            </button>

            <button
              @click="handleOpenGetTokenEmailModal"
              :disabled="isLoading"
              class="w-full px-6 py-3.5 bg-white hover:bg-gray-50 dark:bg-[#374151] dark:hover:bg-[#4b5563] disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white font-semibold rounded-xl transition-all duration-200 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center gap-2"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              Get Token via Email
            </button>            
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Email Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showEmailModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        @click.self="showEmailModal = false"
      >
        <div class="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="relative px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700">
            <button
              @click="showEmailModal = false"
              class="absolute top-5 right-5 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
            <h2 class="text-xl font-bold text-white">Get API Token</h2>
            <p class="text-blue-100 text-sm mt-1">Enter your email to receive your API token</p>
          </div>

          <div class="px-8 py-8 bg-white dark:bg-[#1f2937]">
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Email Address
            </label>
            <input
              v-model="emailOnly"
              type="email"
              placeholder="you@example.com"
              class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
            <!-- Error Message -->
            <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
            </div>

            <button
              @click="submitEmailToken"
              :disabled="isLoading"
              class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <svg v-if="!isLoading" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              {{ isLoading ? 'Generating Token...' : 'Send API Token' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Token Display Modal -->
  <Teleport to="body">
  <Transition name="modal">
    <div
      v-if="showTokenModal"
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      @click.self="closeTokenModal"
    >
      <div class="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="px-8 py-8">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Your API Token</h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6 text-sm">
            Copy this token and keep it safe. After copying, it will be hidden.
          </p>

          <!-- Token + Copy -->
          <div class="flex items-center gap-3 mb-6">
            <input
              type="text"
              :value="currentToken"
              readonly
              class="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-mono focus:outline-none"
            />
            <button
              @click="copyCurrentToken"
              class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
              title="Copy token"
            >
              <!-- Copy icon always visible -->
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
              </svg>
              
              <!-- Copied! text appears only after click -->
              <span v-if="copied" class="text-sm text-green-300 font-semibold">Copied!</span>
            </button>
          </div>
          <button
            @click="closeTokenModal"
            class="w-full py-3.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </Transition>
</Teleport>

  <!-- Get Token via Email Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showGetTokenEmailModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        @click.self="showGetTokenEmailModal = false"
      >
        <div class="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="relative px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700">
            <button
              @click="showGetTokenEmailModal = false"
              class="absolute top-5 right-5 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
            <h2 class="text-xl font-bold text-white">Generate Token via Email</h2>
            <p class="text-blue-100 text-sm mt-1">Generate a new token using your email</p>
          </div>

          <div class="px-8 py-8 bg-white dark:bg-[#1f2937]">
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Email Address
            </label>
            <input
              v-model="getTokenEmail"
              type="email"
              placeholder="you@example.com"
              class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
            <!-- Error Message -->
            <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
            </div>

            <button
              @click="handleGenerateTokenViaEmail"
              :disabled="isLoading"
              class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <svg v-if="!isLoading" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              {{ isLoading ? 'Generating...' : 'Generate Token' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Login Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showLoginModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        @click.self="closeLoginModal"
      >
        <div class="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <!-- Header -->
          <div class="relative px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800">
            <button
              @click="closeLoginModal"
              class="absolute top-6 right-6 text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
              aria-label="Close modal"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
            <div class="pr-10">
              <div class="flex items-center gap-3 mb-2">
                <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                </svg>
                <h2 class="text-2xl font-bold text-white">Welcome Back</h2>
              </div>
              <p class="text-blue-100 text-sm">Login to manage your API tokens</p>
            </div>
          </div>

          <!-- Form -->
          <div class="px-8 py-8 space-y-5">
            <!-- Error Message -->
            <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
            </div>

            <!-- Email -->
            <div>
              <label for="loginEmail" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Email Address
              </label>
              <input
                id="loginEmail"
                v-model="loginData.email"
                type="email"
                placeholder="your.email@example.com"
                autocomplete="email"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                @keyup.enter="handleLogin"
              />
            </div>

            <!-- Password -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label for="loginPassword" class="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Password
                </label>
                <button
                  @click="openForgotPasswordModal"
                  type="button"
                  class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <div class="relative">
                <input
                  id="loginPassword"
                  v-model="loginData.password"
                  :type="showLoginPassword ? 'text' : 'password'"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm pr-10"
                  @keyup.enter="handleLogin"
                />
                <button
                  @click="showLoginPassword = !showLoginPassword"
                  type="button"
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                  :title="showLoginPassword ? 'Hide password' : 'Show password'"
                >
                  <!-- Eye icon (show) -->
                  <svg v-if="!showLoginPassword" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <!-- Eye slash icon (hide) -->
                  <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
            <button
              @click="handleLogin"
              :disabled="isLoading"
              class="w-full px-6 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center gap-2"
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

            <button
              @click="closeLoginModal"
              class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Forgot Password Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showForgotPasswordModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        @click.self="closeForgotPasswordModal"
      >
        <div class="bg-white dark:bg-[#1f2937] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <!-- Header -->
          <div class="relative px-8 pt-8 pb-6 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800">
            <button
              @click="closeForgotPasswordModal"
              class="absolute top-6 right-6 text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
              aria-label="Close modal"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
            <div class="pr-10">
              <div class="flex items-center gap-3 mb-2">
                <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2" d="M15 7h4a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h4m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2m-6 4h6"/>
                </svg>
                <h2 class="text-2xl font-bold text-white">Forget Password</h2>
              </div>
              <p class="text-blue-100 text-sm">Enter your email to receive a password reset link</p>
            </div>
          </div>

          <!-- Form -->
          <div class="px-8 py-8 space-y-5">
            <!-- Error Message -->
            <div v-if="errorMessage" class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
            </div>

            <!-- Email -->
            <div>
              <label for="forgotEmail" class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Email Address
              </label>
              <input
                id="forgotEmail"
                v-model="forgotPasswordEmail"
                type="email"
                placeholder="your.email@example.com"
                autocomplete="email"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                @keyup.enter="handleForgotPasswordSubmit"
              />
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400">
              We'll send you a password reset link. You can reset your password using the link from the email.
            </p>
          </div>

          <!-- Footer -->
          <div class="px-8 py-6 bg-gray-50 dark:bg-[#111827] space-y-3">
            <button
              @click="handleForgotPasswordSubmit"
              :disabled="forgotPasswordLoading"
              class="w-full px-6 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center gap-2"
            >
              <svg v-if="!forgotPasswordLoading" class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              {{ forgotPasswordLoading ? 'Sending...' : 'Send Reset Link' }}
            </button>

            <button
              @click="closeForgotPasswordModal"
              class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

</template>

<style scoped>
footer a, footer button {
  @apply focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0f1419] focus:ring-blue-500 rounded-sm;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.3s ease;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
}
</style>