import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

import './styles/tokens.css'
import './styles/reset.css'
import './styles/globals.css'
import './styles/space-settings.css'
import './styles/mobile.css'
import './styles/calls.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
    throw new Error('Root element #root was not found. Check index.html.')
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)