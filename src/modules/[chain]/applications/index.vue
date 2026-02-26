<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useBlockchain, useFormatter } from '@/stores'
import { PageRequest, type Pagination, type Application, type Coin } from '@/types'
import type { PaginatedBalances } from '@/types/bank'
import { Icon } from '@iconify/vue'

const props = defineProps<{ chain: string }>()

const blockchain = useBlockchain()
const chainStore = useBlockchain()
const format = useFormatter()
// Main data list
const list = ref<Application[]>([])
const loading = ref(false)
const balanceLoading = ref<Record<string, boolean>>({})

const pageRequest = ref(new PageRequest())
const pageResponse = ref({} as Pagination)

const currentPage = ref(1)
const itemsPerPage = ref(25)

// Track expanded rows for delegatee addresses
const expandedDelegateeRows = ref<Record<string, boolean>>({})

// Status text
const value = ref('stake')
const statusText = computed(() => (value.value === 'stake' ? 'Staked' : 'Unstaked'))

// Filter and sort state variables
const serviceFilter = ref('')
const statusFilter = ref('all')
const sortBy = ref<'stake' | 'services' | 'status'>('stake')
const sortOrder = ref<'asc' | 'desc'>('desc')

// Server-side pagination logic
const totalPages = computed(() => {
  const total = parseInt(pageResponse.value.total || '0')
  if (total === 0) return 0
  return Math.ceil(total / itemsPerPage.value)
})

const totalApplications = computed(() => parseInt(pageResponse.value.total || '0'))

// Extract unique service names from all loaded applications
const availableServices = computed(() => {
  const services = new Set<string>()
  list.value.forEach((app) => {
    if (app.service_configs && Array.isArray(app.service_configs)) {
      app.service_configs.forEach((sc: any) => {
        const serviceName = sc.service_name?.length > 0 ? sc.service_name : sc.service_id
        if (serviceName) {
          services.add(serviceName)
        }
      })
    }
  })
  return Array.from(services).sort()
})

// Filter by service helper function
function filterByService(item: Application, serviceName: string): boolean {
  if (!serviceName) return true
  if (!item.service_configs || !Array.isArray(item.service_configs)) return false
  
  return item.service_configs.some((sc: any) => {
    const scName = sc.service_name?.length > 0 ? sc.service_name : sc.service_id
    return scName === serviceName
  })
}

// Client-side filtering and sorting (applied after server returns page data)
const sortedList = computed(() => {
  // First apply service filter (client-side)
  let filtered = list.value.filter((item) => filterByService(item, serviceFilter.value))
  
  // Then apply sorting
  return filtered.sort((a, b) => {
    if (sortBy.value === 'stake') {
      const aStake = parseInt(a.stake?.amount || '0')
      const bStake = parseInt(b.stake?.amount || '0')
      return sortOrder.value === 'desc' ? bStake - aStake : aStake - bStake
    } else if (sortBy.value === 'services') {
      const aServices = a.service_configs?.length || 0
      const bServices = b.service_configs?.length || 0
      if (aServices !== bServices) {
        return sortOrder.value === 'desc' ? bServices - aServices : aServices - bServices
      }
      // If same count, sort alphabetically by first service name
      const aFirstService = a.service_configs?.[0] 
        ? (a.service_configs[0].service_name?.length > 0 ? a.service_configs[0].service_name : a.service_configs[0].service_id) || ''
        : ''
      const bFirstService = b.service_configs?.[0]
        ? (b.service_configs[0].service_name?.length > 0 ? b.service_configs[0].service_name : b.service_configs[0].service_id) || ''
        : ''
      const comparison = aFirstService.localeCompare(bFirstService)
      return sortOrder.value === 'desc' ? -comparison : comparison
    } else if (sortBy.value === 'status') {
      const aStatus = getApplicationStatus(a)
      const bStatus = getApplicationStatus(b)
      const aIsStaked = aStatus.label === 'Staked'
      const bIsStaked = bStatus.label === 'Staked'
      
      if (aIsStaked !== bIsStaked) {
        // Staked comes before Unstaked when descending, vice versa when ascending
        if (sortOrder.value === 'desc') {
          return aIsStaked ? -1 : 1
        } else {
          return aIsStaked ? 1 : -1
        }
      }
      // If same status, sort by stake amount
      const aStake = parseInt(a.stake?.amount || '0')
      const bStake = parseInt(b.stake?.amount || '0')
      return sortOrder.value === 'desc' ? bStake - aStake : aStake - bStake
    }
    return 0
  })
})

