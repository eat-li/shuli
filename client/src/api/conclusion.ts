import request from './request'
import type { Conclusion, PageResult } from '../types'

export interface ConclusionQuery {
  categoryId?: number
  status?: string
  keyword?: string
  page?: number
  pageSize?: number
}

export const getConclusions = (
  params?: ConclusionQuery,
  opts?: { silent?: boolean }
): Promise<PageResult<Conclusion>> => request.get('/conclusions', { params, silent: opts?.silent })
// 取单条结论详情（含正文富文本）。silent 供编辑器保存后的静默刷新使用。
export const getConclusion = (id: number, opts?: { silent?: boolean }): Promise<Conclusion> =>
  request.get(`/conclusions/${id}`, { silent: opts?.silent })
/** 各分类下的结论条数 { [categoryId]: total }：一次聚合查完，供讲义页素材池使用 */
export const getConclusionCategoryCounts = (): Promise<Record<string, number>> =>
  request.get('/conclusions/category-counts') as unknown as Promise<Record<string, number>>
// 新建结论。状态默认草稿，发布走 updateConclusionStatus。
export const createConclusion = (data: Partial<Conclusion>) => request.post('/conclusions', data)
// 整体更新结论的标题 / 正文 / 摘要 / 标签 / 分类。
export const updateConclusion = (id: number, data: Partial<Conclusion>) =>
  request.put(`/conclusions/${id}`, data)
// 只切换发布状态：draft ↔ published。单独一个接口是为了让列表页的开关不必回传整条内容。
export const updateConclusionStatus = (id: number, status: 'draft' | 'published') =>
  request.patch(`/conclusions/${id}/status`, { status })
// 删除结论。已发布内容被讲义引用时，讲义里的那一项会在渲染时跳过。
export const deleteConclusion = (id: number) => request.delete(`/conclusions/${id}`)
