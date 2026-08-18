// ============================================================
// src/utils/svgSpecRenderer.js
// B1：svg-spec JSON → SVG 字符串渲染器（纯函数，无 Vue 依赖）
//
// 四类图件：
//   - circuit   模板白名单制（8 个固定拓扑，params 注入位号值/端口标签）
//   - waveform  数据驱动（points 或 func 参数化，6 种 func）
//   - band      分段线性能带（segments + fermi + labels）
//   - structure 归一化图层（layers 后绘覆盖前 + annotations）
//
// 设计要点：
//   - 纯函数，输入 spec JSON 对象，输出 SVG 字符串；非法 spec 返回 null（调用方兜底原文）
//   - 所有坐标/尺寸均在 SVG 内部归一化，输出固定 viewBox
//   - 文本类用 <text>，线条用 <line>/<path>，区域用 <rect>，曲线用 <polyline>/<path>
//   - 不依赖任何外部库；输出交由 MarkdownRenderer 做 DOMPurify SVG profile sanitize
// ============================================================

const SVG_NS = 'http://www.w3.org/2000/svg'

// ---- 通用工具 ----
function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function num(v, dft) {
  const n = Number(v)
  return Number.isFinite(n) ? n : dft
}
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// 公共外框：标题 + 统一背景/边框
function wrap(title, w, h, inner) {
  const titleSvg = title
    ? `<text x="${w / 2}" y="16" text-anchor="middle" font-size="13" font-family="serif" fill="var(--color-ink-900, #1a202c)">${esc(title)}</text>`
    : ''
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet" style="max-width:100%;height:auto">${titleSvg}${inner}</svg>`
}

// ============================================================
// waveform：数据驱动
// ============================================================
const FUNC_KINDS = new Set(['sine', 'square', 'triangle', 'ramp', 'exp_rise', 'exp_decay'])

function sampleFunc(func, t) {
  const kind = func.kind
  const A = num(func.amplitude, 1)
  const off = num(func.offset, 0)
  const tau = Math.max(1e-6, num(func.tau, 1))
  const period = Math.max(1e-6, num(func.period, 2 * Math.PI))
  const phase = num(func.phase, 0)
  const duty = clamp(num(func.duty, 0.5), 0, 1)
  const ph = ((t / period) + phase) % 1
  switch (kind) {
    case 'sine': return off + A * Math.sin(2 * Math.PI * (t / period + phase))
    case 'square': return off + (ph < duty ? A : -A)
    case 'triangle': {
      const tri = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph
      return off + A * tri
    }
    case 'ramp': return off + A * ph
    case 'exp_rise': return off + A * (1 - Math.exp(-t / tau))
    case 'exp_decay': return off + A * Math.exp(-t / tau)
    default: return off
  }
}

function seriesPoints(series, xMin, xMax, yMin, yMax) {
  const N = 120
  const pts = []
  if (Array.isArray(series.points) && series.points.length > 0) {
    return series.points
  }
  const interp = series.interp || 'linear'
  const f = series.func
  if (!f || !FUNC_KINDS.has(f.kind)) return pts
  for (let i = 0; i <= N; i++) {
    const t = xMin + (xMax - xMin) * (i / N)
    pts.push([t, sampleFunc(f, t)])
  }
  return pts
}

