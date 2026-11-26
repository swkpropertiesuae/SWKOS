import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: { '@shared': path.resolve('src/shared'), '@': path.resolve('src/web') }
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (/recharts|d3-|victory/.test(id)) return 'charts'
          if (/motion|framer-motion/.test(id)) return 'motion'
          if (/lucide-react/.test(id)) return 'icons'
          if (/sip\.js/.test(id)) return 'sip'
          if (/leaflet/.test(id)) return 'leaflet'
          if (/pdf-lib|pdfjs-dist|mammoth|docx|read-excel-file|tesseract/.test(id)) return 'doc-engines'
          if (/react-dom|react-router|@tanstack|scheduler|\/react\//.test(id)) return 'vendor'
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 8080}`,
        changeOrigin: false
      }
    }
  }
})
