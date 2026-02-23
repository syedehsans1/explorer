<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Types
interface Parameter {
  name: string
  type: string
  required?: boolean
  description?: string
  default?: string
}

interface Endpoint {
  path: string
  method: string
  name: string
  description?: string
  parameters?: Parameter[]
  requestBody?: any
  responseExample?: any
}

interface Group {
  name: string
  endpoints?: Endpoint[]
}

interface Category {
  name: string
  authLevel?: string
  groups?: Group[]
}

interface ApiData {
  info?: { title?: string; version?: string; baseUrl?: string; description?: string }
  categories?: Category[]
  authentication?: any
}

const apiData = ref<ApiData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedEndpoint = ref<Endpoint | null>(null)
const selectedCategory = ref<string | null>(null)
const selectedGroup = ref<string | null>(null)
const openSections = ref<Record<string, boolean>>({})
const openGroups = ref<Record<string, boolean>>({})
const showParameters = ref(false)
const showResponse = ref(true)
const showTryModal = ref(false)
const showAllParams = ref(false)
const requestParams = ref<Record<string, string>>({})
const apiResponse = ref<any>(null)
const isLoadingRequest = ref(false)
const requestError = ref<string | null>(null)

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/docs')
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const result = await response.json()
    const data = result.data || result
    if (!data) throw new Error('No data received')

    apiData.value = data

    if (data.categories?.length > 0) {
      data.categories.forEach((cat: Category, i: number) => {
        openSections.value[cat.name] = i === 0
        cat.groups?.forEach((grp: Group, j: number) => {
          openGroups.value[`${cat.name}_${grp.name}`] = i === 0 && j === 0
        })
      })

      const firstCat = data.categories[0]
      if (firstCat.groups?.[0]?.endpoints?.[0]) {
        selectedCategory.value = firstCat.name
        selectedGroup.value = firstCat.groups[0].name
        selectedEndpoint.value = firstCat.groups[0].endpoints[0]
      }
    }
    loading.value = false
  } catch (err: any) {
    error.value = err.message
    loading.value = false
  }
})

const toggleSection = (name: string) => openSections.value[name] = !openSections.value[name]
const toggleGroup = (cat: string, grp: string) => openGroups.value[`${cat}_${grp}`] = !openGroups.value[`${cat}_${grp}`]
const isGroupOpen = (cat: string, grp: string) => openGroups.value[`${cat}_${grp}`]
const selectEndpoint = (cat: Category, grp: Group, ep: Endpoint) => {
  selectedCategory.value = cat.name
  selectedGroup.value = grp.name
  selectedEndpoint.value = ep
  showAllParams.value = false // Reset when changing endpoint
}

const getMethodClass = (method: string) => {
  const classes: Record<string, string> = {
    GET: 'bg-emerald-500 text-white',
    POST: 'bg-blue-500 text-white',
    PUT: 'bg-amber-500 text-white',
    DELETE: 'bg-red-500 text-white',
    PATCH: 'bg-purple-500 text-white'
  }
  return classes[method] || 'bg-gray-500 text-white'
}

const copyCode = (text: string) => {
  navigator.clipboard.writeText(text)
  alert('Copied to clipboard!')
}

// Function to toggle all parameters view in sidebar
const toggleAllParams = () => {
  showAllParams.value = !showAllParams.value
}

// Function to open Try It modal
const openTryModal = () => {
  showTryModal.value = true
  requestParams.value = {}
  apiResponse.value = null
  requestError.value = null
  
  // Initialize parameters with default values
  if (selectedEndpoint.value?.parameters) {
    selectedEndpoint.value.parameters.forEach(param => {
      if (param.default) {
        requestParams.value[param.name] = param.default
      }
    })
  }
}

const closeTryModal = () => {
  showTryModal.value = false
  requestParams.value = {}
  apiResponse.value = null
  requestError.value = null
  isLoadingRequest.value = false
}

