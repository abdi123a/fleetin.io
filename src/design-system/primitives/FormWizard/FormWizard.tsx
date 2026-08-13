import { Check } from '@/design-system/icons';

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from 'react';

import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils';

export interface FormStepItem {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
}

export interface FormWizardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Steps definition array. */
  steps: FormStepItem[];

  /** Active step index (0-indexed). Controlled mode. */
  activeStep?: number;
  /** Initial active step index. */
  defaultStep?: number;
  /** Callback when step changes. */
  onStepChange?: (stepIndex: number) => void;
  /** Callback on wizard finish/submit. */
  onFinish?: () => void;
  /** Optional validation function before advancing to next step. Returns boolean or Promise<boolean>. */
  onValidateStep?: (currentStepIndex: number) => boolean | Promise<boolean>;
  /** Step component render function or children steps array. */
  children?: (stepProps: { currentStep: number; isFirstStep: boolean; isLastStep: boolean; goNext: () => void; goBack: () => void }) => ReactNode;
}

export const FormWizard = forwardRef<HTMLDivElement, FormWizardProps>(function FormWizard(
  {
    steps,
    activeStep: propActiveStep,
    defaultStep = 0,
    onStepChange,
    onFinish,
    onValidateStep,
    className,
    children,
    ...props
  },
  ref,
) {
  const [internalStep, setInternalStep] = useState(defaultStep);

  const currentStepIndex = propActiveStep !== undefined ? propActiveStep : internalStep;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleSetStep = (index: number) => {
    setInternalStep(index);
    onStepChange?.(index);
  };

  const goNext = async () => {
    if (onValidateStep) {
      const isValid = await onValidateStep(currentStepIndex);
      if (!isValid) return;
    }
    if (!isLastStep) {
      handleSetStep(currentStepIndex + 1);
    } else {
      onFinish?.();
    }
  };

  const goBack = () => {
    if (!isFirstStep) {
      handleSetStep(currentStepIndex - 1);
    }
  };

  return (
    <div ref={ref} className={cn('w-full space-y-8', className)} {...props}>
      {/* Step Progress Stepper Bar Header */}
      <div className="relative w-full">
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;

            return (
              <div key={step.id} className="relative flex flex-1 items-center">
                {/* Connecting Line between steps */}
                {idx > 0 && (
                  <div
                    className={cn(
                      'absolute left-[-50%] right-[50%] top-4 h-0.5 -translate-y-1/2 transition-colors duration-300',
                      idx <= currentStepIndex ? 'bg-primary' : 'bg-border',
                    )}
                  />
                )}

                {/* Step Circle & Titles */}
                <button
                  type="button"
                  onClick={() => idx < currentStepIndex && handleSetStep(idx)}
                  disabled={idx > currentStepIndex}
                  className="group relative z-10 flex flex-col items-center mx-auto text-center cursor-pointer disabled:cursor-not-allowed"
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 type-body-sm transition-all',
                      isCompleted
                        ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                        : isActive
                          ? 'border-primary bg-surface text-primary shadow-xs ring-4 ring-primary-subtle'
                          : 'border-border bg-surface-sunken text-muted-foreground',
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4 stroke-[3]" /> : idx + 1}
                  </div>

                  <div className="mt-2 space-y-0.5">
                    <p
                      className={cn(
                        'type-body-xs transition-colors',
                        isActive ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {step.title}
                    </p>
                    {step.description && (
                      <p className="hidden sm:block type-caption text-muted-foreground">{step.description}</p>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Render Area & Controls */}
      <div className="w-full">
        {typeof children === 'function'
          ? children({ currentStep: currentStepIndex, isFirstStep, isLastStep, goNext, goBack })
          : children}
      </div>

      {/* Default Navigation Actions Bar */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={goBack} disabled={isFirstStep}>
          Back
        </Button>
        <Button variant="primary" onClick={goNext}>
          {isLastStep ? 'Complete & Submit' : 'Next Step'}
        </Button>
      </div>
    </div>
  );
});
