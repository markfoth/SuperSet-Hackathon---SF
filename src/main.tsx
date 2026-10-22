import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// No StrictMode: Leaflet owns its DOM and the double-mount adds nothing here.
createRoot(document.getElementById('root')!).render(<App />);
