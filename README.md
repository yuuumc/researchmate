# ResearchMate (研芯通)

> AI mentor for engineering student growth — from course learning to research practice.
> 5-Agent collaboration + Knowledge Graph RAG + Student Cognitive Model + subject decoupling + longitudinal diagnosis comparison.

**Live Demo**: <https://researchmate.vercel.app>

## What's New in v1

- **Student Cognitive Model**: profile upgraded from data storage to ability stars (1-5) + learning style + target direction + exam countdown
- **5th Agent — Research**: bridges undergraduate learning to research path (papers + projects + technical roadmap)
- **Knowledge Graph RAG**: `question → knowledge node → prerequisite chain → answer` (was: `question → text slice → answer`)
- **Dashboard Homepage**: replaces chat-first UI with ability progress, biggest weakness, exam countdown, quick actions
- **Agent Trace Visualization**: real-time timeline of Router → Profile → Agent → Profile Update
- **Brand Repositioning**: from "AI exam prep tool" to "engineering student growth mentor"

## Tech Stack

- **Frontend**: Vue 3 + Vite + Element Plus + Pinia
- **Backend**: Vercel serverless function (DeepSeek API proxy)
- **LLM**: DeepSeek `deepseek-chat` (conversation) + `deepseek-reasoner` (reasoning)
- **Knowledge Base**: JSON slices (textbook + university) + knowledge graph (nodes + prerequisite edges)
- **Storage**: localStorage (student cognitive model + diagnosis history + plan versions)

## Architecture

```
Browser ──► /api/chat ──► Vercel serverless ──► DeepSeek API
   │            (proxy, hides API Key)
   │
   └──► 5 Agents (router orchestrator + Agent Trace timeline)
         ├─ Tutor     (concept Q&A, Socratic method, knowledge graph path)
         ├─ Diagnose  (4-layer root cause analysis)
         ├─ Planner   (4-week study plan with adjustments)
         ├─ Admission (3-tier university recommendation)
         └─ Research  (undergraduate → research roadmap, papers + projects)
```

### Knowledge Graph RAG Pipeline

```
Student question
   ↓
RAG retrieval (Top-5 slices, TF-IDF + substring hybrid)
   ↓
Knowledge node lookup (by slice ID, fallback by keywords)
   ↓
Prerequisite chain (recursive, deduplicated)
   ↓
Mastery annotation (mastered / weak / unknown / learning)
   ↓
Personalized answer + Knowledge Path Card UI
```

Example: "MOSFET threshold voltage derivation" → target node `MOSFET基础` → 11 prerequisite nodes → focus hint "你之前未学「半导体基础」，建议先补这个前置知识。"

## Subject Decoupling

Switch knowledge base via environment variable:

```bash
# Microelectronics (default, with knowledge graph)
VITE_SUBJECT=microelectronics npm run build

# Computer Science
VITE_SUBJECT=cs npm run build
```

Same codebase, same DeepSeek API, different subject. RAG hit@5 = 100% on both.

## Quick Start

```bash
# Install
npm install

# Development
npm run dev

# Production build
npm run build

# Deploy to Vercel
vercel --prod
```

## Testing

```bash
# RAG quality (microelectronics)
node scripts/test-rag-hit5.mjs

# RAG quality (CS, subject decoupling)
node scripts/test-rag-hit5-cs.mjs

# 5-Agent collaboration (6 scenarios)
node scripts/test-agents-collab.mjs

# Longitudinal diagnosis demo (5 rounds + 3 plans)
node scripts/test-history-demo.mjs

# Tutor prompt adherence
node scripts/test-tutor-prompt.mjs

# Agent end-to-end (real API)
node scripts/test-agent-e2e.mjs

# API Key leak self-check (v3.3 risk #11)
node scripts/test-key-leak.mjs

# 11 risk points rehearsal
node scripts/test-rollback-rehearsal.mjs --check

# 38-day plan reorder verification
node scripts/test-plan-reorder.mjs

# Full regression + blind test template
node scripts/test-full-regression.mjs --blind-test
```

## Project Structure

```
├── api/chat.js                  # Vercel serverless (DeepSeek proxy)
├── src/
│   ├── core/
│   │   ├── router.js            # Orchestrator + Agent Trace events
│   │   ├── cascade.js           # Diagnose → Plan cascade
│   │   └── agents/              # 5 Agents (tutor / diagnose / planner / admission / research)
│   ├── prompts/                 # 5 Agent prompts
│   ├── stores/
│   │   ├── profile.js           # Student cognitive model (ability stars + learning style)
│   │   └── trace.js             # Agent Trace timeline store
│   ├── utils/
│   │   ├── rag.js               # TF-IDF + substring hybrid
│   │   ├── tokenize.js          # Intl.Segmenter + professional terms
│   │   └── knowledgeGraph.js    # Graph load + prerequisite chain + mastery annotation
│   └── components/
│       ├── KnowledgePathCard.vue  # Knowledge graph path visualization
│       ├── AgentTrace.vue         # Agent process timeline
│       ├── ResearchCard.vue       # Research roadmap card
│       └── ...                    # Diagnosis / Plan / Admission / Profile cards
├── public/knowledge/
│   ├── textbook/
│   │   ├── 半导体物理.json          # 20 slices
│   │   ├── 半导体物理-图谱.json     # 20 nodes + 21 prerequisite edges
│   │   └── 数据结构.json            # CS subject slices
│   └── university/              # 长三角微电子.json / CS院校.json
├── scripts/                     # Test + demo scripts
├── docs/                        # Demo video script
└── 前端UI设计_v{1,2,3}.md        # Design docs (knowledge graph style)
```

## Safety

- DeepSeek API Key is read from `process.env` in serverless function, never in frontend bundle
- No `VITE_DEEPSEEK_*` prefix in source code (CI grep enforced)
- DevTools Network only shows `/api/chat`, never `api.deepseek.com`

## License

MIT
