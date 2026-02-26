<script lang="ts" setup>
import MdEditor from 'md-editor-v3';
import PriceMarketChart from '@/components/charts/PriceMarketChart.vue';

import { Icon } from '@iconify/vue';
import {
  useBlockchain,
  useFormatter,
  useTxDialog,
  useWalletStore,
  useStakingStore,
  useParamStore,
  useBaseStore
} from '@/stores';
import { onMounted, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useIndexModule, colorMap } from './indexStore';
import { computed } from '@vue/reactivity';
import { useSEO } from '@/composables/useSEO';

// import CardStatisticsVertical from '@/components/CardStatisticsVertical.vue';
import ProposalListItem from '@/components/ProposalListItem.vue';
import ArrayObjectElement from '@/components/dynamic/ArrayObjectElement.vue'
// import AdBanner from '@/components/ad/AdBanner.vue';
import ApexCharts from 'vue3-apexcharts';
import { PageRequest } from '@/types';

const props = defineProps(['chain']);

const blockchain = useBlockchain();
const store = useIndexModule();
const walletStore = useWalletStore();
const format = useFormatter();
// const dialog = useTxDialog();
// const stakingStore = useStakingStore();
const paramStore = useParamStore()
const base = useBaseStore()

// SEO Meta Tags
const chainName = computed(() => blockchain.current?.chainName || props.chain || 'Pocket Network');
useSEO({
  title: `${chainName.value} Dashboard`,
  description: `Explore the ${chainName.value} blockchain dashboard. View real-time blocks, transactions, validators, network statistics, and node runner performance on the Pocket Network Explorer.`,
  keywords: `${chainName.value}, blockchain dashboard, network statistics, validators, node runners`,
});

const transactionStats = ref({
  total: 0,
  history: []
});

// Add computed properties for network status metrics
const currentBlockHeight = computed(() => {
  return base.latest?.block?.header?.height || '0';
});

const latestBlockTime = computed(() => {
  return new Date(base.latest?.block?.header?.time || '0').toLocaleString();
});

const averageBlockTime = computed(() => {
  return (base.blocktime / 1000).toFixed(1);
});

const averageTxPerBlock = computed(() => {
  if (!base.recents || base.recents.length === 0) return '0.0';
  const totalTxs = base.recents.reduce((sum, block) => sum + (block.block?.data?.txs?.length || 0), 0);
  return (totalTxs / Math.max(1, base.recents.length)).toFixed(1);
});

// Map chain name to API chain name
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  };
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

const activeValidatorsCount = computed(() => {
  return String(base.latest?.block?.last_commit?.signatures.length || 0);
});

// Add loading state tracking
const isNetworkStatusLoading = ref(true);

const txChartType = ref<'bar' | 'area' | 'line'>('area');
const txChartCategories = ref<string[]>([]);
const txHistoryWindow = ref(30); // days: 7, 15, 30 (1m)
const fullTxHistoryLabels = ref<string[]>([]);
const fullTxHistoryCounts = ref<number[]>([]);

const txChartOptions = computed(() => {
  const chartType = txChartType.value;
  
  const strokeConfig = chartType === 'bar' 
    ? { width: 0 }
    : {
        curve: chartType === 'area' ? 'smooth' : 'straight',
        width: 2
      };
  
  const fillConfig = chartType === 'bar'
    ? { opacity: 1, type: 'solid' }
    : {
        type: chartType === 'area' ? 'gradient' : 'solid',
        opacity: chartType === 'area' ? 0.3 : 0,
        gradient: chartType === 'area' ? {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.3,
          stops: [0, 90, 100]
        } : undefined
      };

  return {
    chart: {
      type: chartType,
      height: 280,
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    colors: ['#A3E635'],
    dataLabels: { enabled: false },
    stroke: strokeConfig,
    fill: fillConfig,
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      row: { colors: ['transparent'], opacity: 0.5 }
    },
    markers: chartType === 'bar' ? { size: 0 } : chartType === 'line' ? {
      size: 4,
      strokeWidth: 0,
      hover: { size: 6 }
    } : {
      size: 0,
      hover: { size: 4 }
    },
    xaxis: {
      categories: txChartCategories.value,
      labels: {
        style: { colors: 'rgb(116, 109, 105)' },
        formatter: function (value: string) { return value; }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: {
        style: { colors: 'rgb(116, 109, 105)' },
        formatter: function (value: number) { return format.formatNumber(value); }
      }
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: function (value: number) {
          return format.formatNumber(value) + ' transactions';
        }
      }
    }
  };
});

const txChartSeries = ref([
  {
    name: 'Transactions',
    data: []
  }
]);

// Blocks API state
interface ApiBlockItem {
  id: string;
  height: number;
  hash: string;
  timestamp: string;
  // ✅ Server alag alag field names use kar sakta hai
  block_production_time?: number;
  production_time?: number;
  block_time?: number;
  proposer: string;
  chain: string;
  transaction_count?: number;
}

// ✅ Helper: kisi bhi field name se production time nikalo
function getBlockProductionTime(block: ApiBlockItem): number {
  return Number(
    block.block_production_time ||
    block.production_time ||
    block.block_time ||
    0
  )
}

const currentChainName = computed(() => blockchain?.current?.chainName || props.chain || 'pocket-beta');
const apiChainName = computed(() => getApiChainName(currentChainName.value));

const blocks = ref<ApiBlockItem[]>([]);
const loadingBlocks = ref(false);
const blocksPage = ref(1);
const blocksLimit = ref(25);
const blocksTotal = ref(0);
const blocksTotalPages = ref(0);
const avgBlockProductionTime = ref<string | null>(null);

// ✅ Track last known height to detect new blocks
const lastKnownHeightDashboard = ref<number>(0)
// ✅ Lock: ek waqt mein ek hi prepend operation chale
const isPrependingDashboard = ref(false)

// Fallback state for blocks
const isBlocksNodeFallback = ref(false);
const blocksFallbackError = ref('');
const isTxsNodeFallback = ref(false);
const txsFallbackError = ref('');

// ✅ Dashboard transactions auto-prepend tracking
const lastKnownTxHashDashboard = ref<string>('')
const lastKnownTxBlockDashboard = ref<number>(0)
const isPrependingTxsDashboard = ref(false)

// Indexer health status
interface ChainStatus {
  chain: string;
  historical_checkpoint: number;
  monitoring_height: number;
  latest_height: number;
  monitor_lag: number;
  historical_backlog: number;
  total_backlog: number;
  status: {
    monitoring: string;
    historical: string;
    overall: string;
  };
}

interface IndexerHealth {
  chains: ChainStatus[];
}

const indexerHealth = ref<IndexerHealth | null>(null);
const indexerHealthLoading = ref(false);

async function loadIndexerHealth() {
  indexerHealthLoading.value = true;
  try {
    const response = await fetch('/api/v1/health/workers/');
    const result = await response.json();
    if (response.ok && result?.data) {
      indexerHealth.value = {
        chains: result.data.chains || []
      };
    } else {
      indexerHealth.value = null;
    }
  } catch (e) {
    console.error('Error loading indexer health:', e);
    indexerHealth.value = null;
  } finally {
    indexerHealthLoading.value = false;
  }
}

const isIndexerBehind = computed(() => {
  if (!indexerHealth.value?.chains || !apiChainName.value) return false;
  const chainStatus = indexerHealth.value.chains.find(
    (c) => c.chain === apiChainName.value
  );
  return chainStatus ? chainStatus.monitoring_height < (chainStatus.latest_height - 10) : false;
});

const currentChainIndexerStatus = computed(() => {
  if (!indexerHealth.value?.chains || !apiChainName.value) return null;
  return indexerHealth.value.chains.find((c) => c.chain === apiChainName.value) || null;
});

// ✅ Node se sirf ek naya block fetch karo (primary source)
async function fetchSingleBlockNodeDashboard(height: number): Promise<ApiBlockItem | null> {
  try {
    // Current + previous block fetch karo production time ke liye
    const [block, prevBlock] = await Promise.all([
      blockchain.rpc.getBaseBlockAt(String(height)).catch(() => null),
      height > 1 ? blockchain.rpc.getBaseBlockAt(String(height - 1)).catch(() => null) : Promise.resolve(null)
    ])

    if (!block) return null
    const blockHeight = parseInt(block.block?.header?.height || '0')
    if (blockHeight !== height) return null

    // ✅ Production time = current time - previous block time
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
    }
  } catch {
    return null
  }
}

