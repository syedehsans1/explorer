<script lang="ts" setup>
import { useBlockchain, useFormatter } from '@/stores';
import ServiceDashboardByComputeUnits from '../components/ServiceDashboardByComputeUnits.vue';
import SupplierComparisonCharts from '../components/SupplierComparisonCharts.vue';
import SupplierTrendAnalysis from '../components/SupplierTrendAnalysis.vue';
import SupplierInsights from '../components/SupplierInsights.vue';
import { ref, computed, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import ValidatorFilterModal from '../components/ValidatorFilterModal.vue';
import { Icon } from '@iconify/vue';
import { fetchTransactions, type ApiTransaction, type TransactionFilters } from '@/libs/transactions';

const props = defineProps(['chain']);
const chainStore = useBlockchain();
const format = useFormatter();
const activeTab = ref<'summary' | 'chain' | 'performance' | 'analytics' | 'reward-share' | 'transactions'>('summary');

// Map frontend chain names to API chain names
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  };
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

// Chain comes from route params (props.chain)
const current = props.chain || chainStore?.current?.chainName || 'pocket-beta';
const apiChainName = computed(() => getApiChainName(String(current)));

// ✅ FIXED: Default 30 days (taake data consistently mile)
const end = new Date();
end.setHours(23, 59, 59, 999); // End of current day
const start = new Date(end);
start.setDate(start.getDate() - 29); // 30 days back (29 + today = 30)
start.setHours(0, 0, 0, 0); // Start of that day

const showFilters = ref(false);
const focusField = ref<'date' | undefined>(undefined);
const filters = ref({
  owner_address: undefined as string | undefined,
  supplier_address: undefined as string | undefined,
  supplier_status: 'staked' as string, // Default to 'staked'
  chain: apiChainName.value,
  start_date: start.toISOString(),
  end_date: end.toISOString(),
});

// Keep chain updated when route params change
watch(apiChainName, (newChain) => {
  filters.value.chain = newChain;
});

function openFilters(field?: 'date') {
  focusField.value = field;
  showFilters.value = true;
}
function onApply(newFilters: any) { 
  filters.value = { ...filters.value, ...newFilters };
  focusField.value = undefined; // Reset focus after applying
}

// Computed filters for service dashboard
const serviceDashboardFilters = computed(() => ({
  supplier_address: filters.value.supplier_address,
  owner_address: filters.value.owner_address,
  supplier_status: filters.value.supplier_status,
}));

// Transaction state
const transactions = ref<ApiTransaction[]>([]);
const currentTxPage = ref(1);
const txItemsPerPage = ref(25);
const totalTxPages = ref(0);
const totalTxCount = ref(0);
const loadingTxs = ref(false);
const selectedTypeTab = ref<'all' | 'send' | 'claim' | 'proof' | 'governance' | 'staking'>('all');
const txStatusFilter = ref<string>('');
const txStartDate = ref<string>('');
const txEndDate = ref<string>('');
const txMinAmount = ref<number | undefined>(undefined);
const txMaxAmount = ref<number | undefined>(undefined);
const txSortBy = ref<'timestamp' | 'amount' | 'fee' | 'block_height' | 'type' | 'status'>('timestamp');
const txSortOrder = ref<'asc' | 'desc'>('desc');
const showAdvancedTxFilters = ref(false);

// Type tab mappings
const typeTabMap: Record<string, string[]> = {
  all: [],
  send: ['MsgSend (bank)', 'MsgMultiSend (bank)'],
  claim: ['MsgCreateClaim (proof)'],
  proof: ['MsgSubmitProof (proof)'],
  governance: [
    'MsgSubmitProposal (governance)',
    'MsgVote (governance)',
    'MsgDeposit (governance)',
    'MsgVoteWeighted (governance)'
  ],
  staking: [
    'MsgDelegate (node)',
    'MsgUndelegate (node)',
    'MsgBeginRedelegate (node)',
    'MsgStakeApplication (application)',
    'MsgUnstakeApplication (application)',
    'MsgStakeSupplier (supplier)',
    'MsgUnstakeSupplier (supplier)',
    'MsgStakeGateway (gateway)',
    'MsgUnstakeGateway (gateway)'
  ]
};

let txDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function loadTransactions() {
  loadingTxs.value = true;
  try {
    // Build addresses array from filters
    const addresses: string[] = [];
    if (filters.value.owner_address) {
      addresses.push(filters.value.owner_address);
    }
    if (filters.value.supplier_address) {
      // Split comma-separated supplier addresses
      const supplierAddrs = filters.value.supplier_address.split(',').map(addr => addr.trim()).filter(addr => addr);
      addresses.push(...supplierAddrs);
    }

    if (addresses.length === 0) {
      transactions.value = [];
      totalTxCount.value = 0;
      totalTxPages.value = 0;
      return;
    }

    const filtersObj: TransactionFilters = {
      addresses: addresses.length > 1 ? addresses : undefined,
      address: addresses.length === 1 ? addresses[0] : undefined,
      chain: filters.value.chain,
      page: currentTxPage.value,
      limit: txItemsPerPage.value,
      sort_by: txSortBy.value,
      sort_order: txSortOrder.value,
      status: filters.value.supplier_status, // ✅ FIXED: Added supplier_status
    };

    // Add type filter based on selected tab
    const selectedTypes = typeTabMap[selectedTypeTab.value];
    if (selectedTypes.length > 0) {
      filtersObj.type = selectedTypes[0];
    }

    if (txStatusFilter.value) {
      filtersObj.status = txStatusFilter.value === 'success' ? "true" : "false";
    }

    // ✅ FIXED: Main filter dates (ya to advanced dates ya main filter dates)
    const startDate = txStartDate.value 
      ? new Date(txStartDate.value).toISOString() 
      : filters.value.start_date;
    
    const endDate = txEndDate.value 
      ? new Date(txEndDate.value).toISOString() 
      : filters.value.end_date;

    if (startDate) {
      filtersObj.start_date = startDate;
    }

    if (endDate) {
      filtersObj.end_date = endDate;
    }

    if (txMinAmount.value !== undefined) {
      filtersObj.min_amount = txMinAmount.value;
    }

    if (txMaxAmount.value !== undefined) {
      filtersObj.max_amount = txMaxAmount.value;
    }

    const data = await fetchTransactions(filtersObj);
    transactions.value = data.data || [];
    totalTxCount.value = data.meta?.total || 0;
    totalTxPages.value = data.meta?.totalPages || 0;
  } catch (error) {
    console.error('Error loading transactions:', error);
    transactions.value = [];
    totalTxCount.value = 0;
    totalTxPages.value = 0;
  } finally {
    loadingTxs.value = false;
  }
}

function debouncedLoadTransactions() {
  if (txDebounceTimer) clearTimeout(txDebounceTimer);
  txDebounceTimer = setTimeout(() => {
    currentTxPage.value = 1;
    loadTransactions();
  }, 300);
}

// Watch for filter changes
watch([filters, selectedTypeTab, txStatusFilter, txStartDate, txEndDate, txMinAmount, txMaxAmount, txSortBy, txSortOrder], () => {
  if (activeTab.value === 'transactions') {
    debouncedLoadTransactions();
  }
});

watch([currentTxPage, txItemsPerPage], () => {
  if (activeTab.value === 'transactions') {
    loadTransactions();
  }
});

watch(activeTab, (newTab) => {
  if (newTab === 'transactions') {
    loadTransactions();
  }
});
</script>

