// ECharts 按需注册：统一在这里 use 一次，页面与「插入图表」对话框共用同一份实例，
// 避免各处重复注册（重复 use 会让组件注册表被反复写入，也容易漏注册导致图表空白）。
import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart, RadarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  MarkLineComponent,
  RadarComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  PieChart,
  BarChart,
  LineChart,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  // 树摇构建下 markLine 是独立组件：不注册的话 series 里的 markLine 配置
  // 被静默忽略，不报错也不画——成绩趋势图那条平均参考线就是这么没的。
  MarkLineComponent,
  // 雷达图需要 RadarComponent（坐标系），漏了会是空白画布且不报错
  RadarComponent,
  CanvasRenderer
])

export default echarts
