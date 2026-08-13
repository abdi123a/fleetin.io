import { createContext, useContext } from 'react';
import type { FieldError } from 'react-hook-form';

export interface FormFieldContextValue {
  name?: string;
  id?: string;
}

export interface FormItemContextValue {
  id: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
  successId: string;
  helperId: string;
  characterCounterId: string;
  error?: string | boolean;
  success?: string | boolean;
  warning?: string | boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  optional?: boolean;
  loading?: boolean;
}

export const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);
export const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

/**
 * Returns field state and context derived from FormField and optional React Hook Form context.
 */
export function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);

  if (!itemContext || (!itemContext.id && !fieldContext?.name)) {
    return {
      id: undefined,
      name: fieldContext?.name,
      formItemId: undefined,
      formLabelId: undefined,
      formDescriptionId: undefined,
      formErrorId: undefined,
      formSuccessId: undefined,
      formHelperId: undefined,
      formCharacterCounterId: undefined,
      error: undefined,
      success: undefined,
      warning: undefined,
      disabled: undefined,
      readOnly: undefined,
      required: undefined,
      optional: undefined,
      loading: undefined,
      ariaDescribedBy: undefined,
    };
  }

  const { id } = itemContext;

  const describedByParts: string[] = [];
  if (itemContext.descriptionId) describedByParts.push(itemContext.descriptionId);
  if (itemContext.helperId) describedByParts.push(itemContext.helperId);
  if (itemContext.errorId && itemContext.error) describedByParts.push(itemContext.errorId);
  if (itemContext.successId && itemContext.success) describedByParts.push(itemContext.successId);
  if (itemContext.characterCounterId) describedByParts.push(itemContext.characterCounterId);

  const ariaDescribedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formLabelId: itemContext.labelId,
    formDescriptionId: itemContext.descriptionId,
    formErrorId: itemContext.errorId,
    formSuccessId: itemContext.successId,
    formHelperId: itemContext.helperId,
    formCharacterCounterId: itemContext.characterCounterId,
    error: itemContext.error,
    success: itemContext.success,
    warning: itemContext.warning,
    disabled: itemContext.disabled,
    readOnly: itemContext.readOnly,
    required: itemContext.required,
    optional: itemContext.optional,
    loading: itemContext.loading,
    ariaDescribedBy,
  };
}

/** Helper to extract error message from RHF FieldError or string/boolean error prop */
export function getErrorMessage(error?: FieldError | string | boolean): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return undefined;
}
