export function maskWebhook(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts[2] ?? '…';
    return `…/webhooks/${id.slice(0, 6)}…/••••••••`;
  } catch {
    return '…/webhooks/••••/••••';
  }
}
