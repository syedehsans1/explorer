<script lang="ts" setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useBaseStore, useBlockchain, useFormatter } from '@/stores'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { fetchTransactions, type ApiTransaction, type TransactionFilters } from '@/libs/transactions'
import { secp256k1PubKeyToAccountAddress } from '@/libs/address'
import { isBech32Address } from '@/libs/utils'
import { useSEO } from '@/composables/useSEO';
import { PageRequest } from '@/types'
import { decodeTxRaw } from '@cosmjs/proto-signing'
import { fromBase64 } from '@cosmjs/encoding'
import { hashTx } from '@/libs'

const props = defineProps(['chain'])
const router = useRouter()

const tab = ref('recent')
const base = useBaseStore()
const chainStore = useBlockchain()
const format = useFormatter()

// SEO Meta Tags
const chainName = computed(() => chainStore.current?.chainName || props.chain || 'Pocket Network');
useSEO({
  title: `${chainName.value} Transactions`,
  description: `Explore all transactions on the ${chainName.value} blockchain. Search, filter, and view transaction details, hashes, fees, and status on the Pocket Network Explorer.`,
  keywords: `${chainName.value}, transactions, tx, transaction hash, blockchain transactions, transaction explorer`,
});

const hashReg = /^[A-Z\d]{64}$/
const hash = ref('')

// Map frontend chain names to API chain names
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  }
  return chainMap[chainName] || chainName || 'pocket-lego-testnet'
}

const current = chainStore?.current?.chainName || props.chain || 'pocket-beta'
const apiChainName = getApiChainName(current)

// ✅ Current block height watch karne ke liye
const currentBlockHeight = computed(() => {
  const h = base.latest?.block?.header?.height
  return h ? Number(h) : 0
})

// 🔹 Pagination state
const currentPage = ref(1)
const itemsPerPage = ref(25)
const totalTransactions = ref(0)
const totalPages = ref(0)
const transactions = ref<ApiTransaction[]>([])
const loading = ref(false)

// ✅ Auto-prepend tracking
const lastKnownTxHash = ref<string>('')
const isPrepending = ref(false)
const lastKnownBlockHeight = ref<number>(0)

// Fallback state
const isNodeFallback = ref(false)
const fallbackError = ref('')

// 🔹 Last 24H Transactions
const tx24HCount = ref(0)
const failedLast24h = ref(0)

const currentTxCount = computed(() => {
  return base.latest?.block?.data?.txs?.length ?? 0
})

// 🔹 Page size options
const pageSizeOptions = [10, 25, 50, 100]

// 🔹 Filter state
const selectedTypeTab = ref<'all' | 'send' | 'claim' | 'proof' | 'governance' | 'staking'>('all')
const statusFilter = ref<string>('')
const startDate = ref<string>('')
const endDate = ref<string>('')
const minAmount = ref<number | undefined>(undefined)
const maxAmount = ref<number | undefined>(undefined)
const sortBy = ref<'timestamp' | 'amount' | 'fee' | 'block_height' | 'type' | 'status'>('timestamp')
const sortOrder = ref<'asc' | 'desc'>('desc')
const showAdvancedFilters = ref(false)

// 🔹 Type tab mappings
const typeTabMap: Record<string, string[]> = {
  all: [],
  send: ['MsgSend (bank)', 'MsgMultiSend (bank)'],
  claim: ['MsgCreateClaim (proof)'],
  proof: ['MsgSubmitProof (proof)'],
  governance: [
    'MsgSubmitProposal (governance)',
    'MsgVote (governance)',
    'MsgDeposit (governance)',
    'MsgVoteWeighted (governance)'
  ],
  staking: [
    'MsgDelegate (node)',
    'MsgUndelegate (node)',
    'MsgBeginRedelegate (node)',
    'MsgStakeApplication (application)',
    'MsgUnstakeApplication (application)',
    'MsgStakeSupplier (supplier)',
    'MsgUnstakeSupplier (supplier)',
    'MsgStakeGateway (gateway)',
    'MsgUnstakeGateway (gateway)'
  ]
}

