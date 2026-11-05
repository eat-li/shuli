// KaTeX auto-render 子路径缺少类型声明，这里补齐
declare module 'katex/contrib/auto-render' {
  export interface AutoRenderDelimiter {
    left: string
    right: string
    display: boolean
  }

  export interface RenderMathInElementOptions {
    delimiters?: AutoRenderDelimiter[]
    ignoredTags?: string[]
    ignoredClasses?: string[]
    errorCallback?: (msg: string, err: Error) => void
    [key: string]: unknown
  }

  export default function renderMathInElement(
    element: HTMLElement,
    options?: RenderMathInElementOptions
  ): void
}
