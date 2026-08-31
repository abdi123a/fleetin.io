import { cn } from '@/utils';

import type { RecordSummary } from '../contracts';
import { parseBody, plainBody } from './tokens';
import { RecordChip } from './RecordChip';

export interface MessageBodyProps {
  body: string;
  /** Highlights the reader's own name, so being asked something is visible. */
  currentUserId?: string;
  /** Rendering inside your own filled bubble — chips and mentions invert. */
  inverted?: boolean;
  /**
   * The records this body names, resolved by the server.
   *
   * Without it a chip in a message is a grey plate while the same booking on a
   * task card is amber "Empty Ready" — two colours for one fact.
   */
  references?: RecordSummary[];
  /**
   * Who wrote this and when, so a record chip's peek can quote the sentence it
   * was clicked in. The text is not passed — this component already holds the
   * body, and asking the caller for it again is how the two drift apart.
   */
  context?: { author?: string | null; at?: string | null } | null;
  className?: string;
}

/**
 * Renders a stored body: plain text, person chips and record links.
 *
 * Whitespace is preserved (`whitespace-pre-wrap`) because people write these
 * as short paragraphs with line breaks and the composer takes a plain Enter as
 * a newline.
 */
export function MessageBody({
  body, currentUserId, inverted = false, references = [], context, className,
}: MessageBodyProps) {
  const segments = parseBody(body);
  const said = context ? { ...context, text: plainBody(body) } : null;
  const resolved = new Map(references.map((r) => [`${r.type}:${r.reference}`, r]));

  return (
    <p
      className={cn(
        'whitespace-pre-wrap break-words text-sm leading-relaxed',
        inverted ? 'text-primary-foreground' : 'text-foreground',
        className,
      )}
    >
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return <span key={index}>{segment.text}</span>;
        }
        if (segment.kind === 'user') {
          const isMe = currentUserId === segment.userId;
          return (
            <span
              key={index}
              className={cn(
                'rounded-sm px-1 py-0.5 text-xs font-semibold',
                inverted
                  ? 'bg-white/25 text-primary-foreground'
                  : isMe
                    /* Being named yourself is the thing you scan for — it gets
                       the solid plate, not the wash everyone else gets. */
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary-subtle text-primary-bold',
              )}
            >
              @{segment.label}
            </span>
          );
        }
        const match = resolved.get(`${segment.recordType}:${segment.reference}`);
        return (
          <RecordChip
            key={index}
            recordType={segment.recordType}
            reference={segment.reference}
            parentRef={segment.parentRef ?? match?.parentRef}
            recordId={match?.id}
            status={match?.status}
            label={segment.label}
            size="sm"
            inverted={inverted}
            context={said}
          />
        );
      })}
    </p>
  );
}
