import { Loader2 } from '@/design-system/icons';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useFormContext, type FieldError } from 'react-hook-form';

import { cn } from '@/utils';

import { CharacterCounter } from './CharacterCounter';
import { ErrorMessage } from './ErrorMessage';
import { FormFieldContext, FormItemContext, getErrorMessage } from './FormContext';
import { HelperText } from './HelperText';
import { Label } from './Label';
import { SuccessMessage } from './SuccessMessage';

export interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** RHF field name or identifier. Required when integrating with React Hook Form. */
  name?: string;
  /** Explicit element ID. Generated automatically if omitted. */
  id?: string;
  /** Field label text or node. */
  label?: ReactNode;
  /** Optional secondary label text / subtitle right under label. */
  description?: ReactNode;
  /** Helper text or guidance displayed below the control. */
  helperText?: ReactNode;
  /** Intent of helper text: 'muted' | 'warning' | 'info'. */
  helperIntent?: 'muted' | 'warning' | 'info';
  /** Field validation error message or boolean. Reads automatically from RHF context if name is provided. */
  error?: FieldError | string | boolean;
  /** Field success message or boolean indicator. */
  success?: string | boolean;
  /** Field warning message or boolean indicator. */
  warning?: string | boolean;
  /** Mark field as required. */
  required?: boolean;
  /** Mark field as optional. */
  optional?: boolean;
  /** Disable the field and child control. */
  disabled?: boolean;
  /** Mark field as read-only. */
  readOnly?: boolean;
  /** Show loading spinner indicator for async validation or data fetching. */
  loading?: boolean;
  /** Current character count (for text inputs/textareas). */
  characterCount?: number;
  /** Max character length (renders CharacterCounter). */
  maxCharacterCount?: number;
  /** Layout orientation: 'vertical' (stacked) or 'horizontal' (side-by-side). Default is 'vertical'. */
  orientation?: 'vertical' | 'horizontal';
  /** Action node rendered right aligned with label (e.g. "Forgot password?" link). */
  labelAction?: ReactNode;
  /** Single control React element or render function. */
  children?: ReactNode | ((fieldState: ReturnType<typeof useFormFieldState>) => ReactNode);
}

function useFormFieldState(props: FormFieldProps) {
  const generatedId = useId();
  const id = props.id ?? props.name ?? `field-${generatedId}`;

  // Try reading RHF context
  const rhf = useFormContext();
  const rhfError = props.name && rhf?.formState?.errors ? rhf.formState.errors[props.name] : undefined;

  const rawError = props.error ?? rhfError;
  const errorMessage = getErrorMessage(rawError as FieldError | string | boolean);
  const isError = Boolean(errorMessage || rawError);

  const labelId = `${id}-label`;
  const descriptionId = props.description ? `${id}-description` : '';
  const errorId = isError ? `${id}-error` : '';
  const successId = props.success ? `${id}-success` : '';
  const helperId = props.helperText ? `${id}-helper` : '';
  const characterCounterId = props.maxCharacterCount !== undefined ? `${id}-counter` : '';

  const describedByParts: string[] = [];
  if (descriptionId) describedByParts.push(descriptionId);
  if (helperId) describedByParts.push(helperId);
  if (errorId) describedByParts.push(errorId);
  if (successId) describedByParts.push(successId);
  if (characterCounterId) describedByParts.push(characterCounterId);

  const ariaDescribedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

  return {
    id,
    labelId,
    descriptionId,
    errorId,
    successId,
    helperId,
    characterCounterId,
    ariaDescribedBy,
    errorMessage,
    error: isError ? (errorMessage ?? true) : false,
    success: props.success,
    warning: props.warning,
    disabled: props.disabled,
    readOnly: props.readOnly,
    required: props.required,
    optional: props.optional,
    loading: props.loading,
  };
}

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(function FormField(props, ref) {
  const {
    name,
    label,
    description,
    helperText,
    helperIntent = 'muted',
    error: _error,
    success,
    warning: _warning,
    required,
    optional,
    disabled,
    readOnly,
    loading,
    characterCount,
    maxCharacterCount,
    orientation = 'vertical',
    labelAction,
    className,
    children,
    ...restProps
  } = props;

  const state = useFormFieldState(props);

  const fieldContextValue = { name, id: state.id };
  const itemContextValue = {
    id: state.id,
    labelId: state.labelId,
    descriptionId: state.descriptionId,
    errorId: state.errorId,
    successId: state.successId,
    helperId: state.helperId,
    characterCounterId: state.characterCounterId,
    error: state.error,
    success: state.success,
    warning: state.warning,
    disabled: state.disabled,
    readOnly: state.readOnly,
    required: state.required,
    optional: state.optional,
    loading: state.loading,
  };

  // Render child input control with injected context/props
  let controlNode: ReactNode = null;
  if (typeof children === 'function') {
    controlNode = children(state);
  } else if (isValidElement(children)) {
    const childElement = children as ReactElement<Record<string, unknown>>;
    // Inject aria attributes and IDs into child control if missing
    controlNode = cloneElement(childElement, {
      id: childElement.props.id ?? state.id,
      'aria-describedby': childElement.props['aria-describedby'] ?? state.ariaDescribedBy,
      'aria-invalid': childElement.props['aria-invalid'] ?? (state.error ? true : undefined),
      'aria-required': childElement.props['aria-required'] ?? (required ? true : undefined),
      disabled: childElement.props.disabled ?? disabled ?? loading,
      readOnly: childElement.props.readOnly ?? readOnly,

    });
  } else {
    controlNode = children;
  }

  const hasLabelHeader = label || labelAction || maxCharacterCount !== undefined;

  return (
    <FormFieldContext.Provider value={fieldContextValue}>
      <FormItemContext.Provider value={itemContextValue}>
        <div
          ref={ref}
          className={cn(
            'group flex w-full flex-col gap-1.5',
            orientation === 'horizontal' && 'sm:grid sm:grid-cols-3 sm:items-start sm:gap-4',
            className,
          )}
          {...restProps}
        >
          {/* Label Header */}
          {hasLabelHeader && (
            <div className="flex items-center justify-between gap-2">
              {label ? (
                <Label required={required} optional={optional}>
                  {label}
                </Label>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {labelAction}
                {maxCharacterCount !== undefined && characterCount !== undefined && (
                  <CharacterCounter current={characterCount} max={maxCharacterCount} />
                )}
              </div>
            </div>
          )}

          {/* Optional Description */}
          {description && (
            <p id={state.descriptionId} className="type-body-xs text-muted-foreground -mt-0.5">
              {description}
            </p>
          )}

          {/* Main Control Container */}
          <div className={cn('relative w-full p-1', orientation === 'horizontal' && 'sm:col-span-2')}>
            {controlNode}



            {/* Spinner overlay for loading state */}
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>

          {/* Helper & Feedback Messages Footer */}
          <div className="space-y-1">
            {helperText && !state.errorMessage && (
              <HelperText intent={helperIntent}>{helperText}</HelperText>
            )}

            {state.errorMessage && <ErrorMessage message={state.errorMessage} />}

            {!state.errorMessage && success && (
              <SuccessMessage message={typeof success === 'string' ? success : undefined} />
            )}
          </div>
        </div>
      </FormItemContext.Provider>
    </FormFieldContext.Provider>
  );
});
