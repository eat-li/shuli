<template>
  <div class="settings">
    <el-card class="block">
      <template #header>
        <div class="block-title">{{ t('systemSettings.aiTitle') }}</div>
      </template>
      <p class="desc">{{ t('systemSettings.aiDesc') }}</p>
      <el-alert
        v-if="backendConfig.hasBackendKey"
        type="success"
        :closable="false"
        show-icon
        :title="t('systemSettings.backendKeyTitle')"
        style="margin-bottom: 16px"
      />
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        :title="t('systemSettings.allowTitle')"
      >
        <div class="allow-list">
          {{ t('systemSettings.allowedNow') }}
          <span v-if="backendConfig.allowedBaseUrls?.length">{{
            backendConfig.allowedBaseUrls.join('　')
          }}</span>
          <span v-else>{{ t('systemSettings.allowFallback') }}</span>
        </div>
        <!-- 涉及 server/.env 与重启后端，属于运维细节：默认折叠，不摆在老师面前 -->
        <el-button link type="primary" class="allow-toggle" @click="showAllowHint = !showAllowHint">
          {{
            showAllowHint ? t('systemSettings.allowToggleShow') : t('systemSettings.allowToggle')
          }}
        </el-button>
        <div v-show="showAllowHint" class="allow-list allow-list--hint">
          {{ t('systemSettings.allowHint1') }}<code>server/.env</code
          >{{ t('systemSettings.allowHint2') }}<code>AI_ALLOWED_BASE_URLS</code
          >{{ t('systemSettings.allowHint3') }}<code>AI_ALLOW_ANY_BASE_URL=true</code
          >{{ t('systemSettings.allowHint4') }}
        </div>
      </el-alert>
      <el-form
        label-width="100px"
        style="max-width: 560px"
        @keydown.enter="(e) => submitOnEnter(e, save)"
      >
        <el-form-item label="API Key">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="t('systemSettings.apiKeyPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('systemSettings.baseUrlLabel')">
          <el-select
            v-model="form.baseUrl"
            filterable
            allow-create
            default-first-option
            style="width: 100%"
            :placeholder="t('systemSettings.baseUrlPlaceholder')"
          >
            <el-option label="OpenAI" value="https://api.openai.com/v1" />
            <el-option
              :label="t('systemSettings.presetDeepSeek')"
              value="https://api.deepseek.com/v1"
            />
            <el-option
              :label="t('systemSettings.presetQwen')"
              value="https://dashscope.aliyuncs.com/compatible-mode/v1"
            />
            <el-option label="Kimi" value="https://api.moonshot.cn/v1" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('systemSettings.modelLabel')">
          <el-input v-model="form.model" :placeholder="t('systemSettings.modelPlaceholder')" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Check" @click="save">{{
            t('systemSettings.saveConfig')
          }}</el-button>
          <el-button :icon="Delete" @click="reset">{{ t('systemSettings.clearConfig') }}</el-button>
        </el-form-item>
      </el-form>
      <p class="hint">{{ t('systemSettings.localStorageHint') }}</p>
    </el-card>

    <!-- 数据备份提醒：从「数据备份」页搬过来，让本页真正是「系统设置」而不是只有 AI 一项。
         备份页保留状态展示与下载/恢复动作，策略配置统一放这里。 -->
    <el-card class="block">
      <template #header>
        <div class="block-title">{{ t('systemSettings.backupTitle') }}</div>
      </template>
      <p class="desc">{{ t('systemSettings.backupDesc') }}</p>
      <!-- 读失败时不能拿默认值冒充真实策略：此时保存会把老师的设置覆盖掉 -->
      <ListError v-if="reminderError" :message="reminderError" @retry="loadReminder" />
      <el-form label-width="100px" style="max-width: 560px">
        <el-form-item :label="t('systemSettings.enableLabel')">
          <el-switch v-model="reminder.enabled" />
        </el-form-item>
        <el-form-item :label="t('systemSettings.intervalLabel')">
          <el-input-number
            v-model="reminder.intervalDays"
            :min="1"
            :max="365"
            :disabled="!reminder.enabled"
          />
          <span class="unit">{{ t('systemSettings.daysUnit') }}</span>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :icon="Check"
            :loading="savingReminder"
            :disabled="!!reminderError"
            @click="saveReminder"
          >
            {{ t('systemSettings.saveReminder') }}
          </el-button>
          <span v-if="backupStatus && !reminderError" class="remind-stat">
            {{
              backupStatus.lastAt
                ? t('systemSettings.lastBackupAt', { date: formatDateTime(backupStatus.lastAt) })
                : t('systemSettings.neverBackedUp')
            }}
          </span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAiConfig } from '../../api/ai'
