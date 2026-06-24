import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
                secure: false
            }
        },
        // Development-only security headers.
        // More permissive than production to allow Vite HMR and React Refresh.
        // Production CSP is enforced by serve-local.cjs when scanning built assets.
        headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Content-Security-Policy': [
                "default-src 'self'",
                // 'unsafe-eval' required by Vite HMR and React Refresh in dev mode
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob: https://server.arcgisonline.com https://*.cartocdn.com",
                // ws:// needed for Vite HMR WebSocket connection
                "connect-src 'self' ws://127.0.0.1:5173",
                "font-src 'self'",
                "worker-src blob:",
                "child-src blob:",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'"
            ].join('; ')
        }
    },
    preview: {
        host: '127.0.0.1',
        port: 4173
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true
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
});