// ✅ Server se specific height ka block fetch karo
async function fetchSingleBlockServerDashboard(height: number): Promise<ApiBlockItem | null> {
  try {
    // Height-specific endpoint use karo
    const url = `/api/v1/blocks/${height}?chain=${apiChainName.value}`
    const res = await fetch(url)
    if (!res.ok) {
      // Fallback: list endpoint se try karo aur height match karo
      const listUrl = `/api/v1/blocks?chain=${apiChainName.value}&page=1&limit=5`
      const listRes = await fetch(listUrl)
      if (!listRes.ok) return null
      const listText = await listRes.text()
      if (!listText) return null
      const listData = JSON.parse(listText)
      const blockList: ApiBlockItem[] = listData.blocks || listData.data || []
      // Sirf exact height match wala block return karo
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

// ✅ Naya block table ke upar prepend karo - poora reload nahi
async function prependNewBlockDashboard(height: number) {
  // Lock: ek waqt mein ek hi prepend chale
  if (isPrependingDashboard.value) return
  isPrependingDashboard.value = true

  try {
    // Double check: kya yeh block already list mein hai?
    if (blocks.value.some(b => Number(b.height) === height)) return

    // Pehle node se try karo - fast aur accurate
    let newBlock = await fetchSingleBlockNodeDashboard(height)

    // Agar node se nahi mila toh server se try karo
    if (!newBlock) {
      newBlock = await fetchSingleBlockServerDashboard(height)
    }

    if (!newBlock) return

    // Final check: height bilkul sahi honi chahiye
    if (Number(newBlock.height) !== height) return

    // Ek aur check: kya duplicate toh nahi aa gaya is doran?
    if (blocks.value.some(b => Number(b.height) === height)) return

    // Table ke upar naya block add karo
    blocks.value = [newBlock, ...blocks.value]

    // Agar list blocksLimit se bari ho jaye toh last wala remove karo
    if (blocks.value.length > blocksLimit.value) {
      blocks.value = blocks.value.slice(0, blocksLimit.value)
    }
  } finally {
    isPrependingDashboard.value = false
  }
}

// ✅ Dashboard: server se latest txs fetch karo (prepend ke liye)
async function fetchLatestTxsDashboard(limit = 10): Promise<any[]> {
  try {
    const chainVal = getApiChainName(blockchain.current?.chainName || props.chain || 'pocket-lego-testnet')
    const url = `/api/v1/transactions?chain=${chainVal}&page=1&limit=${limit}&sort_by=timestamp&sort_order=desc`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

// ✅ Dashboard transactions - local ref (base.allTxs direct mutate safe nahi hota)
const dashboardTxs = ref<any[]>([])
const dashboardTxsInitialized = ref(false)

// ✅ base.allTxs load hone par dashboardTxs initialize karo
watch(() => base.allTxs, (newTxs) => {
  if (newTxs && newTxs.length > 0 && !dashboardTxsInitialized.value) {
    dashboardTxs.value = [...newTxs]
    dashboardTxsInitialized.value = true
    lastKnownTxHashDashboard.value = newTxs[0]?.hash || ''
    lastKnownTxBlockDashboard.value = Math.max(...newTxs.map((tx: any) => Number(tx.block_height || 0)))
  }
}, { immediate: true, deep: false })

// ✅ Dashboard: naye transactions table ke upar prepend karo
async function prependNewTxsDashboard() {
  if (isPrependingTxsDashboard.value) return
  if (isTxsNodeFallback.value) return
  
  // dashboardTxs initialize na hua ho toh base.allTxs se karo
  if (dashboardTxs.value.length === 0) {
    if (base.allTxs && base.allTxs.length > 0) {
      dashboardTxs.value = [...base.allTxs]
      dashboardTxsInitialized.value = true
    } else {
      return
    }
  }

  isPrependingTxsDashboard.value = true

  try {
    const latestTxs = await fetchLatestTxsDashboard(10)
    if (!latestTxs.length) return

    // Existing hashes ka set banao
    const existingHashes = new Set(dashboardTxs.value.map((tx: any) => tx.hash))

    // Naye transactions filter karo
    const newTxs = latestTxs.filter((tx: any) => !existingHashes.has(tx.hash))
    if (newTxs.length === 0) return

    // ✅ Local ref mein prepend karo - Vue reactivity perfectly kaam karti hai
    dashboardTxs.value = [...newTxs, ...dashboardTxs.value]

    // lastKnown update karo
    lastKnownTxHashDashboard.value = dashboardTxs.value[0]?.hash || ''

    // ✅ visibleTxs bhi force update karo
    await new Promise(resolve => setTimeout(resolve, 30))
    if (txTableContainer.value && dashboardTxs.value.length > 0) {
      const container = txTableContainer.value
      const viewportRows = Math.ceil(container.clientHeight / itemHeight) + 5
      visibleTxs.value = dashboardTxs.value.slice(0, viewportRows).map((item: any, index: number) => ({
        item,
        index
      }))
    }
  } finally {
    isPrependingTxsDashboard.value = false
  }
}

// ✅ Watch currentBlockHeight - jab naya block aaye sirf woh prepend karo
watch(currentBlockHeight, async (newHeight, oldHeight) => {
  const newH = Number(newHeight)
  const oldH = Number(oldHeight)

  // Sirf tab karo jab height genuinely badhi ho
  if (newH <= oldH) return
  // Sirf tab jab blocks already loaded hain
  if (blocks.value.length === 0) return
  // lastKnownHeight check - duplicate se bacho
  if (newH <= lastKnownHeightDashboard.value) return

  // Immediately update karo taake duplicate watch trigger block ho
  lastKnownHeightDashboard.value = newH

  await prependNewBlockDashboard(newH)
})

// ✅ Watch currentBlockHeight - jab naya block aaye toh dashboard transactions bhi prepend karo
watch(currentBlockHeight, async (newHeight, oldHeight) => {
  const newH = Number(newHeight)
  const oldH = Number(oldHeight)

  if (newH <= oldH) return
  if (!base.allTxs || base.allTxs.length === 0) return
  if (isTxsNodeFallback.value) return
  if (newH <= lastKnownTxBlockDashboard.value) return

  lastKnownTxBlockDashboard.value = newH

  await prependNewTxsDashboard()
})

// 🔹 Node se blocks fetch karo (Dashboard fallback)
async function getBlocksFromNodeDashboard() {
  try {
    console.log('[Dashboard Fallback] Starting node fallback for blocks...')

    let rpcRetries = 0
    while (!blockchain.rpc && rpcRetries < 20) {
      await new Promise(resolve => setTimeout(resolve, 500))
      rpcRetries++
    }

    if (!blockchain.rpc) {
      throw new Error('RPC not available')
    }

    if (!base.latest?.block?.header?.height) {
      try {
        const latestBlock = await blockchain.rpc.getBaseBlockLatest()
        if (latestBlock?.block?.header?.height) {
          base.latest = latestBlock
        }
      } catch (err) {
        console.warn('[Dashboard Fallback] Could not fetch latest block from RPC:', err)
      }
    }

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

    const endHeight = currentHeight
    const startHeight = Math.max(endHeight - blocksLimit.value + 1, 1)

    const blockPromises = []
    for (let height = endHeight; height >= startHeight; height--) {
      blockPromises.push(
        blockchain.rpc.getBaseBlockAt(String(height)).catch(() => null)
      )
    }

    const fetchedBlocks = await Promise.all(blockPromises)

    const validBlocks = fetchedBlocks.filter(block => block !== null)

    // ✅ Production time calculate karo timestamps se
    const nodeBlocks = validBlocks.map((block: any, index: number) => {
      const currentTime = new Date(block.block?.header?.time || '').getTime()
      const prevBlock = validBlocks[index + 1] // next in array = older block
      const prevTime = prevBlock
        ? new Date(prevBlock.block?.header?.time || '').getTime()
        : 0
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
        raw_block_size: 0
      }
    })

    return {
      blocks: nodeBlocks,
      total: currentHeight,
      totalPages: Math.ceil(currentHeight / blocksLimit.value)
    }
  } catch (error: any) {
    console.error('[Dashboard Fallback] Node fallback failed:', error)
    throw error
  }
}

async function loadBlocks() {
  loadingBlocks.value = true;
  blocksFallbackError.value = '';

  try {
    const url = `/api/v1/blocks?chain=${apiChainName.value}&page=${blocksPage.value}&limit=${blocksLimit.value}`;
    const response = await fetch(url);
    const text = await response.text();

    if (!text) throw new Error('Empty response from API');

    const result = JSON.parse(text);

    if (response.ok) {
      // ✅ Field names normalize karo - server ke alag formats handle karo
      const rawBlocks = result.data || [];
      
      // DEBUG: pehle block ka structure console mein dekho
      if (rawBlocks.length > 0) {
        console.log('[Blocks Debug] First block from server:', JSON.stringify(rawBlocks[0], null, 2))
      }
      
      blocks.value = rawBlocks.map((b: any) => ({
        ...b,
        // ✅ Production time - string ya number dono handle - parseFloat baad mein karega
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
        // ✅ Transaction count
        transaction_count: Number(
          b.transaction_count ??
          b.tx_count ??
          b.txCount ??
          b.num_txs ??
          b.txs ??
          0
        ),
      }));
      blocksTotal.value = result.meta?.total || 0;
      blocksTotalPages.value = result.meta?.totalPages || 0;
      avgBlockProductionTime.value =
        result.meta?.avgBlockProductionTime != null
          ? Number(result.meta.avgBlockProductionTime).toFixed(2)
          : null;
      isBlocksNodeFallback.value = false;
    } else {
      throw new Error('Server returned error status');
    }
  } catch (serverError) {
    console.warn('[Dashboard] Server failed, trying node fallback...', serverError);

    try {
      isBlocksNodeFallback.value = true;
      const nodeData = await getBlocksFromNodeDashboard();
      blocks.value = nodeData.blocks;
      blocksTotal.value = nodeData.total;
      blocksTotalPages.value = nodeData.totalPages;
    } catch (nodeError: any) {
      console.error('[Dashboard] Node fallback also failed:', nodeError);
      blocksFallbackError.value = nodeError.message || 'Both server and node are unavailable';
      isBlocksNodeFallback.value = true;
      if (blocks.value.length === 0) {
        blocks.value = [];
        blocksTotal.value = 0;
        blocksTotalPages.value = 0;
      }
    }
  } finally {
    loadingBlocks.value = false;
  }
}

// Map raw latest block (from base store / RPC) into ApiBlockItem shape for the dashboard table.
// Optionally takes the previous row so we can derive production time as
// time(current) - time(previous) in seconds.
function latestBlockToApiBlockItem(prev?: ApiBlockItem | null): ApiBlockItem | null {
  const latestBlock = base.latest?.block;
  if (!latestBlock?.header) return null;

  const height = parseInt(latestBlock.header.height || '0');

  let blockProductionTime: number | undefined;
  const currentTs = latestBlock.header.time;
  const prevTs = prev?.timestamp;
  if (currentTs && prevTs) {
    const currentMs = new Date(currentTs).getTime();
    const prevMs = new Date(prevTs).getTime();
    if (Number.isFinite(currentMs) && Number.isFinite(prevMs) && currentMs > prevMs) {
      blockProductionTime = (currentMs - prevMs) / 1000;
    }
  }

  return {
    id: `${latestBlock.header.chain_id}:${latestBlock.header.height}`,
    height,
    hash: base.latest?.block_id?.hash || '',
    timestamp: latestBlock.header.time || new Date().toISOString(),
    proposer: latestBlock.header.proposer_address || '',
    chain: latestBlock.header.chain_id || apiChainName.value,
    transaction_count: latestBlock.data?.txs?.length || 0,
    block_production_time: blockProductionTime,
  };
}

// When latest block advances and we're on the first page, prepend the new block into the dashboard table in-place
function tryPrependLatestBlockToDashboard() {
  if (loadingBlocks.value) return;
  if (blocksPage.value !== 1) return;
  if (!blocks.value.length) return;

  const latest = base.latest?.block;
  if (!latest?.header?.height) return;

  const latestHeight = Number(latest.header.height);
  const topHeight = Number(blocks.value[0]?.height || 0);

  if (!Number.isFinite(latestHeight) || latestHeight <= topHeight) return;

  const previousTop = blocks.value[0] || null;
  const row = latestBlockToApiBlockItem(previousTop);
  if (!row) return;

  // Prepend newest block and trim to current limit
  blocks.value = [row, ...blocks.value];
  if (blocks.value.length > blocksLimit.value) {
    blocks.value.pop();
  }

  // Keep total count in sync (at least not smaller than latest height)
  blocksTotal.value = Math.max(blocksTotal.value, latestHeight);
}


// Add these refs for block list virtualization after the existing refs
const visibleBlocks = ref<{ item: any; index: number }[]>([]);
const visibleTxs = ref<{ item: any; index: number }[]>([]);
const blockTableContainer = ref<HTMLDivElement | null>(null);
const txTableContainer = ref<HTMLDivElement | null>(null);
const itemHeight = 42;
const bufferSize = 5;
const ticking = ref(false);
const blockScrollTimeout = ref<NodeJS.Timeout | null>(null);
const txScrollTimeout = ref<NodeJS.Timeout | null>(null);
const updateNetworkStatsTimeout = ref<NodeJS.Timeout | null>(null);
const indexerHealthInterval = ref<NodeJS.Timeout | null>(null);

function debouncedUpdateNetworkStats() {
  if (updateNetworkStatsTimeout.value) {
    clearTimeout(updateNetworkStatsTimeout.value);
  }
  updateNetworkStatsTimeout.value = setTimeout(() => {
    if (!isNetworkStatusLoading.value) {
      loadNetworkStats();
    }
  }, 500);
}

function initVirtualLists() {
  nextTick(() => {
    if (txTableContainer.value) {
      updateVisibleTxs();
      txTableContainer.value.addEventListener('scroll', handleTxScroll, { passive: true });
    }
  });
}

function handleBlockScroll() {
  if (!ticking.value) {
    ticking.value = true;
    requestAnimationFrame(() => {
      updateVisibleBlocks();
      ticking.value = false;
    });
  }
}

function handleTxScroll() {
  if (!ticking.value) {
    ticking.value = true;
    requestAnimationFrame(() => {
      updateVisibleTxs();
      ticking.value = false;
    });
  }
}

function updateVisibleBlocks() {
  if (!blockTableContainer.value || !base.recents?.length) return;
  const container = blockTableContainer.value;
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;
  const startIndex = Math.floor(scrollTop / itemHeight) - bufferSize;
  const endIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight) + bufferSize;
  const start = Math.max(0, startIndex);
  const end = Math.min(base.recents.length, endIndex);
  if (visibleBlocks.value.length === 0 ||
    Math.abs(visibleBlocks.value[0]?.index - start) >= 2 ||
    Math.abs(visibleBlocks.value[visibleBlocks.value.length - 1]?.index - (end - 1)) >= 2) {
    visibleBlocks.value = base.recents.slice(start, end).map((item, index) => ({
      item,
      index: start + index
    }));
  }
}

function updateVisibleTxs() {
  // ✅ dashboardTxs use karo agar initialized ho, warna base.allTxs fallback
  const txSource = dashboardTxs.value.length > 0 ? dashboardTxs.value : (base.allTxs || [])
  if (!txTableContainer.value || !txSource.length) return;
  const container = txTableContainer.value;
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;
  const startIndex = Math.floor(scrollTop / itemHeight) - bufferSize;
  const endIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight) + bufferSize;
  const start = Math.max(0, startIndex);
  const end = Math.min(txSource.length, endIndex);
  if (visibleTxs.value.length === 0 ||
    Math.abs(visibleTxs.value[0]?.index - start) >= 2 ||
    Math.abs(visibleTxs.value[visibleTxs.value.length - 1]?.index - (end - 1)) >= 2) {
    visibleTxs.value = txSource.slice(start, end).map((item, index) => ({
      item,
      index: start + index
    }));
  }
}

onMounted(async () => {
  store.loadDashboard();
  walletStore.loadMyAsset();
  paramStore.handleAbciInfo();
  console.log("current chain", blockchain.current)
  isNetworkStatusLoading.value = true;

  const currentChain = blockchain.current?.chainName || props.chain || 'pocket-lego-testnet';
  const apiChainNameVal = getApiChainName(currentChain);
  console.log('[Home Page] Loading transactions for chain:', apiChainNameVal);

  try {
    const testResponse = await fetch(`/api/v1/transactions?chain=${apiChainNameVal}&page=1&limit=1`).catch(() => null);
    if (!testResponse || !testResponse.ok) {
      isTxsNodeFallback.value = true;
      txsFallbackError.value = '';
    } else {
      isTxsNodeFallback.value = false;
      txsFallbackError.value = '';
    }
  } catch (e) {
    isTxsNodeFallback.value = true;
    txsFallbackError.value = '';
  }

  base.getAllTxs(apiChainNameVal).then(() => {
    // ✅ Transactions load hone ke baad lastKnownBlock set karo
    if (base.allTxs && base.allTxs.length > 0) {
      lastKnownTxBlockDashboard.value = Math.max(...base.allTxs.map((tx: any) => Number(tx.block_height || 0)))
      lastKnownTxHashDashboard.value = base.allTxs[0]?.hash || ''
    }
    // currentBlockHeight se bhi set karo agar already badh gaya ho
    const currentH = Number(currentBlockHeight.value)
    if (currentH > lastKnownTxBlockDashboard.value) {
      lastKnownTxBlockDashboard.value = currentH
    }
  }).catch(err => {
    console.error('[Home Page] Error loading transactions:', err);
    txsFallbackError.value = err.message || 'Failed to load transactions';
  });

  loadNetworkStats();
  loadTransactionHistory();
  loadServicesSummary24h();

  isNetworkStatusLoading.value = false;

  initVirtualLists();

  // ✅ Blocks load karo - lastKnownHeight automatically set ho jaayega inside loadBlocks()
  loadBlocks();

  loadIndexerHealth();
  
  indexerHealthInterval.value = setInterval(() => {
    loadIndexerHealth();
  }, 30000);
});

const ticker = computed(() => store.coinInfo.tickers[store.tickerIndex]);
const tickers = computed(() => store.coinInfo.tickers);
const currName = ref("")
blockchain.$subscribe((m, s) => {
  if (s.chainName !== currName.value) {
    currName.value = s.chainName
    store.loadDashboard();
    walletStore.loadMyAsset();
    paramStore.handleAbciInfo()
    loadServicesSummary24h();
    loadIndexerHealth();
  }
});
function shortName(name: string, id: string) {
  return name.toLowerCase().startsWith('ibc/') ||
    name.toLowerCase().startsWith('0x')
    ? id
    : name;
}

const comLinks = [
  {
    name: 'Website',
    icon: 'mdi-web',
    href: store.homepage,
  },
  {
    name: 'Twitter',
    icon: 'mdi-twitter',
    href: store.twitter,
  },
  {
    name: 'Telegram',
    icon: 'mdi-telegram',
    href: store.telegram,
  },
  {
    name: 'Github',
    icon: 'mdi-github',
    href: store.github,
  },
];

const change = computed(() => {
  const token = walletStore.balanceOfStakingToken;
  return token ? format.priceChanges(token.denom) : 0;
});
const color = computed(() => {
  switch (true) {
    case change.value > 0:
      return 'text-green-600';
    case change.value === 0:
      return 'text-grey-500';
    case change.value < 0:
      return 'text-red-600';
  }
});

function updateState() {
  walletStore.loadMyAsset()
}

function trustColor(v: string) {
  return `text-${colorMap(v)}`
}

const quantity = ref(100)
const qty = computed({
  get: () => {
    return parseFloat(quantity.value.toFixed(6))
  },
  set: val => {
    quantity.value = val
  }
})
const amount = computed({
  get: () => {
    return quantity.value * ticker.value.converted_last.usd || 0
  },
  set: val => {
    quantity.value = val / ticker.value.converted_last.usd || 0
  }
})

function formatWithCommas(value: number) {
  try {
    return Number(value || 0).toLocaleString();
  } catch (e) {
    return String(value);
  }
}

function formatCompact(value: number) {
  const n = Number(value || 0);
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

const networkStats = ref({
  wallets: 0,
  applications: 0,
  gateways: 0,
  suppliers: 0,
  services: 0
});

const totalRelays24h = ref(0);
const totalComputeUnits24h = ref(0);

async function loadServicesSummary24h() {
  try {
    const params = new URLSearchParams();
    params.append('window', '1');
    params.append('chain', apiChainName.value);
    const response = await fetch(`/api/v1/network-growth/summary?${params.toString()}`);
    const text = await response.text();
    if (!text) throw new Error('Empty response from API');
    const result = JSON.parse(text);
    if (response.ok && result?.data) {
      totalRelays24h.value = Number(result.data.estimated_relays || 0);
      totalComputeUnits24h.value = Number(result.data.estimated_compute_units || 0);
    } else {
      totalRelays24h.value = 0;
      totalComputeUnits24h.value = 0;
      console.error('API error:', result);
    }
  } catch (e) {
    totalRelays24h.value = 0;
    totalComputeUnits24h.value = 0;
    console.error('Error loading 24h services summary:', e);
  }
}

const historicalData = ref({
  series: [
    { name: 'Applications', data: [], yAxisIndex: 0 },
    { name: 'Gateways', data: [], yAxisIndex: 0 },
    { name: 'Suppliers', data: [], yAxisIndex: 0 },
    { name: 'Services', data: [], yAxisIndex: 0 },
    { name: 'Relays', data: [], yAxisIndex: 1 },
    { name: 'Claimed CU', data: [], yAxisIndex: 1 },
    { name: 'Estimated CU', data: [], yAxisIndex: 1 }
  ]
});

const networkGrowthTab = ref<'core-services' | 'performance'>('performance');
const networkGrowthChartType = ref<'bar' | 'area' | 'line'>('area');
const chartCategories = ref<string[]>([]);
const performanceMetric = ref<'relays' | 'compute-units'>('compute-units');
const networkGrowthWindow = ref(7);

const activeNetworkGrowthSeries = computed(() => {
  if (!historicalData.value.series || historicalData.value.series.length === 0) {
    return [];
  }
  
  if (networkGrowthTab.value === 'core-services') {
    const series = historicalData.value.series.slice(0, 4);
    return series.filter(s => s.data && s.data.length > 0).map(s => ({
      ...s,
      yAxisIndex: 0
    }));
  } else {
    if (performanceMetric.value === 'relays') {
      const relaysIndex = 4;
      const selectedSeries = historicalData.value.series[relaysIndex];
      if (selectedSeries && selectedSeries.data && selectedSeries.data.length > 0) {
        return [{ ...selectedSeries, yAxisIndex: 0 }];
      }
      return [];
    } else {
      const proofSubmissionsIndex = 5;
      const settledClaimsIndex = 6;
      const proofSubmissionsSeries = historicalData.value.series[proofSubmissionsIndex];
      const settledClaimsSeries = historicalData.value.series[settledClaimsIndex];
      const result = [];
      if (proofSubmissionsSeries && proofSubmissionsSeries.data && proofSubmissionsSeries.data.length > 0) {
        result.push({ ...proofSubmissionsSeries, yAxisIndex: 0 });
      }
      if (settledClaimsSeries && settledClaimsSeries.data && settledClaimsSeries.data.length > 0) {
        result.push({ ...settledClaimsSeries, yAxisIndex: 0 });
      }
      return result;
    }
  }
});

const chartOptions = computed(() => {
  const isCoreServices = networkGrowthTab.value === 'core-services';
  const chartType = networkGrowthChartType.value;
  
  const colors = isCoreServices 
    ? ['#FFB206', '#09279F', '#5E9AE4', '#60BC29']
    : performanceMetric.value === 'relays' 
      ? ['#A855F7'] 
      : ['#EF4444', '#F97316'];
  
  const isComputeUnits = !isCoreServices && performanceMetric.value === 'compute-units';
  const strokeConfig = chartType === 'bar' 
    ? { width: 0 }
    : {
        curve: chartType === 'area' ? 'smooth' : 'straight',
        width: isCoreServices ? [2.5, 2.5, 2.5, 2.5] : (isComputeUnits ? [2.5, 2.5] : 2.5),
        dashArray: isCoreServices ? [0, 0, 0, 0] : (isComputeUnits ? [0, 5] : 0)
      };
  
  const fillConfig = chartType === 'bar'
    ? { opacity: 1, type: 'solid' }
    : {
        type: chartType === 'area' ? 'gradient' : 'solid',
        opacity: chartType === 'line' ? 0 : (isCoreServices ? [0.15, 0.15, 0.15, 0.15] : (isComputeUnits ? [0.15, 0.15] : 0.15)),
        gradient: chartType === 'area' ? {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.3,
          stops: [0, 90, 100]
        } : undefined
      };
  
  const yaxisConfig = isCoreServices
    ? [{ 
        labels: { style: { colors: 'rgb(116, 109, 105)' } }, 
        title: { text: 'Entities' } 
      }]
    : [
        { 
          labels: { 
            style: { colors: 'rgb(116, 109, 105)' },
            formatter: function (value: number) {
              if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + 'B';
              if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
              if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
              return String(value);
            }
          }, 
          title: { 
            text: performanceMetric.value === 'relays' ? 'Relays' : 'Compute Units',
            style: { color: performanceMetric.value === 'relays' ? '#A855F7' : '#EF4444' }
          },
          opposite: false
        }
      ];
  
  return {
    chart: {
      type: chartType,
      height: 280,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800
      }
    },
    colors: colors,
    dataLabels: { enabled: false },
    stroke: strokeConfig,
    fill: fillConfig,
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      row: { colors: ['transparent'], opacity: 0.5 }
    },
    markers: chartType === 'bar' ? { size: 0 } : chartType === 'line' ? {
      size: isComputeUnits ? [4, 4] : 4,
      strokeWidth: 0,
      hover: { size: 6 }
    } : {
      size: isComputeUnits ? [2, 2] : 2,
      strokeWidth: 0,
      hover: { size: 5 }
    },
    xaxis: {
      categories: chartCategories.value || [],
      type: 'category',
      labels: {
        style: { colors: 'rgb(116, 109, 105)' },
        formatter: function (value: string) { return value; }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: yaxisConfig,
    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'left',
      labels: { colors: 'rgb(116, 109, 105)' }
    },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      y: {
        formatter: function (value: number, opts: any) {
          if (isCoreServices) return `${formatWithCommas(value)}`;
          return `${formatCompact(value)}`;
        }
      }
    }
  };
});

const networkStatsCacheTime = ref(0);
const CACHE_EXPIRATION_MS = 60000;

async function loadNetworkStats() {
  const now = Date.now();
  if (now - networkStatsCacheTime.value < CACHE_EXPIRATION_MS && networkStats.value.wallets > 0) {
    console.log("Using cached network stats");
    return;
  }

  const pageRequest = new PageRequest();
  pageRequest.limit = 1;

  try {
    const [applicationsData, suppliersData, gatewaysData, servicesData, accountsData] = await Promise.all([
      blockchain.rpc.getApplications(pageRequest),
      blockchain.rpc.getSuppliers(pageRequest),
      blockchain.rpc.getGateways(pageRequest),
      blockchain.rpc.getServices(pageRequest),
      blockchain.rpc.getAuthAccounts(pageRequest)
    ]);

    networkStats.value.applications = parseInt(applicationsData.pagination?.total || 0);
    networkStats.value.suppliers = parseInt(suppliersData.pagination?.total || 0);
    networkStats.value.gateways = parseInt(gatewaysData.pagination?.total || 0);
    networkStats.value.services = parseInt(servicesData.pagination?.total || 0);
    networkStats.value.wallets = parseInt(accountsData.pagination?.total || '0');

    networkStatsCacheTime.value = now;

    Promise.allSettled([
      loadNetworkGrowthPerformance(networkGrowthWindow.value),
      loadNetworkGrowthEntities(networkGrowthWindow.value)
    ]).then((results) => {
      const allFailed = results.every(result => result.status === 'rejected');
      if (allFailed) {
        console.warn('Both network growth endpoints failed, using fallback data');
        generateHistoricalData();
      }
    });
  } catch (error) {
    console.error("Error loading network stats:", error);
  }
}

async function loadNetworkGrowthPerformance(windowDays: number = 7) {
  try {
    const params = new URLSearchParams();
    params.append('window', String(windowDays));
    params.append('chain', apiChainName.value);
    const response = await fetch(`/api/v1/network-growth/performance?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error('Network growth performance API error');

    const timeline = result?.data?.timeline || [];
    const daysAsc = timeline.sort((a: any, b: any) => (a.day || '').localeCompare(b.day || ''));

    const labels: string[] = [];
    const relaysDaily: number[] = [];
    const claimedCUDaily: number[] = [];
    const estimatedCUDaily: number[] = [];
    
    for (const dayItem of daysAsc) {
      const dayStr = (dayItem.day || '').slice(0, 10);
      if (!dayStr) continue;
      const d = new Date(dayStr + 'T00:00:00Z');
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      relaysDaily.push(Number(dayItem.estimated_relays || 0));
      claimedCUDaily.push(Number(dayItem.claimed_compute_units || 0));
      estimatedCUDaily.push(Number(dayItem.estimated_compute_units || 0));
    }

    if (estimatedCUDaily.length > 0) {
      const sumEstimated = estimatedCUDaily.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
      const avgEstimated = sumEstimated / estimatedCUDaily.length;
      estimatedCUDaily[estimatedCUDaily.length - 1] = avgEstimated;
    }

    if (chartCategories.value.length === 0 || chartCategories.value.length === labels.length) {
      chartCategories.value = labels;
    }

    historicalData.value.series[4].data = relaysDaily as never[];
    historicalData.value.series[5].data = claimedCUDaily as never[];
    historicalData.value.series[6].data = estimatedCUDaily as never[];
  } catch (e) {
    console.error('Error loading network growth performance:', e);
  }
}

watch(networkGrowthWindow, (newVal, oldVal) => {
  if (newVal === oldVal) return;
  chartCategories.value = [];
  historicalData.value.series = historicalData.value.series.map(series => ({
    ...series,
    data: []
  }));
  Promise.allSettled([
    loadNetworkGrowthPerformance(newVal),
    loadNetworkGrowthEntities(newVal)
  ]).catch((err) => {
    console.error('Error reloading network growth data for new window:', err);
  });
});

async function loadNetworkGrowthEntities(windowDays: number = 7) {
  try {
    const params = new URLSearchParams();
    params.append('window', String(windowDays));
    params.append('chain', apiChainName.value);
    const response = await fetch(`/api/v1/network-growth/entities?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error('Network growth entities API error');

    const timeline = result?.data?.timeline || [];
    const daysAsc = timeline.sort((a: any, b: any) => (a.day || '').localeCompare(b.day || ''));

    const labels: string[] = [];
    const applicationsDaily: number[] = [];
    const suppliersDaily: number[] = [];
    const gatewaysDaily: number[] = [];
    const servicesDaily: number[] = [];
    
    for (const dayItem of daysAsc) {
      const dayStr = (dayItem.day || '').slice(0, 10);
      if (!dayStr) continue;
      const d = new Date(dayStr + 'T00:00:00Z');
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      applicationsDaily.push(Number(dayItem.applications || 0));
      suppliersDaily.push(Number(dayItem.suppliers || 0));
      gatewaysDaily.push(Number(dayItem.gateways || 0));
      servicesDaily.push(Number(dayItem.services || 0));
    }

    const totalApps = Number(networkStats.value.applications || 0);
    const totalSuppliers = Number(networkStats.value.suppliers || 0);
    const totalGateways = Number(networkStats.value.gateways || 0);
    const totalServices = Number(networkStats.value.services || 0);

    const toCumulative = (daily: number[], currentTotal: number) => {
      const sumDaily = daily.reduce((a, b) => a + (Number(b) || 0), 0);
      let startValue = Math.max(0, currentTotal - sumDaily);
      const cumulative: number[] = [];
      for (let i = 0; i < daily.length; i++) {
        startValue += (Number(daily[i]) || 0);
        cumulative.push(startValue);
      }
      return cumulative;
    };

    const applications = toCumulative(applicationsDaily, totalApps);
    const suppliers = toCumulative(suppliersDaily, totalSuppliers);
    const gateways = toCumulative(gatewaysDaily, totalGateways);
    const services = toCumulative(servicesDaily, totalServices);

    if (chartCategories.value.length === 0 || chartCategories.value.length === labels.length) {
      chartCategories.value = labels;
    }

    historicalData.value.series[0].data = applications as never[];
    historicalData.value.series[1].data = gateways as never[];
    historicalData.value.series[2].data = suppliers as never[];
    historicalData.value.series[3].data = services as never[];
  } catch (e) {
    console.error('Error loading network growth entities:', e);
  }
}

function generateHistoricalData() {
  const days = 7;
  const labels = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }

  chartCategories.value = labels;

  const appData = [];
  const supplierData = [];
  const gatewayData = [];
  const serviceData = [];

  let appCount = Math.max(networkStats.value.applications, 5);
  let supplierCount = Math.max(networkStats.value.suppliers, 5);
  let gatewayCount = Math.max(networkStats.value.gateways, 3);
  let serviceCount = Math.max(networkStats.value.services, 4);

  for (let i = 0; i < days; i++) {
    if (i === 0) {
      appData.push(Math.max(1, Math.floor(appCount * 0.6)));
      supplierData.push(Math.max(1, Math.floor(supplierCount * 0.7)));
      gatewayData.push(Math.max(1, Math.floor(gatewayCount * 0.5)));
      serviceData.push(Math.max(1, Math.floor(serviceCount * 0.4)));
    } else if (i < days - 1) {
      const growthFactor = 0.7 + (i * 0.05);
      appData.push(Math.max(1, Math.floor(appCount * growthFactor)));
      supplierData.push(Math.max(1, Math.floor(supplierCount * growthFactor)));
      gatewayData.push(Math.max(1, Math.floor(gatewayCount * growthFactor)));
      serviceData.push(Math.max(1, Math.floor(serviceCount * growthFactor)));
    } else {
      appData.push(appCount);
      supplierData.push(supplierCount);
      gatewayData.push(gatewayCount);
      serviceData.push(serviceCount);
    }
  }

  historicalData.value.series[0].data = appData as never[];
  historicalData.value.series[1].data = supplierData as never[];
  historicalData.value.series[2].data = gatewayData as never[];
  historicalData.value.series[3].data = serviceData as never[];
}

function updateTxChartForWindow(windowDays: number) {
  const labels = fullTxHistoryLabels.value;
  const counts = fullTxHistoryCounts.value;

  if (!labels.length || !counts.length) {
    txChartCategories.value = [];
    txChartSeries.value = [{ name: 'Transactions', data: [] }];
    return;
  }

  const n = labels.length;
  const keep = Math.min(windowDays, n);
  const start = Math.max(0, n - keep);

  txChartCategories.value = labels.slice(start);
  txChartSeries.value = [{
    name: 'Transactions',
    data: counts.slice(start) as never[]
  }];
}

async function loadTransactionHistory() {
  try {
    const currentChain = blockchain.current?.chainName || props.chain || 'pocket-lego-testnet';
    const apiChainNameVal = getApiChainName(currentChain);
    const historyPromise = fetch(`/api/v1/transactions/count?chain=${apiChainNameVal}`).catch(err => {
      console.error("Error fetching transaction history:", err);
      return null;
    });

    const historyResponse = await historyPromise;

    if (historyResponse && historyResponse.ok) {
      const historyData = await historyResponse.json();
      if (historyData.data && historyData.data.labels && historyData.data.counts) {
        transactionStats.value.total = historyData.data.total || 0;
        fullTxHistoryLabels.value = historyData.data.labels || [];
        fullTxHistoryCounts.value = historyData.data.counts || [];
        updateTxChartForWindow(txHistoryWindow.value);
      } else {
        console.error("Invalid history data format:", historyData);
        fallbackToClientSideProcessing();
      }
    } else {
      console.warn("Could not fetch transaction history from API, falling back to client-side processing");
      fallbackToClientSideProcessing();
    }
  } catch (error) {
    console.error("Error loading transaction history:", error);
    fallbackToClientSideProcessing();
  }
}

function fallbackToClientSideProcessing(windowDays: number = 30) {
  const txs = base.allTxs || [];
  const days = windowDays;
  const now = new Date();
  const labels = [];
  const txsByDay = new Map();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const dateKey = date.toISOString().split('T')[0];
    txsByDay.set(dateKey, 0);
  }

  for (const tx of txs) {
    let txDate;
    if (tx.timestamp) {
      txDate = new Date(tx.timestamp);
    } else if (tx.height) {
      const cachedBlock = base._blockCache?.get(tx.height);
      if (cachedBlock && cachedBlock.block.header.time) {
        txDate = new Date(cachedBlock.block.header.time);
      } else {
        const block = base.recents.find(b => b.block.header.height === tx.height);
        if (block && block.block.header.time) {
          txDate = new Date(block.block.header.time);
        }
      }
    }
    if (txDate) {
      const dateKey = txDate.toISOString().split('T')[0];
      if (txsByDay.has(dateKey)) {
        txsByDay.set(dateKey, txsByDay.get(dateKey) + 1);
      }
    }
  }

  const txData = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    txData.push(txsByDay.get(dateKey) || 0);
  }

  fullTxHistoryLabels.value = labels;
  fullTxHistoryCounts.value = txData;
  updateTxChartForWindow(txHistoryWindow.value);
}

