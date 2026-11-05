// 知识点脏名护栏的单测（纯函数）
const test = require('node:test')
const assert = require('node:assert/strict')

const { isNullLiteralTag } = require('../src/utils/tagName')

test('字面量 null / undefined / NaN 被识别为脏名', () => {
  // 线上事故的形态：清空二级知识点后库里出现名字就叫 "null" 的标签
  assert.equal(isNullLiteralTag('null'), true)
  assert.equal(isNullLiteralTag('NULL'), true)
  assert.equal(isNullLiteralTag('  null  '), true)
  assert.equal(isNullLiteralTag('undefined'), true)
  assert.equal(isNullLiteralTag('NaN'), true)
})

test('正常名称（包括包含 null 字样的名称）不受影响', () => {
  assert.equal(isNullLiteralTag('导数'), false)
  assert.equal(isNullLiteralTag('null 值判断'), false)
  assert.equal(isNullLiteralTag(''), false)
  assert.equal(isNullLiteralTag(null), false)
  assert.equal(isNullLiteralTag(undefined), false)
  assert.equal(isNullLiteralTag(0), false)
})
