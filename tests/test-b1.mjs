// ============================================================
// B1 契约测试：KaTeX 公式渲染 + SVG 提取
// 覆盖渲染组件关键分支：行内公式、块级公式、非法公式回退为原文不崩溃、
// 含 SVG 的题干、代码块保护、纯文本无副作用、混合 markdown+公式
// ============================================================
import {
  ensureKatex,
  renderMathExpression,
  extractMath,
  injectMath,
  extractSvg,
  injectSvg
} from '../src/utils/renderMath.js'

// B1 fix: initialize KaTeX engine before rendering assertions
await ensureKatex()

let pass = 0, fail = 0
function assert (cond, msg) {
  if (cond) { pass++; console.log('  ✅ ' + msg) }
  else { fail++; console.log('  ❌ ' + msg) }
}
function includes (str, sub) { return String(str).indexOf(sub) !== -1 }

// ---- 1. 行内公式 $...$ ----
console.log('\n--- 行内公式 $...$ ---')

const inline = extractMath('已知 $\\mu_n C_{ox} \\frac{W}{L}$ 的值')
assert(inline.tokens.length === 1, '行内公式被提取为 1 个 token')
const inlineHtml = renderMathExpression('\\mu_n C_{ox} \\frac{W}{L}', false)
assert(includes(inlineHtml, 'katex'), '行内公式渲染输出含 katex class')
assert(includes(inlineHtml, 'mathml') || includes(inlineHtml, 'katex-mathml'), '行内公式含 MathML（无障碍）')
assert(!includes(inlineHtml, '$'), '渲染结果不含原始 $ 定界符')
// 回填
const inlineFilled = injectMath('已知 <p>' + inline.tokens[0].placeholder + '</p>', inline.tokens)
assert(includes(inlineFilled, 'katex'), '回填后 HTML 含 katex 渲染结果')
assert(!includes(inlineFilled, '@@KATEX'), '回填后无残留占位符')

// ---- 2. 块级公式 $$...$$ ----
console.log('\n--- 块级公式 $$...$$ ---')

const block = extractMath('推导如下：\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$\n完毕')
assert(block.tokens.length === 1, '块级公式被提取为 1 个 token')
const blockHtml = block.tokens[0].html
assert(includes(blockHtml, 'katex-display'), '块级公式渲染含 katex-display class（displayMode=true）')
assert(includes(blockHtml, 'int'), '块级公式含积分符号渲染')
const blockFilled = injectMath('<p>' + block.tokens[0].placeholder + '</p>', block.tokens)
assert(includes(blockFilled, 'katex-display'), '块级公式回填后含 katex-display')
assert(!includes(blockFilled, '@@KATEX'), '块级公式回填后无残留占位符')

// ---- 3. 非法公式回退为原文不崩溃 ----
console.log('\n--- 非法公式回退 ---')

const invalidExpr = '\\badcommand{undefined}'
const invalidHtml = renderMathExpression(invalidExpr, false)
assert(includes(invalidHtml, '$'), '非法公式回退为原文（含 $ 定界符）')
assert(!includes(invalidHtml, 'katex'), '非法公式不含 katex 渲染结果')
// 在提取流程中也不崩溃
const invalidExtract = extractMath('公式 $\\badcommand{undefined}$ 在此')
assert(invalidExtract.tokens.length === 1, '非法公式仍被提取为 token（不崩溃）')
assert(includes(invalidExtract.tokens[0].html, '$'), '非法公式 token 回退为原文')

// ---- 4. 含 SVG 的题干 ----
console.log('\n--- SVG 提取 ---')

