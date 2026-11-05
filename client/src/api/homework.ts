import request from './request'
import type { Homework, Question, PageResult } from '../types'

export interface HomeworkQuery {
  status?: string
  /** 标题关键字（模糊匹配） */
  keyword?: string
  /** 分类筛选：分类 id，或 'none' 表示未分类；不传表示全部 */
  categoryId?: string | number
  /** 列表默认只返回题目数量；「加入作业」弹窗需要完整 id 时传 true */
  withQuestionIds?: boolean
  page?: number
  pageSize?: number
}

// 作业列表。带分页返回 PageResult，不带返回全量数组（下拉选择用）。
export function getHomeworks(
  params: HomeworkQuery & { page: number; pageSize: number },
  opts?: { silent?: boolean }
): Promise<PageResult<Homework>>
export function getHomeworks(
  params?: HomeworkQuery,
  opts?: { silent?: boolean }
): Promise<Homework[]>
export function getHomeworks(
  params?: HomeworkQuery,
  opts?: { silent?: boolean }
): Promise<Homework[] | PageResult<Homework>> {
  return request.get('/homeworks', { params, silent: opts?.silent }) as Promise<
    Homework[] | PageResult<Homework>
  >
}

// 取作业详情（不含题目，题目走 getHomeworkQuestions）。
export const getHomework = (id: number): Promise<Homework> => request.get(`/homeworks/${id}`)
// 取作业里的题目完整数据，用于导出与预览。
export const getHomeworkQuestions = (id: number): Promise<Question[]> =>
  request.get(`/homeworks/${id}/questions`)

/** 生成家长端 PDF：提交已排版的打印 HTML，服务端无头打印后上传 OSS */
export const publishHomeworkPdf = (
  id: number,
  html: string
): Promise<{ key: string; url: string; bytes: number }> =>
  request.post(`/homeworks/${id}/pdf`, { html }, { timeout: 120000 })
/** 追加题目到已有作业（只增不删；已存在的题会被后端跳过并计入 duplicated） */
export const addHomeworkQuestions = (
  id: number,
  questionIds: number[]
): Promise<{ added: number; duplicated: number; missing: number[]; total: number }> =>
  request.post(`/homeworks/${id}/questions`, { questionIds })
// 发布作业：标题 + 分类 + 学生名单 + 题目顺序。
export const createHomework = (data: Partial<Homework>) => request.post('/homeworks', data)
// 改作业元数据（标题 / 分类 / 学生名单）。题目增删走 append 与 bulk 接口。
export const updateHomework = (id: number, data: Partial<Homework>) =>
  request.patch(`/homeworks/${id}`, data)
// 删除作业，并清掉题目与学生关联。
export const deleteHomework = (id: number) => request.delete(`/homeworks/${id}`)
/** 批量删除作业（后端一并清理题目/学生关联与课时总结；成绩随外键级联删除） */
export const bulkDeleteHomeworks = (
  ids: number[]
): Promise<{ deleted: number; summaries: number }> =>
  request.post('/homeworks/bulk-delete', { ids }, { timeout: 60000 })
export const saveHomeworkScores = (
  id: number,
  scores: Array<{ studentId: number; score: number }>
) => request.put(`/homeworks/${id}/scores`, { scores })
