<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useBlockchain, useFormatter } from '@/stores';
import { PageRequest, type Pagination, type Supplier } from '@/types';
import type { PaginatedBalances } from '@/types/bank'
import { Icon } from '@iconify/vue'
import TablePagination from '@/components/TablePagination.vue';
const props = defineProps(['chain']);
const blockchain = useBlockchain()

const format = useFormatter();
const chainStore = useBlockchain();

const list = ref<Supplier[]>([]);
const loading = ref(false);
const pageRequest = ref(new PageRequest());
const pageResponse = ref<Pagination>({} as Pagination);
const balanceLoading = ref<Record<string, boolean>>({});

// 🔹 Pagination state
const currentPage = ref(1);
const itemsPerPage = ref(25);

// 🔹 Server-side pagination logic
const totalPages = computed(() => {
  const total = parseInt(pageResponse.value.total || '0');
  if (total === 0) return 0;
  return Math.ceil(total / itemsPerPage.value);
});

const totalSuppliers = computed(() => parseInt(pageResponse.value.total || '0'));

// Filter and sort state
const statusFilter = ref<string>('all');
const servicesFilter = ref<string>('all');
const sortBy = ref<'stake' | 'services'>('stake');
const sortOrder = ref<'desc' | 'asc'>('desc');

// Server handles all filtering and sorting
const sortedList = computed(() => list.value)

// 🔹 Watch for page changes
watch(currentPage, () => {
  loadSuppliers();
});

// 🔹 Watch for page size changes
watch(itemsPerPage, () => {
  currentPage.value = 1;
  loadSuppliers();
});

// 🔹 Watch for filter/sort changes — reset to page 1 and reload
watch(statusFilter, () => { currentPage.value = 1; loadSuppliers(); });
watch(servicesFilter, () => { currentPage.value = 1; loadSuppliers(); });
watch(sortBy, () => { currentPage.value = 1; loadSuppliers(); });
watch(sortOrder, () => { currentPage.value = 1; loadSuppliers(); });

// 🔹 Load data from API (server-side filter, sort, pagination)
async function loadSuppliers() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('chain', apiChainName.value);
    params.append('page', currentPage.value.toString());
    params.append('limit', itemsPerPage.value.toString());
    params.append('sort_by', sortBy.value);
    params.append('sort_order', sortOrder.value);

    // Status filter — map UI values to API values
    if (statusFilter.value !== 'all') {
      params.append('status', statusFilter.value); // 'staked'|'unstaking'|'unstaked' — backend maps 'unstaking'→'unstake_requested'
    }

    // Services count filter
    if (servicesFilter.value === 'high') {
      params.append('min_services', '5');
    } else if (servicesFilter.value === 'medium') {
      params.append('min_services', '2');
      params.append('max_services', '4');
    } else if (servicesFilter.value === 'none') {
      params.append('max_services', '0');
    }

    const apiRes = await fetch(`/api/v1/suppliers?${params.toString()}`);
    const apiData = await apiRes.json();

    if (apiRes.ok && apiData.data) {
      list.value = apiData.data.map((item: any) => ({
        operator_address: item.address,
        owner_address: item.owner_address || '',
        stake: {
          denom: item.stake_denom || 'upokt',
          amount: (item.staked_amount || '0').toString()
        },
        services: (item.service_ids || []).map((id: string) => ({ service_id: id, service_name: '' })),
        status: item.status,
        unstake_session_end_height: item.unstake_session_end_height,
        balance: undefined
      }));
      pageResponse.value = {
        total: apiData.meta?.total?.toString() || '0',
        next_key: undefined
      };
      // 🔹 Fetch balances async without blocking render
      fetchBalancesInBatches().catch((e) => {
        console.error('Error fetching supplier balances in batches:', e);
      });
    } else {
      console.error('Error loading suppliers from API:', apiData);
      list.value = [];
      pageResponse.value = {} as Pagination;
    }
  } catch (error) {
    console.error('Error loading suppliers:', error);
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
    (s) => !s.balance || !s.balance.amount
  );

  const batchSize = 10;

  for (let i = 0; i < itemsNeedingBalance.length; i += batchSize) {
    const batch = itemsNeedingBalance.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (s) => {
        const key = s.operator_address;
        if (!key) return;

        balanceLoading.value[key] = true;

        try {
          const bal: PaginatedBalances = await chainStore.rpc!.getBankBalances(
            s.operator_address
          );
          const upokt =
            bal.balances.find((b) => b.denom === 'upokt') || {
              denom: 'upokt',
              amount: '0',
            };
          s.balance = upokt;
        } catch (e) {
          console.error('Error fetching balance for', s.operator_address, e);
          s.balance = s.balance || { denom: 'upokt', amount: '0' };
        } finally {
          balanceLoading.value[key] = false;
        }
      })
    );
  }
}

