/**
 * 写剪贴板。优先 Clipboard API，它在非安全上下文或未授权时会抛错 ——
 * 本项目常以 http://<内网IP> 形态部署，那不是安全上下文，所以保留 execCommand 兜底。
 */
export const writeClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // 落到下面的兜底路径
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;'
  document.body.appendChild(ta)
  try {
    ta.select()
    if (!document.execCommand('copy')) throw new Error('execCommand("copy") 返回 false')
  } finally {
    ta.remove()
  }
}
