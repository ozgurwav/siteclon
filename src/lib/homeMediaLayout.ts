export type HomeProjectSlotId = 'evr' | 'automation' | 'xportfolio';

export type HomeMediaBlock =
  | { id: string; type: 'marquee' }
  | { id: string; type: 'pricing' }
  | { id: string; type: 'carousel' }
  | { id: string; type: 'partner' }
  | { id: string; type: 'salesBanner' }
  | { id: string; type: 'trustedLogos' }
  | { id: string; type: 'faq' }
  | { id: string; type: 'people' }
  | { id: string; type: 'project'; projectId: HomeProjectSlotId };

/** Hero sonrası; eski sırayla uyumlu: marquee → pricing → carousel → üç proje → partner */
export const DEFAULT_HOME_MEDIA_LAYOUT: HomeMediaBlock[] = [
  { id: 'hm-marquee', type: 'marquee' },
  { id: 'hm-pricing', type: 'pricing' },
  { id: 'hm-carousel', type: 'carousel' },
  { id: 'hm-proj-evr', type: 'project', projectId: 'evr' },
  { id: 'hm-proj-automation', type: 'project', projectId: 'automation' },
  { id: 'hm-proj-xportfolio', type: 'project', projectId: 'xportfolio' },
  { id: 'hm-partner', type: 'partner' },
  { id: 'hm-people', type: 'people' },
];

const PROJECT_IDS = new Set<HomeProjectSlotId>(['evr', 'automation', 'xportfolio']);

export function normalizeHomeMediaLayout(raw: unknown): HomeMediaBlock[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HOME_MEDIA_LAYOUT];
  const out: HomeMediaBlock[] = [];
  const seenIds = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as any).id || '').trim();
    const type = String((row as any).type || '').trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    if (
      type === 'marquee' ||
      type === 'pricing' ||
      type === 'carousel' ||
      type === 'partner' ||
      type === 'salesBanner' ||
      type === 'trustedLogos' ||
      type === 'faq' ||
      type === 'people'
    ) {
      out.push({ id, type } as HomeMediaBlock);
      continue;
    }
    if (type === 'project') {
      const projectId = String((row as any).projectId || '').trim();
      if (PROJECT_IDS.has(projectId as HomeProjectSlotId)) {
        out.push({ id, type: 'project', projectId: projectId as HomeProjectSlotId });
      }
    }
  }
  return out.length ? out : [...DEFAULT_HOME_MEDIA_LAYOUT];
}

export function newHomeBlockId(prefix: string) {
  try {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}
