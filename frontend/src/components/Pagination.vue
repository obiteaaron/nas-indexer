<template>
  <div class="pagination" v-if="totalPages > 1">
    <button class="btn btn-secondary btn-small" @click="goToPage(currentPage - 1)" :disabled="currentPage <= 1">上一页</button>

    <template v-for="p in displayPages" :key="p">
      <span v-if="p === '...'" class="page-ellipsis">...</span>
      <button
        v-else
        :class="['btn', 'btn-small', p === currentPage ? 'btn-primary' : 'btn-secondary']"
        @click="goToPage(p as number)"
      >{{ p }}</button>
    </template>

    <button class="btn btn-secondary btn-small" @click="goToPage(currentPage + 1)" :disabled="currentPage >= totalPages">下一页</button>

    <div class="page-jump">
      <span>跳转到</span>
      <input
        class="input input-small"
        type="number"
        v-model="jumpPage"
        @keyup.enter="doJump"
        :min="1"
        :max="totalPages"
      >
      <span>页</span>
      <button class="btn btn-secondary btn-small" @click="doJump">确定</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  modelValue: number
  totalPages: number
}

const props = defineProps<Props>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const jumpPage = ref<string>('')

const currentPage = computed(() => props.modelValue)

const displayPages = computed(() => {
  const total = props.totalPages
  const current = currentPage.value
  const pages: (number | string)[] = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    pages.push(1)

    let start = Math.max(2, current - 2)
    let end = Math.min(total - 1, current + 2)

    if (current <= 4) {
      end = Math.min(6, total - 1)
    }
    if (current >= total - 3) {
      start = Math.max(2, total - 5)
    }

    if (start > 2) {
      pages.push('...')
    }

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (end < total - 1) {
      pages.push('...')
    }

    pages.push(total)
  }

  return pages
})

function goToPage(page: number): void {
  if (page >= 1 && page <= props.totalPages) {
    emit('update:modelValue', page)
  }
}

function doJump(): void {
  const page = parseInt(jumpPage.value)
  if (page >= 1 && page <= props.totalPages) {
    emit('update:modelValue', page)
    jumpPage.value = ''
  }
}
</script>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 0;
}

.page-ellipsis {
  color: var(--text-muted);
  padding: 0 4px;
}

.page-jump {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 16px;
  font-size: 14px;
  color: var(--text-muted);
}

.input-small {
  width: 60px;
  padding: 4px 8px;
  text-align: center;
}

input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type="number"] {
  -moz-appearance: textfield;
}
</style>