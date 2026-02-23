<script lang="ts" setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useStakingStore, useBaseStore, useFormatter } from '@/stores'
import { PageRequest } from '@/types'
import { useBlockchain } from '@/stores'
import { Icon } from '@iconify/vue';
import { useSEO } from '@/composables/useSEO';

const props = defineProps(['chain'])
const tab = ref('blocks')
const base = useBaseStore()
const stakingStore = useStakingStore();
stakingStore.init()
const format = useFormatter()
const blockchain = useBlockchain()

// SEO Meta Tags
const chainName = computed(() => blockchain.current?.chainName || props.chain || 'Pocket Network');
useSEO({
  title: `${chainName.value} Blocks`,
  description: `Browse all blocks on the ${chainName.value} blockchain. View block height, transactions, validators, timestamps, and block details on the Pocket Network Explorer.`,
  keywords: `${chainName.value}, blocks, blockchain blocks, block explorer, block height, block details`,
});

const currentBlockHeight = computed(() => {
  return base.latest?.block?.header?.height ?? 0
})

const currentTxCount = computed(() => {
  return base.latest?.block?.data?.txs?.length ?? 0
})

// Fallback state
const isNodeFallback = ref(false)
const fallbackError = ref('')

// Network Stats
const networkStats = ref({
  wallets: 0,
  applications: 0,
  suppliers: 0,
  gateways: 0,
})

// Cache control
const networkStatsCacheTime = ref(0)
const CACHE_EXPIRATION_MS = 60000

// Load network stats
async function loadNetworkStats() {
  const now = Date.now()
  if (now - networkStatsCacheTime.value < CACHE_EXPIRATION_MS && networkStats.value.wallets > 0) {
    return
  }
  const pageRequest = new PageRequest()
  pageRequest.limit = 1
  try {
    const [applicationsData, suppliersData, gatewaysData] = await Promise.all([
      blockchain.rpc.getApplications(pageRequest),
      blockchain.rpc.getSuppliers(pageRequest),
      blockchain.rpc.getGateways(pageRequest),
    ])
    networkStats.value.applications = parseInt(applicationsData.pagination?.total || '0')
    networkStats.value.suppliers = parseInt(suppliersData.pagination?.total || '0')
    networkStats.value.gateways = parseInt(gatewaysData.pagination?.total || '0')
    networkStatsCacheTime.value = now
  } catch (error) {
    console.error('Error loading network stats:', error)
  }
}

// API blocks interface
interface ApiBlockItem {
  id: string
  height: number
  hash: string
  timestamp: string
  proposer: string
  chain: string
  transaction_count?: number
  // ✅ Server alag alag field names use kar sakta hai
  block_production_time?: number
  production_time?: number
  block_time?: number
  raw_block_size?: number
  size?: number
  block_size?: number
}

// ✅ Helper: kisi bhi field name se production time nikalo
function getProductionTime(block: ApiBlockItem): number {
  return Number(
    block.block_production_time ||
    block.production_time ||
    block.block_time ||
    0
  )
}

// ✅ Helper: kisi bhi field name se block size nikalo
function getBlockSize(block: ApiBlockItem): number {
  return Number(
    block.raw_block_size ||
    block.size ||
    block.block_size ||
    0
  )
}

const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  }
  return chainMap[chainName] || chainName || 'pocket-lego-testnet'
}

const chainStore = useBlockchain()
const apiChainName = computed(() =>
  getApiChainName(chainStore.current?.chainName || props.chain || 'pocket-beta')
)

const blocks = ref<ApiBlockItem[]>([])
const loading = ref(false)
const currentPage = ref(1)
const itemsPerPage = ref(25)
const totalBlocks = ref(0)
const totalPages = ref(0)
const pageSizeOptions = [10, 25, 50, 100]

// Block statistics from API meta
const avgBlockProductionTime = ref<number | null>(null)
const avgBlockSize = ref<number | null>(null)

// ✅ Track last known block height to detect new blocks
const lastKnownHeight = ref<number>(0)
// ✅ Lock: ek waqt mein ek hi prepend chale
const isPrepending = ref(false)

