<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import { useFormatter } from '@/stores';
import { formatBlockTime } from '../utils/formatters';
import FallbackBanner from './FallbackBanner.vue';
import type { ApiBlockItem } from '../types';

defineProps<{
  chain: string;
  blocks: ApiBlockItem[];
  loading: boolean;
  isNodeFallback: boolean;
  fallbackError: string;
}>();

const format = useFormatter();
</script>

<template>
  <div
    class="bg-white hover:bg-base-200 pt-3 mb-5 rounded-lg shadow-md
           dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]
           border dark:border-white/10 hover:shadow-lg"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="text-lg font-semibold text-main ml-5">{{ $t('block.block') }}s</div>
      <RouterLink
        :to="`/${chain}/blocks`"
        class="hover:text-info/70 text-sm flex items-center transition-colors duration-200 mr-5"
      >
        View All
        <Icon icon="mdi:arrow-right" class="ml-1" />
      </RouterLink>
    </div>

    <!-- Fallback banner -->
    <FallbackBanner v-if="isNodeFallback" :error-message="fallbackError || undefined" />

    <!-- Table -->
    <div class="bg-base-200 rounded-md overflow-auto" style="max-height: 30rem">
      <table class="table table-compact w-full bg-base-200">
        <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0">
          <tr class="border-none bg-base-200">
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('block.block') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.hash') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('block.proposer') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('module.tx') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.time') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">
              {{ $t('account.production_time') }}
            </th>
          </tr>
        </thead>

        <!-- Loading -->
        <tbody v-if="loading">
          <tr>
            <td colspan="6" class="py-8 text-center">
              <div class="flex justify-center items-center">
                <div class="loading loading-spinner loading-md"></div>
                <span class="ml-2">Loading blocks...</span>
              </div>
            </td>
          </tr>
        </tbody>

        <!-- Rows with slide-in animation -->
        <TransitionGroup
          v-else-if="blocks.length"
          name="block-slide"
          tag="tbody"
        >
          <tr
            v-for="block in blocks"
            :key="block.height"
            class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0"
          >
            <td class="font-medium">{{ block.height }}</td>
            <td class="truncate text-[#153cd8] dark:text-warning" style="max-width: 12rem">
              <RouterLink
                class="truncate hover:underline"
                :title="block.hash"
                :to="`/${chain}/blocks/${block.height}`"
              >
                {{ block.hash || block.id?.split(':')[1] }}
              </RouterLink>
            </td>
            <td class="truncate" style="max-width: 8rem">
              <span :title="format.validator(block.proposer)" class="truncate">
                {{ format.validator(block.proposer) }}
              </span>
            </td>
            <td>{{ (block.transaction_count ?? 0).toLocaleString() }}</td>
            <td class="text-sm">{{ format.toDay(block.timestamp, 'from') }}</td>
            <td>{{ formatBlockTime(block.block_production_time) }}</td>
          </tr>
        </TransitionGroup>

        <!-- Empty -->
        <tbody v-else>
          <tr>
            <td colspan="6" class="text-center py-4">No blocks found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.block-slide-enter-active { transition: all 0.4s ease; }
.block-slide-enter-from { opacity: 0; transform: translateY(-10px); }
.block-slide-enter-to { opacity: 1; transform: translateY(0); }

.block-slide-leave-active { transition: all 0.3s ease; }
.block-slide-leave-from { opacity: 1; }
.block-slide-leave-to { opacity: 0; transform: translateY(6px); }

.block-slide-move { transition: transform 0.4s ease; }
</style>