// 🔹 Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// 🔹 Server se transactions fetch karo
async function getTransactionsFromServer(filters: TransactionFilters) {
  const data = await fetchTransactions(filters)

  if (!data || !data.data) {
    throw new Error('Server request failed')
  }

  return {
    transactions: data.data || [],
    total: data.meta?.total || 0,
    totalPages: data.meta?.totalPages || 0,
    failedLast24h: data.meta?.failedLast24h ?? 0
  }
}

// ✅ Server se latest transactions fetch (auto-prepend ke liye)
async function fetchLatestTxsFromServer(limit = 5): Promise<ApiTransaction[]> {
  try {
    const url = `/api/v1/transactions?chain=${apiChainName}&page=1&limit=${limit}&sort_by=timestamp&sort_order=desc`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

// ✅ Naya transaction prepend karo - poora reload nahi
async function prependNewTransactions() {
  if (isPrepending.value) return
  if (currentPage.value !== 1) return
  if (transactions.value.length === 0) return
  if (isNodeFallback.value) return
  // Skip prepend when any filter is active — fetched txs won't match the filter
  if (statusFilter.value || selectedTypeTab.value !== 'all' || startDate.value || endDate.value || minAmount.value !== undefined || maxAmount.value !== undefined) return

  isPrepending.value = true

  try {
    const latestTxs = await fetchLatestTxsFromServer(10)
    if (!latestTxs.length) return

    // Pehli existing transaction ka hash
    const firstExistingHash = transactions.value[0]?.hash

    // Naye transactions dhundo jo existing list mein nahi hain
    const newTxs = latestTxs.filter(tx =>
      !transactions.value.some(existing => existing.hash === tx.hash)
    )

    if (newTxs.length === 0) return

    // Table ke upar naye transactions add karo
    transactions.value = [...newTxs, ...transactions.value]

    // itemsPerPage limit maintain karo
    if (transactions.value.length > itemsPerPage.value) {
      transactions.value = transactions.value.slice(0, itemsPerPage.value)
    }

    // Total count update karo
    totalTransactions.value = totalTransactions.value + newTxs.length

    // Last known hash update karo
    if (transactions.value.length > 0) {
      lastKnownTxHash.value = transactions.value[0].hash
    }
  } finally {
    isPrepending.value = false
  }
}

// 🔹 Node se transactions fetch karo (fallback)
async function getTransactionsFromNode() {
  try {
    console.log('[Node Fallback TX] Starting transaction node fallback...')

    let rpcRetries = 0
    while (!chainStore.rpc && rpcRetries < 20) {
      await new Promise(resolve => setTimeout(resolve, 500))
      rpcRetries++
    }

    if (!chainStore.rpc) throw new Error('RPC not available')

    if (!base.latest?.block?.header?.height) {
      try {
        const latestBlock = await chainStore.rpc.getBaseBlockLatest()
        if (latestBlock?.block?.header?.height) {
          base.latest = latestBlock
        }
      } catch (err) {
        console.warn('[Node Fallback TX] Could not fetch latest block:', err)
      }
    }

    let retries = 0
    while (!base.latest?.block?.header?.height && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 500))
      retries++
    }

    if (!base.latest?.block?.header?.height) {
      throw new Error('Node not responding - no block data available')
    }

    const currentHeight = Number(base.latest.block.header.height)
    const blocksToFetch = 50
    const startBlock = Math.max(currentHeight - ((currentPage.value - 1) * blocksToFetch) - blocksToFetch + 1, 1)
    const endBlock = Math.max(currentHeight - ((currentPage.value - 1) * blocksToFetch), 1)

    const blockPromises = []
    for (let height = endBlock; height >= startBlock; height--) {
      blockPromises.push(
        chainStore.rpc.getBaseBlockAt(String(height)).catch(() => null)
      )
    }

    const fetchedBlocks = await Promise.all(blockPromises)
    const allNodeTxs: ApiTransaction[] = []

    fetchedBlocks.forEach((block: any, blockIndex: number) => {
      if (!block || !block.block) return

      const height = endBlock - blockIndex
      const blockTime = block.block.header?.time || new Date().toISOString()
      const rawTxs = block.block.data?.txs || []

      rawTxs.forEach((txBase64: string, txIndex: number) => {
        try {
          if (!txBase64) return
          const raw = fromBase64(txBase64)
          const txHash = hashTx(raw)
          const decodedTx = decodeTxRaw(raw)
          const messages = decodedTx.body?.messages || []
          if (messages.length === 0) return

          const firstMsg: any = messages[0]
          let msgType = firstMsg.typeUrl || 'Unknown'
          if (msgType.includes('.')) {
            const parts = msgType.split('.')
            msgType = parts[parts.length - 1]
          }

          const msgValue = firstMsg.value || {}
          let amount = '0'
          if (msgValue.amount && Array.isArray(msgValue.amount)) {
            amount = msgValue.amount[0]?.amount || '0'
          } else if (msgValue.amount) {
            amount = String(msgValue.amount)
          }

          let fee = '0'
          if (decodedTx.authInfo?.fee?.amount && Array.isArray(decodedTx.authInfo.fee.amount)) {
            fee = decodedTx.authInfo.fee.amount[0]?.amount || '0'
          }

          allNodeTxs.push({
            id: `${height}-${txIndex}`,
            hash: txHash,
            block_id: block.block_id?.hash || '',
            block_height: parseInt(String(height)),
            status: 'success',
            amount,
            type: msgType,
            fee,
            timestamp: blockTime,
            sender: msgValue.fromAddress || msgValue.sender || '',
            recipient: msgValue.toAddress || msgValue.recipient || '',
            memo: decodedTx.body?.memo || '',
            chain: apiChainName,
            tx_data: decodedTx
          })
        } catch (err) {
          console.warn(`[Node Fallback TX] Error decoding tx at height ${height}:`, err)
        }
      })
    })

    const paginatedTxs = allNodeTxs.slice(0, itemsPerPage.value)
    const avgTxPerBlock = allNodeTxs.length / blocksToFetch || 1
    const totalEstimate = Math.floor(currentHeight * avgTxPerBlock)

    return {
      transactions: paginatedTxs,
      total: totalEstimate,
      totalPages: Math.ceil(totalEstimate / itemsPerPage.value),
      failedLast24h: 0
    }
  } catch (error: any) {
    console.error('[Node Fallback TX] Node fallback failed:', error)
    throw error
  }
}