// ✅ Node se sirf ek naya block fetch karo (primary - fast)
async function fetchSingleBlockFromNode(height: number): Promise<ApiBlockItem | null> {
  try {
    // Current aur previous block dono fetch karo production time ke liye
    const [block, prevBlock] = await Promise.all([
      blockchain.rpc.getBaseBlockAt(String(height)).catch(() => null),
      height > 1 ? blockchain.rpc.getBaseBlockAt(String(height - 1)).catch(() => null) : Promise.resolve(null)
    ])

    if (!block) return null
    const blockHeight = parseInt(block.block?.header?.height || '0')
    if (blockHeight !== height) return null

    // ✅ Production time calculate karo timestamps se
    const currentTime = new Date(block.block?.header?.time || '').getTime()
    const prevTime = prevBlock
      ? new Date(prevBlock.block?.header?.time || '').getTime()
      : 0
    const productionTimeSec = (prevTime && currentTime && currentTime > prevTime)
      ? parseFloat(((currentTime - prevTime) / 1000).toFixed(3))
      : 0

    return {
      id: `${block.block?.header?.chain_id}:${block.block?.header?.height}`,
      height: blockHeight,
      hash: block.block_id?.hash || '',
      timestamp: block.block?.header?.time || new Date().toISOString(),
      proposer: block.block?.header?.proposer_address || '',
      chain: block.block?.header?.chain_id || apiChainName.value,
      transaction_count: block.block?.data?.txs?.length || 0,
      block_production_time: productionTimeSec,
      raw_block_size: 0,
    }
  } catch {
    return null
  }
}

// ✅ Server se specific height ka block fetch karo
async function fetchSingleBlockFromServer(height: number): Promise<ApiBlockItem | null> {
  try {
    // Height-specific endpoint pehle try karo
    const url = `/api/v1/blocks/${height}?chain=${apiChainName.value}`
    const res = await fetch(url)
    if (!res.ok) {
      // Fallback: list se dhundho
      const listUrl = `/api/v1/blocks?chain=${apiChainName.value}&page=1&limit=5`
      const listRes = await fetch(listUrl)
      if (!listRes.ok) return null
      const listText = await listRes.text()
      if (!listText) return null
      const listData = JSON.parse(listText)
      const blockList: ApiBlockItem[] = listData.blocks || listData.data || []
      return blockList.find((b: ApiBlockItem) => Number(b.height) === height) || null
    }
    const text = await res.text()
    if (!text) return null
    const data = JSON.parse(text)
    const block = data.block || data.data || data
    if (Number(block?.height) !== height) return null
    return block
  } catch {
    return null
  }
}

// ✅ Sirf naya block table ke upar prepend karo - poora reload nahi
async function prependNewBlock(height: number) {
  // Lock check
  if (isPrepending.value) return
  isPrepending.value = true

  try {
    // Check: kya yeh block already list mein hai?
    if (blocks.value.some(b => Number(b.height) === height)) return

    // Pehle node se try karo - fast aur accurate
    let newBlock = await fetchSingleBlockFromNode(height)

    // Agar node se nahi mila toh server se try karo
    if (!newBlock) {
      newBlock = await fetchSingleBlockFromServer(height)
    }

    if (!newBlock) return

    // Height verify karo
    if (Number(newBlock.height) !== height) return

    // Final duplicate check
    if (blocks.value.some(b => Number(b.height) === height)) return

    // Table ke upar naya block add karo
    blocks.value = [newBlock, ...blocks.value]

    // Agar page 1 par hain toh last item remove karo (taake itemsPerPage limit rahay)
    if (currentPage.value === 1 && blocks.value.length > itemsPerPage.value) {
      blocks.value = blocks.value.slice(0, itemsPerPage.value)
    }

    // Total count update karo
    totalBlocks.value = totalBlocks.value + 1
    totalPages.value = Math.ceil(totalBlocks.value / itemsPerPage.value)
  } finally {
    isPrepending.value = false
  }
}

// ✅ Watch currentBlockHeight - jab naya block aaye sirf woh prepend karo
watch(currentBlockHeight, async (newHeight, oldHeight) => {
  const newH = Number(newHeight)
  const oldH = Number(oldHeight)

  // Sirf page 1 par auto-prepend karo
  if (currentPage.value !== 1) return
  // Sirf tab karo jab height genuinely badhi ho
  if (newH <= oldH) return
  // Sirf tab jab blocks already loaded hain
  if (blocks.value.length === 0) return
  // lastKnownHeight check
  if (newH <= lastKnownHeight.value) return

  // Immediately update karo taake duplicate trigger block ho
  lastKnownHeight.value = newH
  await prependNewBlock(newH)
})

