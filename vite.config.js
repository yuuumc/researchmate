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
// Vite middleware：开发期处理所有 /api/* 路由
// ============================================================
// v3.0 升级：从仅 /api/chat 扩展为通用 /api/* 路由
//   - /api/chat       → api/chat.js（SSE 流式 + JSON）
//   - /api/knowledge   → api/knowledge.js
//   - /api/agent       → api/agent.js
//   - /api/profile     → api/profile.js
// 新增 API 文件只需放到 api/ 目录，自动被中间件识别
// ============================================================
function apiDevPlugin() {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (!url.startsWith('/api/')) return next()

        const endpoint = url.split('?')[0].split('/').pop()
        const apiFile = resolve(__dirname, 'api', `${endpoint}.js`)
        if (!existsSync(apiFile)) return next()

        const method = req.method || 'GET'

        const chunks = []
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
          for await (const chunk of req) chunks.push(chunk)
        }
        const bodyStr = Buffer.concat(chunks).toString('utf-8')

        try {
          const apiURL = pathToFileURL(apiFile).href
          const handler = (await import(`${apiURL}?t=${Date.now()}`)).default

          const mockReq = {
            method,
            headers: req.headers || {},
            socket: req.socket,
            body: bodyStr ? JSON.parse(bodyStr) : {},
            query: Object.fromEntries(new URL(url, 'http://localhost').searchParams)
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
            write(chunk) {
              return res.write(chunk)
            },
            flushHeaders() {
              if (typeof res.flushHeaders === 'function') res.flushHeaders()
            },
            get writableEnded() { return res.writableEnded },
            get destroyed() { return res.destroyed }
          }
          await handler(mockReq, mockRes)
        } catch (e) {
          console.error(`[vite:api-dev] /${endpoint} error:`, e)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'middleware_error', message: String(e) }))
          } else {
            try {
              res.write(`data: ${JSON.stringify({ error: 'middleware_error', message: String(e) })}\n\n`)
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
  plugins: [vue(), apiDevPlugin()],
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