// 🔹 Watch for page changes
watch(currentPage, () => {
  loadApplications()
})

// 🔹 Watch for page size changes
watch(itemsPerPage, () => {
  currentPage.value = 1
  loadApplications()
})

// 🔹 Watch for filter changes (reset pagination and reload)
watch(serviceFilter, () => {
  currentPage.value = 1
  loadApplications()
})

watch(statusFilter, () => {
  currentPage.value = 1
  loadApplications()
})

// 🔹 Watch for sort changes (no API call needed, just re-sort client-side via computed)
// Note: sortBy and sortOrder changes are handled automatically by the sortedList computed property

// Load data from API
async function loadApplications() {
  loading.value = true
  try {
    // Build API URL with query parameters
    const params = new URLSearchParams()
    params.append('chain', apiChainName.value)
    params.append('page', currentPage.value.toString())
    params.append('limit', itemsPerPage.value.toString())
    
    // Add status filter if not 'all'
    if (statusFilter.value !== 'all') {
      // Map UI filter values to API status values
      const apiStatus = statusFilter.value === 'unstaked' ? 'unstake_requested' : statusFilter.value
      params.append('status', apiStatus)
    }
    
    const apiUrl = `/api/v1/applications?${params.toString()}`
    const apiRes = await fetch(apiUrl)
    const apiData = await apiRes.json()
    
    if (apiRes.ok && apiData.data) {
      // Map API response format to Application type structure
      list.value = apiData.data.map((item: any) => ({
        address: item.address,
        stake: {
          denom: item.stake_denom || item.stake?.denom || 'upokt',
          amount: (item.staked_amount || item.stake?.amount || '0').toString()
        },
        balance: item.balance, // May need to fetch separately
        service_configs: item.service_configs || item.services || [],
        chains: item.chains || [],
        delegatee_gateway_addresses: item.delegatee_gateway_addresses || [],
        status: item.status,
        unstake_session_end_height: item.unstake_session_end_height,
        unbonding_time: item.unbonding_time,
        unbonding_height: item.unbonding_height,
        state: item.state
      }))
      
      // Map pagination response
      pageResponse.value = {
        total: apiData.meta?.total?.toString() || '0',
        next_key: undefined
      }
      
      // 🔹 Trigger async, batched balance fetching (non-blocking for main loading state)
      fetchBalancesInBatches().catch((e) => {
        console.error('Error fetching application balances in batches:', e)
      })
    } else {
      console.error('Error loading applications from API:', apiData)
      list.value = []
      pageResponse.value = {} as Pagination
    }
  } catch (error) {
    console.error('Error loading applications:', error)
    list.value = []
    pageResponse.value = {} as Pagination
  } finally {
    loading.value = false
  }
}

