// ============================================================
// 中文分词（v3 §Week 1 P0 任务）
// ============================================================
// 背景：v1 §3.3 简易 RAG 的 extractKeywords 是检索命中率唯一入口
//       中英文混排工科文本（"MOSFET 阈值电压推导"）若用 String.split(/\s+/)
//       命中率≈0
//
// 策略：
//   1. 优先用 Intl.Segmenter（浏览器原生，零依赖）
//   2. 旧版浏览器降级为正则切词（中文单字 + 英文整词）
//   3. 英文/公式/专有名词保留整词（MOSFET / C-V / pn 结）
//   4. 专业术语词典优先匹配（"费米能级"/"泊松方程"/"PN结" 不被切开）
//
// 验证：第 1 周 20 题真实问题验证 hit@5 ≥ 0.8
//      不达标降级为按章节手动挂标签（详见 v1 §3.3 / v3 §Week 1）
// ============================================================

let segmenter = null
try {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  }
} catch (e) {
  console.warn('[tokenize] Intl.Segmenter unavailable, fallback to regex', e)
}

// ============================================================
// 专业术语词典（v3 P0：解决 Intl.Segmenter 切碎复合词问题）
// ============================================================
// 按长度降序排列，优先匹配长术语（"本征载流子浓度" 先于 "载流子"）
const PROFESSIONAL_TERMS = [
  // 长复合术语（4 字以上，优先匹配）
  '本征载流子浓度', '费米-狄拉克分布', '漏致势垒降低', '双极型晶体管',
  '异质结双极型', '连续性方程', '爱因斯坦关系', '肖克利方程',
  '太阳能电池', '半导体物理', '半导体制造', '半导体器件',
  '短沟道效应', '亚阈值斜率', '反向饱和电流', '单位面积',
  // 3-4 字术语
  '费米能级', '费米势', '泊松方程', '本征半导体', '杂质半导体',
  '能带理论', '禁带宽度', '带隙', '内建电场', '内建电势',
  '阈值电压', '强反型', '反型层', '表面势', '平带电压',
  '平带电容', '氧化层电容', '耗尽层', '中性区', '积累层',
  '漂移电流', '扩散电流', '电流密度', '浓度梯度', '迁移率',
  '扩散系数', '少子寿命', '非平衡载流子', '产生率', '复合率',
  '载流子浓度', '载流子输运', '有效状态密度', '玻尔兹曼常数',
  '介电常数', '电荷密度', '电场分布', '电势分布',
  '整流特性', '单向导电', '正向偏压', '反向偏压', '动态平衡',
  '多数载流子', '少数载流子', '施主杂质', '受主杂质',
  '光电效应', '光吸收', '光生载流子', '光电导', '吸收系数',
  '光子能量', '本征吸收', '光生伏特',
  '晶体生长', '离子注入', '金属化', '摩尔定律',
  '注入效率', '宽带隙', '高速电路',
  '电流放大系数', '共射极',
  // 2-3 字术语
  'PN结', 'pn结', 'MOSFET', 'MOS结构', 'MOS', 'BJT', 'HBT',
  'CMOS', 'NMOS', 'PMOS', 'DIBL', 'NPN', 'PNP',
  'n型', 'p型', 'N型', 'P型', 'n型半导体', 'p型半导体',
  '半导体', '导体', '绝缘体', '绝缘层', '衬底', '栅极', '源极',
  '漏极', '沟道', '沟道长度', '栅压', '栅源电压',
  '能带', '价带', '导带', '禁带', '势垒',
  '电子', '空穴', '载流子', '掺杂', '电离',
  '漂移', '扩散', '复合', '产生',
  '砷化镓', '硅', '磷', '砷', '硼', '铝',
  'C-V特性', 'C-V 特性', 'V_th roll-off', 'V_th',
  '光刻', '刻蚀', '氧化', '扩散',
  '基极', '集电极', '发射极', '发射区',
  '异质结', '同质结', '能带偏移',
  // ============================================================
  // 计算机科学 · 数据结构术语（v3.1 学科解耦）
  // ============================================================
  // 长复合术语（4 字以上，优先匹配）
  '二叉排序树', '平衡二叉树', '满二叉树', '完全二叉树', '二叉树遍历',
  '深度优先搜索', '广度优先搜索', '最小生成树', '单源最短路径',
  '有向无环图', '邻接矩阵', '邻接表', '循环队列', '链队列',
  '哈希冲突', '开放定址法', '链地址法', '装填因子',
  '快速排序', '归并排序', '堆排序', '冒泡排序', '插入排序',
  '选择排序', '希尔排序', '基数排序', '稳定排序', '不稳定排序',
  '外部排序', '多路归并', '三数取中', '尾递归优化',
  '模式匹配', '朴素匹配', 'KMP算法', 'next数组', 'nextval数组',
  '最长公共前后缀', '拓扑排序', '关键路径', '关键活动',
  '带权路径长度', '前缀编码', '数据压缩', '优先队列',
  '顺序存储', '链式存储', '随机访问', '时间复杂度', '空间复杂度',
  '大O表示法', '算法复杂度', '逻辑结构', '物理结构',
  // 3-4 字术语
  '数据结构', '线性表', '顺序表', '链表', '单链表', '双向链表',
  '循环链表', '栈', '队列', '栈顶', '入栈', '出栈',
  '入队', '出队', '后进先出', '先进先出', '假溢出',
  '串', '叶子', '根结点', '结点的度', '树的度',
  '二叉树', '前序', '中序', '后序', '层序',
  'AVL树', '红黑树', 'BST', 'MST', '哈夫曼树', '哈夫曼编码',
  'WPL', '逆序对', '并查集', '稠密图', '稀疏图', '完全图',
  '无向图', '有向图', '顶点', '边', '入度', '出度', '度',
  '查找', '顺序查找', '二分查找', '折半查找', '分块查找', '哈希查找',
  '排序', '基准', '堆', '大顶堆', '小顶堆', '建堆',
  '向下调整', 'Top K', '分治法', 'pivot',
  'DFS', 'BFS', 'DAG', 'AOV网', 'AOE网',
  'Dijkstra算法', 'Floyd算法', 'Prim算法', 'Kruskal算法',
  'Lomuto', 'Hoare', 'Kahn算法', 'Morris遍历', '线索化',
  'NLR', 'LNR', 'LRN', 'front', 'rear', 'data', 'next', 'prior'
].sort((a, b) => b.length - a.length) // 长术语优先

