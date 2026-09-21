import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // 5273 + strictPort: 5173 is commonly taken by other Vite projects; fail loudly rather than drift to a random port.
  server: { port: 5273, strictPort: true, proxy: { '/api': 'http://localhost:8787' } },
})
