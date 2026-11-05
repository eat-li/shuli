// 图表模板预设：Mermaid 文本 + ECharts option 构造器
// 供 DiagramDialog 引用，老师选模板即可得到可编辑的起点代码/数据

export interface MermaidTemplate {
  label: string
  code: string
}

export const MERMAID_TEMPLATES: Record<'flowchart' | 'concept' | 'mindmap', MermaidTemplate> = {
  flowchart: {
    label: '流程图',
    code: `graph TD
  A[开始] --> B{条件判断}
  B -->|是| C[执行分支1]
  B -->|否| D[执行分支2]
  C --> E[结束]
  D --> E`
  },
  concept: {
    label: '概念关系图',
    code: `graph LR
  A[核心概念] --- B[子概念1]
  A --- C[子概念2]
  B --- D[属性1]
  C --- E[属性2]`
  },
  mindmap: {
    label: '思维导图',
    code: `mindmap
  root((主题))
    分支1
      要点1
      要点2
    分支2
      要点3
      要点4`
  }
}

// ECharts 极简表单数据 → option
export type ChartKind = 'bar' | 'line' | 'pie'

export interface ChartFormData {
  // 柱/折线：分类名（每行一个）；饼：每行 "名称,数值"
  raw: string
}

export const CHART_TEMPLATES: Record<
  ChartKind,
  { label: string; placeholder: string; sample: string; buildOption: (raw: string) => any }
> = {
  bar: {
    label: '柱状图',
    placeholder:
      '第一行写分类名（x 轴），第二行写对应数值。\n例：\n第一季度,第二季度,第三季度\n12,18,9',
    sample: '基础题,中档题,难题\n42,35,23',
    buildOption: (raw) => {
      const lines = raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
      const categories = (lines[0] || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const values = (lines[1] || '')
        .split(/[,，]/)
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n))
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: '8%', right: '8%', bottom: '12%', containLabel: true },
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: values, itemStyle: { borderRadius: [4, 4, 0, 0] } }]
      }
    }
  },
  line: {
    label: '折线图',
    placeholder:
      '第一行写分类名（x 轴），第二行写对应数值。\n例：\n第1次,第2次,第3次,第4次\n78,82,85,88',
    sample: '第1次,第2次,第3次,第4次,第5次\n78,82,85,88,91',
    buildOption: (raw) => {
      const lines = raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
      const categories = (lines[0] || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const values = (lines[1] || '')
        .split(/[,，]/)
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n))
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: '8%', right: '8%', bottom: '12%', containLabel: true },
        xAxis: { type: 'category', data: categories, boundaryGap: false },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: values, smooth: true, areaStyle: { opacity: 0.15 } }]
      }
    }
  },
  pie: {
    label: '饼图',
    placeholder: '每行写 "名称,数值"。\n例：\n基础题,40\n中档题,35\n难题,25',
    sample: '选择题,12\n填空题,8\n解答题,5',
    buildOption: (raw) => {
      const data = raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [name, val] = l.split(/[,，]/).map((s) => s.trim())
          return { name, value: Number(val) }
        })
        .filter((d) => d.name && !Number.isNaN(d.value))
      return {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{ type: 'pie', radius: ['35%', '62%'], data, label: { formatter: '{b}: {d}%' } }]
      }
    }
  }
}

// 高级模式：示例 option（柱状）
export const CHART_OPTION_SAMPLE = `{
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["A", "B", "C"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "data": [5, 12, 8] }]
}`
