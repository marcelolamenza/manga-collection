export interface MangaSearchResult { title: string; coverUrl: string; coverUrls?: string[]; totalVolumes: number | null; provider: string; providerId: string }
export interface MangaMetadataProvider { search(query: string, signal?: AbortSignal): Promise<MangaSearchResult[]> }
const abortError = () => Object.assign(new Error('Search cancelled.'), { name: 'AbortError' });
function imageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; }
}
function dedupeResults(results: MangaSearchResult[]): MangaSearchResult[] {
  const seen = new Set<string>();
  return results.filter(item => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || typeof item.provider !== 'string' || !item.provider || typeof item.providerId !== 'string' || !item.providerId) return false;
    const key = `${item.provider}:${item.providerId}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 15);
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, headers?: HeadersInit, externalSignal?: AbortSignal): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const cancel = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetcher(url, { headers, signal: controller.signal });
    if (!response.ok) return { response, payload: undefined as T };
    const payload = await response.json() as T;
    return { response, payload };
  } catch (error) {
    if (externalSignal?.aborted) throw abortError();
    if (controller.signal.aborted) throw new Error('The online catalog took too long to respond. Check your connection and try again.');
    if (error instanceof TypeError) throw new Error('The browser could not connect to the online catalog. Check your internet connection or browser network settings.');
    throw error;
  } finally { clearTimeout(timeout); externalSignal?.removeEventListener('abort', cancel); }
}

export interface VolumeEditionResult { providerId: string; title: string; publisher?: string; publishedDate?: string; isbn10?: string; isbn13?: string; infoLink?: string; coverUrl?: string }
export interface VolumeEditionProvider { search(title: string, volumeNumber: number): Promise<VolumeEditionResult[]> }
interface OpenLibraryWork { key: string; title: string; edition_key?: string[] }
interface OpenLibraryEdition { key: string; title?: string; publishers?: string[]; publish_date?: string; isbn_10?: string[]; isbn_13?: string[]; covers?: number[] }

/** Open Library's public API requires no API key. Each candidate maps to one specific edition record. */
export class OpenLibraryEditionProvider implements VolumeEditionProvider {
  private lastRequestAt = 0;
  private cache = new Map<string, { expiresAt: number; results: VolumeEditionResult[] }>();
  private inFlight = new Map<string, Promise<VolumeEditionResult[]>>();
  constructor(private fetcher: typeof fetch = fetch, private endpoint = 'https://openlibrary.org', private ttlMs = 300_000, private now: () => number = Date.now) {}
  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const wait = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    const { response, payload } = await fetchJson<T>(this.fetcher, `${this.endpoint}${path}`, { Accept: 'application/json' }, signal);
    if (!response.ok) throw new Error(response.status === 429 ? 'Open Library is receiving too many requests. Wait a moment and try again.' : `Open Library could not be reached (HTTP ${response.status}).`);
    return payload;
  }
  async search(title: string, volumeNumber: number, signal?: AbortSignal): Promise<VolumeEditionResult[]> {
    const normalized = title.trim().replace(/\s+/g, ' ');
    if (!normalized || !Number.isInteger(volumeNumber) || volumeNumber < 1) return [];
    const key = `open-library-edition-v1:${normalized.toLocaleLowerCase()}:${volumeNumber}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return [...cached.results];
    if (cached) this.cache.delete(key);
    const pending = this.inFlight.get(key);
    if (pending) return pending.then(results => [...results]);
    const request = this.searchFresh(normalized, volumeNumber, signal).then(results => {
      if (signal?.aborted) throw abortError();
      this.cache.set(key, { expiresAt: this.now() + this.ttlMs, results });
      return results;
    });
    this.inFlight.set(key, request);
    const clear = () => { if (this.inFlight.get(key) === request) this.inFlight.delete(key); };
    void request.then(clear, clear);
    return request.then(results => [...results]);
  }
  private async searchFresh(title: string, volumeNumber: number, signal?: AbortSignal): Promise<VolumeEditionResult[]> {
    const query = `${title} volume ${volumeNumber}`;
    const params = new URLSearchParams({ q: query, limit: '1', fields: 'key,title,edition_key' });
    const payload = await this.get<{ docs?: OpenLibraryWork[] }>(`/search.json?${params}`, signal);
    if (!Array.isArray(payload.docs)) throw new Error('Open Library returned an unexpected search response.');
    const works = payload.docs.filter(work => /^\/works\/OL\w+W$/.test(work.key) && work.title).slice(0, 1);
    const editions: VolumeEditionResult[] = [];
    for (const work of works) {
      const detail = await this.get<{ entries?: OpenLibraryEdition[] }>(`${work.key}/editions.json?limit=10`, signal);
      if (!Array.isArray(detail.entries)) continue;
      editions.push(...detail.entries.filter(edition => edition.key && edition.title).map(edition => ({
        providerId: edition.key, title: edition.title || work.title, publisher: edition.publishers?.[0], publishedDate: edition.publish_date,
        isbn10: edition.isbn_10?.[0], isbn13: edition.isbn_13?.[0], infoLink: `${this.endpoint}${edition.key}`,
        coverUrl: Number.isInteger(edition.covers?.[0]) && edition.covers![0] > 0 ? `https://covers.openlibrary.org/b/id/${edition.covers![0]}-M.jpg?default=false` : undefined,
      })));
    }
    return editions.slice(0, 20);
  }
}

