import { SheetHeading } from '@/components/common';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  FileText,
  Upload,
  User,
  MapPin,
  Paperclip,
  Percent,
} from '@/design-system/icons';
import { Check } from 'lucide-react';
import { Button, Input, Select } from '@/design-system';
import { PARTNER_STATUS_OPTIONS } from '@/components/common';
import { CommissionFields, type CommissionMode } from '@/features/finance';
import { getCountryOptions } from '@/data/geoData';
import { useLocations } from '@/features/locations';
import { DocumentChecklist } from '@/features/documents/components/DocumentChecklist';
import type { DocumentCapture } from '@/features/documents/components/DocumentCaptureDialog';
import { documentCatalogFor, type DocumentTypeSpec } from '@/features/documents/catalog';
import { useStagedDocuments, type StagedDocument } from '@/features/documents/stagedDocuments';
import type {
  PartnerStatus,
  PartnerDocument,
} from '@/types/partner';
import { cn } from '@/utils';
import { DocumentViewerModal } from '@/components/DocumentViewerModal';

// ─── Form Data Shape ─────────────────────────────────────────────────────────

export interface PartnerFormData {
  companyLegalName: string;
  country: string;
  address: string;
  /** Catalogue location id of the garage, or '' for none. */
  garageLocationId?: string;
  operatingRegions: string;     // comma-separated
  serviceCategories: string;    // comma-separated
  fleetSize: string;
  vehicleTypes: string;         // comma-separated
  partnerStatus: PartnerStatus;

  /* The deal — see `CommissionFields`. `commissionMode` null means no special
     deal and the house rate applies; it is the mode, never the amount, that
     says a deal exists. */
  commissionMode: CommissionMode | null;
  commissionPct: number | null;
  commissionFixedAmount: number | null;

  // Primary Dispatcher
  primaryDispatcherName: string;
  primaryDispatcherTitle: string;
  primaryDispatcherPhone: string;
  primaryDispatcherEmail: string;

  // Documents
  uploadedDocuments: PartnerDocument[];
  /** Real file bytes for any not-yet-persisted upload, keyed by document category — uploaded to the backend after the partner record exists. */
  /** The papers filed during onboarding, with their dates — written once the
   *  transporter has an id. See `useStagedDocuments`. */
  stagedDocuments: StagedDocument[];
  /** The picked file, for the page to upload once the partner has an id. */
  logo?: File | null;
  logoUrl?: string;

  // Optional legacy fields maintained for backwards compat
  registrationNumber?: string;
  businessLicenseNumber?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  currency?: string;
}

export interface AddPartnerFormProps {
  initialData?: Partial<PartnerFormData>;
  isEdit?: boolean;
  onSuccess?: (data: PartnerFormData) => void;
  onCancel?: () => void;
}

