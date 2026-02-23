<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useRouter, useRoute } from 'vue-router';
import { useBlockchain } from '@/stores';
import { useSupplierServiceSearch } from '../composables/useValidatorPerformance';

const props = defineProps<{
  modelValue: boolean;
  initial: {
    domain?: string;
    chain?: string;
    owner_address?: string;
    supplier_address?: string;
    supplier_status?: string;
    start_date: string;
    end_date: string;
  };
  focusField?: 'date';
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'apply', payload: any): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

// Focus on specific field when modal opens
watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.focusField) {
    // Use nextTick to ensure DOM is ready
    setTimeout(() => {
      if (props.focusField === 'date' && startDateInputRef.value) {
        startDateInputRef.value.focus();
      }
    }, 150);
  }
});

const router = useRouter();
const route = useRoute();
const chainStore = useBlockchain();
const searchQuery = ref<string>('');
const start = ref<string>(props.initial?.start_date);
const end = ref<string>(props.initial?.end_date);
const supplierStatus = ref<string>(props.initial?.supplier_status || 'staked');

// Template refs for focusing
const startDateInputRef = ref<HTMLInputElement | null>(null);

// Get chain from route params or fallback to chainStore
const currentChain = computed(() => {
  return (route.params.chain as string) || chainStore?.current?.chainName || 'pocket-beta';
});

// Initialize composable with default status
const { loading: searchLoading, error: searchError, results: searchResults, search: performSearch } = useSupplierServiceSearch(props.initial?.chain, 20, 'staked');

// Selected suppliers state
const selectedSuppliers = ref<string[]>([]);

// Debounce search
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, (newQuery) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(newQuery, supplierStatus.value);
  }, 300);
});

// Re-search when status changes
watch(supplierStatus, (newStatus) => {
  if (searchQuery.value && searchQuery.value.trim().length > 0) {
    performSearch(searchQuery.value, newStatus);
  }
});

// Initialize selected suppliers from initial filters
watch(() => props.initial, (initial) => {
  if (initial?.supplier_address) {
    // Split comma-separated supplier addresses
    selectedSuppliers.value = initial.supplier_address.split(',').map(addr => addr.trim()).filter(addr => addr);
  } else {
    selectedSuppliers.value = [];
  }
}, { immediate: true });

// Keep search results when modal is open to allow selecting/deselecting
// Only clear when modal closes
watch(open, (isOpen) => {
  if (!isOpen) {
    // Only clear search query and results when closing
    // Keep selectedSuppliers so they persist when modal reopens
    searchQuery.value = '';
    searchResults.value = null;
  } else {
    // When modal opens, if we have selected suppliers but no search results,
    // we could optionally restore the last search, but for now we'll just show selected suppliers
  }
});

function selectOwner(ownerAddress: string) {
  emit('apply', {
    owner_address: ownerAddress,
    supplier_address: undefined, // Clear supplier filter when selecting owner
    supplier_status: supplierStatus.value,
    start_date: start.value,
    end_date: end.value,
  });
  selectedSuppliers.value = []; // Clear selected suppliers when selecting owner
  searchQuery.value = '';
  searchResults.value = null;
  open.value = false;
}

function toggleSupplierSelection(operatorAddress: string) {
  const index = selectedSuppliers.value.indexOf(operatorAddress);
  if (index > -1) {
    selectedSuppliers.value.splice(index, 1);
  } else {
    selectedSuppliers.value.push(operatorAddress);
  }
  // Don't clear search results - keep them so user can continue selecting/deselecting
}

function selectAllSuppliers() {
  if (searchResults.value?.supplier_operator_addresses) {
    const allSelected = searchResults.value.supplier_operator_addresses.every(addr => 
      selectedSuppliers.value.includes(addr)
    );
    
    if (allSelected) {
      // Deselect all
      selectedSuppliers.value = selectedSuppliers.value.filter(addr => 
        !searchResults.value?.supplier_operator_addresses.includes(addr)
      );
    } else {
      // Select all from current results
      searchResults.value.supplier_operator_addresses.forEach(addr => {
        if (!selectedSuppliers.value.includes(addr)) {
          selectedSuppliers.value.push(addr);
        }
      });
    }
  }
}

function isSupplierSelected(operatorAddress: string): boolean {
  return selectedSuppliers.value.includes(operatorAddress);
}


