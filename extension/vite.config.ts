import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { popup: 'popup.html', options: 'options.html', 'service-worker': 'src/background/service-worker.ts', 'linkedin-adapter': 'src/adapters/linkedin.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' }
    }
  }
})
