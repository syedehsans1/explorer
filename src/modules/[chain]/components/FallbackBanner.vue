<script lang="ts" setup>
import { Icon } from '@iconify/vue';

defineProps<{
  errorMessage?: string;
}>();
</script>

<template>
  <div
    :class="errorMessage
      ? 'bg-red-100 border-red-400 text-red-700'
      : 'bg-yellow-100 border-yellow-400 text-yellow-700'"
    class="border px-4 py-2 mx-5 mb-3 rounded-lg"
    role="alert"
  >
    <div class="flex items-center">
      <Icon
        :icon="errorMessage ? 'mdi:alert-octagon' : 'mdi:alert-circle'"
        class="mr-2 text-lg flex-shrink-0"
      />
      <span class="text-sm font-medium">
        <template v-if="!errorMessage">
          Our system is temporarily under maintenance. You're currently viewing live data from an
          alternative source.
        </template>
        <template v-else>
          {{ errorMessage }}
        </template>
      </span>
    </div>
  </div>
</template>
