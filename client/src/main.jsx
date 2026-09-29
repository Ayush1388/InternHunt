import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { ThemeProvider } from '@/components/theme';
import { AuthProvider } from '@/components/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
