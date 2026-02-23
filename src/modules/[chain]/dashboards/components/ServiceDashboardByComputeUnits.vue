<script lang="ts" setup>
import { ref, onMounted, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import ApexCharts from 'vue3-apexcharts';
import { useBlockchain, useFormatter } from '@/stores';
import { fetchNetworkAverages, fetchTopPerformers, calculateGrowthRates, calculateTrends, type NetworkAverages, type TopPerformersThreshold } from '../composables/useSupplierAnalytics';

const props = defineProps<{
  chain?: string;
  filters?: {
    supplier_address?: string;
    owner_address?: string;
    supplier_status?: string;
  };
  showTabs?: boolean;
  tabView?: 'summary' | 'chain' | 'performance' | 'reward-share';
  startDate?: string;
  endDate?: string;
}>();

const chainStore = useBlockchain();
const format = useFormatter();

const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  };
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

const current = chainStore?.current?.chainName || props.chain || 'pocket-beta';
const apiChainName = computed(() => getApiChainName(current));

// Helper function to determine if we should use POST (multiple addresses or long URL)
function shouldUsePost(params: URLSearchParams): boolean {
  const supplierFilter = props.filters?.supplier_address;
  if (!supplierFilter) return false;
  
  // Check if it's comma-separated (multiple addresses)
  if (typeof supplierFilter === 'string' && supplierFilter.includes(',')) {
    return true;
  }
  
  // Check if URL would be too long (conservative estimate: > 2000 chars)
  const url = `?${params.toString()}`;
  return url.length > 2000;
}

// Helper function to make API request (GET or POST)
async function fetchApi(url: string, params: URLSearchParams, body?: any): Promise<any> {
  const isRewardsEndpoint = url.includes('/claims/rewards');
  const isSummaryEndpoint = url.includes('/claims/summary');
  const isClaimsEndpoint = url.includes('/claims') && !isRewardsEndpoint && !isSummaryEndpoint;
  const isSuppliersPerformanceEndpoint = url.includes('/suppliers/performance');
  
  // Check if we have supplier_address parameter
  const hasSupplierAddress = params.has('supplier_address');
  const supplierAddressValue = hasSupplierAddress ? params.get('supplier_address') : null;
  const hasMultipleSuppliers = supplierAddressValue && supplierAddressValue.includes(',');
  
  // For suppliers/performance endpoint: always use POST when supplier_address is present
  // For rewards and summary endpoints: always use POST when supplier_address or owner_address is present
  // This ensures proper handling of supplier_addresses array format
  const hasOwnerAddress = params.has('owner_address');
  const shouldPost = isSuppliersPerformanceEndpoint || shouldUsePost(params) || body || 
    ((isRewardsEndpoint || isSummaryEndpoint || isClaimsEndpoint) && (hasSupplierAddress || hasOwnerAddress));
  
  if (shouldPost) {
    // Use POST with request body
    const postBody: any = {};
    params.forEach((value, key) => {
      // For suppliers/performance endpoint, handle supplier_address
      if (isSuppliersPerformanceEndpoint && key === 'supplier_address') {
        const trimmedValue = value.trim();
        if (trimmedValue.length > 0) {
          // Split comma-separated addresses and convert to supplier_address array
          const addresses = trimmedValue.split(',').map((addr: string) => addr.trim()).filter((addr: string) => addr.length > 0);
          if (addresses.length > 0) {
            postBody.supplier_address = addresses; // POST endpoint expects array
          }
        }
      }
      // For rewards, summary, and claims endpoints, handle supplier_address specially
      else if ((isRewardsEndpoint || isSummaryEndpoint || isClaimsEndpoint) && key === 'supplier_address') {
        // Check if value contains comma (multiple addresses)
        const trimmedValue = value.trim();
        if (trimmedValue.includes(',')) {
          // Multiple addresses: use supplier_addresses array for POST
          const addresses = trimmedValue.split(',').map((addr: string) => addr.trim()).filter((addr: string) => addr.length > 0);
          if (addresses.length > 0) {
            postBody.supplier_addresses = addresses;
          }
          // Do NOT include supplier_address when using supplier_addresses
        } else if (trimmedValue.length > 0) {
          // Single address: use supplier_address (POST supports both formats)
          postBody.supplier_address = trimmedValue;
        }
      } else {
        // Include all other parameters (owner_address, status, chain, start_date, end_date, service_id, application_address, etc.)
        postBody[key] = value;
      }
    });
    if (body) Object.assign(postBody, body);
        
    // Debug: Log the POST body to verify filters are included
    // console.log('POST request to', url, 'with body:', postBody);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  } else {
    // Use GET
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }
}

interface Claim {
  id: number;
  supplier_operator_address: string;
  application_address: string;
  service_id: string;
  session_id: string;
  session_start_block_height: string;
  session_end_block_height: string;
  root_hash: string;
  proof: string | null;
  status: string;
  timestamp: string;
  chain: string;
  claim_proof_status_int: number;
  claimed_upokt: string;
  claimed_upokt_amount: number;
  num_claimed_compute_units: number;
  num_estimated_compute_units: number;
  num_relays: number;
  compute_unit_efficiency: number;
  reward_per_relay: number;
  created_at: string;
}

interface RewardAnalytics {
  service_id: string;
  chain: string;
  total_claims: number;
  total_rewards_upokt: number;
  total_relays: number;
  total_claimed_compute_units: number;
  total_estimated_compute_units: number;
  avg_efficiency_percent: number;
  avg_reward_per_relay: number;
  max_reward_per_claim: number;
  min_reward_per_claim: number;
}

interface SummaryStats {
  total_claims: string;
  unique_suppliers: string;
  unique_applications: string;
  unique_services: string;
  total_rewards_upokt: string;
  total_relays: string;
  total_claimed_compute_units: string;
  total_estimated_compute_units: string;
  avg_efficiency_percent: string;
  avg_reward_per_relay: string;
  first_claim: string;
  last_claim: string;
}

interface TopServiceByComputeUnits {
  service_id: string;
  chain: string;
  total_claimed_compute_units: string;
  total_estimated_compute_units: string;
  submission_count: string;
  avg_efficiency_percent: string;
  period_start: string;
  period_end: string;
}

interface TopServiceByPerformance {
  rank: number;
  service_id: string;
  chain: string;
  total_claimed_compute_units: string;
  total_estimated_compute_units: string;
  submission_count: number;
  avg_efficiency_percent: number;
  percentage_of_total: number;
  period_start: string;
  period_end: string;
}

const loading = ref(false);
const summaryStats = ref<SummaryStats | null>(null);
const claims = ref<Claim[]>([]);
const rewardAnalytics = ref<RewardAnalytics[]>([]);
const currentPage = ref(1);
const currentPages = ref(1);
const itemsPerPage = ref(25);
const itemsPerPages = ref(10); // For performance tab
const itemPerPage = ref(10);
const totalPages = ref(0);
const rewardCurrentPage = ref(1);
const rewardItemsPerPage = ref(10); // ya jo dropdown se aa raha
const rewardTotalItems = computed(() => topServicesByPerformance.value.length);

const rewardTotalPages = computed(() =>
  Math.ceil(rewardTotalItems.value / rewardItemsPerPage.value)
);

const selectedService = ref('');
const selectedSupplier = ref('');
const selectedApplication = ref('');
const startDate = ref('');
const endDate = ref('');
const uniqueServices = ref(['iotex', 'avax', 'blast', 'fuse']);

// PAGINATION FOR SERVICE REWARDS TABLE - YEH NAYA ADD KIYA HAI
const serviceRewardsCurrentPage = ref(1);
const serviceRewardsItemsPerPage = ref(25);
const serviceRewardsTotalCount = ref(0);
const serviceRewardsTotalPagesFromApi = ref(0);

const topServicesByComputeUnits = ref<TopServiceByComputeUnits[]>([]);
const topServicesByPerformance = ref<TopServiceByPerformance[]>([]);
const totalComputeUnits = ref(0);
const loadingTopServices = ref(false);
const loadingPerformanceTable = ref(false);
const topServicesLimit = ref(20);
const topServicesDays = ref(30);
const performanceDays = ref(30);

// Reward Share tab data - New structures
interface RewardShareEntry {
  account: string; // validator or owner address
  moniker: string | null;
  total_rewards: number; // POKT
  share_percent: number;
  total_relays: number;
  efficiency: number;
  compute_units: number;
  nodes?: number; // if grouped by owner
  status: string | null;
}

interface TopRewardEarner {
  rank: number;
  operator_address: string;
  moniker: string | null;
  total_rewards: number; // POKT
  total_relays: number;
  reward_per_relay: number; // upokt
  efficiency: number;
  compute_units: number;
  applications: number;
  services: number;
  status: string | null;
}

interface RewardEfficiencyEntry {
  operator_address: string;
  moniker: string | null;
  total_rewards: number; // POKT
  reward_per_compute_unit: number; // POKT per compute unit
  reward_per_relay: number; // upokt
  efficiency: number;
  total_relays: number;
  compute_units: number;
}

interface RewardTrendPoint {
  date: string;
  total_rewards: number; // POKT
  reward_per_relay: number; // upokt
  efficiency: number;
  total_relays: number;
  compute_units: number;
}

interface ServiceRewardBreakdown {
  supplier: {
    operator_address: string;
    moniker: string | null;
  };
  services: Array<{
    service_id: string;
    rewards: number; // POKT
    total_relays: number;
    reward_per_relay: number; // upokt
    efficiency: number;
    compute_units: number;
    applications: number;
  }>;
  total_rewards: number;
  total_services: number;
}

// Reward Share Distribution
const rewardShareDistribution = ref<RewardShareEntry[]>([]);
const totalRewards = ref<number>(0);

// Top Reward Earners
const topRewardEarners = ref<TopRewardEarner[]>([]);

// Reward Efficiency Analysis
const rewardEfficiencyAnalysis = ref<RewardEfficiencyEntry[]>([]);

// Reward Trends Over Time
const rewardTrends = ref<RewardTrendPoint[]>([]);

// Reward by Service
const rewardsByService = ref<ServiceRewardBreakdown[]>([]);

const loadingRewardShare = ref(false);
const rewardShareSearchQuery = ref('');
const rewardShareDateRange = ref({ start: '', end: '' });
const showFees = ref(false);

// Comparison data for Summary tab
const networkAverages = ref<NetworkAverages | null>(null);
const topPerformers = ref<TopPerformersThreshold | null>(null);
const comparisonLoading = ref(false);
const growthRates = ref({ dayOverDay: 0, weekOverWeek: 0, monthOverMonth: 0 });

