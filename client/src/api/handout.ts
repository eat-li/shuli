import request from './request'
import type { Question, Conclusion } from '../types'

export type HandoutItemType = 'question' | 'conclusion' | 'knowledge'

/** 讲义内容项：知识点项的 id 指向知识点分类，渲染时连同其下属结论成块展示 */
export interface HandoutItem {
  type: HandoutItemType
  id: number
}

export interface Handout {
  id: number
  title: string
  status: 'draft' | 'published'
  remark?: string | null
  /**
   * 讲义正文（富文本 HTML）。文档式编辑后它是权威内容。
   * 改造前保存的讲义这里是空的，需要前端用 items 惰性转换一次。
   */
  content?: string | null
  /** 列表接口不回正文，只回篇幅统计（正文只在编辑页按需取） */
  contentChars?: number
  contentImages?: number
  contentTables?: number
  /** 旧结构：有序引用数组，仅兼容用 */
  items: HandoutItem[]
  createdAt?: string
  updatedAt?: string
}

/** 知识点区块：分类名 + 其（含子分类）下全部结论 */
export interface KnowledgeBlock {
  id: number
  name: string
  conclusions: Conclusion[]
}

/** GET /handouts/:id/items 的返回：items 已剔除被删除的题目/结论/分类 */
export interface HandoutItems {
  items: HandoutItem[]
  questions: Question[]
  conclusions: Conclusion[]
  knowledges: KnowledgeBlock[]
}

export interface HandoutQuery {
  keyword?: string
  page?: number
  pageSize?: number
}

export const getHandouts = (
  params?: HandoutQuery,
  opts?: { silent?: boolean }
): Promise<{ list: Handout[]; total: number }> =>
  request.get('/handouts', { params, silent: opts?.silent })
// 取讲义元数据。列表接口不回正文，编辑页靠这个接口拿 content。
export const getHandout = (id: number): Promise<Handout> => request.get(`/handouts/${id}`)
// 取讲义引用的题目 / 结论 / 知识点整块内容，供预览与导出。
// 返回体已剔除被删除的项，前端不必再逐个判空。
export const getHandoutItems = (id: number): Promise<HandoutItems> =>
  request.get(`/handouts/${id}/items`)
// 新建讲义（标题 + 正文 + 引用项）。
export const createHandout = (data: Partial<Handout>): Promise<Handout> =>
  request.post('/handouts', data)
// 保存讲义。正文是权威内容，items 仅作旧结构兼容。
export const updateHandout = (id: number, data: Partial<Handout>): Promise<Handout> =>
  request.patch(`/handouts/${id}`, data)
// 删除讲义。
export const deleteHandout = (id: number) => request.delete(`/handouts/${id}`)
