import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MangaModal } from './App';
import type { MangaMetadataProvider, MangaSearchResult } from '../provider';

const hit = (title: string): MangaSearchResult => ({ title, coverUrl: '', totalVolumes: 10, provider: 'kitsu', providerId: title.toLowerCase() });
const onSave = () => '';

describe('manga search dialog', () => {
  it('debounces typing and ignores an outdated response after the query changes', async () => {
    const pending: { query: string; resolve: (rows: MangaSearchResult[]) => void; signal?: AbortSignal }[] = [];
    const searchProvider: MangaMetadataProvider = { search: (query, signal) => new Promise(resolve => pending.push({ query, resolve, signal })) };
    render(<MangaModal manga={null} onClose={vi.fn()} onSave={onSave} searchProvider={searchProvider}/>);
    const input = screen.getByPlaceholderText('Search a manga title');
    fireEvent.change(input, { target: { value: 'nar' } });
    await waitFor(() => expect(pending).toHaveLength(1), { timeout: 800 });
    expect(pending[0].query).toBe('nar');
    fireEvent.change(input, { target: { value: 'naruto' } });
    expect(pending[0].signal?.aborted).toBe(true);
    await waitFor(() => expect(pending).toHaveLength(2), { timeout: 800 });
    pending[1].resolve([hit('Current Naruto result')]);
    expect(await screen.findByText('Current Naruto result')).toBeInTheDocument();
    pending[0].resolve([hit('Stale Nar result')]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText('Stale Nar result')).not.toBeInTheDocument();
  });

  it('does not issue a duplicate request when Search is clicked during the debounce window', async () => {
    const searchProvider: MangaMetadataProvider = { search: vi.fn(async () => [hit('Naruto')]) };
    render(<MangaModal manga={null} onClose={vi.fn()} onSave={onSave} searchProvider={searchProvider}/>);
    fireEvent.change(screen.getByPlaceholderText('Search a manga title'), { target: { value: 'Naruto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('Naruto');
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(searchProvider.search).toHaveBeenCalledTimes(1);
  });
});