// Rewards data for Summary tab (service-aggregated)
interface ServiceReward {
  service_id: string;
  chain: string;
  total_claims: number;
  total_rewards_upokt: number;
  total_relays: number;
  total_claimed_compute_units: number;
  total_estimated_compute_units: number;
  avg_efficiency_percent: number;
  avg_reward_per_relay: number;
  max_reward_per_submission: number;
  min_reward_per_submission: number;
  supplier_operator_address: string;
  application_address: string;
}
const serviceRewards = ref<ServiceReward[]>([]);
const loadingServiceRewards = ref(false);

const rewardsChartSeries = ref([{ name: 'Total Rewards', data: [] as number[] }]);
const efficiencyChartSeries = ref([{ name: 'Efficiency %', data: [] as number[] }]);
const relaysChartSeries = ref([{ name: 'Total Relays', data: [] as number[] }]);

const rewardsChartOptions = ref({
  chart: { type: 'area', height: 280, toolbar: { show: false }, zoom: { enabled: false } },
  colors: ['#A3E635'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.3, stops: [0, 90, 100] } },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)', row: { colors: ['transparent'], opacity: 0.5 } },
  markers: { size: 0 },
  xaxis: { categories: [] as string[], labels: { style: { colors: 'rgb(116, 109, 105)' } } },
  yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => (v / 1000000).toFixed(1) + 'M' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => (v / 1000000).toFixed(4) + ' POKT' } }
});

const efficiencyChartOptions = ref({
  chart: { type: 'line', height: 280, toolbar: { show: false }, zoom: { enabled: false } },
  colors: ['#5E9AE4'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2},
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)', row: { colors: ['transparent'], opacity: 0.5 } },
  markers: { size: 0 },
  xaxis: { categories: [] as string[], labels: { style: { colors: 'rgb(116, 109, 105)' } } },
  yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => v.toFixed(2) + '%' }, max: 100, min: 0 },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toFixed(2) + '%' } }
});

const relaysChartOptions = ref({
  chart: { type: 'column', height: 280, toolbar: { show: false } },
  colors: ['#09279F'],
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: { categories: [] as string[], labels: { style: { colors: 'rgb(116, 109, 105)' } } },
  yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => (v / 1000).toFixed(0) + 'K' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toLocaleString() + ' relays' } }
});

const topServicesChartSeries = ref([{ name: 'Compute Units', data: [] as number[] }]);
const topServicesChartType = ref<'bar' | 'area' | 'line'>('bar');
const topServicesChartCategories = ref<string[]>([]);

const topServicesChartOptions = computed(() => {
  const chartType = topServicesChartType.value;
  
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
    chart: { type: chartType, height: 360, toolbar: { show: false } },
    colors: ['#A3E635'],
    dataLabels: { enabled: chartType === 'bar', formatter: (v: number) => (v / 1000000000).toFixed(2) + 'B', style: { colors: ['#000'] } },
    plotOptions: chartType === 'bar' ? { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } } : {},
    stroke: strokeConfig,
    fill: fillConfig,
    grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
    markers: chartType === 'bar' ? { size: 0 } : chartType === 'line' ? {
      size: 4,
      strokeWidth: 0,
      hover: { size: 6 }
    } : { size: 2, hover: { size: 5 } },
    xaxis: { categories: topServicesChartCategories.value, labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45, rotateAlways: false } },
    yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => (v / 1000000000).toFixed(2) + 'B' } },
    tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toLocaleString() + ' compute units' } }
  };
});

const rewardShareChartSeries = computed(() => {
  return topServicesByPerformance.value.map(service => service.percentage_of_total);
});

const rewardShareChartOptions = computed(() => ({
  chart: { type: 'donut', height: 350, toolbar: { show: false } },
  labels: topServicesByPerformance.value.map(service => service.service_id),
  colors: ['#A3E635', '#5E9AE4', '#FFB206', '#60BC29', '#09279F', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
  dataLabels: { enabled: true, formatter: (val: number) => val.toFixed(1) + '%' },
  legend: { position: 'right', labels: { colors: 'rgb(116, 109, 105)' } },
  tooltip: { theme: 'dark', y: { formatter: (val: number) => val.toFixed(2) + '%' } },
  plotOptions: { pie: { donut: { size: '70%' } } }
}));

// Reward Share Distribution Chart
const rewardShareDistributionChartSeries = computed(() => {
  return rewardShareDistribution.value.map(entry => entry.share_percent);
});

// COMPUTED PROPERTY - API se already paginated data aa raha hai
const paginatedServiceRewards = computed(() => {
  return serviceRewards.value; // API already returns paginated data
});

const serviceRewardsTotalPages = computed(() => {
  return serviceRewardsTotalPagesFromApi.value; // Use total pages from API
});

// Watch for pagination changes and reload data
watch(serviceRewardsItemsPerPage, () => {
  if (serviceRewardsCurrentPage.value === 1) {
    // Already on page 1, just reload
    loadServiceRewards();
  } else {
    // Reset to page 1 (this will trigger the currentPage watcher)
    serviceRewardsCurrentPage.value = 1;
  }
});

watch(serviceRewardsCurrentPage, () => {
  loadServiceRewards(); // Reload data when page changes
});

const rewardShareDistributionChartOptions = computed(() => {
  const entries = rewardShareDistribution.value;
  const labels = entries.map(e => e.moniker || e.account.substring(0, 12) + '...');
  const colors = ['#A3E635', '#5E9AE4', '#FFB206', '#60BC29', '#09279F', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
  const chartColors = labels.map((_, i) => colors[i % colors.length]);
  
  return {
    chart: { type: 'donut', height: 350, toolbar: { show: false } },
    labels: labels,
    colors: chartColors,
    dataLabels: { enabled: true, formatter: (val: number) => val.toFixed(1) + '%' },
    legend: { position: 'right', labels: { colors: 'rgb(116, 109, 105)' } },
    tooltip: { 
      theme: 'dark',
      y: {
        formatter: (val: number, { seriesIndex }: any) => {
          const entry = entries[seriesIndex];
          if (!entry) return val.toFixed(1) + '%';
          return `${entry.moniker || entry.account}: ${val.toFixed(1)}% (${entry.total_rewards.toFixed(2)} POKT)`;
        }
      }
    },
    plotOptions: { 
      pie: { 
        donut: { 
          size: '70%',
          labels: {
            show: true,
            name: { show: true },
            value: { show: true, formatter: (val: number) => val.toFixed(1) + '%' },
            total: { 
              show: true, 
              label: 'Total Rewards',
              formatter: () => totalRewards.value.toFixed(2) + ' POKT'
            }
          }
        } 
      } 
    }
  };
});

// Reward Trends Chart
const rewardTrendsChartType = ref<'bar' | 'area' | 'line'>('line');
const rewardTrendsMetrics = ref({
  rewards: true,
  rewardPerRelay: true,
  efficiency: true
});

const rewardTrendsChartSeries = computed(() => {
  const trends = rewardTrends.value;
  const series: any[] = [];
  
  if (rewardTrendsMetrics.value.rewards) {
    series.push({
      name: 'Total Rewards (POKT)',
      data: trends.map(t => t.total_rewards),
      yAxisIndex: 0
    });
  }
  
  if (rewardTrendsMetrics.value.rewardPerRelay) {
    series.push({
      name: 'Reward per Relay (POKT)',
      data: trends.map(t => t.reward_per_relay / 1000000),
      yAxisIndex: 0
    });
  }
  
  if (rewardTrendsMetrics.value.efficiency) {
    series.push({
      name: 'Efficiency %',
      data: trends.map(t => t.efficiency),
      yAxisIndex: 1
    });
  }
  
  return series;
});

const rewardTrendsChartOptions = computed(() => {
  const trends = rewardTrends.value;
  const dates = trends.map(t => {
    const date = new Date(t.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const chartType = rewardTrendsChartType.value;

  const strokeConfig = chartType === 'bar' 
    ? { width: 0 }
    : {
        curve: chartType === 'area' ? 'smooth' : 'straight',
        width: 2
      };
  
  const fillConfig: any = chartType === 'bar'
    ? { opacity: 1, type: 'solid' }
    : {
        type: chartType === 'area' ? 'gradient' : 'solid',
        opacity: chartType === 'area' ? 0.3 : 0,
        ...(chartType === 'area' ? {
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.7,
            opacityTo: 0.3,
            stops: [0, 90, 100]
          }
        } : {})
      };

  return {
    chart: { type: chartType, height: 350, toolbar: { show: false } },
    colors: ['#A3E635', '#5E9AE4', '#FFB206'],
    dataLabels: { enabled: false },
    plotOptions: chartType === 'bar' ? { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } } : {},
    stroke: strokeConfig,
    fill: fillConfig,
    grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
    markers: chartType === 'bar' ? { size: 0 } : chartType === 'line' ? {
      size: 4,
      strokeWidth: 0,
      hover: { size: 6 }
    } : { size: 2, hover: { size: 5 } },
    xaxis: { 
      categories: dates,
      labels: { style: { colors: 'rgb(116, 109, 105)' } }
    },
    yaxis: [
      {
        labels: { 
          style: { colors: 'rgb(116, 109, 105)' },
          formatter: (v: number) => v.toFixed(2)
        },
        title: { text: 'Rewards (POKT) / Reward per Relay (POKT)', style: { color: 'rgb(116, 109, 105)' } }
      },
      {
        opposite: true,
        labels: { 
          style: { colors: 'rgb(116, 109, 105)' },
          formatter: (v: number) => v.toFixed(2) + '%'
        },
        title: { text: 'Efficiency %', style: { color: 'rgb(116, 109, 105)' } },
        max: 100,
        min: 0
      }
    ],
    tooltip: { 
      theme: 'dark',
      shared: true,
      intersect: false
    },
    legend: { 
      position: 'top',
      labels: { colors: 'rgb(116, 109, 105)' }
    }
  };
});


async function loadSummaryStats() {
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    if (selectedService.value) params.append('service_id', selectedService.value);
    // Use filters from props if provided, otherwise use internal selectedSupplier
    const supplierFilter = props.filters?.supplier_address || selectedSupplier.value;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    if (props.filters?.supplier_status) params.append('status', props.filters.supplier_status);
    if (selectedApplication.value) params.append('application_address', selectedApplication.value);
    
    // Add date filters from props if available
    const dateStart = props.startDate || startDate.value;
    const dateEnd = props.endDate || endDate.value;
    if (dateStart) params.append('start_date', dateStart);
    if (dateEnd) params.append('end_date', dateEnd);
    
    const data = await fetchApi('/api/v1/claims/summary', params);
      summaryStats.value = data.data;
    
    // Load comparison data if filters are provided
    if (props.filters?.supplier_address || props.filters?.owner_address) {
      loadComparisonData();
    }
    
    // Load service rewards for Summary tab
    if (!props.tabView || props.tabView === 'summary') {
      loadServiceRewards();
    }
  } catch (error: any) {
    console.error('Error loading summary stats:', error);
  }
}

async function loadServiceRewards() {
  loadingServiceRewards.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    
    // Use filters from props if provided
    const supplierFilter = props.filters?.supplier_address || selectedSupplier.value;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    if (props.filters?.supplier_status) params.append('status', props.filters.supplier_status);
    if (selectedApplication.value) params.append('application_address', selectedApplication.value);
    if (selectedService.value) params.append('service_id', selectedService.value);
    
    // ✅ FIXED: Use props dates or default to 30 days
    const dateStart = props.startDate || startDate.value;
    const dateEnd = props.endDate || endDate.value;
    if (dateStart && dateEnd) {
      params.append('start_date', dateStart);
      params.append('end_date', dateEnd);
    } else {
      // ✅ Default to last 30 days (not 6 days)
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 29); // 30 days total
      start.setHours(0, 0, 0, 0);
      params.append('start_date', start.toISOString());
      params.append('end_date', end.toISOString());
    }
    
    params.append('limit', String(serviceRewardsItemsPerPage.value));
    params.append('page', String(serviceRewardsCurrentPage.value));

    const data = await fetchApi('/api/v1/claims/rewards', params);

    // Store meta information from API
    if (data.meta) {
      serviceRewardsTotalCount.value = data.meta.total || 0;
      serviceRewardsTotalPagesFromApi.value = data.meta.totalPages || 0;
    }

    // Normalize the data to ensure numeric values
    serviceRewards.value = (data.data || []).map((item: any) => ({
      ...item,
      total_claims: Number(item.total_claims) || 0,
      total_rewards_upokt: Number(item.total_rewards_upokt) || 0,
      total_relays: Number(item.total_relays) || 0,
      total_claimed_compute_units: Number(item.total_claimed_compute_units) || 0,
      total_estimated_compute_units: Number(item.total_estimated_compute_units) || 0,
      avg_efficiency_percent: Number(item.avg_efficiency_percent) || 0,
      avg_reward_per_relay: Number(item.avg_reward_per_relay) || 0,
      max_reward_per_claim: Number(item.max_reward_per_claim) || 0,
      min_reward_per_claim: Number(item.min_reward_per_claim) || 0,
    }));
  } catch (error: any) {
    console.error('Error loading service rewards:', error);
    serviceRewards.value = [];
  } finally {
    loadingServiceRewards.value = false;
  }
}

