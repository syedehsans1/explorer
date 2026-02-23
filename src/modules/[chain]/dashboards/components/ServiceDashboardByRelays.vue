<script lang="ts" setup>
import { ref, onMounted, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import ApexCharts from 'vue3-apexcharts';
import { useBlockchain, useFormatter } from '@/stores';

const props = defineProps<{
  chain?: string;
  filters?: {
    supplier_address?: string;
    owner_address?: string;
  };
}>();

const chainStore = useBlockchain();
const format = useFormatter();

// Map frontend chain names to API chain names
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  };
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

const current = chainStore?.current?.chainName || props.chain || 'pocket-beta';
const apiChainName = computed(() => getApiChainName(current));
const chain = computed(() => props.chain || current);

// Helper function to determine if we should use POST (multiple addresses or long URL)
function shouldUsePost(params: URLSearchParams): boolean {
  // Use filters from props if provided, otherwise use internal selectedSupplier
  const supplierFilter = props.filters?.supplier_address || selectedSupplier.value;
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
async function fetchApi(url: string, params: URLSearchParams): Promise<any> {
  const isRewardsEndpoint = url.includes('/claims/rewards');
  const isSummaryEndpoint = url.includes('/claims/summary');
  
  // Check if we have supplier_address parameter
  const hasSupplierAddress = params.has('supplier_address');
  const supplierAddressValue = hasSupplierAddress ? params.get('supplier_address') : null;
  const hasMultipleSuppliers = supplierAddressValue && supplierAddressValue.includes(',');
  
  // For rewards and summary endpoints: always use POST when supplier_address is present
  // This ensures proper handling of supplier_addresses array format
  const shouldPost = shouldUsePost(params) || 
    ((isRewardsEndpoint || isSummaryEndpoint) && hasSupplierAddress);
  
  if (shouldPost) {
    // Use POST with request body
    const postBody: any = {};
    params.forEach((value, key) => {
      // For rewards and summary endpoints, handle supplier_address specially
      if ((isRewardsEndpoint || isSummaryEndpoint) && key === 'supplier_address') {
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
        postBody[key] = value;
      }
    });
    
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

interface ProofSubmission {
  id: number;
  transaction_hash: string;
  block_height: string;
  timestamp: string;
  supplier_operator_address: string;
  application_address: string;
  service_id: string;
  session_id: string;
  session_end_block_height: string;
  claim_proof_status_int: number;
  claimed_upokt: string;
  claimed_upokt_amount: string;
  num_claimed_compute_units: string;
  num_estimated_compute_units: string;
  num_relays: string;
  compute_unit_efficiency: string;
  reward_per_relay: string;
  msg_index: number;
  created_at: string;
}

interface RewardAnalytics {
  service_id: string;
  chain: string;
  total_submissions: string;
  total_rewards_upokt: string;
  total_relays: string;
  total_claimed_compute_units: string;
  total_estimated_compute_units: string;
  avg_efficiency_percent: string;
  avg_reward_per_relay: string;
  max_reward_per_submission: string;
  min_reward_per_submission: string;
}

interface ApiMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SummaryStats {
  total_submissions: string;
  unique_suppliers: string;
  unique_applications: string;
  unique_services: string;
  total_rewards_upokt: string;
  total_relays: string;
  total_claimed_compute_units: string;
  total_estimated_compute_units: string;
  avg_efficiency_percent: string;
  avg_reward_per_relay: string;
  first_submission: string;
  last_submission: string;
}

// Service rewards data (aggregated by service per API docs)
const serviceRewardsLoading = ref(false);
const serviceRewards = ref<RewardAnalytics[]>([]);
const serviceRewardsMeta = ref<ApiMeta | null>(null);
const serviceRewardsPage = ref(1);
const serviceRewardsLimit = ref(10);
const serviceRewardsDays = ref(7);
const serviceRewardsSortBy = ref<'rewards' | 'relays' | 'efficiency' | 'submissions' | 'reward_per_relay'>('rewards');
const serviceRewardsSortOrder = ref<'asc' | 'desc'>('desc');

// Dashboard view controls
const dashboardView = ref<'overview' | 'detailed'>('overview');
const selectedMetric = ref<'rewards' | 'relays' | 'efficiency' | 'submissions'>('rewards');

// Shared data
const summaryStats = ref<SummaryStats | null>(null);
const submissions = ref<ProofSubmission[]>([]);
const selectedService = ref('');
const selectedSupplier = ref('');
const selectedApplication = ref('');
const startDate = ref('');
const endDate = ref('');

const rewardsChartSeries = ref([{ name: 'Total Rewards (POKT)', data: [] as number[] }]);
const efficiencyChartSeries = ref([{ name: 'Avg Efficiency %', data: [] as number[] }]);
const relaysChartSeries = ref([{ name: 'Total Relays', data: [] as number[] }]);

// Bar chart for top services by rewards (most recent hour)
const topServicesChartSeries = ref([{ name: 'Rewards (POKT)', data: [] as number[] }]);
const topServicesChartType = ref<'bar' | 'area' | 'line'>('bar');
const topServicesChartCategories = ref<string[]>([]);

// Time series chart
const timeSeriesChartSeries = ref<Array<{ name: string; data: number[] }>>([]);
const timeSeriesChartCategories = ref<string[]>([]);
const timeSeriesChartType = ref<'line' | 'area'>('line');

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
    dataLabels: { enabled: chartType === 'bar', formatter: (v: number) => {
      if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
      if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
      return v.toFixed(4);
    }, style: { colors: ['#000'] } },
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
    yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => {
      if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
      if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
      return v.toFixed(4);
    } } },
    tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toFixed(4) + ' POKT' } }
  };
});

