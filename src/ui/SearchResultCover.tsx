import { useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';

function safeCoverUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch { return null; }
}

export default function SearchResultCover({ title, urls }: { title: string; urls: (string | undefined)[] }) {
  const candidates = useMemo(() => [...new Set(urls.map(url => url ? safeCoverUrl(url) : null).filter((url): url is string => Boolean(url)))], [urls.join('|')]);
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [candidates.join('|')]);
  const src = candidates[sourceIndex];
  if (!src) return <span className="result-cover-fallback" aria-hidden="true"><BookOpen size={16}/><b>{title.trim().slice(0, 1).toLocaleUpperCase()}</b></span>;
  return <img className="result-cover" src={src} alt="" width="42" height="56" loading="lazy" decoding="async" onError={() => setSourceIndex(index => index + 1)}/>;
}
