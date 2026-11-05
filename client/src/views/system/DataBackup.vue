<template>
  <div class="backup">
    <!-- 备份提醒 -->
    <el-card class="block">
      <template #header>
        <div class="block-head">
          <span class="block-title">{{ t('dataBackup.remindTitle') }}</span>
          <el-tag
            v-if="status"
            :type="status.due ? 'danger' : 'success'"
            size="small"
            effect="plain"
          >
            {{ status.due ? t('dataBackup.due') : t('dataBackup.notDue') }}
          </el-tag>
        </div>
      </template>
      <p class="desc">{{ t('dataBackup.remindDesc') }}</p>
      <div class="remind-row">
        <span class="remind-label">{{ t('dataBackup.lastBackup') }}</span>
        <span class="remind-value">{{ lastText }}</span>
        <el-button size="small" text :loading="statusLoading" @click="refreshStatus">{{
          t('common.refresh')
        }}</el-button>
      </div>
      <ListError v-if="statusError" :message="statusError" @retry="refreshStatus" />
      <p v-if="status && !statusError" class="remind-next">
        {{
          status.due
            ? t('dataBackup.dueNow')
            : t('dataBackup.nextDue', { date: formatDateTime(status.nextDueAt) })
        }}
      </p>
      <!-- 提醒策略统一在「系统设置」里改，这里只展示状态，避免两处都能配置 -->
      <p class="remind-go">
        {{ t('dataBackup.remindGoBefore') }}
        <el-button link type="primary" @click="goSettings">{{ t('page.settings') }}</el-button>
        {{ t('dataBackup.remindGoAfter') }}
      </p>
    </el-card>

    <!-- 下载全量备份：标题要如实，这里导的是整个库，不只是题目和作业 -->
    <el-card class="block">
      <template #header>
        <div class="block-head">
          <span class="block-title">{{ t('dataBackup.downloadTitle') }}</span>
          <el-tag size="small" effect="plain">{{ t('dataBackup.wholeDb') }}</el-tag>
        </div>
      </template>
      <p class="desc">{{ t('dataBackup.downloadDesc') }}</p>
      <el-button type="primary" :icon="Download" :loading="backupLoading" @click="downloadBackup">
        {{ t('dataBackup.downloadBtn') }}
      </el-button>
    </el-card>

    <!-- 整包恢复 -->
    <el-card class="block">
      <template #header>
        <div class="block-title">{{ t('dataBackup.restoreTitle') }}</div>
      </template>
      <p class="desc">{{ t('dataBackup.restoreDesc') }}</p>
      <!-- 「恢复」在多数人心里＝还原到备份那一刻，但这里是按主键合并，
           备份之后新增的数据并不会消失。这点必须写出来，否则恢复完会以为坏了。 -->
      <el-alert type="info" :closable="false" show-icon class="restore-note">
        <template #title>
          {{ t('dataBackup.restoreNoteStart') }}<b>{{ t('dataBackup.restoreNoteMerge') }}</b
          >{{ t('dataBackup.restoreNoteMid') }}<b>{{ t('dataBackup.restoreNoteNoDelete') }}</b
          >{{ t('dataBackup.restoreNoteEnd') }}
        </template>
      </el-alert>
      <!-- 整包恢复是覆盖式写入，属于有破坏性的操作：用危险色描边，别做成实心主按钮 -->
      <el-button type="danger" plain :icon="Upload" :loading="restoring" @click="triggerRestore">
        {{ t('dataBackup.restoreBtn') }}
      </el-button>
      <input
        ref="restoreInput"
        type="file"
        accept=".zip,application/zip"
        hidden
        @change="onRestoreFile"
      />
    </el-card>

    <!-- 学生信息导出与导入 -->
    <el-card class="block">
      <template #header>
        <div class="block-title">{{ t('dataBackup.studentsTitle') }}</div>
      </template>
      <p class="desc">{{ t('dataBackup.studentsDesc') }}</p>
      <div class="actions">
        <el-button :icon="Download" :loading="exporting" @click="downloadStudents">{{
          t('dataBackup.exportStudents')
        }}</el-button>
        <el-button :icon="Upload" :loading="importing" @click="triggerImport">{{
          t('dataBackup.importStudents')
        }}</el-button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          hidden
          @change="onImportFile"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { importStudents } from '../../api/student'
import { getBackupStatus, restoreBackup } from '../../api/backup'
import type { BackupStatus } from '../../api/backup'
import { downloadFile } from '../../api/request'
import { formatDateTime } from '../../utils/format'
import ListError from '../../components/ListError.vue'

const router = useRouter()
const { t } = useI18n()

const backupLoading = ref(false)
const exporting = ref(false)
const importing = ref(false)
const restoring = ref(false)
const fileInput = ref<HTMLInputElement>()
const restoreInput = ref<HTMLInputElement>()

/* ══════════════ 备份提醒（只展示状态，策略配置在「系统设置」） ══════════════ */
const status = ref<BackupStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref('')

const goSettings = () => router.push('/settings')

const lastText = computed(() => {
  // 读失败不能显示「从未备份过」——那会让老师以为备份丢了
  if (statusError.value) return t('dataBackup.statusFailed')
  const s = status.value
  if (!s?.lastAt) return t('dataBackup.neverBackedUp')
  const size = s.lastBytes ? `（${(s.lastBytes / 1024 / 1024).toFixed(2)} MB）` : ''
  const ago =
    s.daysSince === 0 ? t('dataBackup.today') : t('dataBackup.daysAgo', { n: s.daysSince })
  return `${formatDateTime(s.lastAt)} · ${ago}${size}`
})

