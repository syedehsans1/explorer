import { ref, type ComputedRef } from 'vue';
import { useBlockchain } from '@/stores';
import { PageRequest } from '@/types';
import { CACHE_EXPIRATION_MS } from '../utils/constants';
import type { NetworkStats } from '../types';

/**
 * Loads network entity counts (wallets, apps, suppliers, gateways, services)
 * and 24-hour relay/compute-unit metrics.
 */
export function useNetworkStats(apiChainName: ComputedRef<string>) {
  const blockchain = useBlockchain();

  const networkStats = ref<NetworkStats>({
    wallets: 0,
    applications: 0,
    gateways: 0,
    suppliers: 0,
    services: 0,
  });

  const totalRelays24h = ref(0);
  const totalComputeUnits24h = ref(0);
  let cacheTimestamp = 0;

  async function load24hServicesSummary() {
    try {
      const params = new URLSearchParams({ window: '1', chain: apiChainName.value });
      const res = await fetch(`/api/v1/network-growth/summary?${params}`);
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const result = JSON.parse(text);
      if (res.ok && result?.data) {
        totalRelays24h.value = Number(result.data.estimated_relays || 0);
        totalComputeUnits24h.value = Number(result.data.estimated_compute_units || 0);
      } else {
        totalRelays24h.value = 0;
        totalComputeUnits24h.value = 0;
      }
    } catch (e) {
      totalRelays24h.value = 0;
      totalComputeUnits24h.value = 0;
      console.error('Error loading 24h services summary:', e);
    }
  }

  async function loadNetworkStats() {
    const now = Date.now();
    if (now - cacheTimestamp < CACHE_EXPIRATION_MS && networkStats.value.wallets > 0) return;

    const pageRequest = new PageRequest();
    pageRequest.limit = 1;

    try {
      const [applicationsData, suppliersData, gatewaysData, servicesData, accountsData] =
        await Promise.all([
          blockchain.rpc.getApplications(pageRequest),
          blockchain.rpc.getSuppliers(pageRequest),
          blockchain.rpc.getGateways(pageRequest),
          blockchain.rpc.getServices(pageRequest),
          blockchain.rpc.getAuthAccounts(pageRequest),
        ]);

      networkStats.value = {
        applications: parseInt(applicationsData.pagination?.total || 0),
        suppliers: parseInt(suppliersData.pagination?.total || 0),
        gateways: parseInt(gatewaysData.pagination?.total || 0),
        services: parseInt(servicesData.pagination?.total || 0),
        wallets: parseInt(accountsData.pagination?.total || '0'),
      };

      cacheTimestamp = now;
    } catch (e) {
      console.error('Error loading network stats:', e);
    }
  }

  return {
    networkStats,
    totalRelays24h,
    totalComputeUnits24h,
    loadNetworkStats,
    load24hServicesSummary,
  };
}
