import { ref, computed } from 'vue';

export interface RewardAnalytics {
  supplier_operator_address: string;
  application_address: string;
  service_id: string;
  hour_bucket: string;
  submission_count: number;
  total_rewards_upokt: number;
  total_relays: number;
  total_claimed_compute_units: number;
  total_estimated_compute_units: number;
  avg_efficiency_percent: number;
  avg_reward_per_relay: number;
  max_reward_per_submission: number;
  min_reward_per_submission: number;
}

export interface PerformanceDataPoint {
  bucket: string | null;
  supplier_operator_address: string | null;
  owner_address: string | null;
  moniker: string | null;
  submissions: number;
  total_relays: number;
  total_claimed_compute_units: number;
  total_estimated_compute_units: number;
  avg_efficiency_percent: number;
  avg_reward_per_relay: number;
  unique_applications: number;
  unique_services: number;
}

export interface NetworkAverages {
  avg_rewards: number;
  avg_relays: number;
  avg_efficiency: number;
  avg_reward_per_relay: number;
}

export interface TopPerformersThreshold {
  rewards_threshold: number;
  relays_threshold: number;
  top10Percent: PerformanceDataPoint[];
}

export interface TrendData {
  dates: string[];
  rewards: number[];
  relays: number[];
  efficiency: number[];
  movingAvg7d: number[];
  movingAvg30d: number[];
}

export interface Prediction {
  date: string;
  predicted_rewards: number;
  predicted_relays: number;
  predicted_efficiency: number;
  confidence_lower: number;
  confidence_upper: number;
}

export interface Anomaly {
  date: string;
  type: 'spike' | 'drop' | 'efficiency_degradation';
  metric: string;
  value: number;
  expected: number;
  deviation: number;
}