function renderWaveform(spec) {
  const data = spec.data || {}
  const xa = data.x_axis || {}
  const ya = data.y_axis || {}
  const seriesArr = Array.isArray(data.series) ? data.series : []
  const W = 420, H = 230
  const padL = 48, padR = 16, padT = 30, padB = 38
  const plotW = W - padL - padR, plotH = H - padT - padB

  // 计算数据范围
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  const allPts = seriesArr.map(s => {
    const pts = seriesPoints(s, 0, 10, 0, 0) // 先用占位范围采样
    return { s, pts }
  })
  // 重新确定 x 范围
  xMin = 0
  xMax = 10
  for (const { pts } of allPts) {
    for (const [x, y] of pts) {
      if (x < xMin) xMin = x
      if (x > xMax) xMax = x
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
  }
  if (!isFinite(xMin)) { xMin = 0; xMax = 1 }
  if (!isFinite(yMin)) { yMin = -1; yMax = 1 }
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const yPad = (yMax - yMin) * 0.1
  yMin -= yPad; yMax += yPad

  const sx = x => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW
  const sy = y => padT + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH

  let inner = ''
  // 绘图区背景
  inner += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="var(--color-bg-sunken, #f6f8fa)" stroke="var(--color-border-subtle, #e2e8f0)" stroke-width="1"/>`
  // 坐标轴
  inner += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--color-ink-500, #666)" stroke-width="1"/>`
  inner += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--color-ink-500, #666)" stroke-width="1"/>`
  // 0 轴（若在范围内）
  if (yMin < 0 && yMax > 0) {
    const y0 = sy(0)
    inner += `<line x1="${padL}" y1="${y0}" x2="${padL + plotW}" y2="${y0}" stroke="var(--color-border-default, #cbd5e0)" stroke-width="0.8" stroke-dasharray="3 3"/>`
  }
  // 轴标签
  inner += `<text x="${padL + plotW / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--color-ink-700, #4a5568)">${esc(xa.label || 'x')}${xa.unit ? ` (${esc(xa.unit)})` : ''}</text>`
  inner += `<text x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="11" fill="var(--color-ink-700, #4a5568)" transform="rotate(-90 14 ${padT + plotH / 2})">${esc(ya.label || 'y')}${ya.unit ? ` (${esc(ya.unit)})` : ''}</text>`
  // series
  const colors = ['#00b8d4', '#ff6b6b', '#ffd166', '#06d6a0', '#7c3aed']
  const legend = []
  seriesArr.forEach((sObj, i) => {
    const { s, pts } = allPts[i]
    if (!pts.length) return
    const color = colors[i % colors.length]
    const dash = s.style === 'dashed' ? ' stroke-dasharray="5 4"' : ''
    const d = pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(' ')
    inner += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"${dash}/>`
    if (s.name) legend.push({ name: s.name, color, dashed: s.style === 'dashed' })
  })
  // 图例
  let lx = padL + 8
  const ly = padT + 14
  legend.forEach((lg, i) => {
    const lyi = ly + i * 14
    inner += `<line x1="${lx}" y1="${lyi}" x2="${lx + 16}" y2="${lyi}" stroke="${lg.color}" stroke-width="2"${lg.dashed ? ' stroke-dasharray="4 3"' : ''}/>`
    inner += `<text x="${lx + 20}" y="${lyi + 3}" font-size="10" fill="var(--color-ink-700, #4a5568)">${esc(lg.name)}</text>`
  })
  return wrap(spec.title, W, H, inner)
}

// ============================================================
// band：分段线性能带
// ============================================================
function renderBand(spec) {
  const data = spec.data || {}
  const fermi = num(data.fermi, 0)
  const segments = Array.isArray(data.segments) ? data.segments : []
  const labels = Array.isArray(data.labels) ? data.labels : []
  const W = 420, H = 230
  const padL = 40, padR = 16, padT = 30, padB = 30
  const plotW = W - padL - padR, plotH = H - padT - padB

  // 能量范围（基于 segments 的 ec/ev + fermi）
  let eMin = Infinity, eMax = -Infinity
  for (const seg of segments) {
    for (const v of [seg.ec0, seg.ec1, seg.ev0, seg.ev1]) {
      if (v < eMin) eMin = v
      if (v > eMax) eMax = v
    }
  }
  eMin = Math.min(eMin, fermi)
  eMax = Math.max(eMax, fermi)
  if (!isFinite(eMin)) { eMin = -1; eMax = 1 }
  if (eMin === eMax) { eMin -= 1; eMax += 1 }
  const ePad = (eMax - eMin) * 0.1
  eMin -= ePad; eMax += ePad

  const sx = x => padL + clamp(x, 0, 1) * plotW
  const sy = e => padT + plotH - ((e - eMin) / (eMax - eMin || 1)) * plotH

  let inner = ''
  inner += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="var(--color-bg-sunken, #f6f8fa)" stroke="var(--color-border-subtle, #e2e8f0)" stroke-width="1"/>`
  // 费米能级（虚线横贯）
  const yf = sy(fermi)
  inner += `<line x1="${padL}" y1="${yf}" x2="${padL + plotW}" y2="${yf}" stroke="#ff6b6b" stroke-width="1.4" stroke-dasharray="6 4"/>`
  inner += `<text x="${padL + plotW - 4}" y="${yf - 4}" text-anchor="end" font-size="10" fill="#ff6b6b">E_F</text>`
  // Ec / Ev 折线
  const ecPath = [], evPath = []
  for (const seg of segments) {
    const x0 = clamp(num(seg.x0, 0), 0, 1)
    const x1 = clamp(num(seg.x1, 0), 0, 1)
    const ec0 = num(seg.ec0, 0), ec1 = num(seg.ec1, 0)
    const ev0 = num(seg.ev0, 0), ev1 = num(seg.ev1, 0)
    if (!ecPath.length) ecPath.push(`M${sx(x0).toFixed(1)} ${sy(ec0).toFixed(1)}`)
    else ecPath.push(`L${sx(x0).toFixed(1)} ${sy(ec0).toFixed(1)}`)
    ecPath.push(`L${sx(x1).toFixed(1)} ${sy(ec1).toFixed(1)}`)
    if (!evPath.length) evPath.push(`M${sx(x0).toFixed(1)} ${sy(ev0).toFixed(1)}`)
    else evPath.push(`L${sx(x0).toFixed(1)} ${sy(ev0).toFixed(1)}`)
    evPath.push(`L${sx(x1).toFixed(1)} ${sy(ev1).toFixed(1)}`)
  }
  inner += `<path d="${ecPath.join(' ')}" fill="none" stroke="#1a73e8" stroke-width="2"/>`
  inner += `<path d="${evPath.join(' ')}" fill="none" stroke="#1a73e8" stroke-width="2"/>`
  inner += `<text x="${padL + 6}" y="${sy(segments[0] ? segments[0].ec0 : eMax) - 4}" font-size="10" fill="#1a73e8">E_c</text>`
  inner += `<text x="${padL + 6}" y="${sy(segments[0] ? segments[0].ev0 : eMin) + 12}" font-size="10" fill="#1a73e8">E_v</text>`
  // 区域标签
  for (const lb of labels) {
    const lx = sx(clamp(num(lb.x, 0.5), 0, 1))
    const ly = padT + clamp(num(lb.y, 0.1), 0, 1) * plotH
    inner += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" fill="var(--color-ink-700, #4a5568)">${esc(lb.text)}</text>`
  }
  return wrap(spec.title, W, H, inner)
}

