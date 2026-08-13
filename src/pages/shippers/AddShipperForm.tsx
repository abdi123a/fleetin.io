import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  User,
  MapPin,
  FileText,
  Upload,
  Paperclip,
  Trash2,
  Plus,
  Eye,
  Download,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { Check } from 'lucide-react';
import { Badge, Button, Checkbox, Input, Select } from '@/design-system';
import { useCreateDocumentType, useDocumentTypes } from '@/features/documents/api/queries';

import { getCountryOptions } from '@/data/geoData';
import type {
  CompanySize,
  ApprovalStatus,
  ShipperDocument,
} from '@/types/shipper';
import { cn } from '@/utils';

export interface ShipperFormData {
  companyLegalName: string;
  registrationNumber?: string;
  industry?: string;
  companySize: CompanySize;
  approvalStatus: ApprovalStatus;

  // Simple Location
  country: string;
  address: string;

  // Primary Executive Contact
  primaryContactName: string;
  primaryContactTitle: string;
  primaryContactEmail: string;
  primaryContactPhone: string;

  // Compliance Documents Vault
  uploadedDocuments: ShipperDocument[];
  /** Real file bytes for any not-yet-persisted upload, keyed by document category — uploaded to the backend after the shipper record exists. */
  stagedFiles: Record<string, File>;
  logo: File | null;
  logoUrl?: string;
}

export interface AddShipperFormProps {
  initialData?: Partial<ShipperFormData>;
  isEdit?: boolean;
  onSuccess?: (data: ShipperFormData) => void;
  onCancel?: () => void;
}

const SIZE_OPTIONS = [
  { value: 'Micro (1-10)', label: 'Micro (1-10 employees)' },
  { value: 'Small (11-50)', label: 'Small (11-50 employees)' },
  { value: 'Medium (51-250)', label: 'Medium (51-250 employees)' },
  { value: 'Large (251-1000)', label: 'Large (251-1000 employees)' },
  { value: 'Enterprise (1000+)', label: 'Enterprise (1000+ employees)' },
];

