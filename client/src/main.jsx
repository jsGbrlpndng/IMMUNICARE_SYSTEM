import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Self-hosted fonts — eliminates dependency on fonts.googleapis.com CDN.
// @fontsource packages are bundled by Vite into /assets, no external requests.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/outfit/800.css'

import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
