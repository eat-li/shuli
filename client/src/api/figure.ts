import request from './request'
import type { Figure } from '../types'

// 图形库：图片元数据接口（文件本体仍走 POST /upload 存 OSS）
export interface FigureQuery {
  keyword?: string
  page?: number
  pageSize?: number
}

export interface FigurePage {
  list: Figure[]
  total: number
  page: number
  pageSize: number
}

export const getFigures = (
  params: FigureQuery = {},
  opts?: { silent?: boolean }
): Promise<FigurePage> => request.get('/figures', { params, silent: opts?.silent })
// 登记一条图形记录（文件本身上一步已传 OSS，这里只存元数据）。
export const createFigure = (data: Partial<Figure>): Promise<Figure> =>
  request.post('/figures', data)
// 更新图形的名称 / 分类 / 标签等元数据，不动 OSS 文件。
export const updateFigure = (id: number, data: Partial<Figure>): Promise<Figure> =>
  request.patch(`/figures/${id}`, data)
export interface FigureDeleteOptions {
  /** 是否连 OSS 文件一起删（默认只删记录，保留文件） */
  withFile?: boolean
  /** 图片已被内容引用时，需带 force 再调一次才会真正删文件 */
  force?: boolean
}

export interface FigureDeleteResult {
  /** true = 后端发现图片已被引用，需要前端确认后再带 force 重试 */
  needConfirm?: boolean
  /** 被多少处内容引用（结论/题目） */
  refs?: number
  ossDeleted?: boolean
  /** 记录里没有 OSS key（历史数据），跳过文件删除 */
  ossSkipped?: boolean
  ossError?: string
  withFile?: boolean
}

export const deleteFigure = (
  id: number,
  opts: FigureDeleteOptions = {}
): Promise<FigureDeleteResult> =>
  request.delete(`/figures/${id}`, {
    params: {
      ...(opts.withFile ? { with_file: 1 } : {}),
      ...(opts.force ? { force: 1 } : {})
    }
  }) as unknown as Promise<FigureDeleteResult>
