<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import ServiceDashboardByComputeUnits from '../components/ServiceDashboardByComputeUnits.vue';
import ServiceDashboardByRelays from '../components/ServiceDashboardByRelays.vue';

const props = defineProps(['chain']);
const chainStore = useBlockchain();
</script>

<template>
  <div>
    <ServiceDashboardByComputeUnits :chain="chainStore?.current?.chainName || props.chain" />

    <ServiceDashboardByRelays :chain="chainStore?.current?.chainName || props.chain" />
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .table {
    font-size: 0.75rem;
  }

  th,
  td {
    padding: 0.5rem;
  }
}
</style>
