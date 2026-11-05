import request from './request'
import type { Student, PageResult } from '../types'

export interface StudentQuery {
  keyword?: string
  grade?: string
  page?: number
  pageSize?: number
}

// 取学生列表。带 page/pageSize 走分页返回 PageResult，不带则返回全量数组——
// 两种形态由同一个接口提供，靠重载区分，避免为「下拉选项」再开一个端点。
export function getStudents(
  params: StudentQuery & { page: number; pageSize: number },
  opts?: { silent?: boolean }
): Promise<PageResult<Student>>
export function getStudents(params?: StudentQuery, opts?: { silent?: boolean }): Promise<Student[]>
export function getStudents(
  params?: StudentQuery,
  opts?: { silent?: boolean }
): Promise<Student[] | PageResult<Student>> {
  return request.get('/students', { params, silent: opts?.silent }) as Promise<
    Student[] | PageResult<Student>
  >
}

// 新增学生。
export const createStudent = (data: Partial<Student>) => request.post('/students', data)
// 改学生信息（姓名 / 年级 / 备注）。
export const updateStudent = (id: number, data: Partial<Student>) =>
  request.patch(`/students/${id}`, data)
// 删除学生。已有成绩或作业关联时由后端拒绝。
export const deleteStudent = (id: number) => request.delete(`/students/${id}`)
// 导入学生名单：后端返回 { created, updated, failed }（axios 拦截器已把 data.data 拆出来，
// 这里显式标注返回类型，否则 TS 会推断成 AxiosResponse，调用方取不到字段）
export const importStudents = (
  data: Array<Pick<Student, 'name'> & Partial<Student>>
): Promise<{ created: number; updated: number; failed: number }> =>
  request.post('/students/import', data) as unknown as Promise<{
    created: number
    updated: number
    failed: number
  }>
