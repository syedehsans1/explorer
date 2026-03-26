<script lang="ts" setup>
import { computed } from 'vue'

interface Props {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  itemLabel?: string
  pageSizeOptions?: number[]
  showPageSize?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  itemLabel: 'items',
  pageSizeOptions: () => [10, 25, 50, 100],
  showPageSize: true,
})

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:itemsPerPage': [size: number]
}>()

const safeItemsPerPage = computed(() => Math.max(1, Number(props.itemsPerPage || 1)))
const resolvedTotalPages = computed(() => {
  const fromTotal = props.totalItems > 0 ? Math.ceil(props.totalItems / safeItemsPerPage.value) : 0
  return Math.max(Number(props.totalPages || 0), fromTotal)
})

const rangeStart = computed(() => (
  props.totalItems === 0 ? 0 : (props.currentPage - 1) * safeItemsPerPage.value + 1
))
const rangeEnd = computed(() => Math.min(props.currentPage * safeItemsPerPage.value, props.totalItems))

const canGoPrev = computed(() => props.currentPage > 1)
const canGoNext = computed(() => props.currentPage < resolvedTotalPages.value)

function go(page: number) {
  if (page >= 1 && page <= resolvedTotalPages.value) {
    emit('update:currentPage', page)
  }
}

function changeSize(event: Event) {
  emit('update:itemsPerPage', Number((event.target as HTMLSelectElement).value))
  emit('update:currentPage', 1)
}

function buildDesktopPages(): (number | 'ellipsis')[] {
  const total = resolvedTotalPages.value
  const cur = props.currentPage

  if (total <= 0) return []
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  if (cur <= 3) return [1, 2, 3, 4, 'ellipsis', total]
  if (cur >= total - 2) return [1, 'ellipsis', total - 3, total - 2, total - 1, total]
  return [1, 'ellipsis', cur - 1, cur, cur + 1, 'ellipsis', total]
}

function buildTabletPages(): number[] {
  const total = resolvedTotalPages.value
  const cur = props.currentPage

  if (total <= 0) return []
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  if (cur <= 2) return [1, 2, 3]
  if (cur >= total - 1) return [total - 2, total - 1, total]
  return [cur - 1, cur, cur + 1]
}

const desktopPages = computed(buildDesktopPages)
const tabletPages = computed(buildTabletPages)
</script>

<template>
  <div v-if="resolvedTotalPages > 0" class="tpag-root">
    <div class="tpag-desktop-head">
      <div v-if="showPageSize" class="tpag-size">
        <span class="tpag-label">Rows per page:</span>
        <select :value="safeItemsPerPage" @change="changeSize" class="tpag-select">
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>
      <span class="tpag-info">
        Showing {{ rangeStart }}-{{ rangeEnd }} of {{ totalItems }} {{ itemLabel }}
      </span>
    </div>

    <div class="tpag-tablet-head">
      <span class="tpag-info">Showing {{ rangeStart }}-{{ rangeEnd }} of {{ totalItems }}</span>
      <div v-if="showPageSize" class="tpag-size-inline">
        <span class="tpag-label">Rows:</span>
        <select :value="safeItemsPerPage" @change="changeSize" class="tpag-select">
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>
    </div>

    <div class="tpag-desktop-actions">
      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoPrev" @click="go(1)">«</button>
      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoPrev" @click="go(currentPage - 1)">‹</button>

      <template v-for="(page, index) in desktopPages" :key="`d-${index}`">
        <span v-if="page === 'ellipsis'" class="tpag-ellipsis">...</span>
        <button
          v-else
          type="button"
          class="tpag-btn"
          :class="{ 'tpag-btn-active': page === currentPage }"
          @click="go(page)"
        >
          {{ page }}
        </button>
      </template>

      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoNext" @click="go(currentPage + 1)">›</button>
      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoNext" @click="go(resolvedTotalPages)">»</button>
    </div>

    <div class="tpag-tablet-actions">
      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoPrev" @click="go(1)">«</button>
      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoPrev" @click="go(currentPage - 1)">‹</button>

      <button
        v-for="page in tabletPages"
        :key="`t-${page}`"
        type="button"
        class="tpag-btn"
        :class="{ 'tpag-btn-active': page === currentPage }"
        @click="go(page)"
      >
        {{ page }}
      </button>

      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoNext" @click="go(currentPage + 1)">›</button>
      <button type="button" class="tpag-btn tpag-btn-nav" :disabled="!canGoNext" @click="go(resolvedTotalPages)">»</button>
    </div>

    <div class="tpag-mobile">
      <div class="tpag-mobile-info">
        <span>Page {{ currentPage }} of {{ resolvedTotalPages }}</span>
        <span>{{ rangeStart }}-{{ rangeEnd }} of {{ totalItems }} {{ itemLabel }}</span>
      </div>

      <div class="tpag-mobile-actions">
        <button type="button" class="tpag-mobile-btn" :disabled="!canGoPrev" @click="go(1)">« First</button>
        <button type="button" class="tpag-mobile-btn" :disabled="!canGoPrev" @click="go(currentPage - 1)">‹ Prev</button>
        <span class="tpag-mobile-current">{{ currentPage }}</span>
        <button type="button" class="tpag-mobile-btn" :disabled="!canGoNext" @click="go(currentPage + 1)">Next ›</button>
        <button type="button" class="tpag-mobile-btn" :disabled="!canGoNext" @click="go(resolvedTotalPages)">Last »</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tpag-root {
  width: 100%;
  margin: 1rem 0;
  border-top: 1px solid var(--tpag-shell-border);
  padding-top: 0.95rem;
  --tpag-shell-border: rgba(148, 163, 184, 0.35);
  --tpag-btn-border: #d7deea;
  --tpag-btn-bg: #ffffff;
  --tpag-btn-hover: #f6f8fc;
  --tpag-btn-text: #334155;
  --tpag-muted: #64748b;
  --tpag-active-bg: #0f274a;
  --tpag-active-text: #ffffff;
  --tpag-focus: rgba(59, 130, 246, 0.35);
  --tpag-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  --tpag-shell-bg: rgba(248, 250, 252, 0.7);
  --tpag-btn-hover-border: #8ca0c0;
  --tpag-select-menu-bg: #ffffff;
  --tpag-select-menu-text: #334155;
}

