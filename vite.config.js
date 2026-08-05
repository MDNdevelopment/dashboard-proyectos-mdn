import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Los worktrees de agentes (.claude/worktrees/*) contienen copias completas
    // del repo; sin este exclude Vitest recogería sus tests duplicados.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [...configDefaults.exclude, '**/.claude/**', 'src/test/**', 'src/main.jsx'],
      // Piso "no bajar nunca": línea base real medida el 2026-08-05 (ver docs/QA_BLINDAJE.md
      // 2.1), con ~1-2pp de margen para no romper el build por fluctuaciones menores entre runs.
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 63,
        lines: 73,
      },
    },
  },
})
