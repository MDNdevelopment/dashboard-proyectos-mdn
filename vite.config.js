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
  },
})
