import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/components/theme';

function Toaster(props) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' }}
      {...props}
    />
  );
}

export { Toaster };
