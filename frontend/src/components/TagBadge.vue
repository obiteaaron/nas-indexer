<template>
  <span
    class="tag-badge"
    :style="{ backgroundColor: color, color: textColor }"
    :title="groupName ? groupName + ': ' + name : name"
  >
    {{ name }}
    <span v-if="removable" class="tag-remove" @click.stop="$emit('remove')">×</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name: string
  color?: string
  groupName?: string
  removable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  color: '#6366f1',
  groupName: '',
  removable: false
})

defineEmits<{ remove: [] }>()

const textColor = computed(() => {
  const hex = props.color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000' : '#fff'
})
</script>

<style scoped>
.tag-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin: 2px;
  cursor: default;
  white-space: nowrap;
}

.tag-remove {
  margin-left: 4px;
  cursor: pointer;
  opacity: 0.7;
  font-weight: bold;
}

.tag-remove:hover {
  opacity: 1;
}
</style>