<template>
  <div class="pt-[6.5rem]">
    <div class="flex items-center justify-between my-4">
      <p class="text-2xl rounded-xl px-4 py-2 font-bold">
        Operator Lookup Dashboard
      </p>
      <button class="btn btn-sm dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)]" @click="openFilters()">Filter</button>
    </div>

    <!-- Active Filters Display -->
    <div v-if="filters.owner_address || filters.supplier_address || 
              (filters.supplier_status && filters.supplier_status !== 'staked') || 
              filters.start_date || filters.end_date" 
      class="flex bg-[#ffffff] hover:bg-base-200 p-3 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-semibold text-base-content/70 mr-1">Active Filters:</span>
        
        <!-- Owner Address Filter -->
        <div v-if="filters.owner_address" class="badge badge-primary badge-sm gap-1 cursor-pointer hover:badge-info" @click="openFilters()">
          <Icon icon="mdi:account" class="text-xs" />
          <span class="text-xs font-mono max-w-[200px] truncate">{{ filters.owner_address }}</span>
          <button 
            class="ml-1 hover:bg-base-content/20 rounded-full p-0.5"
            @click.stop="filters.owner_address = undefined; onApply({ owner_address: undefined })"
          >
            <Icon icon="mdi:close" class="text-xs" />
          </button>
        </div>

        <!-- Supplier Operator Address(es) Filter -->
        <div v-if="filters.supplier_address" class="badge badge-secondary badge-sm gap-1 cursor-pointer hover:badge-info" @click="openFilters()">
          <Icon icon="mdi:server-network" class="text-xs" />
          <span class="text-xs">
            {{ filters.supplier_address.split(',').length }} supplier{{ filters.supplier_address.split(',').length > 1 ? 's' : '' }}
          </span>
          <button 
            class="ml-1 hover:bg-base-content/20 rounded-full p-0.5"
            @click.stop="filters.supplier_address = undefined; onApply({ supplier_address: undefined })"
          >
            <Icon icon="mdi:close" class="text-xs" />
          </button>
        </div>

        <!-- Supplier Status Filter -->
        <div v-if="filters.supplier_status && filters.supplier_status !== 'staked'" 
             class="badge badge-info badge-sm gap-1 cursor-pointer hover:badge-info" 
             @click="openFilters()">
          <Icon icon="mdi:shield-check" class="text-xs" />
          <span class="text-xs capitalize">{{ filters.supplier_status.replace('_', ' ') }}</span>
          <button 
            class="ml-1 hover:bg-base-content/20 rounded-full p-0.5"
            @click.stop="filters.supplier_status = 'staked'; onApply({ supplier_status: 'staked' })"
          >
            <Icon icon="mdi:close" class="text-xs" />
          </button>
        </div>

        <!-- Date Range Filter -->
        <div v-if="filters.start_date && filters.end_date" class="badge badge-accent badge-sm gap-1 cursor-pointer hover:badge-info" @click="openFilters('date')">
          <Icon icon="mdi:calendar-range" class="text-xs" />
          <span class="text-xs">
            {{ new Date(filters.start_date).toLocaleDateString() }} - {{ new Date(filters.end_date).toLocaleDateString() }}
          </span>
          <button 
            class="ml-1 hover:bg-base-content/20 rounded-full p-0.5"
            @click.stop="
              const newEnd = new Date();
              newEnd.setHours(23, 59, 59, 999);
              const newStart = new Date(newEnd);
              newStart.setDate(newStart.getDate() - 29);
              newStart.setHours(0, 0, 0, 0);
              filters.start_date = newStart.toISOString();
              filters.end_date = newEnd.toISOString();
              onApply({ start_date: newStart.toISOString(), end_date: newEnd.toISOString() });
            "
          >
            <Icon icon="mdi:close" class="text-xs" />
          </button>
        </div>

        <!-- Clear All Button -->
        <button 
          class="btn btn-xs btn-ghost ml-auto"
          @click="
            const newEnd = new Date();
            newEnd.setHours(23, 59, 59, 999);
            const newStart = new Date(newEnd);
            newStart.setDate(newStart.getDate() - 29);
            newStart.setHours(0, 0, 0, 0);
            filters.owner_address = undefined;
            filters.supplier_address = undefined;
            filters.supplier_status = 'staked';
            filters.start_date = newStart.toISOString();
            filters.end_date = newEnd.toISOString();
            onApply({
              owner_address: undefined,
              supplier_address: undefined,
              supplier_status: 'staked',
              start_date: newStart.toISOString(),
              end_date: newEnd.toISOString()
            });
          "
        >
          <Icon icon="mdi:filter-off" class="text-xs" />
          Clear All
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex bg-[#ffffff] hover:bg-base-200 p-3 mb-4 gap-2 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <button 
        class="tab dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] rounded-md" 
        :class="{ 'tab-active': activeTab === 'summary' }"
        @click="activeTab = 'summary'"
      >
        Summary
      </button>
      <button 
        class="tab dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] rounded-md" 
        :class="{ 'tab-active': activeTab === 'chain' }"
        @click="activeTab = 'chain'"
      >
        Services
      </button>
      <!-- <button 
        class="tab" 
        :class="{ 'tab-active': activeTab === 'performance' }"
        @click="activeTab = 'performance'"
      >
        Performance
      </button>
      <button 
        class="tab" 
        :class="{ 'tab-active': activeTab === 'analytics' }"
        @click="activeTab = 'analytics'"
      >
        Analytics
      </button> -->
      <button 
        class="tab dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] rounded-md" 
        :class="{ 'tab-active': activeTab === 'reward-share' }"
        @click="activeTab = 'reward-share'"
      >
        Reward Share
      </button>
      <!-- <button 
        class="tab" 
        :class="{ 'tab-active': activeTab === 'transactions' }"
        @click="activeTab = 'transactions'"
      >
        Transactions
      </button> -->
    </div>

    <!-- Tab Content -->
    <div v-if="activeTab === 'summary'">
      <ServiceDashboardByComputeUnits 
        :chain="current" 
        :filters="serviceDashboardFilters"
        :show-tabs="false"
        :start-date="filters.start_date"
        :end-date="filters.end_date"
      />
    </div>

    <div v-else-if="activeTab === 'chain'">
      <ServiceDashboardByComputeUnits 
        :chain="current" 
        :filters="serviceDashboardFilters"
        :show-tabs="false"
        :tab-view="'chain'"
        :start-date="filters.start_date"
        :end-date="filters.end_date"
      />
    </div>


    <div v-else-if="activeTab === 'analytics'">
      <div class="space-y-4">
        <!-- Comparison Charts -->
        <SupplierComparisonCharts
          :chain="current"
          :filters="serviceDashboardFilters"
          :start-date="filters.start_date"
          :end-date="filters.end_date"
        />
        
        <!-- Trend Analysis -->
        <SupplierTrendAnalysis
          :chain="current"
          :filters="serviceDashboardFilters"
          :start-date="filters.start_date"
          :end-date="filters.end_date"
        />
        
        <!-- Insights Panel -->
        <SupplierInsights
          :chain="current"
          :filters="serviceDashboardFilters"
          :start-date="filters.start_date"
          :end-date="filters.end_date"
        />
      </div>
    </div>

    <div v-else-if="activeTab === 'reward-share'">
      <ServiceDashboardByComputeUnits 
        :chain="current" 
        :filters="serviceDashboardFilters"
        :show-tabs="false"
        :tab-view="'reward-share'"
        :start-date="filters.start_date"
        :end-date="filters.end_date"
      />
    </div>

    <div v-else-if="activeTab === 'transactions'">
      <div class="bg-[#EFF2F5] dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)] px-0.5 pt-0.5 pb-4 rounded-xl shadow-md mb-4">
        <!-- Filter Section - Compact & Modern -->
        <div class="bg-base-200 dark:bg-base-300 rounded-lg border border-base-300 dark:border-base-400 mb-4">
          <!-- Main Filter Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3">
            <!-- Type Tabs - Compact Horizontal -->
            <div class="flex items-center gap-1 flex-wrap">
              <span class="text-xs font-medium text-base-content/70 mr-1">Type:</span>
              <button
                v-for="typeOption in [
                  { value: 'all', label: 'All' },
                  { value: 'send', label: 'Send' },
                  { value: 'claim', label: 'Claim' },
                  { value: 'proof', label: 'Proof' },
                  { value: 'governance', label: 'Gov' },
                  { value: 'staking', label: 'Stake' }
                ]"
                :key="typeOption.value"
                @click="selectedTypeTab = typeOption.value as any"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200"
                :class="selectedTypeTab === typeOption.value
                  ? 'bg-[#007bff] text-white shadow-sm'
                  : 'bg-base-100 dark:bg-base-200 text-base-content hover:bg-base-300 dark:hover:bg-base-100 border border-base-300 dark:border-base-400'"
              >
                {{ typeOption.label }}
              </button>
            </div>

            <!-- Divider -->
            <div class="h-6 w-px bg-base-300 dark:bg-base-500"></div>

            <!-- Quick Filters -->
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Status -->
              <div class="flex items-center gap-1.5">
                <Icon icon="mdi:check-circle-outline" class="text-base-content/60 text-sm" />
                <select v-model="txStatusFilter" class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-24">
                  <option value="">All</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <!-- Sort By -->
              <div class="flex items-center gap-1.5">
                <Icon icon="mdi:sort" class="text-base-content/60 text-sm" />
                <select v-model="txSortBy" class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-28">
                  <option value="timestamp">Time</option>
                  <option value="amount">Amount</option>
                  <option value="fee">Fee</option>
                  <option value="block_height">Block</option>
                  <option value="type">Type</option>
                  <option value="status">Status</option>
                </select>
              </div>

              <!-- Sort Order Toggle -->
              <button
                @click="txSortOrder = txSortOrder === 'desc' ? 'asc' : 'desc'"
                class="btn btn-xs h-8 min-h-8 px-2 gap-1"
                :class="txSortOrder === 'desc' ? 'btn-primary' : 'btn-ghost'"
                :title="txSortOrder === 'desc' ? 'Descending' : 'Ascending'"
              >
                <Icon :icon="txSortOrder === 'desc' ? 'mdi:sort-descending' : 'mdi:sort-ascending'" class="text-sm" />
              </button>
            </div>

            <!-- Advanced Filters Toggle -->
            <div class="ml-auto">
              <button
                @click="showAdvancedTxFilters = !showAdvancedTxFilters"
                class="btn btn-xs h-8 min-h-8 px-3 gap-1.5"
                :class="showAdvancedTxFilters ? 'btn-primary' : 'btn-ghost'"
              >
                <Icon :icon="showAdvancedTxFilters ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="text-sm" />
                <span class="text-xs">Advanced</span>
              </button>
            </div>
          </div>

          <!-- Advanced Filters - Collapsible -->
          <div v-show="showAdvancedTxFilters" class="border-t border-base-300 dark:border-base-400 px-4 py-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Date Range -->
              <div>
                <label class="label py-1">
                  <span class="label-text text-xs font-medium flex items-center gap-1.5">
                    <Icon icon="mdi:calendar-range" class="text-sm" />
                    Date Range
                  </span>
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="txStartDate"
                    type="datetime-local"
                    class="input input-bordered input-xs h-8 text-xs flex-1"
                    placeholder="Start"
                  />
                  <span class="self-center text-xs text-base-content/50">→</span>
                  <input
                    v-model="txEndDate"
                    type="datetime-local"
                    class="input input-bordered input-xs h-8 text-xs flex-1"
                    placeholder="End"
                  />
                </div>
              </div>

              <!-- Amount Range -->
              <div>
                <label class="label py-1">
                  <span class="label-text text-xs font-medium flex items-center gap-1.5">
                    <Icon icon="mdi:currency-usd" class="text-sm" />
                    Amount Range
                  </span>
                </label>
                <div class="flex gap-2">
                  <input
                    v-model.number="txMinAmount"
                    type="number"
                    class="input input-bordered input-xs h-8 text-xs flex-1"
                    placeholder="Min"
                  />
                  <span class="self-center text-xs text-base-content/50">-</span>
                  <input
                    v-model.number="txMaxAmount"
                    type="number"
                    class="input input-bordered input-xs h-8 text-xs flex-1"
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Filter Info -->
          <div class="border-t border-base-300 dark:border-base-400 px-4 py-2 bg-base-100 dark:bg-base-200">
            <div class="text-xs text-base-content/70">
              <p v-if="filters.owner_address" class="mb-1">
                <strong>Owner Address:</strong> <span class="font-mono">{{ filters.owner_address }}</span>
              </p>
              <p v-if="filters.supplier_address" class="mb-1">
                <strong>Supplier Operator Address(es):</strong> <span class="font-mono">{{ filters.supplier_address }}</span>
              </p>
              <p v-if="!filters.owner_address && !filters.supplier_address" class="text-warning">
                Please select a validator or service from the filter modal to view transactions.
              </p>
            </div>
          </div>
        </div>

        <div class="bg-base-200 rounded-md overflow-auto">
          <table class="table w-full table-compact">
            <thead class="dark:bg-[rgba(255,255,255,.03);] dark:hover:bg-[rgba(255,255,255,0.06)] bg-base-200 sticky top-0 border-0">
              <tr class="border-b-[0px] text-sm font-semibold">
                <th>Hash</th>
                <th>Block</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingTxs" class="text-center">
                <td colspan="7" class="py-8">
                  <div class="flex justify-center items-center">
                    <div class="loading loading-spinner loading-md"></div>
                    <span class="ml-2">Loading transactions...</span>
                  </div>
                </td>
              </tr>
              <tr v-else-if="transactions.length === 0" class="text-center">
                <td colspan="7" class="py-8">
                  <div class="text-gray-500">No transactions found</div>
                </td>
              </tr>
              <tr
                v-for="(item, index) in transactions"
                :key="item.hash"
                class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl"
              >
                <td class="truncate dark:text-warning text-[#153cd8]" style="max-width:25vw">
                  <RouterLink
                    class="truncate hover:underline"
                    :to="`/${props.chain}/tx/${item.hash}`"
                    >{{ item.hash }}</RouterLink
                  >
                </td>
                <td class="text-sm dark:text-warning text-[#153cd8]">
                  <RouterLink
                    :to="`/${props.chain}/blocks/${item.block_height}`"
                    class="hover:underline"
                    >{{ item.block_height }}</RouterLink
                  >
                </td>
                <td>{{ item.type }}</td>
                <td>
                  <span
                    class="text-xs truncate py-1 px-3 rounded-full"
                    :class="item.status === 'success'
                        ? 'bg-[#60BC29]/10 text-[#60BC29]'
                        : 'bg-[#E03834]/10 text-[#E03834]'"
                  >
                    {{ item.status === 'success' ? 'Success' : 'Failed' }}
                  </span>
                </td>
                <td>
                  {{ format.formatToken({ denom: 'upokt', amount: item.amount }) }}
                </td>
                <td>
                  {{ format.formatToken({ denom: 'upokt', amount: item.fee }) }}
                </td>
                <td>
                  {{ format.toDay(item.timestamp, 'from') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex justify-between items-center gap-4 my-6 px-6">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">Show:</span>
            <select 
              v-model="txItemsPerPage" 
              class="select select-bordered select-sm w-20"
            >
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
            <span class="text-sm text-gray-600">per page</span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">
              Showing {{ ((currentTxPage - 1) * txItemsPerPage) + 1 }} to {{ Math.min(currentTxPage * txItemsPerPage, totalTxCount) }} of {{ totalTxCount }} transactions
            </span>
            
            <div class="flex items-center gap-1">
              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="currentTxPage = 1"
                :disabled="currentTxPage === 1 || totalTxPages === 0"
              >
                First
              </button>
              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="currentTxPage--"
                :disabled="currentTxPage === 1 || totalTxPages === 0"
              >
                &lt;
              </button>

              <span class="text-xs px-2">
                Page {{ currentTxPage }} of {{ totalTxPages }}
              </span>

              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="currentTxPage++"
                :disabled="currentTxPage === totalTxPages || totalTxPages === 0"
              >
                &gt;
              </button>
              <button
                class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
                @click="currentTxPage = totalTxPages"
                :disabled="currentTxPage === totalTxPages || totalTxPages === 0"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ValidatorFilterModal
      v-model="showFilters"
      :initial="filters"
      :focus-field="focusField"
      @apply="onApply"
    />
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .table { font-size: 0.75rem; }
  th, td { padding: 0.5rem; }
}
</style>