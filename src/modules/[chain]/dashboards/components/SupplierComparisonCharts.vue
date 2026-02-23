<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import ApexCharts from 'vue3-apexcharts';
import { Icon } from '@iconify/vue';
import {
  fetchNetworkAverages,
  fetchTopPerformers,
  calculateTrends,
  type RewardAnalytics,
  type PerformanceDataPoint,
  type NetworkAverages,
  type TopPerformersThreshold,
} from '../composables/useSupplierAnalytics';

const props = defineProps<{
  chain?: string;
  filters?: {
    supplier_address?: string;
    owner_address?: string;
  };
  startDate?: string;
  endDate?: string;
}>();

// Map frontend chain names to API chain names
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-alpha': 'pocket-testnet-alpha',
    'pocket-mainnet': 'pocket-mainnet'
  };
  return chainMap[chainName] || chainName || 'pocket-mainnet';
};

const apiChainName = computed(() => getApiChainName(props.chain || 'pocket-mainnet'));

const loading = ref(false);
const networkAverages = ref<NetworkAverages | null>(null);
const topPerformers = ref<TopPerformersThreshold | null>(null);
const supplierData = ref<RewardAnalytics[]>([]);
const comparisonMode = ref<'network' | 'top10'>('network');

// Helper function to make API request
async function fetchApi(url: string, params: URLSearchParams, body?: any): Promise<any> {
  const isRewardsEndpoint = url.includes('/claims/rewards');
  const isSummaryEndpoint = url.includes('/claims/summary');
  
  // Check if we have supplier_address parameter
  const hasSupplierAddress = params.has('supplier_address');
  const supplierAddressValue = hasSupplierAddress ? params.get('supplier_address') : null;
  const hasMultipleSuppliers = supplierAddressValue && supplierAddressValue.includes(',');
  
  // For rewards and summary endpoints: always use POST when supplier_address is present
  // This ensures proper handling of supplier_addresses array format
  const shouldUsePost = body || params.toString().length > 2000 || 
    ((isRewardsEndpoint || isSummaryEndpoint) && hasSupplierAddress);
  
  if (shouldUsePost) {
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
    if (body) Object.assign(postBody, body);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  } else {
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }
}

async function loadSupplierData() {
  if (!props.filters?.supplier_address && !props.filters?.owner_address) {
    supplierData.value = [];
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    if (props.filters?.supplier_address) params.append('supplier_address', props.filters.supplier_address);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    if (props.startDate) params.append('start_date', props.startDate);
    if (props.endDate) params.append('end_date', props.endDate);
    params.append('limit', `${props.filters?.supplier_address?.split(',').length}` || '50');

    const data = await fetchApi('/api/v1/claims/rewards', params);
    supplierData.value = data.data || [];
  } catch (error) {
    console.error('Error loading supplier data:', error);
    supplierData.value = [];
  }
}

async function loadComparisonData() {
  loading.value = true;
  try {
    const [network, top10] = await Promise.all([
      fetchNetworkAverages(apiChainName.value, props.startDate, props.endDate),
      fetchTopPerformers(apiChainName.value, props.startDate, props.endDate),
    ]);
    networkAverages.value = network;
    topPerformers.value = top10;
  } catch (error) {
    console.error('Error loading comparison data:', error);
  } finally {
    loading.value = false;
  }
}

// Chart data
const comparisonChartSeries = computed(() => {
  if (!supplierData.value.length || (!networkAverages.value && !topPerformers.value)) {
    return [];
  }

  const sorted = [...supplierData.value].sort((a, b) => 
    new Date(a.hour_bucket).getTime() - new Date(b.hour_bucket).getTime()
  );

  const dates = sorted.map(d => new Date(d.hour_bucket).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }));
  const supplierRewards = sorted.map(d => d.total_rewards_upokt || 0);
  const supplierRelays = sorted.map(d => d.total_relays || 0);
  const supplierEfficiency = sorted.map(d => d.avg_efficiency_percent || 0);

  let comparisonRewards: number[] = [];
  let comparisonRelays: number[] = [];
  let comparisonEfficiency: number[] = [];

  if (comparisonMode.value === 'network' && networkAverages.value) {
    comparisonRewards = Array(dates.length).fill(networkAverages.value.avg_rewards);
    comparisonRelays = Array(dates.length).fill(networkAverages.value.avg_relays);
    comparisonEfficiency = Array(dates.length).fill(networkAverages.value.avg_efficiency);
  } else if (comparisonMode.value === 'top10' && topPerformers.value) {
    comparisonRewards = Array(dates.length).fill(topPerformers.value.rewards_threshold);
    comparisonRelays = Array(dates.length).fill(topPerformers.value.relays_threshold);
    comparisonEfficiency = Array(dates.length).fill(
      topPerformers.value.top10Percent.length > 0
        ? topPerformers.value.top10Percent.reduce((sum, p) => sum + p.avg_efficiency_percent, 0) / topPerformers.value.top10Percent.length
        : 0
    );
  }

  return [
    {
      name: 'Your Supplier',
      type: 'line',
      data: supplierRewards,
    },
    {
      name: comparisonMode.value === 'network' ? 'Network Average' : 'Top 10% Average',
      type: 'line',
      data: comparisonRewards,
    },
  ];
});

const comparisonChartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 350,
    toolbar: { show: false },
    zoom: { enabled: false },
  },
  colors: ['#A3E635', '#5E9AE4'],
  stroke: { curve: 'smooth', width: 2 },
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: {
    categories: comparisonChartSeries.value.length > 0 
      ? [...supplierData.value].sort((a, b) => new Date(a.hour_bucket).getTime() - new Date(b.hour_bucket).getTime())
          .map(d => new Date(d.hour_bucket).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }))
      : [],
    labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45, rotateAlways: false },
  },
  yaxis: {
    labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => (v / 1000000).toFixed(2) + 'M' },
  },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => (v / 1000000).toFixed(4) + ' POKT' } },
  legend: { position: 'top', horizontalAlign: 'right' },
}));

// Service distribution comparison
const serviceDistribution = computed(() => {
  if (!supplierData.value.length) return { supplier: {}, network: {} };

  const supplierServices: Record<string, number> = {};
  supplierData.value.forEach(d => {
    const service = d.service_id || 'unknown';
    supplierServices[service] = (supplierServices[service] || 0) + (d.total_rewards_upokt || 0);
  });

  return { supplier: supplierServices };
});

const serviceChartSeries = computed(() => {
  const dist = serviceDistribution.value.supplier;
  return Object.values(dist);
});

const serviceChartCategories = computed(() => {
  const dist = serviceDistribution.value.supplier;
  return Object.keys(dist);
});

const serviceChartOptions = computed(() => ({
  chart: { type: 'donut', height: 300, toolbar: { show: false } },
  colors: ['#A3E635', '#5E9AE4', '#FF6B6B', '#FFD93D', '#6BCF7F'],
  labels: serviceChartCategories.value,
  dataLabels: { enabled: true, formatter: (val: number) => val.toFixed(1) + '%' },
  legend: { position: 'bottom' },
  tooltip: { theme: 'dark' },
}));

// Percentage difference indicators
const percentageDifferences = computed(() => {
  if (!supplierData.value.length || (!networkAverages.value && !topPerformers.value)) {
    return null;
  }

  const totalRewards = supplierData.value.reduce((sum, d) => sum + (d.total_rewards_upokt || 0), 0);
  const totalRelays = supplierData.value.reduce((sum, d) => sum + (d.total_relays || 0), 0);
  const avgEfficiency = supplierData.value.reduce((sum, d) => sum + (d.avg_efficiency_percent || 0), 0) / supplierData.value.length;

  let comparisonRewards = 0;
  let comparisonRelays = 0;
  let comparisonEfficiency = 0;

  if (comparisonMode.value === 'network' && networkAverages.value) {
    comparisonRewards = networkAverages.value.avg_rewards * supplierData.value.length;
    comparisonRelays = networkAverages.value.avg_relays * supplierData.value.length;
    comparisonEfficiency = networkAverages.value.avg_efficiency;
  } else if (comparisonMode.value === 'top10' && topPerformers.value) {
    comparisonRewards = topPerformers.value.rewards_threshold * supplierData.value.length;
    comparisonRelays = topPerformers.value.relays_threshold * supplierData.value.length;
    comparisonEfficiency = topPerformers.value.top10Percent.length > 0
      ? topPerformers.value.top10Percent.reduce((sum, p) => sum + p.avg_efficiency_percent, 0) / topPerformers.value.top10Percent.length
      : 0;
  }

  return {
    rewards: comparisonRewards > 0 ? ((totalRewards - comparisonRewards) / comparisonRewards) * 100 : 0,
    relays: comparisonRelays > 0 ? ((totalRelays - comparisonRelays) / comparisonRelays) * 100 : 0,
    efficiency: comparisonEfficiency > 0 ? ((avgEfficiency - comparisonEfficiency) / comparisonEfficiency) * 100 : 0,
  };
});

