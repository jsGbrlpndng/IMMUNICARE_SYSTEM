import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        force: true
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path // Ensure path is not mangled
            }
        }
    },
    css: {
        postcss: './postcss.config.cjs',
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.js',
        css: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/test/',
                '**/*.test.{js,jsx}',
                '**/*.spec.{js,jsx}'
            ]
        }
    }
})