const COVERS = { yotsuba: 'https://covers.openlibrary.org/b/id/10521233-L.jpg', frieren: 'https://covers.openlibrary.org/b/id/12831079-L.jpg', blue: 'https://covers.openlibrary.org/b/id/10721815-L.jpg' };
const MOCK: MangaSearchResult[] = [
  { title: 'Yotsuba&!', coverUrl: COVERS.yotsuba, totalVolumes: 15, provider: 'mock', providerId: 'yotsuba' },
  { title: 'Frieren: Beyond Journey’s End', coverUrl: COVERS.frieren, totalVolumes: 13, provider: 'mock', providerId: 'frieren' },
  { title: 'Blue Period', coverUrl: COVERS.blue, totalVolumes: 16, provider: 'mock', providerId: 'blue-period' },
];
export class MockMangaProvider implements MangaMetadataProvider {
  async search(query: string) { const q = query.trim().toLocaleLowerCase(); return q ? MOCK.filter(m => m.title.toLocaleLowerCase().includes(q)) : MOCK; }
}

interface OpenLibraryMangaDoc { key: string; title: string; cover_i?: number; cover_edition_key?: string; first_publish_year?: number }
/** Broad public catalog fallback; results remain attributed as Open Library records. */
export class OpenLibraryMangaProvider implements MangaMetadataProvider {
  constructor(private fetcher: typeof fetch = fetch, private endpoint = 'https://openlibrary.org/search.json') {}
  async search(query: string, signal?: AbortSignal): Promise<MangaSearchResult[]> {
    const normalized = query.trim(); if (normalized.length < 2) return [];
    const params = new URLSearchParams({ title: normalized, limit: '12', fields: 'key,title,cover_i,cover_edition_key,first_publish_year' });
    const { response, payload } = await fetchJson<{ docs?: OpenLibraryMangaDoc[] }>(this.fetcher, `${this.endpoint}?${params}`, { Accept: 'application/json' }, signal);
    if (!response.ok) throw new Error(response.status === 429 ? 'Open Library is busy. Wait a moment and try again.' : `Open Library search failed (HTTP ${response.status}).`);
    if (!Array.isArray(payload.docs)) throw new Error('Open Library returned an unexpected search response.');
    return dedupeResults(payload.docs.flatMap(doc => {
      if (!doc.key || !doc.title) return [];
      const editionCover = typeof doc.cover_edition_key === 'string' && /^OL\d+M$/.test(doc.cover_edition_key) ? `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-S.jpg?default=false` : undefined;
      const workCover = Number.isInteger(doc.cover_i) && doc.cover_i! > 0 ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg?default=false` : undefined;
      return [{ title: doc.title, coverUrl: editionCover || workCover || '', totalVolumes: null, provider: 'open-library', providerId: doc.key }];
    }));
  }
}

/** Preserve the manga-specific source when it returns matches; otherwise use a no-key public catalog. */
export class FallbackMangaProvider implements MangaMetadataProvider {
  constructor(private primary: MangaMetadataProvider, private fallback: MangaMetadataProvider) {}
  async search(query: string, signal?: AbortSignal): Promise<MangaSearchResult[]> {
    if (signal?.aborted) throw abortError();
    const primaryController = new AbortController(); const fallbackController = new AbortController();
    const cancel = () => { primaryController.abort(); fallbackController.abort(); };
    signal?.addEventListener('abort', cancel, { once: true });
    type Outcome = { source: 'primary' | 'fallback'; results: MangaSearchResult[]; error?: Error };
    const primaryPromise: Promise<Outcome> = this.primary.search(query, primaryController.signal)
      .then(results => ({ source: 'primary' as const, results: dedupeResults(results) }))
      .catch(error => ({ source: 'primary' as const, results: [], error: error as Error }));
    let fallbackPromise: Promise<Outcome> | undefined;
    const startFallback = (): Promise<Outcome> => fallbackPromise ??= this.fallback.search(query, fallbackController.signal)
      .then(results => ({ source: 'fallback' as const, results: dedupeResults(results) }))
      .catch(error => ({ source: 'fallback' as const, results: [], error: error as Error }));
    const decisionAfterPrimary = primaryPromise.then(async primary => {
      if (signal?.aborted) throw abortError();
      if (!primary.error && primary.results.length) return primary;
      const fallback = await startFallback();
      if (signal?.aborted) throw abortError();
      if (!fallback.error && fallback.results.length) return fallback;
      if (primary.error && fallback.error) throw new Error(`Kitsu failed: ${primary.error.message} Open Library failed: ${fallback.error.message}`);
      if (primary.error) throw primary.error;
      if (fallback.error) throw fallback.error;
      return fallback;
    });
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const hedgedFallback = new Promise<Outcome>((resolve, reject) => {
      hedgeTimer = setTimeout(() => {
        startFallback().then(outcome => {
          if (!outcome.error && outcome.results.length) resolve(outcome);
          else decisionAfterPrimary.then(resolve, reject);
        });
      }, 300);
    });
    try {
      let winner = await Promise.race([decisionAfterPrimary, hedgedFallback]);
      if (winner.source === 'fallback' && winner.results.length && !signal?.aborted) {
        let graceTimer: ReturnType<typeof setTimeout> | undefined;
        const preferred = await Promise.race([primaryPromise, new Promise<null>(resolve => { graceTimer = setTimeout(() => resolve(null), 150); })]);
        if (graceTimer) clearTimeout(graceTimer);
        if (preferred && !preferred.error && preferred.results.length) winner = preferred;
      }
      if (signal?.aborted) throw abortError();
      if (winner.source === 'primary') fallbackController.abort(); else primaryController.abort();
      return winner.results;
    } finally {
      if (hedgeTimer) clearTimeout(hedgeTimer);
      signal?.removeEventListener('abort', cancel);
    }
  }
}

/** Five-minute in-memory metadata cache with in-flight deduplication. Errors and cancellations are never cached. */
export class CachedMangaProvider implements MangaMetadataProvider {
  private cache = new Map<string, { expiresAt: number; results: MangaSearchResult[] }>();
  private inFlight = new Map<string, Promise<MangaSearchResult[]>>();
  constructor(private provider: MangaMetadataProvider, private ttlMs = 300_000, private now: () => number = Date.now, private namespace = 'kitsu-open-library-v1') {}
  search(query: string, signal?: AbortSignal): Promise<MangaSearchResult[]> {
    const normalized = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (normalized.length < 2) return Promise.resolve([]);
    const key = `${this.namespace}:${normalized}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return Promise.resolve([...hit.results]);
    if (hit) this.cache.delete(key);
    const pending = this.inFlight.get(key);
    if (pending) return pending.then(results => [...results]);
    const request = this.provider.search(normalized, signal).then(results => {
      if (!Array.isArray(results)) throw new Error('The manga catalog returned an unexpected result list.');
      const valid = dedupeResults(results);
      this.cache.set(key, { expiresAt: this.now() + this.ttlMs, results: valid });
      return valid;
    });
    this.inFlight.set(key, request);
    const clear = () => { if (this.inFlight.get(key) === request) this.inFlight.delete(key); };
    void request.then(clear, clear);
    return request.then(results => [...results]);
  }
}

interface KitsuManga { id: string; attributes?: { canonicalTitle?: string; titles?: Record<string, string>; volumeCount?: number | null; posterImage?: { tiny?: string; small?: string; medium?: string; large?: string; original?: string } | null } }
/** Kitsu's public JSON:API catalog adapter. Metadata remains optional and user-editable. */
export class KitsuMangaProvider implements MangaMetadataProvider {
  constructor(private fetcher: typeof fetch = fetch, private endpoint = 'https://kitsu.io/api/edge/manga') {}
  async search(query: string, signal?: AbortSignal): Promise<MangaSearchResult[]> {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const params = new URLSearchParams({ 'filter[text]': normalized, 'page[limit]': '15', 'fields[manga]': 'canonicalTitle,titles,volumeCount,posterImage' });
    const { response, payload } = await fetchJson<{ data?: KitsuManga[] }>(this.fetcher, `${this.endpoint}?${params.toString()}`, undefined, signal);
    if (!response.ok) throw new Error(response.status === 429 ? 'The manga catalog is busy. Wait a moment and try again.' : `The manga catalog could not be reached (HTTP ${response.status}).`);
    if (!Array.isArray(payload.data)) throw new Error('The manga catalog returned an unexpected response.');
    return dedupeResults(payload.data.map(entry => {
      const attrs = entry.attributes ?? {};
      const title = attrs.canonicalTitle?.trim() || attrs.titles?.en?.trim() || attrs.titles?.en_jp?.trim() || Object.values(attrs.titles ?? {}).find(Boolean) || '';
      const covers = [attrs.posterImage?.small, attrs.posterImage?.medium, attrs.posterImage?.tiny, attrs.posterImage?.large, attrs.posterImage?.original].map(imageUrl).filter((url): url is string => Boolean(url));
      return { title, coverUrl: covers[0] || '', coverUrls: [...new Set(covers)], totalVolumes: Number.isInteger(attrs.volumeCount) && attrs.volumeCount! > 0 ? attrs.volumeCount! : null, provider: 'kitsu', providerId: entry.id };
    }));
  }
}