async function loadComparisonData() {
  if (!props.filters?.supplier_address && !props.filters?.owner_address) {
    networkAverages.value = null;
    topPerformers.value = null;
    return;
  }

  comparisonLoading.value = true;
  try {
    const [network, top10] = await Promise.all([
      fetchNetworkAverages(apiChainName.value),
      fetchTopPerformers(apiChainName.value),
    ]);
    networkAverages.value = network;
    topPerformers.value = top10;

    // Calculate growth rates from reward trends (daily data from supplier performance)
    // Note: rewardAnalytics is not populated from Claims API, but we can use rewardTrends
    // which is calculated from daily supplier performance data
    if (rewardTrends.value.length > 0) {
      // Convert RewardTrendPoint[] to PerformanceDataPoint[] format for calculateTrends
      const performanceData = rewardTrends.value.map(trend => ({
        bucket: trend.date,
        supplier_operator_address: null,
        owner_address: null,
        moniker: null,
        submissions: 0, // Not available in rewardTrends, set to 0
        total_relays: trend.total_relays,
        total_claimed_compute_units: trend.compute_units,
        total_estimated_compute_units: trend.compute_units,
        avg_efficiency_percent: trend.efficiency,
        avg_reward_per_relay: trend.reward_per_relay,
        unique_applications: 0,
        unique_services: 0
      }));
      const trends = calculateTrends(performanceData, false); // false = daily, not hourly
      growthRates.value = calculateGrowthRates(trends);
    }
  } catch (error) {
    console.error('Error loading comparison data:', error);
  } finally {
    comparisonLoading.value = false;
  }
}

// Calculate comparison metrics
const comparisonMetrics = computed(() => {
  if (!summaryStats.value || (!networkAverages.value && !topPerformers.value)) {
    return null;
  }

  const supplierRewards = parseFloat(summaryStats.value.total_rewards_upokt) / parseFloat(summaryStats.value.total_claims || '1');
  const supplierRelays = parseFloat(summaryStats.value.total_relays) / parseFloat(summaryStats.value.total_claims || '1');
  const supplierEfficiency = parseFloat(summaryStats.value.avg_efficiency_percent);

  let networkRewards = 0;
  let networkRelays = 0;
  let networkEfficiency = 0;
  let top10Rewards = 0;
  let top10Relays = 0;
  let top10Efficiency = 0;

  if (networkAverages.value) {
    networkRewards = networkAverages.value.avg_rewards;
    networkRelays = networkAverages.value.avg_relays;
    networkEfficiency = networkAverages.value.avg_efficiency;
  }

  if (topPerformers.value && topPerformers.value.top10Percent.length > 0) {
    top10Rewards = topPerformers.value.rewards_threshold;
    top10Relays = topPerformers.value.relays_threshold;
    top10Efficiency = topPerformers.value.top10Percent.reduce((sum, p) => sum + p.avg_efficiency_percent, 0) / topPerformers.value.top10Percent.length;
  }

  const networkRewardsDiff = networkRewards > 0 ? ((supplierRewards - networkRewards) / networkRewards) * 100 : 0;
  const networkRelaysDiff = networkRelays > 0 ? ((supplierRelays - networkRelays) / networkRelays) * 100 : 0;
  const networkEfficiencyDiff = supplierEfficiency - networkEfficiency;

  const top10RewardsDiff = top10Rewards > 0 ? ((supplierRelays - top10Rewards) / top10Rewards) * 100 : 0;
  const top10RelaysDiff = top10Relays > 0 ? ((supplierRelays - top10Relays) / top10Relays) * 100 : 0;
  const top10EfficiencyDiff = supplierEfficiency - top10Efficiency;

  const isTop10 = top10Relays > 0 && supplierRelays >= top10Relays * 0.9;
  const percentile = isTop10 ? 'Top 10%' : top10Relays > 0 ? `${Math.max(10, Math.min(90, 90 - (top10RelaysDiff / top10Relays) * 100)).toFixed(0)}%` : 'N/A';

  return {
    networkRewardsDiff,
    networkRelaysDiff,
    networkEfficiencyDiff,
    top10RewardsDiff,
    top10RelaysDiff,
    top10EfficiencyDiff,
    percentile,
    isTop10,
  };
});

function updateCharts() {
  // Note: Claims API rewards endpoint provides service-aggregated data, not hourly breakdowns
  // rewardAnalytics is not populated from Claims API, so charts will be empty
  if (rewardAnalytics.value.length === 0) {
    rewardsChartSeries.value = [{ name: 'Total Rewards (POKT)', data: [] }];
    efficiencyChartSeries.value = [{ name: 'Efficiency %', data: [] }];
    relaysChartSeries.value = [{ name: 'Total Relays', data: [] }];
    rewardsChartOptions.value = { ...rewardsChartOptions.value, xaxis: { ...rewardsChartOptions.value.xaxis, categories: [] } };
    return;
  }
  const sorted = [...rewardAnalytics.value].sort((a, b) => {
    // Handle both hour_bucket (old format) and date-based sorting
    const dateA = (a as any).hour_bucket ? new Date((a as any).hour_bucket).getTime() : new Date().getTime();
    const dateB = (b as any).hour_bucket ? new Date((b as any).hour_bucket).getTime() : new Date().getTime();
    return dateA - dateB;
  });
  const labels = sorted.map(d => {
    const date = (d as any).hour_bucket ? new Date((d as any).hour_bucket) : new Date();
    return date.toLocaleString();
  });
  rewardsChartSeries.value = [{ name: 'Total Rewards (POKT)', data: sorted.map(d => d.total_rewards_upokt / 1000000) }];
  efficiencyChartSeries.value = [{ name: 'Efficiency %', data: sorted.map(d => d.avg_efficiency_percent) }];
  relaysChartSeries.value = [{ name: 'Total Relays', data: sorted.map(d => d.total_relays) }];
  rewardsChartOptions.value = { ...rewardsChartOptions.value, xaxis: { ...rewardsChartOptions.value.xaxis, categories: labels } };
  efficiencyChartOptions.value = { ...efficiencyChartOptions.value, xaxis: { ...efficiencyChartOptions.value.xaxis, categories: labels } };
  relaysChartOptions.value = { ...relaysChartOptions.value, xaxis: { ...relaysChartOptions.value.xaxis, categories: labels } };
}

async function loadClaims() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    if (selectedService.value) params.append('service_id', selectedService.value);
    // Use filters from props if provided, otherwise use internal selectedSupplier
    const supplierFilter = props.filters?.supplier_address || selectedSupplier.value;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    if (props.filters?.supplier_status) params.append('status', props.filters.supplier_status);
    if (selectedApplication.value) params.append('application_address', selectedApplication.value);
    // Use date filters from props if available, otherwise use internal dates
    const dateStart = props.startDate || startDate.value;
    const dateEnd = props.endDate || endDate.value;
    if (dateStart) params.append('start_date', dateStart);
    if (dateEnd) params.append('end_date', dateEnd);
    params.append('page', currentPage.value.toString());
    params.append('limit', itemsPerPage.value.toString());
    
    const data = await fetchApi('/api/v1/claims', params);
      // Normalize the data to ensure numeric values are numbers
      claims.value = (data.data || []).map((item: any) => ({
        ...item,
        id: Number(item.id) || 0,
        claim_proof_status_int: Number(item.claim_proof_status_int) || 0,
        claimed_upokt_amount: Number(item.claimed_upokt_amount) || 0,
        num_claimed_compute_units: Number(item.num_claimed_compute_units) || 0,
        num_estimated_compute_units: Number(item.num_estimated_compute_units) || 0,
        num_relays: Number(item.num_relays) || 0,
        compute_unit_efficiency: Number(item.compute_unit_efficiency) || 0,
        reward_per_relay: Number(item.reward_per_relay) || 0,
      }));
      totalPages.value = data.meta?.totalPages || 0;
  } catch (error: any) {
    console.error('Error loading claims:', error);
    claims.value = [];
    totalPages.value = 0;
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  currentPage.value = 1;
  currentPages.value = 1;
  loadSummaryStats();
  loadClaims();
}

const rewardPaginatedTopServices = computed(() => {
  const start = (rewardCurrentPage.value - 1) * rewardItemsPerPage.value;
  const end = start + rewardItemsPerPage.value;
  return topServicesByPerformance.value.slice(start, end);
});

function goToFirstReward() { rewardCurrentPage.value = 1; }
function goToLastReward() { rewardCurrentPage.value = rewardTotalPages.value; }
function goToPrevReward() { if (rewardCurrentPage.value > 1) rewardCurrentPage.value--; }
function goToNextReward() { if (rewardCurrentPage.value < rewardTotalPages.value) rewardCurrentPage.value++; }