async function waitForRpc() {
  while (!chainStore.rpc) {
    console.log('⏳ Waiting for chainStore.rpc...')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

// 🔹 Fetch balances concurrently in batches of 10 without blocking table render
async function fetchBalancesInBatches() {
  if (!chainStore.rpc) {
    await waitForRpc()
  }

  const itemsNeedingBalance = list.value.filter(
    (app) => !app.balance || !app.balance.amount
  )

  const batchSize = 10

  for (let i = 0; i < itemsNeedingBalance.length; i += batchSize) {
    const batch = itemsNeedingBalance.slice(i, i + batchSize)

    await Promise.all(
      batch.map(async (app) => {
        const key = app.address
        if (!key) return

        balanceLoading.value[key] = true

        try {
          const bal: PaginatedBalances = await chainStore.rpc!.getBankBalances(
            app.address
          )
          const upokt =
            bal.balances.find((b) => b.denom === 'upokt') || {
              denom: 'upokt',
              amount: '0',
            }
          app.balance = upokt as Coin
        } catch (e) {
          console.error('Error fetching balance for', app.address, e)
          app.balance = app.balance || { denom: 'upokt', amount: '0' }
        } finally {
          balanceLoading.value[key] = false
        }
      })
    )
  }
}

// Pagination methods
function goToFirst() {
  if (currentPage.value !== 1) {
    currentPage.value = 1
  }
}

function goToLast() {
  if (currentPage.value !== totalPages.value && totalPages.value > 0) {
    currentPage.value = totalPages.value
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

// Helper function to truncate address
function truncateAddress(address: string, maxLength: number = 20): string {
  if (address.length <= maxLength) return address
  return address.substring(0, maxLength) + '...'
}

// Toggle expanded state for delegatee addresses
function toggleDelegateeExpanded(address: string) {
  expandedDelegateeRows.value[address] = !expandedDelegateeRows.value[address]
}

// add this helper to compute application status (Staked / Unstaked) with classes
function getApplicationStatus(item: any) {
  if (!item) return { label: '-', classes: '' }
  const raw = (item.status || item.state || '').toString()
  const s = raw.toLowerCase()
  // explicit indicators for unbonding/unstaking
  if (s.includes('unbond') || s.includes('unstak') || item.unbonding_time || item.unbonding_height) {
    return { label: 'Unstaked', classes: 'bg-[#E03834]/10 text-[#E03834]' }
  }
  // treat as staked if status mentions bond/stake or stake amount > 0
  const stakeAmt = Number(item.stake?.amount || '0')
  if (s.includes('bond') || s.includes('stake') || stakeAmt > 0) {
    return { label: 'Staked', classes: 'bg-[#60BC29]/10 text-[#60BC29]' }
  }
  return { label: '-', classes: '' }
}

// Mounted
onMounted(() => {
  loadApplications()
  loadNetworkStats()
})

// Network Stats
const networkStats = ref({
  wallets: 0,
  applications: 0,
  totalStakedAmount: 0,
  unstakingCount: 0,
  totalUnstakingTokens24h: 0,
})

// Cache control
const networkStatsCacheTime = ref(0)
const CACHE_EXPIRATION_MS = 60000

// Get API chain name helper
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  }
  return chainMap[chainName] || chainName || 'pocket-lego-testnet'
}

const apiChainName = computed(() =>
  getApiChainName(chainStore.current?.chainName || props.chain || 'pocket-beta')
)

// Load network stats
async function loadNetworkStats() {
  const now = Date.now()
  if (now - networkStatsCacheTime.value < CACHE_EXPIRATION_MS && networkStats.value.wallets > 0) {
    return
  }

  const pageRequest = new PageRequest()
  pageRequest.limit = 1

  try {
    // Fetch from RPC for total count
    const [applicationsData] = await Promise.all([
      blockchain.rpc.getApplications(pageRequest),
    ])

    networkStats.value.applications = parseInt(applicationsData.pagination?.total || '0')
    
    // Fetch from API for aggregate statistics
    try {
      const apiUrl = `/api/v1/applications?chain=${apiChainName.value}&page=1&limit=1`
      const apiRes = await fetch(apiUrl)
      const apiData = await apiRes.json()

      if (apiRes.ok && apiData.meta) {
        networkStats.value.totalStakedAmount = apiData.meta.totalStakedAmount || 0
        networkStats.value.unstakingCount = apiData.meta.unstakingCount || 0
      }
    } catch (apiError) {
      console.error('Error loading API stats:', apiError)
    }

    // Calculate 24h unstaking tokens: fetch unstake_requested apps, filter by last_seen within 24h
    try {
      const unstakingUrl = `/api/v1/applications?chain=${apiChainName.value}&page=1&limit=500&status=unstake_requested`
      const unstakingRes = await fetch(unstakingUrl)
      const unstakingData = await unstakingRes.json()
      if (unstakingRes.ok && unstakingData.data) {
        const yesterday = Date.now() - 24 * 60 * 60 * 1000
        networkStats.value.totalUnstakingTokens24h = unstakingData.data
          .filter((app: any) => app.last_seen && new Date(app.last_seen).getTime() > yesterday)
          .reduce((sum: number, app: any) => sum + Number(app.staked_amount || 0), 0)
      }
    } catch (e) {
      console.error('Error computing application 24h unstaking tokens:', e)
    }
    
    networkStatsCacheTime.value = now
  } catch (error) {
    console.error('Error loading network stats:', error)
  }
}
</script>

<template>
  <div class="mb-[2vh] pt-[6.5rem]">
    <p class="bg-[#ffffff] hover:bg-base-200 text-2xl w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">Applications</p>

    <div class="grid sm:grid-cols-1 md:grid-cols-4 py-4 gap-4 mb-4">
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Staked Applications</div>
          <div class="font-bold">{{ networkStats.applications.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Staked Tokens</div>
          <div class="font-bold">{{ format.formatToken({ denom: 'upokt', amount: networkStats.totalStakedAmount.toString() }) }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Unstaking Applications</div>
          <div class="font-bold">{{ networkStats.unstakingCount.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Unstaking Tokens (24h)</div>
          <div class="font-bold">{{ format.formatToken({ denom: 'upokt', amount: networkStats.totalUnstakingTokens24h.toString() }) }}</div>
        </span>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="bg-[#ffffff] p-4 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Services Filter -->
        <div class="flex items-center gap-1.5">
          <Icon icon="mdi:filter" class="text-base-content/60 text-sm" />
          <select 
            v-model="serviceFilter" 
            class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-40 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <option value="">All Services</option>
            <option v-for="service in availableServices" :key="service" :value="service">
              {{ service }}
            </option>
          </select>
        </div>

        <!-- Status Filter -->
        <div class="flex items-center gap-1.5">
          <Icon icon="mdi:check-circle-outline" class="text-base-content/60 text-sm" />
          <select 
            v-model="statusFilter" 
            class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-28 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <option value="all">All</option>
            <option value="staked">Staked</option>
            <option value="unstaked">Unstaked</option>
          </select>
        </div>

        <!-- Sort By -->
        <div class="flex items-center gap-1.5">
          <Icon icon="mdi:sort" class="text-base-content/60 text-sm" />
          <select 
            v-model="sortBy" 
            class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-32 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <option value="stake">Stake</option>
            <option value="services">Services</option>
            <option value="status">Status</option>
          </select>
        </div>

        <!-- Sort Order Toggle -->
        <button
          @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
          class="btn btn-xs h-8 min-h-8 px-2 gap-1"
          :class="sortOrder === 'desc' ? 'btn-primary' : 'btn-ghost'"
          :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'"
        >
          <Icon :icon="sortOrder === 'desc' ? 'mdi:sort-descending' : 'mdi:sort-ascending'" class="text-sm" />
        </button>
      </div>
    </div>

    <div class="bg-base-200 p-2 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <div class="overflow-auto" style="max-height:calc(100vh - 22rem)">
      <table class="table w-full table-compact rounded-xl">
        <thead class="bg-base-200 dark:bg-[rgba(255,255,255,.03)] sticky top-0 border-0">
          <tr class="text-sm font-semibold">
            <th>Rank</th>
            <th>Address</th>
            <th>Stake</th>
            <th>Balance</th>
            <th>No. of Services</th>
            <th>Services</th>
            <th>Status</th>
            <th>Delegated To</th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="loading" class="text-center">
            <td colspan="8" class="py-8">
              <div class="flex justify-center items-center">
                <div class="loading loading-spinner loading-md"></div>
                <span class="ml-2">Loading applications...</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="sortedList.length === 0" class="text-center">
            <td colspan="8" class="py-8">
              <div class="text-gray-500">No applications found</div>
            </td>
          </tr>
          <tr
            v-else
            v-for="(item, index) in sortedList"
            :key="item.address"
            class="hover:bg-gray-100 dark:hover:bg-[rgba(255,255,255,0.06)] dark:bg-base-200 bg-white border-0 rounded-xl"
          >
            <td>{{ index + 1 + (currentPage - 1) * itemsPerPage }}</td>

            <td>
              <div class="flex flex-col">
                <RouterLink
                  :to="`/${chainStore.chainName}/account/${item?.address}`"
                  class="text-sm text-[#09279F] dark:invert font-medium truncate"
                >
                  {{ item.address }}
                </RouterLink>
                <span class="text-xs text-[#171C1F] dark:text-secondary truncate">
                  {{ item.address }}
                </span>
              </div>
            </td>

            <td class="font-bold dark:text-secondary">{{ format.formatToken(item.stake) }}</td>
            <td class="dark:text-secondary">
              <span v-if="balanceLoading[item.address] && !item.balance">
                <span class="loading loading-spinner loading-xs"></span>
              </span>
              <span v-else>
                {{ item.balance ? format.formatToken(item.balance) : "-" }}
              </span>
            </td>
            <td>{{ item.chains?.length || 0 }}</td>
            <td>
              {{ item.chains?.length ? item.chains.join(', ') : '-' }}
            </td>
            <!-- <td>
              {{
                item.service_configs
                  ?.map((sc: any) =>
                    sc.service_name?.length > 0 ? sc.service_name : sc.service_id
                  )
                  .join(', ')
              }}
            </td> -->
            <td class="">
              <span
                class="text-xs truncate py-1 px-3 rounded-full inline-flex items-center gap-2"
                :class="getApplicationStatus(item).classes"
              >
                {{ getApplicationStatus(item).label }}
              </span>
            </td>
            <td>
              <div v-if="item.delegatee_gateway_addresses && item.delegatee_gateway_addresses.length > 0">
                <div v-if="expandedDelegateeRows[item.address]">
                  <!-- Expanded view: show all addresses -->
                  <div class="flex flex-col gap-1">
                    <RouterLink
                      v-for="(addr, idx) in item.delegatee_gateway_addresses"
                      :key="idx"
                      :to="`/${chainStore.chainName}/account/${addr}`"
                      class="text-sm text-[#09279F] dark:invert font-mono hover:underline"
                    >
                      {{ addr }}
                    </RouterLink>
                    <button
                      @click="toggleDelegateeExpanded(item.address)"
                      class="text-xs text-[#007bff] hover:underline mt-1"
                    >
                      Show less
                    </button>
                  </div>
                </div>
                <div v-else>
                  <!-- Collapsed view: show first address truncated -->
                  <div class="flex items-center gap-2">
                    <RouterLink
                      :to="`/${chainStore.chainName}/account/${item.delegatee_gateway_addresses[0]}`"
                      class="text-sm text-[#09279F] dark:invert font-mono hover:underline"
                    >
                      {{ truncateAddress(item.delegatee_gateway_addresses[0]) }}
                    </RouterLink>
                    <button
                      v-if="item.delegatee_gateway_addresses.length > 1"
                      @click="toggleDelegateeExpanded(item.address)"
                      class="text-xs text-[#007bff] hover:underline"
                    >
                      +{{ item.delegatee_gateway_addresses.length - 1 }} more
                    </button>
                  </div>
                </div>
              </div>
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <!-- Pagination Bar -->
      <div class="flex justify-between items-center gap-4 my-6 px-6">
        <!-- Page Size Dropdown -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">Show:</span>
          <select 
            v-model="itemsPerPage" 
            class="select select-bordered select-sm w-20"
          >
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          <span class="text-sm text-gray-600">per page</span>
        </div>

        <!-- Pagination Info and Controls -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">
            Showing {{ ((currentPage - 1) * itemsPerPage) + 1 }} to {{ Math.min(currentPage * itemsPerPage, totalApplications) }} of {{ totalApplications }} applications
          </span>
          
          <div class="flex items-center gap-1">
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="goToFirst"
              :disabled="currentPage === 1 || totalPages === 0"
            >
              First
            </button>
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="prevPage"
              :disabled="currentPage === 1 || totalPages === 0"
            >
              &lt;
            </button>

            <span class="text-xs px-2">
              Page {{ currentPage }} of {{ totalPages }}
            </span>

            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="nextPage" 
              :disabled="currentPage === totalPages || totalPages === 0"
            >
              &gt;
            </button>
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="goToLast" 
              :disabled="currentPage === totalPages || totalPages === 0"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<route>
  {
    meta: {
      i18n: 'applications',
      order: 4
    }
  }
  </route>
<style scoped>
.page-btn:hover {
  background-color: #e9ecef;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
