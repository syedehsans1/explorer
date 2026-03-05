<script lang="ts" setup>
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useIndexModule } from '../indexStore';
import { useNetworkStatus } from '../composables/useNetworkStatus';
import { useFormatter, useParamStore } from '@/stores';
import StatCard from './StatCard.vue';
import type { ChainStatus } from '../types';

const props = defineProps<{
  chain: string;
  avgBlockProductionTime: string | null;
  ticker: { trade_url?: string } | undefined;
  isIndexerBehind: boolean;
  currentChainIndexerStatus: ChainStatus | null;
}>();

const store = useIndexModule();
const format = useFormatter();
const paramStore = useParamStore();
const { currentBlockHeight, latestBlockTime, averageTxPerBlock } = useNetworkStatus();

const md = computed(() => store.coinInfo?.market_data);
const symbol = computed(() => store.coinInfo?.symbol?.toUpperCase() || '');
const priceChange = computed(() => md.value?.price_change_percentage_24h || 0);
const athChange = computed(() => md.value?.ath_change_percentage?.usd || 0);
const atlChange = computed(() => md.value?.atl_change_percentage?.usd || 0);

function pct(v: number) { return v > 0 ? 'text-[#60BC29]' : 'text-[#EE6161]'; }
function sign(v: number) { return v > 0 ? '+' : ''; }
</script>

