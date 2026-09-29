import { useState } from 'react';
import { CheckCircle2, Link2, Loader2, XCircle } from 'lucide-react';
import { api } from '@/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Paste any official link — a company careers page, a job post, or a program page.
export default function AddLinkDialog({ open, onOpenChange, onAdded }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.add(url.trim(), name.trim());
      setResult({ ok: true, text: r.message });
      setUrl('');
      setName('');
      onAdded?.(r);
    } catch (err) {
      setResult({ ok: false, text: err.body?.message || err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setResult(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-lg border bg-muted/50">
            <Link2 className="size-4" />
          </div>
          <DialogTitle>Add from link</DialogTitle>
          <DialogDescription>
            Paste an <span className="text-foreground">official</span> link — a company careers page, a job post, or a program page.
            Companies get all their jobs tracked; program pages get watched for deadlines.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-url">Link</Label>
            <Input id="add-url" type="url" required autoFocus placeholder="https://company.com/careers" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-name">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="add-name" placeholder="We'll read it from the page" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {result && (
            <div className="flex gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
              {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <p className={result.ok ? '' : 'text-muted-foreground'}>{result.text}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">Telegram, WhatsApp, YouTube and job-portal reposts are refused.</p>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {busy ? 'Checking' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