interface StepDef {
  id: number;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The account ladder, in the order the list's tabs show it — see
    `@/components/common/AccountStatus`, which owns the same four states. */
const STATUS_OPTIONS = PARTNER_STATUS_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

const STEPS: [StepDef, ...StepDef[]] = [
  {
    id: 1,
    title: 'Company & Fleet Info',
    shortTitle: 'Company Info',
    description: 'Transporter legal name, address & primary dispatcher contact.',
    icon: Building2,
  },
  {
    id: 2,
    title: 'Compliance Documents',
    shortTitle: 'Document',
    description: 'Required compliance documents.',
    icon: FileText,
  },
];

const DEFAULT_FORM: PartnerFormData = {
  companyLegalName: '',
  country: 'Djibouti',
  address: '',
  operatingRegions: '',
  serviceCategories: '',
  fleetSize: '',
  vehicleTypes: '',
  partnerStatus: 'Pending',
  commissionMode: null,
  commissionPct: null,
  commissionFixedAmount: null,
  primaryDispatcherName: '',
  primaryDispatcherTitle: 'Fleet Dispatcher',
  primaryDispatcherPhone: '',
  primaryDispatcherEmail: '',
  uploadedDocuments: [],
  stagedDocuments: [],
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AddPartnerForm({ initialData, isEdit = false, onSuccess, onCancel }: AddPartnerFormProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.logoUrl ?? null);
  const [logoName, setLogoName] = useState<string | null>(null);

  /**
   * Pick a brand mark for this transporter.
   *
   * The upload route and its mutation both existed — `/partners/:id/logo` and
   * `useUploadPartnerLogo` — and nothing in the UI ever called them, so a
   * transporter could not be given a logo at all while every shipper could.
   * The file is held on the form and uploaded by the page once the record has
   * an id, exactly as `AddShipperForm` does it.
   */
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, logo: file, logoUrl: objectUrl }));
    setLogoName(file.name);
    setLogoPreview(objectUrl);
  };

  const [formData, setFormData] = useState<PartnerFormData>({
    ...DEFAULT_FORM,
    ...initialData,
    uploadedDocuments: initialData?.uploadedDocuments || DEFAULT_FORM.uploadedDocuments,
  });

  /**
   * One paper, and it is the only one asked for here.
   *
   * A transporter is onboarded with its business licence and its logo. Its
   * grey cards and insurance certificates belong to its trucks and its
   * licences to its drivers, so they are asked for when those records are
   * created — asking for them on the company was what let a haulier with
   * forty trucks prove its fleet's registration with a single file.
   */
  const docs = useStagedDocuments();

  const [errors, setErrors] = useState<{ companyLegalName?: string; primaryDispatcherPhone?: string; documents?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<PartnerDocument | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        uploadedDocuments: initialData.uploadedDocuments || prev.uploadedDocuments,
      }));
    }
  }, [initialData]);

  const countryOptions = useMemo(() => getCountryOptions(), []);

  /* The garage is picked from the catalogue, never typed: Fleetin Impact
     measures `Free Zone → Garage → Port` from it, and only a pin can be
     measured to. Yards and depots first — that is what a garage is — but any
     place is allowed, because a carrier occasionally bases its trucks at a
     customer's site. */
  const { data: locations } = useLocations();
  const garageOptions = useMemo(() => {
    const rank = (kind: string) => (kind === 'yard' ? 0 : kind === 'depot' ? 1 : 2);
    return (locations ?? [])
      .filter((location) => location.active || location.id === formData.garageLocationId)
      .sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name))
      .map((location) => ({ value: location.id, label: location.name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, formData.garageLocationId]);

  /* What is already on file, with anything staged this session on top of it —
     re-filing a licence in edit mode shows the new one, not the old. */
  const documentRows = useMemo(
    () => [
      ...formData.uploadedDocuments.filter(
        (doc) => !docs.rows.some((staged) => staged.category === doc.category),
      ),
      ...docs.rows,
    ],
    [formData.uploadedDocuments, docs.rows],
  );

  const handleInputChange = <K extends keyof PartnerFormData>(field: K, value: PartnerFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleUploadForType = (spec: DocumentTypeSpec, capture: DocumentCapture) => {
    docs.stage(spec, capture);
    if (errors.documents) {
      setErrors((prev) => ({ ...prev, documents: undefined }));
    }
  };

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: { companyLegalName?: string; documents?: string } = {};

    if (stepNumber === 1) {
      if (!formData.companyLegalName.trim()) {
        newErrors.companyLegalName = 'Company Legal Name is required';
      }
    }

    if (stepNumber === 2) {
      const missing = documentCatalogFor('PARTNER').filter(
        (type) => type.required && !docs.rows.some((d) => d.category === type.label),
      );
      if (missing.length > 0) {
        newErrors.documents = `Missing required document${missing.length > 1 ? 's' : ''}: ${missing
          .map((type) => type.label)
          .join(', ')}`;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCompletedSteps((prev) => Array.from(new Set([...prev, currentStep])));
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleStepClick = (stepId: number) => {
    if (stepId < currentStep || completedSteps.includes(stepId - 1) || validateStep(currentStep)) {
      setCurrentStep(stepId);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validateStep(1)) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep(2)) {
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      onSuccess?.({ ...formData, stagedDocuments: docs.staged });
    }, 500);
  };

  const currentStepDef: StepDef = STEPS[currentStep - 1] ?? STEPS[0];
  const StepIcon = currentStepDef.icon;

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      {/* Sticky Header */}
      <SheetHeading
        title={isEdit ? 'Edit Transporter Profile' : 'New Transporter Onboarding'}
        description={currentStepDef.description}
      >

        {/* Step Nav */}
        <div className="flex items-center">
          {STEPS.map((step, idx) => {
            const isCurrent = step.id === currentStep;
            const isCompleted = completedSteps.includes(step.id);
            const isLast = idx === STEPS.length - 1;
            return (
              <div key={step.id} className={cn('flex items-center', !isLast && 'flex-1')}>
                <button
                  type="button"
                  onClick={() => handleStepClick(step.id)}
                  className="flex cursor-pointer flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                      isCurrent
                        ? 'bg-primary text-primary-foreground ring-4 ring-primary/15'
                        : isCompleted
                          ? 'bg-primary text-primary-foreground'
                          : 'border-2 border-border bg-surface text-muted-foreground',
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4 stroke-[3]" /> : step.id}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-[11px] font-semibold leading-none',
                      isCurrent || isCompleted ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {step.shortTitle}
                  </span>
                </button>
                {!isLast && (
                  <div
                    className={cn(
                      'mx-2 h-0.5 flex-1 rounded-full transition-colors',
                      isCompleted ? 'bg-primary' : 'bg-border',
                    )}
                    style={{ marginBottom: '18px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </SheetHeading>

      {/* Scrollable Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
      {/* Active Form Section Container */}
      <div key={currentStep} className="rounded-lg border border-border/60 bg-card p-5 sm:p-6 shadow-2xs space-y-6 min-h-[360px]">
        {/* Step Title Header */}
        <div className="flex items-start gap-3 pb-4 border-b border-border/40">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <StepIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="type-h3 text-foreground font-semibold">{currentStepDef.title}</h3>
            <p className="type-caption text-muted-foreground mt-0.5">{currentStepDef.description}</p>
          </div>
        </div>

        {/* STEP 1: COMBINED COMPANY, FLEET & DISPATCHER CONTACT INFO */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Section 1: Company Legal Identity */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                Company Details
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="companyLegalName" className="block type-caption font-medium text-foreground">
                    Company Legal Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="companyLegalName"
                    type="text"
                    value={formData.companyLegalName}
                    placeholder="e.g. Red Sea Express Ltd"
                    onChange={(e) => handleInputChange('companyLegalName', e.target.value)}
                    hasError={Boolean(errors.companyLegalName)}
                  />
                  {errors.companyLegalName && (
                    <p className="type-caption text-destructive">{errors.companyLegalName}</p>
                  )}
                </div>

                {/* The account's standing. It was in this form's state all
                    along but had no control, so a transporter could only be
                    created at one status and never moved off it — the reason
                    the list's own Suspended tab could never be reached. The
                    whole ladder in a plain select, the house idiom for a
                    status picker. */}
                <div className="space-y-1.5">
                  <label htmlFor="partner-status-select" className="block type-caption font-medium text-foreground">
                    Account Status
                  </label>
                  <Select
                    id="partner-status-select"
                    value={formData.partnerStatus}
                    options={STATUS_OPTIONS}
                    onChange={(e) => handleInputChange('partnerStatus', e.target.value as PartnerStatus)}
                  />
                </div>
              </div>

              {/* What Fleetin keeps when this haulier carries the job. Sits with
                  the account's standing rather than in a finance screen: it is
                  a term of the relationship, agreed when the account is. The
                  client's own deal outranks it — see `resolveCommission`. */}
              <div className="space-y-4 pt-4 border-t border-border/60">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-primary" />
                  Commission
                </h4>
                <CommissionFields
                  idPrefix="partner"
                  counterparty="transporter"
                  value={{
                    commissionMode: formData.commissionMode,
                    commissionPct: formData.commissionPct,
                    commissionFixedAmount: formData.commissionFixedAmount,
                  }}
                  onChange={(next) => setFormData((prev) => ({ ...prev, ...next }))}
                />
                <p className="type-body-xs text-muted-foreground">
                  A deal on the client&rsquo;s own account takes priority over this one.
                </p>
              </div>
            </div>

            {/* Section 2: Physical Location */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Physical Address & Location
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="country-select" className="block type-caption font-medium text-foreground">
                    Country <span className="text-destructive">*</span>
                  </label>
                  <Select
                    id="country-select"
                    value={formData.country}
                    options={countryOptions}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="address" className="block type-caption font-medium text-foreground">
                    Headquarters Address
                  </label>
                  <Input
                    id="address"
                    type="text"
                    value={formData.address}
                    placeholder="e.g. Zone Industrielle, Djibouti City"
                    onChange={(e) => handleInputChange('address', e.target.value)}
                  />
                </div>
              </div>

              {/* Where the trucks sleep. The one fact Fleetin Impact cannot
                  read off a booking: the garage a truck would have gone back
                  to between two jobs, and so the length of the round trip a
                  realized match saved. */}
              <div className="space-y-1.5">
                <label htmlFor="garage-select" className="block type-caption font-medium text-foreground">
                  Garage
                </label>
                <Select
                  id="garage-select"
                  value={formData.garageLocationId ?? ''}
                  placeholder="No garage recorded"
                  options={garageOptions}
                  onChange={(e) => handleInputChange('garageLocationId', e.target.value)}
                />
              </div>

              {/* Brand mark. Every named transporter in the app is drawn with
                  its logo — the queue, the recommendation panel, the dossier —
                  so this is where that artwork comes from. */}
              <div className="space-y-1.5">
                <label className="block type-caption font-medium text-foreground">
                  Company Brand Logo
                </label>
                <label className="relative flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/90 bg-surface px-4 py-3 transition-colors hover:border-primary">
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/80 bg-muted/30">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                      ) : (
                        <Upload className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="type-body-sm font-medium text-foreground">
                        {logoName || (logoPreview ? 'Logo uploaded' : 'Upload company logo')}
                      </span>
                      <span className="type-caption text-muted-foreground">PNG, JPG up to 5MB</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 type-body-sm font-medium text-primary hover:text-primary-hover">
                    <span>{logoName || (logoPreview ? 'Change' : 'Upload')}</span>
                    <Paperclip className="h-4 w-4" />
                  </div>
                </label>
              </div>
            </div>

            {/* Section 3: Primary Dispatcher Contact */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Primary Dispatcher Contact
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="primaryDispatcherName" className="block type-caption font-medium text-foreground">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="primaryDispatcherName"
                    type="text"
                    value={formData.primaryDispatcherName}
                    placeholder="e.g. Omar Hassan Ali"
                    onChange={(e) => handleInputChange('primaryDispatcherName', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="primaryDispatcherTitle" className="block type-caption font-medium text-foreground">
                    Title / Role
                  </label>
                  <Input
                    id="primaryDispatcherTitle"
                    type="text"
                    value={formData.primaryDispatcherTitle}
                    placeholder="e.g. Fleet Operations Manager"
                    onChange={(e) => handleInputChange('primaryDispatcherTitle', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="primaryDispatcherPhone" className="block type-caption font-medium text-foreground">
                    Phone / WhatsApp <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="primaryDispatcherPhone"
                    type="text"
                    value={formData.primaryDispatcherPhone}
                    placeholder="e.g. +253 77 81 12 01"
                    onChange={(e) => handleInputChange('primaryDispatcherPhone', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="primaryDispatcherEmail" className="block type-caption font-medium text-foreground">
                    Email Address
                  </label>
                  <Input
                    id="primaryDispatcherEmail"
                    type="email"
                    value={formData.primaryDispatcherEmail}
                    placeholder="e.g. omar@company.dj"
                    onChange={(e) => handleInputChange('primaryDispatcherEmail', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: THE COMPANY'S ONE PAPER */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h4 className="type-h4 flex items-center gap-2 font-semibold text-foreground">
                <FileText className="h-4.5 w-4.5 text-primary" />
                Business License
              </h4>
            </div>

            {errors.documents && <p className="type-caption text-destructive">{errors.documents}</p>}

            {/* One row, and it is the whole step.
             *
             * The catalog is closed (`documentCatalogFor`), so this is not a
             * list that grows: a transporter's compliance is its licence to
             * trade. The trucks' grey cards and insurance, and the drivers'
             * licences, are asked for on the trucks and the drivers — which is
             * where they can actually be kept current. */}
            <DocumentChecklist
              ownerType="PARTNER"
              documents={documentRows}
              subject={formData.companyLegalName || undefined}
              onUpload={handleUploadForType}
              onRemove={docs.remove}
              onView={(doc) => setViewingDoc(doc as PartnerDocument)}
            />
          </div>
        )}
      </div>
      </div>

      {/* Footer Controls */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={currentStep > 1 ? handleBack : onCancel}
          className="rounded-lg"
        >
          {currentStep > 1 ? 'Back' : 'Cancel'}
        </Button>

        {currentStep < STEPS.length ? (
          <Button
            type="button"
            size="sm"
            onClick={handleNext}
            className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            isLoading={isSubmitting}
            onClick={() => handleSubmit()}
            className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          >
            {isEdit ? 'Save' : 'Register'}
          </Button>
        )}
      </div>

      <DocumentViewerModal open={Boolean(viewingDoc)} onOpenChange={(open) => !open && setViewingDoc(null)} document={viewingDoc} />
    </form>
  );
}

export default AddPartnerForm;
