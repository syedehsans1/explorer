<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import TablePagination from '@/components/TablePagination.vue'

const props = defineProps({
  total: { type: String },
  limit: { type: Number },
  callback: { type: Function, required: true },
})

const current = ref(1)
const totalItems = computed(() => Number(props.total || 0))
const itemsPerPage = computed(() => Math.max(1, Number(props.limit || 1)))
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage.value))

watch(totalPages, pageCount => {
  if (pageCount <= 0) {
    current.value = 1
    return
  }

  if (current.value > pageCount) {
    current.value = pageCount
    props.callback(pageCount)
  }
})

function onPageChange(page: number) {
  current.value = page
  props.callback(page)
}
</script>

<template>
  <div class="my-5">
    <TablePagination
      :current-page="current"
      :total-pages="totalPages"
      :total-items="totalItems"
      :items-per-page="itemsPerPage"
      item-label="records"
      :show-page-size="false"
      @update:current-page="onPageChange"
    />
  </div>
</template>
