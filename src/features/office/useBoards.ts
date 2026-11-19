import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Live polls and shared task boards. Everything is read from the database and kept fresh by realtime; every change goes through a database function. */
export interface PollRow { id: string; space_id: string; question: string; options: string[]; created_by: string | null; closed: boolean; created_at: string }
export interface VoteRow { poll_id: string; user_id: string; option: number }
export interface CardRow { id: string; space_id: string; board: string; col: number; body: string; created_by: string | null; created_at: string }

// the new tables and functions are not in the generated database types yet

const sb = supabase as any;

/** The tally for a poll: votes per choice, the total, and what a given person chose. */
export function tally(poll: PollRow, votes: VoteRow[], me?: string): { counts: number[]; total: number; mine: number | null } {
  const counts = poll.options.map(() => 0);
  let mine: number | null = null;
  for (const v of votes) {
    if (v.poll_id !== poll.id || v.option < 0 || v.option >= counts.length) continue;
    counts[v.option] += 1;
    if (me && v.user_id === me) mine = v.option;
  }
  return { counts, total: counts.reduce((a, b) => a + b, 0), mine };
}

export function useBoards(spaceId: string | null, enabled: boolean) {
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);

  const load = useCallback(async () => {
    if (!spaceId) { setPolls([]); setVotes([]); setCards([]); return; }
    const [p, c] = await Promise.all([
      sb.from('office_polls').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(40),
      sb.from('office_board_cards').select('*').eq('space_id', spaceId).order('created_at', { ascending: true }).limit(600),
    ]);
    if (!p.error) {
      const list = ((p.data ?? []) as PollRow[]).map((r) => ({ ...r, options: Array.isArray(r.options) ? r.options.map(String) : [] }));
      setPolls(list);
      if (list.length) {
        const v = await sb.from('office_poll_votes').select('poll_id,user_id,option').in('poll_id', list.map((r) => r.id)).limit(5000);
        if (!v.error) setVotes((v.data ?? []) as VoteRow[]);
      } else setVotes([]);
    }
    if (!c.error) setCards((c.data ?? []) as CardRow[]);
  }, [spaceId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    if (!spaceId) return;
    const ch = supabase.channel(`office-boards:${spaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_polls', filter: `space_id=eq.${spaceId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_board_cards', filter: `space_id=eq.${spaceId}` }, () => { void load(); })
      // votes have no space column, so any vote means a quick refresh of the tally
      .on('postgres_changes', { event: '*', schema: 'public', table: 'office_poll_votes' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [spaceId, enabled, load]);

  const createPoll = useCallback(async (question: string, options: string[]): Promise<string | null> => {
    if (!spaceId) return 'No office open';
    const { error } = await sb.rpc('office_poll_create', { p_space: spaceId, p_question: question.trim(), p_options: options.map((o) => o.trim()).filter(Boolean) });
    if (error) return String(error.message ?? 'Could not create the poll');
    void load();
    return null;
  }, [spaceId, load]);

  const vote = useCallback(async (poll: string, option: number, me: string) => {
    // show the vote at once, then let the database confirm
    setVotes((v) => [...v.filter((x) => !(x.poll_id === poll && x.user_id === me)), { poll_id: poll, user_id: me, option }]);
    const { error } = await sb.rpc('office_poll_vote', { p_poll: poll, p_option: option });
    if (error) void load();
  }, [load]);

  const closePoll = useCallback(async (poll: string) => { await sb.rpc('office_poll_close', { p_poll: poll }); void load(); }, [load]);

  const addCard = useCallback(async (board: string, col: number, body: string): Promise<string | null> => {
    if (!spaceId) return 'No office open';
    const { error } = await sb.rpc('office_card_add', { p_space: spaceId, p_board: board, p_col: col, p_body: body.trim() });
    if (error) return String(error.message ?? 'Could not add the card');
    void load();
    return null;
  }, [spaceId, load]);

  const moveCard = useCallback(async (card: string, col: number) => {
    setCards((c) => c.map((x) => (x.id === card ? { ...x, col } : x)));
    const { error } = await sb.rpc('office_card_move', { p_card: card, p_col: col });
    if (error) void load();
  }, [load]);

  const deleteCard = useCallback(async (card: string) => {
    setCards((c) => c.filter((x) => x.id !== card));
    await sb.rpc('office_card_delete', { p_card: card });
    void load();
  }, [load]);

  const boardCards = useCallback((board: string) => cards.filter((c) => c.board === board), [cards]);
  return useMemo(() => ({ polls, votes, cards, createPoll, vote, closePoll, addCard, moveCard, deleteCard, boardCards, reload: load }), [polls, votes, cards, createPoll, vote, closePoll, addCard, moveCard, deleteCard, boardCards, load]);
}
