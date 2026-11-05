<template>
  <el-card>
    <div class="toolbar">
      <el-input
        v-model="keyword"
        :placeholder="t('student.searchPlaceholder')"
        :aria-label="t('student.searchPlaceholder')"
        clearable
        style="width: 200px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select
        v-model="grade"
        :placeholder="t('common.grade')"
        clearable
        style="width: 140px"
        @change="search"
      >
        <el-option v-for="g in gradeOptions" :key="g" :label="gradeLabel(g)" :value="g" />
      </el-select>
      <!-- 一张卡片里只留一个实心主按钮（新增）；查询是筛选动作，走中性按钮 -->
      <el-button :icon="Search" @click="search">{{ t('common.search') }}</el-button>
      <el-button type="primary" :icon="Plus" @click="openDialog()">{{
        t('student.addStudent')
      }}</el-button>
    </div>

    <ListError :message="error" @retry="run" />

    <el-table
      v-if="!error"
      :data="list"
      border
      stripe
      v-loading="loading"
      :default-sort="{ prop: 'name', order: 'ascending' }"
      :empty-text="t('student.empty')"
    >
      <el-table-column prop="name" :label="t('common.name')" sortable />
      <el-table-column
        prop="grade"
        :label="t('common.grade')"
        sortable
        :formatter="(row: any) => gradeLabel(row.grade)"
      />
      <el-table-column prop="contact" :label="t('student.contact')" />
      <el-table-column prop="remark" :label="t('common.notes')" show-overflow-tooltip />
      <el-table-column :label="t('common.actions')" width="180">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="openDialog(row)">{{
            t('common.edit')
          }}</el-button>
          <!-- 删除用描边红：每行一个实心红按钮会把整张表压成红色，与作业列表同口径 -->
          <el-button size="small" type="danger" plain :icon="Delete" @click="remove(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="!error && total > pageSize" class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        background
        @current-change="run"
      />
    </div>
    <div v-else-if="!error && total > 0" class="pager pager--muted">
      {{ totalText }}
    </div>
  </el-card>

  <el-dialog
    v-model="dialogVisible"
    :title="form.id ? t('student.editStudent') : t('student.addStudent')"
    width="480px"
  >
    <el-form :model="form" label-width="80px" @keydown.enter="(e) => submitOnEnter(e, save)">
      <el-form-item :label="t('common.name')" required
        ><el-input v-model="form.name"
      /></el-form-item>
      <el-form-item :label="t('common.grade')">
        <el-select
          v-model="form.grade"
          filterable
          :placeholder="t('student.selectGrade')"
          style="width: 100%"
        >
          <el-option v-for="g in gradeOptions" :key="g" :label="gradeLabel(g)" :value="g" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('student.contact')"><el-input v-model="form.contact" /></el-form-item>
      <el-form-item :label="t('common.notes')"
        ><el-input v-model="form.remark" type="textarea"
      /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search, Plus, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getStudents, createStudent, updateStudent, deleteStudent } from '../../api/student'
import type { Student } from '../../types'
import ListError from '../../components/ListError.vue'
import { useListQuery } from '../../composables/useListQuery'
import { gradeLabel } from '../../utils/i18nLabels'
import { submitOnEnter } from '../../utils/formEnter'
import { queryNumber, queryText, stableQuery } from '../../utils/routeQuery'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 年级预设选项（小学一年级 ~ 高三）
const gradeOptions = [
  '小学一年级',
  '小学二年级',
  '小学三年级',
  '小学四年级',
  '小学五年级',
  '小学六年级',
  '初一',
  '初二',
  '初三',
  '高一',
  '高二',
  '高三'
]

const keyword = ref('')
const grade = ref('')
const dialogVisible = ref(false)
const form = reactive<any>({})
const saving = ref(false)

// 分页
const page = ref(1)
const pageSize = 20

// 筛选与页码写进地址栏：刷新、后退、分享链接都能回到同一视图
let lastSyncedQuery = ''
const readQuery = () => {
  keyword.value = queryText(route.query, 'keyword')
  grade.value = queryText(route.query, 'grade')
  page.value = queryNumber(route.query, 'page', 1)
}
const writeQuery = () => {
  const q: Record<string, string> = {}
  if (keyword.value.trim()) q.keyword = keyword.value.trim()
  if (grade.value) q.grade = grade.value
  if (page.value > 1) q.page = String(page.value)
  lastSyncedQuery = stableQuery(q)
  router.replace({ path: route.path, query: q })
}
// 必须在 useListQuery 的首次取数前恢复，否则首屏会用空筛选拉一次
readQuery()

// 取数骨架：loading / 错误态 / 防竞态 / 末页回退都在这里，页面只管传查询参数
const { list, total, loading, error, run, backoffIfLastPageEmpty } = useListQuery<Student>(
  () =>
    getStudents(
      {
        keyword: keyword.value,
        grade: grade.value,
        page: page.value,
        pageSize
      },
      { silent: true }
    ),
  { onLoaded: () => writeQuery() }
)

// 前进/后退或外部带参跳进来时重新读取；自己写的 replace 直接跳过
watch(
  () => route.query,
  (q) => {
    if (stableQuery(q) === lastSyncedQuery) return
    readQuery()
    run()
  }
)

// 英文下 1 也要用单数：'{n} students' 会显示成 1 students
const totalText = computed(() =>
  total.value === 1 ? t('student.totalOne') : t('student.total', { n: total.value })
)

const search = () => {
  page.value = 1
  run()
}

const openDialog = (row?: any) => {
  Object.keys(form).forEach((k) => delete form[k])
  if (row) Object.assign(form, row)
  dialogVisible.value = true
}

const save = async () => {
  if (saving.value) return
  if (!form.name || !String(form.name).trim()) {
    ElMessage.warning(t('student.nameRequired'))
    return
  }
  saving.value = true
  try {
    if (form.id) await updateStudent(form.id, form)
    else await createStudent(form)
    ElMessage.success(t('common.saveSuccess'))
    dialogVisible.value = false
    run()
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('保存失败', err)
  } finally {
    saving.value = false
  }
}

const remove = async (row: any) => {
  try {
    await ElMessageBox.confirm(t('student.deleteConfirm', { name: row.name }), t('common.tips'), {
      type: 'warning'
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteStudent(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    // 删除末页最后一条时回退页码，避免停留在空白页
    backoffIfLastPageEmpty(page)
    run()
  } catch (err) {
    // 错误提示已由 request.ts 全局弹出
    console.error('删除失败', err)
  }
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.pager--muted {
  color: var(--ink-soft, #667085);
  font-size: var(--text-sm, 13px);
}
</style>
