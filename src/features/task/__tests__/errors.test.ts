import { describe, expect, it } from 'vitest';
import { friendlyErrorMessage } from '../lib/errors';

describe('friendlyErrorMessage', () => {
  it('rewrites a row-level security violation into an actionable message', () => {
    const err = Object.assign(new Error('new row violates row-level security policy for table "tk_spaces"'), {
      code: '42501',
    });
    expect(friendlyErrorMessage(err)).toBe("You don't have permission to do this. Ask a workspace admin.");
  });

  it('recognises the RLS message even without the Postgres error code', () => {
    const err = new Error('new row violates row-level security policy for table "tk_lists"');
    expect(friendlyErrorMessage(err)).toBe("You don't have permission to do this. Ask a workspace admin.");
  });

  it('passes through any other error message unchanged', () => {
    expect(friendlyErrorMessage(new Error('duplicate key value violates unique constraint'))).toBe(
      'duplicate key value violates unique constraint',
    );
  });

  it('stringifies a non-Error value', () => {
    expect(friendlyErrorMessage('plain string failure')).toBe('plain string failure');
  });
});