// 🔹 Server se blocks fetch karo
async function getBlocksFromServer() {
  try {
    const url = `/api/v1/blocks?chain=${apiChainName.value}&page=${currentPage.value}&limit=${itemsPerPage.value}`

    const res = await fetch(url)

    if (!res.ok) {
      throw new Error('Server down')
    }

    const text = await res.text()

    if (!text) {
      throw new Error('Empty server response')
    }

    return JSON.parse(text)

  } catch (err) {
    console.warn('Server failed, switching to node...')
    throw err
  }
}

// 🔹 Node se blocks fetch karo (fallback)
async function getBlocksFromNode() {
  try {
    console.log('[Node Fallback] Starting node fallback...')

    // Wait for RPC to be ready (max 10 seconds)
    let rpcRetries = 0
    while (!blockchain.rpc && rpcRetries < 20) {
      console.log(`[Node Fallback] Waiting for RPC... retry ${rpcRetries + 1}/20`)
      await new Promise(resolve => setTimeout(resolve, 500))
      rpcRetries++
    }

    if (!blockchain.rpc) {
      console.error('[Node Fallback] RPC not available after waiting')
      throw new Error('RPC not available')
    }

    console.log('[Node Fallback] RPC is available')

    // Try to fetch latest block from RPC directly if base store doesn't have it
    if (!base.latest?.block?.header?.height) {
      console.log('[Node Fallback] Base store has no block data, fetching from RPC...')
      try {
        const latestBlock = await blockchain.rpc.getBaseBlockLatest()
        if (latestBlock?.block?.header?.height) {
          base.latest = latestBlock
          console.log('[Node Fallback] Successfully fetched latest block:', latestBlock.block.header.height)
        }
      } catch (err) {
        console.warn('[Node Fallback] Could not fetch latest block from RPC:', err)
      }
    } else {
      console.log('[Node Fallback] Base store already has block data:', base.latest.block.header.height)
    }

    // Get latest blocks from base store
    let retries = 0
    while (!base.latest?.block?.header?.height) {
      if (retries > 10) {
        throw new Error('Node not responding - no block data available')
      }
      await new Promise(r => setTimeout(r, 500))
      retries++
    }

    const latestBlock = base.latest.block
    const currentHeight = Number(latestBlock.header.height)

    const endHeight = currentHeight - ((currentPage.value - 1) * itemsPerPage.value)
    const startHeight = Math.max(endHeight - itemsPerPage.value + 1, 1)

    const blockPromises = []

    for (let height = endHeight; height >= startHeight; height--) {
      blockPromises.push(
        blockchain.rpc.getBaseBlockAt(String(height)).catch(() => null)
      )
    }

    const fetchedBlocks = await Promise.all(blockPromises)

    const validBlocks = fetchedBlocks.filter(block => block !== null)

    // ✅ Production time calculate karo: current block time - previous block time
    const nodeBlocks = validBlocks.map((block: any, index: number) => {
      const currentTime = new Date(block.block?.header?.time || '').getTime()
      // Next block (index+1) is actually older (lower height) - blocks are desc order
      const prevBlock = validBlocks[index + 1]
      const prevTime = prevBlock
        ? new Date(prevBlock.block?.header?.time || '').getTime()
        : 0

      // Production time = seconds between this block and previous block
      const productionTimeSec = (prevTime && currentTime && currentTime > prevTime)
        ? parseFloat(((currentTime - prevTime) / 1000).toFixed(3))
        : 0

      return {
        id: `${block.block?.header?.chain_id}:${block.block?.header?.height}`,
        height: parseInt(block.block?.header?.height || '0'),
        hash: block.block_id?.hash || '',
        timestamp: block.block?.header?.time || new Date().toISOString(),
        proposer: block.block?.header?.proposer_address || '',
        chain: block.block?.header?.chain_id || apiChainName.value,
        transaction_count: block.block?.data?.txs?.length || 0,
        block_production_time: productionTimeSec,
        raw_block_size: 0,
        size: 0
      }
    })

    return {
      blocks: nodeBlocks,
      total: currentHeight,
      totalPages: Math.ceil(currentHeight / itemsPerPage.value),
      avgBlockProductionTime: null,
      avgBlockSize: null
    }
  } catch (error) {
    console.error('Node fallback error:', error)
    return {
      blocks: [],
      total: 0,
      totalPages: 0,
      avgBlockProductionTime: null,
      avgBlockSize: null
    }
  }
}