// ============================================================
// structure：归一化图层
// ============================================================
const STRUCT_FILLS = {
  metal: '#9ca3af', oxide: '#bfdbfe', poly: '#fbbf24',
  'n-plus': '#60a5fa', 'p-plus': '#f472b6',
  'n-sub': '#3b82f6', 'p-sub': '#f9a8d4',
  contact: '#1f2937', air: 'transparent'
}
function renderStructure(spec) {
  const data = spec.data || {}
  const layers = Array.isArray(data.layers) ? data.layers : []
  const annotations = Array.isArray(data.annotations) ? data.annotations : []
  const W = 420, H = 260
  const padL = 30, padR = 30, padT = 30, padB = 30
  const plotW = W - padL - padR, plotH = H - padT - padB

  const sx = x => padL + clamp(num(x, 0), 0, 1) * plotW
  const sy = y => padT + clamp(num(y, 0), 0, 1) * plotH
  const sw = w => num(w, 0) * plotW
  const sh = h => num(h, 0) * plotH

  let inner = ''
  inner += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="var(--color-bg-sunken, #f6f8fa)" stroke="var(--color-border-subtle, #e2e8f0)" stroke-width="1"/>`
  // 图层：按数组顺序绘制（后者覆盖前者）
  for (const layer of layers) {
    const fill = STRUCT_FILLS[layer.fill] || '#d1d5db'
    const op = fill === 'transparent' ? '' : ` fill-opacity="0.8"`
    inner += `<rect x="${sx(layer.x).toFixed(1)}" y="${sy(layer.y).toFixed(1)}" width="${sw(layer.w).toFixed(1)}" height="${sh(layer.h).toFixed(1)}" fill="${fill}"${op} stroke="var(--color-ink-500, #666)" stroke-width="0.6"/>`
  }
  // 标注
  for (const an of annotations) {
    const ax = sx(num(an.x, 0.5))
    const ay = sy(num(an.y, 0.5))
    if (Array.isArray(an.arrow_to) && an.arrow_to.length >= 2) {
      const tx = sx(clamp(num(an.arrow_to[0], 0.5), 0, 1))
      const ty = sy(clamp(num(an.arrow_to[1], 0.5), 0, 1))
      inner += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--color-ink-700, #4a5568)" stroke-width="1" marker-end="url(#arr)"/>`
    }
    inner += `<text x="${ax.toFixed(1)}" y="${(ay - 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--color-ink-900, #1a202c)">${esc(an.text)}</text>`
  }
  // 箭头 marker
  const defs = `<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="var(--color-ink-700, #4a5568)"/></marker></defs>`
  return wrap(spec.title, W, H, defs + inner)
}

