import { ref, computed, watch, type ComputedRef, type Ref } from 'vue';
import type { NetworkStats } from '../types';
import { formatWithCommas, formatCompact } from '../utils/formatters';

type ChartType = 'bar' | 'area' | 'line';
type GrowthTab = 'core-services' | 'performance';
type PerformanceMetric = 'relays' | 'compute-units';

/** Builds chart stroke config based on type and series count. */
function buildStroke(chartType: ChartType, isCoreServices: boolean, isComputeUnits: boolean) {
  if (chartType === 'bar') return { width: 0 };
  return {
    curve: chartType === 'area' ? 'smooth' : 'straight',
    width: isCoreServices ? [2.5, 2.5, 2.5, 2.5] : isComputeUnits ? [2.5, 2.5] : 2.5,
    dashArray: isCoreServices ? [0, 0, 0, 0] : isComputeUnits ? [0, 5] : 0,
  };
}

/** Builds chart fill config based on type and mode. */
function buildFill(chartType: ChartType, isCoreServices: boolean, isComputeUnits: boolean) {
  if (chartType === 'bar') return { opacity: 1, type: 'solid' };
  return {
    type: chartType === 'area' ? 'gradient' : 'solid',
    opacity:
      chartType === 'line'
        ? 0
        : isCoreServices
        ? [0.15, 0.15, 0.15, 0.15]
        : isComputeUnits
        ? [0.15, 0.15]
        : 0.15,
    gradient:
      chartType === 'area'
        ? { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.3, stops: [0, 90, 100] }
        : undefined,
  };
}

/** Builds marker config based on chart type. */
function buildMarkers(chartType: ChartType, isComputeUnits: boolean) {
  if (chartType === 'bar') return { size: 0 };
  if (chartType === 'line')
    return { size: isComputeUnits ? [4, 4] : 4, strokeWidth: 0, hover: { size: 6 } };
  return { size: isComputeUnits ? [2, 2] : 2, strokeWidth: 0, hover: { size: 5 } };
}

/**
 * Manages the Network Growth chart: data fetching, series selection, and ApexCharts config.
 */
