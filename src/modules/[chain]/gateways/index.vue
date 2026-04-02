<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useBlockchain, useFormatter } from '@/stores';
import { PageRequest, type Pagination, type Gateway } from '@/types';
import type { PaginatedBalances } from '@/types/bank';
import TablePagination from '@/components/TablePagination.vue';

const props = defineProps<{ chain: string }>();

const chainStore = useBlockchain();
const format = useFormatter();

const list = ref<Gateway[]>([]);
const loading = ref(false);
const pageRequest = ref(new PageRequest());
const pageResponse = ref({} as Pagination);
const balanceLoading = ref<Record<string, boolean>>({});

const currentPage = ref(1);
const itemsPerPage = ref(25);

// 🔹 Server-side pagination logic
const totalPages = computed(() => {
  const total = parseInt(pageResponse.value.total || '0');
  if (total === 0) return 0;
  return Math.ceil(total / itemsPerPage.value);
});

const totalGateways = computed(() => parseInt(pageResponse.value.total || '0'));

// 🔹 Client-side sorting (applied after server returns page data)
const sortedList = computed(() => {
  return [...list.value].sort((a, b) => {
    const aValue = parseInt(a.stake.amount || '0');
    const bValue = parseInt(b.stake.amount || '0');
    return bValue - aValue; // descending order
  });
});

// 🔹 Watch for page changes
watch(currentPage, () => {
  loadGateways();
});

// 🔹 Watch for page size changes
watch(itemsPerPage, () => {
  currentPage.value = 1;
  loadGateways();
});

// 🔹 Load data from RPC
async function loadGateways() {
  if (!chainStore.rpc) {
    await waitForRpc();
  }

  loading.value = true;
  try {
    pageRequest.value.setPageSize(itemsPerPage.value);
    pageRequest.value.setPage(currentPage.value);
    pageRequest.value.count_total = true;

    const response = await chainStore.rpc.getGateways(pageRequest.value);
    list.value = response.gateways || [];
    pageResponse.value = response.pagination || {};

    // 🔹 Trigger async, batched balance fetching (non-blocking for main loading state)
    fetchBalancesInBatches().catch((e) => {
      console.error('Error fetching gateway balances in batches:', e);
    });
  } catch (error) {
    console.error('Error loading gateways:', error);
    list.value = [];
    pageResponse.value = {} as Pagination;
  } finally {
    loading.value = false;
  }
}

async function waitForRpc() {
  while (!chainStore.rpc) {
    console.log('⏳ Waiting for chainStore.rpc...');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// 🔹 Fetch balances concurrently in batches of 10 without blocking table render
async function fetchBalancesInBatches() {
  if (!chainStore.rpc) {
    await waitForRpc();
  }

  const itemsNeedingBalance = list.value.filter(
    (gw) => !gw.balance || !gw.balance.amount
  );

  const batchSize = 10;

  for (let i = 0; i < itemsNeedingBalance.length; i += batchSize) {
    const batch = itemsNeedingBalance.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (gw) => {
        const key = gw.address;
        if (!key) return;

        balanceLoading.value[key] = true;

        try {
          const bal: PaginatedBalances = await chainStore.rpc!.getBankBalances(
            gw.address
          );
          const upokt =
            bal.balances.find((b) => b.denom === 'upokt') || {
              denom: 'upokt',
              amount: '0',
            };
          gw.balance = upokt;
        } catch (e) {
          console.error('Error fetching balance for', gw.address, e);
          gw.balance = gw.balance || { denom: 'upokt', amount: '0' };
        } finally {
          balanceLoading.value[key] = false;
        }
      })
    );
  }
}

// add this helper to compute gateway status (Staked / Unstaked) with classes
function getGatewayStatus(item: any) {
  if (!item) return { label: '-', classes: '' }
  const raw = (item.status || item.state || '').toString()
  const s = raw.toLowerCase()
  // explicit indicators for unbonding/unstaking
  if (s.includes('unbond') || s.includes('unstak') || item.unbonding_time || item.unbonding_height) {
    return { label: 'Unstaked', classes: 'bg-[#E03834]/10 text-[#E03834]' }
  }
  // treat as staked if status mentions bond/stake or stake amount > 0
  const stakeAmt = Number(item.stake?.amount || '0')
  if (s.includes('bond') || s.includes('stake') || stakeAmt > 0) {
    return { label: 'Staked', classes: 'bg-[#60BC29]/10 text-[#60BC29]' }
  }
  return { label: '-', classes: '' }
}

function setCurrentPage(page: number) {
  currentPage.value = page;
}

function setItemsPerPage(size: number) {
  itemsPerPage.value = size;
}

// 🔹 Status text
const value = ref('stake');
const statusText = computed(() => (value.value === 'stake' ? 'Staked' : 'Unstaked'));

// 🔹 On mount load first page
onMounted(() => {
  loadGateways();
});
</script>

<template>
  <div class="mb-[2vh] pt-[6.5rem]">
    <p class="bg-[#ffffff] hover:bg-base-200 text-2xl w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">Gateways</p>
    <div class="bg-base-200 pb-2 px-2 pt-2 rounded-xl hover:bg-base-300 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
      <div class="overflow-auto" style="max-height:calc(100vh - 18rem)">
      <table class="table w-full table-compact">
        <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0 border-0">
          <tr class="text-sm font-semibold bg-base-200">
            <th>Rank</th>
            <th>Address</th>
            <th>Status</th>
            <th>Stake</th>
            <th>Balance</th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="loading" class="text-center">
            <td colspan="5" class="py-8">
              <div class="flex justify-center items-center">
                <div class="loading loading-spinner loading-md"></div>
                <span class="ml-2">Loading gateways...</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="sortedList.length === 0" class="text-center">
            <td colspan="5" class="py-8">
              <div class="text-gray-500">No gateways found</div>
            </td>
          </tr>
          <tr v-else v-for="(item, index) in sortedList" :key="item.address"
            class="hover:bg-gray-100 dark:hover:bg-[rgba(255,255,255,0.06)] dark:bg-base-200 bg-white border-0 rounded-xl">
            <td>{{ index + 1 + (currentPage - 1) * itemsPerPage }}</td>

            <td>
              <div class="flex flex-col">
                <RouterLink :to="`/${chainStore.chainName}/account/${item?.address}`"
                  class="text-sm text-[#09279F] dark:invert font-medium truncate">
                  {{ item.address }}
                </RouterLink>
                <span class="text-xs text-gray-500 truncate">{{ item.address }}</span>
              </div>
            </td>
            <td class="">
              <span class="text-xs truncate py-1 px-3 rounded-full inline-flex items-center gap-2"
                :class="getGatewayStatus(item).classes">
                {{ getGatewayStatus(item).label }}
              </span>
            </td>
            <td class="font-bold dark:text-secondary">{{ format.formatToken(item.stake) }}</td>
            <td class="dark:text-secondary">
              <span v-if="balanceLoading[item.address] && !item.balance">
                <span class="loading loading-spinner loading-xs"></span>
              </span>
              <span v-else>
                {{ item.balance ? format.formatToken(item.balance) : '-' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <TablePagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="totalGateways"
        :items-per-page="itemsPerPage"
        item-label="gateways"
        :page-size-options="[10, 25, 50, 100]"
        @update:current-page="setCurrentPage"
        @update:items-per-page="setItemsPerPage"
      />
    </div>
  </div>
</template>

<route>
  {
    meta: {
      i18n: 'gateways',
      order: 6
    }
  }
</route>