function preset(days: number | null) {
  if (days === null) {
    // All time - set to very early date and current date
    start.value = new Date('2020-01-01').toISOString();
    end.value = new Date().toISOString();
  } else {
  const e = new Date();
  const s = new Date(e.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  start.value = s.toISOString();
  end.value = e.toISOString();
  }
}

function apply() {
  const filters: any = {
    start_date: start.value,
    end_date: end.value,
    supplier_status: supplierStatus.value,
  };
  
  // If suppliers are selected, apply them as comma-separated
  if (selectedSuppliers.value.length > 0) {
    filters.owner_address = undefined; // Clear owner filter when selecting suppliers
    filters.supplier_address = selectedSuppliers.value.join(',');
  }
  
  emit('apply', filters);
  emit('update:modelValue', false);
}

function cancel() {
  emit('update:modelValue', false);
}

// Handle Escape key to close modal
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    cancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape);
});


function clearSearch() {
  searchQuery.value = '';
  searchResults.value = null;
}

function isPresetActive(days: number | null): boolean {
  if (!start.value || !end.value) return false;
  
  const now = new Date();
  const endDate = new Date(end.value);
  const startDate = new Date(start.value);
  
  // Check if end date is today (within 1 hour tolerance)
  const isToday = Math.abs(now.getTime() - endDate.getTime()) < 60 * 60 * 1000;
  
  if (days === null) {
    // All time - check if start is very early
    const veryEarly = new Date('2020-01-01');
    return startDate.getTime() <= veryEarly.getTime() && isToday;
  }
  
  if (!isToday) return false;
  
  const expectedStart = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const diff = Math.abs(startDate.getTime() - expectedStart.getTime());
  // Allow 1 hour tolerance
  return diff < 60 * 60 * 1000;
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="props.modelValue" 
      class="modal modal-open backdrop-blur-sm" 
      @click.self="cancel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="modal-box dark:bg-[#0f1419] bg-[#ffffff] w-11/12 max-w-6xl" @click.stop>
      <div class="flex items-center justify-between mb-4">
        <h3 id="modal-title" class="font-bold text-lg">Supplier Filters</h3>
        <button class="btn btn-sm btn-circle" @click="cancel" type="button" aria-label="Close modal">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <div class="flex items-center justify-between mb-2">
          <label class="label text-xs">Supplier Lookup</label>
            <div class="flex items-center gap-2">
              <label class="label text-xs">Status:</label>
              <select 
                v-model="supplierStatus" 
                class="select select-bordered select-sm w-32"
              >
                <option value="staked">Staked</option>
                <option value="unstaked">Unstaked</option>
                <option value="unstake_requested">Unstake Requested</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div class="relative">
            <input 
              v-model="searchQuery" 
              class="input input-bordered w-full shadow-sm dark:bg-[#1a1f26]" 
              placeholder="Search by owner address, operator address, or service URL/domain..."
              @focus="performSearch(searchQuery, supplierStatus)"
            />
            <div v-if="searchLoading" class="absolute right-3 top-3">
              <span class="loading loading-spinner loading-xs"></span>
            </div>
            <div v-if="searchError" class="text-error text-xs mt-1">{{ searchError }}</div>
            <div v-if="!searchError" class="text-gray-500 text-sm mt-1 mb-2">Enter an owner address to filter by all operators for that owner, or enter an operator address/service URL to find matching suppliers.</div>
            
            <!-- Search Results Dropdown -->
            <div 
              v-if="searchResults && !searchLoading" 
              class="absolute z-50 w-full mt-1 bg-base-100 dark:bg-base-200 border border-base-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              @click.stop
            >
              <!-- No Results -->
              <div v-if="(!searchResults.owner_addresses || searchResults.owner_addresses.length === 0) && 
                          (!searchResults.supplier_operator_addresses || searchResults.supplier_operator_addresses.length === 0)" 
                   class="p-4 text-center text-sm text-base-content/60">
                No results found
              </div>
              
              <!-- Combined List with Type Indicators -->
              <div class="p-2">
                <!-- Owner Address Results -->
                <div 
                  v-for="ownerAddress in searchResults.owner_addresses" 
                  :key="ownerAddress"
                  class="p-2 hover:bg-base-200 dark:hover:bg-base-300 rounded cursor-pointer transition-colors flex items-start gap-2"
                  @click.stop="selectOwner(ownerAddress)"
                >
                  <span class="badge badge-sm badge-primary">OWNER</span>
                  <div class="flex-1">
                    <div class="text-xs text-base-content/60 font-mono">{{ ownerAddress }}</div>
                    <div class="text-xs text-base-content/50">Click to view all operators for this owner</div>
                  </div>
                </div>
                
                <!-- Operator Address Results -->
                <div v-if="searchResults.supplier_operator_addresses && searchResults.supplier_operator_addresses.length > 0" class="mb-2">
                  <div class="flex items-center justify-between px-2 mb-1">
                    <div class="text-xs font-semibold text-base-content/70">Operators</div>
                    <button 
                      class="btn btn-xs btn-ghost"
                      @click.stop="selectAllSuppliers"
                      type="button"
                    >
                      {{ searchResults.supplier_operator_addresses.every(addr => selectedSuppliers.includes(addr)) ? 'Deselect All' : 'Select All' }}
                    </button>
              </div>
                  <div 
                    v-for="operatorAddress in searchResults.supplier_operator_addresses" 
                    :key="operatorAddress"
                    class="p-2 hover:bg-base-200 dark:hover:bg-base-300 rounded cursor-pointer transition-colors flex items-start gap-2"
                    @click.stop="toggleSupplierSelection(operatorAddress)"
                  >
                    <input 
                      type="checkbox" 
                      :checked="isSupplierSelected(operatorAddress)"
                      class="checkbox checkbox-sm mt-0.5"
                      @click.stop="toggleSupplierSelection(operatorAddress)"
                    />
                    <span class="badge badge-sm badge-secondary">OPERATOR</span>
                    <div class="flex-1">
                      <div class="text-xs text-base-content/60 font-mono">{{ operatorAddress }}</div>
                      <div class="text-xs text-base-content/50">Click to select/deselect</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

          <!-- Selected Suppliers Display -->
          <div v-if="selectedSuppliers.length > 0" class="mt-4 border border-base-300 rounded-lg p-3">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-semibold">Selected Suppliers ({{ selectedSuppliers.length }})</h4>
              <button class="btn btn-xs btn-ghost" @click="selectedSuppliers = []" type="button">
              <Icon icon="mdi:close" />
                Clear All
              </button>
            </div>
            <div class="max-h-32 overflow-y-auto space-y-1">
              <div 
                v-for="supplier in selectedSuppliers" 
                :key="supplier"
                class="flex items-center justify-between p-2 bg-base-200 dark:bg-base-300 rounded text-xs"
              >
                <span class="font-mono text-base-content/80">{{ supplier }}</span>
                <button 
                  class="btn btn-xs btn-ghost p-0 h-auto min-h-0"
                  @click="toggleSupplierSelection(supplier)"
                  type="button"
                >
                  <Icon icon="mdi:close" class="text-xs" />
            </button>
          </div>
        </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-2">
          <label class="label text-xs flex items-center gap-2">
            <Icon icon="mdi:calendar-range" class="text-sm" />
            Date Range (UTC)
          </label>
          <div class="flex gap-2 flex-wrap">
            <button 
              class="btn btn-xs" 
              :class="isPresetActive(7) ? 'btn-primary' : 'btn-outline'"
              @click="preset(7)"
            >
              Last 7 Days
            </button>
            <button 
              class="btn btn-xs" 
              :class="isPresetActive(30) ? 'btn-primary' : 'btn-outline'"
              @click="preset(30)"
            >
              Last 30 Days
            </button>
            <button 
              class="btn btn-xs" 
              :class="isPresetActive(90) ? 'btn-primary' : 'btn-outline'"
              @click="preset(90)"
            >
              Last 90 Days
            </button>
            <button 
              class="btn btn-xs" 
              :class="isPresetActive(null) ? 'btn-primary' : 'btn-outline'"
              @click="preset(null)"
            >
              All Time
            </button>
          </div>
        </div>

        <div>
          <label class="label text-xs">Group By</label>
          <div class="flex items-center gap-3 text-sm">
            <input type="radio" checked disabled /> <span>Day (fixed)</span>
          </div>
        </div>
        <div>
          <div class="grid grid-cols-1 gap-2">
            <div>
              <label class="label label-text text-xs py-1">Start Date</label>
              <input 
                ref="startDateInputRef"
                type="datetime-local" 
                class="input input-bordered input-sm w-full shadow-sm" 
                :value="start ? new Date(start).toISOString().slice(0, 16) : ''"
                @change="(e) => { const target = e.target as HTMLInputElement; if (target?.value) start = new Date(target.value).toISOString(); }"
              />
            </div>
          </div>
        </div>

        <div>
          <div class="grid grid-cols-1 gap-2">
            <div>
              <label class="label label-text text-xs py-1">End Date</label>
              <input 
                type="datetime-local" 
                class="input input-bordered input-sm w-full shadow-sm" 
                :value="end ? new Date(end).toISOString().slice(0, 16) : ''"
                @change="(e) => { const target = e.target as HTMLInputElement; if (target?.value) end = new Date(target.value).toISOString(); }"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="modal-action">
        <button class="btn btn-ghost" @click="cancel" type="button">Cancel</button>
        <button class="btn btn-primary" @click="apply" type="button">Apply</button>
      </div>
    </div>
    </div>
  </Teleport>
</template>


<style scoped>
.modal-box {
  width: 100%;
  max-width: 600px;
}
</style>