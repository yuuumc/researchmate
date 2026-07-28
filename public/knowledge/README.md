# 知识库目录

本目录承载研芯通的 RAG 知识库。v1 §3.1 / v3 §v3.1 学科解耦演示均使用本目录。

## 目录结构

```
public/knowledge/
├── textbook/              # 教材切片（JSON）
│   ├── 半导体物理.json    # 微电子专业（已就绪 v3.1）
│   └── 数据结构.json      # CS 专业（v3.1 验证用）
├── university/            # 院校数据（JSON，数字字段唯一来源）
│   ├── 长三角微电子.json
│   ├── 985.json
│   ├── 211.json
│   └── 双非.json
├── questions/             # 真题
│   ├── 2024.json
│   └── 2025.json
└── essays/                # 经验帖（Markdown）
    ├── 考研经验.md
    └── 复试经验.md
```

## 铁律（v1 §6.5 / 规范.txt）

- **数字字段严禁 LLM 生成**，只从 `university/*.json` 渲染
- 切片格式：`{ id, source, page, content, keywords }`
- v1 切片单位：1 页（约 500-800 字）
- v2 升级：5 类文件差异化切片（教材 / 表格 / 真题 / 经验帖 / 政策）

## RAG 验证门槛（规范.txt）

- 20 题 hit@5 ≥ 0.8
- 不达标降级为"按章节手动挂标签"

## 学科解耦（v3 §v3.1）

- 微电子：textbook/半导体物理.json + university/长三角微电子.json + essays/*.md
- CS（v3.1 验证）：textbook/数据结构.json + university/CS.json + essays/CS*.md
- 切换学科 = 切换知识库目录，模型层（DeepSeek API）共用
