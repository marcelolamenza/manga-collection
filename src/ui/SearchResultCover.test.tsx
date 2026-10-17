import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SearchResultCover from './SearchResultCover';

describe('search result covers', () => {
  it('shows a stable fallback when the provider has no valid cover URL', () => {
    const { container } = render(<SearchResultCover title="Naruto" urls={['javascript:alert(1)', undefined]}/>);
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('tries the next provided cover URL, then shows fallback after failures', () => {
    const { container } = render(<SearchResultCover title="Berserk" urls={['https://covers.test/broken.jpg', 'https://covers.test/good.jpg']}/>);
    let image = container.querySelector('img')!;
    expect(image).toHaveAttribute('width', '42');
    expect(image).toHaveAttribute('height', '56');
    expect(image).toHaveAttribute('loading', 'lazy');
    fireEvent.error(image);
    image = container.querySelector('img')!;
    expect(image).toHaveAttribute('src', 'https://covers.test/good.jpg');
    fireEvent.error(image);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