watch(() => base.allTxs, (newTxs) => {
  if (newTxs && newTxs.length > 0) {
    console.log(`Transaction data updated, reloading chart with ${newTxs.length} transactions`);
    loadTransactionHistory();
  }
}, { deep: true });

watch(txHistoryWindow, (newVal, oldVal) => {
  if (newVal === oldVal) return;
  updateTxChartForWindow(newVal);
});

onBeforeUnmount(() => {
  if (blockTableContainer.value) {
    blockTableContainer.value.removeEventListener('scroll', handleBlockScroll);
  }
  if (txTableContainer.value) {
    txTableContainer.value.removeEventListener('scroll', handleTxScroll);
  }
  if (blockScrollTimeout.value) clearTimeout(blockScrollTimeout.value);
  if (txScrollTimeout.value) clearTimeout(txScrollTimeout.value);
  if (updateNetworkStatsTimeout.value) clearTimeout(updateNetworkStatsTimeout.value);
  if (indexerHealthInterval.value) clearInterval(indexerHealthInterval.value);
});

watch(() => base.recents.length, () => {
  updateVisibleBlocks();
});

watch(() => base.allTxs.length, () => {
  updateVisibleTxs();
});

watch(() => base.latest?.block?.header?.height, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    debouncedUpdateNetworkStats();
    // Also keep the dashboard \"Latest Blocks\" table fresh by inserting the newest block at the top
    tryPrependLatestBlockToDashboard();
  }
});

