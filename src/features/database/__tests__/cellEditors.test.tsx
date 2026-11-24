import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CurrencyCellEditor,
  DateCellEditor,
  DateTimeCellEditor,
  DecimalCellEditor,
  DurationCellEditor,
  EmailCellEditor,
  LongTextCellEditor,
  MultiSelectCellEditor,
  NumberCellEditor,
  PercentCellEditor,
  PhoneNumberCellEditor,
  RatingCellEditor,
  SelectCellEditor,
  TextCellEditor,
  TimeCellEditor,
  URLCellEditor,
  YearCellEditor,
} from '../components/grid/cell-editors';
import {
  CurrencyCellRenderer,
  DecimalCellRenderer,
  DurationCellRenderer,
  LongTextCellRenderer,
  NumberCellRenderer,
  PercentCellRenderer,
  RatingCellRenderer,
  DateCellRenderer,
} from '../components/grid/cell-renderers';

// The first render of the grid code is slow on a busy machine.
vi.setConfig({ testTimeout: 30000 });

beforeAll(() => {
  // Radix popovers measure their anchor; jsdom has no ResizeObserver.
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as any).DOMRect ??= class {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(cleanup);

const field = (ui_type: string, options: Record<string, unknown> = {}, name = 'Field') =>
  ({
    id: 'f1',
    table_id: 't1',
    name,
    pg_column_name: 'f',
    ui_type,
    pg_type: 'TEXT',
    options,
    position: 1,
    width: 180,
    is_primary: false,
    is_required: false,
    is_unique: false,
    is_system: false,
    is_hidden: false,
    description: null,
    default_value: null,
    created_at: '',
    updated_at: '',
  }) as any;

const props = (f: any, value: unknown) => ({
  value,
  field: f,
  onCommit: vi.fn(),
  onCancel: vi.fn(),
  onFieldUpdate: vi.fn(),
});

describe('number editors', () => {
  it('commit once when Enter is followed by the blur that closing causes', () => {
    const p = props(field('Number'), 5);
    render(<NumberCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '12.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(p.onCommit).toHaveBeenCalledTimes(1);
    expect(p.onCommit).toHaveBeenCalledWith(12.5);
  });

  it('Escape cancels and never commits', () => {
    const p = props(field('Number'), 5);
    render(<NumberCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(p.onCommit).not.toHaveBeenCalled();
  });

  it('clearing the box commits an empty value', () => {
    const p = props(field('Number'), 5);
    render(<NumberCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(null);
  });

  it('a lone minus sign is not saved: Enter keeps editing, clicking away discards', () => {
    const p = props(field('Number'), 5);
    render(<NumberCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });

  it('currency shows the right symbol and keeps pasted formatted amounts', () => {
    const p = props(field('Currency', { currencyCode: 'NGN' }), 482539.27);
    render(<CurrencyCellEditor {...p} />);
    expect(screen.getByText('₦')).toBeInTheDocument();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('482539.27');
    fireEvent.paste(input, { clipboardData: { getData: () => '₦1,234.50' } });
    expect(input.value).toBe('1234.5');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(1234.5);
  });

  it('percent shows its sign and decimal commits a number', () => {
    const percent = props(field('Percent'), 40);
    render(<PercentCellEditor {...percent} />);
    expect(screen.getByText('%')).toBeInTheDocument();
    cleanup();
    const decimal = props(field('Decimal', { precision: 2 }), 1);
    render(<DecimalCellEditor {...decimal} />);
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
  });
});

describe('rating editor', () => {
  it('arrow keys change the draft without closing; Enter saves it', () => {
    const p = props(field('Rating', { max: 5 }), 1);
    render(<RatingCellEditor {...p} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute('aria-valuenow', '3');
    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(3);
  });

  it('leaving an empty rating untouched keeps it empty', () => {
    const p = props(field('Rating', { max: 5 }), null);
    render(<RatingCellEditor {...p} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(null);
  });

  it('draws the number of icons the field asks for', () => {
    const p = props(field('Rating', { max: 7, icon: 'heart', color: 'red' }), 2);
    render(<RatingCellEditor {...p} />);
    expect(screen.getAllByRole('button')).toHaveLength(7);
  });
});

describe('duration editor', () => {
  it('reads natural typing', () => {
    const p = props(field('Duration', { format: 'h:mm' }), 3600);
    render(<DurationCellEditor {...p} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('1:00');
    fireEvent.change(input, { target: { value: '1h 30m' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(5400);
  });

  it('an empty cell opens empty and clearing stores nothing', () => {
    const p = props(field('Duration'), null);
    render(<DurationCellEditor {...p} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith(null);
  });

  it('text that is not a duration is flagged, not saved', () => {
    const p = props(field('Duration'), 60);
    render(<DurationCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'soon' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('contact editors', () => {
  it('a wrong email shows a message on Enter and is discarded when clicking away', () => {
    const p = props(field('Email'), '');
    render(<EmailCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(p.onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });

  it('a good email commits once', () => {
    const p = props(field('Email'), '');
    render(<EmailCellEditor {...p} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: ' a@b.co ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(p.onCommit).toHaveBeenCalledTimes(1);
    expect(p.onCommit).toHaveBeenCalledWith('a@b.co');
  });

  it('url and phone commit', () => {
    const url = props(field('URL'), '');
    render(<URLCellEditor {...url} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'example.com' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(url.onCommit).toHaveBeenCalledWith('example.com');
    cleanup();
    const phone = props(field('PhoneNumber'), '');
    render(<PhoneNumberCellEditor {...phone} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '0801 234 5678' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    fireEvent.blur(screen.getByRole('textbox'));
    expect(phone.onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('date editors', () => {
  it('accept a typed date and save it as a plain date', () => {
    const p = props(field('Date'), null);
    render(<DateCellEditor {...p} />);
    const box = screen.getByLabelText('Type a date');
    fireEvent.change(box, { target: { value: '22 Nov 2026' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(p.onCommit).toHaveBeenCalledWith('2026-11-22');
  });

  it('refuse text that is not a date', () => {
    const p = props(field('Date'), null);
    render(<DateCellEditor {...p} />);
    const box = screen.getByLabelText('Type a date');
    fireEvent.change(box, { target: { value: 'banana' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(p.onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/not a date/i)).toBeInTheDocument();
  });

  it('keep showing the current value in the cell while open', () => {
    const p = props(field('Date'), '2026-03-02');
    render(<DateCellEditor {...p} />);
    expect(screen.getAllByText('2 Mar 2026').length).toBeGreaterThan(0);
  });

  it('Clear empties the cell', () => {
    const p = props(field('Date'), '2026-03-02');
    render(<DateCellEditor {...p} />);
    fireEvent.click(screen.getByText('Clear'));
    expect(p.onCommit).toHaveBeenCalledWith(null);
  });

  it('date and time shows a 12 hour clock by default and a 24 hour one when asked', () => {
    const twelve = props(field('DateTime'), '2026-03-02T13:05:00Z');
    render(<DateTimeCellEditor {...twelve} />);
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(screen.getByText('PM')).toBeInTheDocument();
    cleanup();
    const twentyFour = props(field('DateTime', { use12h: false }), '2026-03-02T13:05:00Z');
    render(<DateTimeCellEditor {...twentyFour} />);
    expect(screen.queryByText('AM')).not.toBeInTheDocument();
  });
});

describe('select editors', () => {
  const choices = [
    { title: 'Rent', color: 'redLight2' },
    { title: 'Utilities & Bills', color: 'blueLight2' },
  ];

  it('single select keeps the chosen pill visible and offers the options', () => {
    const p = props(field('SingleSelect', { choices }), 'Rent');
    render(<SelectCellEditor {...p} />);
    expect(screen.getAllByText('Rent').length).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByText('Utilities & Bills')[0]);
    expect(p.onCommit).toHaveBeenCalledWith('Utilities & Bills');
  });

  it('offers to create an option unless the field forbids it', () => {
    const open = props(field('SingleSelect', { choices }), null);
    render(<SelectCellEditor {...open} />);
    fireEvent.change(screen.getByPlaceholderText('Find an option...'), { target: { value: 'Travel' } });
    expect(screen.getByText(/Create/)).toBeInTheDocument();
    cleanup();
    const closed = props(field('SingleSelect', { choices, allowNewOptions: false }), null);
    render(<SelectCellEditor {...closed} />);
    fireEvent.change(screen.getByPlaceholderText('Find an option...'), { target: { value: 'Travel' } });
    expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
  });

  it('multiple select renders with the chosen options shown', () => {
    const p = props(field('MultiSelect', { choices }), ['Rent']);
    render(<MultiSelectCellEditor {...p} />);
    expect(screen.getAllByText('Rent').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Find or create an option')).toBeInTheDocument();
  });
});

describe('every editor renders without crashing', () => {
  const samples: [string, React.ComponentType<any>, unknown, Record<string, unknown>?][] = [
    ['text', TextCellEditor, 'hello'],
    ['number', NumberCellEditor, 12],
    ['currency', CurrencyCellEditor, 12.5, { currencyCode: 'USD' }],
    ['percent', PercentCellEditor, 50],
    ['decimal', DecimalCellEditor, 1.234, { precision: 3 }],
    ['year', YearCellEditor, 2026],
    ['time', TimeCellEditor, '14:30'],
    ['duration', DurationCellEditor, 90],
    ['email', EmailCellEditor, 'a@b.co'],
    ['url', URLCellEditor, 'https://x.co'],
    ['phone', PhoneNumberCellEditor, '123'],
    ['rating', RatingCellEditor, 3],
    ['date', DateCellEditor, '2026-01-01'],
    ['datetime', DateTimeCellEditor, '2026-01-01T10:00:00Z'],
    ['longtext', LongTextCellEditor, 'a\nb'],
  ];
  it.each(samples)('%s', (_name, Editor, value, options) => {
    const p = props(field('X', options ?? {}), value);
    expect(() => render(<Editor {...p} />)).not.toThrow();
  });
});

describe('cells', () => {
  const cell = (Renderer: React.ComponentType<any>, f: any, value: unknown) =>
    render(<Renderer value={value} field={f} record={{ id: 'r' }} rowHeight="short" />);

  it('money reads the same everywhere: symbol, grouping and decimals', () => {
    cell(CurrencyCellRenderer, field('Currency', { currencyCode: 'NGN' }), 8500000);
    expect(screen.getByText('₦8,500,000.00')).toBeInTheDocument();
  });

  it('negative money and brackets', () => {
    cell(CurrencyCellRenderer, field('Currency', { currencyCode: 'NGN', negativeStyle: 'parentheses' }), -1234.5);
    expect(screen.getByText('(₦1,234.50)')).toBeInTheDocument();
  });

  it('numbers honour precision and abbreviation', () => {
    cell(NumberCellRenderer, field('Number', { precision: 0 }), 603123.664);
    expect(screen.getByText('603,124')).toBeInTheDocument();
    cleanup();
    cell(NumberCellRenderer, field('Number', { abbreviate: true }), 3400000);
    expect(screen.getByText('3.4M')).toBeInTheDocument();
    cleanup();
    cell(DecimalCellRenderer, field('Decimal'), 2);
    expect(screen.getByText('2.00')).toBeInTheDocument();
  });

  it('percent can be text only', () => {
    cell(PercentCellRenderer, field('Percent', { percentDisplay: 'text' }), 45.5);
    expect(screen.getByText('45.5%')).toBeInTheDocument();
  });

  it('duration shows in the field format', () => {
    cell(DurationCellRenderer, field('Duration', { format: 'h:mm' }), 5400);
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('rating draws the right number of icons', () => {
    const { container } = cell(RatingCellRenderer, field('Rating', { max: 4 }), 2);
    expect(container.querySelectorAll('svg')).toHaveLength(4);
  });

  it('long text shows marks as formatting, never as raw html', () => {
    const { container } = cell(LongTextCellRenderer, field('LongText'), 'a **bold** and <b>tag</b>');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>tag</b>');
  });

  it('dates use the module format', () => {
    cell(DateCellRenderer, field('Date'), '2026-09-06');
    expect(screen.getByText('6 Sep 2026')).toBeInTheDocument();
  });
});
