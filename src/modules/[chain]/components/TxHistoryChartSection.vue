<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import ApexCharts from 'vue3-apexcharts';

type ChartType = 'bar' | 'area' | 'line';

defineProps<{
  chartOptions: object;
  series: any[];
  chartType: ChartType;
  windowDays: number;
}>();

const emit = defineEmits<{
  'update:chartType': [value: ChartType];
  'update:windowDays': [value: number];
}>();
</script>

<template>
  <div
    class="bg-base-200 pt-3 rounded-lg hover:bg-base-300 shadow-md
           dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]
           border dark:border-white/10 hover:shadow-lg"
  >
    <!-- Header controls -->
    <div class="flex items-center justify-between mb-4 px-5">
      <div class="text-lg font-semibold text-main">Transaction History</div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-secondary">Window</span>
        <select
          :value="windowDays"
          class="select select-xs select-bordered bg-base-100 dark:bg-base-200 text-xs"
          @change="emit('update:windowDays', Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="7">7d</option>
          <option :value="15">15d</option>
          <option :value="30">1m</option>
        </select>
      </div>
    </div>

    <!-- Chart body -->
    <div class="dark:bg-base-200 bg-base-100 p-4 rounded-md relative">
      <div class="h-80">
        <ApexCharts
          :key="`tx-${chartType}`"
          :type="chartType"
          height="280"
          :options="chartOptions"
          :series="series"
        />
      </div>

      <!-- Chart type toggle -->
      <div class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
        <button
          :class="['tab', chartType === 'bar' ? 'tab-active bg-[#09279F] text-white' : '']"
          title="Bar Chart"
          @click="emit('update:chartType', 'bar')"
        ><Icon icon="mdi:chart-bar" class="text-sm" /></button>
        <button
          :class="['tab', chartType === 'area' ? 'tab-active bg-[#09279F] text-white' : '']"
          title="Area Chart"
          @click="emit('update:chartType', 'area')"
        ><Icon icon="mdi:chart-areaspline" class="text-sm" /></button>
        <button
          :class="['tab', chartType === 'line' ? 'tab-active bg-[#09279F] text-white' : '']"
          title="Line Chart"
          @click="emit('update:chartType', 'line')"
        ><Icon icon="mdi:chart-line" class="text-sm" /></button>
      </div>
    </div>
  </div>
</template>
