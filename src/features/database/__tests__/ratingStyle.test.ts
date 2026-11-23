import { describe, expect, it } from 'vitest';
import { nextRating, ratingHexOf, ratingIconOf, ratingMaxOf, stepRating } from '../lib/ratingStyle';

describe('rating style', () => {
  it('keeps the number of icons between 1 and 10', () => {
    expect(ratingMaxOf(undefined)).toBe(5);
    expect(ratingMaxOf(0)).toBe(5);
    expect(ratingMaxOf(3)).toBe(3);
    expect(ratingMaxOf(10)).toBe(10);
    expect(ratingMaxOf(50)).toBe(10);
    expect(ratingMaxOf('7')).toBe(7);
    expect(ratingMaxOf('x')).toBe(5);
  });
  it('falls back to a star and amber', () => {
    expect(ratingIconOf('heart')).toBe('heart');
    expect(ratingIconOf('rocket')).toBe('star');
    expect(ratingHexOf('red')).toBe('#EF4444');
    expect(ratingHexOf('nope')).toBe('#F59E0B');
  });
  it('clears the rating when the current value is picked again', () => {
    expect(nextRating(3, 3, 5)).toBe(0);
    expect(nextRating(3, 4, 5)).toBe(4);
    expect(nextRating(0, 2, 5)).toBe(2);
  });
  it('never goes past the ends', () => {
    expect(nextRating(0, 9, 5)).toBe(5);
    expect(stepRating(5, 1, 5)).toBe(5);
    expect(stepRating(0, -1, 5)).toBe(0);
    expect(stepRating(2, 1, 5)).toBe(3);
  });
});
