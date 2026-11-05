import request from './request'
import type { KnowledgeCategory } from '../types'

// 取知识点分类树。parentId 表达的是目录层级（模块 → 考点），不是结论分级。
export const getCategories = (): Promise<KnowledgeCategory[]> => request.get('/categories')
// 新建分类。parentId 为空即一级模块，给了就是挂在它下面的考点。
export const createCategory = (data: Partial<KnowledgeCategory>) =>
  request.post('/categories', data)
// 改名 / 改排序 / 换父级。
export const updateCategory = (id: number, data: Partial<KnowledgeCategory>) =>
  request.put(`/categories/${id}`, data)
// 删除分类。后端会拒绝删除仍挂着子分类或题目的节点，前端据错误提示引导先迁移。
export const deleteCategory = (id: number) => request.delete(`/categories/${id}`)
