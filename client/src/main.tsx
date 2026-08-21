import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './state/auth';
import { TitleBar } from './components/TitleBar';
import { isElectron } from './lib/config';
import './styles.css';

// A barra propria so existe no desktop; no navegador a moldura e do sistema.
if (isElectron) document.body.classList.add('electron');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {isElectron && <TitleBar />}
      <App />
    </AuthProvider>
  </StrictMode>
);
