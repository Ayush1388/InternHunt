import { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { store } from '@/api';

const ThemeContext = createContext({ theme: 'dark', resolved: 'dark', setTheme: () => {} });

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => store.get('ih.theme', 'dark'));
  const [resolved, setResolved] = useState(() => (theme === 'system' ? systemTheme() : theme));

  useEffect(() => {
    const apply = () => {
      const r = theme === 'system' ? systemTheme() : theme;
      setResolved(r);
      document.documentElement.classList.toggle('dark', r === 'dark');
    };
    apply();
    store.set('ih.theme', theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          {resolved === 'dark' ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
