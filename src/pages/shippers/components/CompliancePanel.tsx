import { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
} from '@/design-system/icons';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DescriptionItem,
  DescriptionList,
  IconButton,
  Input,
  LinearProgress,
  Select,
} from '@/design-system';
import { EmptyState } from '@/components';
import {
  calculateShipperCompletion,
  type ContactPerson,
  type ShipperDocument,
  type ShipperRecord,
} from '@/types/shipper';
import { formatDate } from '@/utils/format';
import { IconChip } from '@/design-system';

/**
 * The paperwork side of the account.
 *
 * Two columns with different jobs: the left is reference data someone reads
 * out loud (registration, address, who to call), the right is the compliance
 * position — what we hold, what is verified, and what is still missing.
 *
 * The panel this replaces closed with a "POD Compliance Score — 92.8% health,
 * 26 / 28 bookings" that no part of the domain model produces. An invented
 * number in a compliance panel is worse than no number: it is the one figure on
 * the page a reader would quote in a dispute. Profile completeness replaces it,
 * and it is computed from the record actually stored.
 */

export interface CompliancePanelProps {
  shipper: ShipperRecord;
  documents: ShipperDocument[];
  docFormOpen: boolean;
  onDocFormOpenChange: (open: boolean) => void;
  onAddDocument: (name: string, category: ShipperDocument['category']) => void;
  onViewDocument: (document: ShipperDocument) => void;
  onDownloadDocument: (document: ShipperDocument) => void;
  onDeleteDocument: (id: string) => void;
  onEdit: () => void;
}

const DOC_CATEGORIES: { value: ShipperDocument['category']; label: string }[] = [
  { value: 'Business License', label: 'Business License' },
  { value: 'Import/Export License', label: 'Import/Export License' },
  { value: 'Commercial Registration', label: 'Commercial Registration' },
  { value: 'Tax Certificate', label: 'Tax Certificate' },
  { value: 'Contract', label: 'Contract' },
  { value: 'Other', label: 'Other' },
];

