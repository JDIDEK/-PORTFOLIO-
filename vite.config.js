import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    allowedHosts: ['unissuable-zayn-palmate.ngrok-free.dev']
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        about: 'about.html'
      }
    }
  }
})
