<template>
  <div class="chart-card">
    <h3 class="chart-title" v-if="title">{{ title }}</h3>
    <div class="chart-container">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

interface ChartData {
  labels: string[]
  datasets: Array<{
    data: number[]
    backgroundColor: string[]
    borderWidth?: number
    hoverOffset?: number
  }>
}

interface Props {
  title?: string
  type?: 'pie' | 'doughnut' | 'bar' | 'line'
  data: ChartData
  options?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  type: 'pie',
  options: () => ({})
})

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  layout: {
    padding: 20
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        padding: 16,
        usePointStyle: true
      }
    }
  }
}

function createChart(): void {
  if (chartInstance) {
    chartInstance.destroy()
  }

  if (!chartCanvas.value || !props.data) return

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return
  chartInstance = new Chart(ctx, {
    type: props.type,
    data: props.data,
    options: { ...defaultOptions, ...props.options }
  })
}

onMounted(() => {
  createChart()
})

watch(() => props.data, () => {
  createChart()
}, { deep: true })

watch(() => props.type, () => {
  createChart()
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<style scoped>
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text);
}

.chart-container {
  position: relative;
  height: 320px;
  padding-top: 20px;
}
</style>