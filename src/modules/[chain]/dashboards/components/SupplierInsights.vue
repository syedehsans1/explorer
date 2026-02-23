<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  fetchNetworkAverages,
  fetchTopPerformers,
  calculateTrends,
  type RewardAnalytics,
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
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

const apiChainName = computed(() => getApiChainName(props.chain || 'pocket-beta'));

const loading = ref(false);
const supplierData = ref<RewardAnalytics[]>([]);
const networkAverages = ref<NetworkAverages | null>(null);
const topPerformers = ref<TopPerformersThreshold | null>(null);

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

// Performance Insights
const performanceInsights = computed(() => {
  if (!supplierData.value.length) return [];

  const insights = [];

  // Peak performance hours
  const hourlyData: Record<number, number> = {};
  supplierData.value.forEach(d => {
    const hour = new Date(d.hour_bucket).getHours();
    hourlyData[hour] = (hourlyData[hour] || 0) + (d.total_rewards_upokt || 0);
  });
  const peakHour = Object.entries(hourlyData).sort((a, b) => b[1] - a[1])[0];
  if (peakHour) {
    insights.push({
      type: 'positive',
      icon: 'mdi:clock-outline',
      title: 'Peak Performance Hour',
      description: `Best performance at ${peakHour[0]}:00 (${(Number(peakHour[1]) / 1000000).toFixed(4)} POKT)`,
    });
  }

  // Best performing service
  const serviceRewards: Record<string, number> = {};
  supplierData.value.forEach(d => {
    const service = d.service_id || 'unknown';
    serviceRewards[service] = (serviceRewards[service] || 0) + (d.total_rewards_upokt || 0);
  });
  const bestService = Object.entries(serviceRewards).sort((a, b) => b[1] - a[1])[0];
  if (bestService) {
    insights.push({
      type: 'positive',
      icon: 'mdi:star',
      title: 'Top Service',
      description: `${bestService[0]} generates ${((bestService[1] / supplierData.value.reduce((sum, d) => sum + (d.total_rewards_upokt || 0), 0)) * 100).toFixed(1)}% of rewards`,
    });
  }

  // Efficiency trend
  const sorted = [...supplierData.value].sort((a, b) => new Date(a.hour_bucket).getTime() - new Date(b.hour_bucket).getTime());
  if (sorted.length >= 2) {
    const recentEfficiency = sorted.slice(-10).reduce((sum, d) => sum + (d.avg_efficiency_percent || 0), 0) / Math.min(10, sorted.length);
    const olderEfficiency = sorted.slice(0, 10).reduce((sum, d) => sum + (d.avg_efficiency_percent || 0), 0) / Math.min(10, sorted.length);
    const efficiencyChange = recentEfficiency - olderEfficiency;
    
    insights.push({
      type: efficiencyChange >= 0 ? 'positive' : 'warning',
      icon: efficiencyChange >= 0 ? 'mdi:trending-up' : 'mdi:trending-down',
      title: 'Efficiency Trend',
      description: efficiencyChange >= 0 
        ? `Efficiency improved by ${efficiencyChange.toFixed(2)}%`
        : `Efficiency declined by ${Math.abs(efficiencyChange).toFixed(2)}%`,
    });
  }

  return insights;
});

// Opportunity Insights
const opportunityInsights = computed(() => {
  if (!supplierData.value.length || !networkAverages.value) return [];

  const insights = [];

  // Service diversification
  const uniqueServices = new Set(supplierData.value.map(d => d.service_id)).size;
  const totalServices = Object.keys(
    supplierData.value.reduce((acc: Record<string, boolean>, d) => {
      acc[d.service_id || 'unknown'] = true;
      return acc;
    }, {})
  ).length;

  if (uniqueServices < 3) {
    insights.push({
      type: 'info',
      icon: 'mdi:chart-pie',
      title: 'Diversification Opportunity',
      description: `Currently serving ${uniqueServices} service(s). Consider diversifying to reduce risk.`,
    });
  }

  // Underperforming services
  const serviceEfficiency: Record<string, { total: number; count: number }> = {};
  supplierData.value.forEach(d => {
    const service = d.service_id || 'unknown';
    if (!serviceEfficiency[service]) {
      serviceEfficiency[service] = { total: 0, count: 0 };
    }
    serviceEfficiency[service].total += d.avg_efficiency_percent || 0;
    serviceEfficiency[service].count += 1;
  });

  const underperformingServices = Object.entries(serviceEfficiency)
    .filter(([_, data]) => (data.total / data.count) < (networkAverages.value?.avg_efficiency || 0) - 5)
    .map(([service]) => service);

  if (underperformingServices.length > 0) {
    insights.push({
      type: 'warning',
      icon: 'mdi:alert-circle',
      title: 'Underperforming Services',
      description: `${underperformingServices.join(', ')} efficiency below network average`,
    });
  }

  return insights;
});

