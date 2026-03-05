import { ref, computed, onBeforeUnmount, type ComputedRef } from 'vue';
import type { IndexerHealth } from '../types';

/**
 * Polls /api/v1/health/workers/ and exposes indexer lag state for the current chain.
 * @param apiChainName - Reactive resolved API chain name
 */
export function useIndexerHealth(apiChainName: ComputedRef<string>) {
  const indexerHealth = ref<IndexerHealth | null>(null);
  const indexerHealthLoading = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function loadIndexerHealth() {
    indexerHealthLoading.value = true;
    try {
      const response = await fetch('/api/v1/health/workers/');
      const result = await response.json();
      if (response.ok && result?.data) {
        indexerHealth.value = { chains: result.data.chains || [] };
      } else {
        indexerHealth.value = null;
      }
    } catch (e) {
      console.error('Error loading indexer health:', e);
      indexerHealth.value = null;
    } finally {
      indexerHealthLoading.value = false;
    }
  }

  function startPolling(intervalMs = 30_000) {
    loadIndexerHealth();
    intervalId = setInterval(loadIndexerHealth, intervalMs);
  }

  function stopPolling() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  onBeforeUnmount(stopPolling);

  const currentChainIndexerStatus = computed(() => {
    if (!indexerHealth.value?.chains || !apiChainName.value) return null;
    return indexerHealth.value.chains.find((c) => c.chain === apiChainName.value) ?? null;
  });

  const isIndexerBehind = computed(() => {
    const status = currentChainIndexerStatus.value;
    if (!status) return false;
    return status.monitoring_height < status.latest_height - 10;
  });

  return {
    indexerHealth,
    indexerHealthLoading,
    isIndexerBehind,
    currentChainIndexerStatus,
    loadIndexerHealth,
    startPolling,
    stopPolling,
  };
}