watch(() => [props.filters, props.startDate, props.endDate], () => {
  loadSupplierData();
  loadComparisonData();
}, { deep: true });

onMounted(() => {
  loadSupplierData();
  loadComparisonData();
});
</script>

<template>
  <div>
    <div v-if="loading" class="flex justify-center items-center py-8">
      <div class="loading loading-spinner loading-lg"></div>
      <span class="ml-2">Loading comparison data...</span>
    </div>

    <div v-else-if="!props.filters?.supplier_address && !props.filters?.owner_address" class="dark:bg-base-100 bg-base-200 rounded-xl p-8 text-center">
      <Icon icon="mdi:chart-line" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">Select a supplier or validator to view comparisons</p>
    </div>

    <div v-else-if="supplierData.length === 0" class="dark:bg-base-100 bg-base-200 rounded-xl p-8 text-center">
      <Icon icon="mdi:chart-line" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">No data available for selected supplier</p>
    </div>

    <div v-else class="space-y-4">
      <!-- Comparison Mode Toggle -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Performance Comparison</h3>
        <div class="tabs tabs-boxed">
          <button
            @click="comparisonMode = 'network'"
            :class="['tab', comparisonMode === 'network' ? 'tab-active' : '']"
          >
            vs Network Average
          </button>
          <button
            @click="comparisonMode = 'top10'"
            :class="['tab', comparisonMode === 'top10' ? 'tab-active' : '']"
          >
            vs Top 10%
          </button>
        </div>
      </div>

      <!-- Percentage Difference Cards -->
      <div v-if="percentageDifferences" class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div class="dark:bg-base-100 bg-base-200 rounded-lg p-3">
          <div class="text-xs text-secondary mb-1">Rewards</div>
          <div class="text-lg font-bold" :class="percentageDifferences.rewards >= 0 ? 'text-success' : 'text-error'">
            {{ percentageDifferences.rewards >= 0 ? '+' : '' }}{{ percentageDifferences.rewards.toFixed(2) }}%
          </div>
          <div class="text-xs text-secondary mt-1">vs {{ comparisonMode === 'network' ? 'Network' : 'Top 10%' }}</div>
        </div>
        <div class="dark:bg-base-100 bg-base-200 rounded-lg p-3">
          <div class="text-xs text-secondary mb-1">Relays</div>
          <div class="text-lg font-bold" :class="percentageDifferences.relays >= 0 ? 'text-success' : 'text-error'">
            {{ percentageDifferences.relays >= 0 ? '+' : '' }}{{ percentageDifferences.relays.toFixed(2) }}%
          </div>
          <div class="text-xs text-secondary mt-1">vs {{ comparisonMode === 'network' ? 'Network' : 'Top 10%' }}</div>
        </div>
        <div class="dark:bg-base-100 bg-base-200 rounded-lg p-3">
          <div class="text-xs text-secondary mb-1">Efficiency</div>
          <div class="text-lg font-bold" :class="percentageDifferences.efficiency >= 0 ? 'text-success' : 'text-error'">
            {{ percentageDifferences.efficiency >= 0 ? '+' : '' }}{{ percentageDifferences.efficiency.toFixed(2) }}%
          </div>
          <div class="text-xs text-secondary mt-1">vs {{ comparisonMode === 'network' ? 'Network' : 'Top 10%' }}</div>
        </div>
      </div>

      <!-- Comparison Chart -->
      <div class="dark:bg-base-100 bg-base-200 rounded-lg p-4">
        <div class="text-sm font-semibold mb-3">Rewards Over Time</div>
        <ApexCharts
          v-if="comparisonChartSeries.length > 0"
          type="line"
          height="350"
          :options="comparisonChartOptions"
          :series="comparisonChartSeries"
        />
        <div v-else class="flex justify-center items-center h-64 text-gray-500">
          No comparison data available
        </div>
      </div>

      <!-- Service Distribution -->
      <div v-if="serviceChartCategories.length > 0" class="dark:bg-base-100 bg-base-200 rounded-lg p-4">
        <div class="text-sm font-semibold mb-3">Service Distribution</div>
        <ApexCharts
          type="donut"
          height="300"
          :options="serviceChartOptions"
          :series="serviceChartSeries"
        />
      </div>
    </div>
  </div>
</template>

