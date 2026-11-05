import request from './request'
import type { PageResult } from '../types'

/** 资料文件（本体在 OSS，这里只有元数据） */
export interface ResourceItem {
  id: number
  title: string
  originalName: string
  ext: string
  mime?: string | null
  size: number
  url: string
  key?: string | null
  categoryId?: number | null
  remark?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ResourceCategory {
  id: number
  name: string
  /** 上级目录；null 为顶层目录 */
  parentId: number | null
  /** 本目录直属资料数 */
  count: number
  /** 含所有子目录的资料数 */
  totalCount: number
}

/** 目录列表 + 「全部 / 未分类」计数，左侧目录一次拿全 */
export interface ResourceCategoryList {
  list: ResourceCategory[]
  uncategorized: number
  total: number
}

export interface ResourceQuery {
  keyword?: string
  /** 分类 id；'none' 表示未分类；不传表示全部 */
  categoryId?: string | number
  page?: number
  pageSize?: number
}

export const getResources = (
  params: ResourceQuery,
  opts?: { silent?: boolean }
): Promise<PageResult<ResourceItem>> =>
  request.get('/resources', { params, silent: opts?.silent }) as Promise<PageResult<ResourceItem>>

/** 文件直传 OSS（multipart）。50MB 上限由后端校验，超时给足 */
export const uploadResource = (
  file: File,
  extra: { categoryId?: number | null; title?: string } = {},
  opts?: { silent?: boolean }
): Promise<ResourceItem> => {
  const form = new FormData()
  form.append('file', file)
  if (extra.categoryId != null) form.append('categoryId', String(extra.categoryId))
  if (extra.title) form.append('title', extra.title)
  return request.post('/resources/upload', form, {
    timeout: 120000,
    silent: opts?.silent
  }) as unknown as Promise<ResourceItem>
}

export const updateResource = (
  id: number,
  data: Partial<Pick<ResourceItem, 'title' | 'categoryId' | 'remark'>>
): Promise<ResourceItem> => request.patch(`/resources/${id}`, data) as Promise<ResourceItem>

// 删除资料记录（不删 OSS 文件，文件保留在桶里可人工找回）。
export const deleteResource = (id: number) => request.delete(`/resources/${id}`)

// 取资料分类树（两级：分类 → 子类）。
export const getResourceCategories = (opts?: { silent?: boolean }): Promise<ResourceCategoryList> =>
  request.get('/resource-categories', { silent: opts?.silent }) as Promise<ResourceCategoryList>

export const createResourceCategory = (
  name: string,
  parentId: number | null = null
): Promise<ResourceCategory> =>
  request.post('/resource-categories', { name, parentId }) as Promise<ResourceCategory>

// 资料分类改名。只影响展示，不影响已归档资料与文件的归属。
export const renameResourceCategory = (id: number, name: string): Promise<ResourceCategory> =>
  request.patch(`/resource-categories/${id}`, { name }) as Promise<ResourceCategory>

export const deleteResourceCategory = (
  id: number
): Promise<{ moved: number; movedTo: number | null }> =>
  request.delete(`/resource-categories/${id}`) as unknown as Promise<{
    moved: number
    movedTo: number | null
  }>
