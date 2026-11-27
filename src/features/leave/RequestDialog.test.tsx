import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const submit = vi.fn();
const record = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ profile: { id: 'me', full_name: 'Emma Employee', role: 'field_staff' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-confirm', () => ({ confirm: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: vi.fn() }));
vi.mock('@/store/approvalStore', () => ({ useApprovalStore: { getState: () => ({ refresh: vi.fn() }) } }));

vi.mock('./leaveApi', () => {
  const result = (data: unknown) => ({ data, isLoading: false, isError: false });
  return {
    useHolidays: () => result(new Set<string>()),
    useLeaveTypes: () => result([
      { code: 'annual', name: 'Annual Leave', color: '#0ea5e9', default_days: 24, accrual_type: 'entitlement', paid: true, requires_medical_cert: false, gender: null, active: true },
      { code: 'sick', name: 'Sick Leave', color: '#f97316', default_days: 12, accrual_type: 'entitlement', paid: true, requires_medical_cert: true, gender: null, active: true },
    ]),
    usePeople: () => result([{ id: 'me', full_name: 'Emma Employee', email: 'e@x', photo_url: null, role: 'field_staff', status: 'active', start_date: '2020-01-01', job_title: null }]),
    useBalances: () => result([{ employee_id: 'me', year: 2026, annual_quota: 24, annual_used: 8, sick_used: 0, unpaid_used: 0 }]),
    useMyLeave: () => result([]),
    useAllLeave: () => result([]),
    leaveApi: { submit: (...a: unknown[]) => submit(...a), record: (...a: unknown[]) => record(...a) },
    emailEmployee: vi.fn(),
  };
});

import { RequestDialog } from './RequestDialog';

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T10:00:00Z')); // 6 months earned: 12 of 24
  submit.mockReset().mockResolvedValue({ ok: true, data: 'new-id' });
});
afterEach(() => vi.useRealTimers());

const setDates = (from: string, to: string) => {
  const inputs = document.querySelectorAll('input[type="date"]');
  fireEvent.change(inputs[0], { target: { value: from } });
  fireEvent.change(document.querySelectorAll('input[type="date"]')[1], { target: { value: to } });
};

describe('RequestDialog (employee request)', () => {
  it('shows the working days and what is left as soon as dates are picked', async () => {
    wrap(<RequestDialog open mode="request" onClose={() => undefined} />);
    setDates('2026-07-06', '2026-07-10');
    expect(await screen.findByText(/5 days off/)).toBeTruthy();
    // earned 12, used 8, asking 5 -> goes 1 past what is earned
    expect(screen.getAllByText(/available so far this year/).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: /Send request/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('allows a request inside the earned balance and sends it', async () => {
    const done = vi.fn();
    wrap(<RequestDialog open mode="request" onClose={() => undefined} onDone={done} />);
    setDates('2026-07-06', '2026-07-08');
    expect(await screen.findByText(/3 days off/)).toBeTruthy();
    const btn = screen.getByRole('button', { name: /Send request/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0]).toMatchObject({ type: 'annual', start: '2026-07-06', end: '2026-07-08', half: false });
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('refuses weekend-only dates with a plain explanation', async () => {
    wrap(<RequestDialog open mode="request" onClose={() => undefined} />);
    setDates('2026-07-04', '2026-07-05');
    expect(await screen.findByText(/all weekends or public holidays/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Send request/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers a half day for a single day', async () => {
    wrap(<RequestDialog open mode="request" onClose={() => undefined} />);
    setDates('2026-07-06', '2026-07-06');
    fireEvent.click(await screen.findByRole('switch', { name: /half a day/i }));
    expect(await screen.findByText(/0.5 days off/)).toBeTruthy();
  });
});
