<template>
  <div class="chart-card">
    <h3 class="chart-title" v-if="title">{{ title }}</h3>
    <div class="chart-container">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

export default {
  name: 'ChartCard',
  props: {
    title: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      default: 'pie',
      validator: (value) => ['pie', 'doughnut', 'bar', 'line'].includes(value)
    },
    data: {
      type: Object,
      required: true
    },
    options: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const chartCanvas = ref(null)
    let chartInstance = null

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 20
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            usePointStyle: true
          }
        }
      }
    }

    function createChart() {
      if (chartInstance) {
        chartInstance.destroy()
      }

      if (!chartCanvas.value || !props.data) return

      const ctx = chartCanvas.value.getContext('2d')
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

    return { chartCanvas }
  }
}
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
