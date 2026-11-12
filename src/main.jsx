import { createRoot } from 'react-dom/client';
import './styles/console.css';
import App from './app/App.jsx';
import { installLinkInterceptor, redirectLegacyHash } from './app/router.js';

redirectLegacyHash();
installLinkInterceptor();

createRoot(document.getElementById('root')).render(<App />);
