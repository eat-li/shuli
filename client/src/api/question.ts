import request from './request'
import type { Question, QuestionStats, PageResult, DifficultyCandidate } from '../types'

export interface QuestionQuery {
  keyword?: string
  type?: string
  /** 选择题子类型：single 命中 single 与未区分（NULL），multiple 只命中多选 */
  choiceMode?: 'single' | 'multiple'
  difficulty?: number
  knowledgeTag?: string
  knowledgeSubTag?: string
  /** 按 id 批量取（逗号分隔，如 '3,7,9'） */
  ids?: string
  /** 列表排序，取值见后端 SORT_ORDERS；不传 / 未知值 = 按 id 倒序（最新录入在前） */
  sort?: string
  page?: number
  pageSize?: number
}

// 题目列表。带 page/pageSize 走分页返回 PageResult，不带则返回全量数组，
// 供「加入作业」「导出」这类需要整批数据的场景使用。
export function getQuestions(
  params: QuestionQuery & { page: number; pageSize: number },
  opts?: { silent?: boolean }
): Promise<PageResult<Question>>
export function getQuestions(
  params?: QuestionQuery,
  opts?: { silent?: boolean }
): Promise<Question[]>
export function getQuestions(
  params?: QuestionQuery,
  opts?: { silent?: boolean }
): Promise<Question[] | PageResult<Question>> {
  return request.get('/questions', { params, silent: opts?.silent }) as Promise<
    Question[] | PageResult<Question>
  >
}

/**
 * 取符合条件的全部题目，供 PDF 导出使用。
 * 不传分页参数时后端单次最多返回 1000 条，题库变大后导出会被悄悄截断；
 * 这里按 100 条一页循环取完，页数由首次返回的 total 决定。
 */
export const getAllQuestions = async (params: QuestionQuery = {}): Promise<Question[]> => {
  const size = 100
  const first = await getQuestions({ ...params, page: 1, pageSize: size })
  const all: Question[] = [...first.list]
  const pages = Math.ceil(first.total / size)
  for (let p = 2; p <= pages; p++) {
    const res = await getQuestions({ ...params, page: p, pageSize: size })
    all.push(...res.list)
  }
  return all
}

export const getQuestionStats = (
  params?: { keyword?: string },
  opts?: { silent?: boolean }
): Promise<QuestionStats[]> => request.get('/questions/stats', { params, silent: opts?.silent })
// 一级知识点列表（不带题数，纯导航用）。
export const getQuestionTags = (): Promise<string[]> => request.get('/questions/tags')
// 二级知识点（含掌握等级：基础/中等/进阶；null 表示还没定级）
export interface QuestionSubTag {
  name: string
  total: number
  level?: 'basic' | 'medium' | 'advanced' | null
}
// 二级考点（含题数与掌握等级）。knowledgeTag 为空表示不限模块。
export const getQuestionSubTags = (knowledgeTag?: string): Promise<QuestionSubTag[]> =>
  request.get('/questions/subtags', { params: knowledgeTag ? { knowledgeTag } : undefined })
// 一级知识点重命名：后端批量改所有题目上的该字符串，返回受影响条数。
export const renameQuestionTag = (from: string, to: string): Promise<{ updated: number }> =>
  request.patch('/questions/rename-tag', { from, to })

/** 已标记的一级知识点：题库页把这些卡片置顶并高亮 */
export const getQuestionTagMarks = (): Promise<string[]> => request.get('/questions/tag-marks')
export const setQuestionTagMark = (
  tag: string,
  marked: boolean
): Promise<{ tag: string; marked: boolean }> =>
  request.patch('/questions/tag-mark', { tag, marked })

/** 设置二级知识点的掌握等级；level 传 null 表示取消等级 */
export const setQuestionSubLevel = (data: {
  knowledgeTag?: string | null
  name: string
  level: 'basic' | 'medium' | 'advanced' | null
}): Promise<{ name: string; level: string | null }> =>
  request.patch('/questions/subtag-level', data)

export interface UpdateSubTagPayload {
  /** 原二级知识点名称 */
  from: string
  /** 新名称；空表示移回未分类（等效删除该二级知识点） */
  to?: string | null
  /** 限定作用的一级知识点；'__empty__' 表示未分类题库；不传 = 全部题库 */
  knowledgeTag?: string | null
  /** 同时更换所属一级知识点；null 表示改为未分类；不传 = 不更换 */
  toKnowledgeTag?: string | null
}

/** 编辑二级知识点：重命名 / 合并 / 删除（移回未分类）/ 更换所属题库 */
export const updateQuestionSubTag = (
  data: UpdateSubTagPayload
): Promise<{ updated: number; cleared: boolean }> => request.patch('/questions/update-subtag', data)
// 新建题目。题干是富文本 HTML，图片须已是 OSS 地址（表单会先上传再提交）。
export const createQuestion = (data: Partial<Question>) => request.post('/questions', data)
// 改题（题干 / 选项 / 答案 / 知识点 / 难度等）。分值不在这里——分值只存在试卷关联表。
export const updateQuestion = (id: number, data: Partial<Question>) =>
  request.patch(`/questions/${id}`, data)
// 删除题目。已被作业或试卷引用时由后端拒绝，避免引用悬空。
export const deleteQuestion = (id: number) => request.delete(`/questions/${id}`)

/** 已被作业选过的题目 id 集合（「已做过」标记数据源） */
export const getQuestionUsedIds = (): Promise<number[]> => request.get('/questions/used-ids')

/** 难度分析聚合（一次请求拿到分布、交叉、覆盖率） */
export interface QuestionAnalysis {
  total: number
  rated: number
  unrated: number
  avgDifficulty: number | null
  byDifficulty: { difficulty: number | null; count: number }[]
  byTypeDifficulty: { type: string; difficulty: number | null; count: number }[]
  byType: { type: string; count: number }[]
  byKnowledgeDifficulty: {
    tag: string
    label: string
    total: number
    levels: Record<string, number>
  }[]
}

export const getQuestionAnalysis = (
  params?: {
    knowledgeTag?: string
    type?: string
    choiceMode?: 'single' | 'multiple'
    keyword?: string
  },
  opts?: { silent?: boolean }
): Promise<QuestionAnalysis> => request.get('/questions/analysis', { params, silent: opts?.silent })

/**
 * 批量判难度的候选清单。
 * scope：unrated（未标注）/ suspicious（3 星，历史默认值污染）/ all
 */
export interface DifficultyCandidateFilter {
  /** 题型；choice 可再按 choiceMode 细分 */
  type?: '' | 'choice' | 'fill' | 'solve'
  /** 仅 type=choice 时有效 */
  choiceMode?: '' | 'single' | 'multiple'
}
export const getDifficultyCandidates = (
  scope: 'unrated' | 'suspicious' | 'all',
  filter: DifficultyCandidateFilter = {}
): Promise<{ total: number; list: DifficultyCandidate[] }> =>
  request.get('/questions/difficulty-candidates', { params: { scope, ...filter } })
