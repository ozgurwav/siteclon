/** WhatsApp `wa.me` linkleri için ortak yardımcılar (BottomNav, Partner CTA vb.). */

export function waMeDigits(raw: string): string {
  return (raw ?? '').replace(/[^\d]/g, '');
}

export function waMeUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message ?? '');
  return `https://wa.me/${phoneDigits}${text ? `?text=${text}` : ''}`;
}
