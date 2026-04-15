import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Car, Link } from 'lucide-react';

const SettingsPage = () => {
  const { toast } = useToast();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure your KDOps platform</p>
      </div>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company"><Building2 className="mr-2 h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" /> Users</TabsTrigger>
          <TabsTrigger value="integrations"><Link className="mr-2 h-4 w-4" /> Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Company Name</Label><Input defaultValue="KD Squares Ltd" /></div>
                <div className="space-y-1"><Label>RC Number</Label><Input placeholder="Enter RC number" /></div>
                <div className="space-y-1"><Label>TIN</Label><Input placeholder="Enter TIN" /></div>
                <div className="space-y-1"><Label>Address</Label><Input defaultValue="Port Harcourt, Rivers State" /></div>
              </div>
              <Button onClick={() => toast({ title: 'Settings saved' })}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">User Management</CardTitle>
                <Button size="sm" onClick={() => toast({ title: 'Invite functionality coming soon' })}>Invite User</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Manage users from the Lovable Cloud authentication panel. Users are automatically assigned roles based on their profile.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Airtable Integration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1"><Label>API Key</Label><Input type="password" placeholder="Enter Airtable API key" /></div>
              <div className="space-y-1"><Label>Base ID</Label><Input placeholder="Enter Base ID" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Expenses Table ID</Label><Input placeholder="Table ID" /></div>
                <div className="space-y-1"><Label>Income Table ID</Label><Input placeholder="Table ID" /></div>
              </div>
              <Button variant="outline" onClick={() => toast({ title: 'Connection test coming soon' })}>Test Connection</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