export function useNetworkGrowthChart(
  apiChainName: ComputedRef<string>,
  networkStats: Ref<NetworkStats>
) {
  const tab = ref<GrowthTab>('performance');
  const chartType = ref<ChartType>('area');
  const performanceMetric = ref<PerformanceMetric>('compute-units');
  const windowDays = ref(7);
  const chartCategories = ref<string[]>([]);

  const seriesData = ref([
    { name: 'Applications', data: [] as number[], yAxisIndex: 0 },
    { name: 'Gateways', data: [] as number[], yAxisIndex: 0 },
    { name: 'Suppliers', data: [] as number[], yAxisIndex: 0 },
    { name: 'Services', data: [] as number[], yAxisIndex: 0 },
    { name: 'Relays', data: [] as number[], yAxisIndex: 1 },
    { name: 'Claimed CU', data: [] as number[], yAxisIndex: 1 },
    { name: 'Estimated CU', data: [] as number[], yAxisIndex: 1 },
  ]);

  // ── Active series ─────────────────────────────────────────────────────────

  const activeSeries = computed(() => {
    if (!seriesData.value.length) return [];

    if (tab.value === 'core-services') {
      return seriesData.value
        .slice(0, 4)
        .filter((s) => s.data?.length)
        .map((s) => ({ ...s, yAxisIndex: 0 }));
    }

    if (performanceMetric.value === 'relays') {
      const s = seriesData.value[4];
      return s?.data?.length ? [{ ...s, yAxisIndex: 0 }] : [];
    }

    // compute-units: Claimed CU + Estimated CU
    const result: any[] = [];
    const claimed = seriesData.value[5];
    const estimated = seriesData.value[6];
    if (claimed?.data?.length) result.push({ ...claimed, yAxisIndex: 0 });
    if (estimated?.data?.length) result.push({ ...estimated, yAxisIndex: 0 });
    return result;
  });

  // ── Chart options ─────────────────────────────────────────────────────────

  const chartOptions = computed(() => {
    const isCoreServices = tab.value === 'core-services';
    const ct = chartType.value;
    const isComputeUnits = !isCoreServices && performanceMetric.value === 'compute-units';

    const colors = isCoreServices
      ? ['#FFB206', '#09279F', '#5E9AE4', '#60BC29']
      : performanceMetric.value === 'relays'
      ? ['#A855F7']
      : ['#EF4444', '#F97316'];

    return {
      chart: {
        type: ct,
        height: 280,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, easing: 'easeinout', speed: 800 },
      },
      colors,
      dataLabels: { enabled: false },
      stroke: buildStroke(ct, isCoreServices, isComputeUnits),
      fill: buildFill(ct, isCoreServices, isComputeUnits),
      markers: buildMarkers(ct, isComputeUnits),
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        row: { colors: ['transparent'], opacity: 0.5 },
      },
      xaxis: {
        categories: chartCategories.value || [],
        type: 'category',
        labels: {
          style: { colors: 'rgb(116, 109, 105)' },
          formatter: (v: string) => v,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: isCoreServices
        ? [{ labels: { style: { colors: 'rgb(116, 109, 105)' } }, title: { text: 'Entities' } }]
        : [
            {
              labels: {
                style: { colors: 'rgb(116, 109, 105)' },
                formatter: (v: number) => {
                  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
                  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
                  return String(v);
                },
              },
              title: {
                text: performanceMetric.value === 'relays' ? 'Relays' : 'Compute Units',
                style: {
                  color: performanceMetric.value === 'relays' ? '#A855F7' : '#EF4444',
                },
              },
              opposite: false,
            },
          ],
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'left',
        labels: { colors: 'rgb(116, 109, 105)' },
      },
      tooltip: {
        theme: 'dark',
        shared: true,
        intersect: false,
        y: {
          formatter: (v: number) =>
            isCoreServices ? formatWithCommas(v) : formatCompact(v),
        },
      },
    };
  });

  // ── Data fetching ─────────────────────────────────────────────────────────

  function parseDayLabel(dayStr: string): string {
    const d = new Date(dayStr.slice(0, 10) + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function loadPerformanceData(days: number) {
    try {
      const params = new URLSearchParams({ window: String(days), chain: apiChainName.value });
      const res = await fetch(`/api/v1/network-growth/performance?${params}`);
      const result = await res.json();
      if (!res.ok) throw new Error('Network growth performance API error');

      const timeline = (result?.data?.timeline || []).sort(
        (a: any, b: any) => (a.day || '').localeCompare(b.day || '')
      );

      const labels: string[] = [];
      const relays: number[] = [];
      const claimedCU: number[] = [];
      const estimatedCU: number[] = [];

      for (const item of timeline) {
        if (!item.day) continue;
        labels.push(parseDayLabel(item.day));
        relays.push(Number(item.estimated_relays || 0));
        claimedCU.push(Number(item.claimed_compute_units || 0));
        estimatedCU.push(Number(item.estimated_compute_units || 0));
      }

      // Smooth out the last estimated CU point using the window average
      if (estimatedCU.length > 0) {
        const avg =
          estimatedCU.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0) / estimatedCU.length;
        estimatedCU[estimatedCU.length - 1] = avg;
      }

      if (!chartCategories.value.length || chartCategories.value.length === labels.length) {
        chartCategories.value = labels;
      }

      seriesData.value[4].data = relays;
      seriesData.value[5].data = claimedCU;
      seriesData.value[6].data = estimatedCU; // fix: was writing claimedCU twice
    } catch (e) {
      console.error('Error loading network growth performance:', e);
    }
  }

  async function loadEntitiesData(days: number) {
    try {
      const params = new URLSearchParams({ window: String(days), chain: apiChainName.value });
      const res = await fetch(`/api/v1/network-growth/entities?${params}`);
      const result = await res.json();
      if (!res.ok) throw new Error('Network growth entities API error');

      const timeline = (result?.data?.timeline || []).sort(
        (a: any, b: any) => (a.day || '').localeCompare(b.day || '')
      );

      const labels: string[] = [];
      const apps: number[] = [];
      const suppliers: number[] = [];
      const gateways: number[] = [];
      const services: number[] = [];

      for (const item of timeline) {
        if (!item.day) continue;
        labels.push(parseDayLabel(item.day));
        apps.push(Number(item.applications || 0));
        suppliers.push(Number(item.suppliers || 0));
        gateways.push(Number(item.gateways || 0));
        services.push(Number(item.services || 0));
      }

      // Convert daily deltas to cumulative totals anchored on current counts
      const toCumulative = (daily: number[], currentTotal: number) => {
        const sumDaily = daily.reduce((a, b) => a + (Number(b) || 0), 0);
        let running = Math.max(0, currentTotal - sumDaily);
        return daily.map((d) => (running += Number(d) || 0, running));
      };

      const stats = networkStats.value;
      if (!chartCategories.value.length || chartCategories.value.length === labels.length) {
        chartCategories.value = labels;
      }

      seriesData.value[0].data = toCumulative(apps, stats.applications);
      seriesData.value[1].data = toCumulative(gateways, stats.gateways);
      seriesData.value[2].data = toCumulative(suppliers, stats.suppliers);
      seriesData.value[3].data = toCumulative(services, stats.services);
    } catch (e) {
      console.error('Error loading network growth entities:', e);
    }
  }

  async function loadChartData(days = windowDays.value) {
    await Promise.allSettled([loadPerformanceData(days), loadEntitiesData(days)]);
  }

  // ── Window change ─────────────────────────────────────────────────────────

  watch(windowDays, (newVal, oldVal) => {
    if (newVal === oldVal) return;
    chartCategories.value = [];
    seriesData.value = seriesData.value.map((s) => ({ ...s, data: [] }));
    loadChartData(newVal);
  });

  return {
    tab,
    chartType,
    performanceMetric,
    windowDays,
    chartCategories,
    activeSeries,
    chartOptions,
    loadChartData,
  };
}
