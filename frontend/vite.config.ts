import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** 将仅在后台图表页使用的 ECharts 运行时拆分，避免生成单个超大脚本。 */
function splitChartChunks(id: string): string | undefined {
  const moduleId = id.replaceAll('\\', '/')
  if (moduleId.includes('/node_modules/zrender/lib/core/')) return 'echarts-renderer-core'
  if (moduleId.includes('/node_modules/zrender/lib/canvas/')) return 'echarts-renderer-canvas'
  if (moduleId.includes('/node_modules/zrender/lib/graphic/')) return 'echarts-renderer-graphic'
  if (moduleId.includes('/node_modules/zrender/')) return 'echarts-renderer-runtime'
  if (moduleId.includes('/node_modules/echarts/lib/chart/')) return 'echarts-charts'
  if (moduleId.includes('/node_modules/echarts/lib/component/')) return 'echarts-components'
  if (moduleId.includes('/node_modules/echarts/lib/coord/')) return 'echarts-coordinate'
  if (moduleId.includes('/node_modules/echarts/lib/core/')) return 'echarts-core'
  if (moduleId.includes('/node_modules/echarts/')) return 'echarts-runtime'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: splitChartChunks
      }
    }
  }
})