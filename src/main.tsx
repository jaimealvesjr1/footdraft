import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // Importa o Tailwind que configuramos antes

// Busca a div com id="root" lá no seu index.html
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Não foi possível encontrar a div com id 'root' no index.html");
}

// Injeta o App dentro do HTML
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
