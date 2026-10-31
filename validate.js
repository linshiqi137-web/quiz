const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'questions.js'), 'utf8'), context, { filename: 'questions.js' });
const questions = context.window.QUESTIONS;
assert.ok(Array.isArray(questions), 'questions.js 应提供 window.QUESTIONS 数组');
const expected = Number(process.argv[2] || 93);
assert.equal(questions.length, expected, `题目总数应为 ${expected}`);
assert.equal(new Set(questions.map(q => q.id)).size, questions.length, 'ID 必须唯一');
for (const q of questions) {
  assert.ok(q.id && q.source, '每题应有 id 和 source');
  assert.equal(q.verified, !/待核实/.test(q.question + q.explanation), '待核实标记必须正确');
}
console.log(`校验通过：questions.js 可以加载，共 ${questions.length} 题，ID 唯一，来源及核实标记完整。`);
