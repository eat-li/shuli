import request from './request'
import type { ExamScore, GradeCard, GradeSummary } from '../types'

export interface GradeQuery {
  studentId?: number
  subject?: string
  examType?: string
  startDate?: string
  endDate?: string
  examDate?: string
  studentName?: string
}

// 按学生 / 科目 / 类型 / 日期区间取成绩明细（表格视图用）。
export const getGrades = (params?: GradeQuery): Promise<ExamScore[]> =>
  request.get('/grades', { params })
export const getGradeCards = (
  params?: GradeQuery,
  opts?: { silent?: boolean }
): Promise<GradeCard[]> => request.get('/grades/cards', { params, silent: opts?.silent })
export const getGradeSummary = (
  params?: GradeQuery,
  opts?: { silent?: boolean }
): Promise<GradeSummary> => request.get('/grades/summary', { params, silent: opts?.silent })
// 录一条成绩。同一「学生 + 类型 + 科目 + 日期」视为同一条记录，重复录入由后端覆盖。
export const createGrade = (data: Partial<ExamScore>) => request.post('/grades', data)
// 批量导入成绩（整表提交）。后端逐条校验，返回成功条数与失败原因。
export const importGrades = (data: Array<Partial<ExamScore>>) =>
  request.post('/grades/import', data)
// 改单条成绩（分数 / 日期 / 备注）。
export const updateGrade = (id: number, data: Partial<ExamScore>) =>
  request.patch(`/grades/${id}`, data)
// 删除单条成绩。
export const deleteGrade = (id: number) => request.delete(`/grades/${id}`)
