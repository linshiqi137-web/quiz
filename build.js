// 仅构建时需要 Node，网页运行时不需要。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = ['zuzhi.json', 'wuli.json', 'celiang.json'];
const types = ['单选', '判断', '简答', '计算', '论述'];
const ids = new Set();
const questions = files.flatMap(file => {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${file} 顶层必须是数组`);
  return rows.map((q, index) => {
    const at = `${file} 第 ${index + 1} 题`;
    for (const key of ['subject', 'type', 'question', 'answer', 'explanation']) {
      if (typeof q[key] !== 'string' || !q[key].trim()) throw new Error(`${at} 缺少有效的 ${key}`);
    }
    if (!types.includes(q.type) || !Array.isArray(q.options) || q.options.some(o => typeof o !== 'string')) {
      throw new Error(`${at} 题型或选项无效`);
    }
    if (['单选', '判断'].includes(q.type) && (q.options.length < 2 || !q.options.some((o, i) => q.answer.trim() === String.fromCharCode(65 + i) || q.answer.trim() === o))) {
      throw new Error(`${at} 客观题答案必须是选项字母或完整选项`);
    }
    // 以题目内容生成稳定 ID，增删或调整顺序不会使其他题目的进度错位。
    const id = q.id || `${file.replace('.json', '')}-${crypto.createHash('sha256').update(JSON.stringify([q.subject, q.type, q.question])).digest('hex').slice(0, 16)}`;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new Error(`${at} ID 无效或重复：${id}`);
    ids.add(id);
    return { ...q, id, source: q.source || '小栞整理', verified: !/待核实/.test(q.question + q.explanation) };
  });
});
fs.writeFileSync(path.join(__dirname, 'questions.js'), `// 由 node build.js 自动生成，请编辑原始 JSON。\nwindow.QUESTIONS = ${JSON.stringify(questions, null, 2)};\n`);
console.log(`已生成 questions.js：${questions.length} 题，${questions.filter(q => !q.verified).length} 题待核实。`);