// Cache for network averages (5 minutes)
let networkAveragesCache: { data: NetworkAverages | null; timestamp: number } = {
  data: null,
  timestamp: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

/**
 * Fetch network-wide averages for comparison
 */
export async function fetchNetworkAverages(
  chain: string,
  startDate?: string,
  endDate?: string
): Promise<NetworkAverages> {
  // Check cache
  const now = Date.now();
  if (networkAveragesCache.data && (now - networkAveragesCache.timestamp) < CACHE_DURATION) {
    return networkAveragesCache.data;
  }

  try {
    const params = new URLSearchParams();
    params.append('chain', chain);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('limit', '500'); // Get enough data for accurate averages

    const data = await fetchApi('/api/v1/claims/rewards', params);
    const rewards = data.data || [];

    if (rewards.length === 0) {
      return { avg_rewards: 0, avg_relays: 0, avg_efficiency: 0, avg_reward_per_relay: 0 };
    }

    // Calculate averages
    const totalRewards = rewards.reduce((sum: number, r: RewardAnalytics) => sum + (r.total_rewards_upokt || 0), 0);
    const totalRelays = rewards.reduce((sum: number, r: RewardAnalytics) => sum + (r.total_relays || 0), 0);
    const totalEfficiencyWeight = rewards.reduce((sum: number, r: RewardAnalytics) => sum + (r.total_rewards_upokt || 0), 0);
    const weightedEfficiencySum = rewards.reduce((sum: number, r: RewardAnalytics) => sum + (r.avg_efficiency_percent * (r.total_rewards_upokt || 0)), 0);
    const totalRewardPerRelayWeight = rewards.reduce((sum: number, r: RewardAnalytics) => sum + (r.total_relays || 0), 0);
    const weightedRewardPerRelaySum = rewards.reduce((sum: number, r: RewardAnalytics) => sum + (r.avg_reward_per_relay * (r.total_relays || 0)), 0);

    const averages: NetworkAverages = {
      avg_rewards: totalRewards / rewards.length,
      avg_relays: totalRelays / rewards.length,
      avg_efficiency: totalEfficiencyWeight > 0 ? weightedEfficiencySum / totalEfficiencyWeight : 0,
      avg_reward_per_relay: totalRewardPerRelayWeight > 0 ? weightedRewardPerRelaySum / totalRewardPerRelayWeight : 0,
    };

    // Update cache
    networkAveragesCache = { data: averages, timestamp: now };
    return averages;
  } catch (error) {
    console.error('Error fetching network averages:', error);
    return { avg_rewards: 0, avg_relays: 0, avg_efficiency: 0, avg_reward_per_relay: 0 };
  }
}

/**
 * Fetch top 10% performers for comparison
 */
export async function fetchTopPerformers(
  chain: string,
  startDate?: string,
  endDate?: string
): Promise<TopPerformersThreshold> {
  try {
    const params = new URLSearchParams();
    params.append('chain', chain);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('group_by', 'total');
    params.append('limit', '500'); // Get enough data to calculate top 10%

    const data = await fetchApi('/api/v1/suppliers/performance', params);
    const performers = data.data || [];

    if (performers.length === 0) {
      return { rewards_threshold: 0, relays_threshold: 0, top10Percent: [] };
    }

    // Sort by total_rewards_upokt (or total_relays as fallback)
    const sortedByRewards = [...performers].sort((a: PerformanceDataPoint, b: PerformanceDataPoint) => 
      b.total_relays - a.total_relays
    );

    // Calculate 90th percentile threshold
    const top10PercentIndex = Math.floor(sortedByRewards.length * 0.1);
    const top10Percent = sortedByRewards.slice(0, Math.max(1, top10PercentIndex));
    
    const rewardsThreshold = top10Percent[top10Percent.length - 1]?.total_relays || 0;
    const relaysThreshold = top10Percent[top10Percent.length - 1]?.total_relays || 0;

    // Calculate averages for top 10%
    const avgRewards = top10Percent.reduce((sum: number, p: PerformanceDataPoint) => sum + p.total_relays, 0) / top10Percent.length;
    const avgRelays = avgRewards; // Using same metric for simplicity
    const avgEfficiency = top10Percent.reduce((sum: number, p: PerformanceDataPoint) => sum + p.avg_efficiency_percent, 0) / top10Percent.length;

    return {
      rewards_threshold: avgRewards,
      relays_threshold: avgRelays,
      top10Percent: top10Percent.map((p: PerformanceDataPoint) => ({
        ...p,
        total_relays: avgRelays,
        avg_efficiency_percent: avgEfficiency,
      })),
    };
  } catch (error) {
    console.error('Error fetching top performers:', error);
    return { rewards_threshold: 0, relays_threshold: 0, top10Percent: [] };
  }
}

/**
 * Calculate trends from time series data
 */
export function calculateTrends(
  data: RewardAnalytics[] | PerformanceDataPoint[],
  isHourly: boolean = true
): TrendData {
  if (data.length === 0) {
    return { dates: [], rewards: [], relays: [], efficiency: [], movingAvg7d: [], movingAvg30d: [] };
  }

  // Sort by date
  const sorted = [...data].sort((a, b) => {
    const dateA = isHourly ? (a as RewardAnalytics).hour_bucket : (a as PerformanceDataPoint).bucket || '';
    const dateB = isHourly ? (b as RewardAnalytics).hour_bucket : (b as PerformanceDataPoint).bucket || '';
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  const dates: string[] = [];
  const rewards: number[] = [];
  const relays: number[] = [];
  const efficiency: number[] = [];

  sorted.forEach((item) => {
    if (isHourly) {
      const h = item as RewardAnalytics;
      dates.push(h.hour_bucket);
      rewards.push(h.total_rewards_upokt || 0);
      relays.push(h.total_relays || 0);
      efficiency.push(h.avg_efficiency_percent || 0);
    } else {
      const p = item as PerformanceDataPoint;
      if (p.bucket) {
        dates.push(p.bucket);
        rewards.push(p.total_relays * (p.avg_reward_per_relay || 0)); // Approximate rewards
        relays.push(p.total_relays || 0);
        efficiency.push(p.avg_efficiency_percent || 0);
      }
    }
  });

  // Calculate moving averages
  const movingAvg7d: number[] = [];
  const movingAvg30d: number[] = [];
  const window7 = isHourly ? 7 * 24 : 7; // 7 days in hours or days
  const window30 = isHourly ? 30 * 24 : 30; // 30 days in hours or days

  for (let i = 0; i < rewards.length; i++) {
    const start7 = Math.max(0, i - window7 + 1);
    const start30 = Math.max(0, i - window30 + 1);
    const slice7 = rewards.slice(start7, i + 1);
    const slice30 = rewards.slice(start30, i + 1);
    movingAvg7d.push(slice7.reduce((a, b) => a + b, 0) / slice7.length);
    movingAvg30d.push(slice30.reduce((a, b) => a + b, 0) / slice30.length);
  }

  return { dates, rewards, relays, efficiency, movingAvg7d, movingAvg30d };
}

/**
 * Generate predictions using simple linear regression
 */
export function generatePredictions(
  trendData: TrendData,
  hours: number = 24
): Prediction[] {
  if (trendData.rewards.length < 2) {
    return [];
  }

  const predictions: Prediction[] = [];
  const n = trendData.rewards.length;

  // Simple linear regression: y = mx + b
  // Calculate slope (m) and intercept (b) for rewards
  const sumX = trendData.rewards.reduce((sum, _, i) => sum + i, 0);
  const sumY = trendData.rewards.reduce((sum, val) => sum + val, 0);
  const sumXY = trendData.rewards.reduce((sum, val, i) => sum + i * val, 0);
  const sumX2 = trendData.rewards.reduce((sum, _, i) => sum + i * i, 0);

  const m_rewards = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const b_rewards = (sumY - m_rewards * sumX) / n;

  // Calculate for relays
  const sumY_relays = trendData.relays.reduce((sum, val) => sum + val, 0);
  const sumXY_relays = trendData.relays.reduce((sum, val, i) => sum + i * val, 0);
  const m_relays = (n * sumXY_relays - sumX * sumY_relays) / (n * sumX2 - sumX * sumX);
  const b_relays = (sumY_relays - m_relays * sumX) / n;

  // Calculate for efficiency (use average as efficiency tends to be stable)
  const avgEfficiency = trendData.efficiency.reduce((sum, val) => sum + val, 0) / n;

  // Calculate standard deviation for confidence intervals
  const residuals_rewards = trendData.rewards.map((val, i) => val - (m_rewards * i + b_rewards));
  const stdDev_rewards = Math.sqrt(residuals_rewards.reduce((sum, r) => sum + r * r, 0) / n);

  const residuals_relays = trendData.relays.map((val, i) => val - (m_relays * i + b_relays));
  const stdDev_relays = Math.sqrt(residuals_relays.reduce((sum, r) => sum + r * r, 0) / n);

  // Generate predictions
  const lastDate = new Date(trendData.dates[trendData.dates.length - 1]);
  const isHourly = trendData.dates.length > 0 && trendData.dates[0].includes('T');

  for (let i = 1; i <= hours; i++) {
    const x = n + i - 1;
    const predicted_rewards = m_rewards * x + b_rewards;
    const predicted_relays = m_relays * x + b_relays;
    const predicted_efficiency = avgEfficiency;

    // Confidence interval (±2 standard deviations = ~95% confidence)
    const confidence_lower = Math.max(0, predicted_rewards - 2 * stdDev_rewards);
    const confidence_upper = predicted_rewards + 2 * stdDev_rewards;

    // Calculate next date
    const nextDate = new Date(lastDate);
    if (isHourly) {
      nextDate.setHours(nextDate.getHours() + i);
    } else {
      nextDate.setDate(nextDate.getDate() + i);
    }

    predictions.push({
      date: nextDate.toISOString(),
      predicted_rewards,
      predicted_relays,
      predicted_efficiency,
      confidence_lower,
      confidence_upper,
    });
  }

  return predictions;
}

/**
 * Detect anomalies in performance data
 */
export function detectAnomalies(
  trendData: TrendData,
  threshold: number = 2.5 // Standard deviations
): Anomaly[] {
  if (trendData.rewards.length < 3) {
    return [];
  }

  const anomalies: Anomaly[] = [];

  // Calculate mean and standard deviation for each metric
  const mean_rewards = trendData.rewards.reduce((a, b) => a + b, 0) / trendData.rewards.length;
  const stdDev_rewards = Math.sqrt(
    trendData.rewards.reduce((sum, val) => sum + Math.pow(val - mean_rewards, 2), 0) / trendData.rewards.length
  );

  const mean_relays = trendData.relays.reduce((a, b) => a + b, 0) / trendData.relays.length;
  const stdDev_relays = Math.sqrt(
    trendData.relays.reduce((sum, val) => sum + Math.pow(val - mean_relays, 2), 0) / trendData.relays.length
  );

  const mean_efficiency = trendData.efficiency.reduce((a, b) => a + b, 0) / trendData.efficiency.length;
  const stdDev_efficiency = Math.sqrt(
    trendData.efficiency.reduce((sum, val) => sum + Math.pow(val - mean_efficiency, 2), 0) / trendData.efficiency.length
  );

  // Detect anomalies
  trendData.rewards.forEach((value, index) => {
    const zScore = Math.abs((value - mean_rewards) / stdDev_rewards);
    if (zScore > threshold) {
      anomalies.push({
        date: trendData.dates[index],
        type: value > mean_rewards ? 'spike' : 'drop',
        metric: 'rewards',
        value,
        expected: mean_rewards,
        deviation: ((value - mean_rewards) / mean_rewards) * 100,
      });
    }
  });

  trendData.relays.forEach((value, index) => {
    const zScore = Math.abs((value - mean_relays) / stdDev_relays);
    if (zScore > threshold && !anomalies.find(a => a.date === trendData.dates[index] && a.metric === 'relays')) {
      anomalies.push({
        date: trendData.dates[index],
        type: value > mean_relays ? 'spike' : 'drop',
        metric: 'relays',
        value,
        expected: mean_relays,
        deviation: ((value - mean_relays) / mean_relays) * 100,
      });
    }
  });

  // Efficiency degradation (only detect drops, not spikes)
  trendData.efficiency.forEach((value, index) => {
    if (value < mean_efficiency - threshold * stdDev_efficiency) {
      anomalies.push({
        date: trendData.dates[index],
        type: 'efficiency_degradation',
        metric: 'efficiency',
        value,
        expected: mean_efficiency,
        deviation: ((value - mean_efficiency) / mean_efficiency) * 100,
      });
    }
  });

  return anomalies.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Calculate growth rates
 */
export function calculateGrowthRates(trendData: TrendData): {
  dayOverDay: number;
  weekOverWeek: number;
  monthOverMonth: number;
} {
  if (trendData.rewards.length < 2) {
    return { dayOverDay: 0, weekOverWeek: 0, monthOverMonth: 0 };
  }

  const recent = trendData.rewards[trendData.rewards.length - 1];
  const dayAgo = trendData.rewards[Math.max(0, trendData.rewards.length - (24 + 1))] || recent;
  const weekAgo = trendData.rewards[Math.max(0, trendData.rewards.length - (7 * 24 + 1))] || recent;
  const monthAgo = trendData.rewards[Math.max(0, trendData.rewards.length - (30 * 24 + 1))] || recent;

  const dayOverDay = dayAgo > 0 ? ((recent - dayAgo) / dayAgo) * 100 : 0;
  const weekOverWeek = weekAgo > 0 ? ((recent - weekAgo) / weekAgo) * 100 : 0;
  const monthOverMonth = monthAgo > 0 ? ((recent - monthAgo) / monthAgo) * 100 : 0;

  return { dayOverDay, weekOverWeek, monthOverMonth };
}

