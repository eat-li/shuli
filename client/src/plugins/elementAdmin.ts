// 管理端专用的 Element Plus 装配。
//
// 为什么不放在 main.ts：只读站与登录页也会走同一个入口，main.ts 里注册 45 个组件
// 会让家长端为一个 el-pagination 下载整包 EP。这里由 MainLayout（懒加载）导入并注册，
// 登录页只本地注册自己的 4 个组件，只读站完全不用 EP。
import type { App } from 'vue'
import {
  ElAlert,
  ElAside,
  ElButton,
  ElButtonGroup,
  ElCard,
  ElCascader,
  ElCheckbox,
  ElCollapse,
  ElCollapseItem,
  ElColorPicker,
  ElContainer,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElMenuItemGroup,
  ElOption,
  ElPagination,
  ElPopover,
  ElProgress,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTabPane,
  ElTabs,
  ElTag,
  ElTooltip,
  ElTree
} from 'element-plus'

// base.css 留在 main.ts（必须在 theme.css 之前）；这里只引组件样式。
// 登录页会再引 button/form/form-item/input/icon/message，Vite 会去重。
import 'element-plus/theme-chalk/el-alert.css'
import 'element-plus/theme-chalk/el-aside.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-button-group.css'
import 'element-plus/theme-chalk/el-card.css'
import 'element-plus/theme-chalk/el-cascader.css'
import 'element-plus/theme-chalk/el-cascader-panel.css'
import 'element-plus/theme-chalk/el-checkbox.css'
import 'element-plus/theme-chalk/el-collapse.css'
import 'element-plus/theme-chalk/el-collapse-item.css'
import 'element-plus/theme-chalk/el-collapse-transition.css'
import 'element-plus/theme-chalk/el-color-picker.css'
import 'element-plus/theme-chalk/el-container.css'
import 'element-plus/theme-chalk/el-date-picker.css'
import 'element-plus/theme-chalk/el-date-picker-panel.css'
import 'element-plus/theme-chalk/el-descriptions.css'
import 'element-plus/theme-chalk/el-descriptions-item.css'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-dropdown.css'
import 'element-plus/theme-chalk/el-dropdown-menu.css'
import 'element-plus/theme-chalk/el-dropdown-item.css'
import 'element-plus/theme-chalk/el-empty.css'
import 'element-plus/theme-chalk/el-form.css'
import 'element-plus/theme-chalk/el-form-item.css'
import 'element-plus/theme-chalk/el-header.css'
import 'element-plus/theme-chalk/el-icon.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-input-number.css'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/el-main.css'
import 'element-plus/theme-chalk/el-menu.css'
import 'element-plus/theme-chalk/el-menu-item.css'
import 'element-plus/theme-chalk/el-menu-item-group.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-pagination.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-popover.css'
import 'element-plus/theme-chalk/el-progress.css'
import 'element-plus/theme-chalk/el-radio.css'
import 'element-plus/theme-chalk/el-radio-button.css'
import 'element-plus/theme-chalk/el-radio-group.css'
import 'element-plus/theme-chalk/el-scrollbar.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-select-dropdown.css'
import 'element-plus/theme-chalk/el-slider.css'
import 'element-plus/theme-chalk/el-switch.css'
import 'element-plus/theme-chalk/el-tab-pane.css'
import 'element-plus/theme-chalk/el-table.css'
import 'element-plus/theme-chalk/el-table-column.css'
import 'element-plus/theme-chalk/el-tabs.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/el-time-picker.css'
import 'element-plus/theme-chalk/el-time-select.css'
import 'element-plus/theme-chalk/el-tooltip.css'
import 'element-plus/theme-chalk/el-tree.css'

const components: Record<string, any> = {
  'el-alert': ElAlert,
  'el-aside': ElAside,
  'el-button': ElButton,
  'el-button-group': ElButtonGroup,
  'el-card': ElCard,
  'el-cascader': ElCascader,
  'el-checkbox': ElCheckbox,
  'el-collapse': ElCollapse,
  'el-collapse-item': ElCollapseItem,
  'el-color-picker': ElColorPicker,
  'el-container': ElContainer,
  'el-date-picker': ElDatePicker,
  'el-descriptions': ElDescriptions,
  'el-descriptions-item': ElDescriptionsItem,
  'el-dialog': ElDialog,
  'el-drawer': ElDrawer,
  'el-dropdown': ElDropdown,
  'el-dropdown-item': ElDropdownItem,
  'el-dropdown-menu': ElDropdownMenu,
  'el-empty': ElEmpty,
  'el-form': ElForm,
  'el-form-item': ElFormItem,
  'el-header': ElHeader,
  'el-icon': ElIcon,
  'el-input': ElInput,
  'el-input-number': ElInputNumber,
  'el-main': ElMain,
  'el-menu': ElMenu,
  'el-menu-item': ElMenuItem,
  'el-menu-item-group': ElMenuItemGroup,
  'el-option': ElOption,
  'el-pagination': ElPagination,
  'el-popover': ElPopover,
  'el-progress': ElProgress,
  'el-radio': ElRadio,
  'el-radio-button': ElRadioButton,
  'el-radio-group': ElRadioGroup,
  'el-select': ElSelect,
  'el-slider': ElSlider,
  'el-switch': ElSwitch,
  'el-table': ElTable,
  'el-table-column': ElTableColumn,
  'el-tab-pane': ElTabPane,
  'el-tabs': ElTabs,
  'el-tag': ElTag,
  'el-tooltip': ElTooltip,
  'el-tree': ElTree
}

// 把管理端用到的 Element Plus 组件一次性全局注册。
// 只读站刻意不引用这个文件，从而做到零 EP 体积。
export function installElementAdmin(app: App) {
  Object.entries(components).forEach(([name, comp]) => app.component(name, comp))
}