:global(html.dark) .tpag-root,
:global(html[data-theme='dark']) .tpag-root {
  --tpag-shell-border: rgba(88, 101, 126, 0.45);
  --tpag-btn-border: rgba(89, 104, 136, 0.92);
  --tpag-btn-bg: rgba(18, 25, 41, 0.82);
  --tpag-btn-hover: rgba(29, 39, 63, 0.98);
  --tpag-btn-text: #dae5f8;
  --tpag-muted: #98a6c2;
  --tpag-active-bg: rgba(61, 85, 134, 0.95);
  --tpag-active-text: #ffffff;
  --tpag-focus: rgba(96, 165, 250, 0.42);
  --tpag-shadow: 0 1px 2px rgba(2, 6, 23, 0.45);
  --tpag-shell-bg: rgba(12, 18, 30, 0.55);
  --tpag-btn-hover-border: #7a90bb;
  --tpag-select-menu-bg: #172033;
  --tpag-select-menu-text: #dae5f8;
}

.tpag-desktop-head,
.tpag-tablet-head {
  display: none;
}

.tpag-label,
.tpag-info {
  color: var(--tpag-muted);
}

.tpag-label {
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.tpag-info {
  font-size: 12px;
  line-height: 1.4;
  font-weight: 500;
}

.tpag-size {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tpag-size-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tpag-select {
  height: 34px;
  min-width: 78px;
  padding: 0 0.75rem;
  border-radius: 9px;
  border: 1px solid var(--tpag-btn-border);
  background: var(--tpag-btn-bg);
  color: var(--tpag-btn-text);
  font-size: 13px;
  font-weight: 600;
  outline: none;
  box-shadow: var(--tpag-shadow);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.tpag-select option {
  background: var(--tpag-select-menu-bg);
  color: var(--tpag-select-menu-text);
}

.tpag-select:focus-visible {
  border-color: var(--tpag-active-bg);
  box-shadow: 0 0 0 3px var(--tpag-focus);
}

.tpag-desktop-actions,
.tpag-tablet-actions {
  display: none;
  width: fit-content;
  padding: 0.35rem;
  border: 1px solid var(--tpag-shell-border);
  border-radius: 12px;
  background: var(--tpag-shell-bg);
  margin-inline: auto;
}

.tpag-btn {
  height: 34px;
  min-width: 34px;
  padding: 0 0.62rem;
  border-radius: 9px;
  border: 1px solid var(--tpag-btn-border);
  background: var(--tpag-btn-bg);
  color: var(--tpag-btn-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  box-shadow: var(--tpag-shadow);
  transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
}

.tpag-btn-nav {
  min-width: 32px;
}

.tpag-btn:hover:not(:disabled) {
  background: var(--tpag-btn-hover);
  border-color: var(--tpag-btn-hover-border);
  transform: translateY(-1px);
}

.tpag-btn:focus-visible {
  outline: none;
  border-color: var(--tpag-active-bg);
  box-shadow: 0 0 0 3px var(--tpag-focus);
}

.tpag-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.tpag-btn-active {
  background: var(--tpag-active-bg);
  color: var(--tpag-active-text);
  border-color: var(--tpag-active-bg);
  box-shadow: none;
}

.tpag-ellipsis {
  color: var(--tpag-muted);
  padding: 0 0.25rem;
  font-size: 12px;
  letter-spacing: 0.05em;
}

.tpag-mobile {
  display: block;
  padding: 0.6rem;
}

.tpag-mobile-info {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--tpag-muted);
  font-size: 11px;
  margin-bottom: 0.55rem;
  font-weight: 500;
}

.tpag-mobile-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 0.35rem;
  overflow-x: auto;
  padding-bottom: 0.15rem;
}

.tpag-mobile-btn,
.tpag-mobile-current {
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--tpag-btn-border);
  background: var(--tpag-btn-bg);
  color: var(--tpag-btn-text);
  font-size: 12px;
  font-weight: 600;
}

.tpag-mobile-btn {
  padding: 0 0.55rem;
  white-space: nowrap;
  box-shadow: var(--tpag-shadow);
}

.tpag-mobile-btn:focus-visible {
  outline: none;
  border-color: var(--tpag-active-bg);
  box-shadow: 0 0 0 3px var(--tpag-focus);
}

.tpag-mobile-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.tpag-mobile-current {
  min-width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tpag-active-bg);
  color: var(--tpag-active-text);
  border-color: var(--tpag-active-bg);
}

@media (min-width: 768px) {
  .tpag-mobile {
    display: none;
  }

  .tpag-tablet-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0rem 1rem;
    margin-bottom: 0.75rem;
  }

  .tpag-tablet-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }
}

@media (min-width: 1024px) {
  .tpag-tablet-head,
  .tpag-tablet-actions {
    display: none;
  }

  .tpag-desktop-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0 1rem;
    margin-bottom: 0.75rem;
  }

  .tpag-desktop-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }
}
</style>
