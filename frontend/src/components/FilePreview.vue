<template>
  <div class="modal" v-if="visible && file" @click.self="close">
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3 class="modal-title">{{ file.name }}</h3>
        <span class="modal-close" @click="close">&times;</span>
      </div>
      <div class="preview-content">
        <img v-if="previewType === 'image'" :src="streamUrl" class="preview-image">
        <video v-else-if="previewType === 'video'" :src="streamUrl" controls class="preview-video"></video>
        <audio v-else-if="previewType === 'audio'" :src="streamUrl" controls class="preview-audio"></audio>
        <iframe v-else-if="previewType === 'pdf'" :src="streamUrl" class="preview-pdf"></iframe>
        <div v-else class="preview-unknown">
          <p>无法预览此文件类型</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { getPreview, getStreamUrl, recordFilePreview } from '../api'
import type { FileWithTags } from '../types'

interface Props {
  visible?: boolean
  file?: FileWithTags | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  file: null
})

const emit = defineEmits<{ close: [] }>()

const previewType = ref<string>('')

const streamUrl = computed(() => {
  return props.file ? getStreamUrl(props.file.id) : ''
})

watch(() => props.visible, async (val: boolean) => {
  if (val && props.file) {
    previewType.value = ''
    try {
      const res = await getPreview(props.file.id)
      if (res.success && res.data) {
        previewType.value = res.data.previewType
        recordFilePreview(props.file.id).catch(() => {})
      }
    } catch (err) {
      console.error('获取预览失败:', err)
    }
  }
})

function close(): void {
  emit('close')
}
</script>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 20px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-large {
  max-width: 800px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.modal-close {
  font-size: 24px;
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
}

.modal-close:hover {
  color: var(--text-primary);
}

.preview-content {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 500px;
}

.preview-video {
  max-width: 100%;
  max-height: 400px;
}

.preview-audio {
  width: 100%;
}

.preview-pdf {
  width: 100%;
  height: 400px;
  border: none;
}

.preview-unknown {
  text-align: center;
  color: var(--text-muted);
}
</style>