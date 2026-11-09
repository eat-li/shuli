// AI 输出处理的纯函数测试：清洗 + 防泄题截断。
//
// 这组用例的价值在「防泄题」——题干会被题库列表、作业预览、PDF 导出直接展示，
// 模型多写一段「答案：5」就等于把答案发给了还没做的学生。
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  plainText,
  cleanAiHtml,
  escapeStrayLt,
  balanceTags,
  stripUnrequestedAnswer
} = require('../src/utils/aiHtml')

test('cleanAiHtml：去代码围栏与文档壳', () => {
  assert.equal(cleanAiHtml('```html\n<p>hi</p>\n```'), '<p>hi</p>')
  assert.equal(cleanAiHtml('<html><head></head><body><p>hi</p></body></html>'), '<p>hi</p>')
})

test('cleanAiHtml：\\(...\\) 与 \\[...\\] 归一为 KaTeX 定界符', () => {
  assert.equal(cleanAiHtml('求 \\(x-2\\) 的值'), '求 $x-2$ 的值')
  assert.equal(cleanAiHtml('\\[a=b\\]'), '$$a=b$$')
  // 公式里含括号是最常见的坑：内层必须能匹配括号
  assert.equal(cleanAiHtml('\\((x-2)(x+1)=0\\)'), '$(x-2)(x+1)=0$')
})

test('plainText：去标签、还原实体、压缩空白', () => {
  assert.equal(plainText('<p>a&nbsp;&amp;&nbsp;b</p>'), 'a & b')
  assert.equal(plainText('<p>  多   空白 </p>'), '多 空白')
})

test('balanceTags：补齐截断留下的未闭合标签', () => {
  assert.equal(balanceTags('<p><strong>题干'), '<p><strong>题干</strong></p>')
  assert.equal(balanceTags('<p>完整</p>'), '<p>完整</p>')
})

test('stripUnrequestedAnswer：field=answer 时原样放行', () => {
  const html = '<p>答案：$x=1$</p>'
  assert.equal(stripUnrequestedAnswer('求 x', html, 'answer'), html)
})

test('stripUnrequestedAnswer：原文本身含「答案」字样时不删', () => {
  const html = '<p>题干</p><p>答案：5</p>'
  assert.equal(stripUnrequestedAnswer('把答案填在横线上', html, 'stem'), html)
})

test('stripUnrequestedAnswer：模型多写的整段答案解析被整段截掉', () => {
  const html = '<p>已知 $f(x)=x^2$，求 $f(2)$。</p><p>答案：4</p><p>解析：代入即可。</p>'
  assert.equal(
    stripUnrequestedAnswer('已知 f(x)=x^2，求 f(2)。', html, 'stem'),
    '<p>已知 $f(x)=x^2$，求 $f(2)$。</p>'
  )
})

test('stripUnrequestedAnswer：同一段里跟在正文后的答案被截断，句号保留', () => {
  const html = '<p>求 $f(2)$ 的值。答案：4</p>'
  assert.equal(stripUnrequestedAnswer('求 f(2) 的值。', html, 'stem'), '<p>求 $f(2)$ 的值。</p>')
})

test('stripUnrequestedAnswer：整份输出都是答案时返回空串（由调用方报错）', () => {
  assert.equal(stripUnrequestedAnswer('求 x', '<p>答案：$x=1$</p>', 'stem'), '')
  assert.equal(stripUnrequestedAnswer('求 x', '答案：$x=1$', 'stem'), '')
})

test('stripUnrequestedAnswer：正常输出原样保留（不误伤）', () => {
  const html = '<p>已知 $a>0$，求 $\\dfrac{1}{a}$ 的最小值。</p>'
  assert.equal(stripUnrequestedAnswer('已知 a>0，求 1/a 的最小值。', html, 'stem'), html)
})

// 数学公式里的小于号是不转义的裸 <。浏览器会把它当成标签开头，
// 一路吞到下一个 >，整句后半段连同上百字一起消失——接口 200、日志无异常，
// 只有肉眼看预览才发现「怎么只剩半句」。
test('cleanAiHtml：公式里未转义的小于号被转义，避免渲染时吞掉后文', () => {
  const html = '<p>圆 $(x-2)^{2}+y^{2}=r^{2}(0<r<3)$，点 $P(-3,4)$，求斜率之积</p>'
  assert.equal(
    cleanAiHtml(html),
    '<p>圆 $(x-2)^{2}+y^{2}=r^{2}(0&lt;r&lt;3)$，点 $P(-3,4)$，求斜率之积</p>'
  )
})

test('cleanAiHtml：正文里的小于号同样转义，真实标签不受影响', () => {
  assert.equal(
    cleanAiHtml('<p>当 0<r<3 时<strong>成立</strong></p>'),
    '<p>当 0&lt;r&lt;3 时<strong>成立</strong></p>'
  )
  // 已经是实体（&lt;）的不重复转义，否则页面上会出现字面的 &amp;lt;
  assert.equal(cleanAiHtml('<p>已知 x &lt; 3 且 y &gt; 1</p>'), '<p>已知 x &lt; 3 且 y &gt; 1</p>')
  // 白名单内的标签结构原样保留
  const tags = '<p><em>a</em><br /><img src="/a.png" /><table><tr><td>1</td></tr></table></p>'
  assert.equal(cleanAiHtml(tags), tags)
})

test('escapeStrayLt：紧跟单个字母的 < 一律按小于号处理', () => {
  // $a<s$ 里的 <s 看着像 <s>（删除线），但后面跟的是 $ 不是空白/斜杠/右尖括号，因此是公式
  assert.equal(escapeStrayLt('$a<s$'), '$a&lt;s$')
  assert.equal(escapeStrayLt('<s>删掉</s>'), '<s>删掉</s>')
})
