import { supabase } from '@/lib/supabase';

/**
 * Send an in-app notification to a specific user. Best-effort — never throws.
 */
export async function notifyUser(opts: {
  userId: string;
  type: string;
  module?: string;
  priority?: 'normal' | 'high';
  title: string;
  body: string;
}): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      user_id: opts.userId,
      type: opts.type,
      module: opts.module || null,
      priority: opts.priority || 'normal',
      title: opts.title,
      body: opts.body,
    });
  } catch {
    // Best-effort — never block the calling action.
  }
}

/**
 * Send a notification to every user matching any of the given roles.
 * Useful for "notify all Finance and Admin users".
 */
export async function notifyRoles(opts: {
  roles: string[];
  type: string;
  module?: string;
  priority?: 'normal' | 'high';
  title: string;
  body: string;
}): Promise<void> {
  try {
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .in('role', opts.roles)
      .eq('status', 'active');
    if (!users || users.length === 0) return;
    const rows = users.map((u: any) => ({
      user_id: u.id,
      type: opts.type,
      module: opts.module || null,
      priority: opts.priority || 'normal',
      title: opts.title,
      body: opts.body,
    }));
    await supabase.from('notifications').insert(rows);
  } catch {
    // Best-effort.
  }
}
