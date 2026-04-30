<script lang="ts" setup>
import { ref, onMounted, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import ApexCharts from 'vue3-apexcharts';
import { useBlockchain, useFormatter } from '@/stores';
import TablePagination from '@/components/TablePagination.vue';

const props = defineProps<{
  chain?: string;
  filters?: {
    supplier_address?: string;
    owner_address?: string;
  };
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

function shouldUsePost(params: URLSearchParams): boolean {
  const supplierFilter = props.filters?.supplier_address;
  if (!supplierFilter) return false;
  if (supplierFilter.includes(',')) return true;
  return `?${params.toString()}`.length > 2000;
}

async function fetchApi(url: string, params: URLSearchParams): Promise<any> {
  const isRewardsEndpoint = url.includes('/claims/rewards');
  const isSummaryEndpoint = url.includes('/claims/summary');
  const hasSupplierAddress = params.has('supplier_address');
  const shouldPost = shouldUsePost(params) ||
    ((isRewardsEndpoint || isSummaryEndpoint) && hasSupplierAddress);

  if (shouldPost) {
    const postBody: any = {};
    params.forEach((value, key) => {
      if ((isRewardsEndpoint || isSummaryEndpoint) && key === 'supplier_address') {
        const trimmed = value.trim();
        if (trimmed.includes(',')) {
          const addresses = trimmed.split(',').map((a: string) => a.trim()).filter((a: string) => a.length > 0);
          if (addresses.length > 0) postBody.supplier_addresses = addresses;
        } else if (trimmed.length > 0) {
          postBody.supplier_address = trimmed;
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
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }
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

// ---- State ----

// Paginated table — changes with page/sort/limit
const serviceRewardsLoading = ref(false);
const serviceRewards = ref<RewardAnalytics[]>([]);
const serviceRewardsMeta = ref<ApiMeta | null>(null);
const serviceRewardsPage = ref(1);
const serviceRewardsLimit = ref(10);
const serviceRewardsDays = ref(7);
const serviceRewardsSortBy = ref<'rewards' | 'relays' | 'efficiency' | 'submissions' | 'reward_per_relay'>('rewards');
const serviceRewardsSortOrder = ref<'asc' | 'desc'>('desc');

// Top-performers dataset — isolated from pagination, fetched at limit=200
const topServicesAll = ref<RewardAnalytics[]>([]);
const topServicesAllLoading = ref(false);

// KPI summary
const summaryStats = ref<SummaryStats | null>(null);
const summaryLoading = ref(false);

// Chart data (derived from topServicesAll, not from the paginated table)
const rewardsDistributionChart = ref({ series: [] as number[], labels: [] as string[] });
const computeUnitsChart = ref({ claimed: [] as number[], estimated: [] as number[], labels: [] as string[] });

// ---- Chart options ----

const donutChartOptions = computed(() => ({
  chart: { type: 'donut', height: 420, toolbar: { show: false } },
  colors: [
    '#A3E635', '#5E9AE4', '#FFB206', '#EF4444', '#8B5CF6',
    '#EC4899', '#10B981', '#F97316', '#06B6D4', '#F59E0B',
    '#6366F1', '#84CC16'
  ],
  labels: rewardsDistributionChart.value.labels,
  dataLabels: {
    enabled: true,
    formatter: (val: number) => val.toFixed(1) + '%',
    style: { fontSize: '11px', fontWeight: 600 },
    dropShadow: { enabled: false }
  },
  legend: {
    position: 'right' as const,
    fontSize: '12px',
    offsetY: 0,
    itemMargin: { vertical: 5, horizontal: 8 },
    labels: { colors: 'rgb(116, 109, 105)' },
    formatter: (seriesName: string, opts: any) => {
      const val = opts.w.globals.series[opts.seriesIndex] || 0;
      return `${seriesName}: ${val.toFixed(2)} POKT`;
    }
  },
  plotOptions: {
    pie: {
      donut: {
        size: '62%',
        labels: {
          show: true,
          name: { show: true, fontSize: '13px', color: 'rgb(116, 109, 105)' },
          value: {
            show: true,
            fontSize: '20px',
            fontWeight: 'bold',
            color: 'rgb(116, 109, 105)',
            formatter: (val: number) => val.toFixed(2) + ' POKT'
          },
          total: {
            show: true,
            label: 'Total Rewards',
            color: 'rgb(116, 109, 105)',
            formatter: () => {
              const total = rewardsDistributionChart.value.series.reduce((a, b) => a + b, 0);
              return total.toFixed(2) + ' POKT';
            }
          }
        }
      }
    }
  },
  stroke: { width: 2, colors: ['transparent'] },
  tooltip: {
    theme: 'dark',
    y: { formatter: (val: number) => val.toFixed(4) + ' POKT' }
  },
  responsive: [
    {
      breakpoint: 768,
      options: {
        chart: { height: 350 },
        legend: { position: 'bottom', offsetY: 0 }
      }
    }
  ]
}));

const computeUnitsChartOptions = computed(() => ({
  chart: { type: 'bar', height: 420, toolbar: { show: false }, stacked: false },
  colors: ['#60A5FA', '#F59E0B'],
  dataLabels: { enabled: false },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
  grid: { borderColor: 'rgba(255, 255, 255, 0.1)' },
  xaxis: {
    categories: computeUnitsChart.value.labels,
    labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45 }
  },
  yaxis: {
    labels: {
      style: { colors: 'rgb(116, 109, 105)' },
      formatter: (v: number) => {
        if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B';
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
        if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
        return v.toFixed(0);
      }
    }
  },
  tooltip: { theme: 'dark' },
  legend: { position: 'top', labels: { colors: 'rgb(116, 109, 105)' } }
}));

// ---- Data loading ----

async function loadSummaryStats() {
  summaryLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    const supplierFilter = props.filters?.supplier_address;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    params.append('days', serviceRewardsDays.value.toString());
    const data = await fetchApi('/api/v1/claims/summary', params);
    summaryStats.value = data.data;
  } catch (error: any) {
    console.error('Error loading summary stats:', error);
  } finally {
    summaryLoading.value = false;
  }
}

// Fetches ALL services (up to 200) for top-performer cards and charts.
// Never triggered by pagination — cards stay stable while table pages.
async function loadTopServicesAll() {
  topServicesAllLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    const supplierFilter = props.filters?.supplier_address;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    params.append('days', serviceRewardsDays.value.toString());
    params.append('limit', '200');
    params.append('page', '1');
    params.append('sort_by', 'rewards');
    params.append('sort_order', 'desc');

    const data = await fetchApi('/api/v1/claims/rewards', params);
    topServicesAll.value = data.data || [];
    buildCharts();
  } catch (error: any) {
    console.error('Error loading top services:', error);
    topServicesAll.value = [];
  } finally {
    topServicesAllLoading.value = false;
  }
}

async function loadServiceRewards() {
  serviceRewardsLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    const supplierFilter = props.filters?.supplier_address;
    if (supplierFilter) params.append('supplier_address', supplierFilter);
    if (props.filters?.owner_address) params.append('owner_address', props.filters.owner_address);
    params.append('days', serviceRewardsDays.value.toString());
    params.append('limit', serviceRewardsLimit.value.toString());
    params.append('page', serviceRewardsPage.value.toString());
    params.append('sort_by', serviceRewardsSortBy.value);
    params.append('sort_order', serviceRewardsSortOrder.value);

    const data = await fetchApi('/api/v1/claims/rewards', params);
    serviceRewards.value = data.data || [];
    serviceRewardsMeta.value = data.meta || null;
  } catch (error: any) {
    console.error('Error loading service rewards:', error);
    serviceRewards.value = [];
    serviceRewardsMeta.value = null;
  } finally {
    serviceRewardsLoading.value = false;
  }
}

// Builds chart series from top-20 of topServicesAll (already sorted by rewards)
function buildCharts() {
  if (topServicesAll.value.length === 0) {
    rewardsDistributionChart.value = { series: [], labels: [] };
    computeUnitsChart.value = { claimed: [], estimated: [], labels: [] };
    return;
  }

  const top20 = topServicesAll.value.slice(0, 20);

  rewardsDistributionChart.value = {
    series: top20.map(s => parseInt(s.total_rewards_upokt || '0') / 1_000_000),
    labels: top20.map(s => s.service_id || 'unknown')
  };

  computeUnitsChart.value = {
    claimed: top20.map(s => parseInt(s.total_claimed_compute_units || '0')),
    estimated: top20.map(s => parseInt(s.total_estimated_compute_units || '0')),
    labels: top20.map(s => s.service_id || 'unknown')
  };
}

// ---- Computed top-performer lists ----
// topServicesAll is fetched sorted by rewards DESC — use it directly for top-by-rewards.
// The other two need client-side re-sort since we only fetch one ordering from the server.

const topServicesByRewards = computed(() => topServicesAll.value);

const topServicesByRelays = computed(() =>
  [...topServicesAll.value].sort((a, b) =>
    parseInt(b.total_relays || '0') - parseInt(a.total_relays || '0')
  )
);

const topServicesByEfficiency = computed(() =>
  [...topServicesAll.value]
    .filter(s => parseFloat(s.avg_efficiency_percent || '0') > 0)
    .sort((a, b) =>
      parseFloat(b.avg_efficiency_percent || '0') - parseFloat(a.avg_efficiency_percent || '0')
    )
);

// ---- Watchers ----

// Page change → table only (top cards stay stable)
watch(serviceRewardsPage, () => { loadServiceRewards(); });

// Limit change → reset to page 1 and reload table
watch(serviceRewardsLimit, () => {
  serviceRewardsPage.value = 1;
  loadServiceRewards();
});

// Days change → reset page, reload everything
watch(serviceRewardsDays, () => {
  serviceRewardsPage.value = 1;
  loadSummaryStats();
  loadTopServicesAll();
  loadServiceRewards();
});

// Sort change → table only
watch([serviceRewardsSortBy, serviceRewardsSortOrder], () => {
  serviceRewardsPage.value = 1;
  loadServiceRewards();
});

// Filter change (owner/supplier from parent) → reload everything
watch(() => props.filters, () => {
  serviceRewardsPage.value = 1;
  loadSummaryStats();
  loadTopServicesAll();
  loadServiceRewards();
}, { deep: true });

// ---- Helpers ----

function formatInt(val: string | number | null | undefined): string {
  const n = typeof val === 'number' ? val : parseInt(String(val || '0'), 10);
  return new Intl.NumberFormat().format(isNaN(n) ? 0 : n);
}

function efficiencyClass(pct: string | number | undefined): string {
  const v = parseFloat(String(pct || '0'));
  return v >= 95 ? 'text-success' : v >= 80 ? 'text-warning' : 'text-error';
}

function rankClass(idx: number): string {
  return idx === 0 ? 'badge-primary' : idx === 1 ? 'badge-secondary' : idx === 2 ? 'badge-accent' : 'badge-ghost';
}

onMounted(() => {
  loadSummaryStats();
  loadTopServicesAll();
  loadServiceRewards();
});
</script>

<template>
  <div class="pt-[2.5rem]">

    <!-- Initial loading -->
    <div v-if="serviceRewardsLoading && serviceRewards.length === 0 && topServicesAll.length === 0"
      class="flex justify-center items-center py-8 mb-[10vh]">
      <div class="loading loading-spinner loading-lg"></div>
      <span class="ml-2 text-secondary">Loading service rewards analytics...</span>
    </div>

    <!-- Empty state -->
    <div v-if="!serviceRewardsLoading && serviceRewards.length === 0 && topServicesAll.length === 0"
      class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 rounded-xl p-8 text-center mb-5">
      <Icon icon="mdi:chart-line" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">No service rewards data available</p>
      <p class="text-xs text-secondary mt-2">Data is aggregated by service for the selected time window</p>
    </div>

    <!-- KPI Summary Cards -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-secondary font-medium">Summary — Last {{ serviceRewardsDays }} days</span>
      </div>

      <!-- Skeleton while loading (initial load AND on days/filter change) -->
      <div v-if="summaryLoading" class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <div v-for="i in 8" :key="i"
          class="flex flex-col min-w-0 bg-base-200 dark:bg-[rgba(255,255,255,.03)] p-2 rounded-xl border dark:border-white/10 animate-pulse h-[52px]">
        </div>
      </div>

      <div v-else-if="summaryStats" class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <div v-for="(item, i) in [
          { label: 'Submissions',   value: formatInt(summaryStats.total_submissions) },
          { label: 'Suppliers',     value: formatInt(summaryStats.unique_suppliers) },
          { label: 'Applications',  value: formatInt(summaryStats.unique_applications) },
          { label: 'Services',      value: formatInt(summaryStats.unique_services) },
          { label: 'Total Relays',  value: formatInt(summaryStats.total_relays) },
          { label: 'Avg Efficiency',value: (parseFloat(summaryStats.avg_efficiency_percent || '0')).toFixed(2) + '%' },
          { label: 'Compute Units', value: formatInt(summaryStats.total_claimed_compute_units) },
        ]" :key="i"
          class="flex flex-col min-w-0 bg-white dark:bg-[rgba(255,255,255,.03)] p-2 rounded-xl hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] shadow-md border dark:border-white/10 hover:shadow-lg transition-shadow">
          <div class="text-xs text-secondary mb-1">{{ item.label }}</div>
          <div class="text-sm font-bold truncate">{{ item.value }}</div>
        </div>
        <div class="flex flex-col min-w-0 bg-white dark:bg-[rgba(255,255,255,.03)] p-2 rounded-xl hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] shadow-md border dark:border-white/10 hover:shadow-lg transition-shadow">
          <div class="text-xs text-secondary mb-1">Total Rewards</div>
          <div class="text-sm font-bold truncate">
            {{ format.formatToken({ denom: 'upokt', amount: String(summaryStats.total_rewards_upokt || '0') }) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Dashboard content -->
    <div v-if="topServicesAll.length > 0 || serviceRewards.length > 0" class="space-y-4 mb-4">

      <!-- Controls bar -->
      <div class="main-dashboard">
        <h2 class="text-xl font-bold">Service Performance Dashboard</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-secondary">Days:</span>
          <select v-model="serviceRewardsDays"
            class="select select-bordered select-sm text-xs hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
            <option :value="7">7</option>
            <option :value="15">15</option>
            <option :value="30">30</option>
            <option :value="60">60</option>
            <option :value="90">90</option>
          </select>
        </div>
      </div>

      <!-- Top Performer Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

        <!-- Top by Rewards -->
        <div class="flex flex-col bg-white dark:bg-[rgba(255,255,255,.03)] p-4 rounded-xl shadow-md border dark:border-white/10 hover:shadow-lg hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] transition-shadow">
          <div class="flex items-center gap-2 mb-3 flex-shrink-0">
            <Icon icon="mdi:trophy" class="text-warning text-lg" />
            <h3 class="text-sm font-semibold">Top by Rewards</h3>
          </div>
          <div v-if="topServicesAllLoading" class="flex justify-center items-center h-[260px]">
            <div class="loading loading-spinner loading-sm"></div>
          </div>
          <div v-else-if="topServicesByRewards.length === 0"
            class="flex justify-center items-center h-[260px] text-secondary text-xs">No data</div>
          <div v-else class="overflow-y-auto space-y-1.5 pr-1 card-scroll-list">
            <div v-for="(service, idx) in topServicesByRewards" :key="service.service_id + service.chain"
              class="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-base-300 dark:hover:bg-white/5 transition-colors">
              <div class="flex items-center gap-2 min-w-0">
                <span class="badge badge-sm flex-shrink-0 font-mono" :class="rankClass(idx)">#{{ idx + 1 }}</span>
                <span class="font-medium truncate">{{ service.service_id }}</span>
              </div>
              <span class="text-secondary ml-2 flex-shrink-0">
                {{ format.formatToken({ denom: 'upokt', amount: String(service.total_rewards_upokt || '0') }) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Top by Relays -->
        <div class="flex flex-col bg-white dark:bg-[rgba(255,255,255,.03)] p-4 rounded-xl shadow-md border dark:border-white/10 hover:shadow-lg hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] transition-shadow">
          <div class="flex items-center gap-2 mb-3 flex-shrink-0">
            <Icon icon="mdi:network" class="text-info text-lg" />
            <h3 class="text-sm font-semibold">Top by Relays</h3>
          </div>
          <div v-if="topServicesAllLoading" class="flex justify-center items-center h-[260px]">
            <div class="loading loading-spinner loading-sm"></div>
          </div>
          <div v-else-if="topServicesByRelays.length === 0"
            class="flex justify-center items-center h-[260px] text-secondary text-xs">No data</div>
          <div v-else class="overflow-y-auto space-y-1.5 pr-1 card-scroll-list">
            <div v-for="(service, idx) in topServicesByRelays" :key="service.service_id + service.chain"
              class="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-base-300 dark:hover:bg-white/5 transition-colors">
              <div class="flex items-center gap-2 min-w-0">
                <span class="badge badge-sm flex-shrink-0 font-mono" :class="rankClass(idx)">#{{ idx + 1 }}</span>
                <span class="font-medium truncate">{{ service.service_id }}</span>
              </div>
              <span class="text-secondary ml-2 flex-shrink-0">{{ formatInt(service.total_relays) }}</span>
            </div>
          </div>
        </div>

        <!-- Top by Efficiency -->
        <div class="flex flex-col bg-white dark:bg-[rgba(255,255,255,.03)] p-4 rounded-xl shadow-md border dark:border-white/10 hover:shadow-lg hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] transition-shadow">
          <div class="flex items-center gap-2 mb-3 flex-shrink-0">
            <Icon icon="mdi:gauge" class="text-success text-lg" />
            <h3 class="text-sm font-semibold">Top by Efficiency</h3>
          </div>
          <div v-if="topServicesAllLoading" class="flex justify-center items-center h-[260px]">
            <div class="loading loading-spinner loading-sm"></div>
          </div>
          <div v-else-if="topServicesByEfficiency.length === 0"
            class="flex justify-center items-center h-[260px] text-secondary text-xs">No data</div>
          <div v-else class="overflow-y-auto space-y-1.5 pr-1 card-scroll-list">
            <div v-for="(service, idx) in topServicesByEfficiency" :key="service.service_id + service.chain"
              class="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-base-300 dark:hover:bg-white/5 transition-colors">
              <div class="flex items-center gap-2 min-w-0">
                <span class="badge badge-sm flex-shrink-0 font-mono" :class="rankClass(idx)">#{{ idx + 1 }}</span>
                <span class="font-medium truncate">{{ service.service_id }}</span>
              </div>
              <span class="font-semibold ml-2 flex-shrink-0" :class="efficiencyClass(service.avg_efficiency_percent)">
                {{ parseFloat(service.avg_efficiency_percent || '0').toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>

      </div>

      <!-- Charts row: Donut (50%) + Compute Units bar (50%) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Rewards Share Donut -->
        <div class="flex flex-col bg-white dark:bg-[rgba(255,255,255,.03)] p-4 rounded-xl shadow-md border dark:border-white/10 hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] hover:shadow-lg transition-shadow">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-sm font-semibold">Rewards Share Distribution</h3>
            <span class="text-xs text-secondary">Top 20 · Last {{ serviceRewardsDays }}d</span>
          </div>
          <div v-if="rewardsDistributionChart.series.length === 0"
            class="flex items-center justify-center h-[420px] text-secondary text-sm">No data</div>
          <ApexCharts v-else type="donut" height="420"
            :options="donutChartOptions" :series="rewardsDistributionChart.series" />
        </div>

        <!-- Compute Units: Claimed vs Estimated -->
        <div class="flex flex-col bg-white dark:bg-[rgba(255,255,255,.03)] p-4 rounded-xl shadow-md border dark:border-white/10 hover:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] hover:shadow-lg transition-shadow">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-sm font-semibold">Compute Units</h3>
            <span class="text-xs text-secondary">Top 20 · Last {{ serviceRewardsDays }}d</span>
          </div>
          <div v-if="computeUnitsChart.labels.length === 0"
            class="flex items-center justify-center h-[420px] text-secondary text-sm">No data</div>
          <ApexCharts v-else type="bar" height="420"
            :options="computeUnitsChartOptions"
            :series="[
              { name: 'Claimed', data: computeUnitsChart.claimed },
              { name: 'Estimated', data: computeUnitsChart.estimated }
            ]" />
        </div>

      </div>

      <!-- Service Rewards Details Table -->
      <div class="flex flex-col bg-white dark:bg-[rgba(255,255,255,.03)] hover:bg-base-200 p-4 mb-4 rounded-xl shadow-md border dark:border-white/10 hover:shadow-lg transition-shadow">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Service Rewards Details</h3>
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-secondary">Sort:</span>
            <select v-model="serviceRewardsSortBy"
              class="select select-bordered select-sm text-xs dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] bg-base-200 hover:bg-base-300">
              <option value="rewards">Rewards</option>
              <option value="relays">Relays</option>
              <option value="efficiency">Efficiency</option>
              <option value="submissions">Submissions</option>
              <option value="reward_per_relay">Reward/Relay</option>
            </select>
            <button @click="serviceRewardsSortOrder = serviceRewardsSortOrder === 'asc' ? 'desc' : 'asc'"
              class="btn btn-sm btn-ghost">
              <Icon :icon="serviceRewardsSortOrder === 'asc' ? 'mdi:sort-ascending' : 'mdi:sort-descending'" />
            </button>
          </div>
        </div>

        <div class="overflow-y-auto rounded-md" style="max-height: 480px;">
          <table class="table w-full table-compact">
            <thead class="sticky top-0 z-10">
              <tr class="bg-base-200 dark:bg-[rgba(255,255,255,.03)] border-b-0 text-sm font-semibold">
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
                  <div class="flex justify-center items-center gap-2">
                    <div class="loading loading-spinner loading-md"></div>
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
              <tr v-else-if="serviceRewards.length === 0" class="text-center">
                <td colspan="12" class="py-8 text-secondary">No services found</td>
              </tr>
              <tr v-for="(service, index) in serviceRewards" :key="service.service_id + service.chain"
                class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0">
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-sm" :class="rankClass(index)">
                    #{{ (serviceRewardsPage - 1) * serviceRewardsLimit + index + 1 }}
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white">
                  <span class="badge badge-primary">{{ service.service_id || '-' }}</span>
                </td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ service.chain || '-' }}</td>
                <td class="dark:bg-base-200 bg-white font-medium">
                  {{ format.formatToken({ denom: 'upokt', amount: String(service.total_rewards_upokt || '0') }) }}
                </td>
                <td class="dark:bg-base-200 bg-white">{{ formatInt(service.total_relays) }}</td>
                <td class="dark:bg-base-200 bg-white">{{ formatInt(service.total_submissions) }}</td>
                <td class="dark:bg-base-200 bg-white">
                  <span :class="efficiencyClass(service.avg_efficiency_percent)" class="font-medium">
                    {{ parseFloat(service.avg_efficiency_percent || '0').toFixed(2) }}%
                  </span>
                </td>
                <td class="dark:bg-base-200 bg-white">
                  {{ format.formatToken({ denom: 'upokt', amount: String(service.avg_reward_per_relay || '0') }) }}
                </td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ formatInt(service.total_claimed_compute_units) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">{{ formatInt(service.total_estimated_compute_units) }}</td>
                <td class="dark:bg-base-200 bg-white text-xs">
                  {{ format.formatToken({ denom: 'upokt', amount: String(service.max_reward_per_submission || '0') }) }}
                </td>
                <td class="dark:bg-base-200 bg-white text-xs">
                  {{ format.formatToken({ denom: 'upokt', amount: String(service.min_reward_per_submission || '0') }) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <TablePagination
          v-if="serviceRewardsMeta"
          :current-page="serviceRewardsPage"
          :total-pages="serviceRewardsMeta.totalPages"
          :total-items="serviceRewardsMeta.total"
          :items-per-page="serviceRewardsLimit"
          item-label="services"
          :page-size-options="[10, 25, 50, 100]"
          @update:current-page="(p) => { serviceRewardsPage = p; }"
          @update:items-per-page="(s) => { serviceRewardsLimit = s; serviceRewardsPage = 1; }"
        />
      </div>

    </div>
  </div>
</template>

<style scoped>
@media (max-width: 767px) {
  .table { font-size: 0.75rem; }
  th, td { padding: 0.5rem; }
}

/* Fixed-height scrollable list inside top-performer cards (~10 visible rows) */
.card-scroll-list {
  max-height: 280px;
  scrollbar-width: thin;
  scrollbar-color: rgba(160, 160, 160, 0.4) transparent;
}

.card-scroll-list::-webkit-scrollbar { width: 4px; }
.card-scroll-list::-webkit-scrollbar-track { background: transparent; }
.card-scroll-list::-webkit-scrollbar-thumb {
  background-color: rgba(160, 160, 160, 0.4);
  border-radius: 4px;
}

.main-dashboard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
  margin-bottom: 1rem;
}

@media (min-width: 768px) {
  .main-dashboard {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
