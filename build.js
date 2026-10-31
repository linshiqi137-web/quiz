// 仅构建时需要 Node，网页运行时不需要。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = ['zuzhi.json', 'wuli.json', 'celiang.json'];
const types = ['单选', '判断', '填空', '简答', '计算', '论述'];
// 只从明确的答案位置取字母，避免把长文本里的公式字母误认成选项。
function choiceAnswer(q) {
  if (!['单选', '判断'].includes(q.type) || q.options.length < 2) return null;
  const answer = q.answer.trim();
  const exact = q.options.findIndex(option => option.trim() === answer);
  if (exact >= 0) return String.fromCharCode(65 + exact);
  const match = answer.match(/^[（(【\[]?\s*([A-Z])(?=$|[.．、。:：\s）)】\]（(])/i)
    || answer.match(/(?:答案|选项|应选|故选|选择)\s*(?:应为|应是|是|为)?\s*[:：]?\s*[（(【\[]?\s*([A-Z])(?=$|[^A-Za-z0-9])/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  return letter.charCodeAt(0) - 65 < q.options.length ? letter : null;
}
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
    const answer = choiceAnswer(q);
    // 以题目内容生成稳定 ID，增删或调整顺序不会使其他题目的进度错位。
    const id = q.id || `${file.replace('.json', '')}-${crypto.createHash('sha256').update(JSON.stringify([q.subject, q.type, q.question])).digest('hex').slice(0, 16)}`;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new Error(`${at} ID 无效或重复：${id}`);
    ids.add(id);
    return {
      ...q,
      id,
      answer: answer || q.answer,
      originalAnswer: q.answer,
      answerMode: answer ? 'choice' : 'self',
      source: file === 'wuli.json' ? '老师指定练习题原题' : q.source || '小栞整理',
      verified: !/待核实/.test(JSON.stringify(q))
    };
  });
});
fs.writeFileSync(path.join(__dirname, 'questions.js'), `// 由 node build.js 自动生成，请编辑原始 JSON。\nwindow.QUESTIONS = ${JSON.stringify(questions, null, 2)};\n`);
console.log(`已生成 questions.js：${questions.length} 题，${questions.filter(q => !q.verified).length} 题待核实。`);