interface StepDef {
  id: number;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: [StepDef, ...StepDef[]] = [
  {
    id: 1,
    title: 'Company Info & Contact Person',
    shortTitle: 'Company & Contact',
    description: 'Basic business details, operating location, primary executive contact & logo.',
    icon: Building2,
  },
  {
    id: 2,
    title: 'Compliance Documents',
    shortTitle: 'Documents',
    description: 'Upload required compliance files (Business License, etc.).',
    icon: FileText,
  },
];

export function AddShipperForm({ initialData, isEdit = false, onSuccess, onCancel }: AddShipperFormProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const [formData, setFormData] = useState<ShipperFormData>({
    companyLegalName: initialData?.companyLegalName || '',
    registrationNumber: initialData?.registrationNumber || '',
    industry: initialData?.industry || 'Logistics & Freight',
    companySize: (initialData?.companySize as CompanySize) || 'Medium (51-250)',
    approvalStatus: (initialData?.approvalStatus as ApprovalStatus) || 'Verified',

    country: initialData?.country || 'Djibouti',
    address: initialData?.address || '',

    primaryContactName: initialData?.primaryContactName || '',
    primaryContactTitle: initialData?.primaryContactTitle || 'Logistics Manager',
    primaryContactEmail: initialData?.primaryContactEmail || '',
    primaryContactPhone: initialData?.primaryContactPhone || '',

    uploadedDocuments: initialData?.uploadedDocuments || [],
    stagedFiles: {},

    logo: initialData?.logo || null,
    logoUrl: initialData?.logoUrl,
  });

  // Document-type catalog — shared across every shipper registration via the
  // backend, not just this form instance.
  const { data: docTypes = [] } = useDocumentTypes('SHIPPER');
  const createDocType = useCreateDocumentType('SHIPPER');

  const [showAddDocType, setShowAddDocType] = useState(false);
  const [newDocTypeLabel, setNewDocTypeLabel] = useState('');
  const [newDocTypeRequired, setNewDocTypeRequired] = useState(true);

  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.logoUrl || null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ companyLegalName?: string; primaryContactPhone?: string; documents?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        uploadedDocuments: initialData.uploadedDocuments || prev.uploadedDocuments,
      }));
      if (initialData.logoUrl) {
        setLogoPreview(initialData.logoUrl);
      }
    }
  }, [initialData]);

  const countryOptions = useMemo(() => getCountryOptions(), []);

  const handleInputChange = <K extends keyof ShipperFormData>(field: K, value: ShipperFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, logo: file, logoUrl: objectUrl }));
      setLogoName(file.name);
      setLogoPreview(objectUrl);
    }
  };

  /** Defines a new document type — saved to the catalog, so it shows up as
   *  an upload slot for every shipper registered after this one. */
  const handleAddDocumentType = () => {
    if (!newDocTypeLabel.trim()) return;
    createDocType.mutate({ label: newDocTypeLabel, required: newDocTypeRequired });
    setNewDocTypeLabel('');
    setNewDocTypeRequired(true);
    setShowAddDocType(false);
  };

  // The document-type catalog is backend-driven and open-ended (an admin can
  // add any label), while ShipperDocument['category'] is still typed as a
  // closed union from the mock-data era — treat it as the open string it
  // actually is at runtime, same as the rest of the codebase already does.
  const handleUploadForType = (category: string, file: File) => {
    const newDoc: ShipperDocument = {
      id: `staged-${Date.now()}`,
      name: file.name,
      category: category as ShipperDocument['category'],
      uploadDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      status: 'Pending Review',
    };

    setFormData((prev) => ({
      ...prev,
      uploadedDocuments: [...prev.uploadedDocuments.filter((d) => d.category !== category), newDoc],
      stagedFiles: { ...prev.stagedFiles, [category]: file },
    }));
    if (errors.documents) {
      setErrors((prev) => ({ ...prev, documents: undefined }));
    }
  };

  const handleRemoveDocument = (docId: string) => {
    setFormData((prev) => ({
      ...prev,
      uploadedDocuments: prev.uploadedDocuments.filter((d) => d.id !== docId),
    }));
  };

  /** A staged (not-yet-persisted) upload has no backend document id to download from — use the local File directly. */
  const handleDownloadDocument = (doc: ShipperDocument) => {
    const stagedFile = formData.stagedFiles[doc.category];
    if (stagedFile) {
      const url = URL.createObjectURL(stagedFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    void triggerDocumentDownload(doc.id, doc.name);
  };

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: { companyLegalName?: string; documents?: string } = {};

    if (stepNumber === 1) {
      if (!formData.companyLegalName.trim()) {
        newErrors.companyLegalName = 'Company Legal Name is required';
      }
    }

    if (stepNumber === 2) {
      const missing = docTypes.filter(
        (type) => type.required && !formData.uploadedDocuments.some((d) => d.category === type.label),
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
      onSuccess?.(formData);
    }, 500);
  };

  const currentStepDef: StepDef = STEPS[currentStep - 1] ?? STEPS[0];
  const StepIcon = currentStepDef.icon;

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      {/* Sticky Header */}
      <div className="shrink-0 space-y-4 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
        <div className="space-y-1 pr-8">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">
            {isEdit ? 'Edit Shipper Profile' : 'New Shipper Onboarding'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {currentStepDef.description}
          </p>
        </div>

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
      </div>

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

        {/* STEP 1: COMPANY INFO & CONTACT PERSON */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Basic Business Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                Company Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="companyLegalName" className="block type-caption font-medium text-foreground">
                    Company Legal Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="companyLegalName"
                    type="text"
                    value={formData.companyLegalName}
                    placeholder="e.g. AMINA FZCO"
                    onChange={(e) => handleInputChange('companyLegalName', e.target.value)}
                    hasError={Boolean(errors.companyLegalName)}
                  />
                  {errors.companyLegalName && (
                    <p className="type-caption text-destructive">{errors.companyLegalName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="company-size-select" className="block type-caption font-medium text-foreground">
                    Company Size <span className="text-destructive">*</span>
                  </label>
                  <Select
                    id="company-size-select"
                    value={formData.companySize}
                    placeholder="Select Size"
                    options={SIZE_OPTIONS}
                    onChange={(e) => handleInputChange('companySize', e.target.value as CompanySize)}
                  />
                </div>
              </div>
            </div>

            {/* Simplified Location Section */}
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
                    placeholder="Select Country"
                    options={countryOptions}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="address" className="block type-caption font-medium text-foreground">
                    Address <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="address"
                    type="text"
                    value={formData.address}
                    placeholder="e.g. PK12 Free Zone Commercial Complex"
                    onChange={(e) => handleInputChange('address', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Primary Executive Contact */}
            <div className="space-y-4 pt-4 border-t border-border/60">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" />
                Primary Executive Contact
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="primaryContactName" className="block type-caption font-medium text-foreground">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="primaryContactName"
                    type="text"
                    value={formData.primaryContactName}
                    placeholder="e.g. Mohamed Amin"
                    onChange={(e) => handleInputChange('primaryContactName', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="primaryContactTitle" className="block type-caption font-medium text-foreground">
                    Title / Role
                  </label>
                  <Input
                    id="primaryContactTitle"
                    type="text"
                    value={formData.primaryContactTitle}
                    placeholder="e.g. Chief Logistics Officer"
                    onChange={(e) => handleInputChange('primaryContactTitle', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="primaryContactEmail" className="block type-caption font-medium text-foreground">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="primaryContactEmail"
                    type="email"
                    value={formData.primaryContactEmail}
                    placeholder="e.g. m.amin@amina-fzco.dj"
                    onChange={(e) => handleInputChange('primaryContactEmail', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="primaryContactPhone" className="block type-caption font-medium text-foreground">
                    Phone / WhatsApp <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="primaryContactPhone"
                    type="text"
                    value={formData.primaryContactPhone}
                    placeholder="e.g. +253 77 81 92 01"
                    onChange={(e) => handleInputChange('primaryContactPhone', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Company Brand Logo */}
            <div className="space-y-2 pt-3 border-t border-border/60">
              <label className="block type-caption font-medium text-foreground">
                Company Brand Logo
              </label>
              <label className="relative flex items-center justify-between gap-3 rounded-lg border border-border/90 bg-surface px-4 py-3 hover:border-primary transition-colors cursor-pointer w-full">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-md border border-border/80 bg-muted/30 flex items-center justify-center overflow-hidden">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="type-body-sm font-medium text-foreground">
                      {logoName || (logoPreview ? 'Logo uploaded' : 'Upload Company Logo')}
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
        )}

        {/* STEP 2: COMPLIANCE DOCUMENTS */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-primary" />
                  Shipper Compliance Documents
                </h4>
                <p className="type-caption text-muted-foreground mt-0.5">
                  Upload a file for each document type below. New types you define here are saved and
                  reused for every shipper registered after this one.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddDocType((prev) => !prev)}
                leadingIcon={<Plus className="h-3.5 w-3.5" />}
                className="text-xs font-semibold rounded-full shrink-0"
              >
                {showAddDocType ? 'Cancel' : 'Add Document Type'}
              </Button>
            </div>

            {errors.documents && (
              <p className="type-caption text-destructive">{errors.documents}</p>
            )}

            {/* Add document type box */}
            {showAddDocType && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in">
                <h5 className="text-xs font-bold text-primary">New Document Type</h5>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-center">
                  <Input
                    placeholder="Document name (e.g. Import/Export License)"
                    value={newDocTypeLabel}
                    onChange={(e) => setNewDocTypeLabel(e.target.value)}
                  />
                  <Checkbox
                    label="Required document"
                    checked={newDocTypeRequired}
                    onChange={(e) => setNewDocTypeRequired(e.target.checked)}
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddDocumentType}
                    disabled={!newDocTypeLabel.trim()}
                    className="bg-primary text-primary-foreground font-semibold text-xs rounded-full px-4"
                  >
                    Save Document Type
                  </Button>
                </div>
              </div>
            )}

            {/* Document Type List — one compact row per type */}
            <div className="space-y-1.5">
              {docTypes.map((type) => {
                const existing = formData.uploadedDocuments.find((d) => d.category === type.label);
                return (
                  <div
                    key={type.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
                      existing ? 'border-success/30 bg-success-subtle/40' : 'border-border/70 bg-card hover:border-primary/40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        existing ? 'border-success bg-success text-success-foreground' : 'border-border-strong text-transparent'
                      )}
                      aria-hidden
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>

                    <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground truncate">{type.label}</span>
                      {existing ? (
                        <span className="text-2xs text-muted-foreground truncate">
                          {existing.name} · {existing.fileSize}
                        </span>
                      ) : (
                        <Badge intent={type.required ? 'warning' : 'default'} size="sm">
                          {type.required ? 'Required' : 'Optional'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {existing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setViewingDoc(existing)}
                            className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                            title="View Document"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(existing)}
                            className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                            title="Download Document"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDocument(existing.id)}
                            className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            title="Remove file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-dashed border-primary/40 bg-primary/5 text-primary text-2xs font-semibold hover:bg-primary/10 transition-colors cursor-pointer shrink-0">
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadForType(type.label, file);
                            }}
                          />
                          <Upload className="h-3 w-3" />
                          <span>Upload</span>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}

              {docTypes.length === 0 && (
                <div className="p-6 rounded-lg border border-dashed border-border/80 text-center text-xs text-muted-foreground">
                  No document types yet. Click &quot;Add Document Type&quot; to create the first one.
                </div>
              )}
            </div>
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

export default AddShipperForm;