/**
 * 从文本中提取专业术语（整词匹配，避免被 Segmenter 切碎）
 * @param {string} text
 * @returns {string[]} 匹配到的术语数组
 */
function extractProfessionalTerms(text) {
  const found = new Set()
  for (const term of PROFESSIONAL_TERMS) {
    if (text.includes(term)) {
      found.add(term)
    }
  }
  return Array.from(found)
}

/**
 * 分词：把中英文混排文本切成词数组
 * 策略：先提取专业术语（整词），再用 Segmenter 切剩余部分
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return []

  // 1. 先提取专业术语（整词，避免被切碎）
  const terms = extractProfessionalTerms(text)

  // 2. 用 Segmenter/正则切剩余部分
  let baseTokens
  if (segmenter) {
    baseTokens = tokenizeWithSegmenter(text)
  } else {
    baseTokens = tokenizeWithRegex(text)
  }

  // 3. 合并：术语优先，去重
  const termSet = new Set(terms)
  // 过滤掉被术语包含的子 token（避免 "费米"+"能级" 与 "费米能级" 重复）
  const filteredBase = baseTokens.filter((tk) => {
    return !terms.some((term) => term.includes(tk) && term !== tk)
  })

  // 合并并去重（保留出现顺序）
  const result = []
  const seen = new Set()
  for (const tk of [...terms, ...filteredBase]) {
    if (!seen.has(tk)) {
      seen.add(tk)
      result.push(tk)
    }
  }
  return result
}

function tokenizeWithSegmenter(text) {
  const tokens = []
  for (const seg of segmenter.segment(text)) {
    const word = seg.segment.trim()
    if (!word) continue
    // 过滤标点/空白（segmenter 把它们标为非 word）
    if (seg.isWordlike === false && !/[A-Za-z0-9\-]/.test(word)) continue
    tokens.push(word)
  }
  return mergeEnglishTokens(tokens)
}

function tokenizeWithRegex(text) {
  // 中文按字 + 英文/数字/连字符整词
  const matches = text.match(/[\u4e00-\u9fa5]|[A-Za-z0-9][A-Za-z0-9\-]*/g) || []
  return matches
}

/**
 * 合并相邻的英文 token（Intl.Segmenter 可能把 MOSFET 切成 M/O/S/F/E/T）
 */
function mergeEnglishTokens(tokens) {
  const result = []
  let buffer = ''
  for (const tk of tokens) {
    if (/^[A-Za-z0-9\-]+$/.test(tk)) {
      buffer = buffer ? buffer + tk : tk
    } else {
      if (buffer) {
        result.push(buffer)
        buffer = ''
      }
      result.push(tk)
    }
  }
  if (buffer) result.push(buffer)
  return result
}

/**
 * 提取关键词（用于 RAG 索引）
 * 1. 分词
 * 2. 去停用词
 * 3. 去单字（除非是专业术语）
 * @param {string} text
 * @returns {string[]}
 */
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '这', '那', '这个', '那个', '这些', '那些', '什么', '怎么', '为什么', '如何',
  '可以', '能', '会', '要', '需要', '应该', '可能', '也许', '或者', '和', '与', '及',
  '或', '但', '但是', '然而', '所以', '因为', '如果', '虽然', '尽管', '即使',
  '一个', '一些', '一种', '这个', '那个', '上', '下', '中', '里', '外', '前', '后',
  '请', '帮', '帮忙', '告诉', '解释', '一下', '请问', '谢谢'
])

const KEEP_SINGLE_CHARS = new Set([
  // 物理量/单位
  'C', 'V', 'I', 'R', 'L', 'Q', 'E', 'F', 'A', 'T', 'P', 'N',
  // 半导体专有
  'pn', 'PN', 'n', 'p', 'MOS', 'FET'
])

export function extractKeywords(text) {
  const tokens = tokenize(text)
  return tokens.filter((tk) => {
    const len = tk.length
    if (len === 0) return false
    if (STOP_WORDS.has(tk)) return false
    // 单字过滤（除非白名单）
    if (len === 1 && !KEEP_SINGLE_CHARS.has(tk)) return false
    return true
  })
}
