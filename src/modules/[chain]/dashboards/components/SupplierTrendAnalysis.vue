<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import ApexCharts from 'vue3-apexcharts';
import { Icon } from '@iconify/vue';
import {
  calculateTrends,
  generatePredictions,
  detectAnomalies,
  calculateGrowthRates,
  type RewardAnalytics,
  type TrendData,
  type Prediction,
  type Anomaly,
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
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

const apiChainName = computed(() => getApiChainName(props.chain || 'pocket-beta'));

const loading = ref(false);
const supplierData = ref<RewardAnalytics[]>([]);
const trendData = ref<TrendData | null>(null);
const predictions24h = ref<Prediction[]>([]);
const predictions7d = ref<Prediction[]>([]);
const anomalies = ref<Anomaly[]>([]);
const growthRates = ref({ dayOverDay: 0, weekOverWeek: 0, monthOverMonth: 0 });
const predictionMode = ref<'24h' | '7d'>('24h');

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

  loading.value = true;
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
    
    // Calculate trends and predictions
    if (supplierData.value.length > 0) {
      trendData.value = calculateTrends(supplierData.value, true);
      predictions24h.value = generatePredictions(trendData.value, 24);
      predictions7d.value = generatePredictions(trendData.value, 7 * 24); // 7 days in hours
      anomalies.value = detectAnomalies(trendData.value);
      growthRates.value = calculateGrowthRates(trendData.value);
    } else {
      trendData.value = null;
      predictions24h.value = [];
      predictions7d.value = [];
      anomalies.value = [];
    }
  } catch (error) {
    console.error('Error loading supplier data:', error);
    supplierData.value = [];
  } finally {
    loading.value = false;
  }
}

// Chart data combining historical and predictions
const trendChartSeries = computed(() => {
  if (!trendData.value) return [];

  const historicalDates = trendData.value.dates.map(d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }));
  const predictions = predictionMode.value === '24h' ? predictions24h.value : predictions7d.value;
  const predictionDates = predictions.map(p => new Date(p.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }));

  const allDates = [...historicalDates, ...predictionDates];
  const historicalRewards = [...trendData.value.rewards];
  const predictedRewards = predictions.map(p => p.predicted_rewards);
  const confidenceLower = predictions.map(p => p.confidence_lower);
  const confidenceUpper = predictions.map(p => p.confidence_upper);

  return [
    {
      name: 'Historical Rewards',
      type: 'line',
      data: [...historicalRewards, ...Array(predictions.length).fill(null)],
    },
    {
      name: 'Predicted Rewards',
      type: 'line',
      data: [...Array(historicalRewards.length).fill(null), ...predictedRewards],
    },
    {
      name: 'Confidence Lower',
      type: 'area',
      data: [...Array(historicalRewards.length).fill(null), ...confidenceLower],
      fill: { opacity: 0.1 },
    },
    {
      name: 'Confidence Upper',
      type: 'area',
      data: [...Array(historicalRewards.length).fill(null), ...confidenceUpper],
      fill: { opacity: 0.1 },
    },
    {
      name: 'Moving Average (7d)',
      type: 'line',
      data: [...trendData.value.movingAvg7d, ...Array(predictions.length).fill(null)],
    },
  ];
});

const trendChartOptions = computed(() => ({
  chart: {
    type: 'line',
    height: 400,
    toolbar: { show: false },
    zoom: { enabled: false },
  },
  colors: ['#A3E635', '#5E9AE4', '#FF6B6B', '#FF6B6B', '#FFD93D'],
  stroke: { 
    curve: 'smooth', 
    width: [2, 2, 0, 0, 1],
    dashArray: [0, 0, 0, 0, 5],
  },
  dataLabels: { enabled: false },
  fill: {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.3,
      opacityTo: 0.1,
      stops: [0, 90, 100],
    },
  },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: {
    categories: trendChartSeries.value.length > 0
      ? (() => {
          const historicalDates = trendData.value!.dates.map(d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }));
          const predictions = predictionMode.value === '24h' ? predictions24h.value : predictions7d.value;
          const predictionDates = predictions.map(p => new Date(p.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' }));
          return [...historicalDates, ...predictionDates];
        })()
      : [],
    labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45, rotateAlways: false },
  },
  yaxis: {
    labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => (v / 1000000).toFixed(2) + 'M' },
  },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => v ? (v / 1000000).toFixed(4) + ' POKT' : '' } },
  legend: { position: 'top', horizontalAlign: 'right' },
  markers: {
    size: [4, 4, 0, 0, 0],
    hover: { size: 6 },
  },
}));

