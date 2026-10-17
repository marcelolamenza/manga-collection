import { describe, expect, it, vi } from 'vitest';
import { CachedMangaProvider, FallbackMangaProvider, KitsuMangaProvider, OpenLibraryEditionProvider, OpenLibraryMangaProvider, type MangaSearchResult } from './provider';

describe('Kitsu manga metadata provider', () => {
  it('builds a title search and maps cover, volume count, and provider identity', async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => { void args; return ({
      ok: true,
      json: async () => ({ data: [{ id: '42', attributes: { canonicalTitle: 'Example Manga', volumeCount: 8, posterImage: { medium: 'https://img.test/cover.jpg' } } }] }),
    } as Response); });
    const provider = new KitsuMangaProvider(fetcher);
    const results = await provider.search('Example Manga');
    expect(String(fetcher.mock.calls[0][0])).toContain('filter%5Btext%5D=Example+Manga');
    expect(results).toEqual([{ title: 'Example Manga', coverUrl: 'https://img.test/cover.jpg', coverUrls: ['https://img.test/cover.jpg'], totalVolumes: 8, provider: 'kitsu', providerId: '42' }]);
  });

  it('chooses the smallest valid image variant first and ignores malformed image URLs', async () => {
    const provider = new KitsuMangaProvider(vi.fn(async () => ({ ok: true, json: async () => ({ data: [
      { id: 'a', attributes: { canonicalTitle: 'Small first', posterImage: { small: 'https://cdn.test/s.jpg', medium: 'https://cdn.test/m.jpg' } } },
      { id: 'b', attributes: { canonicalTitle: 'Malformed', posterImage: { small: 'javascript:bad', medium: 'not a url' } } },
    ] }) } as Response)));
    const results = await provider.search('cover test');
    expect(results[0].coverUrl).toBe('https://cdn.test/s.jpg');
    expect(results[0].coverUrls).toEqual(['https://cdn.test/s.jpg', 'https://cdn.test/m.jpg']);
    expect(results[1].coverUrl).toBe('');
  });

  it('keeps missing volume counts unknown and rejects short queries without a request', async () => {
    const fetcher = vi.fn(); const provider = new KitsuMangaProvider(fetcher as typeof fetch);
    expect(await provider.search(' A ')).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    const missingCount = new KitsuMangaProvider(vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: '3', attributes: { titles: { en: 'No Count' } } }] }) } as Response)));
    expect((await missingCount.search('No Count'))[0].totalVolumes).toBeNull();
  });

  it('returns understandable provider failures', async () => {
    const provider = new KitsuMangaProvider(vi.fn(async () => ({ ok: false, status: 429 } as Response)));
    await expect(provider.search('Busy catalog')).rejects.toThrow(/busy/i);
  });

  it('times out a stalled request and respects caller cancellation', async () => {
    vi.useFakeTimers();
    try {
      const stalled = new KitsuMangaProvider(vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))));
      const timed = stalled.search('Timeout title');
      const timeoutAssertion = expect(timed).rejects.toThrow(/too long/i);
      await vi.advanceTimersByTimeAsync(8001);
      await timeoutAssertion;
    } finally { vi.useRealTimers(); }

    const controller = new AbortController();
    const stalled = new KitsuMangaProvider(vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))));
    const request = stalled.search('Cancelled title', controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects invalid response shapes instead of treating them as empty results', async () => {
    const provider = new KitsuMangaProvider(vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) } as Response)));
    await expect(provider.search('Malformed')).rejects.toThrow(/unexpected response/i);
  });
});

describe('Open Library edition provider', () => {
  it('searches a numbered volume and maps a specific edition including publisher, ISBN, and source', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ docs: [{ key: '/works/OL1W', title: 'Example Manga 4' }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [{ key: '/books/OL2M', title: 'Example Manga Volume 4', publishers: ['Example Press'], publish_date: '2024', isbn_13: ['9780000000000'], covers: [777] }] }) } as Response);
    const provider = new OpenLibraryEditionProvider(fetcher, 'https://catalog.test');
    const results = await provider.search('Example Manga', 4);
    expect(String(fetcher.mock.calls[0][0])).toContain('q=Example+Manga+volume+4');
    expect(results[0]).toMatchObject({ providerId: '/books/OL2M', title: 'Example Manga Volume 4', publisher: 'Example Press', isbn13: '9780000000000', infoLink: 'https://catalog.test/books/OL2M' });
    expect(results[0].coverUrl).toBe('https://covers.openlibrary.org/b/id/777-M.jpg?default=false');
  });

  it('reports rate-limit failures clearly', async () => {
    const provider = new OpenLibraryEditionProvider(vi.fn(async () => ({ ok: false, status: 429 } as Response)));
    await expect(provider.search('Example', 1)).rejects.toThrow(/too many requests/i);
  });
});

