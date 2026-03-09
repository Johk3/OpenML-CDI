import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import './index.css';
import './styles/components.css';
import './styles/forms.css';

// Apply saved theme before first render to avoid flash
const savedTheme = localStorage.getItem('theme');
if (
  savedTheme === 'dark' ||
  (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
) {
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