// Anomaly markers for chart
const anomalyMarkers = computed(() => {
  if (!trendData.value || anomalies.value.length === 0) return [];

  return anomalies.value.map(anomaly => {
    const index = trendData.value!.dates.findIndex(d => d === anomaly.date);
    if (index === -1) return null;
    return {
      x: index,
      y: trendData.value!.rewards[index],
      marker: {
        size: 8,
        fillColor: anomaly.type === 'spike' ? '#60BC29' : anomaly.type === 'drop' ? '#E03834' : '#FFD93D',
        strokeColor: '#fff',
        strokeWidth: 2,
        radius: 4,
      },
      label: {
        text: `${anomaly.type === 'spike' ? '↑' : anomaly.type === 'drop' ? '↓' : '⚠'} ${anomaly.deviation.toFixed(1)}%`,
        style: {
          color: anomaly.type === 'spike' ? '#60BC29' : anomaly.type === 'drop' ? '#E03834' : '#FFD93D',
        },
      },
    };
  }).filter(m => m !== null);
});

watch(() => [props.filters, props.startDate, props.endDate], () => {
  loadSupplierData();
}, { deep: true });

onMounted(() => {
  loadSupplierData();
});
</script>

<template>
  <div>
    <div v-if="loading" class="flex justify-center items-center py-8">
      <div class="loading loading-spinner loading-lg"></div>
      <span class="ml-2">Loading trend analysis...</span>
    </div>

    <div v-else-if="!props.filters?.supplier_address && !props.filters?.owner_address" class="dark:bg-base-100 bg-base-200 rounded-xl p-8 text-center">
      <Icon icon="mdi:chart-timeline" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">Select a supplier or validator to view trend analysis</p>
    </div>

    <div v-else-if="!trendData || trendData.rewards.length === 0" class="dark:bg-base-100 bg-base-200 rounded-xl p-8 text-center">
      <Icon icon="mdi:chart-timeline" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">Insufficient data for trend analysis</p>
    </div>

    <div v-else class="space-y-4">
      <!-- Prediction Mode Toggle -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Trend Analysis & Predictions</h3>
        <div class="tabs tabs-boxed">
          <button
            @click="predictionMode = '24h'"
            :class="['tab', predictionMode === '24h' ? 'tab-active' : '']"
          >
            Next 24 Hours
          </button>
          <button
            @click="predictionMode = '7d'"
            :class="['tab', predictionMode === '7d' ? 'tab-active' : '']"
          >
            Next 7 Days
          </button>
        </div>
      </div>

      <!-- Growth Rate Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div class="dark:bg-base-100 bg-base-200 rounded-lg p-3">
          <div class="text-xs text-secondary mb-1">Day-over-Day</div>
          <div class="text-lg font-bold" :class="growthRates.dayOverDay >= 0 ? 'text-success' : 'text-error'">
            {{ growthRates.dayOverDay >= 0 ? '+' : '' }}{{ growthRates.dayOverDay.toFixed(2) }}%
          </div>
        </div>
        <div class="dark:bg-base-100 bg-base-200 rounded-lg p-3">
          <div class="text-xs text-secondary mb-1">Week-over-Week</div>
          <div class="text-lg font-bold" :class="growthRates.weekOverWeek >= 0 ? 'text-success' : 'text-error'">
            {{ growthRates.weekOverWeek >= 0 ? '+' : '' }}{{ growthRates.weekOverWeek.toFixed(2) }}%
          </div>
        </div>
        <div class="dark:bg-base-100 bg-base-200 rounded-lg p-3">
          <div class="text-xs text-secondary mb-1">Month-over-Month</div>
          <div class="text-lg font-bold" :class="growthRates.monthOverMonth >= 0 ? 'text-success' : 'text-error'">
            {{ growthRates.monthOverMonth >= 0 ? '+' : '' }}{{ growthRates.monthOverMonth.toFixed(2) }}%
          </div>
        </div>
      </div>

      <!-- Trend Chart with Predictions -->
      <div class="dark:bg-base-100 bg-base-200 rounded-lg p-4">
        <div class="text-sm font-semibold mb-3">
          Rewards Trend & {{ predictionMode === '24h' ? '24-Hour' : '7-Day' }} Forecast
        </div>
        <ApexCharts
          type="line"
          height="400"
          :options="trendChartOptions"
          :series="trendChartSeries"
        />
      </div>

      <!-- Prediction Summary -->
      <div v-if="(predictionMode === '24h' ? predictions24h : predictions7d).length > 0" class="dark:bg-base-100 bg-base-200 rounded-lg p-4">
        <div class="text-sm font-semibold mb-3">Prediction Summary</div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="p-3 bg-base-200 dark:bg-base-300 rounded">
            <div class="text-xs text-secondary mb-1">Predicted Total Rewards</div>
            <div class="text-lg font-bold">
              {{ ((predictionMode === '24h' ? predictions24h : predictions7d).reduce((sum, p) => sum + p.predicted_rewards, 0) / 1000000).toFixed(4) }} POKT
            </div>
          </div>
          <div class="p-3 bg-base-200 dark:bg-base-300 rounded">
            <div class="text-xs text-secondary mb-1">Predicted Total Relays</div>
            <div class="text-lg font-bold">
              {{ ((predictionMode === '24h' ? predictions24h : predictions7d).reduce((sum, p) => sum + p.predicted_relays, 0)).toLocaleString() }}
            </div>
          </div>
          <div class="p-3 bg-base-200 dark:bg-base-300 rounded">
            <div class="text-xs text-secondary mb-1">Avg Predicted Efficiency</div>
            <div class="text-lg font-bold">
              {{ ((predictionMode === '24h' ? predictions24h : predictions7d).reduce((sum, p) => sum + p.predicted_efficiency, 0) / (predictionMode === '24h' ? predictions24h : predictions7d).length).toFixed(2) }}%
            </div>
          </div>
        </div>
      </div>

      <!-- Anomalies Alert -->
      <div v-if="anomalies.length > 0" class="dark:bg-base-100 bg-base-200 rounded-lg p-4">
        <div class="flex items-center gap-2 mb-3">
          <Icon icon="mdi:alert" class="text-warning text-xl" />
          <div class="text-sm font-semibold">Detected Anomalies ({{ anomalies.length }})</div>
        </div>
        <div class="space-y-2">
          <div
            v-for="(anomaly, index) in anomalies.slice(0, 5)"
            :key="index"
            class="p-2 bg-base-200 dark:bg-base-300 rounded text-xs"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium">{{ new Date(anomaly.date).toLocaleString() }}</span>
              <span
                :class="[
                  'badge badge-sm',
                  anomaly.type === 'spike' ? 'badge-success' : anomaly.type === 'drop' ? 'badge-error' : 'badge-warning'
                ]"
              >
                {{ anomaly.type === 'spike' ? 'Spike' : anomaly.type === 'drop' ? 'Drop' : 'Efficiency Issue' }}
              </span>
            </div>
            <div class="text-secondary mt-1">
              {{ anomaly.metric }}: {{ anomaly.deviation >= 0 ? '+' : '' }}{{ anomaly.deviation.toFixed(2) }}% from expected
            </div>
          </div>
          <div v-if="anomalies.length > 5" class="text-xs text-secondary text-center">
            +{{ anomalies.length - 5 }} more anomalies
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

