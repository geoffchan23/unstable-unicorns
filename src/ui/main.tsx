import { createRoot } from 'react-dom/client';
import './styles.css';
import './table.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { registerServiceWorker } from './pwa/register';
import { applyTheme, storedTheme } from './theme';

applyTheme(storedTheme());

registerServiceWorker(() => window.dispatchEvent(new Event('uu:update')));
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
