import { forwardRef, type FormHTMLAttributes } from 'react';
import { FormProvider, type UseFormReturn } from 'react-hook-form';


import { cn } from '@/utils';

export interface FormProps
  extends FormHTMLAttributes<HTMLFormElement> {
  /** Optional React Hook Form methods object. If provided, wraps form in FormProvider. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  methods?: UseFormReturn<any>;
  /** Vertical spacing scale between top-level sections/groups inside the form. */
  spacing?: 'none' | 'sm' | 'md' | 'lg';
}

const spacingClasses = {
  none: '',
  sm: 'space-y-4',
  md: 'space-y-6',
  lg: 'space-y-8',
};

export const Form = forwardRef<HTMLFormElement, FormProps>(function Form(
  { methods, spacing = 'md', noValidate = true, className, children, ...props },
  ref,
) {

  const formElement = (
    <form
      ref={ref}
      noValidate={noValidate}
      className={cn('w-full', spacingClasses[spacing], className)}
      {...props}
    >
      {children}
    </form>
  );

  if (methods) {
    return <FormProvider {...methods}>{formElement}</FormProvider>;
  }

  return formElement;
});