function setCurrentPage(page: number) {
  currentPage.value = page;
}

function setItemsPerPage(size: number) {
  itemsPerPage.value = size;
}

// Network Stats
const networkStats = ref({
  wallets: 0,
  applications: 0,
  suppliers: 0,
  gateways: 0,
  totalStakedTokens: 0,
  unstakingCount24h: 0,
  totalUnstakingTokens24h: 0,
})

// Cache control
const networkStatsCacheTime = ref(0)
const CACHE_EXPIRATION_MS = 60000

// Get API chain name helper
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  }
  return chainMap[chainName] || chainName || 'pocket-lego-testnet'
}

const apiChainName = computed(() =>
  getApiChainName(chainStore.current?.chainName || props.chain || 'pocket-beta')
)

// Load network stats
async function loadNetworkStats() {
  const now = Date.now()
  if (now - networkStatsCacheTime.value < CACHE_EXPIRATION_MS && networkStats.value.wallets > 0) {
    return
  }

  const pageRequest = new PageRequest()
  pageRequest.limit = 1

  try {
    // Fetch from RPC for total count
    const [suppliersData] = await Promise.all([
      blockchain.rpc.getSuppliers(pageRequest),
    ])

    networkStats.value.suppliers = parseInt(suppliersData.pagination?.total || '0')
    
    // Fetch from API for aggregate statistics (pass auth token if available)
    try {
      const accessToken = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
      const authHeaders: Record<string, string> = {}
      if (accessToken) authHeaders['Authorization'] = `Bearer ${accessToken}`

      const apiUrl = `/api/v1/suppliers?chain=${apiChainName.value}&page=1&limit=1`
      const apiRes = await fetch(apiUrl, { headers: authHeaders })
      const apiData = await apiRes.json()

      if (apiRes.ok && apiData.meta) {
        networkStats.value.totalStakedTokens = apiData.meta.totalStakedTokens || 0
        networkStats.value.unstakingCount24h = apiData.meta.unstakingCount24h || 0
      }
    } catch (apiError) {
      console.error('Error loading API stats:', apiError)
    }

    // Calculate 24h unstaking tokens: fetch unstake_requested suppliers, filter by last_seen within 24h
    try {
      const accessToken = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
      const authHeaders: Record<string, string> = {}
      if (accessToken) authHeaders['Authorization'] = `Bearer ${accessToken}`

      const unstakingUrl = `/api/v1/suppliers?chain=${apiChainName.value}&page=1&limit=500&status=unstake_requested`
      const unstakingRes = await fetch(unstakingUrl, { headers: authHeaders })
      const unstakingData = await unstakingRes.json()
      if (unstakingRes.ok && unstakingData.data) {
        const yesterday = Date.now() - 24 * 60 * 60 * 1000
        networkStats.value.totalUnstakingTokens24h = unstakingData.data
          .filter((s: any) => s.last_seen && new Date(s.last_seen).getTime() > yesterday)
          .reduce((sum: number, s: any) => sum + Number(s.staked_amount || 0), 0)
      }
    } catch (e) {
      console.error('Error computing supplier 24h unstaking tokens:', e)
    }
    
    networkStatsCacheTime.value = now
  } catch (error) {
    console.error('Error loading network stats:', error)
  }
}