// 🔹 Main load function with fallback logic
async function loadBlocks() {
  loading.value = true
  fallbackError.value = ''

  try {
    const serverData = await getBlocksFromServer()

    // ✅ Server response ke multiple possible formats handle karo
    // Format 1: { data: [...], meta: { total, totalPages, avgBlockProductionTime, avgBlockSize } }
    // Format 2: { blocks: [...], total, totalPages }
    // Format 3: [...] (direct array)
    if (Array.isArray(serverData)) {
      blocks.value = serverData
      totalBlocks.value = serverData.length
      totalPages.value = 1
    } else if (serverData.data && Array.isArray(serverData.data)) {
      // ✅ Field names normalize karo - server ke alag formats handle karo
      // DEBUG: pehle block ka structure console mein dekho
      if (serverData.data.length > 0) {
        console.log('[BlocksView Debug] First block from server:', JSON.stringify(serverData.data[0], null, 2))
      }
      
      blocks.value = serverData.data.map((b: any) => ({
        ...b,
        // ✅ Production time - string ya number dono rakh lo (formatBlockTime parseFloat karega)
        block_production_time: (
          b.block_production_time ??
          b.production_time ??
          b.block_time ??
          b.blockTime ??
          b.avg_block_time ??
          b.time_diff ??
          b.timeDiff ??
          b.duration ??
          0
        ),
        // ✅ Block size - tamam possible field names
        raw_block_size: Number(
          b.raw_block_size ??
          b.block_size ??
          b.blockSize ??
          b.size ??
          0
        ),
        // ✅ Transaction count - tamam possible field names
        transaction_count: Number(
          b.transaction_count ??
          b.tx_count ??
          b.txCount ??
          b.num_txs ??
          b.txs ??
          0
        ),
      }))
      totalBlocks.value = serverData.meta?.total || serverData.total || 0
      totalPages.value = serverData.meta?.totalPages || serverData.totalPages || 0
      avgBlockProductionTime.value = serverData.meta?.avgBlockProductionTime != null
        ? Number(serverData.meta.avgBlockProductionTime)
        : null
      avgBlockSize.value = serverData.meta?.avgBlockSize != null
        ? Number(serverData.meta.avgBlockSize)
        : null
    } else if (serverData.blocks && Array.isArray(serverData.blocks)) {
      blocks.value = serverData.blocks
      totalBlocks.value = serverData.total || 0
      totalPages.value = serverData.totalPages || 0
      avgBlockProductionTime.value = serverData.avgBlockProductionTime || null
      avgBlockSize.value = serverData.avgBlockSize || null
    } else {
      blocks.value = []
      totalBlocks.value = 0
      totalPages.value = 0
    }

    isNodeFallback.value = false

  } catch (serverError) {
    console.warn('Server failed, trying node fallback...', serverError)

    try {
      isNodeFallback.value = true

      const nodeData = await getBlocksFromNode()

      blocks.value = nodeData.blocks
      totalBlocks.value = nodeData.total
      totalPages.value = nodeData.totalPages
      avgBlockProductionTime.value = nodeData.avgBlockProductionTime
      avgBlockSize.value = nodeData.avgBlockSize
    } catch (nodeError: any) {
      console.error('Node fallback also failed:', nodeError)
      fallbackError.value = nodeError.message || 'Both server and node are unavailable'
      isNodeFallback.value = true
      // Keep previous data or show empty
      if (blocks.value.length === 0) {
        blocks.value = []
        totalBlocks.value = 0
        totalPages.value = 0
      }
    }
  }

  // ✅ Load hone ke baad lastKnownHeight set karo
  if (blocks.value.length > 0) {
    lastKnownHeight.value = Math.max(...blocks.value.map(b => Number(b.height)))
  }

  loading.value = false

  // ✅ Race condition fix: agar loadBlocks ke doran currentBlockHeight badh gaya
  // toh woh blocks miss ho jaate hain - sirf page 1 par check karo
  if (currentPage.value === 1 && blocks.value.length > 0) {
    const currentH = Number(currentBlockHeight.value)
    if (currentH > lastKnownHeight.value) {
      const missedCount = Math.min(currentH - lastKnownHeight.value, 5)
      for (let h = lastKnownHeight.value + 1; h <= lastKnownHeight.value + missedCount; h++) {
        await prependNewBlock(h)
      }
    }
  }
}

