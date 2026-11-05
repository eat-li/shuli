// AI 排版结果的后处理工具：
// 1) normalizeAiMathHtml —— 修复常见公式问题（Unicode 数学符号 → LaTeX、
//    \(...\)/\[...\] → $...$/$$...$$、$$ 块内多余的 $），不依赖网络，立即生效
// 2) validateAiMath —— 用 KaTeX 逐段校验公式能否渲染，返回失败清单
import katex from 'katex'

// Unicode 数学符号 → LaTeX 命令（AI 输出公式时最常见的错误）
const UNICODE_MATH: Record<string, string> = {
  '²': '^2',
  '³': '^3',
  '⁴': '^4',
  '⁵': '^5',
  '⁶': '^6',
  '⁷': '^7',
  '⁸': '^8',
  '⁹': '^9',
  '⁰': '^0',
  '∑': '\\sum',
  '∏': '\\prod',
  '∞': '\\infty',
  '∫': '\\int',
  '≥': '\\ge',
  '≤': '\\le',
  '≠': '\\ne',
  '≈': '\\approx',
  '±': '\\pm',
  '×': '\\times',
  '÷': '\\div',
  '·': '\\cdot',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊆': '\\subseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∠': '\\angle',
  '⊥': '\\perp',
  '∥': '\\parallel',
  '∴': '\\therefore',
  '∵': '\\because',
  α: '\\alpha',
  β: '\\beta',
  γ: '\\gamma',
  δ: '\\delta',
  ε: '\\varepsilon',
  θ: '\\theta',
  λ: '\\lambda',
  μ: '\\mu',
  π: '\\pi',
  σ: '\\sigma',
  φ: '\\varphi',
  ω: '\\omega',
  Δ: '\\Delta',
  Σ: '\\Sigma',
  Φ: '\\Phi',
  Ω: '\\Omega',
  '→': '\\to',
  '←': '\\leftarrow',
  '⇒': '\\Rightarrow',
  '⇔': '\\Leftrightarrow',
  '½': '\\frac{1}{2}',
  '⅓': '\\frac{1}{3}',
  '⅔': '\\frac{2}{3}',
  '¼': '\\frac{1}{4}',
  '¾': '\\frac{3}{4}'
}

// 修复单个公式块内容
function fixMathContent(content: string): string {
  let c = content
  // 先处理带操作数的根号：√(…) 与 √x
  c = c.replace(/√\(([^()]*)\)/g, '\\sqrt{$1}')
  c = c.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}')
  // 再替换其余 Unicode 数学符号
  for (const [ch, latex] of Object.entries(UNICODE_MATH)) {
    if (c.includes(ch)) c = c.split(ch).join(latex)
  }
  return c
}

export interface AiMathResult {
  html: string
  changed: boolean
}

// 对 AI 排版结果做公式规范化（也可直接用于编辑器内容做「本地公式修复」）
export function normalizeAiMathHtml(html: string): AiMathResult {
  if (!html) return { html, changed: false }
  let out = html

  // 1) \(...\) / \[...\] → $...$ / $$...$$（模型可能不听指令用这种写法）
  //    内层用 [\s\S]*? 而非 [^()]*?：公式里带括号极常见（如 \((x-2)(x+1)=0\)），
  //    排除括号会让这类公式整段匹配不上，原样残留在正文里渲染不出公式。
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner: string) => `$$${inner.trim()}$$`)
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner: string) => `$${inner.trim()}$`)

  // 2) 处理 $$...$$ 块（可跨 <br>）：去多余 $、替换 Unicode、压缩空白
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (raw, inner: string) => {
    const fixed = fixMathContent(inner.replace(/\$/g, '').replace(/\s+/g, ' ')).trim()
    return fixed ? `$$${fixed}$$` : raw
  })

  // 3) 处理行内 $...$：替换 Unicode（不跨标签/换行）
  out = out.replace(/\$([^$\n<]+?)\$/g, (raw, inner: string) => {
    const fixed = fixMathContent(inner).trim()
    return fixed ? `$${fixed}$` : raw
  })

  return { html: out, changed: out !== html }
}

export interface MathValidation {
  total: number
  failed: { content: string; error: string }[]
}

// 用 KaTeX 逐段校验公式：返回渲染失败的公式清单（throwOnError 收集错误）
export function validateAiMath(html: string): MathValidation {
  const failed: MathValidation['failed'] = []
  let total = 0
  html.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n<]+?)\$/g, (raw: string, d?: string, i?: string) => {
    total++
    const content = (d ?? i ?? '').trim()
    if (content) {
      try {
        katex.renderToString(content, {
          displayMode: Boolean(d),
          throwOnError: true,
          strict: false
        })
      } catch (e: any) {
        failed.push({ content, error: e?.message || '渲染失败' })
      }
    }
    return raw
  })
  return { total, failed }
}
