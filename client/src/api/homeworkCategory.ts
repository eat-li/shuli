import request from './request'
import type { HomeworkCategory } from '../types'

/**
 * 分类看板的返回值。
 * total 是「全部」卡片的数字（含未分类），uncategorized 是未分类作业数。
 * 二者都由后端一次算出来——若让前端逐类再请求一次，分类一多就是 N+1 次往返。
 */
export interface HomeworkCategoryBoard {
  list: HomeworkCategory[]
  total: number
  uncategorized: number
  /** 默认分类 id（无默认时为 null）。由后端给出，免得两个页面各推导一遍 */
  defaultCategoryId: number | null
}

/**
 * 分类看板数据。
 * 传 status='published' 时只统计已发布作业——「浏览作业」页只用已发布作业，
 * 若不传，卡片上的数字会和下方列表对不上。
 */
export const getHomeworkCategoryBoard = (params?: {
  status?: string
}): Promise<HomeworkCategoryBoard> =>
  request.get('/homework-categories', { params }) as Promise<HomeworkCategoryBoard>

/**
 * 只取分类列表，丢掉计数。
 * 「发布/编辑作业」的分类下拉只需要 id + name + isDefault：
 * 计数是看板的事，而且那个下拉里也不该显示「作业数」——用户正在编辑的
 * 这份作业本身算不算进去会让数字看起来不对。看板接口顺手就返回了列表，
 * 不另开一个「只查列表」的端点。
 */
export const listHomeworkCategories = async (): Promise<HomeworkCategory[]> =>
  (await getHomeworkCategoryBoard()).list

export const createHomeworkCategory = (data: {
  name: string
  sort?: number
  remark?: string | null
}): Promise<HomeworkCategory> =>
  request.post('/homework-categories', data) as Promise<HomeworkCategory>

export const updateHomeworkCategory = (
  id: number,
  data: { name?: string; sort?: number; remark?: string | null }
): Promise<HomeworkCategory> =>
  request.put(`/homework-categories/${id}`, data) as Promise<HomeworkCategory>

// 删除作业分类。分类下还有作业时由后端拒绝，避免作业变成孤儿。
export const deleteHomeworkCategory = (id: number) => request.delete(`/homework-categories/${id}`)

/**
 * 设置 / 取消默认分类。
 * 单独一个动作接口，不走 updateHomeworkCategory：后端要在同一个事务里
 * 先清空其它默认再置位，保证「至多一个默认」。
 */
export const setHomeworkCategoryDefault = (
  id: number,
  isDefault = true
): Promise<HomeworkCategory> =>
  request.put(`/homework-categories/${id}/default`, { isDefault }) as Promise<HomeworkCategory>