function nextPage() { if (currentPage.value < totalPages.value) { currentPage.value++; loadClaims(); } }
function prevPage() { if (currentPage.value > 1) { currentPage.value--; loadClaims(); } }
function goToFirst() { currentPage.value = 1; loadClaims(); }
function goToLast() { currentPage.value = totalPages.value; loadClaims(); }

function nPage() { if (currentPages.value < totalPages.value) { currentPages.value++; loadClaims(); } }
function pPage() { if (currentPages.value > 1) { currentPages.value--; loadClaims(); } }
function gTFirst() { currentPages.value = 1; loadClaims(); }
function gTLast() { currentPages.value = totalPages.value; loadClaims(); }

const startItem = computed(() =>
  rewardTotalItems.value === 0 ? 0 : (rewardCurrentPage.value - 1) * rewardItemsPerPage.value + 1
);

const endItem = computed(() =>
  Math.min(rewardCurrentPage.value * rewardItemsPerPage.value, rewardTotalItems.value)
);


async function loadTopServicesByComputeUnits() {
  loadingTopServices.value = true;
  try {
    const params = new URLSearchParams();
    params.append('limit', topServicesLimit.value.toString());
    params.append('days', topServicesDays.value.toString());
    params.append('chain', apiChainName.value);
    // Add filter support
    const supplierFilter = props.filters?.supplier_address;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    
    const data = await fetchApi('/api/v1/services/top-by-compute-units', params);
      topServicesByComputeUnits.value = data.data || [];
      updateTopServicesChart();
  } catch (error: any) {
    console.error('Error loading top services by compute units:', error);
    topServicesByComputeUnits.value = [];
  } finally {
    loadingTopServices.value = false;
  }
}

async function loadTopServicesByPerformance() {
  loadingPerformanceTable.value = true;
  try {
    const params = new URLSearchParams();
    // params.append('limit', itemsPerPages.value.toString());
    params.append('limit', rewardItemsPerPage.value.toString());
    params.append('days', performanceDays.value.toString());
    params.append('chain', apiChainName.value);
    // Add filter support
    const supplierFilter = props.filters?.supplier_address;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    
    const data = await fetchApi('/api/v1/services/top-by-performance', params);
      topServicesByPerformance.value = data.data || [];
      totalComputeUnits.value = data.total_compute_units || 0;
    // Update the chart data based on the new top services
    updateTopServicesChart();
  } catch (error: any) {
    console.error('Error loading top services by performance:', error);
    topServicesByPerformance.value = [];
    totalComputeUnits.value = 0;
  } finally {
    loadingPerformanceTable.value = false;
    rewardCurrentPage.value = 1;
  }
}

async function loadRewardShareData() {
  loadingRewardShare.value = true;
  try {
    // Use date range from props if available, otherwise use rewardShareDateRange
    const dateStart = props.startDate || rewardShareDateRange.value.start;
    const dateEnd = props.endDate || rewardShareDateRange.value.end;
    
    // ✅ FIXED: Default to 30 days if no dates
    if (!dateStart || !dateEnd) {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 29); // 30 days
      start.setHours(0, 0, 0, 0);
      rewardShareDateRange.value.start = start.toISOString();
      rewardShareDateRange.value.end = end.toISOString();
    }

    // Get supplier addresses from filters (may be comma-separated)
    const supplierFilter = props.filters?.supplier_address;
    if (!supplierFilter) {
      // No supplier filter - clear all data
      rewardShareDistribution.value = [];
      topRewardEarners.value = [];
      rewardEfficiencyAnalysis.value = [];
      rewardTrends.value = [];
      rewardsByService.value = [];
      totalRewards.value = 0;
      return;
    }

    // Prepare POST request parameters    
    const paramsTotal = new URLSearchParams();
    paramsTotal.append('chain', apiChainName.value);
    paramsTotal.append('group_by', 'total');
    if (dateStart) paramsTotal.append('start_date', dateStart);
    if (dateEnd) paramsTotal.append('end_date', dateEnd);
    if (supplierFilter) paramsTotal.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) paramsTotal.append('owner_address', props.filters.owner_address);
    if (props.filters?.supplier_status) paramsTotal.append('status', props.filters.supplier_status);
    paramsTotal.append('limit', '1000');

    const paramsDaily = new URLSearchParams();
    paramsDaily.append('chain', apiChainName.value);
    paramsDaily.append('group_by', 'day');
    if (dateStart) paramsDaily.append('start_date', dateStart);
    if (dateEnd) paramsDaily.append('end_date', dateEnd);
    if (supplierFilter) paramsDaily.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) paramsDaily.append('owner_address', props.filters.owner_address);
    if (props.filters?.supplier_status) paramsDaily.append('status', props.filters.supplier_status);
    paramsDaily.append('limit', '1000');
    
    // Fetch both total and daily data in parallel using POST
    const [totalData, dailyData] = await Promise.all([
      fetchApi('/api/v1/suppliers/performance', paramsTotal),
      fetchApi('/api/v1/suppliers/performance', paramsDaily)
    ]);
    
    const totalPerformanceData = totalData.data || [];
    const dailyPerformanceData = dailyData.data || [];
    const supplierMetadata = totalData.supplier || null;

    // Note: For list endpoint, supplier metadata is not included in response
    // Individual supplier metadata is only available in detail endpoint

    // Process total performance data
    const supplierMap = new Map<string, {
      rewards: number;
      claims: number;
      relays: number;
      owner: string | null;
      efficiency: number;
      compute_units: number;
      applications: number;
      services: number;
      reward_per_relay: number;
      supplier: any;
    }>();

    totalPerformanceData.forEach((item: any) => {
      const avgRewardPerRelay = item.avg_reward_per_relay;
      if (avgRewardPerRelay === null || avgRewardPerRelay === undefined) return;
      
      const rewards = (item.total_relays || 0) * avgRewardPerRelay; // in upokt
      const supplier = item.supplier_operator_address;
      const owner = item.owner_address;
      const supplierMetadata = supplierMap.get(supplier);
      
      if (supplier) {
        supplierMap.set(supplier, {
          rewards,
          claims: item.total_claims || 0,
          relays: item.total_relays || 0,
          owner: owner || null,
          efficiency: item.avg_efficiency_percent || 0,
          compute_units: item.total_claimed_compute_units || 0,
          applications: item.unique_applications || 0,
          services: item.unique_services || 0,
          reward_per_relay: avgRewardPerRelay,
          supplier: supplierMetadata || null
        });
      }
    });

    // Calculate total rewards (in upokt)
    const totalRewardsUpokt = Array.from(supplierMap.values()).reduce((sum, item) => sum + item.rewards, 0);
    totalRewards.value = totalRewardsUpokt / 1000000; // Convert to POKT

    // 1. Reward Share Distribution
    const rewardShareEntries: RewardShareEntry[] = [];
    if (props.filters?.owner_address) {
      // Show individual suppliers for this owner
      supplierMap.forEach((data, supplier) => {
        if (data.owner === props.filters?.owner_address) {
          rewardShareEntries.push({
            account: supplier,
            moniker: data.supplier?.moniker || null,
            total_rewards: data.rewards / 1000000,
            share_percent: totalRewardsUpokt > 0 ? (data.rewards / totalRewardsUpokt) * 100 : 0,
            total_relays: data.relays,
            efficiency: data.efficiency,
            compute_units: data.compute_units,
            nodes: 1,
            status: data.supplier?.status || null
          });
        }
      });
    } else {
      // Group by owner address
      const ownerMap = new Map<string, {
        rewards: number;
        suppliers: Set<string>;
        relays: number;
        efficiency: number;
        compute_units: number;
      }>();
      
      supplierMap.forEach((data, supplier) => {
        const owner = data.owner || supplier;
        const existing = ownerMap.get(owner) || {
          rewards: 0,
          suppliers: new Set(),
          relays: 0,
          efficiency: 0,
          compute_units: 0
        };
        existing.rewards += data.rewards;
        existing.suppliers.add(supplier);
        existing.relays += data.relays;
        existing.compute_units += data.compute_units;
        ownerMap.set(owner, existing);
      });

      ownerMap.forEach((data, owner) => {
        // Calculate weighted average efficiency
        const avgEfficiency = supplierMap.size > 0
          ? Array.from(data.suppliers).reduce((sum, s) => sum + (supplierMap.get(s)?.efficiency || 0), 0) / data.suppliers.size
          : 0;

        rewardShareEntries.push({
          account: owner,
          moniker: null, // Supplier metadata not available in list endpoint
          total_rewards: data.rewards / 1000000,
          share_percent: totalRewardsUpokt > 0 ? (data.rewards / totalRewardsUpokt) * 100 : 0,
          total_relays: data.relays,
          efficiency: avgEfficiency,
          compute_units: data.compute_units,
          nodes: data.suppliers.size,
          status: null // Supplier metadata not available in list endpoint
        });
      });
    }
    rewardShareDistribution.value = rewardShareEntries.sort((a, b) => b.total_rewards - a.total_rewards);

    // 2. Top Reward Earners
    const earners: TopRewardEarner[] = [];
    supplierMap.forEach((data, supplier) => {
      earners.push({
        rank: 0, // Will be set after sorting
        operator_address: supplier,
        moniker: data.supplier?.moniker || null,
        total_rewards: data.rewards / 1000000,
        total_relays: data.relays,
        reward_per_relay: data.reward_per_relay,
        efficiency: data.efficiency,
        compute_units: data.compute_units,
        applications: data.applications,
        services: data.services,
        status: data.supplier?.status || null
      });
    });
    earners.sort((a, b) => b.total_rewards - a.total_rewards);
    earners.forEach((earner, index) => {
      earner.rank = index + 1;
    });
    topRewardEarners.value = earners.slice(0, 20);

    // 3. Reward Efficiency Analysis
    const efficiencyEntries: RewardEfficiencyEntry[] = [];
    supplierMap.forEach((data, supplier) => {
      const rewardsPOKT = data.rewards / 1000000;
      const rewardPerComputeUnit = data.compute_units > 0 ? rewardsPOKT / data.compute_units : 0;
      
      efficiencyEntries.push({
        operator_address: supplier,
        moniker: data.supplier?.moniker || null,
        total_rewards: rewardsPOKT,
        reward_per_compute_unit: rewardPerComputeUnit,
        reward_per_relay: data.reward_per_relay,
        efficiency: data.efficiency,
        total_relays: data.relays,
        compute_units: data.compute_units
      });
    });
    rewardEfficiencyAnalysis.value = efficiencyEntries.sort((a, b) => b.reward_per_compute_unit - a.reward_per_compute_unit);

    // 4. Reward Trends Over Time
    const dailyMap = new Map<string, {
      rewards: number;
      relays: number;
      compute_units: number;
      reward_per_relay_sum: number;
      reward_per_relay_count: number;
      efficiency_sum: number;
      efficiency_count: number;
    }>();

    dailyPerformanceData.forEach((item: any) => {
      const avgRewardPerRelay = item.avg_reward_per_relay;
      if (avgRewardPerRelay === null || avgRewardPerRelay === undefined) return;
      
      const rewards = (item.total_relays || 0) * avgRewardPerRelay;
      if (item.bucket) {
        const date = new Date(item.bucket).toISOString().split('T')[0];
        const existing = dailyMap.get(date) || {
          rewards: 0,
          relays: 0,
          compute_units: 0,
          reward_per_relay_sum: 0,
          reward_per_relay_count: 0,
          efficiency_sum: 0,
          efficiency_count: 0
        };
        existing.rewards += rewards;
        existing.relays += (item.total_relays || 0);
        existing.compute_units += (item.total_claimed_compute_units || 0);
        existing.reward_per_relay_sum += avgRewardPerRelay;
        existing.reward_per_relay_count += 1;
        existing.efficiency_sum += (item.avg_efficiency_percent || 0);
        existing.efficiency_count += 1;
        dailyMap.set(date, existing);
      }
    });

    const trends: RewardTrendPoint[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        total_rewards: data.rewards / 1000000,
        reward_per_relay: data.reward_per_relay_count > 0 ? data.reward_per_relay_sum / data.reward_per_relay_count : 0,
        efficiency: data.efficiency_count > 0 ? data.efficiency_sum / data.efficiency_count : 0,
        total_relays: data.relays,
        compute_units: data.compute_units
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    rewardTrends.value = trends;

    // 5. Reward by Service
    // Note: The validators/performance endpoint doesn't provide service-level breakdown
    // We'll show aggregate per validator with service count
    const serviceBreakdowns: ServiceRewardBreakdown[] = [];
    supplierMap.forEach((data, supplier) => {
      serviceBreakdowns.push({
        supplier: {
          operator_address: supplier,
          moniker: data.supplier?.moniker || null
        },
        services: [], // Service-level data not available from this endpoint
        total_rewards: data.rewards / 1000000,
        total_services: data.services
      });
    });
    rewardsByService.value = serviceBreakdowns.sort((a, b) => b.total_rewards - a.total_rewards);

  } catch (error: any) {
    console.error('Error loading reward share data:', error);
    rewardShareDistribution.value = [];
    topRewardEarners.value = [];
    rewardEfficiencyAnalysis.value = [];
    rewardTrends.value = [];
    rewardsByService.value = [];
    totalRewards.value = 0;
  } finally {
    loadingRewardShare.value = false;
  }
}

