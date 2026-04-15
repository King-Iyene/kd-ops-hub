import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDateTime } from '@/lib/format';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Users, Clock, Fuel, Plus, CheckCircle, FileText } from 'lucide-react';

interface DashboardStats {
  partnersPaid: number;
  totalDisbursed: number;
  pendingBatches: number;
  fuelSpend: number;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    partnersPaid: 0,
    totalDisbursed: 0,
    pendingBatches: 0,
    fuelSpend: 0,
  });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();

      const [batchesRes, pendingRes, fuelRes, activityRes] = await Promise.all([
        supabase.from('payment_batches').select('total_amount, beneficiary_count').eq('status', 'processed').gte('created_at', monthStart),
        supabase.from('payment_batches').select('id').eq('status', 'pending_approval'),
        supabase.from('fuel_requests').select('amount_ngn').eq('status', 'approved').gte('created_at', weekStart),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      const totalDisbursed = batchesRes.data?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
      const partnersPaid = batchesRes.data?.reduce((sum, b) => sum + (b.beneficiary_count || 0), 0) || 0;
      const fuelSpend = fuelRes.data?.reduce((sum, f) => sum + (f.amount_ngn || 0), 0) || 0;

      setStats({
        partnersPaid,
        totalDisbursed,
        pendingBatches: pendingRes.data?.length || 0,
        fuelSpend,
      });
      setActivity(activityRes.data as ActivityItem[] || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'Partners Paid', value: stats.partnersPaid, icon: Users, subtitle: 'This month' },
    { title: 'Total Disbursed', value: formatNaira(stats.totalDisbursed), icon: CreditCard, subtitle: 'This month' },
    { title: 'Pending Batches', value: stats.pendingBatches, icon: Clock, subtitle: 'Awaiting approval' },
    { title: 'Fleet Fuel Spend', value: formatNaira(stats.fuelSpend), icon: Fuel, subtitle: 'This week' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of KD Squares operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold mt-1 currency">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center mt-0.5">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.body}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{formatDateTime(item.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" onClick={() => navigate('/payments/new')}>
              <Plus className="mr-2 h-4 w-4" /> Create Payment Batch
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/payments?status=pending_approval')}>
              <CheckCircle className="mr-2 h-4 w-4" /> Approve Pending Batches
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/fleet')}>
              <Fuel className="mr-2 h-4 w-4" /> Review Fuel Requests
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
