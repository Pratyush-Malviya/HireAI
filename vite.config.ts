/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react({ babel: { compact: false } }), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'firebase/app': path.resolve(__dirname, './node_modules/firebase/app/dist/index.cjs.js'),
        'firebase/auth': path.resolve(__dirname, './node_modules/firebase/auth/dist/index.cjs.js'),
        'firebase/firestore': path.resolve(__dirname, './node_modules/firebase/firestore/dist/index.cjs.js')
      },
    },
    build: {
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'firebase';
              if (id.includes('recharts')) return 'recharts';
              if (id.includes('pdfjs-dist')) return 'pdfjs';
              if (id.includes('mammoth')) return 'mammoth';
              if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('micromark') || id.includes('mdast')) return 'markdown';
              if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-utils';
              if (id.includes('lucide-react')) return 'lucide';
              if (id.includes('motion')) return 'motion';
              if (id.includes('openai') || id.includes('@google/genai')) return 'ai-sdk';
              return 'vendor'; // all other node_modules
            }
          }
        }
      }
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
      server: {
        deps: {
          inline: ['firebase']
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: {
        clientPort: 443,
        protocol: 'wss'
      },
    },
  };
});
