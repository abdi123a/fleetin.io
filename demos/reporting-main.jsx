import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './reporting-demo.jsx';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found. Check reporting-demo.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