// Comparative Insights
const comparativeInsights = computed(() => {
  if (!supplierData.value.length || (!networkAverages.value && !topPerformers.value)) return [];

  const insights = [];
  const totalRewards = supplierData.value.reduce((sum, d) => sum + (d.total_rewards_upokt || 0), 0);
  const totalRelays = supplierData.value.reduce((sum, d) => sum + (d.total_relays || 0), 0);
  const avgEfficiency = supplierData.value.reduce((sum, d) => sum + (d.avg_efficiency_percent || 0), 0) / supplierData.value.length;

  // Network comparison
  if (networkAverages.value) {
    const rewardsDiff = ((totalRewards / supplierData.value.length) - networkAverages.value.avg_rewards) / networkAverages.value.avg_rewards * 100;
    const relaysDiff = ((totalRelays / supplierData.value.length) - networkAverages.value.avg_relays) / networkAverages.value.avg_relays * 100;
    const efficiencyDiff = avgEfficiency - networkAverages.value.avg_efficiency;

    if (rewardsDiff > 10) {
      insights.push({
        type: 'positive',
        icon: 'mdi:trophy',
        title: 'Above Network Average',
        description: `Rewards ${rewardsDiff.toFixed(1)}% higher than network average`,
      });
    } else if (rewardsDiff < -10) {
      insights.push({
        type: 'warning',
        icon: 'mdi:alert',
        title: 'Below Network Average',
        description: `Rewards ${Math.abs(rewardsDiff).toFixed(1)}% lower than network average`,
      });
    }

    if (efficiencyDiff > 2) {
      insights.push({
        type: 'positive',
        icon: 'mdi:check-circle',
        title: 'High Efficiency',
        description: `Efficiency ${efficiencyDiff.toFixed(2)}% above network average`,
      });
    } else if (efficiencyDiff < -2) {
      insights.push({
        type: 'warning',
        icon: 'mdi:alert-circle',
        title: 'Efficiency Gap',
        description: `Efficiency ${Math.abs(efficiencyDiff).toFixed(2)}% below network average`,
      });
    }
  }

  // Top 10% comparison
  if (topPerformers.value && topPerformers.value.rewards_threshold > 0) {
    const supplierAvgRelays = totalRelays / supplierData.value.length;
    const isTop10 = supplierAvgRelays >= topPerformers.value.rewards_threshold * 0.9; // 90% of threshold

    if (isTop10) {
      insights.push({
        type: 'positive',
        icon: 'mdi:medal',
        title: 'Top 10% Performer',
        description: 'Performance ranks in top 10% of all suppliers',
      });
    } else {
      const gap = ((topPerformers.value.rewards_threshold - supplierAvgRelays) / topPerformers.value.rewards_threshold) * 100;
      insights.push({
        type: 'info',
        icon: 'mdi:target',
        title: 'Top 10% Potential',
        description: `${gap.toFixed(1)}% away from top 10% performance threshold`,
      });
    }
  }

  return insights;
});

// Combine all insights
const allInsights = computed(() => [
  ...performanceInsights.value,
  ...opportunityInsights.value,
  ...comparativeInsights.value,
]);

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
      <span class="ml-2">Loading insights...</span>
    </div>

    <div v-else-if="!props.filters?.supplier_address && !props.filters?.owner_address" class="dark:bg-base-100 bg-base-200 rounded-xl p-8 text-center">
      <Icon icon="mdi:lightbulb-on" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">Select a supplier or validator to view insights</p>
    </div>

    <div v-else-if="allInsights.length === 0" class="dark:bg-base-100 bg-base-200 rounded-xl p-8 text-center">
      <Icon icon="mdi:lightbulb-on" class="text-4xl text-secondary mb-2" />
      <p class="text-secondary">No insights available yet</p>
    </div>

    <div v-else class="space-y-3">
      <h3 class="text-lg font-semibold mb-4">Key Insights</h3>
      
      <div
        v-for="(insight, index) in allInsights"
        :key="index"
        :class="[
          'rounded-lg p-4 border-l-4',
          insight.type === 'positive' ? 'bg-success/10 border-success dark:bg-success/5' :
          insight.type === 'warning' ? 'bg-warning/10 border-warning dark:bg-warning/5' :
          'bg-info/10 border-info dark:bg-info/5'
        ]"
      >
        <div class="flex items-start gap-3">
          <Icon
            :icon="insight.icon"
            :class="[
              'text-xl mt-0.5',
              insight.type === 'positive' ? 'text-success' :
              insight.type === 'warning' ? 'text-warning' :
              'text-info'
            ]"
          />
          <div class="flex-1">
            <div class="font-semibold text-sm mb-1">{{ insight.title }}</div>
            <div class="text-xs text-secondary">{{ insight.description }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