const refreshStatus = async () => {
  statusLoading.value = true
  statusError.value = ''
  try {
    status.value = await getBackupStatus({ silent: true })
  } catch (e: any) {
    statusError.value = e?.message || t('dataBackup.statusLoadError')
  } finally {
    statusLoading.value = false
  }
}

const downloadBackup = async () => {
  backupLoading.value = true
  try {
    // 必须带登录 Token 请求（<a href> 直链不会携带，会被后端 401 拒绝）
    await downloadFile('/backup', `backup-${Date.now()}.zip`)
    ElMessage.success(t('dataBackup.downloadStarted'))
    await refreshStatus() // 后端已记录本次备份，刷新后提醒自动复位
  } catch {
    // 401 跳登录；其它错误已在 downloadFile 内提示
  } finally {
    backupLoading.value = false
  }
}

onMounted(refreshStatus)

const downloadStudents = async () => {
  exporting.value = true
  try {
    await downloadFile('/students/export', `students-${Date.now()}.json`)
  } catch {
    // 401 跳登录；其它错误已在 downloadFile 内提示
  } finally {
    exporting.value = false
  }
}

const triggerRestore = () => restoreInput.value?.click()

const onRestoreFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  // 高危覆盖写操作：先二次确认，再执行。
  // 确认框里必须讲清「合并而非还原」——否则恢复后发现备份之后新增的数据还在、
  // 而旧记录被覆盖，用户会以为恢复坏了；同时提示先留一份现状备份便于退回。
  try {
    await ElMessageBox.confirm(
      t('dataBackup.restoreConfirm', { file: file.name }),
      t('dataBackup.restoreConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('dataBackup.restoreConfirmBtn'),
        cancelButtonText: t('common.cancel'),
        // \n 需要换行样式才能显示成多行
        customClass: 'restore-confirm'
      }
    )
  } catch {
    input.value = ''
    return
  }
  restoring.value = true
  try {
    const res = await restoreBackup(file)
    const total = Object.values(res.counts || {}).reduce((a, b) => a + b, 0)
    if (res.skippedTotal || res.relaxedTotal) {
      // 两种情况对老师意味着不同的事，都要说清楚：
      //   skipped —— 关联记录没恢复（引用的作业/学生/题目不在了）
      //   relaxed —— 记录恢复了，只是所属分类找不到，归到了「未分类」
      ElMessage.warning(
        t('dataBackup.restoreDonePartial', {
          total,
          skipped: res.skippedTotal || 0,
          relaxed: res.relaxedTotal || 0
        })
      )
    } else {
      ElMessage.success(t('dataBackup.restoreDone', { total }))
    }
  } catch (err: any) {
    // API 错误已由 request.ts 全局提示；这里只兜底非 API 错误
    if (!err?.isApiError)
      ElMessage.error(
        t('dataBackup.restoreFailed', { msg: err?.message || t('dataBackup.badFile') })
      )
  } finally {
    restoring.value = false
    input.value = ''
  }
}

const triggerImport = () => fileInput.value?.click()

const onImportFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  // 会按姓名更新已有学生，先二次确认
  try {
    await ElMessageBox.confirm(
      t('dataBackup.importConfirm', { file: file.name }),
      t('dataBackup.importConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('dataBackup.importConfirmBtn'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    input.value = ''
    return
  }
  importing.value = true
  try {
    const text = await file.text()
    let data = JSON.parse(text)
    // 兼容纯数组或 { students: [...] } 等包装结构
    if (!Array.isArray(data)) data = data.students || data.data || []
    if (!data.length) {
      ElMessage.warning(t('dataBackup.noStudents'))
      return
    }
    const res = await importStudents(data)
    ElMessage.success(
      t('dataBackup.importDone', {
        created: res.created,
        updated: res.updated,
        skipped: res.failed ? t('dataBackup.importSkipped', { n: res.failed }) : ''
      })
    )
  } catch (err: any) {
    if (!err?.isApiError)
      ElMessage.error(
        t('dataBackup.importFailed', { msg: err?.message || t('dataBackup.fileError') })
      )
  } finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<style scoped>
.backup {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 760px;
}

.block :deep(.el-card__header) {
  padding: 16px 22px;
}
.block-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 0.02em;
}
.desc {
  margin: 0 0 16px;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.8;
}
.actions {
  display: flex;
  gap: 10px;
}

/* —— 备份提醒 —— */
.block-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.remind-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 13px;
}
.remind-label {
  flex-shrink: 0;
  width: 64px;
  color: var(--ink-soft);
}
.remind-value {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.remind-next {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ink-soft);
}
.remind-go {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--ink-soft);
}

/* 恢复语义说明：放在说明文字和按钮之间，别让老师点之前漏看 */
.restore-note {
  margin-bottom: 14px;
}
.restore-note :deep(.el-alert__title) {
  line-height: 1.75;
}

/* 恢复确认框里的多行说明：\n 要生效必须允许换行。
   弹层被 teleport 到 body，scoped 够不到，用 :global。 */
:global(.restore-confirm .el-message-box__message p) {
  white-space: pre-line;
  line-height: 1.85;
}
</style>
