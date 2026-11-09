<template>
  <el-form :model="meta" label-width="92px" size="default" @submit.prevent>
    <el-form-item :label="t('paperMeta.titleLabel')">
      <el-input v-model="meta.title" :placeholder="t('paperMeta.titlePlaceholder')" />
    </el-form-item>
    <el-form-item :label="t('paperMeta.subtitleLabel')">
      <el-input v-model="meta.subtitle" :placeholder="t('paperMeta.subtitlePlaceholder')" />
    </el-form-item>
    <el-form-item :label="t('paperMeta.stageLabel')">
      <el-select v-model="meta.stage" style="width: 100%">
        <el-option v-for="s in STAGES" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
    </el-form-item>
    <el-form-item :label="t('paperMeta.examTypeLabel')">
      <el-select v-model="meta.paperType" style="width: 100%">
        <el-option v-for="t in PAPER_TYPES" :key="t.value" :label="t.label" :value="t.value" />
      </el-select>
    </el-form-item>
    <el-form-item :label="t('paperMeta.durationScoreLabel')">
      <div class="inline-two">
        <el-input-number
          v-model="meta.duration"
          :min="1"
          :max="600"
          :step="10"
          controls-position="right"
        />
        <!-- 满分不可手改：它恒等于各题分值之和。后端 paper.service.js 的 sumScore 每次
             保存都会覆盖 totalScore，PAPER_SCHEMA 的白名单里也没有这个字段，
             所以这里填的值提交上去就没了，重新打开还变成库里的数——是个只能骗人的输入框。 -->
        <el-input-number
          v-model="meta.totalScore"
          :min="0"
          :max="750"
          :step="10"
          :disabled="true"
          controls-position="right"
        />
      </div>
    </el-form-item>
    <el-form-item :label="t('paperMeta.headerInfoLabel')">
      <div class="inline-two">
        <el-input v-model="meta.layout.school" :placeholder="t('paperMeta.schoolPlaceholder')" />
        <el-input v-model="meta.layout.session" :placeholder="t('paperMeta.sessionPlaceholder')" />
      </div>
    </el-form-item>
    <el-form-item :label="t('paperMeta.blankSpaceLabel')">
      <el-slider
        v-model="meta.layout.gapRatio"
        :min="0.5"
        :max="2"
        :step="0.1"
        :format-tooltip="(v: number) => `${Math.round(v * 100)}%`"
      />
    </el-form-item>
    <el-form-item :label="t('paperMeta.showScoreLabel')">
      <el-switch v-model="meta.layout.showScoreTag" />
      <span class="hint">{{ t('paperMeta.showScoreHint') }}</span>
    </el-form-item>
    <el-form-item :label="t('paperMeta.noticesLabel')">
      <el-input
        v-model="meta.noticesText"
        type="textarea"
        :rows="3"
        :placeholder="t('paperMeta.noticesPlaceholder')"
      />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
// 卷头表单：只负责字段绑定，不在组件里保存或校验（校验在服务端与编辑器里做）
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PaperMetaFormState } from '../../types'

const meta = defineModel<PaperMetaFormState>({ required: true })
const { t, te } = useI18n()

const STAGES = computed(() => [
  { value: 'senior1', label: t('gradeLevel.senior1') },
  { value: 'senior2', label: t('gradeLevel.senior2') },
  { value: 'senior3', label: t('gradeLevel.senior3') },
  { value: 'junior1', label: t('gradeLevel.junior1') },
  { value: 'junior2', label: t('gradeLevel.junior2') },
  { value: 'junior3', label: t('gradeLevel.junior3') },
  { value: 'primary', label: t('paperMeta.stagePrimary') }
])

const PAPER_TYPES = computed(() => [
  { value: 'monthly', label: t('paperMeta.examMonthly') },
  { value: 'midterm', label: t('paperMeta.examMidterm') },
  { value: 'final', label: t('paperMeta.examFinal') },
  { value: 'mock', label: t('paperMeta.examMock') },
  { value: 'gaokao', label: t('paperMeta.examGaokao') }
])
</script>

<style scoped>
.inline-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  width: 100%;
}
/* el-input-number 默认 150px，窄屏下会撑破 1fr 列 */
.inline-two :deep(.el-input-number) {
  width: 100%;
}
.hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ink-soft);
}
</style>