function updateTopServicesChart() {
  const sorted = [...topServicesByPerformance.value].sort((a, b) => 
    parseInt(b.total_claimed_compute_units) - parseInt(a.total_claimed_compute_units)
  );
  const labels = sorted.map(s => s.service_id);
  const data = sorted.map(s => parseInt(s.total_claimed_compute_units));
  
  topServicesChartSeries.value = [{ name: 'Compute Units', data }];
  topServicesChartCategories.value = labels;
}

// Watch for changes in itemPerPage and performanceDays to reload data
watch([itemPerPage, performanceDays], () => {
  loadTopServicesByPerformance();
});

const safeNumber = (val: any, fallback = 0) => {
  const num = Number(val)
  return isNaN(num) ? fallback : num
}

const safeInt = (val: any, fallback = 0) => {
  const num = parseInt(val)
  return isNaN(num) ? fallback : num
}

const safeFloat = (val: any, fallback = 0) => {
  const num = parseFloat(val)
  return isNaN(num) ? fallback : num
}

const safePercent = (val: any, decimals = 2) => {
  const num = parseFloat(val)
  return isNaN(num) ? `0.${'0'.repeat(decimals)}%` : `${num.toFixed(decimals)}%`
}

const formatCompactAmount = (upokt: string | number) => {
  const value = Number(upokt)

  if (!value || isNaN(value)) return '0'

  // upokt → POKT
  const pokt = value / 1_000_000

  if (pokt >= 1_000_000_000) {
    return `${(pokt / 1_000_000_000).toFixed(2)}B`
  }

  if (pokt >= 1_000_000) {
    return `${(pokt / 1_000_000).toFixed(2)}M`
  }

  if (pokt >= 1_000) {
    return `${(pokt / 1_000).toFixed(2)}K`
  }

  return pokt.toFixed(2)
}

function formatNumber(num: number | string): string { return new Intl.NumberFormat().format(typeof num === 'string' ? parseInt(num) : num); }
function formatComputeUnits(units: number | string): string {
  const value = typeof units === 'string' ? parseInt(units) : units;
  if (value >= 1000000000) {
    return (value / 1000000000).toFixed(2) + 'B';
  } else if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + 'M';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(2) + 'K';
  }
  return value.toString();
}

// Watch for filter changes and reload data
watch(() => props.filters, () => {
  loadSummaryStats();
  loadClaims();
  loadTopServicesByComputeUnits();
  loadTopServicesByPerformance();
  if (props.tabView === 'reward-share') {
    loadRewardShareData();
  }
  // Load comparison data when filters change
  if (props.filters?.supplier_address || props.filters?.owner_address) {
    loadComparisonData();
  }
}, { deep: true });

// Watch for date changes
watch(() => [props.startDate, props.endDate], () => {
  loadSummaryStats();
  loadClaims();
  loadTopServicesByComputeUnits();
  loadTopServicesByPerformance();
  if (!props.tabView || props.tabView === 'summary') {
    loadServiceRewards();
  }
  if (props.tabView === 'reward-share') {
    loadRewardShareData();
  }
});

watch(() => props.tabView, (newTab) => {
  if (newTab === 'reward-share') {
    loadRewardShareData();
  }
});

onMounted(() => {
  loadSummaryStats();
  loadClaims();
  loadTopServicesByComputeUnits();
  loadTopServicesByPerformance();
  if (props.tabView === 'reward-share') {
    loadRewardShareData();
  }
});

const perfCurrentPage = ref(1);
watch(itemsPerPages, () => {
  perfCurrentPage.value = 1;
  // reload remote data (already done by existing @change), local page reset only  
});
const perfTotalPages = computed(() => {
  const total = topServicesByPerformance.value?.length || 0;
  return total === 0 ? 0 : Math.ceil(total / itemsPerPages.value);
});
const paginatedTopServices = computed(() => {
  const start = (perfCurrentPage.value - 1) * itemsPerPages.value;
  return topServicesByPerformance.value.slice(start, start + itemsPerPages.value);
});

function perfNext() { if (perfCurrentPage.value < perfTotalPages.value) perfCurrentPage.value++; }
function perfPrev() { if (perfCurrentPage.value > 1) perfCurrentPage.value--; }
function perfGoFirst() { if (perfCurrentPage.value !== 1) perfCurrentPage.value = 1; }
function perfGoLast() { if (perfCurrentPage.value !== perfTotalPages.value && perfTotalPages.value > 0) perfCurrentPage.value = perfTotalPages.value; }
</script>

