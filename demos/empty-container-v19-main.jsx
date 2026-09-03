import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './empty-container-v19-demo.jsx';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found. Check empty-container-v19-demo.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
