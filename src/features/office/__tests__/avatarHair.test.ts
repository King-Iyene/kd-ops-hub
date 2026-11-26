import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The renderer is canvas code, so this checks the rule in its source: a "None" hairstyle must not grow hair on the back view.
describe('avatar hair', () => {
  const src = readFileSync(join(__dirname, '../world/render.ts'), 'utf8');
  it('the back view stays bald when the hairstyle is None (front and back must agree)', () => {
    expect(src).toMatch(/if \(back\) \{[\s\S]{0,200}costume === 'none' && dressedAs\.hairStyle === 3\)\) disc\(ctx, px, hy, 9, a\.hair\)/);
  });
});
