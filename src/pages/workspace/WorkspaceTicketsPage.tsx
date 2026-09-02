import { TicketList } from '@/features/workspace';

/**
 * Tickets — what the outside world has told us is wrong.
 *
 * A sibling of Tasks rather than a tab inside it, because the two answer
 * different questions to different people. The board answers "what am I doing
 * today", and most of what is on it has no customer behind it. This answers
 * "who is waiting on us, and has anybody picked it up" — and its empty state
 * is a good day, which is never true of the board.
 */
export function WorkspaceTicketsPage() {
  return <TicketList />;
}

export default WorkspaceTicketsPage;