// ============================================================
// circuit：模板白名单制（8 个固定拓扑）
// ============================================================
const CIRCUIT_TEMPLATES = new Set([
  'diode-rectifier', 'bridge-rectifier', 'rc-lowpass', 'voltage-divider',
  'common-source', 'cmos-inverter', 'opamp-inverting', 'opamp-noninverting'
])

// 通用元件绘制（在指定坐标画符号 + 标签）
function compResistor(x, y, label, horizontal = true) {
  // 返回 { body: svg, labelPos }
  if (horizontal) {
    return `<rect x="${x}" y="${y - 6}" width="40" height="12" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
      `<text x="${x + 20}" y="${y - 10}" text-anchor="middle" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
  }
  return `<rect x="${x - 6}" y="${y}" width="12" height="40" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<text x="${x + 14}" y="${y + 24}" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
}
function compCapacitor(x, y, label, horizontal = true) {
  if (horizontal) {
    return `<line x1="${x}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
      `<line x1="${x + 14}" y1="${y - 10}" x2="${x + 14}" y2="${y + 10}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
      `<line x1="${x + 20}" y1="${y - 10}" x2="${x + 20}" y2="${y + 10}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
      `<line x1="${x + 20}" y1="${y}" x2="${x + 34}" y2="${y}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
      `<text x="${x + 17}" y="${y - 14}" text-anchor="middle" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
  }
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 14}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<line x1="${x - 10}" y1="${y + 14}" x2="${x + 10}" y2="${y + 14}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<line x1="${x - 10}" y1="${y + 20}" x2="${x + 10}" y2="${y + 20}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<line x1="${x}" y1="${y + 20}" x2="${x}" y2="${y + 34}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<text x="${x + 14}" y="${y + 19}" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
}
function compDiode(x, y, label, pointRight = true) {
  const tri = pointRight ? `<path d="M${x} ${y - 9} L${x} ${y + 9} L${x + 14} ${y} Z"` : `<path d="M${x + 14} ${y - 9} L${x + 14} ${y + 9} L${x} ${y} Z"`
  const bar = pointRight ? `<line x1="${x + 14}" y1="${y - 9}" x2="${x + 14}" y2="${y + 9}"` : `<line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y + 9}"`
  return `<line x1="${x}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    tri + bar + ` stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<text x="${x + 7}" y="${y - 14}" text-anchor="middle" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
}
function compMosfet(x, y, label, pmos = false) {
  // MOSFET 符号：漏极在上、源极在下、栅极在左
  const chan = pmos ? '#f472b6' : '#60a5fa'
  let s = `<circle cx="${x}" cy="${y}" r="3" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1"/>` // 沟道圆点
  s += `<line x1="${x}" y1="${y - 24}" x2="${x}" y2="${y + 24}" stroke="${chan}" stroke-width="2"/>` // 沟道线
  s += `<line x1="${x - 6}" y1="${y - 18}" x2="${x}" y2="${y - 18}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
  s += `<line x1="${x - 6}" y1="${y}" x2="${x}" y2="${y}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
  s += `<line x1="${x - 6}" y1="${y + 18}" x2="${x}" y2="${y + 18}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
  s += `<line x1="${x}" y1="${y - 24}" x2="${x + 24}" y2="${y - 24}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>` // D 引线
  s += `<line x1="${x}" y1="${y + 24}" x2="${x + 24}" y2="${y + 24}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>` // S 引线
  s += `<line x1="${x - 18}" y1="${y}" x2="${x - 6}" y2="${y}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>` // G 引线
  if (pmos) s += `<circle cx="${x - 10}" cy="${y}" r="3" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1"/>` // PMOS 小圆
  s += `<text x="${x - 24}" y="${y - 26}" text-anchor="end" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
  return s
}
function compOpamp(x, y, label) {
  return `<path d="M${x} ${y - 18} L${x} ${y + 18} L${x + 24} ${y} Z" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<text x="${x + 8}" y="${y + 3}" font-size="9" fill="var(--color-ink-700,#4a5568)">−</text>` +
    `<text x="${x + 8}" y="${y - 7}" font-size="9" fill="var(--color-ink-700,#4a5568)">+</text>` +
    `<text x="${x + 4}" y="${y + 30}" text-anchor="middle" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(label)}</text>`
}
function gnd(x, y) {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 8}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>` +
    `<line x1="${x - 8}" y1="${y + 8}" x2="${x + 8}" y2="${y + 8}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>` +
    `<line x1="${x - 5}" y1="${y + 12}" x2="${x + 5}" y2="${y + 12}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
}
function node(x, y, label) {
  return `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--color-ink-900,#1a202c)"/>` +
    `<text x="${x + 6}" y="${y - 6}" font-size="10" fill="var(--color-ink-900,#1a202c)">${esc(label)}</text>`
}