watch(() => base.blocktime, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    console.log("Block time changed, updating network stats");
  }
});

// Convert seconds → "Xs" or "Xm Ys"
function formatBlockTime(secondsStr?: string | number) {
  if (!secondsStr) return '0s'
  const totalSeconds = typeof secondsStr === 'string' ? parseFloat(secondsStr) : secondsStr
  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
}

</script>

<template>
  <div class="">

      <div class="bg-base-100 dark:bg-[#1a1f26] pt-[6.5rem]">
      <!-- Subtle Indexer Lag Alert -->
      <div v-if="isIndexerBehind && currentChainIndexerStatus" 
        class="mx-4 mt-2 mb-2 px-4 py-2 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-500/40 flex items-center gap-2 text-sm">
        <Icon icon="mdi:clock-alert-outline" class="text-amber-500 dark:text-amber-400 flex-shrink-0" />
        <div class="flex-1 text-amber-700 dark:text-amber-300">
          <span class="font-medium">Indexer catching up:</span>
          <span class="ml-1">{{ format.formatNumber(currentChainIndexerStatus.latest_height - currentChainIndexerStatus.monitoring_height) }} blocks behind</span>
          <span v-if="currentChainIndexerStatus.latest_height > 0" class="ml-1 text-xs opacity-75">
            ({{ Math.round(((currentChainIndexerStatus.latest_height - currentChainIndexerStatus.monitoring_height) / currentChainIndexerStatus.latest_height) * 100) }}% remaining)
          </span>
        </div>
      </div>
        <!-- Laptop View -->
        <div class="desktop-home flex flex-1 gap-8">
          <div class="w-[45%] py-2">
          <div class="text-lg font-semibold text-main">Network Status</div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 my-2">
            <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center mb-5">
                <Icon icon="mdi:cube-scan" class="text-sm text-[#64748B] mr-1" />
                <span class="text-xs text-secondary">Current Block Height</span>
              </div>
              <div class="text-xl text-main flex items-center justify-center font-medium"> {{ currentBlockHeight }} <a
                  :href="`/${chain}/blocks/${currentBlockHeight}`"
                  class="ml-2 text-xl inline-block text-[#64748B] hover:text-info/70">
                  <Icon icon="mdi:arrow-right-circle" class="text-sm" />
                </a>
              </div>
            </div>
            <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex mb-5 items-center">
                <Icon icon="mdi:server-network" class="text-sm text-[#64748B] mr-1" />
                <span class="text-xs text-secondary">Consensus Nodes</span>
              </div>
              <div class="text-xl text-main flex items-center justify-center font-medium"> {{paramStore.nodeVersion?.items?.length || '0' }}
              </div>
            </div>
            <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex mb-5 items-center">
                <Icon icon="mdi:timer-outline" class="text-sm text-[#64748B] mr-1" />
                <span class="text-xs text-secondary">Avg Block Time (24h)</span>
              </div>
              <div class="text-xl text-main flex items-center justify-center font-medium"> {{ avgBlockProductionTime || 0  }}s
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-2/3 px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex mb-5 items-center">
                <Icon icon="mdi:clock-outline" class="text-sm text-[#64748B] mr-1" />
                <div class="text-xs text-secondary">Latest Block Time</div>
              </div>
              <div class="text-xl text-main flex items-center justify-center font-medium">
                {{ latestBlockTime }}
              </div>
            </div>
            <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-1/3 px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex mb-5 items-center">
                <Icon icon="mdi:chart-box-outline" class="text-sm text-[#64748B] mr-1" />
                <div class="text-xs text-secondary">Avg TX Per Block (24h)</div>
              </div>
              <div class="text-xl text-main flex items-center justify-center font-medium"> {{ averageTxPerBlock }}
              </div>
            </div>
          </div>
        </div>
        <div class="w-[65%] p-2" style="z-index: 1;">
          <div class="text-lg font-semibold text-main">Market Data</div>
          <div class="flex gap-2">
            <div class="w-[90%]">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2 my-2">
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:swap-horizontal" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-xs text-secondary">24h Volume</span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium"> ${{format.formatNumber((store.coinInfo?.market_data?.total_volume?.usd || 0), '123,456,789.[00]') }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:chart-pie" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-xs text-secondary">Market Cap</span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ format.formatNumber(store.coinInfo?.market_data?.market_cap?.usd || 0, '123,456,789.[00]') }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:coins" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-[12px] text-secondary">Circulating Supply</span>
                    <span class="text-[12px] text-secondary ml-1">({{ store.coinInfo?.symbol?.toUpperCase() || '' }})</span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium"> {{format.formatNumber((store.coinInfo?.market_data?.circulating_supply || 0), '123,456,789.[]') }}
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:trophy" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-xs text-secondary">24h High / Low</span>
                  </div>
                  <div class="text-xs font-medium mt-1 flex gap-1">
                    <span class="text-xs text-[#60BC29]">${{ store.coinInfo?.market_data?.high_24h?.usd?.toFixed(6) || '0.00' }}</span>
                    /
                    <span class="text-xs text-[#EE6161]">${{ store.coinInfo?.market_data?.low_24h?.usd?.toFixed(6) || '0.00'}}</span>
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:trending-up" class=" text-sm mr-1 text-[#64748B]" />
                    <span class="text-xs text-secondary">All Time High</span>
                    <span class="text-xs ml-2"
                      :class="{ 'text-[#EE6161]': (store.coinInfo?.market_data?.ath_change_percentage?.usd || 0) < 0, 'text-[#60BC29]': (store.coinInfo?.market_data?.ath_change_percentage?.usd || 0) > 0 }">
                      ({{store.coinInfo?.market_data?.ath_change_percentage?.usd?.toFixed(2) || '0.00' }}%)
                    </span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ store.coinInfo?.market_data?.ath?.usd?.toFixed(6) || '0.00' }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center justify-evenly">
                    <Icon icon="mdi:trending-down" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-xs text-secondary">All Time Low</span>
                    <span class="text-xs ml-2"
                      :class="{ 'text-[#EE6161]': (store.coinInfo?.market_data?.atl_change_percentage?.usd || 0) < 0, 'text-[#60BC29]': (store.coinInfo?.market_data?.atl_change_percentage?.usd || 0) > 0 }">
                      ({{store.coinInfo?.market_data?.atl_change_percentage?.usd?.toFixed(2) || '0.00' }}%)
                    </span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ store.coinInfo?.market_data?.atl?.usd?.toFixed(6) || '0.00' }}
                  </div>
                </div>
              </div>
            </div>
            <div class="
             flex flex-col w-[25%] p-6 mt-2 rounded-2xl justify-between items-center
             bg-gradient-to-br from-[#1f3fbf] via-[#2447d6] to-[#1a2f8f]
             dark:from-[#1f3fbf] dark:via-[#2447d6] dark:to-[#1a2f8f]
             shadow-lg hover:shadow-xl transition-all duration-300
             ">
              <img src="https://pocket.network/wp-content/uploads/2025/01/logo-white.png" alt="Coin logo" class="w-2/3 justify-self-center" />
              <div class="flex flex-col item-center mx-auto">
                <div class="text-xl text-center text-[#ffffff]">
                  ${{ store.coinInfo?.market_data?.current_price?.usd?.toFixed(6) || '0.00' }}
                </div>
                <div class="text-sm text-end"
                  :class="(store.coinInfo?.market_data?.price_change_percentage_24h || 0) > 0 ? 'text-[#60BC29]' : 'text-[#EE6161]'">
                  {{ (store.coinInfo?.market_data?.price_change_percentage_24h || 0) > 0 ? '+' : '' }} {{store.coinInfo?.market_data?.price_change_percentage_24h?.toFixed(2) || '0.00' }}%
                </div>
              </div>
              <a class="!text-[#000000] btn btn-sm w-full !bg-[#ffd60a] !border-[#ffd60a]"
                :class="{ '!btn-[#60BC29]': store.trustColor === 'green', '!btn-warning': store.trustColor === 'yellow' }"
                :href="ticker?.trade_url" target="_blank">
                {{ $t('index.buy') }} {{ store.coinInfo?.symbol?.toUpperCase() || 'COIN'}}
              </a>
            </div>
          </div>
        </div>
        </div>  

      </div>  
      <div class="flex mt-4 mb-2 w-full flex-col lg:flex-row gap-4 bg-base-100 dark:bg-[#1a1f26]">  
        <!-- Mobile / Tablet view -->
        <div class="mobile-home">
          <div class="p-2 w-full lg:w-2/3">
            <div class="text-lg font-semibold text-main">Network Status</div>
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 my-2">
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex items-center mb-5">
                    <Icon icon="mdi:cube-scan" class="text-sm max-[1024px]:text-[8px] max-[1024px]:font-bold text-[#64748B] mr-1" />
                    <span class="text-[10px] max-[1024px]:text-[8px] max-[1024px]:font-bold text-secondary">Current Block Height</span>
                  </div>
                  <div class="text-xl max-[1024px]:text-xs text-main flex items-center justify-center font-medium">
                    {{ currentBlockHeight }}
                    <a :href="`/${chain}/blocks/${currentBlockHeight}`" class="ml-2 text-xl max-[1024px]:text-xs inline-block text-[#64748B] hover:text-info/70">
                      <Icon icon="mdi:arrow-right-circle" class="text-sm max-[1024px]:text-xs" />
                    </a>
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:server-network" class="text-sm max-[1024px]:text-[8px] max-[1024px]:font-bold text-[#64748B] mr-1" />
                    <span class="text-[10px] max-[1024px]:text-[8px] max-[1024px]:font-bold text-secondary">Consensus Nodes</span>
                  </div>
                  <div class="text-xl max-[1024px]:text-xs text-main flex items-center justify-center font-medium">
                    {{ paramStore.nodeVersion?.items?.length || '0' }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:timer-outline" class="text-sm max-[1024px]:text-[8px] max-[1024px]:font-bold text-[#64748B] mr-1" />
                    <span class="text-[10px] max-[1024px]:text-[8px] max-[1024px]:font-bold text-secondary">Avg Block Time (24h)</span>
                  </div>
                  <div class="text-xl max-[1024px]:text-xs text-main flex items-center justify-center font-medium">
                    {{ avgBlockProductionTime || 0 }}s
                  </div>
                </div>
              </div>

              <div class="flex gap-2 flex-col md:flex-row">
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:clock-outline" class="text-sm max-[1024px]:text-[8px] max-[1024px]:font-bold text-[#64748B] mr-1" />
                    <div class="text-[10px] max-[1024px]:text-[8px] max-[1024px]:font-bold text-secondary">Latest Block Time</div>
                  </div>
                  <div class="text-xl max-[1024px]:text-xs text-main flex items-center justify-center font-medium">
                    {{ latestBlockTime }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:chart-box-outline" class="text-sm max-[1024px]:text-[8px] max-[1024px]:font-bold text-[#64748B] mr-1" />
                    <div class="text-[10px] max-[1024px]:text-[8px] max-[1024px]:font-bold text-secondary">Avg TX Per Block (24h)</div>
                  </div>
                  <div class="text-xl max-[1024px]:text-xs text-main flex items-center justify-center font-medium">
                    {{ averageTxPerBlock }}
                  </div>
                </div>
            </div>
          </div>
        </div>

        <!-- Mobile / Tablet view -->
        <div class="mobile-home">
          <div class="p-2 w-full lg:w-1/3">
            <div class="text-lg font-semibold text-main">Market Data</div>
            <div class="flex flex-col lg:flex-row gap-2">
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 my-2 w-full">
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:swap-horizontal" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-[10px] text-secondary">24h Volume</span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ format.formatNumber((store.coinInfo?.market_data?.total_volume?.usd || 0), '123,456,789.[00]') }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:chart-pie" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-[10px] text-secondary">Market Cap</span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ format.formatNumber(store.coinInfo?.market_data?.market_cap?.usd || 0, '123,456,789.[00]') }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center gap-1">
                    <Icon icon="mdi:coins" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-[10px] text-secondary">Circulating Supply</span>
                    <span class="text-[10px] text-secondary">({{ store.coinInfo?.symbol?.toUpperCase() || '' }})</span>
                  </div>
                  <div class="text-xl text-main flex flex-col items-center font-medium">
                    {{ format.formatNumber((store.coinInfo?.market_data?.circulating_supply || 0), '123,456,789.[]') }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:trophy" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-[10px] text-secondary">24h High / Low</span>
                  </div>
                  <div class="text-xs font-medium mt-1 flex gap-1">
                    <span class="text-xs text-[#60BC29]">${{ store.coinInfo?.market_data?.high_24h?.usd?.toFixed(6) ||'0.00' }}</span> /
                    <span class="text-xs text-[#EE6161]">${{ store.coinInfo?.market_data?.low_24h?.usd?.toFixed(6) || '0.00' }}</span>
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center">
                    <Icon icon="mdi:trending-up" class=" text-sm mr-1 text-[#64748B]" />
                    <span class="text-[10px] text-secondary">All Time High</span>
                    <span class="text-xs ml-2"
                      :class="{ 'text-[#EE6161]': (store.coinInfo?.market_data?.ath_change_percentage?.usd || 0) < 0, 'text-[#60BC29]': (store.coinInfo?.market_data?.ath_change_percentage?.usd || 0) > 0 }">
                      ({{ store.coinInfo?.market_data?.ath_change_percentage?.usd?.toFixed(2) || '0.00' }}%)
                    </span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ store.coinInfo?.market_data?.ath?.usd?.toFixed(6) || '0.00' }}
                  </div>
                </div>
                <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-1 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
                  <div class="flex mb-5 items-center justify-evenly">
                    <Icon icon="mdi:trending-down" class="text-sm mr-1 text-[#64748B]" />
                    <span class="text-[10px] text-secondary">All Time Low</span>
                    <span class="text-xs ml-2"
                      :class="{ 'text-[#EE6161]': (store.coinInfo?.market_data?.atl_change_percentage?.usd || 0) < 0, 'text-[#60BC29]': (store.coinInfo?.market_data?.atl_change_percentage?.usd || 0) > 0 }">
                      ({{ store.coinInfo?.market_data?.atl_change_percentage?.usd?.toFixed(2) || '0.00' }}%)
                    </span>
                  </div>
                  <div class="text-xl text-main flex items-center justify-center font-medium">
                    ${{ store.coinInfo?.market_data?.atl?.usd?.toFixed(6) || '0.00' }}
                  </div>
                </div>
                <div class="flex flex-col w-full gap-2 p-3 mt-3 rounded-xl justify-center items-center  bg-gradient-to-br from-[#1f3fbf] via-[#2447d6] to-[#1a2f8f]
                    dark:from-[#1f3fbf] dark:via-[#2447d6] dark:to-[#1a2f8f]
                    shadow-lg hover:shadow-xl transition-all duration-300">
                  <img src="https://pocket.network/wp-content/uploads/2025/01/logo-white.png" alt="Coin logo" class="w-24" />
                  <div class="text-sm text-center text-[#ffffff]">
                    ${{ store.coinInfo?.market_data?.current_price?.usd?.toFixed(6) || '0.00' }}
                  </div>
                  <div class="text-xs"
                      :class="(store.coinInfo?.market_data?.price_change_percentage_24h || 0) > 0 ? 'text-[#60BC29]' : 'text-[#EE6161]'">
                    {{ (store.coinInfo?.market_data?.price_change_percentage_24h || 0) > 0 ? '+' : '' }}
                    {{ store.coinInfo?.market_data?.price_change_percentage_24h?.toFixed(2) || '0.00' }}%
                  </div>
                  <a class="!text-white btn btn-sm w-full !bg-[#ffd60a] !border-[#ffd60a]"
                    :href="ticker?.trade_url" target="_blank">
                    {{ $t('index.buy') }} {{ store.coinInfo?.symbol?.toUpperCase() || 'COIN' }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    <!-- Network Statistics Section -->
    <div class="bg-base-100 dark:bg-[#1a1f26] pt-3 pb-4 mt-2">
      <div class="flex items-center mb-4">
        <div class="text-lg font-semibold text-main">Network Statistics</div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-8 gap-4">
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:wallet" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Total Wallets</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium"> {{ networkStats.wallets.toLocaleString() }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:apps" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Applications</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ networkStats.applications.toLocaleString() }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:package-variant" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Suppliers</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ networkStats.suppliers.toLocaleString() }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:gate" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Gateways</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ networkStats.gateways.toLocaleString() }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:handshake" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Services</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ networkStats.services.toLocaleString() }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:network" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Relays (24h)</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ formatCompact(totalRelays24h) }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:cpu-64-bit" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Compute Units (24h)</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ formatCompact(totalComputeUnits24h) }}
          </div>
        </div>
        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex mb-5 items-center">
            <Icon icon="mdi:shield-check" class="text-sm mr-1 text-secondary" />
            <span class="text-xs text-secondary">Active Validators</span>
          </div>
          <div class="text-xl text-main flex items-center justify-center font-medium">
            {{ activeValidatorsCount }}
          </div>
        </div>
      </div>
    </div>

    <!-- Governance Section -->
    <div v-if="blockchain.supportModule('governance')"
      class="bg-base-100 px-4 pt-3 pb-4 rounded-md shadow-md border-t-4 border-accent">
      <div class="flex items-center mb-4">
        <Icon icon="mdi:gavel" class="text-2xl text-accent mr-2" />
        <div class="text-lg font-semibold text-main">Active Proposals</div>
      </div>
      <div class="pb-4">
        <ProposalListItem :proposals="store?.proposals" />
      </div>
      <div class="py-8 text-center" v-if="store.proposals?.proposals?.length === 0">
        <Icon icon="mdi:vote-outline" class="text-4xl text-accent/40 mb-2" />
        <div class="text-secondary">No active proposals at this time</div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
      <!-- Network Growth Chart -->
      <div class="bg-base-200 pt-3 rounded-lg hover:bg-base-300 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center justify-between mb-4 px-5 gap-4">
          <div class="flex flex-1 items-center gap-4 justify-between">
            <div class="flex text-lg font-semibold text-main">Network Growth</div>
            <div class="flex tabs tabs-boxed bg-base-200 dark:bg-base-300">
              <button @click="networkGrowthTab = 'performance'" :class="['tab', networkGrowthTab === 'performance' ? 'tab-active bg-[#09279F] text-white' : '']">Performance</button>
              <button @click="networkGrowthTab = 'core-services'" :class="['tab', networkGrowthTab === 'core-services' ? 'tab-active bg-[#09279F] text-white' : '']">Services</button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-secondary">Window</span>
            <select v-model.number="networkGrowthWindow" class="select select-xs select-bordered bg-base-100 dark:bg-base-200 text-xs">
              <option :value="7">7d</option>
              <option :value="15">15d</option>
            </select>
          </div>
        </div>
        <div class="dark:bg-base-200 bg-base-100 p-4 rounded-md relative">
          <div class="h-80">
            <ApexCharts 
              v-if="chartCategories.length > 0 && activeNetworkGrowthSeries.length > 0"
              :key="`${networkGrowthTab}-${networkGrowthChartType}-${performanceMetric}`"
              :type="networkGrowthChartType" 
              height="280" 
              :options="chartOptions" 
              :series="activeNetworkGrowthSeries" 
            />
            <div v-else class="flex items-center justify-center h-full">
              <div class="loading loading-spinner loading-md"></div>
              <span class="ml-2 text-secondary">Loading chart data...</span>
            </div>
          </div>
          <div v-if="networkGrowthTab === 'performance'" class="absolute bottom-2 left-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button @click="performanceMetric = 'compute-units'" :class="['tab', performanceMetric === 'compute-units' ? 'tab-active bg-[#EF4444] text-white' : 'hover:bg-base-300']" title="Compute Units">
              <Icon icon="mdi:cpu-64-bit" class="text-sm mr-1" />Compute Units
            </button>
            <button @click="performanceMetric = 'relays'" :class="['tab', performanceMetric === 'relays' ? 'tab-active bg-[#A855F7] text-white' : 'hover:bg-base-300']" title="Relays">
              <Icon icon="mdi:network" class="text-sm mr-1" />Relays
            </button>
          </div>
          <div class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button @click="networkGrowthChartType = 'bar'" :class="['tab', networkGrowthChartType === 'bar' ? 'tab-active bg-[#09279F] text-white' : '']" title="Bar Chart"><Icon icon="mdi:chart-bar" class="text-sm" /></button>
            <button @click="networkGrowthChartType = 'area'" :class="['tab', networkGrowthChartType === 'area' ? 'tab-active bg-[#09279F] text-white' : '']" title="Area Chart"><Icon icon="mdi:chart-areaspline" class="text-sm" /></button>
            <button @click="networkGrowthChartType = 'line'" :class="['tab', networkGrowthChartType === 'line' ? 'tab-active bg-[#09279F] text-white' : '']" title="Line Chart"><Icon icon="mdi:chart-line" class="text-sm" /></button>
          </div>
        </div>
      </div>

      <!-- Transaction History Chart -->
      <div class="bg-base-200 pt-3 rounded-lg hover:bg-base-300 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center justify-between mb-4 px-5">
          <div class="flex items-center">
            <div class="text-lg font-semibold text-main">Transaction History</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-secondary">Window</span>
            <select v-model.number="txHistoryWindow" class="select select-xs select-bordered bg-base-100 dark:bg-base-200 text-xs">
              <option :value="7">7d</option>
              <option :value="15">15d</option>
              <option :value="30">1m</option>
            </select>
          </div>
        </div>
        <div class="dark:bg-base-200 bg-base-100 p-4 rounded-md relative">
          <div class="h-80">
            <ApexCharts :type="txChartType" height="280" :options="txChartOptions" :series="txChartSeries" :key="`tx-${txChartType}`" />
          </div>
          <div class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button @click="txChartType = 'bar'" :class="['tab', txChartType === 'bar' ? 'tab-active bg-[#09279F] text-white' : '']" title="Bar Chart"><Icon icon="mdi:chart-bar" class="text-sm" /></button>
            <button @click="txChartType = 'area'" :class="['tab', txChartType === 'area' ? 'tab-active bg-[#09279F] text-white' : '']" title="Area Chart"><Icon icon="mdi:chart-areaspline" class="text-sm" /></button>
            <button @click="txChartType = 'line'" :class="['tab', txChartType === 'line' ? 'tab-active bg-[#09279F] text-white' : '']" title="Line Chart"><Icon icon="mdi:chart-line" class="text-sm" /></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tables Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
      <!-- ✅ Blocks Table - Ab auto prepend hoga naye block aane par -->
      <div class="bg-[#ffffff] hover:bg-base-200 pt-3 mb-5 rounded-lg shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center">
            <div class="text-lg font-semibold text-main ml-5">Latest Blocks</div>
          </div>
          <RouterLink :to="`/${chain}/blocks`"
            class="hover:text-info/70 text-sm flex items-center transition-colors duration-200 mr-5">
            View All
            <Icon icon="mdi:arrow-right" class="ml-1" />
          </RouterLink>
        </div>

        <!-- 🔴 Fallback Warning Banner for Blocks -->
        <div
          v-if="isBlocksNodeFallback"
          :class="blocksFallbackError ? 'bg-red-100 border-red-400 text-red-700' : 'bg-yellow-100 border-yellow-400 text-yellow-700'"
          class="border px-4 py-2 mx-5 mb-3 rounded-lg"
          role="alert"
        >
          <div class="flex items-center">
            <Icon :icon="blocksFallbackError ? 'mdi:alert-octagon' : 'mdi:alert-circle'" class="mr-2 text-lg" />
            <span class="text-sm font-medium">
              <span v-if="!blocksFallbackError">Currently showing data from node because main server is down.</span>
              <span v-else>Unable to load blocks: {{ blocksFallbackError }}</span>
            </span>
          </div>
        </div>

        <div class="bg-base-200 rounded-md overflow-auto" style="max-height: 30rem;">
          <table class="table table-compact w-full bg-base-200">
            <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0 border-0">
              <tr class="border-none bg-base-200">
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('block.block_header') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.hash') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('block.proposer') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('module.tx') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.time') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.production_time') }}</th>
              </tr>  
            </thead>

            <tbody v-if="loadingBlocks">
              <tr class="text-center">
                <td colspan="6" class="py-8">
                  <div class="flex justify-center items-center">
                    <div class="loading loading-spinner loading-md"></div>
                    <span class="ml-2">Loading blocks...</span>
                  </div>
                </td>
              </tr>
            </tbody>

            <!-- ✅ TransitionGroup: naya block smoothly upar se aata hai -->
            <TransitionGroup
              v-if="!loadingBlocks && blocks.length > 0"
              name="block-slide"
              tag="tbody"
            >
              <tr
                v-for="block in blocks"
                :key="block.height"
                class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl"
              >
                <td class="font-medium">{{ block.height }}</td>
                <td class="truncate text-[#153cd8] dark:text-warning" style="max-width: 12rem; overflow:hidden;">
                  <RouterLink class="truncate hover:underline" :title="block.hash"
                    :to="`/${chain}/blocks/${block.height}`">{{ block.hash || block.id.split(":")[1] }}
                  </RouterLink>
                </td>
                <td>{{ format.validator(block.proposer) }}</td>
                <td>{{ (block.transaction_count ?? 0).toLocaleString() }}</td>
                <td class="text-sm">{{ format.toDay(block.timestamp, 'from') }}</td>
                <td class="">{{ formatBlockTime(block.block_production_time) }}</td>
              </tr>
            </TransitionGroup>

            <tbody v-else-if="!loadingBlocks && blocks.length === 0">
              <tr>
                <td colspan="6" class="text-center">No blocks found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Transactions Table -->
      <div class="bg-[#ffffff] hover:bg-base-200 pt-3 mb-5 rounded-lg shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center">
            <div class="text-lg font-semibold text-main ml-5">{{ $t('module.rtx') }}</div>
          </div>
          <RouterLink :to="`/${chain}/tx`"
            class="hover:text-warning/70 text-sm flex items-center transition-colors duration-200 mr-5">
            View All
            <Icon icon="mdi:arrow-right" class="ml-1" />
          </RouterLink>
        </div>

        <!-- 🔴 Fallback Warning Banner for Transactions -->
        <div
          v-if="isTxsNodeFallback"
          :class="txsFallbackError ? 'bg-red-100 border-red-400 text-red-700' : 'bg-yellow-100 border-yellow-400 text-yellow-700'"
          class="border px-4 py-2 mx-5 mb-3 rounded-lg"
          role="alert"
        >
          <div class="flex items-center">
            <Icon :icon="txsFallbackError ? 'mdi:alert-octagon' : 'mdi:alert-circle'" class="mr-2 text-lg" />
            <span class="text-sm font-medium">
              <span v-if="!txsFallbackError">Currently showing data from node because main server is down.</span>
              <span v-else>Unable to load transactions: {{ txsFallbackError }}</span>
            </span>
          </div>
        </div>

        <div class="bg-base-200 rounded-md overflow-auto" style="height: 30rem;" ref="txTableContainer">
          <table class="table table-compact w-full bg-base-200">
            <thead class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200 sticky top-0 border-0">
              <tr class="border-none bg-base-200">
                <th class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200">{{ $t('tx.tx_hash') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200">{{ $t('block.block') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200">{{ $t('staking.status') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200">{{ $t('account.type') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200">{{ $t('block.fees') }}</th>
                <th class="dark:bg-[rgba(255,255,255,.03)]  bg-base-200">{{ $t('account.time') }}</th>
              </tr>
            </thead>
          <!-- Loading state -->
          <tbody v-if="dashboardTxs.length === 0 && (!base.allTxs || base.allTxs.length === 0)">
            <tr>
              <td colspan="6" class="py-8 text-center text-gray-500">No transactions found</td>
            </tr>
          </tbody>

          <!-- ✅ TransitionGroup tag="tbody" - smooth animation -->
          <TransitionGroup
            v-else
            name="tx-slide"
            tag="tbody"
          >
            <tr v-for="item in visibleTxs" :key="item.item.hash || item.index"
              class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
              <td class="truncate text-[#153cd8]" style="max-width:10rem">
                <RouterLink class="truncate hover:underline" :to="`/${props.chain}/tx/${item.item.hash}`">{{ item.item.hash }}</RouterLink>
              </td>
              <td class="text-sm text-[#153cd8]">
                <RouterLink :to="`/${props.chain}/blocks/${item.item.block_height}`" class="hover:underline">{{ item.item.block_height }}</RouterLink>
              </td>
              <td>
                <span class="text-xs truncate py-1 px-3 rounded-full"
                  :class="(isTxsNodeFallback && item.item.status == 0) || item.item.status || item.item.tx_response?.code === 0 ? 'bg-[#60BC29]/10 text-[#60BC29]' : 'bg-[#E03834]/10 text-[#E03834]'">
                  {{ (isTxsNodeFallback && item.item.status == 0) || item.item.status || item.item.tx_response?.code === 0 ? 'Success' : 'Failed' }}
                </span>
              </td>
              <td>{{ item.item.type }}</td>
              <td>{{ format.formatTokens([{ amount: item.item.fee, denom: 'upokt' }]) }}</td>
              <td class="text-sm">{{ format.toDay(item.item.timestamp, 'from') }}</td>
            </tr>
          </TransitionGroup>
          </table>
        </div>
      </div>
    </div>

    <!-- Node Information Section -->
    <div v-if="!store.coingeckoId"
      class="bg-base-100 px-4 pt-3 pb-4 rounded-md shadow-md border-t-4 border-accent mt-5">
      <div class="flex items-center mb-4">
        <Icon icon="mdi:server" class="text-2xl text-accent mr-2" />
        <div class="text-lg font-semibold text-main">Node Information</div>
      </div>
      <div class="bg-base-200 rounded-md p-4">
        <ArrayObjectElement :value="paramStore.nodeVersion?.items" :thead="false" />
      </div>
    </div>
  </div>
</template>

<route>
  {
    meta: {
      i18n: 'dashboard',
      order: 1,
    }
  }
</route>

<style scoped>

.desktop-home {
  display: none;
}

.mobile-home {
  display: block;
}

@media (min-width: 1024px) {
  .desktop-home {
    display: flex;
  }
  .mobile-home {
    display: none;
  }
}

/* Styles for virtualized tables */
.table tr.h-0 {
  display: table-row;
  line-height: 0;
  height: 0;
}

.table tr.h-0 td {
  padding: 0;
  border: none;
}

.table tbody tr {
  contain: layout style;
}

.bg-base-200 {
  will-change: transform;
  transform: translateZ(0);
}

/* ✅ Naye block ka smooth slide-down animation */
.block-slide-enter-active {
  transition: all 0.4s ease;
}
.block-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.block-slide-enter-to {
  opacity: 1;
  transform: translateY(0);
}

/* ✅ Last row fade out */
.block-slide-leave-active {
  transition: all 0.3s ease;
}
.block-slide-leave-from {
  opacity: 1;
}
.block-slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ✅ Baaki rows ka smooth shift */
.block-slide-move {
  transition: transform 0.4s ease;
}

/* ✅ Transaction slide animation */
.tx-slide-enter-active { transition: all 0.4s ease; }
.tx-slide-enter-from { opacity: 0; transform: translateY(-12px); }
.tx-slide-enter-to { opacity: 1; transform: translateY(0); }

.tx-slide-leave-active { transition: all 0.3s ease; }
.tx-slide-leave-from { opacity: 1; }
.tx-slide-leave-to { opacity: 0; transform: translateY(8px); }

.tx-slide-move { transition: transform 0.4s ease; }
</style>