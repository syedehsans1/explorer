import { ref, computed, watch, type ComputedRef } from 'vue';
import { useBaseStore, useBlockchain } from '@/stores';
import { getApiChainName } from '../utils/constants';
import { useFormatter } from '@/stores';

type ChartType = 'bar' | 'area' | 'line';

/**
 * Manages the Transaction History chart:
 * fetches daily counts from the API with a client-side fallback.
 */
export function useTxHistoryChart(apiChainName: ComputedRef<string>) {
  const base = useBaseStore();
  const blockchain = useBlockchain();
  const format = useFormatter();

  const chartType = ref<ChartType>('area');
  const windowDays = ref(30);
  const allLabels = ref<string[]>([]);
  const allCounts = ref<number[]>([]);
  const visibleLabels = ref<string[]>([]);

  const series = ref([{ name: 'Transactions', data: [] as number[] }]);
  const totalTxCount = ref(0);

  // ── Window slicing ────────────────────────────────────────────────────────

  function applyWindow(days: number) {
    const n = allLabels.value.length;
    if (!n) {
      visibleLabels.value = [];
      series.value = [{ name: 'Transactions', data: [] }];
      return;
    }
    const start = Math.max(0, n - Math.min(days, n));
    visibleLabels.value = allLabels.value.slice(start);
    series.value = [{ name: 'Transactions', data: allCounts.value.slice(start) as never[] }];
  }

  // ── Chart options ─────────────────────────────────────────────────────────

  const chartOptions = computed(() => {
    const ct = chartType.value;

    const stroke =
      ct === 'bar'
        ? { width: 0 }
        : { curve: ct === 'area' ? 'smooth' : 'straight', width: 2 };

    const fill =
      ct === 'bar'
        ? { opacity: 1, type: 'solid' }
        : {
            type: ct === 'area' ? 'gradient' : 'solid',
            opacity: ct === 'area' ? 0.3 : 0,
            gradient:
              ct === 'area'
                ? { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.3, stops: [0, 90, 100] }
                : undefined,
          };

    const markers =
      ct === 'bar'
        ? { size: 0 }
        : ct === 'line'
        ? { size: 4, strokeWidth: 0, hover: { size: 6 } }
        : { size: 0, hover: { size: 4 } };

    return {
      chart: { type: ct, height: 280, toolbar: { show: false }, zoom: { enabled: false } },
      colors: ['#A3E635'],
      dataLabels: { enabled: false },
      stroke,
      fill,
      markers,
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        row: { colors: ['transparent'], opacity: 0.5 },
      },
      xaxis: {
        categories: visibleLabels.value,
        labels: {
          style: { colors: 'rgb(116, 109, 105)' },
          formatter: (v: string) => v,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: 'rgb(116, 109, 105)' },
          formatter: (v: number) => format.formatNumber(v),
        },
      },
      tooltip: {
        theme: 'dark',
        y: { formatter: (v: number) => format.formatNumber(v) + ' transactions' },
      },
    };
  });

  // ── Client-side fallback ──────────────────────────────────────────────────

  function buildClientSideCounts(days: number) {
    const txs = base.allTxs || [];
    const now = new Date();
    const labels: string[] = [];
    const byDay = new Map<string, number>();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      byDay.set(d.toISOString().split('T')[0], 0);
    }

    for (const tx of txs) {
      let txDate: Date | undefined;
      if (tx.timestamp) {
        txDate = new Date(tx.timestamp);
      } else if (tx.height) {
        const cached = base._blockCache?.get(tx.height);
        if (cached?.block?.header?.time) {
          txDate = new Date(cached.block.header.time);
        } else {
          const found = base.recents.find((b) => b.block.header.height === tx.height);
          if (found?.block?.header?.time) txDate = new Date(found.block.header.time);
        }
      }
      if (txDate) {
        const key = txDate.toISOString().split('T')[0];
        if (byDay.has(key)) byDay.set(key, (byDay.get(key) || 0) + 1);
      }
    }

    allLabels.value = labels;
    allCounts.value = labels.map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      return byDay.get(d.toISOString().split('T')[0]) || 0;
    });

    applyWindow(windowDays.value);
  }

  // ── Primary fetch ─────────────────────────────────────────────────────────

  async function loadTransactionHistory() {
    try {
      const chain = getApiChainName(
        blockchain.current?.chainName || apiChainName.value || 'pocket-lego-testnet'
      );
      const res = await fetch(`/api/v1/transactions/count?chain=${chain}`).catch(() => null);

      if (res?.ok) {
        const data = await res.json();
        if (data?.data?.labels && data?.data?.counts) {
          totalTxCount.value = data.data.total || 0;
          allLabels.value = data.data.labels;
          allCounts.value = data.data.counts;
          applyWindow(windowDays.value);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading transaction history:', e);
    }

    buildClientSideCounts(30);
  }

  // ── Watchers ──────────────────────────────────────────────────────────────

  watch(
    () => base.allTxs,
    (newTxs) => {
      if (newTxs?.length) loadTransactionHistory();
    },
    { deep: true }
  );

  watch(windowDays, (newVal, oldVal) => {
    if (newVal !== oldVal) applyWindow(newVal);
  });

  return {
    chartType,
    windowDays,
    visibleLabels,
    series,
    chartOptions,
    totalTxCount,
    loadTransactionHistory,
  };
}