function renderCircuit(spec) {
  const data = spec.data || {}
  const template = data.template
  if (!CIRCUIT_TEMPLATES.has(template)) return null
  const params = data.params || {}
  const values = params.values || {}
  const labels = params.labels || {}
  const W = 380, H = 240
  const L = v => v || ''
  let inner = ''

  switch (template) {
    case 'common-source': {
      const RD = L(values.RD), RG = L(values.RG)
      const inL = L(labels.in), outL = L(labels.out), mosL = L(labels.mos)
      // VDD 顶部
      inner += `<line x1="60" y1="40" x2="60" y2="70" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<text x="60" y="34" text-anchor="middle" font-size="11" fill="var(--color-ink-900,#1a202c)">V_DD</text>`
      inner += compResistor(40, 80, RD, true) // RD 横置改竖置：用横向 rect 但旋转——简化用竖置
      // RD 竖置
      inner = `<text x="60" y="34" text-anchor="middle" font-size="11" fill="var(--color-ink-900,#1a202c)">V_DD</text>`
      inner += `<line x1="180" y1="40" x2="180" y2="80" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<rect x="174" y="80" width="12" height="40" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>`
      inner += `<text x="192" y="104" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(RD)}</text>`
      inner += `<line x1="180" y1="120" x2="180" y2="150" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      // MOSFET
      inner += compMosfet(180, 175, mosL || 'M1', false)
      // 输出节点
      inner += `<line x1="180" y1="135" x2="270" y2="135" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(270, 135, outL || 'v_out')
      // 栅极输入
      inner += `<line x1="162" y1="175" x2="100" y2="175" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compResistor(60, 175, RG, true)
      inner += `<line x1="40" y1="175" x2="40" y2="135" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(40, 135, inL || 'v_in')
      // 源极接地
      inner += `<line x1="180" y1="199" x2="180" y2="210" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(180, 210)
      break
    }
    case 'rc-lowpass': {
      const R = L(values.R), C = L(values.C)
      const inL = L(labels.in), outL = L(labels.out)
      inner += node(40, 120, inL || 'v_in')
      inner += compResistor(60, 120, R, true)
      inner += node(200, 120, '')
      inner += node(200, 120, outL || 'v_out')
      inner += `<line x1="200" y1="120" x2="280" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      // C 到地
      inner += `<line x1="240" y1="120" x2="240" y2="150" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compCapacitor(240, 150, C, false)
      inner += `<line x1="240" y1="184" x2="240" y2="200" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(240, 200)
      break
    }
    case 'voltage-divider': {
      const R1 = L(values.R1), R2 = L(values.R2)
      const inL = L(labels.in), outL = L(labels.out)
      inner += `<text x="180" y="34" text-anchor="middle" font-size="11" fill="var(--color-ink-900,#1a202c)">V_in</text>`
      inner += `<line x1="180" y1="40" x2="180" y2="70" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<rect x="174" y="70" width="12" height="40" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>`
      inner += `<text x="192" y="94" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(R1)}</text>`
      inner += `<line x1="180" y1="110" x2="180" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      // 输出节点
      inner += `<line x1="180" y1="120" x2="260" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(260, 120, outL || 'v_out')
      inner += `<line x1="180" y1="120" x2="180" y2="140" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<rect x="174" y="140" width="12" height="40" fill="none" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.6"/>`
      inner += `<text x="192" y="164" font-size="10" fill="var(--color-ink-700,#4a5568)">${esc(R2)}</text>`
      inner += `<line x1="180" y1="180" x2="180" y2="200" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(180, 200)
      break
    }
    case 'diode-rectifier': {
      const D = L(values.D), R = L(values.R)
      const inL = L(labels.in), outL = L(labels.out)
      inner += node(40, 120, inL || 'v_in')
      inner += compDiode(70, 120, D || 'D', true)
      inner += `<line x1="98" y1="120" x2="170" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compResistor(170, 120, R, true)
      inner += `<line x1="250" y1="120" x2="290" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(290, 120, outL || 'v_out')
      inner += `<line x1="290" y1="120" x2="290" y2="190" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(290, 190)
      inner += `<line x1="40" y1="120" x2="40" y2="190" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(40, 190)
      break
    }
    case 'bridge-rectifier': {
      const inL = L(labels.in), outL = L(labels.out)
      const dx = 130, dy = 100
      // 4 个二极管菱形
      inner += `<line x1="${dx}" y1="${dy - 30}" x2="${dx - 30}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compDiode(dx - 30, dy - 14, 'D1', false)
      inner += `<line x1="${dx}" y1="${dy - 30}" x2="${dx + 30}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compDiode(dx + 16, dy - 30, 'D2', true)
      inner += `<line x1="${dx - 30}" y1="${dy}" x2="${dx + 30}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<line x1="${dx}" y1="${dy + 30}" x2="${dx - 30}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compDiode(dx - 30, dy + 16, 'D3', false)
      inner += `<line x1="${dx}" y1="${dy + 30}" x2="${dx + 30}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compDiode(dx + 16, dy + 30, 'D4', true)
      // AC 输入（上下）
      inner += node(dx, dy - 30, inL || 'AC')
      inner += `<line x1="${dx}" y1="${dy - 50}" x2="${dx}" y2="${dy - 30}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<line x1="${dx}" y1="${dy + 30}" x2="${dx}" y2="${dy + 50}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(dx, dy + 50)
      // DC 输出（左右）
      inner += `<line x1="${dx - 30}" y1="${dy}" x2="${dx - 60}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(dx - 60, dy, '-')
      inner += `<line x1="${dx + 30}" y1="${dy}" x2="${dx + 60}" y2="${dy}" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(dx + 60, dy, '+' || outL)
      break
    }
    case 'cmos-inverter': {
      const inL = L(labels.in), outL = L(labels.out)
      // VDD
      inner += `<text x="180" y="34" text-anchor="middle" font-size="11" fill="var(--color-ink-900,#1a202c)">V_DD</text>`
      inner += `<line x1="180" y1="40" x2="180" y2="70" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      // PMOS
      inner += compMosfet(180, 95, 'PMOS', true)
      inner += `<line x1="180" y1="119" x2="180" y2="145" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      // NMOS
      inner += compMosfet(180, 170, 'NMOS', false)
      // 输出节点（两管漏极之间）
      inner += `<line x1="180" y1="146" x2="270" y2="146" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(270, 146, outL || 'v_out')
      // 栅极输入（两管栅极相连）
      inner += `<line x1="162" y1="95" x2="120" y2="95" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<line x1="120" y1="95" x2="120" y2="170" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<line x1="120" y1="170" x2="162" y2="170" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<line x1="120" y1="95" x2="80" y2="95" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(80, 95, inL || 'v_in')
      // NMOS 源极接地
      inner += `<line x1="180" y1="194" x2="180" y2="205" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(180, 205)
      break
    }
    case 'opamp-inverting': {
      const Rf = L(values.Rf), Rin = L(values.Rin)
      const inL = L(labels.in), outL = L(labels.out)
      inner += node(40, 130, inL || 'v_in')
      inner += compResistor(60, 130, Rin, true)
      inner += `<line x1="160" y1="130" x2="180" y2="130" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compOpamp(180, 130, '')
      // 反馈电阻 Rf
      inner += `<line x1="170" y1="130" x2="170" y2="80" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compResistor(150, 80, Rf, true)
      inner += `<line x1="210" y1="80" x2="210" y2="130" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      // 同相端接地
      inner += `<line x1="180" y1="142" x2="180" y2="170" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(180, 170)
      // 输出
      inner += `<line x1="204" y1="130" x2="280" y2="130" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(280, 130, outL || 'v_out')
      break
    }
    case 'opamp-noninverting': {
      const Rf = L(values.Rf), Rin = L(values.Rin)
      const inL = L(labels.in), outL = L(labels.out)
      inner += node(40, 110, inL || 'v_in')
      inner += `<line x1="60" y1="110" x2="180" y2="110" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compOpamp(180, 120, '')
      // 同相端（+）接输入
      // 反相端（-）接 Rf/Rin 分压
      inner += `<line x1="170" y1="130" x2="150" y2="130" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compResistor(110, 130, Rin, true)
      inner += `<line x1="110" y1="130" x2="110" y2="180" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += gnd(110, 180)
      // Rf 反馈
      inner += `<line x1="170" y1="130" x2="170" y2="75" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += compResistor(150, 75, Rf, true)
      inner += `<line x1="210" y1="75" x2="210" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += `<line x1="204" y1="120" x2="280" y2="120" stroke="var(--color-ink-900,#1a202c)" stroke-width="1.4"/>`
      inner += node(280, 120, outL || 'v_out')
      break
    }
    default:
      return null
  }
  return wrap(spec.title, W, H, inner)
}

// ============================================================
// 主入口
// ============================================================
/**
 * 渲染 svg-spec JSON 对象为 SVG 字符串。
 * @param {object} spec - {type, title?, data}
 * @returns {string|null} SVG 字符串；非法 spec 返回 null（调用方兜底原文渲染）
 */
export function renderSvgSpec(spec) {
  if (!spec || typeof spec !== 'object' || !spec.type) return null
  try {
    switch (spec.type) {
      case 'waveform': return renderWaveform(spec)
      case 'band': return renderBand(spec)
      case 'structure': return renderStructure(spec)
      case 'circuit': return renderCircuit(spec)
      default: return null
    }
  } catch (e) {
    console.warn('[svgSpecRenderer] render failed:', e?.message || e)
    return null
  }
}

export const CIRCUIT_TEMPLATE_WHITELIST = Array.from(CIRCUIT_TEMPLATES)
export const SVG_SPEC_TYPES = ['circuit', 'waveform', 'band', 'structure']

export default { renderSvgSpec, CIRCUIT_TEMPLATE_WHITELIST, SVG_SPEC_TYPES }
