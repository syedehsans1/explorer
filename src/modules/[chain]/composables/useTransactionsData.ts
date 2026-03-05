import { ref, watch, type ComputedRef } from 'vue';
import { useBaseStore, useBlockchain } from '@/stores';
import { getApiChainName } from '../utils/constants';

/**
 * Manages the dashboard "Recent Transactions" table.
 * Initialises from base.allTxs and live-prepends new transactions as blocks arrive.
 */
export function useTransactionsData(apiChainName: ComputedRef<string>) {
  const base = useBaseStore();
  const blockchain = useBlockchain();

  const transactions = ref<any[]>([]);
  const isInitialized = ref(false);
  const isNodeFallback = ref(false);
  const fallbackError = ref('');
  const isPrepending = ref(false);
  let lastKnownTxHash = '';
  let lastKnownTxBlock = 0;

  // ── Initialise from base store ────────────────────────────────────────────

  watch(
    () => base.allTxs,
    (newTxs) => {
      if (newTxs?.length && !isInitialized.value) {
        transactions.value = [...newTxs];
        isInitialized.value = true;
        lastKnownTxHash = newTxs[0]?.hash || '';
        lastKnownTxBlock = Math.max(...newTxs.map((tx: any) => Number(tx.block_height || 0)));
      }
    },
    { immediate: true }
  );

  // ── API fetch ─────────────────────────────────────────────────────────────

  async function fetchLatestTxs(limit = 10): Promise<any[]> {
    try {
      const chain = getApiChainName(
        blockchain.current?.chainName || apiChainName.value || 'pocket-lego-testnet'
      );
      const res = await fetch(
        `/api/v1/transactions?chain=${chain}&page=1&limit=${limit}&sort_by=timestamp&sort_order=desc`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async function prependNewTxs() {
    if (isPrepending.value || isNodeFallback.value) return;

    if (!transactions.value.length) {
      if (base.allTxs?.length) {
        transactions.value = [...base.allTxs];
        isInitialized.value = true;
      } else {
        return;
      }
    }

    isPrepending.value = true;
    try {
      const latest = await fetchLatestTxs(10);
      if (!latest.length) return;
      const existingHashes = new Set(transactions.value.map((tx: any) => tx.hash));
      const newTxs = latest.filter((tx: any) => !existingHashes.has(tx.hash));
      if (!newTxs.length) return;
      transactions.value = [...newTxs, ...transactions.value];
      lastKnownTxHash = transactions.value[0]?.hash || '';
    } finally {
      isPrepending.value = false;
    }
  }

  // ── Check API availability ────────────────────────────────────────────────

  async function checkApiAvailability() {
    try {
      const res = await fetch(
        `/api/v1/transactions?chain=${apiChainName.value}&page=1&limit=1`
      ).catch(() => null);
      isNodeFallback.value = !res || !res.ok;
    } catch {
      isNodeFallback.value = true;
    }
  }

  // ── Load initial transactions ─────────────────────────────────────────────

  async function loadTransactions() {
    await checkApiAvailability();
    try {
      await base.getAllTxs(apiChainName.value);
      if (base.allTxs?.length) {
        lastKnownTxBlock = Math.max(...base.allTxs.map((tx: any) => Number(tx.block_height || 0)));
        lastKnownTxHash = base.allTxs[0]?.hash || '';
      }
    } catch (err: any) {
      fallbackError.value = err.message || 'Failed to load transactions';
    }
  }

  // ── Live update on new block ──────────────────────────────────────────────

  watch(
    () => base.latest?.block?.header?.height,
    async (newVal, oldVal) => {
      if (!newVal || newVal === oldVal) return;
      const newH = Number(newVal);
      if (isNodeFallback.value || newH <= lastKnownTxBlock) return;
      if (!base.allTxs?.length) return;
      lastKnownTxBlock = newH;
      await prependNewTxs();
    }
  );

  return {
    transactions,
    isNodeFallback,
    fallbackError,
    loadTransactions,
  };
}
