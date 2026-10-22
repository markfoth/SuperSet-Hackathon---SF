import { useState } from 'react';
import type { Photo } from '../types';

/** Local optimised copy first, Commons thumbnail second, a neutral placeholder last — never a broken image. */
export function NeighbourhoodPhoto({ photo, className }: { photo: Photo | undefined; className?: string }) {
  const sources = photo ? [photo.local && `${import.meta.env.BASE_URL}${photo.local}`, photo.url].filter(Boolean) as string[] : [];
  const [i, setI] = useState(0);
  if (i >= sources.length) return <div className={`photo-placeholder ${className ?? ''}`}>No photo</div>;
  return <img className={className} src={sources[i]} alt={photo!.title} loading="lazy" onError={() => setI((n) => n + 1)} />;
}
