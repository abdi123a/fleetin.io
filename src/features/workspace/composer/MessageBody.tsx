import { cn } from '@/utils';

import { parseBody } from './tokens';
import { RecordChip } from './RecordChip';

export interface MessageBodyProps {
  body: string;
  /** Highlights the reader's own name, so being asked something is visible. */
  currentUserId?: string;
  className?: string;
}

/**
 * Renders a stored body: plain text, person chips and record links.
 *
 * Whitespace is preserved (`whitespace-pre-wrap`) because people write these
 * as short paragraphs with line breaks and the composer takes a plain Enter as
 * a newline.
 */
export function MessageBody({ body, currentUserId, className }: MessageBodyProps) {
  const segments = parseBody(body);

  return (
    <p className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground', className)}>
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
                isMe ? 'bg-primary text-primary-foreground' : 'bg-primary-subtle text-primary-bold',
              )}
            >
              @{segment.label}
            </span>
          );
        }
        return (
          <RecordChip
            key={index}
            recordType={segment.recordType}
            reference={segment.reference}
            parentRef={segment.parentRef}
            label={segment.label}
            size="sm"
          />
        );
      })}
    </p>
  );
}
