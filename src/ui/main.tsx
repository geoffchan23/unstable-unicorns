import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { registerServiceWorker } from './pwa/register';

registerServiceWorker(() => window.dispatchEvent(new Event('uu:update')));
createRoot(document.getElementById('root')!).render(<App />);
