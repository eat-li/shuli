import request from './request'

/** 考试类型（字典）：key 稳定，name 可改 */
export interface ExamTypeItem {
  key: string
  name: string
  sort: number
  /** 已有多少条成绩在用 */
  count: number
}

// 取考试类型字典。count 是该类型已被多少条成绩使用，用于提示「删了会影响历史数据」。
export const getExamTypes = (opts?: { silent?: boolean }): Promise<ExamTypeItem[]> =>
  request.get('/exam-types', { silent: opts?.silent }) as Promise<ExamTypeItem[]>

// 新增考试类型，key 由后端按名称生成并保持稳定。
export const createExamType = (name: string): Promise<ExamTypeItem> =>
  request.post('/exam-types', { name }) as Promise<ExamTypeItem>

// 只改显示名，key 不变——历史成绩按 key 关联，改 key 会断掉关联。
export const renameExamType = (key: string, name: string): Promise<ExamTypeItem> =>
  request.patch(`/exam-types/${key}`, { name }) as Promise<ExamTypeItem>

// 删除考试类型。仍被成绩引用时由后端拒绝，避免历史记录失去类型。
export const deleteExamType = (key: string) => request.delete(`/exam-types/${key}`)
