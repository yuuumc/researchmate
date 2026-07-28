import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL, pathToFileURL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// ============================================================
// 开发期 .env 加载（生产环境由 Vercel 注入）
// ============================================================
function loadDevEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, 'utf-8')
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  })
}

loadDevEnv()

const __dirname = dirname(fileURLToPath(import.meta.url))

// ============================================================
// Vite middleware：开发期直接处理 /api/chat
// ============================================================
// 优势：
//   1. 只启动一个进程（vite dev），无需 vercel CLI 或额外 Node 服务
//   2. .env 中的 DEEPSEEK_API_KEY 直接注入 process.env，被 api/chat.js 读取
//   3. 生产环境由 Vercel serverless function 接管，行为一致
//
// v2.0 升级：支持 SSE 流式透传（mockRes.write + flushHeaders）
// ============================================================
function apiChatDevPlugin() {
  return {
    name: 'api-chat-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method_not_allowed' }))
          return
        }

        // 收集 body
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const bodyStr = Buffer.concat(chunks).toString('utf-8')

        try {
          // 动态加载 api/chat.js（确保每次热重载生效）
          // Windows 下 import() 需要 file:// URL
          const chatPath = resolve(__dirname, 'api/chat.js')
          const chatURL = pathToFileURL(chatPath).href
          const handler = (await import(`${chatURL}?t=${Date.now()}`)).default

          // 适配 serverless handler 签名（SSE 透传支持）
          const mockReq = {
            method: 'POST',
            body: JSON.parse(bodyStr || '{}')
          }
          const mockRes = {
            setHeader: (k, v) => res.setHeader(k, v),
            status(code) {
              res.statusCode = code
              return this
            },
            json(data) {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
              }
              res.end(JSON.stringify(data))
            },
            end(data) {
              res.end(data)
            },
            // v2.0 SSE 流式支持
            write(chunk) {
              return res.write(chunk)
            },
            flushHeaders() {
              if (typeof res.flushHeaders === 'function') res.flushHeaders()
            },
            // 可读性属性（handler 可能会读）
            get writableEnded() { return res.writableEnded },
            get destroyed() { return res.destroyed }
          }
          await handler(mockReq, mockRes)
          // 注意：SSE 路径下 handler 内部已 res.end()，这里不需要再 end
        } catch (e) {
          console.error('[vite:api-chat-dev] error:', e)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'middleware_error', message: String(e) }))
          } else {
            // SSE 已开始，尝试发送 error 事件后结束
            try {
              res.write(`event: error\ndata: ${JSON.stringify({ error: 'middleware_error', message: String(e) })}\n\n`)
              res.end()
            } catch (_) { /* noop */ }
          }
        }
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), apiChatDevPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
