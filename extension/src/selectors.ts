export interface SiteConfig {
  id: string;
  label: string;
  hostnames: string[];
  messageSelector: string;
}

export const SITES: readonly SiteConfig[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp Web',
    hostnames: ['web.whatsapp.com'],
    messageSelector: 'div.message-in, div.message-out, [data-testid="msg-container"]',
  },
  {
    id: 'telegram',
    label: 'Telegram Web',
    hostnames: ['web.telegram.org'],
    messageSelector: '.Message, .message, [data-message-id]',
  },
  {
    id: 'messenger',
    label: 'Messenger',
    hostnames: ['www.messenger.com'],
    messageSelector: '[role="main"] [role="row"], div[aria-label*="Message"]',
  },
];

export function matchSite(hostname: string): SiteConfig | null {
  const normalized = hostname.toLowerCase();
  return SITES.find((site) => site.hostnames.includes(normalized)) ?? null;
}