const timeSeriesChartOptions = computed(() => {
  const chartType = timeSeriesChartType.value;
  
  return {
    chart: { type: chartType, height: 360, toolbar: { show: false }, zoom: { enabled: true } },
    colors: ['#A3E635', '#60A5FA', '#F59E0B'],
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    fill: {
      type: chartType === 'area' ? 'gradient' : 'solid',
      opacity: chartType === 'area' ? 0.3 : 0,
      gradient: chartType === 'area' ? {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.3,
        stops: [0, 90, 100]
      } : undefined
    },
    grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
    markers: {
      size: 3,
      hover: { size: 5 }
    },
    xaxis: { 
      categories: timeSeriesChartCategories.value, 
      labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45, rotateAlways: false } 
    },
    yaxis: [
      {
        labels: { style: { colors: '#A3E635' }, formatter: (v: number) => {
          if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
          if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
          return v.toFixed(0);
        }},
        title: { text: 'Rewards (POKT) / Relays', style: { color: '#A3E635' } }
      },
      {
        opposite: true,
        labels: { style: { colors: '#F59E0B' }, formatter: (v: number) => v.toFixed(1) + '%' },
        title: { text: 'Efficiency %', style: { color: '#F59E0B' } },
        min: 0,
        max: 100
      }
    ],
    tooltip: { theme: 'dark', shared: true, y: [
      { formatter: (v: number) => (v / 1000000).toFixed(4) + ' POKT/relays' },
      { formatter: (v: number) => (v / 1000000).toFixed(4) + ' POKT/relays' },
      { formatter: (v: number) => v.toFixed(2) + '%' }
    ]},
    legend: { position: 'top', horizontalAlign: 'right' }
  };
});

// Chart options for different visualizations
const barChartOptions = computed(() => ({
  chart: { type: 'bar', height: 300, toolbar: { show: false } },
  colors: ['#A3E635'],
  dataLabels: { enabled: true, formatter: (v: number) => {
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(0);
  }},
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: { categories: rewardsDistributionChart.value.labels, labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45 } },
    yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => {
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(4);
  }}},
  tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toFixed(4) + ' POKT' } }
}));

const pieChartOptions = computed(() => ({
  chart: { type: 'pie', height: 300, toolbar: { show: false } },
  colors: ['#A3E635', '#60A5FA', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#10B981', '#F97316'],
  labels: rewardsDistributionChart.value.labels,
  dataLabels: { enabled: true, formatter: (val: number) => val.toFixed(1) + '%' },
  legend: { position: 'bottom', labels: { colors: 'rgb(116, 109, 105)' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toLocaleString() } }
}));

const efficiencyChartOptions = computed(() => ({
  chart: { type: 'bar', height: 300, toolbar: { show: false } },
  colors: efficiencyComparisonChart.value.series.map(eff => 
    eff >= 95 ? '#10B981' : eff >= 80 ? '#F59E0B' : '#EF4444'
  ),
  dataLabels: { enabled: true, formatter: (v: number) => v.toFixed(1) + '%' },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: { categories: efficiencyComparisonChart.value.labels, labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45 } },
  yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, min: 0, max: 100, formatter: (v: number) => v.toFixed(0) + '%' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toFixed(2) + '%' } }
}));

