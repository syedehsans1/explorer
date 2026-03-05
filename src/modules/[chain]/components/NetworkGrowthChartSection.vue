<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import ApexCharts from 'vue3-apexcharts';

type ChartType = 'bar' | 'area' | 'line';
type GrowthTab = 'core-services' | 'performance';
type PerformanceMetric = 'relays' | 'compute-units';

defineProps<{
  chartOptions: object;
  activeSeries: any[];
  chartCategories: string[];
  tab: GrowthTab;
  chartType: ChartType;
  performanceMetric: PerformanceMetric;
  windowDays: number;
}>();

const emit = defineEmits<{
  'update:tab': [value: GrowthTab];
  'update:chartType': [value: ChartType];
  'update:performanceMetric': [value: PerformanceMetric];
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
    <div class="flex items-center justify-between mb-4 px-5 gap-4">
      <div class="flex flex-1 items-center gap-4 justify-between">
        <div class="text-lg font-semibold text-main">Network Growth</div>
        <div class="flex tabs tabs-boxed bg-base-200 dark:bg-base-300">
          <button
            :class="['tab', tab === 'performance' ? 'tab-active bg-[#09279F] text-white' : '']"
            @click="emit('update:tab', 'performance')"
          >Performance</button>
          <button
            :class="['tab', tab === 'core-services' ? 'tab-active bg-[#09279F] text-white' : '']"
            @click="emit('update:tab', 'core-services')"
          >Services</button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-secondary">Window</span>
        <select
          :value="windowDays"
          class="select select-xs select-bordered bg-base-100 dark:bg-base-200 text-xs"
          @change="emit('update:windowDays', Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="7">7d</option>
          <option :value="15">15d</option>
        </select>
      </div>
    </div>

    <!-- Chart body -->
    <div class="dark:bg-base-200 bg-base-100 p-4 rounded-md relative">
      <div class="h-80">
        <ApexCharts
          v-if="chartCategories.length && activeSeries.length"
          :key="`${tab}-${chartType}-${performanceMetric}`"
          :type="chartType"
          height="280"
          :options="chartOptions"
          :series="activeSeries"
        />
        <div v-else class="flex items-center justify-center h-full">
          <div class="loading loading-spinner loading-md"></div>
          <span class="ml-2 text-secondary">Loading chart data...</span>
        </div>
      </div>

      <!-- Performance metric toggle -->
      <div
        v-if="tab === 'performance'"
        class="absolute bottom-2 left-2 tabs tabs-boxed bg-base-200 dark:bg-base-300"
      >
        <button
          :class="['tab', performanceMetric === 'compute-units' ? 'tab-active bg-[#EF4444] text-white' : 'hover:bg-base-300']"
          title="Compute Units"
          @click="emit('update:performanceMetric', 'compute-units')"
        >
          <Icon icon="mdi:cpu-64-bit" class="text-sm mr-1" />Compute Units
        </button>
        <button
          :class="['tab', performanceMetric === 'relays' ? 'tab-active bg-[#A855F7] text-white' : 'hover:bg-base-300']"
          title="Relays"
          @click="emit('update:performanceMetric', 'relays')"
        >
          <Icon icon="mdi:network" class="text-sm mr-1" />Relays
        </button>
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