describe('manga search fallback', () => {
  it('uses the fallback catalog when Kitsu returns no matches', async () => {
    const kitsu = { search: vi.fn(async () => []) };
    const library = new OpenLibraryMangaProvider(vi.fn(async () => ({ ok: true, json: async () => ({ docs: [{ key: '/works/OL1W', title: 'Example Manga', cover_i: 123 }] }) } as Response)), 'https://catalog.test/search.json');
    const results = await new FallbackMangaProvider(kitsu, library).search('Example');
    expect(results[0]).toMatchObject({ title: 'Example Manga', provider: 'open-library', providerId: '/works/OL1W', coverUrl: 'https://covers.openlibrary.org/b/id/123-S.jpg?default=false', totalVolumes: null });
  });

  it('uses edition OLID cover IDs and never constructs a URL for invalid identifiers', async () => {
    const provider = new OpenLibraryMangaProvider(vi.fn(async () => ({ ok: true, json: async () => ({ docs: [
      { key: '/works/OL1W', title: 'Edition cover', cover_edition_key: 'OL4M' },
      { key: '/works/OL2W', title: 'Invalid cover', cover_edition_key: 'broken', cover_i: 0 },
    ] }) } as Response)));
    const results = await provider.search('edition cover');
    expect(results[0].coverUrl).toBe('https://covers.openlibrary.org/b/olid/OL4M-S.jpg?default=false');
    expect(results[1].coverUrl).toBe('');
  });

  it('starts Open Library after a short hedge and cancels slow Kitsu when the fallback wins', async () => {
    let primarySignal: AbortSignal | undefined;
    const primary = { search: vi.fn((_query: string, signal?: AbortSignal) => { primarySignal = signal; return new Promise<MangaSearchResult[]>((_resolve, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })))); }) };
    const expected: MangaSearchResult = { title: 'Naruto', coverUrl: '', totalVolumes: 72, provider: 'open-library', providerId: '/works/OL1W' };
    const fallback = { search: vi.fn(async () => [expected]) };
    const started = performance.now();
    const results = await new FallbackMangaProvider(primary, fallback).search('Naruto');
    expect(results).toEqual([expected]);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(fallback.search).toHaveBeenCalledTimes(1);
    expect(primarySignal?.aborted).toBe(true);
  });

  it('does not call fallback when Kitsu returns useful results quickly', async () => {
    const primary = { search: vi.fn(async () => [{ title: 'Naruto', coverUrl: '', totalVolumes: 72, provider: 'kitsu', providerId: '1' }]) };
    const fallback = { search: vi.fn(async () => []) };
    await expect(new FallbackMangaProvider(primary, fallback).search('Naruto')).resolves.toHaveLength(1);
    expect(fallback.search).not.toHaveBeenCalled();
  });
});

describe('cached manga metadata provider', () => {
  const row: MangaSearchResult = { title: 'Naruto', coverUrl: '', totalVolumes: 72, provider: 'kitsu', providerId: '35' };
  it('normalizes queries, caches successful results for five minutes, and expires entries', async () => {
    let now = 100;
    const inner = { search: vi.fn(async () => [row]) };
    const provider = new CachedMangaProvider(inner, 300_000, () => now);
    await provider.search(' Naruto  ');
    await provider.search('naruto');
    expect(inner.search).toHaveBeenCalledTimes(1);
    now += 300_001;
    await provider.search('naruto');
    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('shares the in-flight request for an equivalent normalized query', async () => {
    let resolveSearch!: (results: MangaSearchResult[]) => void;
    const inner = { search: vi.fn(() => new Promise<MangaSearchResult[]>(resolve => { resolveSearch = resolve; })) };
    const provider = new CachedMangaProvider(inner);
    const first = provider.search('Naruto');
    const second = provider.search(' naruto ');
    expect(inner.search).toHaveBeenCalledTimes(1);
    resolveSearch([row]);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('does not cache provider errors and deduplicates by source identity rather than title', async () => {
    const sameTitle: MangaSearchResult = { ...row, providerId: '36' };
    const inner = { search: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([row, row, sameTitle]) };
    const provider = new CachedMangaProvider(inner);
    await expect(provider.search('Naruto')).rejects.toThrow('offline');
    expect(await provider.search('Naruto')).toHaveLength(2);
    expect(inner.search).toHaveBeenCalledTimes(2);
  });
});
