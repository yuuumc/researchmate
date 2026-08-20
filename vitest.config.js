import { defineConfig } from 'vitest/config'

// 最小可用 vitest 配置
// test:unit 通过 tests/_runner.test.mjs 编排运行 tests/test-*.mjs（自定义 assert 脚本）
export default defineConfig({
  test: {
    include: ['tests/_runner.test.mjs'],
    environment: 'node',
  },
})
