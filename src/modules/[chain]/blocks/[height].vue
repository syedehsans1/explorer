<script lang="ts" setup>
import { onMounted, ref, watchEffect } from 'vue';
import { Icon } from '@iconify/vue';
import TxsElement from '@/components/dynamic/TxsElement.vue';
import DynamicComponent from '@/components/dynamic/DynamicComponent.vue';
import { computed } from '@vue/reactivity';
import { onBeforeRouteUpdate } from 'vue-router';
import { useBaseStore, useFormatter, useBlockchain, useStakingStore } from '@/stores';
import type { Block } from '@/types';
import Countdown from '@/components/Countdown.vue';
import { useSEO } from '@/composables/useSEO';

const props = defineProps(['height', 'chain']);

const store = useBaseStore();
const format = useFormatter()
const blockchain = useBlockchain();
const staking = useStakingStore();
const current = ref({} as Block)
const target = ref(Number(props.height || 0))
const isLoadingBlock = ref(false)

const height = computed(() => {
  return Number(current.value.block?.header?.height || props.height || 0);
});

// SEO Meta Tags
const chainName = computed(() => blockchain.current?.chainName || props.chain || 'Pocket Network');
const blockTitle = computed(() => `Block #${height.value} - ${chainName.value}`);
const blockDescription = computed(() => {
  const txCount = current.value.block?.data?.txs?.length || 0;
  const blockHash = current.value.block_id?.hash || '';
  return `View block #${height.value} on ${chainName.value}. Block hash: ${blockHash.substring(0, 16)}..., ${txCount} transactions, validator information, and block details on Pocket Network Explorer.`;
});
watchEffect(() => {
  useSEO({
    title: blockTitle.value,
    description: blockDescription.value,
    keywords: `${chainName.value}, block ${height.value}, block hash, blockchain block, block details`,
  });
});

const isFutureBlock = computed({
  get: () => {
    const latest = store.latest?.block?.header.height
    const isFuture = latest ? target.value > Number(latest) : true
    if (!isFuture && !current.value.block_id) {
      isLoadingBlock.value = true
      store.fetchBlock(target.value).then(x => {
        current.value = x
        isLoadingBlock.value = false
      })
    }
    return isFuture
  },
  set: val => {
    console.log(val)
  }
})

const remainingBlocks = computed(() => {
  const latest = store.latest?.block?.header.height
  return latest ? Number(target.value) - Number(latest) : 0
})

const estimateTime = computed(() => {
  const seconds = remainingBlocks.value * Number((store.blocktime / 1000).toFixed()) * 1000
  return seconds
})

const estimateDate = computed(() => {
  return new Date(new Date().getTime() + estimateTime.value)
})

const edit = ref(false)
const newHeight = ref(props.height)
function updateTarget() {
  target.value = Number(newHeight.value)
  console.log(target.value)
}

// Load validators and block data on mount
onMounted(async () => {
  try {
    // Fetch validators first so moniker lookup works
    if (!staking.validators || staking.validators.length === 0) {
      await staking.fetchValidators('BOND_STATUS_BONDED', 500);
    }
    
    // Then fetch the block
    isLoadingBlock.value = true;
    const blockData = await store.fetchBlock(target.value);
    current.value = blockData;
    isLoadingBlock.value = false;
  } catch (error) {
    console.error('Error loading block:', error);
    isLoadingBlock.value = false;
  }
});

