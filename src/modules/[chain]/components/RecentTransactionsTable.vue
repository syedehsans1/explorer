<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import { useFormatter } from '@/stores';
import { formatTxType } from '../utils/formatters';
import FallbackBanner from './FallbackBanner.vue';

defineProps<{
  chain: string;
  transactions: any[];
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
      <div class="text-lg font-semibold text-main ml-5">{{ $t('module.rtx') }}</div>
      <RouterLink
        :to="`/${chain}/tx`"
        class="hover:text-warning/70 text-sm flex items-center transition-colors duration-200 mr-5"
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
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('tx.tx_hash') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('block.block') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('staking.status') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.type') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('block.fees') }}</th>
            <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200">{{ $t('account.time') }}</th>
          </tr>
        </thead>

        <!-- Empty state -->
        <tbody v-if="!transactions.length">
          <tr>
            <td colspan="6" class="py-8 text-center text-gray-500">No transactions found</td>
          </tr>
        </tbody>

        <!-- Rows with slide-in animation -->
        <TransitionGroup v-else name="tx-slide" tag="tbody">
          <tr
            v-for="tx in transactions"
            :key="tx.hash"
            class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0"
          >
            <td class="truncate text-[#153cd8]" style="max-width: 10rem">
              <RouterLink
                class="truncate hover:underline"
                :to="`/${chain}/tx/${tx.hash}`"
              >
                {{ tx.hash }}
              </RouterLink>
            </td>
            <td class="text-sm text-[#153cd8]">
              <RouterLink :to="`/${chain}/blocks/${tx.block_height}`" class="hover:underline">
                {{ tx.block_height }}
              </RouterLink>
            </td>
            <td>
              <span
                class="text-xs truncate py-1 px-3 rounded-full"
                :class="
                  (isNodeFallback && tx.status == 0) || tx.status || tx.tx_response?.code === 0
                    ? 'bg-[#60BC29]/10 text-[#60BC29]'
                    : 'bg-[#E03834]/10 text-[#E03834]'
                "
              >
                {{
                  (isNodeFallback && tx.status == 0) || tx.status || tx.tx_response?.code === 0
                    ? 'Success'
                    : 'Failed'
                }}
              </span>
            </td>
            <td>{{ formatTxType(tx.type) }}</td>
            <td>{{ format.formatTokens([{ amount: tx.fee, denom: 'upokt' }]) }}</td>
            <td class="text-sm">{{ format.toDay(tx.timestamp, 'from') }}</td>
          </tr>
        </TransitionGroup>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tx-slide-enter-active { transition: all 0.4s ease; }
.tx-slide-enter-from { opacity: 0; transform: translateY(-12px); }
.tx-slide-enter-to { opacity: 1; transform: translateY(0); }

.tx-slide-leave-active { transition: all 0.3s ease; }
.tx-slide-leave-from { opacity: 1; }
.tx-slide-leave-to { opacity: 0; transform: translateY(8px); }

.tx-slide-move { transition: transform 0.4s ease; }
</style>
