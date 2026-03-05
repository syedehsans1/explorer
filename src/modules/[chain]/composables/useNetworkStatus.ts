import { computed } from 'vue';
import { useBaseStore } from '@/stores';

/** Exposes computed network-status metrics derived from the base store. */
export function useNetworkStatus() {
  const base = useBaseStore();

  const currentBlockHeight = computed(
    () => base.latest?.block?.header?.height || '0'
  );

  const latestBlockTime = computed(() =>
    new Date(base.latest?.block?.header?.time || '0').toLocaleString()
  );

  const averageBlockTime = computed(() => (base.blocktime / 1000).toFixed(1));

  const averageTxPerBlock = computed(() => {
    if (!base.recents?.length) return '0.0';
    const total = base.recents.reduce(
      (sum, block) => sum + (block.block?.data?.txs?.length || 0),
      0
    );
    return (total / Math.max(1, base.recents.length)).toFixed(1);
  });

  const activeValidatorsCount = computed(() =>
    String(base.latest?.block?.last_commit?.signatures?.length || 0)
  );

  return {
    currentBlockHeight,
    latestBlockTime,
    averageBlockTime,
    averageTxPerBlock,
    activeValidatorsCount,
  };
}