// 🔹 Load data initially
onMounted(() => {
  loadSuppliers();
  loadNetworkStats();
});


// add this helper for supplier status (Staked / Unstaked / Unstaking) with classes
function getSupplierStatus(item: any) {
  if (!item) return { label: '-', classes: '' }
  const raw = (item.status || item.state || '').toString()
  const s = raw.toLowerCase()

  if (s.includes('unstake_requested') || s.includes('unstaking') || s.includes('unbonding')) {
    return { label: 'Unstaking', classes: 'bg-[#F59E0B]/10 text-[#F59E0B]' }
  }

  if (s.includes('unstaked') || s.includes('unbonded') || s.includes('inactive') || s.includes('tombstoned')) {
    return { label: 'Unstaked', classes: 'bg-[#E03834]/10 text-[#E03834]' }
  }

  if (s.includes('staked') || s.includes('bond') || s.includes('stake') || s.includes('active')) {
    return { label: 'Staked', classes: 'bg-[#60BC29]/10 text-[#60BC29]' }
  }

  const stakeAmt = Number(item.stake?.amount || '0')
  if (stakeAmt > 0) {
    return { label: 'Staked', classes: 'bg-[#60BC29]/10 text-[#60BC29]' }
  }

  // Unstaked by fallback when stake is zero
  if (stakeAmt === 0) {
    return { label: 'Unstaked', classes: 'bg-[#E03834]/10 text-[#E03834]' }
  }

  return { label: '-', classes: '' }
}

// 🔹 Computed status
const value = ref('stake');
const statusText = computed(() => (value.value === 'stake' ? 'Staked' : 'Unstaked'));
</script>

