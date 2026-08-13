import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from '@/design-system/icons';


import { forwardRef, useState } from 'react';

import { useFormField } from '@/design-system/primitives/Form/FormContext';
import { cn } from '@/utils';

export interface RichTextEditorProps {
  /** HTML content string. */
  value?: string;
  defaultValue?: string;
  onChange?: (htmlContent: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
}

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  {
    value: propValue,
    defaultValue = '<p>Enter operational overview notes or partner terms...</p>',
    onChange,
    placeholder = 'Start typing...',
    disabled: propDisabled,
    minHeight = '10rem',
    className,
  },
  ref,
) {
  const { disabled: contextDisabled, id: contextId, ariaDescribedBy } = useFormField();
  const isDisabled = propDisabled ?? contextDisabled;

  const [content, setContent] = useState<string>(propValue ?? defaultValue);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  const currentContent = propValue !== undefined ? propValue : content;

  const handleTextChange = (text: string) => {
    setContent(text);
    onChange?.(text);
  };

  const applyFormatting = (tag: string) => {
    if (isDisabled) return;
    let wrapped = currentContent;
    if (tag === 'b') wrapped = `<b>${currentContent}</b>`;
    else if (tag === 'i') wrapped = `<i>${currentContent}</i>`;
    else if (tag === 'u') wrapped = `<u>${currentContent}</u>`;
    else if (tag === 'h1') wrapped = `<h1>${currentContent}</h1>`;
    else if (tag === 'h2') wrapped = `<h2>${currentContent}</h2>`;
    else if (tag === 'ul') wrapped = `<ul><li>${currentContent}</li></ul>`;
    else if (tag === 'quote') wrapped = `<blockquote>${currentContent}</blockquote>`;
    
    setContent(wrapped);
    onChange?.(wrapped);
  };

  return (
    <div
      ref={ref}
      id={contextId}
      aria-describedby={ariaDescribedBy}
      className={cn(
        'w-full rounded-md border border-input bg-surface overflow-hidden transition-all',
        'hover:border-border-strong focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
        isDisabled && 'opacity-70 pointer-events-none bg-surface-sunken',
        className,
      )}

    >
      {/* Editor Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            title="Bold"
            onClick={() => applyFormatting('b')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Italic"
            onClick={() => applyFormatting('i')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Underline"
            onClick={() => applyFormatting('u')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Underline className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Strikethrough"
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Strikethrough className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-[1px] bg-border" />

          <button
            type="button"
            title="Heading 1"
            onClick={() => applyFormatting('h1')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Heading1 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Heading 2"
            onClick={() => applyFormatting('h2')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Heading2 className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-[1px] bg-border" />

          <button
            type="button"
            title="Bullet List"
            onClick={() => applyFormatting('ul')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Numbered List"
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Blockquote"
            onClick={() => applyFormatting('quote')}
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <Quote className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-[1px] bg-border" />

          <button
            type="button"
            title="Align Left"
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Align Center"
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <AlignCenter className="h-4 w-4" />

          </button>
          <button
            type="button"
            title="Align Right"
            className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <AlignRight className="h-4 w-4" />
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center rounded-md border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={cn(
              'rounded-sm px-2.5 py-1 type-body-xs font-medium transition-colors',
              activeTab === 'editor' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground',
            )}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={cn(
              'rounded-sm px-2.5 py-1 type-body-xs font-medium transition-colors',
              activeTab === 'preview' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground',
            )}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {activeTab === 'editor' ? (
        <textarea
          value={currentContent}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={placeholder}
          disabled={isDisabled}
          style={{ minHeight }}
          className="w-full bg-surface p-3 type-body-sm text-foreground focus:outline-none resize-y"
        />
      ) : (
        <div
          style={{ minHeight }}
          className="prose prose-sm dark:prose-invert max-w-none bg-surface p-4 type-body-sm text-foreground overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: currentContent || '<p className="text-muted-foreground">Nothing to preview</p>' }}
        />
      )}
    </div>
  );
});
