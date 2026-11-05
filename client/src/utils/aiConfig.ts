// AI 配置（API Key / 接口地址 / 模型）的本地读写，供「系统设置」页和编辑器共用
import { getAiConfig } from '../api/ai'

export interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

const KEY = 'ai-config'

// 读取本地缓存的 AI 配置。
// 返回全空对象表示「未配置过」，调用方据此回退到后端 .env；
// 用展开合并默认值，是为了兼容早期版本只存了部分字段的缓存。
export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { apiKey: '', baseUrl: '', model: '', ...JSON.parse(raw) }
  } catch {
    /* 忽略 */
  }
  return { apiKey: '', baseUrl: '', model: '' }
}

// 整体覆盖写入 AI 配置（三项一起存，避免半新半旧的组合）。
export function saveAiConfig(cfg: AiConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

// 清除本地 AI 配置，用于「恢复后端默认凭据」与排查 Key 失效。
export function clearAiConfig() {
  localStorage.removeItem(KEY)
}

/** 一次 AI 请求要带的凭据；apiKey 为空串表示用后端 .env 里配置的 Key */
export interface AiCreds {
  apiKey?: string
  baseUrl?: string
  model?: string
}

/**
 * 解析本次 AI 请求用哪套凭据：优先前端本地配置的 Key，本地没配则回退后端 .env。
 * 两边都没有 Key 时返回 null，由调用方负责引导用户去「系统设置」。
 * （取凭据的逻辑原先在编辑器与课时总结里各写了一份，这里统一收口。）
 */
export async function resolveAiCreds(): Promise<AiCreds | null> {
  const cfg = loadAiConfig()
  if (cfg.apiKey) return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model }
  const backend = await getAiConfig()
  if (!backend.hasBackendKey) return null
  return { apiKey: '', baseUrl: backend.baseUrl, model: backend.model }
}
