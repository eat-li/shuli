// ECharts 公共封装：统一初始化、自适应、销毁，避免页面重复样板代码。
// 按需注册（Pie/Bar/Line + Title/Tooltip/Legend/Grid + Canvas）抽到 utils/echarts.ts，
// 与「插入图表」对话框共用同一份实例，避免重复 use。
import echarts from '../utils/echarts'
import { onBeforeUnmount } from 'vue'

// 图表生命周期封装：init 时登记实例，卸载时统一 dispose，避免内存泄漏与「切页面后 canvas 还在重绘」。
export function useECharts() {
  const charts: ReturnType<typeof echarts.init>[] = []

  // 按配置初始化一个图表并登记，返回值给调用方保留（后续 setOption 用）。
  const init = (el: HTMLElement, option: any) => {
    const chart = echarts.init(el)
    chart.setOption(option)
    charts.push(chart)
    return chart
  }

  // 窗口/容器尺寸变化时统一重算，调用方只挂一个 resize 监听即可。
  const resizeAll = () => charts.forEach((c) => c.resize())

  // 销毁全部实例并清空登记表。必须清 length，否则同一个 composable 复用时会重复 dispose 已释放对象。
  const disposeAll = () => {
    charts.forEach((c) => c.dispose())
    charts.length = 0
  }

  onBeforeUnmount(disposeAll)

  return { init, resizeAll, disposeAll, charts }
}
