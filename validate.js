const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'questions.js'), 'utf8'), context, { filename: 'questions.js' });
const questions = context.window.QUESTIONS;
assert.ok(Array.isArray(questions), 'questions.js 应提供 window.QUESTIONS 数组');
const expected = Number(process.argv[2] || 110);
assert.equal(questions.length, expected, `题目总数应为 ${expected}`);
for (const [subject, count] of Object.entries({ '组织学': 30, '物理': 49, '测量': 31 })) {
  assert.equal(questions.filter(q => q.subject === subject).length, count, `${subject}题数应为 ${count}`);
}
assert.equal(new Set(questions.map(q => q.id)).size, questions.length, 'ID 必须唯一');
const originals = ['zuzhi.json', 'wuli.json', 'celiang.json'].flatMap(file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')));
assert.equal(questions.length, originals.length, '构建不能丢题');
for (const [index, q] of questions.entries()) {
  const original = originals[index];
  assert.ok(q.id && q.source, '每题应有 id 和 source');
  for (const key of ['subject', 'type', 'question', 'explanation', 'chapter', 'page']) {
    assert.equal(q[key], original[key], `${q.id} 的 ${key} 应保留原文`);
  }
  assert.equal(JSON.stringify(q.options), JSON.stringify(original.options), '选项应保留原文');
  assert.equal(q.originalAnswer, original.answer, '应保留原答案文本');
  assert.equal(q.verified, !/待核实/.test(JSON.stringify(original)), '待核实标记必须正确，包括答案中的标记');
  assert.ok(['choice', 'self'].includes(q.answerMode), '每题应有判题方式');
  if (q.answerMode === 'choice') {
    assert.ok(['单选', '判断'].includes(q.type), '仅单选、判断可以自动判题');
    assert.match(q.answer, /^[A-Z]$/, '客观题答案应规范化为选项字母');
    assert.ok(q.options.length >= 2 && q.answer.charCodeAt(0) - 65 < q.options.length, '答案应对应有效选项');
  } else {
    assert.equal(q.answer, original.answer, '自评题答案应保留原文');
  }
  if (q.type === '填空') assert.equal(q.answerMode, 'self', '填空题应自评');
  if (q.subject === '物理') {
    assert.equal(q.source, '老师指定练习题原题', '物理题来源必须正确');
    assert.ok(['7', '8', '9', '10'].includes(String(q.chapter)), '物理题应包含第7至10章的章节信息');
    assert.ok(String(q.page ?? '').trim(), '物理题应包含页码');
  }
}
console.log(`校验通过：共 ${questions.length} 题（组织学30 + 物理49 + 测量31），ID 唯一，原文、答案、来源、章节页码及核实标记完整。`);
