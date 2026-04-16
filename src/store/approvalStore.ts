import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface ApprovalCounts {
  batches: number;
  expenses: number;
  fuel: number;
  budgets: number;
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
  total: 0,
};

export const useApprovalStore = create<ApprovalState>((set) => ({
  counts: ZERO,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const [batchRes, expenseRes, fuelRes, budgetRes] = await Promise.all([
        supabase
          .from('payment_batches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_approval'),
        supabase
          .from('expenses')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('fuel_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('budgets')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_approval'),
      ]);

      const batches = batchRes.count || 0;
      const expenses = expenseRes.count || 0;
      const fuel = fuelRes.count || 0;
      const budgets = budgetRes.count || 0;

      set({
        counts: {
          batches,
          expenses,
          fuel,
          budgets,
          total: batches + expenses + fuel + budgets,
        },
        loading: false,
      });
    } catch (err) {
      console.warn('[KDOps] approval counts refresh failed:', err);
      set({ loading: false });
    }
  },
}));
