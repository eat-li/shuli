// 全局前端类型定义：与后端模型保持一致
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface Student {
  id: number
  name: string
  grade?: string | null
  contact?: string | null
  remark?: string | null
  createdAt?: string
  updatedAt?: string
}

export type QuestionType = 'choice' | 'fill' | 'solve'

export interface Question {
  id: number
  title: string
  type: QuestionType
  /** 选择题子类型；NULL/undefined = 未区分（存量题，按单选处理） */
  choiceMode?: 'single' | 'multiple' | null
  difficulty: number | null
  knowledgeTag?: string | null
  knowledgeSubTag?: string | null
  body?: string | null
  options?: Array<string | Record<string, unknown>> | null
  answer?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface QuestionStats {
  tag: string
  label: string
  total: number
  choice: number
  /** choice 中按子类型再拆一层（NULL 计为 single），只增字段 */
  choiceSingle?: number
  choiceMultiple?: number
  fill: number
  solve: number
  subTags?: { name: string; total: number }[]
}

export type HomeworkStatus = 'draft' | 'published' | 'closed'

export interface Homework {
  id: number
  title: string
  /** 列表接口默认不返回完整数组（只给 questionCount）；需要时用 withQuestionIds 请求 */
  questionIds?: number[]
  questionCount?: number
  studentIds: number[]
  studentCount?: number
  startAt?: string | null
  endAt?: string | null
  status: HomeworkStatus
  /** 所属作业分类 id；null 表示未分类 */
  categoryId?: number | null
  remark?: string | null
  /** 详情接口附带：该作业的成绩记录（列表接口没有） */
  submissions?: Array<{ id?: number; studentId: number; score: number | null }>
  createdAt?: string
  updatedAt?: string
}

/** 作业分类（一级分类，与知识点分类相互独立） */
export interface HomeworkCategory {
  id: number
  name: string
  sort: number
  /** 是否为默认分类：打开作业页时默认选中它；全表至多一个为 true */
  isDefault?: boolean
  remark?: string | null
  /** 该分类下的作业数：由 /homework-categories 计算返回，不是数据库字段 */
  count?: number
  createdAt?: string
  updatedAt?: string
}

export interface Submission {
  id: number
  homeworkId: number
  studentId: number
  score: number
  student?: Student
  createdAt?: string
  updatedAt?: string
}

export type ExamType = 'final' | 'mid' | 'quiz' | 'popquiz'

export interface ExamScore {
  id: number
  studentId: number
  examType: ExamType
  subject: string
  score: number
  fullScore: number
  examDate: string
  comment?: string | null
  student?: Student
  createdAt?: string
  updatedAt?: string
}

export interface GradeCard {
  id: number
  name: string
  grade?: string | null
  examCount: number
  latest?: Pick<
    ExamScore,
    'id' | 'studentId' | 'examType' | 'subject' | 'score' | 'fullScore' | 'examDate' | 'comment'
  > | null
}

export interface GradeTrendPoint {
  date: string
  examType: ExamType
  score: number
  fullScore: number
  percent: number
}

export interface GradeTrend {
  subject: string
  points: GradeTrendPoint[]
}

export interface GradeRadarItem {
  subject: string
  avgPercent: number
  count: number
}

export interface GradeDistributionItem {
  key: 'excellent' | 'good' | 'pass' | 'fail'
  label: string
  count: number
}

export interface GradeCompareItem {
  studentId: number
  name: string
  grade?: string | null
  avgPercent: number
  count: number
}

export interface GradeSummary {
  trend: GradeTrend[]
  radar: GradeRadarItem[]
  distribution: GradeDistributionItem[]
  compare: GradeCompareItem[]
}

export interface AiConfig {
  hasBackendKey: boolean
  baseUrl: string
  model: string
  allowedBaseUrls?: string[]
}

export interface AiFormatPayload {
  text: string
  /**
   * 这段内容属于哪个字段：
   * stem=题干、body=补充说明、answer=答案与解析、auto=未知（按题干处理）。
   * 后端据此判断「多出来的答案解析」要不要删——answer 字段本身就是答案，绝不能删。
   */
  field?: 'stem' | 'body' | 'answer' | 'auto'
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AiFormatResult {
  html: string
}

/** AI 生成「答案与解析」的入参：只传题目 id，题干由后端自己读，前端不必也不该重传 */
export interface AiAnswerPayload {
  questionId: number
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AiAnswerResult {
  html: string
}

/** 课时总结的 AI 生成入参（学生/时间由前端补充，这里传作业与可用凭据） */
export interface AiLessonSummaryPayload {
  homeworkId: number
  studentId?: number | null
  extraNotes?: string
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AiLessonSummaryResult {
  content: string
  classStatus: string
  homeworkTask: string
}

/** AI 结论生成的入参：标题必填，简介/分类可选，凭据由 resolveAiCreds 解析 */
export interface AiConclusionPayload {
  title: string
  intro?: string
  categoryName?: string
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface KnowledgeCategory {
  id: number
  name: string
  parentId?: number | null
  sort: number
  remark?: string | null
  children?: KnowledgeCategory[]
}

export type ConclusionStatus = 'draft' | 'published'

export interface Conclusion {
  id: number
  title: string
  categoryId: number
  content: string
  summary?: string | null
  status: ConclusionStatus
  tags?: string | null
  category?: KnowledgeCategory
  createdAt?: string
  updatedAt?: string
}

/**
 * 图形库图片：文件本体在 OSS，这里只有元数据。
 * width/height 是原始像素尺寸，瀑布流靠它在上传后立刻预留高度（避免滚动时布局跳动）。
 */
export interface Figure {
  id: number
  title: string
  url: string
  key?: string | null
  width?: number
  height?: number
  size?: number
  tags?: string | null
  createdAt?: string
  updatedAt?: string
}

// —— 试卷 ——
export type PaperSectionKey = 'single' | 'multiple' | 'fill' | 'solve'

export interface PaperLayoutConfig {
  /** 学校名称：留空不显示 */
  school?: string
  /** 卷头第一行左侧（如「2026 学年第一学期」），留空用学段 */
  session?: string
  /** 答题留白缩放，1 = 标准 */
  gapRatio?: number
  /** 解答/填空是否在题号行右侧标分值 */
  showScoreTag?: boolean
  optionColumns?: 1 | 2
}

export interface Paper {
  id: number
  title: string
  subtitle?: string | null
  stage: string
  paperType: string
  duration: number
  totalScore: number
  source: 'manual' | 'ai'
  layout?: PaperLayoutConfig | null
  notices?: string | null
  aiMeta?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
  /** 列表接口附带 */
  questionCount?: number
  scoreSum?: number
}

export interface PaperItemPayload {
  questionId: number
  section: PaperSectionKey
  score: number
}

export interface PaperItemDetail extends PaperItemPayload {
  question: Question
}

export interface PaperDetail {
  paper: Paper
  items: PaperItemDetail[]
  scoreSum: number
  missing: number
}

/** 试卷编辑器里的卷头表单状态（含 notices 的文本域形态） */
export interface PaperMetaFormState {
  title: string
  subtitle: string
  stage: string
  paperType: string
  duration: number
  totalScore: number
  layout: {
    school: string
    session: string
    gapRatio: number
    showScoreTag: boolean
    optionColumns: 1 | 2
  }
  noticesText: string
}

/** AI 判难度：入参与「生成答案」同形，题干由后端读取 */
export interface AiDifficultyPayload {
  questionId: number
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AiDifficultyResult {
  questionId: number
  /** 模型给出的 1-5 */
  difficulty: number
  /** 判断依据，不超过 60 字 */
  reason: string
  /** 判定前库里的值（null = 未标注） */
  currentDifficulty: number | null
}

/** 批量判难度的候选（轻量字段，不含题干 HTML） */
export interface DifficultyCandidate {
  id: number
  title: string
  type: string
  choiceMode?: 'single' | 'multiple' | null
  difficulty: number | null
  knowledgeTag?: string | null
}
