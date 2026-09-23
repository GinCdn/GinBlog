import * as echarts from 'echarts/core'
import { MapChart } from 'echarts/charts'
import { GeoComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([MapChart, GeoComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

export default echarts