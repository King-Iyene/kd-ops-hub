import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface ApprovalCounts {
  batches: number;
  expenses: number;
  fuel: number;
  budgets: number;
  leave: number;
  total: number;
}

interface ApprovalState {
  counts: ApprovalCounts;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ZERO: ApprovalCounts = {
  batches: 0,
  expenses: 0,
  fuel: 0,
  budgets: 0,
  leave: 0,
  total: 0,
};

export const useApprovalStore = create<ApprovalState>((set) => ({
  counts: ZERO,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const [batchRes, expenseRes, fuelRes, budgetRes, leaveRes] =
        await Promise.all([
          supabase
            .from('payment_batches')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_approval')
            .is('deleted_at', null),
          supabase
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .is('deleted_at', null),
          supabase
            .from('fuel_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .is('deleted_at', null),
          supabase
            .from('budgets')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_approval')
            .is('deleted_at', null),
          supabase
            .from('leave_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .is('deleted_at', null),
        ]);

      const batches = batchRes.count || 0;
      const expenses = expenseRes.count || 0;
      const fuel = fuelRes.count || 0;
      const budgets = budgetRes.count || 0;
      const leave = leaveRes.count || 0;

      set({
        counts: {
          batches,
          expenses,
          fuel,
          budgets,
          leave,
          total: batches + expenses + fuel + budgets + leave,
        },
        loading: false,
      });
    } catch (err) {
      console.warn('[KDOps] approval counts refresh failed:', err);
      set({ loading: false });
    }
  },
}));