onBeforeRouteUpdate(async (to, from, next) => {
  if (from.path !== to.path) {
    isLoadingBlock.value = true
    store.fetchBlock(String(to.params.height)).then(x => {
      current.value = x
      isLoadingBlock.value = false
    });
    next();
  }
});
</script>
<template>
  <div class="pt-[6.5rem]">
    <div v-if="isFutureBlock" class="text-center">
      <div v-if="remainingBlocks > 0">
        <div class="text-primary font-bold text-lg my-10">#{{ target }}</div>
        <Countdown :time="estimateTime" css="md:!text-5xl font-sans md:mx-5" />
        <div class="my-5">{{ $t('block.estimated_time') }}: <span class="text-xl font-bold">{{ format.toLocaleDate(estimateDate) }}</span>
        </div>
        <div class="pt-10 flex justify-center">
          <table class="table w-max rounded-lg bg-base-100">
            <tbody>
              <tr class="hover cursor-pointer" @click="edit = !edit">
                <td>{{ $t('block.countdown_for_block') }}:</td>
                <td class="text-right"><span class="md:!ml-40">{{ target }}</span></td>
              </tr>
              <tr v-if="edit">
                <td colspan="2" class="text-center">
                  <h3 class="text-lg font-bold">{{ $t('block.countdown_for_block_input') }}</h3>
                  <p class="py-4">
                  <div class="join">
                    <input class="input input-bordered join-item" v-model="newHeight" type="number" />
                    <button class="btn btn-primary join-item" @click="updateTarget()">{{ $t('block.btn_update') }}</button>
                  </div>
                  </p>
                </td>
              </tr>
              <tr>
                <td>{{ $t('block.current_height') }}:</td>
                <td class="text-right">#{{ store.latest?.block?.header.height }}</td>
              </tr>
              <tr>
                <td>{{ $t('block.remaining_blocks') }}:</td>
                <td class="text-right">{{ remainingBlocks }}</td>
              </tr>
              <tr>
                <td>{{ $t('block.average_block_time') }}:</td>
                <td class="text-right">{{ (store.blocktime / 1000).toFixed(1) }}s</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
    <div v-else>
      <div class="flex flex-row justify-between mb-4 mt-4 gap-4">
        <div class="bg-[#ffffff] hover:bg-base-200 w-[85%;] h-[60px;] px-4 rounded-2xl mb-4 bt-4 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <h2 class="card-title flex flex-row justify-between items-center">
            <p class="text-[#000000] dark:text-[#ffffff] text-[30px]/[66px]">#{{ current.block?.header?.height }}</p>
          </h2>
        </div>
        <div class="flex justify-end items-center mb-4 w-[15%;] gap-1" v-if="props.height">
          <RouterLink :to="`/${store.blockchain.chainName}/blocks/${height - 1}`"
            class="dark:bg-gray-400 bg-[#F2F2F2;] rounded-2xl p-1 w-[47%;] h-[60px;] text-2xl mr-1 flex items-center justify-center shadow-md bg-gradient-to-b border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
            <Icon icon="mdi-arrow-left" class="w-[24px;] h-[24px;] dark:text-blue-100/50 text-[#64748B;]" />
          </RouterLink>
          <RouterLink :to="`/${store.blockchain.chainName}/blocks/${height + 1}`"
            class="dark:bg-base-100 bg-[#64748B] rounded-2xl p-1 w-[45%] h-[60px] text-2xl flex items-center justify-center shadow-md bg-gradient-to-b border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
            <Icon icon="mdi-arrow-right" class="w-[24px] h-[24px] dark:text-blue-100/50 text-[#FFFFFF]" />
          </RouterLink>
        </div>
      </div>

      <!-- Loading Indicator -->
      <div v-if="isLoadingBlock" class="flex items-center justify-center py-20">
        <div class="flex flex-col items-center gap-4">
          <div class="loading loading-spinner loading-lg text-primary"></div>
          <p class="text-lg text-gray-500 dark:text-gray-400">{{ $t('block.loading') || 'Loading Block...' }}</p>
        </div>
      </div>

      <!-- Block Data -->
      <div v-else>
        <div class="flex bg-[#ffffff] hover:bg-base-200 px-4 pt-3 pb-4 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div>
            <DynamicComponent :value="current.block_id" />
          </div>
        </div>


      <div class="flex bg-[#ffffff] hover:bg-base-200 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="px-4 py-2">
          <h2 class="text-base font-semibold text-[#171C1F] dark:text-[#ffffff;]">{{ $t('block.block_header') }}</h2>
        </div>
        <DynamicComponent :value="current.block?.header" />
      </div>

      <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="px-4 py-2">
          <h2 class="card-title flex flex-row justify-between text-[#171C1F] dark:text-[#ffffff;]">{{ $t('account.transactions') }}</h2>
        </div>
        <TxsElement :value="current.block?.data?.txs" />
      </div>

        <div class="flex flex-col bg-[#ffffff] hover:bg-base-200 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
          <div class="px-4 py-2">
            <h2 class="card-title flex flex-row justify-between text-[#171C1F] dark:text-[#ffffff;]">{{ $t('block.last_commit') }}</h2>
          </div>
          <DynamicComponent :value="current.block?.last_commit" />
        </div>
      </div>
    </div>
  </div>
</template>
