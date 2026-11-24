import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import { FieldValidationPanel } from '../components/FieldValidationPanel';
import { FieldDefaultPanel } from '../components/FieldDefaultPanel';
import { DEFAULT_VALIDATION_SETTINGS, describeRange, rangeProblem } from '../lib/validation';

describe('describeRange', () => {
  it('says in words what the pair allows', () => {
    expect(describeRange('0', '100')).toBe('Allowed: 0 to 100');
    expect(describeRange('5', '')).toBe('Allowed: 5 or more');
    expect(describeRange('', '9')).toBe('Allowed: 9 or less');
    expect(describeRange('', '')).toBe('Any value is allowed');
  });

  it('treats text that is not a number as not set (an empty box is not zero)', () => {
    expect(describeRange('abc', '')).toBe('Any value is allowed');
    expect(describeRange('  ', '7')).toBe('Allowed: 7 or less');
  });

  it('adds a unit, and keeps negatives and decimals', () => {
    expect(describeRange('3', '20', 'characters')).toBe('Allowed: 3 to 20 characters');
    expect(describeRange('-1.5', '2.5')).toBe('Allowed: -1.5 to 2.5');
  });
});

describe('rangeProblem', () => {
  it('flags a smallest that is larger than the largest', () => {
    expect(rangeProblem('10', '5')).toContain('larger');
  });
  it('is fine when the pair works, or when either side is empty', () => {
    expect(rangeProblem('5', '10')).toBe('');
    expect(rangeProblem('5', '5')).toBe('');
    expect(rangeProblem('', '5')).toBe('');
    expect(rangeProblem('10', '')).toBe('');
    expect(rangeProblem('x', '5')).toBe('');
  });
});

describe('FieldValidationPanel', () => {
  afterEach(cleanup);

  it('shows Required as a switch with its explanation, and switching it reports the change', () => {
    const onChange = vi.fn();
    render(<FieldValidationPanel uiType="Number" value={DEFAULT_VALIDATION_SETTINGS} onChange={onChange} />);
    expect(screen.getByText('The cell cannot be left empty.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: /required/i }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALIDATION_SETTINGS, required: true });
  });

  it('puts smallest and largest in one "Allowed range" with a summary of what they allow', () => {
    render(<FieldValidationPanel uiType="Number" value={{ ...DEFAULT_VALIDATION_SETTINGS, min: '0', max: '100' }} onChange={() => {}} />);
    expect(screen.getByText('Allowed range')).toBeTruthy();
    expect(screen.getByText('Allowed: 0 to 100')).toBeTruthy();
  });

  it('typing in a limit reports it', () => {
    const onChange = vi.fn();
    render(<FieldValidationPanel uiType="Number" value={DEFAULT_VALIDATION_SETTINGS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Smallest'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALIDATION_SETTINGS, min: '5' });
  });

  it('shows one error for the pair when the smallest is above the largest, and marks both boxes', () => {
    render(<FieldValidationPanel uiType="Number" value={{ ...DEFAULT_VALIDATION_SETTINGS, min: '10', max: '5' }} onChange={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('larger');
    expect(screen.getByLabelText('Smallest').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Largest').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows no error for a good range', () => {
    render(<FieldValidationPanel uiType="Number" value={{ ...DEFAULT_VALIDATION_SETTINGS, min: '1', max: '5' }} onChange={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an invalid pattern is explained, a valid one is not an error', () => {
    const { rerender } = render(
      <FieldValidationPanel uiType="SingleLineText" value={{ ...DEFAULT_VALIDATION_SETTINGS, pattern: '([' }} onChange={() => {}} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('not valid');
    rerender(<FieldValidationPanel uiType="SingleLineText" value={{ ...DEFAULT_VALIDATION_SETTINGS, pattern: '^a+$' }} onChange={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows nothing for a field type that has no rules', () => {
    const { container } = render(<FieldValidationPanel uiType="Formula" value={DEFAULT_VALIDATION_SETTINGS} onChange={() => {}} />);
    expect(container.textContent).toBe('');
  });
});

describe('FieldDefaultPanel', () => {
  afterEach(cleanup);

  it('says what a default does and that existing rows are not changed', () => {
    render(<FieldDefaultPanel uiType="SingleLineText" value="" onChange={() => {}} />);
    expect(screen.getByText(/Rows that already exist are not changed/)).toBeTruthy();
    expect(screen.getByPlaceholderText('No default')).toBeTruthy();
  });

  it('offers Clear only when there is a default, and Clear removes it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<FieldDefaultPanel uiType="SingleLineText" value="" onChange={onChange} />);
    expect(screen.queryByText('Clear')).toBeNull();
    rerender(<FieldDefaultPanel uiType="SingleLineText" value="Pending" onChange={onChange} />);
    fireEvent.click(screen.getByText('Clear'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('a checkbox default is a switch', () => {
    const onChange = vi.fn();
    render(<FieldDefaultPanel uiType="Checkbox" value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /checked by default/i }));
    expect(onChange).toHaveBeenCalledWith('true');
  });

  it('a select has an explicit "No default" choice', () => {
    render(<FieldDefaultPanel uiType="SingleSelect" choices={[{ title: 'Open' }, { title: 'Done' }]} value="" onChange={() => {}} />);
    const options = [...screen.getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['No default', 'Open', 'Done']);
  });

  it('the allow-new-options switch appears for selects and reports changes', () => {
    const onAllow = vi.fn();
    render(
      <FieldDefaultPanel uiType="SingleSelect" choices={[]} value="" onChange={() => {}} allowNewOptions onAllowNewOptionsChange={onAllow} />,
    );
    fireEvent.click(screen.getByRole('switch', { name: /add new options/i }));
    expect(onAllow).toHaveBeenCalledWith(false);
  });
});
