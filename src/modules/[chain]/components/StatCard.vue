<script lang="ts" setup>
import { Icon } from '@iconify/vue';

const props = defineProps<{
  icon: string;
  label: string;
  href?: string;
}>();
</script>

<template>
  <div
    class="flex flex-col bg-white hover:bg-base-200 w-full px-2 py-4 rounded-xl justify-center items-center shadow-md
           dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]
           border dark:border-white/10 hover:shadow-lg transition-shadow"
  >
    <div class="flex items-center mb-5 gap-1">
      <Icon :icon="icon" class="text-sm text-[#64748B]" />
      <span class="text-xs text-secondary">{{ label }}</span>
    </div>
    <div class="text-xl text-main flex items-center justify-center font-medium">
      <slot />
      <a
        v-if="href"
        :href="href"
        class="ml-2 text-xl inline-block text-[#64748B] hover:text-info/70"
      >
        <Icon icon="mdi:arrow-right-circle" class="text-sm" />
      </a>
    </div>
  </div>
</template>