const computeUnitsChartOptions = computed(() => ({
  chart: { type: 'bar', height: 300, toolbar: { show: false }, stacked: false },
  colors: ['#60A5FA', '#F59E0B'],
  dataLabels: { enabled: false },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: { categories: computeUnitsChart.value.labels, labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45 } },
  yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => {
    if (v >= 1000000000) return (v / 1000000000).toFixed(2) + 'B';
    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return v.toFixed(0);
  }}},
  tooltip: { theme: 'dark' },
  legend: { position: 'top', labels: { colors: 'rgb(116, 109, 105)' } }
}));

async function loadSummaryStats() {
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    if (selectedService.value) params.append('service_id', selectedService.value);
    // Use filters from props if provided, otherwise use internal selectedSupplier
    const supplierFilter = props.filters?.supplier_address || selectedSupplier.value;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    if (selectedApplication.value) params.append('application_address', selectedApplication.value);
    
    const data = await fetchApi('/api/v1/claims/summary', params);
    summaryStats.value = data.data;
  } catch (error: any) {
    console.error('Error loading summary stats:', error);
  }
}

async function loadServiceRewards() {
  serviceRewardsLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    if (selectedService.value) params.append('service_id', selectedService.value);
    const supplierFilter = props.filters?.supplier_address || selectedSupplier.value;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    if (selectedApplication.value) params.append('application_address', selectedApplication.value);
    if (startDate.value && !serviceRewardsDays.value) params.append('start_date', startDate.value);
    if (endDate.value && !serviceRewardsDays.value) params.append('end_date', endDate.value);

    params.append('limit', serviceRewardsLimit.value.toString());
    params.append('page', serviceRewardsPage.value.toString());
    if (serviceRewardsDays.value) {
      params.append('days', serviceRewardsDays.value.toString());
    }

    const data = await fetchApi('/api/v1/claims/rewards', params);
    serviceRewards.value = data.data || [];
    serviceRewardsMeta.value = data.meta || null;
    
    // Apply client-side sorting
    if (serviceRewardsSortBy.value) {
      serviceRewards.value.sort((a, b) => {
        let aVal: any, bVal: any;
        switch (serviceRewardsSortBy.value) {
          case 'rewards':
            aVal = parseInt(a.total_rewards_upokt || '0');
            bVal = parseInt(b.total_rewards_upokt || '0');
            break;
          case 'relays':
            aVal = parseInt(a.total_relays || '0');
            bVal = parseInt(b.total_relays || '0');
            break;
          case 'efficiency':
            aVal = parseFloat(a.avg_efficiency_percent || '0');
            bVal = parseFloat(b.avg_efficiency_percent || '0');
            break;
          case 'submissions':
            aVal = parseInt(a.total_submissions || '0');
            bVal = parseInt(b.total_submissions || '0');
            break;
          case 'reward_per_relay':
            aVal = parseFloat(a.avg_reward_per_relay || '0');
            bVal = parseFloat(b.avg_reward_per_relay || '0');
            break;
          default:
            return 0;
        }
        if (serviceRewardsSortOrder.value === 'asc') {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
    }
    
    updateServiceCharts();
  } catch (error: any) {
    console.error('Error loading service rewards:', error);
    serviceRewards.value = [];
    serviceRewardsMeta.value = null;
  } finally {
    serviceRewardsLoading.value = false;
  }
}

// Chart data for visualizations
const rewardsDistributionChart = ref({ series: [] as number[], labels: [] as string[] });
const relaysDistributionChart = ref({ series: [] as number[], labels: [] as string[] });
const efficiencyComparisonChart = ref({ series: [] as number[], labels: [] as string[] });
const rewardPerRelayChart = ref({ series: [] as number[], labels: [] as string[] });
const computeUnitsChart = ref({ claimed: [] as number[], estimated: [] as number[], labels: [] as string[] });

function updateServiceCharts() {
  if (serviceRewards.value.length === 0) {
    rewardsDistributionChart.value = { series: [], labels: [] };
    relaysDistributionChart.value = { series: [], labels: [] };
    efficiencyComparisonChart.value = { series: [], labels: [] };
    rewardPerRelayChart.value = { series: [], labels: [] };
    computeUnitsChart.value = { claimed: [], estimated: [], labels: [] };
    return;
  }

  // Sort by selected metric for top N display
  const sorted = [...serviceRewards.value].sort((a, b) => {
    let aVal: number, bVal: number;
    switch (selectedMetric.value) {
      case 'rewards':
        aVal = parseInt(a.total_rewards_upokt || '0');
        bVal = parseInt(b.total_rewards_upokt || '0');
        break;
      case 'relays':
        aVal = parseInt(a.total_relays || '0');
        bVal = parseInt(b.total_relays || '0');
        break;
      case 'efficiency':
        aVal = parseFloat(a.avg_efficiency_percent || '0');
        bVal = parseFloat(b.avg_efficiency_percent || '0');
        break;
      case 'submissions':
        aVal = parseInt(a.total_submissions || '0');
        bVal = parseInt(b.total_submissions || '0');
        break;
      default:
        return 0;
    }
    return bVal - aVal;
  });

  const topN = Math.min(20, sorted.length);
  const topServices = sorted.slice(0, topN);

  // Rewards Distribution (convert from upokt to POKT)
  rewardsDistributionChart.value = {
    series: topServices.map(s => parseInt(s.total_rewards_upokt || '0') / 1000000),
    labels: topServices.map(s => s.service_id || 'unknown')
  };

  // Relays Distribution
  relaysDistributionChart.value = {
    series: topServices.map(s => parseInt(s.total_relays || '0')),
    labels: topServices.map(s => s.service_id || 'unknown')
  };

  // Efficiency Comparison
  efficiencyComparisonChart.value = {
    series: topServices.map(s => parseFloat(s.avg_efficiency_percent || '0')),
    labels: topServices.map(s => s.service_id || 'unknown')
  };

  // Reward Per Relay (convert from upokt to POKT)
  rewardPerRelayChart.value = {
    series: topServices.map(s => parseFloat(s.avg_reward_per_relay || '0') / 1000000),
    labels: topServices.map(s => s.service_id || 'unknown')
  };

  // Compute Units (Claimed vs Estimated)
  computeUnitsChart.value = {
    claimed: topServices.map(s => parseInt(s.total_claimed_compute_units || '0')),
    estimated: topServices.map(s => parseInt(s.total_estimated_compute_units || '0')),
    labels: topServices.map(s => s.service_id || 'unknown')
  };
}

// Watchers for service rewards
watch(serviceRewardsLimit, () => {
  serviceRewardsPage.value = 1;
  loadServiceRewards();
});

watch(serviceRewardsDays, () => {
  serviceRewardsPage.value = 1;
  loadServiceRewards();
});

watch(serviceRewardsPage, () => {
  loadServiceRewards();
});

watch([serviceRewardsSortBy, serviceRewardsSortOrder], () => {
  loadServiceRewards();
});

watch(selectedMetric, () => {
  updateServiceCharts();
});

// Computed properties for top performers
const topServicesByRewards = computed(() => {
  return [...serviceRewards.value]
    .sort((a, b) => parseInt(b.total_rewards_upokt || '0') - parseInt(a.total_rewards_upokt || '0'))
    .slice(0, 5);
});

const topServicesByRelays = computed(() => {
  return [...serviceRewards.value]
    .sort((a, b) => parseInt(b.total_relays || '0') - parseInt(a.total_relays || '0'))
    .slice(0, 5);
});

const topServicesByEfficiency = computed(() => {
  return [...serviceRewards.value]
    .filter(s => parseFloat(s.avg_efficiency_percent || '0') > 0)
    .sort((a, b) => parseFloat(b.avg_efficiency_percent || '0') - parseFloat(a.avg_efficiency_percent || '0'))
    .slice(0, 5);
});

const totalRewards = computed(() => {
  return serviceRewards.value.reduce((sum, s) => sum + parseInt(s.total_rewards_upokt || '0'), 0);
});

const totalRelays = computed(() => {
  return serviceRewards.value.reduce((sum, s) => sum + parseInt(s.total_relays || '0'), 0);
});

const avgEfficiency = computed(() => {
  const total = serviceRewards.value.reduce((sum, s) => {
    const weight = parseInt(s.total_rewards_upokt || '0');
    return sum + (parseFloat(s.avg_efficiency_percent || '0') * weight);
  }, 0);
  const totalWeight = serviceRewards.value.reduce((sum, s) => sum + parseInt(s.total_rewards_upokt || '0'), 0);
  return totalWeight > 0 ? total / totalWeight : 0;
});

function applyFilters() {
  serviceRewardsPage.value = 1;
  loadServiceRewards();
}

function formatNumber(num: number | string): string { return new Intl.NumberFormat().format(typeof num === 'string' ? parseInt(num) : num); }

// Watch for filter changes and reload data
watch(() => props.filters, () => {
  loadSummaryStats();
  loadServiceRewards();
}, { deep: true });

onMounted(() => {
  loadSummaryStats();
  loadServiceRewards();
});
</script>

<template>
  <div class="pt-[2.5rem]">
    <div v-if="serviceRewardsLoading" class="flex justify-center items-center py-8 mb-[10vh]">
      <div class="loading loading-spinner loading-lg"></div>
      <span class="ml-2">Loading service rewards analytics...</span>
    </div>
    
    <div v-if="!serviceRewardsLoading && serviceRewards.length === 0" class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 rounded-xl p-8 text-center mb-5">
      <Icon icon="mdi:chart-line" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">No service rewards data available</p>
      <p class="text-xs text-secondary mt-2">Data is aggregated by service</p>
    </div>
    
    <!-- Top Row: 8 KPI Boxes (Compact) -->
    <div v-if="summaryStats" class="mb-3">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Submissions</div>
          <div class="text-lg font-bold">{{ formatNumber(parseInt(summaryStats.total_submissions)) }}</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Suppliers</div>
          <div class="text-lg font-bold">{{ formatNumber(parseInt(summaryStats.unique_suppliers)) }}</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Applications</div>
          <div class="text-lg font-bold">{{ formatNumber(parseInt(summaryStats.unique_applications)) }}</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Services</div>
          <div class="text-lg font-bold">{{ formatNumber(parseInt(summaryStats.unique_services)) }}</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Total Relays</div>
          <div class="text-lg font-bold">{{ formatNumber(parseInt(summaryStats.total_relays)) }}</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Avg Efficiency</div>
          <div class="text-lg font-bold">{{ parseFloat(summaryStats.avg_efficiency_percent).toFixed(2) }}%</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Compute Units</div>
          <div class="text-lg font-bold">{{ formatNumber(parseInt(summaryStats.total_claimed_compute_units)) }}</div>
        </div>
        <div class="flex flex-col bg-[#ffffff] p-2 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="text-xs text-secondary mb-1">Total Rewards</div>
          <div class="text-lg font-bold">{{ format.formatToken({ denom: 'upokt', amount: String(summaryStats.total_rewards_upokt) }) }}</div>
        </div>
      </div>
    </div>
    
    <!-- Comprehensive Dashboard Below Stats -->
    <div v-if="!serviceRewardsLoading && serviceRewards.length > 0" class="space-y-4 mb-4">
      <!-- Dashboard Controls -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-main">Service Performance Dashboard</h2>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-secondary">Metric:</span>
            <select v-model="selectedMetric" class="select select-bordered select-sm text-xs hover:bg-base-200 dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option value="rewards">Rewards</option>
              <option value="relays">Relays</option>
              <option value="efficiency">Efficiency</option>
              <option value="submissions">Submissions</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-secondary">Days:</span>
            <select v-model="serviceRewardsDays" class="select select-bordered select-sm text-xs hover:bg-base-200 dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option :value="7">7</option>
              <option :value="15">15</option>
              <option :value="30">30</option>
              <option :value="60">60</option>
              <option :value="90">90</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-secondary">Limit:</span>
            <select v-model="serviceRewardsLimit" class="select select-bordered select-sm text-xs hover:bg-base-200 dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option :value="5">5</option>
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Top Performers Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <!-- Top by Rewards -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-main">Top by Rewards</h3>
            <Icon icon="mdi:trophy" class="text-warning text-xl" />
          </div>
          <div class="space-y-2">
            <div v-for="(service, idx) in topServicesByRewards" :key="service.service_id" class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <span class="badge badge-sm" :class="idx === 0 ? 'badge-primary' : idx === 1 ? 'badge-secondary' : idx === 2 ? 'badge-accent' : 'badge-ghost'">
                  #{{ idx + 1 }}
                </span>
                <span class="font-medium">{{ service.service_id }}</span>
              </div>
              <span class="text-secondary">{{ format.formatToken({ denom: 'upokt', amount: String(service.total_rewards_upokt) }) }}</span>
            </div>
          </div>
        </div>

        <!-- Top by Relays -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-main">Top by Relays</h3>
            <Icon icon="mdi:network" class="text-info text-xl" />
          </div>
          <div class="space-y-2">
            <div v-for="(service, idx) in topServicesByRelays" :key="service.service_id" class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <span class="badge badge-sm" :class="idx === 0 ? 'badge-primary' : idx === 1 ? 'badge-secondary' : idx === 2 ? 'badge-accent' : 'badge-ghost'">
                  #{{ idx + 1 }}
                </span>
                <span class="font-medium">{{ service.service_id }}</span>
              </div>
              <span class="text-secondary">{{ formatNumber(parseInt(service.total_relays)) }}</span>
            </div>
          </div>
        </div>

        <!-- Top by Efficiency -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-main">Top by Efficiency</h3>
            <Icon icon="mdi:gauge" class="text-success text-xl" />
          </div>
          <div class="space-y-2">
            <div v-for="(service, idx) in topServicesByEfficiency" :key="service.service_id" class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <span class="badge badge-sm" :class="idx === 0 ? 'badge-primary' : idx === 1 ? 'badge-secondary' : idx === 2 ? 'badge-accent' : 'badge-ghost'">
                  #{{ idx + 1 }}
                </span>
                <span class="font-medium">{{ service.service_id }}</span>
              </div>
              <span :class="parseFloat(service.avg_efficiency_percent) >= 95 ? 'text-success' : parseFloat(service.avg_efficiency_percent) >= 80 ? 'text-warning' : 'text-error'" class="font-medium">
                {{ parseFloat(service.avg_efficiency_percent).toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <!-- Rewards Distribution Bar Chart -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <h3 class="text-sm font-semibold mb-3">Rewards Distribution</h3>
          <ApexCharts 
            type="bar" 
            height="300" 
            :options="barChartOptions" 
            :series="[{ name: 'Rewards (POKT)', data: rewardsDistributionChart.series.map(v => v / 1000000) }]"
          />
        </div>

        <!-- Rewards Distribution Pie Chart -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <h3 class="text-sm font-semibold mb-3">Rewards Share</h3>
          <ApexCharts 
            type="pie" 
            height="300" 
            :options="pieChartOptions" 
            :series="rewardsDistributionChart.series"
          />
        </div>

        <!-- Efficiency Comparison -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <h3 class="text-sm font-semibold mb-3">Efficiency Comparison</h3>
          <ApexCharts 
            type="bar" 
            height="300" 
            :options="efficiencyChartOptions" 
            :series="[{ name: 'Efficiency %', data: efficiencyComparisonChart.series }]"
          />
        </div>

        <!-- Compute Units Comparison -->
        <div class="flex flex-col bg-[#ffffff] p-4 rounded-xl hover:bg-base-200 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <h3 class="text-sm font-semibold mb-3">Compute Units: Claimed vs Estimated</h3>
          <ApexCharts 
            type="bar" 
            height="300" 
            :options="computeUnitsChartOptions" 
            :series="[
              { name: 'Claimed', data: computeUnitsChart.claimed },
              { name: 'Estimated', data: computeUnitsChart.estimated }
            ]"
          />
        </div>
      </div>

      <!-- Comprehensive Service Rewards Table -->
      <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 p-4 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-main">Service Rewards Details</h3>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-xs text-secondary">Sort:</span>
              <select v-model="serviceRewardsSortBy" class="select select-bordered select-sm text-xs dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)] bg-base-200 hover:bg-base-300">
                <option value="rewards">Rewards</option>
                <option value="relays">Relays</option>
                <option value="efficiency">Efficiency</option>
                <option value="submissions">Submissions</option>
                <option value="reward_per_relay">Reward/Relay</option>
              </select>
              <button @click="serviceRewardsSortOrder = serviceRewardsSortOrder === 'asc' ? 'desc' : 'asc'" class="btn btn-sm btn-ghost">
                <Icon :icon="serviceRewardsSortOrder === 'asc' ? 'mdi:sort-ascending' : 'mdi:sort-descending'" />
              </button>
            </div>
          </div>
        </div>
        <div class="bg-base-200 rounded-md overflow-auto" style="max-height: 600px;">
          <table class="table w-full table-compact">
            <thead class="dark:bg-[rgba(255,255,255,.03);] bg-base-200 sticky top-0 border-0">
              <tr class="border-b-[0px] text-sm font-semibold">
                <th>Rank</th>
                <th>Service</th>
                <th>Chain</th>
                <th>Total Rewards</th>
                <th>Total Relays</th>
                <th>Submissions</th>
                <th>Avg Efficiency</th>
                <th>Reward/Relay</th>
                <th>Claimed CU</th>
                <th>Estimated CU</th>
                <th>Max Reward</th>
                <th>Min Reward</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="serviceRewardsLoading" class="text-center">
                <td colspan="12" class="py-8">
                  <div class="flex justify-center items-center">
                    <div class="loading loading-spinner loading-md"></div>
                    <span class="ml-2">Loading services...</span>
                  </div>
                </td>
              </tr>
              <tr v-else-if="serviceRewards.length === 0" class="text-center">
                <td colspan="12" class="py-8">
                  <div class="text-gray-500">No services found</div>
                </td>
              </tr>
              <tr
                v-for="(service, index) in serviceRewards"
                :key="service.service_id + service.chain"
                class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0"
              >
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-sm" :class="index === 0 ? 'badge-primary' : index === 1 ? 'badge-secondary' : index === 2 ? 'badge-accent' : 'badge-ghost'">
                    #{{ (serviceRewardsPage - 1) * serviceRewardsLimit + index + 1 }}
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-primary">{{ service.service_id || '-' }}</span>
                </td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ service.chain || '-' }}</td>
                <td class="dark:bg-base-200 bg-white font-medium">{{ format.formatToken({ denom: 'upokt', amount: String(service.total_rewards_upokt) }) }}</td>
                <td class="dark:bg-base-200 bg-white">{{ formatNumber(parseInt(service.total_relays || '0')) }}</td>
                <td class="dark:bg-base-200 bg-white">{{ formatNumber(parseInt(service.total_submissions || '0')) }}</td>
                <td class="dark:bg-base-200 bg-white">
                  <span :class="parseFloat(service.avg_efficiency_percent || '0') >= 95 ? 'text-success' : parseFloat(service.avg_efficiency_percent || '0') >= 80 ? 'text-warning' : 'text-error'" class="font-medium">
                    {{ parseFloat(service.avg_efficiency_percent || '0').toFixed(2) }}%
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white">{{ format.formatToken({ denom: 'upokt', amount: String(service.avg_reward_per_relay || '0') }) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ formatNumber(parseInt(service.total_claimed_compute_units || '0')) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ formatNumber(parseInt(service.total_estimated_compute_units || '0')) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ format.formatToken({ denom: 'upokt', amount: String(service.max_reward_per_submission || '0') }) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ format.formatToken({ denom: 'upokt', amount: String(service.min_reward_per_submission || '0') }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Pagination Bar -->
        <div v-if="serviceRewardsMeta" class="flex justify-between items-center gap-4 my-6 px-2">
          <!-- Page Size Dropdown -->
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">Show:</span>
            <select 
              v-model="serviceRewardsLimit" 
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
              Showing {{ ((serviceRewardsPage - 1) * serviceRewardsLimit) + 1 }} to {{ Math.min(serviceRewardsPage * serviceRewardsLimit, serviceRewardsMeta.total) }} of {{ formatNumber(serviceRewardsMeta.total) }} services
            </span>
            
            <div class="flex items-center gap-1">
              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="serviceRewardsPage = 1"
                :disabled="serviceRewardsPage === 1 || serviceRewardsMeta.totalPages === 0"
              >
                First
              </button>
              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="serviceRewardsPage = Math.max(1, serviceRewardsPage - 1)"
                :disabled="serviceRewardsPage === 1 || serviceRewardsMeta.totalPages === 0"
              >
                &lt;
              </button>

              <span class="text-xs px-2">
                Page {{ serviceRewardsPage }} of {{ serviceRewardsMeta.totalPages }}
              </span>

              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="serviceRewardsPage = Math.min(serviceRewardsMeta.totalPages, serviceRewardsPage + 1)"
                :disabled="serviceRewardsPage === serviceRewardsMeta.totalPages || serviceRewardsMeta.totalPages === 0"
              >
                &gt;
              </button>
              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="serviceRewardsPage = serviceRewardsMeta.totalPages"
                :disabled="serviceRewardsPage === serviceRewardsMeta.totalPages || serviceRewardsMeta.totalPages === 0"
              >
                Last
              </button>
            </div>
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

