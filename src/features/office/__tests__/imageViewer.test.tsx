import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImageViewer, clampZoom } from '../ChatParts';

afterEach(cleanup);

describe('picture viewer', () => {
  it('opens in the app, shows the picture, and the zoom buttons change the zoom', () => {
    render(<ImageViewer src="https://x/y.png" onClose={() => undefined} />);
    expect((screen.getByAltText('Shared picture') as HTMLImageElement).src).toBe('https://x/y.png');
    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Fit to screen'));
    expect(screen.getByText('100%')).toBeTruthy();
  });
  it('the keys zoom and Escape closes only the picture', () => {
    const onClose = vi.fn();
    render(<ImageViewer src="a" onClose={onClose} />);
    fireEvent.keyDown(window, { key: '+' });
    expect(screen.getByText('125%')).toBeTruthy();
    fireEvent.keyDown(window, { key: '0' });
    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('the wheel zooms, double click zooms in and back out, and zoom stays within limits', () => {
    const { container } = render(<ImageViewer src="a" onClose={() => undefined} />);
    const area = document.querySelector('[data-image-viewer] .cursor-zoom-in') as HTMLElement;
    expect(area).toBeTruthy();
    fireEvent.wheel(area, { deltaY: -300 });
    expect(Number(screen.getByText(/%$/).textContent!.replace('%', ''))).toBeGreaterThan(100);
    fireEvent.click(screen.getByLabelText('Fit to screen'));
    fireEvent.doubleClick(area);
    expect(screen.getByText('250%')).toBeTruthy();
    fireEvent.doubleClick(document.querySelector('[data-image-viewer] .cursor-grab') as HTMLElement);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(clampZoom(100)).toBe(8);
    expect(clampZoom(0.01)).toBe(0.5);
    void container;
  });
  it('a click on the dark part closes it, a click on the picture does not', () => {
    const onClose = vi.fn();
    render(<ImageViewer src="a" onClose={onClose} />);
    const area = document.querySelector('[data-image-viewer] .cursor-zoom-in') as HTMLElement;
    fireEvent.pointerDown(screen.getByAltText('Shared picture'), { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(area);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.querySelector('[data-backdrop]') as HTMLElement, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(area);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
