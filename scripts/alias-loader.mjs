// ESM loader: resolve @/ alias to ./src/ for Node-side tests
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve as pathResolve, dirname } from 'node:path'

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '..')

import { existsSync } from 'node:fs'

// 重依赖模块桩（避免拉入 supabase/fetch/import.meta.env）
const STUBS = {
  '@/services/supabase': { supabase: null, isSupabaseConfigured: false },
  '@/api/agent': { callAgent: async () => { throw new Error('stub') } },
  '@/utils/vectorMemory': { addMemory: () => {} },
}

export function resolve(specifier, context, nextResolve) {
  // 桩模块走 data URL
  if (STUBS[specifier]) {
    const code = 'export default ' + JSON.stringify(STUBS[specifier]) + ';\n' +
      Object.keys(STUBS[specifier]).map(k => `export const ${k} = ${JSON.stringify(STUBS[specifier][k])};`).join('\n')
    return nextResolve('data:text/javascript,' + encodeURIComponent(code), context)
  }
  if (specifier.startsWith('@/')) {
    let p = pathResolve(ROOT, 'src', specifier.slice(2))
    // try exact, then .js, then /index.js
    if (!existsSync(p)) {
      if (existsSync(p + '.js')) p += '.js'
      else if (existsSync(p + '/index.js')) p += '/index.js'
    }
    return nextResolve(pathToFileURL(p).href, context)
  }
  return nextResolve(specifier, context)
}