<template>
  <div>

    <!-- No Data Message - Only show when filters are expected but not provided (for supplier/validator dashboards) -->
    <div v-if="(!props.tabView || props.tabView === 'summary') && props.filters !== undefined && !props.filters?.supplier_address && !props.filters?.owner_address" class="mb-4">
      <div class="alert alert-info flex p-3 mb-4 gap-2 rounded-xl bg-[#ffffff] hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <Icon icon="mdi:information-outline" class="text-xl" />
        <div>
          <h3 class="font-bold">No Filters Selected</h3>
          <div class="text-sm">Please select a validator or service from the filter modal to view performance data.</div>
        </div>
      </div>
    </div>

    <!-- Top Row: Enhanced KPI Boxes -->
    <div v-if="summaryStats && (props.filters?.supplier_address || props.filters?.owner_address)" class="mb-3">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:file-document-multiple" class="text-sm" />
            Claims
          </div>
          <div class="text-xl font-bold">{{ formatNumber(parseInt(summaryStats.total_claims)) }}</div>
        </div>
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-secondary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:account-group" class="text-sm" />
            Suppliers
          </div>
          <div class="text-xl font-bold">{{ formatNumber(parseInt(summaryStats.unique_suppliers)) }}</div>
        </div>
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:application" class="text-sm" />
            Applications
          </div>
          <div class="text-xl font-bold">{{ formatNumber(parseInt(summaryStats.unique_applications)) }}</div>
        </div>
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:server-network" class="text-sm" />
            Services
          </div>
          <div class="text-xl font-bold">{{ formatNumber(parseInt(summaryStats.unique_services)) }}</div>
        </div>
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:network" class="text-sm" />
            Total Relays
          </div>
          <div class="text-xl font-bold">{{ formatNumber(safeInt(summaryStats?.total_relays)) }}</div>
        </div>
        <div 
          class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg"
          :class="parseFloat(summaryStats.avg_efficiency_percent) >= 95 ? 'border-success' : parseFloat(summaryStats.avg_efficiency_percent) >= 80 ? 'border-warning' : 'border-error'">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:gauge" class="text-sm" />
            Avg Efficiency
          </div>
          <div class="text-xl font-bold" :class="parseFloat(summaryStats.avg_efficiency_percent) >= 95 ? 'text-success' : parseFloat(summaryStats.avg_efficiency_percent) >= 80 ? 'text-warning' : 'text-error'">
            {{ safePercent(summaryStats?.avg_efficiency_percent) }}
          </div>
        </div>
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:calculator" class="text-sm" />
            Compute Units
          </div>
          <div class="text-xl font-bold">{{ formatComputeUnits(safeInt(summaryStats?.total_claimed_compute_units)) }}</div>
          <div class="text-xs text-secondary mt-1">
            Est: {{ formatComputeUnits(safeInt(summaryStats?.total_estimated_compute_units)) }}
          </div>
        </div>
        <div class="bg-[#ffffff] rounded-lg p-3 hover:bg-base-200 bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] border-l-4 border-primary shadow-md hover:shadow-lg">
          <div class="text-xs text-secondary mb-1 flex items-center gap-1">
            <Icon icon="mdi:currency-usd" class="text-sm" />
            Total Rewards
          </div>
          <div class="text-xl font-bold text-success">{{ formatCompactAmount(summaryStats.total_rewards_upokt) }} POKT</div>
          <div class="text-xs text-secondary mt-1">
            Avg/Relay: {{ format.formatToken({ denom: 'upokt', amount: String(summaryStats.avg_reward_per_relay || '0') }) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Service Rewards Breakdown - Show in Summary tab -->
    <div v-if="(!props.tabView || props.tabView === 'summary') && (props.filters?.supplier_address || props.filters?.owner_address)" class="bg-[#ffffff] hover:bg-base-200 pt-3 mb-3 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
      <div class="flex items-center justify-between mb-3 ml-4 mr-4">
        <div class="text-base font-semibold text-main flex items-center gap-2">
          <Icon icon="mdi:chart-pie" class="text-lg" />
          Rewards by Service ({{ serviceRewardsTotalCount }})
        </div>
      </div>
      <div class="bg-base-200 rounded-md overflow-auto h-[50vh]">
        <div v-if="loadingServiceRewards" class="flex justify-center items-center py-8">
          <div class="loading loading-spinner loading-md"></div>
          <span class="ml-2 text-sm">Loading rewards data...</span>
        </div>
        <div v-else-if="serviceRewards.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No rewards data available for the selected filters
        </div>
        <table v-else class="table w-full table-compact">
          <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
            <tr class="border-b-[0px] text-sm font-semibold">
              <th>Service</th>
              <th>Operator Address</th>
              <th>Application Address</th>
              <th>Total Rewards</th>
              <th>Total Relays</th>
              <th>Avg Reward/Relay</th>
              <th>Compute Units</th>
              <th>Efficiency</th>
              <th>Claims</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="service in paginatedServiceRewards" :key="service.service_id" class="hover:bg-base-200 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
              <td class="dark:bg-base-200 bg-white">
                <span class="badge badge-primary h-8 text-xs leading-4 px-2">{{ service.service_id }}</span>
              </td>
              <td class="dark:bg-base-200 bg-white">
                <RouterLink
                  :to="`/${chainStore.chainName}/account/${service.supplier_operator_address}`"
                  class="text-sm text-[#09279F] dark:invert font-medium hover:underline"
                >
                  {{ service.supplier_operator_address.substring(0, 12) }}...{{ service.supplier_operator_address.substring(service.supplier_operator_address.length - 7) }}
                </RouterLink>
              </td>
              <td class="dark:bg-base-200 bg-white">
                <RouterLink
                  :to="`/${chainStore.chainName}/account/${service.application_address}`"
                  class="text-sm text-[#09279F] dark:invert font-medium hover:underline"
                >
                  {{ service.application_address.substring(0, 12) }}...{{ service.application_address.substring(service.application_address.length - 7) }}
                </RouterLink>
              </td>
              <td class="dark:bg-base-200 bg-white font-semibold text-success">
                {{ format.formatToken({ denom: 'upokt', amount: String(service.total_rewards_upokt) }) }}
              </td>
              <td class="dark:bg-base-200 bg-white">
                {{ formatNumber(service.total_relays) }}
              </td>
              <td class="dark:bg-base-200 bg-white">
                {{ format.formatToken({ denom: 'upokt', amount: String(service.avg_reward_per_relay) }) }}
              </td>
              <td class="dark:bg-base-200 bg-white">
                <div class="flex flex-col">
                  <span class="font-medium">{{ formatComputeUnits(service.total_claimed_compute_units) }}</span>
                  <span class="text-xs text-secondary">Est: {{ formatComputeUnits(service.total_estimated_compute_units) }}</span>
                </div>
              </td>
              <td class="dark:bg-base-200 bg-white">
                <span :class="Number(service.avg_efficiency_percent) >= 95 ? 'text-success' : Number(service.avg_efficiency_percent) >= 80 ? 'text-warning' : 'text-error'" class="font-medium">
                  {{ Number(service.avg_efficiency_percent).toFixed(2) }}%
                </span>
              </td>
              <td class="dark:bg-base-200 bg-white">
                {{ formatNumber(service.total_claims) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex justify-between items-center gap-4 my-6 px-6">
        <div class="flex items-center gap-2">
          <span class="text-xs text-secondary">Show:</span>
          <select v-model="serviceRewardsItemsPerPage" class="select select-bordered select-xs w-20">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">
            Showing {{ ((serviceRewardsCurrentPage - 1) * serviceRewardsItemsPerPage) + 1 }} to {{ Math.min(serviceRewardsCurrentPage * serviceRewardsItemsPerPage, serviceRewardsTotalCount) }} of {{ serviceRewardsTotalCount }} rewards
          </span>

          <div class="flex items-center gap-1">
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="serviceRewardsCurrentPage = 1"
              :disabled="serviceRewardsCurrentPage === 1 || serviceRewardsTotalPages === 0"
            >
              First
            </button>
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="serviceRewardsCurrentPage--"
              :disabled="serviceRewardsCurrentPage === 1 || serviceRewardsTotalPages === 0"
            >
              &lt;
            </button>

            <span class="text-xs px-2">
              Page {{ serviceRewardsCurrentPage }} of {{ serviceRewardsTotalPages }}
            </span>

            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="serviceRewardsCurrentPage++"
              :disabled="serviceRewardsCurrentPage === serviceRewardsTotalPages || serviceRewardsTotalPages === 0"
            >
              &gt;
            </button>
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="serviceRewardsCurrentPage = serviceRewardsTotalPages"
              :disabled="serviceRewardsCurrentPage === serviceRewardsTotalPages || serviceRewardsTotalPages === 0"
            >
              Last
            </button>
          </div>
        </div>  
      </div>  

    </div>

    <!-- Middle Section: Rewards Distribution Table (Large) - Show in Summary and Reward Share tabs -->
    <div v-if="(!props.tabView || props.tabView === 'summary' || props.tabView === 'reward-share') && (props.filters?.supplier_address || props.filters?.owner_address)" class="bg-[#ffffff] hover:bg-base-200 pt-3 mb-3 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
      <div class="flex items-center justify-between mb-3 ml-4 mr-4">
        <div class="text-base font-semibold text-main">Rewards Distribution ({{ topServicesByPerformance.length }})</div>
        <div class="flex justify-end gap-4">
          <!-- LIMIT DROPDOWN -->
          <!-- <div class="flex items-center justify-end gap-2">
            <span class="text-xs text-secondary"> Limit:</span>
            <select v-model="itemsPerPages" @change="loadTopServicesByPerformance()"  class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="30">30</option>
              <option :value="50">50</option>
            </select>
          </div> -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-secondary">Days:</span>
            <select v-model="performanceDays" @change="loadTopServicesByPerformance()" class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option :value="7">7</option>
              <option :value="15">15</option>
              <option :value="30">30</option>
            </select>
          </div>
        </div>
      </div>
      <div class="bg-base-200 rounded-md overflow-auto h-[40vh]">
        <div v-if="loadingPerformanceTable" class="flex justify-center items-center py-4">
          <div class="loading loading-spinner loading-sm"></div>
          <span class="ml-2 text-xs">Loading...</span>
        </div>
        <div v-else-if="topServicesByPerformance.length === 0" class="text-center py-4 text-gray-500 text-xs">
          No data found
        </div>
        <table v-else class="table w-full table-compact">
          <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
            <tr class="border-b-[0px] text-sm font-semibold">
              <th>Rank</th>
              <th>Service</th>
              <th>Compute Units</th>
              <th>Market Share</th>
              <th>Claims</th>
              <th>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="service in rewardPaginatedTopServices" :key="service.service_id" class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
              <td class="dark:bg-base-200 bg-white font-bold">
                <span class="badge badge-sm" :class="service.rank === 1 ? 'badge-primary' : service.rank === 2 ? 'badge-secondary' : service.rank === 3 ? 'badge-accent' : 'badge-ghost'">
                  #{{ service.rank }}
                </span>
              </td>
              <td class="dark:bg-base-200 bg-white">
                <span class="badge badge-primary badge-xs">{{ service.service_id }}</span>
              </td>
              <td class="dark:bg-base-200 bg-white">{{ formatNumber(service.total_claimed_compute_units) }}</td>
              <td class="dark:bg-base-200 bg-white">
                <div class="flex items-center gap-1">
                  <div class="flex-1 bg-base-300 rounded-full h-2 overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all duration-500"
                      :class="service.rank === 1 ? 'bg-primary' : service.rank === 2 ? 'bg-secondary' : service.rank === 3 ? 'bg-accent' : 'bg-info'"
                      :style="{ width: `${service.percentage_of_total}%` }"
                    ></div>
                  </div>
                  <span class="text-xs font-semibold min-w-[40px]">{{ service.percentage_of_total.toFixed(2) }}%</span>
                </div>
              </td>
              <td class="dark:bg-base-200 bg-white">{{ formatNumber(service.submission_count) }}</td>
              <td class="dark:bg-base-200 bg-white">
                <span :class="Number(service.avg_efficiency_percent) >= 95 ? 'text-success' : Number(service.avg_efficiency_percent) >= 80 ? 'text-warning' : 'text-error'">
                  {{ Number(service.avg_efficiency_percent).toFixed(2) }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex justify-between items-center gap-4 my-6 px-6">
         <div class="flex items-center justify-end gap-2">
            <span class="text-xs text-secondary"> Limit:</span>
            <select v-model="itemsPerPages" @change="loadTopServicesByPerformance()"  class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="30">30</option>
              <option :value="50">50</option>
            </select>
          </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">
            Showing {{ ((rewardCurrentPage - 1) * rewardItemsPerPage) + 1 }} to {{ Math.min(rewardCurrentPage * rewardItemsPerPage, rewardTotalItems) }} of {{ rewardTotalPages }} rewards
          </span>

          <div class="flex items-center gap-1">
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="rewardCurrentPage = 1"
              :disabled="rewardCurrentPage === 1 || rewardTotalPages === 0"
            >
              First
            </button>
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="rewardCurrentPage--"
              :disabled="rewardCurrentPage === 1 || rewardTotalPages === 0"
            >
              &lt;
            </button>

            <span class="text-xs px-2">
              Page {{ rewardCurrentPage }} of {{ rewardTotalPages }}
            </span>

            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="rewardCurrentPage++"
              :disabled="rewardCurrentPage === rewardTotalPages || rewardTotalPages === 0"
            >
              &gt;
            </button>
            <button
              class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
              @click="rewardCurrentPage = rewardTotalPages"
              :disabled="rewardCurrentPage === rewardTotalPages || rewardTotalPages === 0"
            >
              Last
            </button>
          </div>
        </div>  
      </div> 
    </div>
    

    <!-- Bottom Section: 2 Columns (Merged Servicer/Producer/Performance + Services Chart) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3 items-stretch" v-if="!props.tabView || props.tabView === 'summary'">

      <!-- Claims Table (Compact) - Show in Summary tab only -->
      <div v-if="(!props.tabView || props.tabView === 'summary') && (props.filters?.supplier_address || props.filters?.owner_address)" class="bg-[#ffffff] hover:bg-base-200 pt-2 mb-3 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
        <div class="flex items-center justify-between mb-2 ml-3 mr-3">
          <div class="text-sm font-semibold text-main">Claims</div>
          <div class="flex items-center gap-1">
            <span class="text-xs text-secondary">Show:</span>
            <select v-model="itemsPerPage" @change="loadClaims()" class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>
        <div class="bg-base-200 rounded-md overflow-auto h-[35vh]">
          <table class="table w-full table-compact">
            <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
              <tr class="border-b-[0px] text-sm font-semibold">
                <th>Tx Hash</th>
                <th>Service</th>
                <th>Supplier</th>
                <th>Relays</th>
                <th>Rewards</th>
                <th>Efficiency</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading" class="text-center">
                <td colspan="7" class="py-8">
                  <div class="flex justify-center items-center">
                    <div class="loading loading-spinner loading-md"></div>
                    <span class="ml-2">Loading transactions...</span>
                  </div>
                </td>
              </tr>
              <tr v-else-if="claims.length === 0" class="text-center">
                <td colspan="7" class="py-8">
                  <div class="text-gray-500">No claims found</div>
                </td>
              </tr>
              <tr v-for="claim in claims" :key="claim.id" class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
                <td class="truncate dark:bg-base-200 bg-white dark:text-warning text-[#153cd8]" style="max-width:120px">
                  <span class="hover:underline text-xs">{{ claim.session_id.substring(0, 12) }}...</span>
                </td>
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-primary h-8 text-xs leading-4 px-2">{{ claim.service_id }}</span>
                </td>
                <td class="truncate dark:bg-base-200 bg-white text-xs" style="max-width:120px">{{ claim.supplier_operator_address.substring(0, 12) }}...</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ formatNumber(claim.num_relays) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ format.formatToken({ denom: 'upokt', amount: String(claim.claimed_upokt_amount) }) }}</td>
                <td class="dark:bg-base-200 bg-white">
                  <span :class="(claim.compute_unit_efficiency || 0) >= 95 ? 'text-success' : (claim.compute_unit_efficiency || 0) >= 80 ? 'text-warning' : 'text-error'" class="text-xs">
                    {{ (Number(claim.compute_unit_efficiency) || 0).toFixed(2) }}%
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ claim.timestamp }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex justify-between items-center gap-4 my-6 px-2">
          <span class="text-sm text-gray-600">
            Showing {{ ((currentPage - 1) * itemsPerPage) + 1 }} to {{ Math.min(currentPage * itemsPerPage, claims.length) }} of {{ claims.length }} claims
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

      <!-- Right Column: Services Chart -->
      <div v-if="props.filters?.supplier_address || props.filters?.owner_address" class="bg-[#ffffff] hover:bg-base-200 p-3 mb-3 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold mb-2">Services</div>
          <div class="flex justify-end gap-4">
            <!-- LIMIT DROPDOWN -->
            <div class="flex items-center justify-end gap-2">
              <span class="text-xs text-secondary"> Limit:</span>
              <select v-model="itemsPerPages" @change="loadTopServicesByPerformance()"  class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="30">30</option>
                <option :value="50">50</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-secondary">Days:</span>
              <select v-model="performanceDays" @change="loadTopServicesByPerformance()" class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
                <option :value="7">7</option>
                <option :value="15">15</option>
                <option :value="30">30</option>
              </select>
            </div>
          </div>
        </div>
        
        <div class="dark:bg-base-200 bg-base-100 p-2 rounded-md relative max-h-9/10">
          <div v-if="loadingTopServices" class="flex justify-center items-center h-64">
            <div class="loading loading-spinner loading-sm"></div>
          </div>
          <div v-else-if="topServicesByComputeUnits.length === 0" class="flex justify-center items-center h-64 text-gray-500 text-xs">
            No data
          </div>
          <div v-else class="h-[35vh]">
            <ApexCharts 
              :type="topServicesChartType" 
              height="360" 
              :options="topServicesChartOptions" 
              :series="topServicesChartSeries"
              :key="`topServices-${topServicesChartType}`"
            />
          </div>
          <!-- Chart Type Selector - Bottom Right -->
          <div v-if="!loadingTopServices && topServicesByComputeUnits.length > 0" class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button
              @click="topServicesChartType = 'bar'"
              :class="[
                'tab',
                topServicesChartType === 'bar' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Bar Chart">
              <Icon icon="mdi:chart-bar" class="text-sm" />
            </button>
            <button
              @click="topServicesChartType = 'area'"
              :class="[
                'tab',
                topServicesChartType === 'area' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Area Chart">
              <Icon icon="mdi:chart-areaspline" class="text-sm" />
            </button>
            <button
              @click="topServicesChartType = 'line'"
              :class="[
                'tab',
                topServicesChartType === 'line' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Line Chart">
              <Icon icon="mdi:chart-line" class="text-sm" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Performance Tab: Show Performance Table -->
    <div v-if="props.tabView === 'performance'" class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 pt-3 rounded-lg border-[3px] border-solid border-base-200 dark:border-base-100 mb-3">
      <div class="flex items-center justify-between mb-3 ml-4 mr-4">
        <div class="text-base font-semibold text-main">Top Services Performance</div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-secondary">Days:</span>
          <select v-model="performanceDays" @change="loadTopServicesByPerformance()" class="select select-bordered select-xs w-full text-xs">
            <option :value="7">7</option>
            <option :value="15">15</option>
            <option :value="30">30</option>
          </select>
        </div>
      </div>
      <div class="dark:bg-base-200 bg-base-100 p-2 rounded-md">
        <div v-if="loadingPerformanceTable" class="flex justify-center items-center py-4">
          <div class="loading loading-spinner loading-sm"></div>
          <span class="ml-2 text-xs">Loading...</span>
        </div>
        <div v-else-if="topServicesByPerformance.length === 0" class="text-center py-4 text-gray-500 text-xs">
          No data found
        </div>
        <div v-else class="bg-base-200 rounded-md overflow-auto h-[600px]">
          <table class="table w-full table-compact">
            <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
              <tr class="border-b-[0px] text-sm font-semibold">
                <th>Rank</th>
                <th>Service</th>
                <th>Compute Units</th>
                <th>Market Share</th>
                <th>Claims</th>
                <th>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="service in topServicesByPerformance" :key="service.service_id" class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
                <td class="dark:bg-base-200 bg-white font-bold">
                  <span class="badge badge-sm" :class="service.rank === 1 ? 'badge-primary' : service.rank === 2 ? 'badge-secondary' : service.rank === 3 ? 'badge-accent' : 'badge-ghost'">
                    #{{ service.rank }}
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-primary badge-xs">{{ service.service_id }}</span>
                </td>
                <td class="dark:bg-base-200 bg-white">{{ formatNumber(service.total_claimed_compute_units) }}</td>
                <td class="dark:bg-base-200 bg-white">
                  <div class="flex items-center gap-1">
                    <div class="flex-1 bg-base-300 rounded-full h-2 overflow-hidden">
                      <div 
                        class="h-full rounded-full transition-all duration-500"
                        :class="service.rank === 1 ? 'bg-primary' : service.rank === 2 ? 'bg-secondary' : service.rank === 3 ? 'bg-accent' : 'bg-info'"
                        :style="{ width: `${service.percentage_of_total}%` }"
                      ></div>
                    </div>
                    <span class="text-xs font-semibold min-w-[40px]">{{ service.percentage_of_total.toFixed(2) }}%</span>
                  </div>
                </td>
                <td class="dark:bg-base-200 bg-white">{{ formatNumber(service.submission_count) }}</td>
                <td class="dark:bg-base-200 bg-white">
                  <span :class="Number(service.avg_efficiency_percent) >= 95 ? 'text-success' : Number(service.avg_efficiency_percent) >= 80 ? 'text-warning' : 'text-error'">
                    {{ Number(service.avg_efficiency_percent).toFixed(2) }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Chain Tab: Show Services by Service ID -->
    <div v-if="props.tabView === 'chain'" class="bg-[#ffffff] mb-3 pt-3 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
      <div class="flex items-center justify-between mb-3 ml-4 mr-4">
        <div class="text-base font-semibold text-main">Services</div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-secondary">Limit:</span>
          <select v-model="topServicesLimit" @change="loadTopServicesByComputeUnits()" class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03);]">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
          <span class="text-xs text-secondary">Days:</span>
          <select v-model="topServicesDays" @change="loadTopServicesByComputeUnits()" class="select select-bordered select-xs w-full text-xs dark:bg-[rgba(255,255,255,.03);]">
            <option :value="7">7</option>
            <option :value="15">15</option>
            <option :value="30">30</option>
          </select>
        </div>
      </div>
      <div class="dark:bg-base-200 bg-base-100 p-2 rounded-md">
        <div v-if="loadingTopServices" class="flex justify-center items-center py-4">
          <div class="loading loading-spinner loading-sm"></div>
          <span class="ml-2 text-xs">Loading...</span>
        </div>
        <div v-else-if="topServicesByComputeUnits.length === 0" class="text-center py-4 text-gray-500 text-xs">
          No data found
        </div>
        <div v-else class="bg-base-200 rounded-md overflow-auto h-[40vh]">
          <table class="table w-full table-compact">
            <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
              <tr class="border-b-[0px] text-sm font-semibold">
                <th>Service ID</th>
                <th>Compute Units</th>
                <th>Claims</th>
                <th>Efficiency</th>
                <th>Avg Reward/Relay</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="service in topServicesByComputeUnits" :key="service.service_id" class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-primary badge-xs">{{ service.service_id }}</span>
                </td>
                <td class="dark:bg-base-200 bg-white">{{ formatComputeUnits(parseInt(service.total_claimed_compute_units)) }}</td>
                <td class="dark:bg-base-200 bg-white">{{ formatNumber(parseInt(service.submission_count)) }}</td>
                <td class="dark:bg-base-200 bg-white">
                  <span :class="parseFloat(service.avg_efficiency_percent) >= 95 ? 'text-success' : parseFloat(service.avg_efficiency_percent) >= 80 ? 'text-warning' : 'text-error'">
                    {{ parseFloat(service.avg_efficiency_percent).toFixed(2) }}%
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Reward Share Tab: Complete Layout -->
    <div v-if="props.tabView === 'reward-share'" class="space-y-3 mb-4">
      <!-- Top Row: Reward Share Distribution (Left) + Top Reward Earners (Right) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- Section 1: Reward Share Distribution -->
        <div class="bg-[#ffffff] mb-3 p-3 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">Reward Share Distribution</div>
            <div class="text-xs text-base-content/60">
              Total: {{ totalRewards.toFixed(2) }} POKT
            </div>
          </div>
          <div class="flex items-center justify-center h-80">
            <div v-if="loadingRewardShare" class="flex flex-col items-center">
              <div class="loading loading-spinner loading-md"></div>
              <span class="mt-2 text-xs">Loading...</span>
            </div>
            <div v-else-if="rewardShareDistribution.length === 0" class="text-gray-500 text-xs">
              No data available. Please select a validator or service from the filter modal.
            </div>
            <div v-else class="w-full">
              <ApexCharts 
                type="donut" 
                height="300" 
                :options="rewardShareDistributionChartOptions" 
                :series="rewardShareDistributionChartSeries" 
              />
            </div>
          </div>
        </div>

        <!-- Section 2: Top Reward Earners -->
        <div class="bg-[#ffffff] mb-3 p-3 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">Top Reward Earners</div>
            <div class="mb-2">
              <input 
                v-model="rewardShareSearchQuery"
                type="text" 
                placeholder="Search by Address" 
                class="input input-bordered input-sm w-full bg-base-200 dark:bg-[rgba(255,255,255,.03);]"
              />
            </div>
          </div>
          <div class="bg-base-200 rounded-md overflow-auto h-[40vh]">
            <table class="table w-full table-compact">
              <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
                <tr class="border-b-[0px] text-sm font-semibold">
                  <th>Rank</th>
                  <th>Validator</th>
                  <th>Rewards (POKT)</th>
                  <th>Reward/Relay</th>
                  <th>Efficiency</th>
                  <th>Relays</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingRewardShare" class="text-center">
                  <td colspan="7" class="py-8">
                    <div class="flex justify-center items-center">
                      <div class="loading loading-spinner loading-md"></div>
                      <span class="ml-2">Loading...</span>
                    </div>
                  </td>
                </tr>
                <tr v-else-if="topRewardEarners.length === 0" class="text-center">
                  <td colspan="7" class="py-8">
                    <div class="text-gray-500">No data</div>
                  </td>
                </tr>
                <tr 
                  v-for="item in topRewardEarners.filter(r => 
                    !rewardShareSearchQuery || 
                    r.operator_address.toLowerCase().includes(rewardShareSearchQuery.toLowerCase()) ||
                    (r.moniker && r.moniker.toLowerCase().includes(rewardShareSearchQuery.toLowerCase()))
                  )" 
                  :key="item.operator_address"
                  class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl"
                >
                  <td class="dark:bg-base-200 bg-white font-bold">
                    <span class="badge badge-sm" :class="item.rank === 1 ? 'badge-primary' : item.rank === 2 ? 'badge-secondary' : item.rank === 3 ? 'badge-accent' : 'badge-ghost'">
                      #{{ item.rank }}
                    </span>
                  </td>
                  <td class="dark:bg-base-200 bg-white font-mono text-xs truncate" style="max-width: 150px">
                    {{ item.moniker || item.operator_address.substring(0, 12) + '...' }}
                  </td>
                  <td class="dark:bg-base-200 bg-white font-semibold text-success">{{ item.total_rewards.toFixed(4) }}</td>
                  <td class="dark:bg-base-200 bg-white text-xs">{{ format.formatToken({ denom: 'upokt', amount: String(item.reward_per_relay) }) }}</td>
                  <td class="dark:bg-base-200 bg-white">
                    <span :class="item.efficiency >= 95 ? 'text-success' : item.efficiency >= 80 ? 'text-warning' : 'text-error'" class="text-xs">
                      {{ item.efficiency.toFixed(2) }}%
                    </span>
                  </td>
                  <td class="dark:bg-base-200 bg-white text-xs">{{ formatNumber(item.total_relays) }}</td>
                  <td class="dark:bg-base-200 bg-white">
                    <span v-if="item.status" class="badge badge-xs" :class="item.status === 'BOND_STATUS_BONDED' ? 'badge-success' : 'badge-warning'">
                      {{ item.status.replace('BOND_STATUS_', '') }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Middle Row: Reward Efficiency Analysis (Left) + Reward by Service (Right) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- Section 3: Reward Efficiency Analysis -->
        <div class="bg-[#ffffff] mb-3 p-3 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">Reward Efficiency Analysis</div>
          </div>
          <div class="bg-base-200 rounded-md overflow-auto h-[40vh]">
            <table class="table w-full table-compact">
              <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
                <tr class="border-b-[0px] text-sm font-semibold">
                  <th>Validator</th>
                  <th>Rewards/CU</th>
                  <th>Reward/Relay</th>
                  <th>Efficiency</th>
                  <th>Total Rewards</th>
                  <th>Relays</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingRewardShare" class="text-center">
                  <td colspan="6" class="py-8">
                    <div class="flex justify-center items-center">
                      <div class="loading loading-spinner loading-md"></div>
                      <span class="ml-2">Loading...</span>
                    </div>
                  </td>
                </tr>
                <tr v-else-if="rewardEfficiencyAnalysis.length === 0" class="text-center">
                  <td colspan="6" class="py-8">
                    <div class="text-gray-500">No data</div>
                  </td>
                </tr>
                <tr 
                  v-for="item in rewardEfficiencyAnalysis" 
                  :key="item.operator_address"
                  class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl"
                >
                  <td class="dark:bg-base-200 bg-white font-mono text-xs truncate" style="max-width: 150px">
                    {{ item.moniker || item.operator_address.substring(0, 12) + '...' }}
                  </td>
                  <td class="dark:bg-base-200 bg-white text-xs">{{ item.reward_per_compute_unit.toFixed(6) }}</td>
                  <td class="dark:bg-base-200 bg-white text-xs">{{ format.formatToken({ denom: 'upokt', amount: String(item.reward_per_relay) }) }}</td>
                  <td class="dark:bg-base-200 bg-white">
                    <span :class="item.efficiency >= 95 ? 'text-success' : item.efficiency >= 80 ? 'text-warning' : 'text-error'" class="text-xs">
                      {{ item.efficiency.toFixed(2) }}%
                    </span>
                  </td>
                  <td class="dark:bg-base-200 bg-white text-xs font-semibold text-success">{{ item.total_rewards.toFixed(4) }}</td>
                  <td class="dark:bg-base-200 bg-white text-xs">{{ formatNumber(item.total_relays) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 4: Reward by Service -->
        <div class="bg-[#ffffff] mb-3 p-3 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">Reward by Service</div>
          </div>
          <div class="bg-base-200 rounded-md overflow-auto h-[40vh]">
            <table class="table w-full table-compact">
              <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
                <tr class="border-b-[0px] text-sm font-semibold">
                  <th>Validator</th>
                  <th>Total Rewards</th>
                  <th>Services</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingRewardShare" class="text-center">
                  <td colspan="3" class="py-8">
                    <div class="flex justify-center items-center">
                      <div class="loading loading-spinner loading-md"></div>
                      <span class="ml-2">Loading...</span>
                    </div>
                  </td>
                </tr>
                <tr v-else-if="rewardsByService.length === 0" class="text-center">
                  <td colspan="3" class="py-8">
                    <div class="text-gray-500">No data</div>
                  </td>
                </tr>
                <tr 
                  v-for="item in rewardsByService" 
                  :key="item.supplier.operator_address"
                  class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl"
                >
                  <td class="dark:bg-base-200 bg-white font-mono text-xs truncate" style="max-width: 200px">
                    {{ item.supplier.moniker || item.supplier.operator_address.substring(0, 12) + '...' }}
                  </td>
                  <td class="dark:bg-base-200 bg-white font-semibold text-success">{{ item.total_rewards.toFixed(4) }} POKT</td>
                  <td class="dark:bg-base-200 bg-white">
                    <span class="badge badge-primary badge-sm">{{ item.total_services }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Bottom: Reward Trends Over Time -->
      <div class="bg-[#ffffff] mb-3 p-3 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold">Reward Trends Over Time</div>
          <div class="flex items-center gap-2">
            <!-- Metric Toggles -->
            <label class="label cursor-pointer gap-1">
              <input type="checkbox" v-model="rewardTrendsMetrics.rewards" class="checkbox checkbox-xs" />
              <span class="label-text text-xs">Rewards</span>
            </label>
            <label class="label cursor-pointer gap-1">
              <input type="checkbox" v-model="rewardTrendsMetrics.rewardPerRelay" class="checkbox checkbox-xs" />
              <span class="label-text text-xs">Reward/Relay</span>
            </label>
            <label class="label cursor-pointer gap-1">
              <input type="checkbox" v-model="rewardTrendsMetrics.efficiency" class="checkbox checkbox-xs" />
              <span class="label-text text-xs">Efficiency</span>
            </label>
            <!-- Date Range -->
            <input 
              type="date" 
              :value="rewardShareDateRange.start ? new Date(rewardShareDateRange.start).toISOString().split('T')[0] : ''"
              @change="(e) => { const target = e.target as HTMLInputElement; if (target?.value) { rewardShareDateRange.start = new Date(target.value).toISOString(); loadRewardShareData(); } }"
              class="input input-bordered input-xs dark:bg-[rgba(255,255,255,.03);]"
            />
            <span class="text-xs">to</span>
            <input 
              type="date" 
              :value="rewardShareDateRange.end ? new Date(rewardShareDateRange.end).toISOString().split('T')[0] : ''"
              @change="(e) => { const target = e.target as HTMLInputElement; if (target?.value) { rewardShareDateRange.end = new Date(target.value).toISOString(); loadRewardShareData(); } }"
              class="input input-bordered input-xs dark:bg-[rgba(255,255,255,.03);]"
            />
          </div>
        </div>
        <div class="mb-2">
          <div class="text-lg font-bold">
            Total Rewards: {{ rewardTrends.reduce((sum, d) => sum + d.total_rewards, 0).toFixed(2) }} POKT
          </div>
        </div>
        <div class="h-80 relative">
          <div v-if="loadingRewardShare" class="flex items-center justify-center h-full">
            <div class="loading loading-spinner loading-md"></div>
          </div>
          <div v-else-if="rewardTrends.length === 0" class="flex items-center justify-center h-full text-gray-500 text-xs">
            No data available. Please select a validator or service from the filter modal.
          </div>
          <div v-else>
            <ApexCharts 
              :type="rewardTrendsChartType" 
              height="300" 
              :options="rewardTrendsChartOptions" 
              :series="rewardTrendsChartSeries"
              :key="`rewardTrends-${rewardTrendsChartType}`"
            />
          </div>
          <!-- Chart Type Selector - Bottom Right -->
          <div v-if="!loadingRewardShare && rewardTrends.length > 0" class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button
              @click="rewardTrendsChartType = 'bar'"
              :class="[
                'tab',
                rewardTrendsChartType === 'bar' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Bar Chart">
              <Icon icon="mdi:chart-bar" class="text-sm" />
            </button>
            <button
              @click="rewardTrendsChartType = 'area'"
              :class="[
                'tab',
                rewardTrendsChartType === 'area' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Area Chart">
              <Icon icon="mdi:chart-areaspline" class="text-sm" />
            </button>
            <button
              @click="rewardTrendsChartType = 'line'"
              :class="[
                'tab',
                rewardTrendsChartType === 'line' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Line Chart">
              <Icon icon="mdi:chart-line" class="text-sm" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .table { font-size: 0.75rem; }
  th, td { padding: 0.5rem; }
}
.page-btn:hover {
  background-color: #e9ecef;
}
.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>