// Function to send API request
const sendRequest = async () => {
  if (!selectedEndpoint.value) return
  
  isLoadingRequest.value = true
  apiResponse.value = null
  requestError.value = null
  
  try {
    // Build the URL with parameters
    let url = `${apiData.value?.info?.baseUrl || ''}${selectedEndpoint.value.path}`
    
    // Add query parameters for GET requests
    if (selectedEndpoint.value.method === 'GET' && Object.keys(requestParams.value).length > 0) {
      const params = new URLSearchParams()
      Object.entries(requestParams.value).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      url += `?${params.toString()}`
    }
    
    // Prepare request options
    const options: RequestInit = {
      method: selectedEndpoint.value.method,
      headers: {
        'Content-Type': 'application/json',
      }
    }
    
    // Add body for POST, PUT, PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.value.method)) {
      options.body = JSON.stringify(requestParams.value)
    }
    
    // Make the request
    const response = await fetch(url, options)
    const data = await response.json()
    
    apiResponse.value = {
      status: response.status,
      statusText: response.statusText,
      data: data
    }
    
  } catch (err: any) {
    requestError.value = err.message || 'Request failed'
  } finally {
    isLoadingRequest.value = false
  }
}
</script>

<template>
  <div class="bg-gray-50 dark:bg-[#1a1a2e] mt-[6rem]">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-[80vh]">
      <div class="text-center">
        <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading documentation...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex items-center justify-center h-[80vh] p-4">
      <div class="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md shadow-sm">
        <p class="text-red-600 dark:text-red-400 font-medium">{{ error }}</p>
      </div>
    </div>

    <!-- Main Layout -->
    <div v-else-if="apiData" class="flex">

      <!-- Left Sidebar -->
      <aside class="w-64 bg-white dark:bg-[#16162a] border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
        <!-- Logo/Title -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-800">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
              <span class="text-white font-bold text-sm">API</span>
            </div>
            <div>
              <h1 class="font-semibold text-gray-900 dark:text-white text-sm">{{ apiData.info?.title || 'API Docs' }}</h1>
              <p class="text-xs text-gray-500 dark:text-gray-400">v{{ apiData.info?.version || '1.0' }}</p>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="p-2">
          <div v-for="category in apiData.categories" :key="category.name" class="mb-1">
            <!-- Category Header -->
            <button
              @click="toggleSection(category.name)"
              class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <span>{{ category.name }}</span>
              <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-90': openSections[category.name] }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <!-- Groups -->
            <div v-if="openSections[category.name]" class="ml-2 mt-1">
              <div v-for="group in category.groups" :key="group.name" class="mb-1">
                <button
                  @click="toggleGroup(category.name, group.name)"
                  class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <span class="uppercase tracking-wider">{{ group.name }}</span>
                  <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-90': isGroupOpen(category.name, group.name) }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <!-- Endpoints -->
                <div v-if="isGroupOpen(category.name, group.name)" class="ml-2 mt-1 space-y-0.5">
                  <button
                    v-for="endpoint in group.endpoints"
                    :key="endpoint.path"
                    @click="selectEndpoint(category, group, endpoint)"
                    class="w-full flex items-center px-2 py-1.5 text-xs rounded transition-colors"
                    :class="selectedEndpoint?.path === endpoint.path
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
                  >
                    <span
                      class="w-12 text-[10px] font-bold mr-2 px-1.5 py-0.5 rounded text-center"
                      :class="getMethodClass(endpoint.method)"
                    >
                      {{ endpoint.method }}
                    </span>
                    <span class="truncate">{{ endpoint.name }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto bg-white dark:bg-[#1e1e36]">
        <div v-if="selectedEndpoint" class="p-8">
          <!-- Header -->
          <div class="mb-8">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">{{ selectedEndpoint.name }}</h1>
            <div class="flex items-center space-x-3 mb-4">
              <span :class="getMethodClass(selectedEndpoint.method)" class="px-3 py-1 text-xs font-bold rounded">
                {{ selectedEndpoint.method }}
              </span>
              <code class="text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded font-mono">
                {{ selectedEndpoint.path }}
              </code>
            </div>
            <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {{ selectedEndpoint.description }}
            </p>
          </div>

          <!-- Parameters Section -->
          <div v-if="selectedEndpoint.parameters?.length" class="mb-6 parameters-section">
            <button
              @click="showParameters = !showParameters"
              class="flex items-center justify-between w-full py-3 border-b border-gray-200 dark:border-gray-700"
            >
              <div class="flex items-center space-x-2">
                <span class="font-semibold text-gray-900 dark:text-white">Parameters</span>
                <span class="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                  {{ selectedEndpoint.parameters.length }}
                </span>
              </div>
              <span class="text-blue-500 text-sm font-medium">{{ showParameters ? 'HIDE' : 'SHOW' }}</span>
            </button>

            <div v-if="showParameters" class="mt-4 space-y-4">
              <div
                v-for="param in selectedEndpoint.parameters"
                :key="param.name"
                class="pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0"
              >
                <div class="flex items-center space-x-2 mb-1">
                  <code class="text-sm font-semibold text-blue-600 dark:text-blue-400">{{ param.name }}</code>
                  <span class="text-xs text-gray-500 dark:text-gray-500 font-mono">{{ param.type }}</span>
                  <span v-if="param.required" class="text-xs text-red-500 font-medium">required</span>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ param.description }}</p>
                <p v-if="param.default" class="text-xs text-gray-500 mt-1">Default: <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded">{{ param.default }}</code></p>
              </div>
            </div>
          </div>

          <!-- Response Section -->
          <div class="mb-6">
            <button
              @click="showResponse = !showResponse"
              class="flex items-center justify-between w-full py-3 border-b border-gray-200 dark:border-gray-700"
            >
              <div class="flex items-center space-x-2">
                <span class="font-semibold text-gray-900 dark:text-white">Responses</span>
              </div>
              <span class="text-blue-500 text-sm font-medium">{{ showResponse ? 'HIDE' : 'SHOW' }}</span>
            </button>

            <div v-if="showResponse && selectedEndpoint.responseExample" class="mt-4">
              <!-- Response Status -->
              <div class="flex items-center space-x-3 mb-3">
                <span class="text-emerald-500 font-semibold">200</span>
                <span class="text-gray-600 dark:text-gray-400 text-sm">Success</span>
              </div>

              <!-- Code Block -->
              <div class="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <div class="bg-gray-800 dark:bg-gray-900 px-4 py-2 flex items-center justify-between">
                  <span class="text-gray-400 text-xs font-medium">Example</span>
                  <div class="flex items-center space-x-3">
                    <button
                      @click="copyCode(JSON.stringify(selectedEndpoint.responseExample, null, 2))"
                      class="text-gray-400 hover:text-white text-xs font-medium"
                    >
                      COPY
                    </button>
                  </div>
                </div>
                <pre class="bg-gray-900 dark:bg-[#0d0d1a] p-4 overflow-x-auto text-sm"><code class="text-gray-300">{{ JSON.stringify(selectedEndpoint.responseExample, null, 2) }}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="flex items-center justify-center h-full">
          <div class="text-center">
            <p class="text-gray-500 dark:text-gray-400">Select an endpoint from the sidebar</p>
          </div>
        </div>
      </main>

      <!-- Right Sidebar -->
      <aside class="w-72 bg-gray-50 dark:bg-[#16162a] border-l border-gray-200 dark:border-gray-800 overflow-y-auto">
        <div v-if="selectedEndpoint" class="p-4">
          <!-- Request URL -->
          <div class="mb-6">
            <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Request URL</h3>
            <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <code class="text-xs text-gray-700 dark:text-gray-300 font-mono break-all">{{ selectedEndpoint.path }}</code>
            </div>
          </div>

          <!-- Query Parameters Quick View -->
          <div v-if="selectedEndpoint.parameters?.length" class="mb-6">
            <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Query parameters</h3>
            <div class="space-y-2">
              <div
                v-for="param in showAllParams ? selectedEndpoint.parameters : selectedEndpoint.parameters.slice(0, 5)"
                :key="param.name"
                class="text-xs"
              >
                <span class="text-gray-700 dark:text-gray-300">{{ param.name }}</span>
                <span v-if="param.required" class="text-red-500 ml-1">*</span>
              </div>
              
              <!-- Show More Button -->
              <button 
                v-if="selectedEndpoint.parameters.length > 5 && !showAllParams" 
                @click="toggleAllParams"
                class="text-xs text-blue-500 hover:text-blue-600 hover:underline font-medium cursor-pointer transition-colors"
              >
                +{{ selectedEndpoint.parameters.length - 5 }} more
              </button>
              
              <!-- Show Less Button -->
              <button 
                v-if="showAllParams" 
                @click="toggleAllParams"
                class="text-xs text-blue-500 hover:text-blue-600 hover:underline font-medium cursor-pointer transition-colors"
              >
                - show less
              </button>
            </div>
          </div>

          <!-- Try Button -->
          <button 
            @click="openTryModal"
            class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            Try it now
          </button>

          <!-- API Info -->
          <div v-if="apiData.info" class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">API Info</h3>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Base URL</span>
                <code class="text-gray-700 dark:text-gray-300 font-mono">{{ apiData.info.baseUrl }}</code>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Version</span>
                <span class="text-gray-700 dark:text-gray-300">{{ apiData.info.version }}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Try It Modal -->
    <div 
      v-if="showTryModal && selectedEndpoint" 
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="closeTryModal"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">Try {{ selectedEndpoint.name }}</h2>
          <button 
            @click="closeTryModal"
            class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="mb-4">
          <div class="flex items-center space-x-3 mb-4">
            <span :class="getMethodClass(selectedEndpoint.method)" class="px-3 py-1 text-xs font-bold rounded">
              {{ selectedEndpoint.method }}
            </span>
            <code class="text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded font-mono break-all">
              {{ apiData?.info?.baseUrl || '' }}{{ selectedEndpoint.path }}
            </code>
          </div>

          <div v-if="selectedEndpoint.parameters?.length" class="space-y-3 mb-4">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Parameters</h3>
            <div v-for="param in selectedEndpoint.parameters" :key="param.name" class="space-y-1">
              <label class="block text-sm text-gray-700 dark:text-gray-300">
                {{ param.name }}
                <span v-if="param.required" class="text-red-500">*</span>
                <span class="text-xs text-gray-500 ml-2">({{ param.type }})</span>
              </label>
              <input
                v-model="requestParams[param.name]"
                type="text"
                :placeholder="param.default || `Enter ${param.name}`"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p v-if="param.description" class="text-xs text-gray-500 dark:text-gray-400">{{ param.description }}</p>
            </div>
          </div>

          <!-- Response Section -->
          <div v-if="apiResponse || requestError" class="mt-6">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-3">Response</h3>
            
            <!-- Error Display -->
            <div v-if="requestError" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div class="flex items-start">
                <svg class="w-5 h-5 text-red-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p class="text-sm font-medium text-red-800 dark:text-red-400">Request Failed</p>
                  <p class="text-sm text-red-700 dark:text-red-300 mt-1">{{ requestError }}</p>
                </div>
              </div>
            </div>

            <!-- Success Display -->
            <div v-if="apiResponse" class="space-y-3">
              <div class="flex items-center space-x-3">
                <span 
                  :class="apiResponse.status >= 200 && apiResponse.status < 300 ? 'text-emerald-500' : 'text-red-500'" 
                  class="font-semibold"
                >
                  {{ apiResponse.status }}
                </span>
                <span class="text-gray-600 dark:text-gray-400 text-sm">{{ apiResponse.statusText }}</span>
              </div>

              <div class="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <div class="bg-gray-800 dark:bg-gray-900 px-4 py-2 flex items-center justify-between">
                  <span class="text-gray-400 text-xs font-medium">Response Body</span>
                  <button
                    @click="copyCode(JSON.stringify(apiResponse.data, null, 2))"
                    class="text-gray-400 hover:text-white text-xs font-medium"
                  >
                    COPY
                  </button>
                </div>
                <pre class="bg-gray-900 dark:bg-[#0d0d1a] p-4 overflow-x-auto text-sm max-h-64"><code class="text-gray-300">{{ JSON.stringify(apiResponse.data, null, 2) }}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <div class="flex space-x-3 mt-6">
          <button 
            @click="closeTryModal"
            class="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium py-2.5 px-4 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
          <button 
            @click="sendRequest"
            :disabled="isLoadingRequest"
            class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg v-if="isLoadingRequest" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ isLoadingRequest ? 'Sending...' : 'Send Request' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Hide scrollbar */
::-webkit-scrollbar {
  width: 0;
  height: 0;
}

* {
  scrollbar-width: none;
}

/* Code styling */
code {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

pre code {
  font-size: 12px;
  line-height: 1.6;
}

/* Smooth transitions */
button, a {
  transition: all 0.15s ease;
}

/* Animation */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 1s linear infinite;
}
</style>