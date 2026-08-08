import { useCallback, useEffect, useState } from 'react';
import {
  Users, X, Loader2, UserPlus, Shield, Eye, Crown, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ProfileRow } from '@/lib/task-types';
import type { Space, SpaceMember } from './TaskSidebar';

type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

const ROLE_CONFIG: Record<MemberRole, { label: string; icon: typeof Shield; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-500' },
  admin: { label: 'Admin', icon: Shield, color: 'text-blue-500' },
  member: { label: 'Member', icon: Users, color: 'text-emerald-500' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-muted-foreground' },
};

interface SpaceMembersDialogProps {
  space: Space;
  open: boolean;
  onClose: () => void;
  profiles: Map<string, ProfileRow>;
}

export function SpaceMembersDialog({ space, open, onClose, profiles }: SpaceMembersDialogProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingUser, setAddingUser] = useState<string>('');
  const [addingRole, setAddingRole] = useState<MemberRole>('member');
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('space_members')
      .select('*')
      .eq('space_id', space.id)
      .order('created_at');
    setMembers((data as SpaceMember[]) || []);
    setLoading(false);
  }, [space.id]);

  useEffect(() => {
    if (open) loadMembers();
  }, [open, loadMembers]);

  const nonMembers = Array.from(profiles.values()).filter(
    (p) => !members.some((m) => m.user_id === p.id) && p.id !== space.owner_id,
  );

  const addMember = async () => {
    if (!addingUser) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('space_members').insert({
        space_id: space.id,
        user_id: addingUser,
        role: addingRole,
        added_by: profile?.id || null,
      });
      if (error) throw error;
      toast({ title: 'Member added' });
      setAddingUser('');
      setAddingRole('member');
      await loadMembers();
    } catch (err: any) {
      toast({ title: 'Failed to add member', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (userId: string, role: MemberRole) => {
    const { error } = await supabase
      .from('space_members')
      .update({ role })
      .eq('space_id', space.id)
      .eq('user_id', userId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await loadMembers();
  };

  const removeMember = async (userId: string) => {
    const { error } = await supabase
      .from('space_members')
      .delete()
      .eq('space_id', space.id)
      .eq('user_id', userId);
    if (error) {
      toast({ title: 'Remove failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Member removed' });
    await loadMembers();
  };

  const isOwner = space.owner_id === profile?.id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: space.color }} />
            {space.name} — Members
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Owner row */}
          {space.owner_id && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40">
              <AvatarCircle name={profiles.get(space.owner_id)?.full_name || 'Owner'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profiles.get(space.owner_id)?.full_name || 'Unknown'}</p>
                <p className="text-[11px] text-muted-foreground">Space owner</p>
              </div>
              <div className="flex items-center gap-1.5 text-amber-500">
                <Crown className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Owner</span>
              </div>
            </div>
          )}

          {/* Member list */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {space.is_private
                ? 'No members yet. Add people to give them access to this private space.'
                : 'No explicit members. This is a public space visible to everyone.'}
            </p>
          ) : (
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {members.map((m) => {
                const p = profiles.get(m.user_id);
                const cfg = ROLE_CONFIG[m.role as MemberRole] || ROLE_CONFIG.member;
                return (
                  <div key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors group">
                    <AvatarCircle name={p?.full_name || 'User'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p?.full_name || 'Unknown'}</p>
                      <p className="text-[11px] text-muted-foreground">{p?.email}</p>
                    </div>
                    {isOwner ? (
                      <div className="flex items-center gap-1.5">
                        <Select value={m.role} onValueChange={(v) => updateRole(m.user_id, v as MemberRole)}>
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={() => removeMember(m.user_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className={cn('flex items-center gap-1.5', cfg.color)}>
                        <cfg.icon className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">{cfg.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add member form */}
          {isOwner && nonMembers.length > 0 && (
            <div className="flex items-end gap-2 pt-2 border-t border-border/40">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add member</label>
                <Select value={addingUser} onValueChange={setAddingUser}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a person..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonMembers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={addingRole} onValueChange={(v) => setAddingRole(v as MemberRole)}>
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={addMember} disabled={saving || !addingUser}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AvatarCircle({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold leading-none">{initials}</span>
    </div>
  );
}
