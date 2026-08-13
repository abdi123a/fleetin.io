import type { ReactNode } from 'react';

import { cn } from '@/utils';

/**
 * PropsTable — the API reference for a component.
 *
 * Scrolls horizontally inside its own container on narrow viewports rather than
 * letting the page scroll sideways, and collapses to stacked cards below `sm`
 * where four columns of monospace text are unreadable.
 */

export interface PropDefinition {
  name: string;
  /** TypeScript type, written as it appears in the props interface. */
  type: string;
  /** Default value, or omit when the prop is required/undefined by default. */
  defaultValue?: string;
  required?: boolean;
  description: ReactNode;
}

export interface PropsTableProps {
  props: PropDefinition[];
  className?: string;
}

export function PropsTable({ props, className }: PropsTableProps) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-surface', className)}>
      {/* Stacked cards — small viewports */}
      <ul className="divide-y divide-border sm:hidden">
        {props.map((prop) => (
          <li key={prop.name} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="type-mono font-medium text-foreground">{prop.name}</code>
              {prop.required && (
                <span className="type-label text-destructive">Required</span>
              )}
            </div>
            <p className="type-mono text-primary">{prop.type}</p>
            {prop.defaultValue && (
              <p className="type-caption text-muted-foreground">
                Default: <code className="type-mono">{prop.defaultValue}</code>
              </p>
            )}
            <p className="type-body-sm text-muted-foreground">{prop.description}</p>
          </li>
        ))}
      </ul>

      {/* Table — sm and up */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                Prop
              </th>
              <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                Type
              </th>
              <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                Default
              </th>
              <th scope="col" className="type-label px-4 py-2.5 text-muted-foreground">
                Description
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {props.map((prop) => (
              <tr key={prop.name} className="align-top">
                <td className="whitespace-nowrap px-4 py-3">
                  <code className="type-mono font-medium text-foreground">{prop.name}</code>
                  {prop.required && (
                    <span className="type-label ml-1.5 text-destructive">*</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="type-mono text-primary">{prop.type}</code>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {prop.defaultValue ? (
                    <code className="type-mono text-muted-foreground">{prop.defaultValue}</code>
                  ) : (
                    <span className="type-caption text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="px-4 py-3 type-body-sm text-muted-foreground">
                  {prop.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
