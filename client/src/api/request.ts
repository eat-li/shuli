import axios from 'axios'
import { ElMessage } from 'element-plus'
import { i18n } from '../i18n'

// 拦截器里的翻译快捷方式。这里必须用 i18n.global 而不是 useI18n：
// 拦截器在组件外执行，拿不到组件上下文，用 useI18n 会直接报错。
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params)

// 页面自己渲染 ListError 时置 silent: true，避免同一次失败再弹一遍 toast
declare module 'axios' {
  export interface AxiosRequestConfig {
    silent?: boolean
  }
}

const request = axios.create({ baseURL: '/api', timeout: 10000 })

// 标记为“已经由全局拦截器提示过”的 API 错误，避免页面 catch 中重复弹提示
export interface ApiError extends Error {
  isApiError?: boolean
}

// 给错误打上 isApiError 标记（已由全局拦截器提示过），页面 catch 时据此不再重复弹 toast。
const createApiError = (message: string): ApiError =>
  Object.assign(new Error(message), { isApiError: true })

// 统一解包 { code, message, data }，并对失败请求做统一提示。
//
// 本版本是**单用户无鉴权**模式：请求不带令牌，也没有登录页可跳。
// 所以 401 不再触发跳转，只按普通错误提示——服务端理论上不会返回 401，
// 真出现了说明前面有反向代理或网关在拦，提示用户去查代理配置即可。
request.interceptors.response.use(
  (res) => {
    const data = res.data
    if (data.code !== 0) {
      const message = data.message || t('api.requestFailed')
      if (!res.config?.silent) ElMessage.error(message)
      return Promise.reject(createApiError(message))
    }
    return data.data
  },
  (err) => {
    let message = t('api.requestFailedRetry')
    if (!err.response) {
      // 网络断开 / 超时 / 代理未启动
      message = err.code === 'ECONNABORTED' ? t('api.timeout') : t('api.network')
    } else if (err.response.status === 401) {
      message = t('api.unauthorized')
    } else if (err.response.status === 403) {
      message = t('api.forbidden')
    } else if (err.response.status >= 500) {
      message = t('api.serverError')
    } else {
      message =
        err.response.data?.message || t('api.requestFailedStatus', { status: err.response.status })
    }
    if (!err.config?.silent) ElMessage.error(message)
    return Promise.reject(createApiError(message))
  }
)

// 文件下载专用实例：不做 JSON 解包（下载接口返回的是文件流）
const downloadRequest = axios.create({ baseURL: '/api', timeout: 60000 })

// 文件下载：接口返回文件流，不能走上面的统一解包。
// 仍用 axios 而不是 <a href> 直链，是因为直链拿不到响应头里的 Content-Disposition，
// 也就取不到后端给的中文文件名。
export async function downloadFile(
  url: string,
  fallbackName = 'download',
  opts: { timeout?: number; onProgress?: (loaded: number, total: number) => void } = {}
): Promise<void> {
  let res
  try {
    res = await downloadRequest.get<Blob>(url, {
      responseType: 'blob',
      timeout: opts.timeout,
      // 流式响应没有 Content-Length，total 常为 0，调用方按预估总量换算百分比
      onDownloadProgress: (e) => opts.onProgress?.(e.loaded, e.total || 0)
    })
  } catch (err: any) {
    // 下载失败单独提示：调用方通常没有自己的错误界面
    ElMessage.error(t('api.downloadFailed'))
    throw err
  }
  const disposition = res.headers['content-disposition'] || ''
  // filename* 是 RFC 5987 的 UTF-8 写法（中文文件名走这个），优先于普通 filename=
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  let filename = fallbackName
  const pick = encoded || plain
  if (pick) {
    try {
      filename = decodeURIComponent(pick)
    } catch {
      // 文件名含非法的 % 编码时保持原样
      filename = plain || fallbackName
    }
  }
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}

export default request