// 🔹 Main load function
async function loadTransactions() {
  loading.value = true
  fallbackError.value = ''

  try {
    const filters: TransactionFilters = {
      chain: apiChainName,
      page: currentPage.value,
      limit: itemsPerPage.value,
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
    }

    const selectedTypes = typeTabMap[selectedTypeTab.value]
    if (selectedTypes.length === 1) {
      filters.type = selectedTypes[0]
    } else if (selectedTypes.length > 1) {
      filters.types = selectedTypes
    }
    if (statusFilter.value) filters.status = statusFilter.value === 'success' ? "true" : "pending"
    if (startDate.value) filters.start_date = new Date(startDate.value).toISOString()
    if (endDate.value) filters.end_date = new Date(endDate.value).toISOString()
    if (minAmount.value !== undefined) filters.min_amount = minAmount.value
    if (maxAmount.value !== undefined) filters.max_amount = maxAmount.value

    const serverData = await getTransactionsFromServer(filters)
    transactions.value = serverData.transactions
    totalTransactions.value = serverData.total
    totalPages.value = serverData.totalPages
    // NOTE: do NOT overwrite failedLast24h here — API always returns 0 for it.
    // It is maintained independently by getFailed24HTransactionsCount().
    isNodeFallback.value = false

  } catch (serverError) {
    console.warn('Server fetch failed, trying node fallback:', serverError)

    try {
      const nodeData = await getTransactionsFromNode()
      transactions.value = nodeData.transactions
      totalTransactions.value = nodeData.total
      totalPages.value = nodeData.totalPages
      isNodeFallback.value = true
    } catch (nodeError: any) {
      console.error('Node fallback also failed:', nodeError)
      fallbackError.value = nodeError.message || 'Both server and node are unavailable'
      isNodeFallback.value = true
      if (transactions.value.length === 0) {
        transactions.value = []
        totalTransactions.value = 0
        totalPages.value = 0
      }
    }
  } finally {
    loading.value = false

    // ✅ Load ke baad lastKnownBlockHeight set karo
    if (transactions.value.length > 0) {
      lastKnownBlockHeight.value = Math.max(...transactions.value.map(t => Number(t.block_height || 0)))
      lastKnownTxHash.value = transactions.value[0]?.hash || ''
    }

    // ✅ Race condition fix: agar load ke doran naya block aa gaya toh missed txs prepend karo
    if (currentPage.value === 1 && !isNodeFallback.value && transactions.value.length > 0) {
      const currentH = Number(currentBlockHeight.value)
      if (currentH > lastKnownBlockHeight.value) {
        await prependNewTransactions()
      }
    }
  }
}

