<script lang="ts" setup>
import StatCard from './StatCard.vue';
import { formatCompact } from '../utils/formatters';
import type { NetworkStats } from '../types';

defineProps<{
  stats: NetworkStats;
  totalRelays24h: number;
  totalComputeUnits24h: number;
  activeValidatorsCount: string;
}>();
</script>

<template>
  <div class="bg-base-100 dark:bg-[#1a1f26] pt-3 pb-4 mt-2">
    <div class="text-lg font-semibold text-main mb-4">Network Statistics</div>
    <div class="grid grid-cols-2 md:grid-cols-8 gap-4">
      <StatCard icon="mdi:wallet" label="Total Wallets">
        {{ stats.wallets.toLocaleString() }}
      </StatCard>
      <StatCard icon="mdi:apps" label="Applications">
        {{ stats.applications.toLocaleString() }}
      </StatCard>
      <StatCard icon="mdi:package-variant" label="Suppliers">
        {{ stats.suppliers.toLocaleString() }}
      </StatCard>
      <StatCard icon="mdi:gate" label="Gateways">
        {{ stats.gateways.toLocaleString() }}
      </StatCard>
      <StatCard icon="mdi:handshake" label="Services">
        {{ stats.services.toLocaleString() }}
      </StatCard>
      <StatCard icon="mdi:network" label="Relays (24h)">
        {{ formatCompact(totalRelays24h) }}
      </StatCard>
      <StatCard icon="mdi:cpu-64-bit" label="Compute Units (24h)">
        {{ formatCompact(totalComputeUnits24h) }}
      </StatCard>
      <StatCard icon="mdi:shield-check" label="Active Validators">
        {{ activeValidatorsCount }}
      </StatCard>
    </div>
  </div>
</template>
