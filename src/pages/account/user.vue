<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import authService from '@/api/auth-service'
import { useToast } from 'vue-toastification'

const toast = useToast()

const router = useRouter()
const userData = ref<any>(null)
const userTokens = ref<any[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const showTokenDisplay = ref(false)
const displayToken = ref('')
const copiedTokenId = ref<string | null>(null)
const showNewTokenModal = ref(false)
const newTokenName = ref('')
const isCreatingToken = ref(false)
const itemsPerPage = ref(10)
const currentPage = ref(1)
const showNewTokenResultModal = ref(false)
const newGeneratedToken = ref('')
const newGeneratedTokenName = ref('')
const isTokenCopied = ref(false)

onMounted(async () => {
  try {
    isLoading.value = true
    errorMessage.value = ''
    
    // Check if user is authenticated
    const isAuth = authService.isAuthenticated()
    if (!isAuth) {
      toast.error('You are not authenticated. Redirecting to home...')
      router.push('/pocket-mainnet')
      return
    }

    // Get user data - Backend returns { data: { id, email, name, ... } }
    try {
      const accountResponse = await authService.getAccount()
      
      // Data ab response.data.data mein hai (directly account object)
      userData.value = accountResponse.data.data || accountResponse.data
      
      // Save to localStorage
      if (userData.value) {
        localStorage.setItem('user_data', JSON.stringify(userData.value))
      }
    } catch (apiError) {
      console.error('API error:', apiError)
      // Fallback to localStorage agar API fail hoo
      const storedData = localStorage.getItem('user_data')
      if (storedData) {
        try {
          userData.value = JSON.parse(storedData)
        } catch (parseError) {
          console.error('Parse error:', parseError)
          toast.error('Failed to parse stored user data.')
        }
      } else {
        toast.error('Failed to load account data from server.')
      }
    }

    // Get user's tokens
    try {
      const tokensResponse = await authService.listTokens()
      console.log('Tokens response:', tokensResponse)
      
      // Try different response structures
      if (Array.isArray(tokensResponse.data)) {
        userTokens.value = tokensResponse.data
      } else if (tokensResponse.data?.data && Array.isArray(tokensResponse.data.data)) {
        userTokens.value = tokensResponse.data.data
      } else if (tokensResponse.data?.tokens && Array.isArray(tokensResponse.data.tokens)) {
        userTokens.value = tokensResponse.data.tokens
      } else {
        userTokens.value = []
      }
      console.log('Tokens loaded:', userTokens.value.length, 'tokens')
    } catch (tokenError) {
      console.error('Token loading error:', tokenError)
      userTokens.value = []
      toast.error('Failed to load your API tokens.')
    }
  } catch (error: any) {
    console.error('Error loading account:', error)
    errorMessage.value = error.message || 'Failed to load account data'
    toast.error(errorMessage.value)
  } finally {
    isLoading.value = false
  }
})

function showToken(token: any) {
  displayToken.value = token.token
  showTokenDisplay.value = true
  toast.info('API token revealed. Copy it safely.')
}

function copyToken(token: any) {
  if (!token.token) {
    errorMessage.value = 'Token value not available'
    toast.error(errorMessage.value)
    return
  }
  
  navigator.clipboard.writeText(token.token).then(() => {
    copiedTokenId.value = token.id
    toast.success('Token copied to clipboard!')
    setTimeout(() => {
      copiedTokenId.value = null
    }, 2000)
  }).catch(err => {
    console.error('Copy error:', err)
    errorMessage.value = 'Failed to copy token'
    toast.error(errorMessage.value)
  })
}

function getPaginatedTokens() {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return userTokens.value.slice(start, end)
}

function getTotalPages() {
  return Math.ceil(userTokens.value.length / itemsPerPage.value)
}

function changePage(page: number) {
  if (page >= 1 && page <= getTotalPages()) {
    currentPage.value = page
  }
}

async function createNewToken() {
  if (!newTokenName.value.trim()) {
    errorMessage.value = 'Token name is required'
    toast.error(errorMessage.value)
    return
  }

  try {
    isCreatingToken.value = true
    errorMessage.value = ''

    const response = await authService.createToken(newTokenName.value)

    // Response structure: { data: { id, token, name, ... }, message: "..." }
    // response.data IS the token object itself!
    const newToken = response.data
    
    if (newToken && newToken.token) {
      // Store token info for display
      newGeneratedToken.value = newToken.token
      newGeneratedTokenName.value = newToken.name || 'API Token'
      isTokenCopied.value = false

      // Add to table
      userTokens.value.push(newToken)
      
      // Close creation modal
      showNewTokenModal.value = false
      newTokenName.value = ''
      
      // Show result modal immediately
      showNewTokenResultModal.value = true
      toast.success('New API token created successfully!')
    } else {
      console.error('❌ Token structure invalid:', { newToken, hasToken: newToken?.token })
      throw new Error('Token not created properly')
    }
    
  } catch (error: any) {
    console.error('❌ Create token error:', error)
    errorMessage.value = error.message || 'Failed to create token. Please try again.'
    toast.error(errorMessage.value)
  } finally {
    isCreatingToken.value = false
  }
}

function copyNewToken() {
  if (!newGeneratedToken.value) return
  navigator.clipboard.writeText(newGeneratedToken.value)
  isTokenCopied.value = true
  toast.success('New token copied to clipboard!')
  
  // Reset after 2 seconds
  setTimeout(() => {
    isTokenCopied.value = false
  }, 2000)
}

function closeTokenResultModal() {
  showNewTokenResultModal.value = false
  newGeneratedToken.value = ''
  newGeneratedTokenName.value = ''
  isTokenCopied.value = false
}

function logout() {
  authService.clearAuthData()
  toast.info('Logged out successfully.')
  router.push('/pocket-mainnet')
}
</script>

<template>
  <div class="mt-[6rem]">
    <!-- Header -->
    <div class="">
      <div class="p-6">
        <div class="bg-[#ffffff] hover:bg-base-200 w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold mb-2">Account Dashboard</h1>
            <p class="text-[#000000] dark:text-[#ffffff]">Manage your API tokens</p>
          </div>
          <div class="flex items-center gap-6">
            <div class="flex flex-col">
              <p class="text-sm text-gray-400">{{ userData?.name }}</p>
              <p class="font-mono text-[#393f4a80] dark:text-gray-200">{{ userData?.email }}</p>
            </div>
            <button
            @click="logout"
            class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Logout
          </button>
          </div>
          
        </div>
      </div>
    </div>

    <div class="px-6 py-10">
      <!-- Error Message -->
      <div v-if="errorMessage" class="mb-6 p-4 bg-red-900/30 border border-red-600 rounded-xl">
        <p class="text-red-300">{{ errorMessage }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="text-center py-12">
        <div class="inline-block">
          <svg class="w-12 h-12 animate-spin text-red-500 dark:text-white-500" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
        </div>
      </div>

      <template v-else>
        <!-- Tokens Section -->
        <div class="bg-[#ffffff] font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg p-8">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold">API Tokens</h2>
            <button
              @click="showNewTokenModal = true"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-black-500 dark:text-white-500 transition-colors text-sm"
            >
              + Create Token
            </button>
          </div>

          <!-- Tokens Table -->
          <div v-if="userTokens.length > 0" class="overflow-x-auto border dark:border-white/10 rounded-lg">
            <table class="w-full border-collapse">
              <thead>
                <tr class="">
                  <th class="px-6 py-4 text-left text-sm font-semibold  text-[#64748B]">No.</th>
                  <th class="px-6 py-4 text-left text-sm font-semibold  text-[#64748B]">Token Name</th>
                  <th class="px-6 py-4 text-left text-sm font-semibold  text-[#64748B]">Token Prefix</th>
                  <th class="px-6 py-4 text-left text-sm font-semibold  text-[#64748B]">Created</th>
                  <th class="px-6 py-4 text-left text-sm font-semibold  text-[#64748B]">Last Used</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(token, index) in getPaginatedTokens()"
                  :key="token.id"
                  class="transition-colors hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)]"
                >
                  <td class="px-6 py-4 text-sm text-[#64748B]">{{ (currentPage - 1) * itemsPerPage + index + 1 }}</td>
                  <td class="px-6 py-4 text-sm text-[#64748B] font-medium">{{ token.name }}</td>
                  <td class="px-6 py-4 text-sm text-blue-400 font-mono">{{ token.token_prefix }}...</td>
                  <td class="px-6 py-4 text-sm text-[#64748B]">{{ new Date(token.created_at).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</td>
                  <td class="px-6 py-4 text-sm text-[#64748B]">
                    <span v-if="token.last_used_at">{{ new Date(token.last_used_at).toLocaleDateString() }}</span>
                    <span v-else class="text-[#64748B]">Never</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="userTokens.length > 0" class="flex items-center justify-between mt-4 pt-2">
            <div class="flex items-center gap-2">
              <span class="text-sm text-[#64748B]">Show</span>
              <select
                v-model.number="itemsPerPage"
                @change="currentPage = 1"
                class="p-4 bg-white dark:bg-gray-700 border border-white-600 dark:border-gray-600 rounded text-[#64748B] focus:outline-none focus:border-blue-500 text-sm"
              >
                <option :value="5">5</option>
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
              </select>
              <span class="text-sm text-[#64748B]">per page</span>
            </div>

            <div class="text-sm text-[#64748B]">
              Showing {{ (currentPage - 1) * itemsPerPage + 1 }} to {{ Math.min(currentPage * itemsPerPage, userTokens.length) }} of {{ userTokens.length }} tokens
            </div>

            <div class="flex items-center gap-2">
              <button
                @click="changePage(1)"
                :disabled="currentPage === 1"
                class="px-[10px] py-[5px] text-[14px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
              >
                First
              </button>
              <button
                @click="changePage(currentPage - 1)"
                :disabled="currentPage === 1"
                class="px-[10px] py-[5px] text-[14px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
              >
                ‹
              </button>

              <div class="flex items-center gap-1">
                <button
                  v-for="page in getTotalPages()"
                  :key="page"
                  @click="changePage(page)"
                  :class="currentPage === page ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'"
                  class="px-[10px] py-[5px] text-[14px] rounded text-sm font-semibold transition-colors"
                >
                  {{ page }}
                </button>
              </div>

              <button
                @click="changePage(currentPage + 1)"
                :disabled="currentPage === getTotalPages()"
                class="px-[10px] py-[5px] text-[14px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
              >
                ›
              </button>
              <button
                @click="changePage(getTotalPages())"
                :disabled="currentPage === getTotalPages()"
                class="px-[10px] py-[5px] text-[14px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
              >
                Last
              </button>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="text-center py-12">
            <svg class="w-16 h-16 text-gray-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p class="text-gray-400 text-lg mb-4">There are no tokens yet</p>
            <button
              @click="showNewTokenModal = true"
              class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
            >
              + Create Your First Token
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Token Display Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showTokenDisplay"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          @click.self="showTokenDisplay = false"
        >
          <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-700">
            <div class="px-8 py-8">
              <h2 class="text-xl font-bold mb-4">API Token</h2>
              <p class="text-gray-400 mb-6 text-sm">Store your token safely</p>

              <!-- Token Input -->
              <input
                type="text"
                :value="displayToken"
                readonly
                class="w-full px-4 py-3 border border-gray-600 rounded-xl bg-gray-900 text-gray-200 font-mono focus:outline-none focus:border-blue-500 mb-4"
              />

              <button
                @click="showTokenDisplay = false"
                class="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- New Token Result Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showNewTokenResultModal"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          @click.self="closeTokenResultModal"
        >
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <!-- Header -->
            <div class="px-8 pt-8 pb-6 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-700 dark:to-green-800 border-b border-green-200 dark:border-green-800">
              <h2 class="text-2xl font-bold text-white mb-2">✓ Token Successfully Created!</h2>
              <p class="text-green-50 dark:text-green-100 text-sm">{{ newGeneratedTokenName }}</p>
            </div>

            <!-- Content -->
            <div class="px-8 py-8 space-y-6">
              <!-- Warning Message -->
              <div class="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-600/50 rounded-xl">
                <p class="text-yellow-700 dark:text-yellow-300 text-sm font-semibold">⚠️ Important Notice</p>
                <p class="text-yellow-600 dark:text-yellow-200 text-sm mt-2">
                  This token will only be shown once. Please copy it now and save it safely. You won't be able to view it again!
                </p>
              </div>

              <!-- Token Display -->
              <div class="mb-6">
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Your API Token</label>
                <div class="relative">
                  <input
                    type="text"
                    :value="newGeneratedToken"
                    readonly
                    class="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all shadow-sm"
                  />
                  <button
                    @click="copyNewToken"
                    class="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Copy token"
                  >
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Copy Button -->
              <button
                @click="copyNewToken"
                :class="isTokenCopied 
                  ? 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800' 
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'"
                class="w-full py-4 rounded-xl font-semibold transition-all text-white flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
              >
                <svg v-if="!isTokenCopied" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {{ isTokenCopied ? '✓ Copied!' : 'Copy Token' }}
              </button>

              <!-- Close Button -->
              <button
                @click="closeTokenResultModal"
                class="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg font-semibold transition-colors text-gray-700 dark:text-gray-300"
              >
                Done
              </button>

              <!-- Info -->
              <p class="text-gray-500 dark:text-gray-400 text-xs text-center mt-4">
                Click Done to close and hide the token from view
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Create Token Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showNewTokenModal"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          @click.self="showNewTokenModal = false"
        >
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-300 dark:border-gray-700">
            <!-- Header -->
            <div class="px-8 pt-8 pb-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-b border-gray-300 dark:border-gray-700">
              <button
                @click="showNewTokenModal = false"
                class="absolute top-5 right-5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M6 18L18 6"/>
                </svg>
              </button>
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">Create New Token</h2>
              <p class="text-sm text-gray-600 dark:text-gray-400">Create your API token and use it</p>
            </div>

            <!-- Content -->
            <div class="px-8 py-8">
              <!-- Token Name Input -->
              <div class="mb-6">
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Token Name</label>
                <input
                  v-model="newTokenName"
                  type="text"
                  placeholder="e.g., Production API, Development, etc."
                  class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {{ newTokenName.length }}/50 characters
                </p>
              </div>

              <!-- Buttons -->
              <div class="flex gap-3">
                <button
                  @click="createNewToken"
                  :disabled="isCreatingToken || !newTokenName.trim()"
                  class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                >
                  <svg v-if="!isCreatingToken" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="12 5 12 19M5 12h14"/>
                  </svg>
                  <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  {{ isCreatingToken ? 'Creating...' : 'Create Token' }}
                </button>
                <button
                  @click="showNewTokenModal = false"
                  class="flex-1 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
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
