<script setup lang="ts">
import { themeChange } from 'theme-change';
import { onMounted, computed } from 'vue';
import TxDialog from './components/TxDialog.vue';
import MaintenancePage from './components/MaintenancePage.vue';
import { useRouter } from 'vue-router';


const router = useRouter();

// Check if maintenance mode is enabled via environment variable
// Set VITE_MAINTENANCE_MODE=true in your .env file to enable maintenance mode
const isMaintenanceMode = computed(() => {
  return import.meta.env.VITE_MAINTENANCE_MODE === 'true' || 
         import.meta.env.VITE_MAINTENANCE_MODE === '1';
});

// Optional: Get estimated time from env variable
const estimatedTime = computed(() => {
  return import.meta.env.VITE_MAINTENANCE_ESTIMATED_TIME || undefined;
});

onMounted(() => {
  themeChange(false);
  // Only override route if not in maintenance mode
  if (!isMaintenanceMode.value && window.location.pathname.length == 1)
    router.push(window.location.href.includes('beta') ? 'pocket-lego-testnet' : 'pocket-mainnet')
});


</script>

<template>
  <div>
    <!-- Show maintenance page if maintenance mode is enabled -->
    <MaintenancePage v-if="isMaintenanceMode" :estimated-time="estimatedTime" />
    <!-- Otherwise show normal app -->
    <template v-else>
      <RouterView />
      <TxDialog />

    </template>
  </div>
</template>
