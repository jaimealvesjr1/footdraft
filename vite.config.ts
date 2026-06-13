import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1000, 
    rollupOptions: {
      output: {
        // Usamos uma função para agrupar os pacotes e agradar ao TypeScript
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Se o ficheiro vier da pasta do Firebase, vai para o chunk 'firebase'
            if (id.includes('firebase')) {
              return 'firebase';
            }
            // Todo o restante código externo (React, React Router, etc) vai para o chunk 'vendor'
            return 'vendor';
          }
        }
      }
    }
  }
})
