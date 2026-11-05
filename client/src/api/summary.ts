import request from './request'

// 课时总结（关联作业，可指定学生）
export interface LessonSummary {
  id: number
  homeworkId: number
  studentId?: number | null
  lessonAt?: string | null
  lessonNo?: number | null
  content?: string | null
  classStatus?: string | null
  homeworkTask?: string | null
  student?: { id: number; name: string; grade?: string | null } | null
  homework?: { id: number; title?: string | null } | null
  createdAt?: string
  updatedAt?: string
}

export const getSummaries = (
  params: {
    homeworkId?: number
    studentId?: number
  },
  opts?: { silent?: boolean }
): Promise<LessonSummary[]> => request.get('/summaries', { params, silent: opts?.silent })

// 取单条课时总结详情。
export const getSummary = (id: number): Promise<LessonSummary> => request.get(`/summaries/${id}`)

// 新建课时总结（关联作业，可指定学生）。
export const createSummary = (data: Partial<LessonSummary>) => request.post('/summaries', data)
// 保存课时总结的三段内容（上课内容 / 上课状态 / 课后任务）。
export const updateSummary = (id: number, data: Partial<LessonSummary>) =>
  request.patch(`/summaries/${id}`, data)
// 删除课时总结。
export const deleteSummary = (id: number) => request.delete(`/summaries/${id}`)