export function CompliancePanel({
  shipper,
  documents,
  docFormOpen,
  onDocFormOpenChange,
  onAddDocument,
  onViewDocument,
  onDownloadDocument,
  onDeleteDocument,
  onEdit,
}: CompliancePanelProps) {
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState<ShipperDocument['category']>('Business License');

  const completion = calculateShipperCompletion(shipper);
  const contacts: ContactPerson[] = [shipper.primaryContact, ...(shipper.operationalContacts ?? [])];

  const submitDocument = () => {
    if (!docName.trim()) return;
    onAddDocument(docName, docCategory);
    setDocName('');
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      {/* ── Reference data ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:col-span-7">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              Registration & facilities
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onEdit} leadingIcon={<Pencil className="size-3.5" />}>
              Edit
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            <DescriptionList layout="grid" cols={3}>
              <DescriptionItem label="Legal entity" value={shipper.companyLegalName} />
              <DescriptionItem
                label="Registration no."
                value={<span className="type-mono">{shipper.registrationNumber}</span>}
              />
              <DescriptionItem label="Country" value={shipper.country} />
              <DescriptionItem label="Industry" value={shipper.industry} />
              <DescriptionItem label="Company scale" value={shipper.companySize} />
              <DescriptionItem label="Customer since" value={formatDate(shipper.registrationDate)} />
            </DescriptionList>

            <DescriptionItem
              label="Headquarters"
              icon={<MapPin />}
              value={`${shipper.address}, ${shipper.country}`}
              className="rounded-card-nested bg-surface-sunken p-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2">
              <User className="size-4 text-muted-foreground" aria-hidden />
              Contacts
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onEdit} leadingIcon={<Pencil className="size-3.5" />}>
              Edit
            </Button>
          </CardHeader>

          <CardContent>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <ContactCard contact={contact} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ── Compliance position ────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 lg:col-span-5">
        <Card>
          <CardHeader>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="inline-flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                Document vault
              </CardTitle>
              <p className="type-body-xs text-muted-foreground">
                {documents.filter((doc) => doc.status === 'Verified').length} of {documents.length}{' '}
                verified
              </p>
            </div>
            <Button
              variant={docFormOpen ? 'ghost' : 'outline'}
              size="sm"
              onClick={() => onDocFormOpenChange(!docFormOpen)}
              leadingIcon={docFormOpen ? undefined : <Plus className="size-3.5" />}
            >
              {docFormOpen ? 'Cancel' : 'Add'}
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            {docFormOpen && (
              <div className="space-y-2 rounded-card-nested border border-border bg-surface-sunken p-3">
                <Input
                  placeholder="File name, e.g. Business License 2026.pdf"
                  value={docName}
                  onChange={(event) => setDocName(event.target.value)}
                  aria-label="Document file name"
                />
                <Select
                  value={docCategory}
                  options={DOC_CATEGORIES}
                  onChange={(event) =>
                    setDocCategory(event.target.value as ShipperDocument['category'])
                  }
                  aria-label="Document category"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={submitDocument} disabled={!docName.trim()}>
                    Save document
                  </Button>
                </div>
              </div>
            )}

            {documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents held"
                description="Upload the business licence to start the compliance file."
                size="sm"
              />
            ) : (
              <ul className="divide-y divide-border">
                {/* Two lines per document: what the file is, then its standing
                    and provenance. Squeezing the status badge onto the title row
                    left the filename about forty pixels and truncated every
                    entry to "Import_Export_Permit_20…". */}
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <IconChip icon={FileText} tint="neutral" size={36} className="mt-0.5" />

                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className="truncate type-body-sm font-medium text-foreground"
                        title={doc.name}
                      >
                        {doc.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge
                          intent={
                            doc.status === 'Verified'
                              ? 'success'
                              : doc.status === 'Rejected'
                                ? 'destructive'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {doc.status === 'Verified' && <CheckCircle2 aria-hidden />}
                          {doc.status}
                        </Badge>
                        <span className="type-caption text-muted-foreground">
                          {doc.category} · {doc.fileSize} · {doc.uploadDate}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center">
                      <IconButton
                        aria-label={`View ${doc.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewDocument(doc)}
                      >
                        <Eye />
                      </IconButton>
                      <IconButton
                        aria-label={`Download ${doc.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownloadDocument(doc)}
                      >
                        <Download />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${doc.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteDocument(doc.id)}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile completeness</CardTitle>
            <span className="type-body-sm font-medium tabular-nums text-foreground">
              {completion.percentage}%
            </span>
          </CardHeader>

          <CardContent className="space-y-3">
            <LinearProgress
              value={completion.percentage}
              size="sm"
              status={completion.percentage === 100 ? 'success' : 'warning'}
              aria-label="Profile completeness"
            />
            <p className="type-caption text-muted-foreground">
              {completion.completedItemsCount} of {completion.totalItems} required fields held on
              file.
            </p>

            {completion.remainingFields.length > 0 && (
              <ul className="space-y-1.5">
                {completion.remainingFields.map((field) => (
                  <li key={field.id} className="type-body-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{field.label}</span> —{' '}
                    {field.description}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ContactCard({ contact }: { contact: ContactPerson }) {
  const initials = contact.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  return (
    <Card variant="flat" padding="sm" className="h-full gap-3">
      <div className="flex items-start gap-3">
        <span
          className={
            contact.isPrimary
              ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary type-body-xs text-primary-foreground'
              : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted type-body-xs text-muted-foreground'
          }
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate type-body-sm font-medium text-foreground">{contact.name}</p>
          <p className="truncate type-caption text-muted-foreground">{contact.title}</p>
        </div>
        {contact.isPrimary && (
          <Badge intent="primary" size="sm" className="shrink-0">
            Primary
          </Badge>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <a
          href={`tel:${contact.phone}`}
          className="flex items-center gap-2 type-mono text-foreground transition-colors hover:text-primary"
        >
          <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {contact.phone}
        </a>
        <a
          href={`mailto:${contact.email}`}
          className="flex items-center gap-2 type-body-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <Mail className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{contact.email}</span>
        </a>
      </div>
    </Card>
  );
}
