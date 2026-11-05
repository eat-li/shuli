// 试卷接口封装
import request from './request'
import type {
  Paper,
  PaperDetail,
  PaperItemPayload,
  PaperSectionKey,
  PageResult,
  Question
} from '../types'

export interface PaperQuery {
  keyword?: string
  page?: number
  pageSize?: number
}

export interface PaperPayload {
  title: string
  subtitle?: string | null
  stage?: string
  paperType?: string
  duration?: number
  layout?: Record<string, unknown> | null
  notices?: string | null
  source?: 'manual' | 'ai'
  aiMeta?: Record<string, unknown> | null
  items?: PaperItemPayload[]
}

export const getPapers = (
  params: PaperQuery & { page: number; pageSize: number },
  opts?: { silent?: boolean }
): Promise<PageResult<Paper>> => request.get('/papers', { params, silent: opts?.silent })

// 取试卷详情（含题目列表与分值快照）。id 允许字符串，兼容「AI 组卷草稿」未落库的临时标识。
export const getPaper = (id: number | string, opts?: { silent?: boolean }): Promise<PaperDetail> =>
  request.get(`/papers/${id}`, { silent: opts?.silent })

// 新建试卷：一次提交元数据 + 题目顺序 + 每题分值。
export const createPaper = (body: PaperPayload): Promise<PaperDetail> =>
  request.post('/papers', body)

export const updatePaper = (
  id: number | string,
  body: Partial<PaperPayload>
): Promise<PaperDetail> => request.put(`/papers/${id}`, body)

// 删除试卷。只删组卷记录，不动题库里的题目。
export const deletePaper = (id: number): Promise<unknown> => request.delete(`/papers/${id}`)

// 复制一份试卷（含题目与分值），用于同结构换题再出卷。
export const duplicatePaper = (id: number): Promise<PaperDetail> =>
  request.post(`/papers/${id}/duplicate`)

// —— AI 组卷（只从题库选题，不生成新题）——
export interface ComposeStructureItem {
  section: PaperSectionKey
  count: number
  score: number
}

export interface ComposeRequest {
  stage: string
  totalScore: number
  duration: number
  structure: ComposeStructureItem[]
  knowledgeTags?: string[]
  excludeUsed?: boolean
  /** 智能体模式：模型多轮调用工具自行凑卷；关闭走刚性管线 */
  agentMode?: boolean
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface ComposeResult {
  sections: { section: PaperSectionKey; score: number; questions: Question[] }[]
  warnings: string[]
  notes: string
  meta: {
    model: string
    candidateCount: number
    elapsedMs: number
    degraded: boolean
    agentMode?: boolean
    agentSteps?: number
    agentToolCalls?: number
  }
}

/** 组卷是长任务（后端上限 90s + 重试），必须覆盖请求层 10s 的默认超时 */
export const composePaper = (body: ComposeRequest): Promise<ComposeResult> =>
  request.post('/ai/compose-paper', body, { timeout: 180000 }) as Promise<ComposeResult>
