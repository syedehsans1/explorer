import { ref, watch, type ComputedRef } from 'vue';
import { useBlockchain, useBaseStore } from '@/stores';
import type { ApiBlockItem } from '../types';

/** Extracts production time from any of the server's possible field names. */
function getBlockProductionTime(block: ApiBlockItem): number {
  return Number(block.block_production_time ?? block.production_time ?? block.block_time ?? 0);
}

/**
 * Manages the dashboard "Latest Blocks" table.
 * Handles server fetching, node fallback, and live prepending when new blocks arrive.
 */
export function useBlocksData(apiChainName: ComputedRef<string>) {
  const blockchain = useBlockchain();
  const base = useBaseStore();

  const blocks = ref<ApiBlockItem[]>([]);
  const loadingBlocks = ref(false);
  const blocksPage = ref(1);
  const blocksLimit = ref(25);
  const blocksTotal = ref(0);
  const blocksTotalPages = ref(0);
  const avgBlockProductionTime = ref<string | null>(null);
  const isNodeFallback = ref(false);
  const fallbackError = ref('');

  // Tracks last prepended height to prevent duplicates
  const lastKnownHeight = ref(0);
  const isPrepending = ref(false);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Map a raw RPC block + its predecessor into an ApiBlockItem. */
  function rpcBlockToApiItem(block: any, prevBlock: any | null): ApiBlockItem {
    const currentMs = new Date(block.block?.header?.time || '').getTime();
    const prevMs = prevBlock ? new Date(prevBlock.block?.header?.time || '').getTime() : 0;
    const productionTimeSec =
      prevMs && currentMs && currentMs > prevMs
        ? parseFloat(((currentMs - prevMs) / 1000).toFixed(3))
        : 0;

    return {
      id: `${block.block?.header?.chain_id}:${block.block?.header?.height}`,
      height: parseInt(block.block?.header?.height || '0'),
      hash: block.block_id?.hash || '',
      timestamp: block.block?.header?.time || new Date().toISOString(),
      proposer: block.block?.header?.proposer_address || '',
      chain: block.block?.header?.chain_id || apiChainName.value,
      transaction_count: block.block?.data?.txs?.length || 0,
      block_production_time: productionTimeSec,
    };
  }

  /** Fetch a single block by height from the RPC node. */
  async function fetchBlockFromNode(height: number): Promise<ApiBlockItem | null> {
    try {
      const [block, prevBlock] = await Promise.all([
        blockchain.rpc.getBaseBlockAt(String(height)).catch(() => null),
        height > 1
          ? blockchain.rpc.getBaseBlockAt(String(height - 1)).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!block) return null;
      const blockHeight = parseInt(block.block?.header?.height || '0');
      if (blockHeight !== height) return null;
      return rpcBlockToApiItem(block, prevBlock);
    } catch {
      return null;
    }
  }

  /** Fetch a single block by height from the server API. */
  async function fetchBlockFromServer(height: number): Promise<ApiBlockItem | null> {
    try {
      const res = await fetch(`/api/v1/blocks/${height}?chain=${apiChainName.value}`);
      if (!res.ok) {
        // Fallback: search list endpoint
        const listRes = await fetch(
          `/api/v1/blocks?chain=${apiChainName.value}&page=1&limit=5`
        );
        if (!listRes.ok) return null;
        const listData = await listRes.json();
        const blockList: ApiBlockItem[] = listData.blocks || listData.data || [];
        return blockList.find((b) => Number(b.height) === height) ?? null;
      }
      const data = await res.json();
      const block = data.block || data.data || data;
      return Number(block?.height) === height ? block : null;
    } catch {
      return null;
    }
  }

  /** Prepend a single new block to the top of the table without a full reload. */
  async function prependBlock(height: number) {
    if (isPrepending.value) return;
    if (blocks.value.some((b) => Number(b.height) === height)) return;
    isPrepending.value = true;
    try {
      let newBlock = await fetchBlockFromNode(height);
      if (!newBlock) newBlock = await fetchBlockFromServer(height);
      if (!newBlock || Number(newBlock.height) !== height) return;
      if (blocks.value.some((b) => Number(b.height) === height)) return;

      blocks.value = [newBlock, ...blocks.value];
      if (blocks.value.length > blocksLimit.value) {
        blocks.value = blocks.value.slice(0, blocksLimit.value);
      }
    } finally {
      isPrepending.value = false;
    }
  }

  /**
   * Fast-path: build an ApiBlockItem from the already-loaded base.latest
   * so we can prepend without a network call.
   */
  function tryPrependFromBaseLatest() {
    if (loadingBlocks.value || blocksPage.value !== 1 || !blocks.value.length) return;
    const latest = base.latest?.block;
    if (!latest?.header?.height) return;
    const latestHeight = Number(latest.header.height);
    const topHeight = Number(blocks.value[0]?.height || 0);
    if (!Number.isFinite(latestHeight) || latestHeight <= topHeight) return;

    const prev = blocks.value[0];
    const prevTs = prev?.timestamp;
    const currentTs = latest.header.time;
    let blockProductionTime: number | undefined;
    if (currentTs && prevTs) {
      const currentMs = new Date(currentTs).getTime();
      const prevMs = new Date(prevTs).getTime();
      if (Number.isFinite(currentMs) && Number.isFinite(prevMs) && currentMs > prevMs) {
        blockProductionTime = (currentMs - prevMs) / 1000;
      }
    }

    const row: ApiBlockItem = {
      id: `${latest.header.chain_id}:${latest.header.height}`,
      height: parseInt(latest.header.height || '0'),
      hash: base.latest?.block_id?.hash || '',
      timestamp: latest.header.time || new Date().toISOString(),
      proposer: latest.header.proposer_address || '',
      chain: latest.header.chain_id || apiChainName.value,
      transaction_count: latest.data?.txs?.length || 0,
      block_production_time: blockProductionTime,
    };

    blocks.value = [row, ...blocks.value];
    if (blocks.value.length > blocksLimit.value) blocks.value.pop();
    blocksTotal.value = Math.max(blocksTotal.value, latestHeight);
  }

  // ── Node fallback ─────────────────────────────────────────────────────────

  async function loadBlocksFromNode(): Promise<{
    blocks: ApiBlockItem[];
    total: number;
    totalPages: number;
  }> {
    let rpcRetries = 0;
    while (!blockchain.rpc && rpcRetries < 20) {
      await new Promise((r) => setTimeout(r, 500));
      rpcRetries++;
    }
    if (!blockchain.rpc) throw new Error('RPC not available');

    if (!base.latest?.block?.header?.height) {
      try {
        const latest = await blockchain.rpc.getBaseBlockLatest();
        if (latest?.block?.header?.height) base.latest = latest;
      } catch {
        // ignore
      }
    }

    let retries = 0;
    while (!base.latest?.block?.header?.height) {
      if (retries++ > 10) throw new Error('Node not responding');
      await new Promise((r) => setTimeout(r, 500));
    }

    const currentHeight = Number(base.latest.block.header.height);
    const startHeight = Math.max(currentHeight - blocksLimit.value + 1, 1);

    const rawBlocks = await Promise.all(
      Array.from({ length: currentHeight - startHeight + 1 }, (_, i) => currentHeight - i).map(
        (h) => blockchain.rpc.getBaseBlockAt(String(h)).catch(() => null)
      )
    );

    const valid = rawBlocks.filter(Boolean);
    const nodeBlocks: ApiBlockItem[] = valid.map((block, idx) =>
      rpcBlockToApiItem(block, valid[idx + 1] ?? null)
    );

    return {
      blocks: nodeBlocks,
      total: currentHeight,
      totalPages: Math.ceil(currentHeight / blocksLimit.value),
    };
  }

  // ── Primary load ──────────────────────────────────────────────────────────

  async function loadBlocks() {
    loadingBlocks.value = true;
    fallbackError.value = '';

    try {
      const url = `/api/v1/blocks?chain=${apiChainName.value}&page=${blocksPage.value}&limit=${blocksLimit.value}`;
      const response = await fetch(url);
      const text = await response.text();
      if (!text) throw new Error('Empty response from API');
      const result = JSON.parse(text);

      if (!response.ok) throw new Error('Server returned error status');

      blocks.value = (result.data || []).map((b: any) => ({
        ...b,
        block_production_time: b.block_production_time ?? b.production_time ?? b.block_time ??
          b.blockTime ?? b.avg_block_time ?? b.time_diff ?? b.timeDiff ?? b.duration ?? 0,
        transaction_count: Number(
          b.transaction_count ?? b.tx_count ?? b.txCount ?? b.num_txs ?? b.txs ?? 0
        ),
      }));
      blocksTotal.value = result.meta?.total || 0;
      blocksTotalPages.value = result.meta?.totalPages || 0;
      avgBlockProductionTime.value =
        result.meta?.avgBlockProductionTime != null
          ? Number(result.meta.avgBlockProductionTime).toFixed(2)
          : null;
      isNodeFallback.value = false;
    } catch (serverError) {
      console.warn('[Blocks] Server failed, trying node fallback…', serverError);
      try {
        isNodeFallback.value = true;
        const data = await loadBlocksFromNode();
        blocks.value = data.blocks;
        blocksTotal.value = data.total;
        blocksTotalPages.value = data.totalPages;
      } catch (nodeError: any) {
        console.error('[Blocks] Node fallback also failed:', nodeError);
        fallbackError.value = nodeError.message || 'Both server and node are unavailable';
      }
    } finally {
      loadingBlocks.value = false;
    }
  }

  // ── Live updates ──────────────────────────────────────────────────────────

  watch(
    () => base.latest?.block?.header?.height,
    async (newVal, oldVal) => {
      if (!newVal || newVal === oldVal) return;
      const newH = Number(newVal);

      // Fast-path: use already-loaded base.latest data
      tryPrependFromBaseLatest();

      // If that wasn't enough (height gap > 1), do a network fetch
      if (
        blocks.value.length > 0 &&
        newH > lastKnownHeight.value &&
        newH > Number(blocks.value[0]?.height || 0)
      ) {
        lastKnownHeight.value = newH;
        await prependBlock(newH);
      }
    }
  );

  return {
    blocks,
    loadingBlocks,
    blocksPage,
    blocksLimit,
    blocksTotal,
    blocksTotalPages,
    avgBlockProductionTime,
    isNodeFallback,
    fallbackError,
    loadBlocks,
    getBlockProductionTime,
  };
}