<template>
  <div class="mb-[2vh] pt-[6.5rem]">
    <p class="bg-[#ffffff] hover:bg-base-200 text-2xl w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">Suppliers</p>

    <div class="grid sm:grid-cols-1 md:grid-cols-4 py-4 gap-4 mb-4">
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Staked Suppliers</div>
          <div class="font-bold">{{ networkStats.suppliers.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Staked Tokens</div>
          <div class="font-bold">{{ format.formatToken({ denom: 'upokt', amount: networkStats.totalStakedTokens.toString() }) }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Unstaking Suppliers (24h)</div>
          <div class="font-bold">{{ networkStats.unstakingCount24h.toLocaleString() }}</div>
        </span>
      </div>
      <div class="flex bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <span>
          <div class="text-xs text-[#64748B]">Unstaking Tokens (24h)</div>
          <div class="font-bold">{{ format.formatToken({ denom: 'upokt', amount: networkStats.totalUnstakingTokens24h.toString() }) }}</div>
        </span>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="bg-[#ffffff] p-4 mb-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <div class="flex items-center gap-2 flex-wrap">
            <!-- Status Filter -->
        <div class="flex items-center gap-1.5">
          <Icon icon="mdi:check-circle-outline" class="text-base-content/60 text-sm" />
          <select
            v-model="statusFilter"
            class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-28 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <option value="all">All</option>
            <option value="staked">Staked</option>
            <option value="unstaked">Unstaked</option>
            <option value="unstaking">Unstaking</option>
          </select>
        </div>

        <!-- Services Filter -->
        <div class="flex items-center gap-1.5">
          <Icon icon="mdi:layers-outline" class="text-base-content/60 text-sm" />
          <select
            v-model="servicesFilter"
            class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-32 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <option value="all">All</option>
            <option value="high">High (5+)</option>
            <option value="medium">Medium (2-4)</option>
            <option value="none">None (0)</option>
          </select>
        </div>

        <!-- Sort By -->
        <div class="flex items-center gap-1.5">
          <Icon icon="mdi:sort" class="text-base-content/60 text-sm" />
          <select
            v-model="sortBy"
            class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-32 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]"
          >
            <option value="stake">Stake</option>
            <option value="services">Services</option>
          </select>
        </div>

        <!-- Sort Order Toggle -->
        <button
          @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
          class="btn btn-xs h-8 min-h-8 px-2 gap-1"
          :class="sortOrder === 'desc' ? 'btn-primary' : 'btn-ghost'"
          :title="sortOrder === 'desc' ? 'Descending' : 'Ascending'"
        >
          <Icon :icon="sortOrder === 'desc' ? 'mdi:sort-descending' : 'mdi:sort-ascending'" class="text-sm" />
        </button>
      </div>
    </div>

    <div
      class="bg-[#ffffff] hover:bg-base-200 p-3 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto"
    >
      <div class="overflow-auto" style="max-height:calc(100vh - 18rem)">
      <table class="table w-full table-compact rounded-xl">
        <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0 border-0">
          <tr class="text-sm font-semibold bg-base-200">
            <td>Rank</td>
            <td>Address</td>
            <td>Status</td>
            <td>Stake</td>
            <td>Balance</td>
            <td>No. Of Services</td>
            <td>Services</td>
          </tr>
        </thead>

        <tbody>
          <tr v-if="loading" class="text-center">
            <td colspan="7" class="py-8">
              <div class="flex justify-center items-center">
                <div class="loading loading-spinner loading-md"></div>
                <span class="ml-2">Loading suppliers...</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="sortedList.length === 0" class="text-center">
            <td colspan="7" class="py-8">
              <div class="text-gray-500">No suppliers found</div>
            </td>
          </tr>
          <tr
            v-else
            v-for="(item, index) in sortedList"
            :key="item.operator_address"
            class="hover:bg-gray-100 dark:hover:bg-[rgba(255,255,255,0.06)] dark:bg-base-200 bg-white border-0 rounded-xl"
          >
            <td>{{ index + 1 + (currentPage - 1) * itemsPerPage }}</td>
            <td>
              <div class="flex flex-col">
                <span class="text-sm text-[#09279F] dark:invert whitespace-nowrap overflow-hidden">
                  <RouterLink
                    :to="`/${chainStore.chainName}/account/${item?.operator_address}`"
                    class="font-weight-medium"
                  >
                    {{ item.operator_address }}
                  </RouterLink>
                </span>
                <span class="text-xs text-gray-600 dark:text-gray-400">
                  Owned by: {{ item.owner_address }}
                </span>
              </div>
            </td>
            <td class="">
              <span class="text-xs truncate py-1 px-3 rounded-full inline-flex items-center gap-2"
                :class="getSupplierStatus(item).classes">
                {{ getSupplierStatus(item).label }}
              </span>
            </td>
            <td class="font-bold dark:text-secondary">
              {{ format.formatToken(item.stake) }}
            </td>
            <td class="dark:text-secondary">
              <span v-if="balanceLoading[item.operator_address] && !item.balance">
                <span class="loading loading-spinner loading-xs"></span>
              </span>
              <span v-else>
                {{ item.balance ? format.formatToken(item.balance) : '-' }}
              </span>
            </td>
            <td>{{ item.services?.length || 0 }}</td>
            <td>
              <span v-if="item.services?.length <= 5">
                {{
                  item.services
                    ?.map((sc: any) =>
                      sc.service_name?.length > 0 ? sc.service_name : sc.service_id
                    )
                    .join(', ')
                }}
              </span>
              <span v-else>
                {{
                  item.services
                    .slice(0, 5)
                    .map((sc: any) =>
                      sc.service_name?.length > 0 ? sc.service_name : sc.service_id
                    )
                    .join(', ')
                }}
                <div
                  class="tooltip tooltip-bottom inline"
                  :data-tip="
                    item.services
                      .slice(5)
                      .map((sc: any) =>
                        sc.service_name?.length > 0 ? sc.service_name : sc.service_id
                      )
                      .join(', ')
                  "
                >
                  <span
                    class="text-blue-500 cursor-pointer hover:text-blue-700"
                  >
                    ,..+{{ item.services.length - 5 }} more
                  </span>
                </div>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <TablePagination
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="totalSuppliers"
        :items-per-page="itemsPerPage"
        item-label="suppliers"
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
    i18n: 'suppliers',
    order: 5
  }
}
</route>