// Watchers
watch(itemsPerPage, () => { currentPage.value = 1; loadBlocks() })
watch(currentPage, () => loadBlocks())
watch(apiChainName, (n, o) => { if (n !== o) { currentPage.value = 1; loadBlocks() } })

// Convert bytes → largest appropriate unit (B, KB, MB, GB, TB, PB)
function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  // Clamp i to valid unit index
  const unitIndex = Math.min(i, units.length - 1)
  const value = bytes / Math.pow(k, unitIndex)
  // Format with appropriate decimal places
  const decimals = unitIndex === 0 ? 0 : value < 10 ? 2 : 1
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

// ✅ Format production time for single block
function formatProductionTime(secondsStr?: string | number) {
  if (!secondsStr) return "0s"
  const totalSeconds =
    typeof secondsStr === "string" ? parseFloat(secondsStr) : secondsStr
  if (!totalSeconds || isNaN(totalSeconds)) return "0s"
  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds)}s`  // 0-59s ke liye direct seconds
  }
  const minutes = Math.floor(totalSeconds / 60)  // total seconds ko minutes me convert
  const seconds = Math.round(totalSeconds % 60)  // remaining seconds
  return `${minutes}m ${seconds}s`  // 60s ya us se upar ko minutes + seconds format me
}

// Convert seconds → "Xs" or "Xm Ys" without decimal in seconds
function formatBlockTime(secondsStr?: string | number) {
  if (!secondsStr) return '0s'
  const totalSeconds = typeof secondsStr === 'string' ? parseFloat(secondsStr) : secondsStr
  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds)}s` // sirf seconds, rounded
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60) // seconds rounded to integer
  return `${minutes}m ${seconds}s` // minutes aur seconds, no decimal
}


// Pagination
function goToFirst() { if (currentPage.value !== 1) currentPage.value = 1 }
function goToLast() { if (currentPage.value !== totalPages.value) currentPage.value = totalPages.value }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }
function prevPage() { if (currentPage.value > 1) currentPage.value-- }

