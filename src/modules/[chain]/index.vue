<script lang="ts" setup>
import { computed, ref, toRef, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useBlockchain, useWalletStore, useParamStore } from '@/stores';
import { useSEO } from '@/composables/useSEO';
import ProposalListItem from '@/components/ProposalListItem.vue';
import ArrayObjectElement from '@/components/dynamic/ArrayObjectElement.vue';
import { useIndexModule } from './indexStore';

import { useChainName } from './composables/useChainName';
import { useNetworkStatus } from './composables/useNetworkStatus';
import { useIndexerHealth } from './composables/useIndexerHealth';
import { useBlocksData } from './composables/useBlocksData';
import { useTransactionsData } from './composables/useTransactionsData';
import { useNetworkStats } from './composables/useNetworkStats';
import { useNetworkGrowthChart } from './composables/useNetworkGrowthChart';
import { useTxHistoryChart } from './composables/useTxHistoryChart';

import DashboardHeader from './components/DashboardHeader.vue';
import NetworkStatsGrid from './components/NetworkStatsGrid.vue';
import NetworkGrowthChartSection from './components/NetworkGrowthChartSection.vue';
import TxHistoryChartSection from './components/TxHistoryChartSection.vue';
import LatestBlocksTable from './components/LatestBlocksTable.vue';
import RecentTransactionsTable from './components/RecentTransactionsTable.vue';

const props = defineProps(['chain']);
const blockchain = useBlockchain();
const store = useIndexModule();
const walletStore = useWalletStore();
const paramStore = useParamStore();

const chainDisplayName = computed(() => blockchain.current?.chainName || props.chain || 'Pocket Network');
useSEO({
  title: `${chainDisplayName.value} Dashboard`,
  description: `Explore the ${chainDisplayName.value} blockchain dashboard. View real-time blocks, transactions, validators, network statistics, and node runner performance on the Pocket Network Explorer.`,
  keywords: `${chainDisplayName.value}, blockchain dashboard, network statistics, validators, node runners`,
});

const { apiChainName } = useChainName(toRef(props, 'chain'));
const { isIndexerBehind, currentChainIndexerStatus, startPolling: startHealthPolling, loadIndexerHealth } = useIndexerHealth(apiChainName);
const { blocks, loadingBlocks, avgBlockProductionTime, isNodeFallback: isBlocksNodeFallback, fallbackError: blocksFallbackError, loadBlocks } = useBlocksData(apiChainName);
const { transactions: dashboardTxs, isNodeFallback: isTxsNodeFallback, fallbackError: txsFallbackError, loadTransactions } = useTransactionsData(apiChainName);
const { networkStats, totalRelays24h, totalComputeUnits24h, loadNetworkStats, load24hServicesSummary } = useNetworkStats(apiChainName);
const { activeValidatorsCount } = useNetworkStatus();

const growth = useNetworkGrowthChart(apiChainName, networkStats);
const txHistory = useTxHistoryChart(apiChainName);

const ticker = computed(() => store.coinInfo.tickers[store.tickerIndex]);

const currName = ref('');
blockchain.$subscribe((_m, s) => {
  if (s.chainName !== currName.value) {
    currName.value = s.chainName;
    store.loadDashboard();
    walletStore.loadMyAsset();
    paramStore.handleAbciInfo();
    load24hServicesSummary();
    loadIndexerHealth();
  }
});

onMounted(async () => {
  store.loadDashboard();
  walletStore.loadMyAsset();
  paramStore.handleAbciInfo();

  await Promise.allSettled([
    loadBlocks(),
    loadTransactions(),
    loadNetworkStats().then(() => growth.loadChartData()),
    load24hServicesSummary(),
    txHistory.loadTransactionHistory(),
  ]);

  startHealthPolling(30_000);
});
</script>

<template>
  <div>
    <DashboardHeader
      :chain="chain"
      :avg-block-production-time="avgBlockProductionTime"
      :ticker="ticker"
      :is-indexer-behind="isIndexerBehind"
      :current-chain-indexer-status="currentChainIndexerStatus"
    />

    <NetworkStatsGrid
      :stats="networkStats"
      :total-relays24h="totalRelays24h"
      :total-compute-units24h="totalComputeUnits24h"
      :active-validators-count="activeValidatorsCount"
    />

    <div v-if="blockchain.supportModule('governance')" class="bg-base-100 px-4 pt-3 pb-4 rounded-md shadow-md border-t-4 border-accent">
      <div class="flex items-center mb-4">
        <Icon icon="mdi:gavel" class="text-2xl text-accent mr-2" />
        <div class="text-lg font-semibold text-main">Active Proposals</div>
      </div>
      <ProposalListItem :proposals="store?.proposals" />
      <div v-if="!store.proposals?.proposals?.length" class="py-8 text-center">
        <Icon icon="mdi:vote-outline" class="text-4xl text-accent/40 mb-2" />
        <div class="text-secondary">No active proposals at this time</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
      <NetworkGrowthChartSection
        :chart-options="growth.chartOptions.value"
        :active-series="growth.activeSeries.value"
        :chart-categories="growth.chartCategories.value"
        :tab="growth.tab.value"
        :chart-type="growth.chartType.value"
        :performance-metric="growth.performanceMetric.value"
        :window-days="growth.windowDays.value"
        @update:tab="growth.tab.value = $event"
        @update:chart-type="growth.chartType.value = $event"
        @update:performance-metric="growth.performanceMetric.value = $event"
        @update:window-days="growth.windowDays.value = $event"
      />
      <TxHistoryChartSection
        :chart-options="txHistory.chartOptions.value"
        :series="txHistory.series.value"
        :chart-type="txHistory.chartType.value"
        :window-days="txHistory.windowDays.value"
        @update:chart-type="txHistory.chartType.value = $event"
        @update:window-days="txHistory.windowDays.value = $event"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
      <LatestBlocksTable :chain="chain" :blocks="blocks" :loading="loadingBlocks" :is-node-fallback="isBlocksNodeFallback" :fallback-error="blocksFallbackError" />
      <RecentTransactionsTable :chain="chain" :transactions="dashboardTxs" :is-node-fallback="isTxsNodeFallback" :fallback-error="txsFallbackError" />
    </div>

    <div v-if="!store.coingeckoId" class="bg-base-100 px-4 pt-3 pb-4 rounded-md shadow-md border-t-4 border-accent mt-5">
      <div class="flex items-center mb-4">
        <Icon icon="mdi:server" class="text-2xl text-accent mr-2" />
        <div class="text-lg font-semibold text-main">Node Information</div>
      </div>
      <div class="bg-base-200 rounded-md p-4">
        <ArrayObjectElement :value="paramStore.nodeVersion?.items" :thead="false" />
      </div>
    </div>
  </div>
</template>

<route>
  {
    meta: {
      i18n: 'dashboard',
      order: 1,
    }
  }
</route>