// ✅ Watch currentBlockHeight - jab naya block aaye toh transactions prepend karo
watch(currentBlockHeight, async (newHeight, oldHeight) => {
  const newH = Number(newHeight)
  const oldH = Number(oldHeight)

  if (newH <= oldH) return
  if (currentPage.value !== 1) return
  if (transactions.value.length === 0) return
  if (isNodeFallback.value) return
  if (newH <= lastKnownBlockHeight.value) return

  // Immediately update karo taake duplicate trigger block ho
  lastKnownBlockHeight.value = newH

  await prependNewTransactions()
})

// 🔹 Get last 24H transactions count
const getLast24HTransactionsCount = async () => {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  try {
    const data = await fetchTransactions({
      chain: apiChainName,
      page: 1,
      limit: 1,
      start_date: yesterday.toISOString(),
      end_date: now.toISOString(),
    })
    return data.meta?.total || 0
  } catch (error) {
    return 0
  }
}

// 🔹 Get failed (pending) transactions count in last 24H
const getFailed24HTransactionsCount = async () => {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  try {
    const data = await fetchTransactions({
      chain: apiChainName,
      page: 1,
      limit: 1,
      status: 'pending',
      start_date: yesterday.toISOString(),
      end_date: now.toISOString(),
    })
    return data.meta?.total || 0
  } catch (error) {
    return 0
  }
}

// 🔹 Debounced load
function debouncedLoad() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    currentPage.value = 1
    loadTransactions()
  }, 300)
}

// 🔹 Watchers
watch([selectedTypeTab, statusFilter, startDate, endDate, minAmount, maxAmount, sortBy, sortOrder], () => {
  debouncedLoad()
})
watch(itemsPerPage, () => { currentPage.value = 1; loadTransactions() })
watch(currentPage, () => loadTransactions())

// 🔍 Search
function search() {
  if (hashReg.test(hash.value)) {
    router.push({ path: `/${current}/tx/${hash.value}` })
  }
}

// 🔹 Pagination
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }
function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function goToFirst() { currentPage.value = 1 }
function goToLast() { currentPage.value = totalPages.value }
function changePageSize(newSize: number) { itemsPerPage.value = newSize }

// 🔹 Sender address helper
function getSenderAddress(sender: string): string {
  if (!sender) return '';
  if (isBech32Address(sender)) return sender;
  const prefix = chainStore?.current?.bech32Prefix || 'pokt';
  return secp256k1PubKeyToAccountAddress(sender, prefix) || sender;
}