// Auto-load on mount
onMounted(() => {
  loadNetworkStats()
  loadBlocks()
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

    <p class="bg-[#ffffff] hover:bg-base-200 text-2xl w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">Blocks</p>
    <div class="grid sm:grid-cols-1 md:grid-cols-4 py-4 gap-4 mb-4">
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Latest Blocks</div>
          <div class="flex justify-center items-center">
            <div class="font-bold">{{ currentBlockHeight }}</div>
            <Icon icon="mdi:content-copy" class="ml-2 cursor-pointer text-[#64748B]" />
          </div>
        </span>
      </div>
      <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Transactions</div>
          <div class="font-bold">{{ currentTxCount }}</div>
        </span>
      </div>
      <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Production Time (Avg. 24H)</div>
          <div class="font-bold">{{ avgBlockProductionTime !== null ? formatProductionTime(avgBlockProductionTime) : '-' }}</div>
        </span>
      </div>
      <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Total Size (Avg. 24H)</div>
          <div class="font-bold">{{ avgBlockSize !== null ? formatBytes(avgBlockSize) : '-' }}</div>
        </span>
      </div>
    </div>

    <div
      v-show="tab === 'blocks'"
      class="bg-base-200 px-0.5 pt-0.5 pb-4 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg"
    >
      <div class="bg-base-200 rounded-md">
        <div class="overflow-auto" style="max-height:calc(100vh - 26rem)">
        <table class="table table-compact w-full">
          <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0 border-0">
            <tr class="border-b-[0px] text-sm font-semibold">
              <th>{{ $t('block.block_header') }}</th>
              <th>{{ $t('account.hash') }}</th>
              <th>{{ $t('block.proposer') }}</th>
              <th>{{ $t('account.no_of_transactions') }}</th>
              <th>{{ $t('account.time') }}</th>
              <th>{{ $t('block.production_time') }}</th>
              <th>{{ $t('block.application') }}</th>
              <th>{{ $t('block.supplier') }}</th>
              <th>{{ $t('block.gateway') }}</th>
              <!-- <th>{{ $t('block.relay') }}</th> -->
              <th>{{ $t('block.size') }}</th>
            </tr>
          </thead>

          <!-- Loading state -->
          <tbody v-if="loading" class="bg-base-100">
            <tr>
              <td colspan="10" class="py-8">
                <div class="flex justify-center items-center">
                  <div class="loading loading-spinner loading-md"></div>
                  <span class="ml-2">Loading blocks...</span>
                </div>
              </td>
            </tr>
          </tbody>

          <!-- Empty state -->
          <tbody v-else-if="blocks.length === 0" class="bg-base-100">
            <tr>
              <td colspan="10" class="py-8 text-center text-gray-500">No blocks found</td>
            </tr>
          </tbody>

          <!-- ✅ TransitionGroup tag="tbody" - sahi HTML structure -->
          <TransitionGroup
            v-else
            name="block-slide"
            tag="tbody"
            class="bg-base-100"
          >
            <tr
              v-for="block in blocks"
              :key="block.height"
              class="hover:bg-gray-100 dark:hover:bg-[rgba(255,255,255,0.06)] dark:bg-base-200 bg-white border-0 rounded-xl"
            >
              <td class="font-medium dark:text-warning text-[#09279F]">{{ block.height }}</td>
              <td
                class="truncate dark:text-warning text-[#09279F]"
                style="max-width: 18rem; overflow: hidden"
              >
                <RouterLink
                  class="truncate hover:underline"
                  :title="block.hash"
                  :to="`/${props.chain}/blocks/${block.height}`"
                >
                  {{ block.hash || block.id.split(':')[1] }}
                </RouterLink>
              </td>
              <td>{{ format.validator(block.proposer) }}</td>
              <td>{{ (block.transaction_count ?? 0).toLocaleString() }}</td>
              <td>{{ format.toDay(block.timestamp, 'from') }}</td>
              <td>{{ formatBlockTime(block.block_production_time) }}</td>
              <td>{{ networkStats.applications.toLocaleString() }}</td>
              <td>{{ networkStats.suppliers.toLocaleString() }}</td>
              <td>{{ networkStats.gateways.toLocaleString() }}</td>
              <!-- <td>{{ 0 }}</td> -->
              <td>{{ formatBytes(getBlockSize(block)) }}</td>
            </tr>
          </TransitionGroup>
        </table>
        </div>

        <!-- Pagination Bar -->
        <div class="flex justify-between items-center gap-4 my-6 px-6">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">Show:</span>
            <select v-model="itemsPerPage" class="select select-bordered select-sm w-20">
              <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
            </select>
            <span class="text-sm text-gray-600">per page</span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">
              Showing {{ ((currentPage - 1) * itemsPerPage) + 1 }} to {{ Math.min(currentPage * itemsPerPage, totalBlocks) }} of {{ totalBlocks }} blocks
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
    </div>
  </div>
</template>

<route>
  {
    meta: {
      i18n: 'blocks',
      order: 2
    }
  }
</route>

<style scoped>
.table tr.h-0 {
    display: table-row;
    line-height: 0;
    height: 0;
}
.table tr.h-0 td {
    padding: 0;
    border: none;
}
.page-btn:hover {
  background-color: #e9ecef;
}
.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ✅ Naye block ka smooth slide-down animation */
.block-slide-enter-active {
  transition: all 0.4s ease;
}
.block-slide-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.block-slide-enter-to {
  opacity: 1;
  transform: translateY(0);
}

/* ✅ Purane block ka smooth fade out (jab last row remove ho) */
.block-slide-leave-active {
  transition: all 0.3s ease;
}
.block-slide-leave-from {
  opacity: 1;
}
.block-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ✅ Baaki rows ka smooth move jab naya block aaye */
.block-slide-move {
  transition: transform 0.4s ease;
}
</style>