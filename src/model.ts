export type VolumeStatus = 'read' | 'bought' | 'transit' | 'missing';
export type CollectionSection = 'In progress' | 'Complete' | 'Read';
export const PUBLISHERS = ['JBC', 'Panini', 'New Pop', 'Darksiders', 'MPEG'] as const;
export type MangaPublisher = typeof PUBLISHERS[number];
export const COLLECTION_SECTIONS: { id: CollectionSection; label: string }[] = [
  { id: 'In progress', label: 'In progress' }, { id: 'Complete', label: 'Complete' }, { id: 'Read', label: 'Read' },
];
export const STATUSES: { id: VolumeStatus; label: string; short: string }[] = [
  { id: 'read', label: 'Read', short: 'âœ“' }, { id: 'bought', label: 'Bought', short: 'â–°' },
  { id: 'transit', label: 'In transit', short: 'â†—' }, { id: 'missing', label: "Don't have", short: 'â—‹' },
];
export interface VolumeEdition { provider: 'google-books' | 'open-library'; providerId: string; title: string; publisher?: string; publishedDate?: string; isbn10?: string; isbn13?: string; infoLink?: string; coverUrl?: string }
export interface Manga { id: string; title: string; coverUrl: string; totalVolumes: number; statuses: VolumeStatus[]; volumeEditions?: (VolumeEdition | null)[]; section: CollectionSection; publisher?: MangaPublisher; provider?: string; providerId?: string; editionNotes?: string; createdAt: string; updatedAt: string }
export interface MangaInput { title: string; coverUrl: string; totalVolumes: number; section?: CollectionSection; publisher?: MangaPublisher; editionNotes?: string; provider?: string; providerId?: string }
export function normalizeMangaRecord(value: unknown, fallbackId?: string): Manga {
  if (!value || typeof value !== 'object') throw new Error('Invalid manga record.');
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : fallbackId;
  const totalVolumes = record.totalVolumes;
  if (!id || typeof record.title !== 'string' || !record.title.trim() || typeof record.coverUrl !== 'string' || !Number.isInteger(totalVolumes) || (totalVolumes as number) < 1 || (totalVolumes as number) > 500 || !Array.isArray(record.statuses) || record.statuses.length !== totalVolumes || !record.statuses.every(validateStatus) || (record.section !== undefined && !validateSection(record.section)) || (record.publisher !== undefined && !validatePublisher(record.publisher))) throw new Error('Invalid manga record.');
  const volumeEditions = Array.isArray(record.volumeEditions) && record.volumeEditions.length === totalVolumes ? record.volumeEditions : Array(totalVolumes).fill(null);
  if (!volumeEditions.every(edition => edition === null || (typeof edition === 'object' && edition !== null && ['open-library', 'google-books'].includes((edition as VolumeEdition).provider) && typeof (edition as VolumeEdition).providerId === 'string' && typeof (edition as VolumeEdition).title === 'string'))) throw new Error('Invalid volume edition record.');
  return { ...record, id, title: record.title, coverUrl: record.coverUrl, totalVolumes: totalVolumes as number, statuses: record.statuses as VolumeStatus[], volumeEditions: volumeEditions as (VolumeEdition | null)[], section: (record.section as CollectionSection | undefined) ?? 'In progress', createdAt: typeof record.createdAt === 'string' ? record.createdAt : '', updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '' } as Manga;
}
export function ownedCount(m: Manga) { return m.statuses.filter(s => s === 'read' || s === 'bought').length; }
export function progressPercent(m: Manga) { return m.totalVolumes ? Math.round(ownedCount(m) / m.totalVolumes * 100) : 0; }
export function createManga(input: MangaInput, id: string = crypto.randomUUID()): Manga {
  const title = input.title.trim(); const count = Number(input.totalVolumes);
  if (!title) throw new Error('Enter a manga title.');
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('Volume count must be a whole number between 1 and 500.');
  if (input.publisher !== undefined && !validatePublisher(input.publisher)) throw new Error('Choose a valid publisher.');
  const now = new Date().toISOString();
  return { id, title, coverUrl: input.coverUrl.trim(), totalVolumes: count, statuses: Array(count).fill('missing'), volumeEditions: Array(count).fill(null), section: input.section ?? 'In progress', ...(input.publisher ? { publisher: input.publisher } : {}), provider: input.provider, providerId: input.providerId, editionNotes: input.editionNotes?.trim(), createdAt: now, updatedAt: now };
}
export function validateStatus(v: unknown): v is VolumeStatus { return STATUSES.some(s => s.id === v); }
export function validateSection(v: unknown): v is CollectionSection { return COLLECTION_SECTIONS.some(section => section.id === v); }
export function validatePublisher(v: unknown): v is MangaPublisher { return PUBLISHERS.some(publisher => publisher === v); }
export function resizeManga(manga: Manga, input: MangaInput, confirmDrop = false): Manga {
  const checked = createManga(input, manga.id);
  if (checked.totalVolumes < manga.totalVolumes && (manga.statuses.slice(checked.totalVolumes).some(s => s !== 'missing') || manga.volumeEditions?.slice(checked.totalVolumes).some(Boolean)) && !confirmDrop) throw new Error('Reducing volumes removes saved statuses or edition details. Confirm this change to continue.');
  return { ...manga, ...checked, section: input.section ?? manga.section, statuses: Array.from({ length: checked.totalVolumes }, (_, i) => manga.statuses[i] ?? 'missing'), volumeEditions: Array.from({ length: checked.totalVolumes }, (_, i) => manga.volumeEditions?.[i] ?? null), createdAt: manga.createdAt, updatedAt: new Date().toISOString() };
}