// 🔹 Mounted
onMounted(async () => {
  tab.value = String(router.currentRoute.value.query.tab || 'recent')
  await loadTransactions()

  ;[tx24HCount.value, failedLast24h.value] = await Promise.all([
    getLast24HTransactionsCount(),
    getFailed24HTransactionsCount(),
  ])

  setInterval(async () => {
    ;[tx24HCount.value, failedLast24h.value] = await Promise.all([
      getLast24HTransactionsCount(),
      getFailed24HTransactionsCount(),
    ])
  }, 60000)
})
</script>

<template>
  <div class="pt-[6.5rem]">
    <!-- 🔴 Fallback Warning Banner -->
    <div
      v-if="isNodeFallback"
      :class="fallbackError ? 'bg-red-100 border-red-400 text-red-700' : 'bg-yellow-100 border-yellow-400 text-yellow-700'"
      class="border px-4 py-3 rounded-xl mb-4 shadow-md"
      role="alert"
    >
      <div class="flex items-center">
        <Icon :icon="fallbackError ? 'mdi:alert-octagon' : 'mdi:alert-circle'" class="mr-2 text-xl" />
        <span class="font-medium">
          <span v-if="!fallbackError">Currently showing data from node because main server is down.</span>
          <span v-else>Unable to load data: {{ fallbackError }}. Please check your RPC connection or try again later.</span>
        </span>
      </div>
    </div>

    <p class="bg-[#ffffff] hover:bg-base-200 text-2xl w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">Transactions</p>

    <div class="grid sm:grid-cols-1 md:grid-cols-4 py-4 gap-4 mb-4">
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Transactions (24H)</div>
          <div class="font-bold">{{ tx24HCount.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Failed Transactions (24H)</div>
          <div class="font-bold">{{ failedLast24h.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Total Transactions</div>
          <div class="font-bold">{{ totalTransactions.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Transactions (Last Block)</div>
          <div class="font-bold">{{ currentTxCount.toLocaleString() }}</div>
        </span>
      </div>
    </div>

    <div v-show="tab === 'recent'" class="bg-base-200 px-0.5 pt-0.5 mb-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <!-- Filter Section -->
      <div class="bg-[#ffffff] dark:bg-[rgba(255,255,255,.03)] rounded-lg border border-base-300 dark:border-base-400 mb-2">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3">
          <div class="flex items-center gap-1 flex-wrap">
            <span class="text-xs font-medium text-base-content/70 mr-1">Type:</span>
            <button
              v-for="typeOption in [
                { value: 'all', label: 'All' },
                { value: 'send', label: 'Send' },
                { value: 'claim', label: 'Claim' },
                { value: 'proof', label: 'Proof' },
                { value: 'governance', label: 'Gov' },
                { value: 'staking', label: 'Stake' }
              ]"
              :key="typeOption.value"
              @click="selectedTypeTab = typeOption.value as any"
              class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200"
              :class="selectedTypeTab === typeOption.value
                ? 'bg-[#007bff] text-white shadow-sm'
                : 'bg-base-100 text-base-content hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border border-base-300 dark:border-base-400'"
            >
              {{ typeOption.label }}
            </button>
          </div>

          <div class="h-6 w-px bg-base-300 dark:bg-base-500"></div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-1.5">
              <Icon icon="mdi:check-circle-outline" class="text-base-content/60 text-sm" />
              <select v-model="statusFilter" class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-24 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div class="flex items-center gap-1.5">
              <Icon icon="mdi:sort" class="text-base-content/60 text-sm" />
              <select v-model="sortBy" class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-28 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
                <option value="timestamp">Time</option>
                <option value="amount">Amount</option>
                <option value="fee">Fee</option>
                <option value="block_height">Block</option>
                <option value="type">Type</option>
                <option value="status">Status</option>
              </select>
            </div>
            <button
              @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
              class="btn btn-xs h-8 min-h-8 px-2 gap-1"
              :class="sortOrder === 'desc' ? 'btn-primary' : 'btn-ghost'"
            >
              <Icon :icon="sortOrder === 'desc' ? 'mdi:sort-descending' : 'mdi:sort-ascending'" class="text-sm" />
            </button>
          </div>

          <div class="ml-auto">
            <button
              @click="showAdvancedFilters = !showAdvancedFilters"
              class="btn btn-xs h-8 min-h-8 px-3 gap-1.5"
              :class="showAdvancedFilters ? 'btn-primary' : 'btn-ghost'"
            >
              <Icon :icon="showAdvancedFilters ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="text-sm" />
              <span class="text-xs">Advanced</span>
            </button>
          </div>
        </div>

        <div v-show="showAdvancedFilters" class="border-t border-base-300 dark:border-base-400 px-4 py-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="label py-1">
                <span class="label-text text-xs font-medium flex items-center gap-1.5">
                  <Icon icon="mdi:calendar-range" class="text-sm" />
                  Date Range
                </span>
              </label>
              <div class="flex gap-2">
                <input v-model="startDate" type="datetime-local" class="input input-bordered input-xs h-8 text-xs flex-1" />
                <span class="self-center text-xs text-base-content/50">→</span>
                <input v-model="endDate" type="datetime-local" class="input input-bordered input-xs h-8 text-xs flex-1" />
              </div>
            </div>
            <div>
              <label class="label py-1">
                <span class="label-text text-xs font-medium flex items-center gap-1.5">
                  <Icon icon="mdi:currency-usd" class="text-sm" />
                  Amount Range
                </span>
              </label>
              <div class="flex gap-2">
                <input v-model.number="minAmount" type="number" class="input input-bordered input-xs h-8 text-xs flex-1" placeholder="Min" />
                <span class="self-center text-xs text-base-content/50">-</span>
                <input v-model.number="maxAmount" type="number" class="input input-bordered input-xs h-8 text-xs flex-1" placeholder="Max" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-base-200 px-0.5 pt-0.5 pb-4 mb-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-auto" style="max-height:calc(100vh - 22rem)">
        <table class="table w-full table-compact">
          <thead class="bg-base-200 dark:bg-[rgba(255,255,255,.03)] sticky top-0 border-0">
            <tr class="border-b-[0px] text-sm font-semibold bg-base-200">
              <th>{{ $t('tx.tx_hash') }}</th>
              <th>{{ $t('block.block') }}</th>
              <th>{{ $t('staking.status') }}</th>
              <th>{{ $t('account.amount') }}</th>
              <th>{{ $t('account.type') }}</th>
              <th>{{ $t('block.fees') }}</th>
              <th>{{ $t('account.time') }}</th>
              <th>{{ $t('account.signer') }}</th>
            </tr>
          </thead>

          <!-- Loading state -->
          <tbody v-if="loading">
            <tr class="text-center">
              <td colspan="8" class="py-8">
                <div class="flex justify-center items-center">
                  <div class="loading loading-spinner loading-md"></div>
                  <span class="ml-2">Loading transactions...</span>
                </div>
              </td>
            </tr>
          </tbody>

          <!-- Empty state -->
          <tbody v-else-if="transactions.length === 0">
            <tr class="text-center">
              <td colspan="8" class="py-8">
                <div class="text-gray-500">No transactions found</div>
              </td>
            </tr>
          </tbody>

          <!-- ✅ TransitionGroup tag="tbody" - smooth animation -->
          <TransitionGroup
            v-else
            name="tx-slide"
            tag="tbody"
          >
            <tr
              v-for="item in transactions"
              :key="item.hash"
              class="hover:bg-gray-100 dark:hover:bg-[rgba(255,255,255,0.06)] dark:bg-base-200 bg-white border-0 rounded-xl"
            >
              <td
                class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white truncate dark:text-warning text-[#153cd8]"
                style="max-width:25vw"
              >
                <RouterLink class="truncate hover:underline" :to="`/${props.chain}/tx/${item.hash}`">
                  {{ item.hash }}
                </RouterLink>
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white text-sm dark:text-warning text-[#153cd8]">
                <RouterLink :to="`/${props.chain}/blocks/${item.block_height}`" class="hover:underline">
                  {{ item.block_height }}
                </RouterLink>
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white">
                <span
                  class="text-xs truncate py-1 px-3 rounded-full"
                  :class="(item.status === 1 || item.status === 'success' || item.status === 'true') ? 'bg-[#60BC29]/10 text-[#60BC29]' : 'bg-[#E03834]/10 text-[#E03834]'"
                >
                  {{ (item.status === 1 || item.status === 'success' || item.status === 'true') ? 'Success' : 'Failed' }}
                </span>
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white">
                {{ format.formatToken({ denom: 'upokt', amount: item.amount }) }}
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white">
                {{ item.type }}
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white">
                {{ format.formatToken({ denom: 'upokt', amount: item.fee }) }}
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white">
                {{ format.toDay(item.timestamp, 'from') }}
              </td>
              <td class="dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] bg-white">
                <RouterLink
                  :to="`/${props.chain}/account/${getSenderAddress(item.sender)}`"
                  class="text-sm text-[#09279F] dark:invert font-mono hover:underline"
                >
                  {{ getSenderAddress(item.sender) }}
                </RouterLink>
              </td>
            </tr>
          </TransitionGroup>
        </table>
      </div>

      <!-- Pagination Bar -->
      <div class="flex justify-between items-center gap-4 my-6 px-6">
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">Show:</span>
          <select v-model="itemsPerPage" @change="changePageSize(itemsPerPage)" class="select select-bordered select-sm w-20">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
          </select>
          <span class="text-sm text-gray-600">per page</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">
            Showing {{ ((currentPage - 1) * itemsPerPage) + 1 }} to {{ Math.min(currentPage * itemsPerPage, totalTransactions) }} of {{ totalTransactions }} transactions
          </span>
          <div class="flex items-center gap-1">
            <button class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="goToFirst" :disabled="currentPage === 1 || totalPages === 0">First</button>
            <button class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="prevPage" :disabled="currentPage === 1 || totalPages === 0">&lt;</button>
            <span class="text-xs px-2">Page {{ currentPage }} of {{ totalPages }}</span>
            <button class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="nextPage" :disabled="currentPage === totalPages || totalPages === 0">&gt;</button>
            <button class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="goToLast" :disabled="currentPage === totalPages || totalPages === 0">Last</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 🔍 Search Section -->
    <div v-show="tab === 'search'" class="bg-base-100 px-4 pt-3 pb-4 mb-4 rounded-md shadow-md border-t-4 border-warning">
      <div class="flex items-center mb-4">
        <Icon icon="mdi:magnify" class="text-2xl text-warning mr-2" />
        <div class="text-lg font-semibold text-main">Search Transactions</div>
      </div>
      <div class="bg-base-200 p-4 rounded-md">
        <div class="form-control">
          <input v-model="hash" type="text" class="input input-bordered" placeholder="Search by Tx Hash" @blur="search" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-btn:hover { background-color: #e9ecef; }
.page-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ✅ Transaction slide animation */
.tx-slide-enter-active { transition: all 0.4s ease; }
.tx-slide-enter-from { opacity: 0; transform: translateY(-12px); }
.tx-slide-enter-to { opacity: 1; transform: translateY(0); }

.tx-slide-leave-active { transition: all 0.3s ease; }
.tx-slide-leave-from { opacity: 1; }
.tx-slide-leave-to { opacity: 0; transform: translateY(8px); }

.tx-slide-move { transition: transform 0.4s ease; }
</style>

<route>
{
  meta: {
    i18n: 'tx',
    order: 3
  }
}
</route>