const svgContent = '<svg width="100" height="50"><circle cx="50" cy="25" r="20" fill="blue"/></svg>'
const svgExtracted = extractSvg('电路图如下：' + svgContent + ' 如上所示')
assert(svgExtracted.svgs.length === 1, 'SVG 被提取为 1 个 token')
assert(!includes(svgExtracted.text, '<svg'), '提取后文本不含 <svg')
assert(includes(svgExtracted.text, 'SVGINLINE'), '提取后文本含占位符')
const svgFilled = injectSvg('<p>' + svgExtracted.svgs[0].placeholder + '</p>', svgExtracted.svgs.map(s => ({ placeholder: s.placeholder, sanitized: s.raw })))
assert(includes(svgFilled, '<svg'), 'SVG 回填后含 <svg 标签')
assert(!includes(svgFilled, 'SVGINLINE'), 'SVG 回填后无残留占位符')

// 多个 SVG
const multiSvg = extractSvg(svgContent + ' 文本 ' + svgContent)
assert(multiSvg.svgs.length === 2, '多个 SVG 全部提取（2 个）')

// ---- 5. 代码块/行内代码中的 $ 不被误识别 ----
console.log('\n--- 代码块保护 ---')

const codeProtected = extractMath('运行 `$x=5$` 代码')
assert(codeProtected.tokens.length === 0, '行内代码中的 $x=5$ 不被识别为公式')
const codeBlock = extractMath('```\n$a^2 + b^2$\n```')
assert(codeBlock.tokens.length === 0, '代码块中的 $...$ 不被识别为公式')

// ---- 6. 纯文本无副作用 ----
console.log('\n--- 纯文本无副作用 ---')

const plain = extractMath('这是一段普通文本，没有公式。')
assert(plain.tokens.length === 0, '纯文本无公式 token')
assert(plain.text === '这是一段普通文本，没有公式。', '纯文本原样返回')
const plainExpr = renderMathExpression('', false)
assert(plainExpr === '', '空表达式返回空字符串')

// ---- 7. 混合 markdown + 公式 ----
console.log('\n--- 混合 markdown + 公式 ---')

const mixed = extractMath('## MOSFET I-V 特性\n\n漏电流 $I_D = \\frac{1}{2} \\mu_n C_{ox} \\frac{W}{L} (V_{GS}-V_{TH})^2$。\n\n**注意**：$V_{GS}$ 需大于阈值电压。')
assert(mixed.tokens.length === 2, '混合文本提取 2 个公式')
assert(includes(mixed.tokens[0].html, 'katex'), '第一个公式（I_D）渲染成功')
assert(includes(mixed.tokens[1].html, 'katex'), '第二个公式（V_GS）渲染成功')
// 确保非公式部分保留 markdown 语法
assert(includes(mixed.text, '## MOSFET'), '非公式部分保留 markdown 标题语法')
assert(includes(mixed.text, '**注意**'), '非公式部分保留 markdown 加粗语法')

// ---- 8. 多公式同一段落 ----
console.log('\n--- 多公式同段落 ---')

const multi = extractMath('$a+b=c$ 且 $x+y=z$')
assert(multi.tokens.length === 2, '同段落 2 个行内公式全部提取')
assert(includes(multi.tokens[0].html, 'a') && includes(multi.tokens[1].html, 'x'), '两个公式分别渲染')

// ---- 9. 实际题干场景：μn·Cox·(W/L) ----
console.log('\n--- 实际题干：μn·Cox·(W/L) ---')

const stem = '已知 $\\mu_n C_{ox} \\frac{W}{L}=10$，求跨导 $g_m$'
const stemExtracted = extractMath(stem)
assert(stemExtracted.tokens.length === 2, '题干含 2 个公式（μnCoxW/L 和 gm）')
assert(!includes(stemExtracted.text, '$'), '提取后题干文本不含 $（全部公式已提取）')
const stemFilled = injectMath(stemExtracted.text, stemExtracted.tokens)
assert(!includes(stemFilled, 'μn·Cox'), '回填后无 μn·Cox 源码文本残留')
assert(includes(stemFilled, 'katex'), '回填后含 katex 渲染结果')

console.log('\n========================================')
console.log(`B1 契约测试：${pass} pass / ${fail} fail`)
console.log('========================================')
if (fail > 0) process.exit(1)
