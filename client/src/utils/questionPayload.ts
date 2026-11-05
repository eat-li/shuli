// 题目提交前的字段归一。
//
// 背景：题库出过一次线上事故——前端清空二级知识点时传 null，服务端
// String(null) 变成字面量 "null" 落库，知识点左侧栏于是长出一个名叫 null 的
// 二级知识点。服务端已经改了校验，但「空值有多种写法」这件事本身还散落在调用方：
// 空串 / undefined / 富文本编辑器清空后的 <p></p>，语义上都是「没填」，
// 到了库里却会变成 ''、字段缺失（PATCH 时被 JSON 丢掉，等于没清掉）、
// 或一段空 HTML。这里在 API 边界统一成一种表示：null。
//
// 只用于「整表单提交」（新增 / 编辑题目）。局部更新（PATCH 单个字段）不要用它，
// 否则会把没传的字段一起置空。

/** 去掉标签与不可见字符，得到用于判空的纯文本（不用于展示） */
export const richTextPlain = (html?: string | null): string =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&ZeroWidthSpace;|&#8203;|\u200b/gi, '')
    .replace(/\s+/g, ' ')

/** 富文本是否为空（TipTap 空文档是 <p></p>，清空后可能是 <p><br></p>） */
export const isBlankRichText = (html?: string | null): boolean => !richTextPlain(html).trim()

/** 文本字段：空串 / 纯空白 → null */
export const trimOrNull = (v?: string | null): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s || null
}

/**
 * 整表单提交的题目 payload。
 * - 一级知识点为空的，二级一并置 null（二级必须挂在一级之下，否则会留下无归属的二级）
 * - 补充说明 / 答案：只剩空标签的富文本按「没填」处理，不写空壳 HTML
 */
export function normalizeQuestionPayload<T extends Record<string, any>>(form: T): T {
  const knowledgeTag = trimOrNull(form.knowledgeTag)
  return {
    ...form,
    knowledgeTag,
    knowledgeSubTag: knowledgeTag ? trimOrNull(form.knowledgeSubTag) : null,
    body: isBlankRichText(form.body) ? null : form.body,
    answer: isBlankRichText(form.answer) ? null : form.answer
  } as T
}
