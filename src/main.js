import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import router from './router'
import App from './App.vue'
import './styles/main.css'

// 知识库加载（启动时注入到 agent）
import { setKnowledgeBase, setKnowledgeGraph } from './core/agents/tutor'
import { setUniversityData } from './core/agents/admission'

// ============================================================
// 学科解耦（v3.1）：通过 VITE_SUBJECT 切换知识库
// ============================================================
// 支持的取值：
//   - 'microelectronics'（默认）：微电子（半导体物理 + 长三角微电子院校）
//   - 'cs'：计算机（数据结构 + CS 院校）
//
// 切换方式：
//   1. 修改 .env：VITE_SUBJECT=cs
//   2. 命令行：VITE_SUBJECT=cs npm run dev
//   3. URL 查询参数（仅 dev 演示用）：?subject=cs
//
// 评审现场演示话术：
//   "我们改一个环境变量 VITE_SUBJECT=cs，重新 build，
//    同一套代码、同一个 DeepSeek API，就切换到了计算机专业。"
// ============================================================

const SUBJECT = (import.meta.env.VITE_SUBJECT || 'microelectronics').toLowerCase()

const SUBJECT_CONFIG = {
  microelectronics: {
    name: '微电子',
    textbookPath: '/knowledge/textbook/半导体物理.json',
    graphPath: '/knowledge/textbook/半导体物理-图谱.json',
    graphSubject: '半导体物理',
    universityPath: '/knowledge/university/长三角微电子.json'
  },
  cs: {
    name: '计算机',
    textbookPath: '/knowledge/textbook/数据结构.json',
    graphPath: null, // 暂无数据结构图谱，后续可扩展
    graphSubject: '数据结构',
    universityPath: '/knowledge/university/CS院校.json'
  }
}

async function loadKnowledge() {
  const config = SUBJECT_CONFIG[SUBJECT] || SUBJECT_CONFIG.microelectronics
  try {
    const textbookResp = await fetch(config.textbookPath)
    const textbook = textbookResp.ok ? await textbookResp.json() : []

    const univResp = await fetch(config.universityPath)
    const univ = univResp.ok ? await univResp.json() : []

    setKnowledgeBase(textbook)
    setUniversityData(univ)

    // v1 正式版 §四：加载知识图谱（可选，无图谱则降级为纯 RAG）
    let graphNodeCount = 0
    if (config.graphPath) {
      try {
        const graphResp = await fetch(config.graphPath)
        if (graphResp.ok) {
          const graphData = await graphResp.json()
          setKnowledgeGraph(config.graphSubject, graphData)
          graphNodeCount = graphData.nodes?.length || 0
        }
      } catch (ge) {
        console.warn('[main] 知识图谱加载失败，降级为纯 RAG：', ge.message)
      }
    }

    console.info(
      `[main] 学科: ${config.name} (VITE_SUBJECT=${SUBJECT}) · 知识库加载完成：教材 ${textbook.length} 条 / 院校 ${univ.length} 所 / 图谱 ${graphNodeCount} 节点`
    )
  } catch (e) {
    console.error('[main] 知识库加载失败：', e)
  }
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')

// 异步加载知识库（不阻塞首屏）
loadKnowledge()