import { getBackupStatus, updateBackupReminder } from '../../api/backup'
import type { BackupStatus } from '../../api/backup'
import { loadAiConfig, saveAiConfig, clearAiConfig } from '../../utils/aiConfig'
import { formatDateTime } from '../../utils/format'
import { submitOnEnter } from '../../utils/formEnter'
import ListError from '../../components/ListError.vue'

// 服务器配置说明默认折叠：它涉及 server/.env 和重启后端，不该摆在老师面前
const { t } = useI18n()
const showAllowHint = ref(false)

// —— 数据备份提醒（策略配置）——
const reminder = reactive({ enabled: true, intervalDays: 7 })
const backupStatus = ref<BackupStatus | null>(null)
const savingReminder = ref(false)
const reminderError = ref('')

const saveReminder = async () => {
  savingReminder.value = true
  try {
    backupStatus.value = await updateBackupReminder({
      enabled: reminder.enabled,
      intervalDays: reminder.intervalDays
    })
    ElMessage.success(
      reminder.enabled
        ? t('systemSettings.reminderEnabled', { n: reminder.intervalDays })
        : t('systemSettings.reminderDisabled')
    )
  } catch {
    // 错误提示已由 request.ts 统一弹出
  } finally {
    savingReminder.value = false
  }
}

const form = reactive({ apiKey: '', baseUrl: '', model: '' })
const backendConfig = ref<{
  hasBackendKey: boolean
  baseUrl: string
  model: string
  allowedBaseUrls?: string[]
}>({
  hasBackendKey: false,
  baseUrl: '',
  model: '',
  allowedBaseUrls: []
})

const loadReminder = async () => {
  reminderError.value = ''
  try {
    backupStatus.value = await getBackupStatus({ silent: true })
    reminder.enabled = backupStatus.value.enabled
    reminder.intervalDays = backupStatus.value.intervalDays
  } catch (e: any) {
    // 取不到就明确报错并禁止保存：默认值（开启/7 天）不是老师的真实策略
    reminderError.value = e?.message || t('systemSettings.reminderLoadError')
  }
}

onMounted(async () => {
  Object.assign(form, loadAiConfig())
  try {
    backendConfig.value = await getAiConfig()
    // 如果本地没保存过配置，就用后端默认值预填接口地址和模型
    if (!form.baseUrl) form.baseUrl = backendConfig.value.baseUrl
    if (!form.model) form.model = backendConfig.value.model
  } catch {
    // 后端配置接口失败时保持默认，错误已由 request.ts 提示
  }
  await loadReminder()
})

const save = () => {
  if (!form.apiKey.trim() && !backendConfig.value.hasBackendKey) {
    ElMessage.warning(t('systemSettings.needKey'))
    return
  }
  saveAiConfig({
    apiKey: form.apiKey.trim(),
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim()
  })
  ElMessage.success(t('systemSettings.configSaved'))
}

// 清空会丢掉已存的 API Key，属于不可恢复操作，必须二次确认
const reset = async () => {
  try {
    await ElMessageBox.confirm(t('systemSettings.clearConfirm'), t('systemSettings.clearTitle'), {
      type: 'warning',
      confirmButtonText: t('systemSettings.clearConfig'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  form.apiKey = ''
  form.baseUrl = ''
  form.model = ''
  clearAiConfig()
  ElMessage.success(t('systemSettings.cleared'))
}
</script>

<style scoped>
.settings {
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
.hint {
  margin: 12px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
  opacity: 0.7;
}
/* 接口地址白名单说明 */
.allow-list {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.8;
  word-break: break-all;
}
.allow-list--hint {
  opacity: 0.8;
}
.allow-list code {
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: rgba(26, 32, 38, 0.07);
  font-size: 12px;
}
/* 折叠开关：贴在上一条说明下面，不额外占一行高度 */
.allow-toggle {
  margin-top: 4px;
  font-size: 12px;
}
.unit {
  margin-left: 8px;
  color: var(--ink-soft);
  font-size: 13px;
}
.remind-stat {
  margin-left: 14px;
  color: var(--ink-soft);
  font-size: 12.5px;
}
</style>