<template>
  <div class="bg-base-100 dark:bg-[#1a1f26] pt-[6.5rem]">

    <!-- Indexer lag alert -->
    <div
      v-if="isIndexerBehind && currentChainIndexerStatus"
      class="mx-4 mt-2 mb-2 px-4 py-2 rounded-lg bg-amber-500/10 dark:bg-amber-500/20
             border border-amber-500/30 dark:border-amber-500/40 flex items-center gap-2 text-sm"
    >
      <Icon icon="mdi:clock-alert-outline" class="text-amber-500 dark:text-amber-400 flex-shrink-0" />
      <div class="flex-1 text-amber-700 dark:text-amber-300">
        <span class="font-medium">Indexer catching up:</span>
        <span class="ml-1">
          {{ format.formatNumber(currentChainIndexerStatus.latest_height - currentChainIndexerStatus.monitoring_height) }}
          blocks behind
        </span>
        <span v-if="currentChainIndexerStatus.latest_height > 0" class="ml-1 text-xs opacity-75">
          ({{ Math.round(((currentChainIndexerStatus.latest_height - currentChainIndexerStatus.monitoring_height) / currentChainIndexerStatus.latest_height) * 100) }}% remaining)
        </span>
      </div>
    </div>

    <!-- ── Desktop layout (lg+) ──────────────────────────────────────────── -->
    <div class="desktop-home flex flex-1 gap-8">

      <!-- Network Status -->
      <div class="w-[45%] py-2">
        <div class="text-lg font-semibold text-main">Network Status</div>
        <div class="grid grid-cols-3 gap-2 my-2">
          <StatCard icon="mdi:cube-scan" label="Current Block Height" :href="`/${chain}/blocks/${currentBlockHeight}`">
            {{ currentBlockHeight }}
          </StatCard>
          <StatCard icon="mdi:server-network" label="Consensus Nodes">
            {{ paramStore.nodeVersion?.items?.length || '0' }}
          </StatCard>
          <StatCard icon="mdi:timer-outline" label="Avg Block Time (24h)">
            {{ avgBlockProductionTime || 0 }}s
          </StatCard>
        </div>
        <div class="flex gap-2">
          <div class="w-2/3">
            <StatCard icon="mdi:clock-outline" label="Latest Block Time">{{ latestBlockTime }}</StatCard>
          </div>
          <div class="w-1/3">
            <StatCard icon="mdi:chart-box-outline" label="Avg TX Per Block (24h)">{{ averageTxPerBlock }}</StatCard>
          </div>
        </div>
      </div>

      <!-- Market Data -->
      <div class="w-[65%] p-2" style="z-index: 1">
        <div class="text-lg font-semibold text-main">Market Data</div>
        <div class="flex gap-2">
          <div class="w-[90%]">
            <div class="grid grid-cols-3 gap-2 my-2">
              <StatCard icon="mdi:swap-horizontal" label="24h Volume">
                ${{ format.formatNumber(md?.total_volume?.usd || 0, '123,456,789.[00]') }}
              </StatCard>
              <StatCard icon="mdi:chart-pie" label="Market Cap">
                ${{ format.formatNumber(md?.market_cap?.usd || 0, '123,456,789.[00]') }}
              </StatCard>
              <StatCard icon="mdi:coins" :label="`Circulating Supply (${symbol})`">
                {{ format.formatNumber(md?.circulating_supply || 0, '123,456,789.[]') }}
              </StatCard>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <StatCard icon="mdi:trophy" label="24h High / Low">
                <span class="text-xs text-[#60BC29]">${{ md?.high_24h?.usd?.toFixed(6) || '0.00' }}</span>
                <span class="mx-1">/</span>
                <span class="text-xs text-[#EE6161]">${{ md?.low_24h?.usd?.toFixed(6) || '0.00' }}</span>
              </StatCard>
              <StatCard icon="mdi:trending-up" label="All Time High">
                <span class="text-xs ml-1" :class="pct(athChange)">({{ md?.ath_change_percentage?.usd?.toFixed(2) || '0.00' }}%)</span>
                ${{ md?.ath?.usd?.toFixed(6) || '0.00' }}
              </StatCard>
              <StatCard icon="mdi:trending-down" label="All Time Low">
                <span class="text-xs ml-1" :class="pct(atlChange)">({{ md?.atl_change_percentage?.usd?.toFixed(2) || '0.00' }}%)</span>
                ${{ md?.atl?.usd?.toFixed(6) || '0.00' }}
              </StatCard>
            </div>
          </div>

          <!-- Buy card -->
          <div class="flex flex-col w-[25%] p-6 mt-2 rounded-2xl justify-between items-center
                      bg-gradient-to-br from-[#1f3fbf] via-[#2447d6] to-[#1a2f8f]
                      shadow-lg hover:shadow-xl transition-all duration-300">
            <img src="https://pocket.network/wp-content/uploads/2025/01/logo-white.png" alt="Pocket Network logo" class="w-2/3" />
            <div class="flex flex-col items-center mx-auto">
              <div class="text-xl text-center text-white">${{ md?.current_price?.usd?.toFixed(6) || '0.00' }}</div>
              <div class="text-sm text-end" :class="pct(priceChange)">
                {{ sign(priceChange) }}{{ md?.price_change_percentage_24h?.toFixed(2) || '0.00' }}%
              </div>
            </div>
            <a class="btn btn-sm w-full !text-black !bg-[#ffd60a] !border-[#ffd60a]" :href="ticker?.trade_url" target="_blank">
              {{ $t('index.buy') }} {{ symbol || 'COIN' }}
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Mobile / Tablet layout ──────────────────────────────────────────── -->
    <div class="flex mt-4 mb-2 w-full flex-col lg:flex-row gap-4 bg-base-100 dark:bg-[#1a1f26]">

      <!-- Network Status (mobile) -->
      <div class="mobile-home p-2 w-full lg:w-2/3">
        <div class="text-lg font-semibold text-main">Network Status</div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 my-2">
          <StatCard icon="mdi:cube-scan" label="Current Block Height" :href="`/${chain}/blocks/${currentBlockHeight}`">
            {{ currentBlockHeight }}
          </StatCard>
          <StatCard icon="mdi:server-network" label="Consensus Nodes">
            {{ paramStore.nodeVersion?.items?.length || '0' }}
          </StatCard>
          <StatCard icon="mdi:timer-outline" label="Avg Block Time (24h)">
            {{ avgBlockProductionTime || 0 }}s
          </StatCard>
        </div>
        <div class="flex gap-2 flex-col md:flex-row">
          <StatCard icon="mdi:clock-outline" label="Latest Block Time">{{ latestBlockTime }}</StatCard>
          <StatCard icon="mdi:chart-box-outline" label="Avg TX Per Block (24h)">{{ averageTxPerBlock }}</StatCard>
        </div>
      </div>

      <!-- Market Data (mobile) -->
      <div class="mobile-home p-2 w-full lg:w-1/3">
        <div class="text-lg font-semibold text-main">Market Data</div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 my-2">
          <StatCard icon="mdi:swap-horizontal" label="24h Volume">
            ${{ format.formatNumber(md?.total_volume?.usd || 0, '123,456,789.[00]') }}
          </StatCard>
          <StatCard icon="mdi:chart-pie" label="Market Cap">
            ${{ format.formatNumber(md?.market_cap?.usd || 0, '123,456,789.[00]') }}
          </StatCard>
          <StatCard icon="mdi:coins" :label="`Circulating Supply (${symbol})`">
            {{ format.formatNumber(md?.circulating_supply || 0, '123,456,789.[]') }}
          </StatCard>
          <StatCard icon="mdi:trophy" label="24h High / Low">
            <span class="text-xs text-[#60BC29]">${{ md?.high_24h?.usd?.toFixed(6) || '0.00' }}</span>
            <span class="mx-1">/</span>
            <span class="text-xs text-[#EE6161]">${{ md?.low_24h?.usd?.toFixed(6) || '0.00' }}</span>
          </StatCard>
          <StatCard icon="mdi:trending-up" label="All Time High">
            <span class="text-xs ml-1" :class="pct(athChange)">({{ md?.ath_change_percentage?.usd?.toFixed(2) || '0.00' }}%)</span>
            ${{ md?.ath?.usd?.toFixed(6) || '0.00' }}
          </StatCard>
          <StatCard icon="mdi:trending-down" label="All Time Low">
            <span class="text-xs ml-1" :class="pct(atlChange)">({{ md?.atl_change_percentage?.usd?.toFixed(2) || '0.00' }}%)</span>
            ${{ md?.atl?.usd?.toFixed(6) || '0.00' }}
          </StatCard>

          <!-- Buy card (mobile) -->
          <div class="flex flex-col w-full gap-2 p-3 mt-3 rounded-xl justify-center items-center
                      bg-gradient-to-br from-[#1f3fbf] via-[#2447d6] to-[#1a2f8f]
                      shadow-lg hover:shadow-xl transition-all duration-300">
            <img src="https://pocket.network/wp-content/uploads/2025/01/logo-white.png" alt="Pocket Network logo" class="w-24" />
            <div class="text-sm text-center text-white">${{ md?.current_price?.usd?.toFixed(6) || '0.00' }}</div>
            <div class="text-xs" :class="pct(priceChange)">
              {{ sign(priceChange) }}{{ md?.price_change_percentage_24h?.toFixed(2) || '0.00' }}%
            </div>
            <a class="btn btn-sm w-full !text-white !bg-[#ffd60a] !border-[#ffd60a]" :href="ticker?.trade_url" target="_blank">
              {{ $t('index.buy') }} {{ symbol || 'COIN' }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-home { display: none; }
.mobile-home  { display: block; }

@media (min-width: 1024px) {
  .desktop-home { display: flex; }
  .mobile-home  { display: none; }
}
</style>
