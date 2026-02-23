import { ref, watch, computed } from 'vue';
import type {
  DomainLeaderboardResponse,
  ValidatorPerformanceResponse,
} from '@/types/validators';

type GroupBy = 'day' | 'hour' | 'total';

export interface PerformanceFilters {
  domain?: string;
  owner_address?: string;
  supplier_address?: string;
  chain?: string;
  service_id?: string;
  start_date?: string;
  end_date?: string;
  group_by?: GroupBy;
  page?: number;
  limit?: number;
}

// Simple in-memory request deduplication
const pendingRequests = new Map<string, Promise<any>>();
async function fetchJson(url: string, options?: RequestInit) {
  const key = `${url}:${JSON.stringify(options?.body || {})}`;
  if (pendingRequests.has(key)) return pendingRequests.get(key)!;
  const p = fetch(url, options).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, p);
  return p;
}

export function useValidatorPerformance(initial: PerformanceFilters) {
  const filters = ref<PerformanceFilters>({ ...initial });
  const loading = ref(false);
  const error = ref<string | null>(null);
  const list = ref<ValidatorPerformanceResponse | null>(null);

  const queryString = computed(() => {
    const params = new URLSearchParams();
    Object.entries(filters.value).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    return params.toString();
  });

  // Check if we need to use POST (multiple supplier addresses or long URL)
  const shouldUsePost = computed(() => {
    const supplierAddr = filters.value.supplier_address;
    if (!supplierAddr) return false;
    
    // Check if it's comma-separated (multiple addresses)
    if (typeof supplierAddr === 'string' && supplierAddr.includes(',')) {
      return true;
    }
    
    // Check if URL would be too long (conservative estimate: > 2000 chars)
    const url = `/api/v1/validators/performance?${queryString.value}`;
    return url.length > 2000;
  });

  const load = async () => {
    loading.value = true;
    error.value = null;
    try {
      if (shouldUsePost.value) {
        // Use POST with request body
        const body: any = { ...filters.value };
        
        // Convert comma-separated supplier_address to array
        if (typeof body.supplier_address === 'string' && body.supplier_address.includes(',')) {
          body.supplier_address = body.supplier_address.split(',').map((addr: string) => addr.trim()).filter((addr: string) => addr.length > 0);
        }
        
        // Remove undefined/null/empty values
        Object.keys(body).forEach(key => {
          if (body[key] === undefined || body[key] === null || body[key] === '') {
            delete body[key];
          }
        });

        list.value = await fetchJson('/api/v1/validators/performance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } else {
        // Use GET for simple queries
        const url = `/api/v1/validators/performance?${queryString.value}`;
        list.value = await fetchJson(url);
      }
    } catch (e: any) {
      error.value = e?.message || 'Failed to fetch performance';
      list.value = null;
    } finally {
      loading.value = false;
    }
  };

  // Watch filters directly to catch all changes, including supplier_address changes
  watch(() => filters.value, load, { immediate: true, deep: true });

  return { filters, loading, error, list, reload: load };
}

export function useDomains(limit = 100, chain?: string) {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const data = ref<DomainLeaderboardResponse | null>(null);

  const load = async () => {
    loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      params.append('limit', String(limit));
      if (chain) {
        params.append('chain', chain);
      }
      const url = `/api/v1/validators/domains?${params.toString()}`;
      data.value = await fetchJson(url);
    } catch (e: any) {
      error.value = e?.message || 'Failed to fetch domains';
      data.value = null;
    } finally {
      loading.value = false;
    }
  };

  return { loading, error, data, load };
}

export interface SupplierSearchResponse {
  owner_addresses: string[];              // Unique owner addresses (pokt1...)
  supplier_operator_addresses: string[]; // Unique supplier operator addresses (poktvaloper1...)
}

export function useSupplierServiceSearch(chain?: string, limit: number = 20, status: string = 'staked') {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const results = ref<SupplierSearchResponse | null>(null);

  const search = async (query: string, searchStatus?: string) => {
    if (!query || query.trim().length === 0) {
      results.value = null;
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      params.append('q', query.trim());
      // Limit is capped at 100 per API spec
      const searchLimit = Math.min(Math.max(limit, 1), 100);
      params.append('limit', String(searchLimit));
      if (chain) {
        params.append('chain', chain);
      }
      // Use provided status or default to the composable's status
      const statusToUse = searchStatus || status;
      if (statusToUse) {
        params.append('status', statusToUse);
      }
      const url = `/api/v1/suppliers/search?${params.toString()}`;
      results.value = await fetchJson(url);
    } catch (e: any) {
      error.value = e?.message || 'Failed to search';
      results.value = null;
    } finally {
      loading.value = false;
    }
  };

  return { loading, error, results, search };
}


