/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ── Healthcare Green Design System ──────────────────────────
                // These are the canonical brand tokens for IMMUNICARE.
                // Usage: bg-primary, text-secondary, border-clinical-border, etc.
                primary: {
                    DEFAULT: '#2E7D32',   // Forest Green — primary action color
                    light:   '#43A047',   // Hover states, active tabs
                    dark:    '#1B5E20',   // Deep green — headings, sidebar, banners
                    subtle:  '#E8F5E9',   // Background tints, success zones
                },
                secondary: {
                    DEFAULT: '#1B5E20',   // Dark Forest — sidebar, sticky headers
                    light:   '#2E7D32',   // Elevated secondary surfaces
                },
                clinical: {
                    bg:      '#F4F7F4',   // Clinical page background
                    surface: '#FFFFFF',   // Card / panel background
                    border:  '#E2E8E4',   // Separators, table lines
                    muted:   '#6B7C70',   // Secondary text on clinical surfaces
                    // Risk status tokens
                    overdue:   '#DC2626',
                    due:       '#D97706',
                    upcoming:  '#2563EB',
                    completed: '#16A34A',
                },
                // ── Legacy tokens kept to avoid breaking existing JSX ───────
                'primary-blue': '#0061FF',
                'primary-dark': '#1A202C',
                'secondary-teal': '#00D1C1',
                'neutral-gray': '#4A5568',
                'bg-light': '#F8F9FA',
                medical: {
                    blue: '#1A73E8',
                    light: '#F0F7FF',
                    dark:  '#1557B0',
                },
                navy: {
                    DEFAULT: '#1A2B48',
                    light:   '#2A3B58',
                },
                clinic: {
                    teal: '#2DB2B4',
                    navy: '#1B2945',
                    soft: '#F8FAFB',
                },
            },
            boxShadow: {
                'glass': '0 10px 30px rgba(0,0,0,0.05)',
                'soft': '0 10px 40px -10px rgba(0,0,0,0.08)',
                'medical-glass': '0 20px 40px -15px rgba(0,0,0,0.1)',
                'teal-glow': '0 0 25px rgba(45,178,180,0.3)',
                'nav-glow': '0 0 10px rgba(45,178,180,0.6)',
                'primary-glow': '0 20px 40px -10px rgba(0,97,255,0.3)',
                'card-hover': '0 30px 60px -15px rgba(0,0,0,0.06)',
                'mockup': '0 50px 100px -20px rgba(0,0,0,0.25)',
            },
            borderRadius: {
                'medical': '20px',
            },
            fontFamily: {
                sans: ['"Inter"', 'sans-serif'],
                clinic: ['"Inter"', 'sans-serif'],
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'float-delayed': 'float 6s ease-in-out 3s infinite',
                'pulse-soft': 'pulse-soft 2s transition-all infinite',
                'spin-slow': 'spin 12s linear infinite',
                'fade-in': 'fade-in 0.8s ease-out forwards',
                'slide-up': 'slide-up 0.8s ease-out forwards',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
                'pulse-soft': {
                    '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(27,41,69,0)' },
                    '50%': { transform: 'scale(1.05)', boxShadow: '0 0 20px rgba(27,41,69,0.3)' },
                },
                'fade-in': {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                'slide-up': {
                    from: { transform: 'translateY(30px)', opacity: '0' },
                    to: { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
