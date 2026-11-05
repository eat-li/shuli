import request from './request'

// 恢复时被跳过的孤儿关联记录（引用的父数据在库里不存在）
export interface RestoreSkippedRow {
  id: number
  field: string
  value: number
  parent: string
}

export interface RestoreResult {
  counts: Record<string, number>
  /** 整条被丢弃的孤儿记录：引用的父数据不存在，且该外键不允许为空 */
  skipped: Record<string, RestoreSkippedRow[]>
  skippedTotal: number
  /** 只断开引用的记录：父数据不存在但该列可为空（如作业所属分类），整行保留 */
  relaxed: Record<string, RestoreSkippedRow[]>
  relaxedTotal: number
}

// 整包恢复：上传备份 ZIP，后端按依赖顺序恢复全部数据
export const restoreBackup = (file: File): Promise<RestoreResult> => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/backup/restore', formData) as unknown as Promise<RestoreResult>
}

/** 备份提醒状态（每次下载备份后由后端自动记录时间，前端据此提醒） */
export interface BackupStatus {
  /** 是否开启提醒 */
  enabled: boolean
  /** 提醒间隔天数 */
  intervalDays: number
  /** 上次备份时间（ISO）；从未备份为 null */
  lastAt: string | null
  /** 上次备份包大小（字节） */
  lastBytes: number
  /** 距今多少天；从未备份为 null */
  daysSince: number | null
  /** 下次提醒时间（ISO）；从未备份为 null（表示立刻提醒） */
  nextDueAt: string | null
  /** 是否该备份了 */
  due: boolean
}

// 查备份提醒状态。silent=true 供后台轮询使用（侧栏角标），失败时不弹 toast 打断用户。
export const getBackupStatus = (opts?: { silent?: boolean }): Promise<BackupStatus> =>
  request.get('/backup/status', { silent: opts?.silent })

export const updateBackupReminder = (data: {
  enabled?: boolean
  intervalDays?: number
}): Promise<BackupStatus> => request.put('/backup/status', data)
