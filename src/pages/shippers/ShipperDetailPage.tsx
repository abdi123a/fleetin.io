import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, X } from '@/design-system/icons';
import { Card, IconButton, Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';
import {
  DocumentViewerModal,
  type DocumentToView,
} from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { ROUTES, buildPath } from '@/config/routes';
import { useShipperAccount, type ShipmentFilterKey } from '@/features/shipper-bi';
import type { ShipperDocument } from '@/types/shipper';
import { useShipper, useUpdateShipper, useUploadShipperLogo, shipperQueryKeys } from '@/features/shippers/api/queries';
import { deleteDocument, uploadDocument } from '@/features/documents/api/documentsService';
import { useAuthStore } from '@/stores';
import { useBreadcrumbLabel } from '@/hooks/useBreadcrumbLabel';
import { AddShipperForm, type ShipperFormData } from './AddShipperForm';
import { ShipperAnalyticsSuite } from '@/pages/analytics';
import {
  AccountHealthStrip,
  AttentionRail,
  CompliancePanel,
  ShipmentsPanel,
  ShipperIdentityHeader,
  ShipperTabNav,
  type ShipperTabKey,
} from './components';

export function ShipperDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  // For Shipper user, default to their own shipperId
  const isShipperUser = user?.role === 'SHIPPER' || user?.role === 'CLIENT';
  const shipperId = isShipperUser ? user?.shipperId : (id ?? user?.shipperId);

  const tabParam = searchParams.get('tab') as ShipperTabKey | null;
  const [activeTab, setActiveTab] = useState<ShipperTabKey>(
    tabParam && ['analytics', 'shipments', 'profile'].includes(tabParam) ? tabParam : 'shipments'
  );

  useEffect(() => {
    if (tabParam && ['analytics', 'shipments', 'profile'].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setActiveTab('shipments');
    }
  }, [tabParam]);

  const handleTabChange = (newTab: ShipperTabKey) => {
    setActiveTab(newTab);
    setSearchParams((prev) => {
      prev.set('tab', newTab);
      return prev;
    }, { replace: true });
  };

  const [shipmentFilter, setShipmentFilter] = useState<ShipmentFilterKey | undefined>(undefined);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);
  const [isDocFormOpen, setIsDocFormOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data: shipper, isLoading: isShipperLoading } = useShipper(shipperId);
  useBreadcrumbLabel(shipper?.companyLegalName);
  const updateShipper = useUpdateShipper();
  const uploadLogo = useUploadShipperLogo();
  // Locally staged, not-yet-persisted document additions (see handleAddDocument
  // below — this quick-add flow only ever collected a display name, never a
  // real file, so unlike AddShipperForm's catalog upload there is nothing to
  // send the backend here; it stays client-side exactly as it always was).
  const [localDocuments, setLocalDocuments] = useState<ShipperDocument[]>([]);
  const documents = [...(shipper?.uploadedDocuments ?? []), ...localDocuments];

  const { summary, rows } = useShipperAccount({ shipperId: shipperId ?? '' });

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 5000);
  };

  const handleEditSuccess = async (formData: ShipperFormData) => {
    if (!shipperId) return;
    await updateShipper.mutateAsync({
      id: shipperId,
      payload: {
        companyLegalName: formData.companyLegalName,
        registrationNumber: formData.registrationNumber,
        industry: formData.industry,
        companySize: formData.companySize,
        approvalStatus: formData.approvalStatus,
        country: formData.country,
        address: formData.address,
        primaryContact: {
          name: formData.primaryContactName,
          title: formData.primaryContactTitle,
          email: formData.primaryContactEmail,
          phone: formData.primaryContactPhone,
        },
      },
    });
    if (formData.logo) {
      await uploadLogo.mutateAsync({ id: shipperId, file: formData.logo });
    }
    for (const [category, file] of Object.entries(formData.stagedFiles)) {
      await uploadDocument({ ownerType: 'SHIPPER', ownerId: shipperId, category, file });
    }

    setIsEditOpen(false);
    announce('Shipper profile updated.');
  };

  const handleAddDocument = (name: string, category: ShipperDocument['category']) => {
    const trimmed = name.trim();
    const document: ShipperDocument = {
      id: `local-${Date.now()}`,
      name: trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`,
      category,
      uploadDate: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      fileSize: '—',
      status: 'Pending Review',
    };

    setLocalDocuments((prev) => [...prev, document]);
    setIsDocFormOpen(false);
    announce(`"${document.name}" queued for verification.`);
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (documentId.startsWith('local-')) {
      setLocalDocuments((prev) => prev.filter((document) => document.id !== documentId));
      return;
    }
    await deleteDocument(documentId);
    if (shipperId) queryClient.invalidateQueries({ queryKey: shipperQueryKeys.detail(shipperId) });
  };

  if (!shipperId || (isShipperLoading && !shipper)) {
    return <div className="p-8 text-sm text-muted-foreground">Loading shipper…</div>;
  }
  if (!shipper) {
    return <div className="p-8 text-sm text-muted-foreground">Shipper not found.</div>;
  }

  /** An alert or a KPI sends the reader to the tab that explains it. */
  const goToTab = (tab: ShipperTabKey, filter?: ShipmentFilterKey) => {
    handleTabChange(tab);
    if (filter) setShipmentFilter(filter);
    if (tab === 'profile') setIsDocFormOpen(false);
  };

  const openUploadForm = () => {
    setActiveTab('profile');
    setIsDocFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-5 pb-10">
      <DocumentViewerModal
        open={Boolean(viewingDoc)}
        onOpenChange={(open) => !open && setViewingDoc(null)}
        document={viewingDoc}
      />

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-l border-border bg-background p-6 sm:max-w-2xl sm:p-8"
        >
          <SheetTitle className="sr-only">Edit shipper profile</SheetTitle>
          <SheetDescription className="sr-only">
            Modify corporate details, country, address, contact person and compliance documents.
          </SheetDescription>
          <AddShipperForm
            initialData={{
              companyLegalName: shipper.companyLegalName,
              registrationNumber: shipper.registrationNumber,
              industry: shipper.industry,
              companySize: shipper.companySize,
              approvalStatus: shipper.approvalStatus,
              country: shipper.country,
              address: shipper.address,
              primaryContactName: shipper.primaryContact.name,
              primaryContactTitle: shipper.primaryContact.title,
              primaryContactEmail: shipper.primaryContact.email,
              primaryContactPhone: shipper.primaryContact.phone,
              uploadedDocuments: shipper.uploadedDocuments,
              logoUrl: shipper.logoUrl,
            }}
            isEdit
            onSuccess={handleEditSuccess}
            onCancel={() => setIsEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {notice && (
        <Card
          variant="default"
          padding="sm"
          role="status"
          className="flex-row items-center justify-between gap-3 border-success/40 bg-success-subtle"
        >
          <span className="inline-flex items-center gap-2 type-body-sm text-success-subtle-foreground">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {notice}
          </span>
          <IconButton
            aria-label="Dismiss notification"
            variant="ghost"
            size="sm"
            onClick={() => setNotice(null)}
          >
            <X />
          </IconButton>
        </Card>
      )}

      <ShipperTabNav
        active={activeTab}
        onChange={handleTabChange}
        shipmentCount={rows.length}
        documentCount={documents.length}
      />

      {activeTab === 'analytics' && (
        <TabPanel tab="analytics">
          <div className="space-y-6">
            {/* No AccountHealthStrip on this tab: all four of its tiles reappear in
                the suite's KPI strip, and one number should live in one place. The
                strip stays on the Shipments tab, which its tiles open anyway. */}
            <AttentionRail alerts={summary.alerts} onNavigate={goToTab} />
            {/* Subject-tab offset = --fl-header-height (the token behind `top-header`)
                + 41px of ShipperTabNav (2×py-2.5 + 20px text line + 1px border), so
                the suite's tabs pin in a tier below the page tabs instead of
                colliding with them. */}
            <ShipperAnalyticsSuite
              shipperId={shipper.id}
              subjectNavTopClass="top-[calc(var(--fl-header-height)+41px)]"
            />
          </div>
        </TabPanel>
      )}

      {activeTab === 'shipments' && (
        <TabPanel tab="shipments">
          <div className="space-y-5">
            <AccountHealthStrip summary={summary} onNavigate={goToTab} />
            <AttentionRail alerts={summary.alerts} onNavigate={goToTab} />
            <ShipmentsPanel
              rows={rows}
              initialFilter={shipmentFilter}
              onOpenShipment={(row) =>
                navigate(
                  buildPath(ROUTES.shipmentOverview, {
                    id: row.shipmentId.replace(/^SHP-0*/, '') || '1',
                  }),
                )
              }
            />
          </div>
        </TabPanel>
      )}

      {activeTab === 'profile' && (
        <TabPanel tab="profile">
          <div className="space-y-6">
            <ShipperIdentityHeader
              shipper={shipper}
              onEdit={() => setIsEditOpen(true)}
              onUploadDocument={openUploadForm}
            />
            <CompliancePanel
              shipper={shipper}
              documents={documents}
              docFormOpen={isDocFormOpen}
              onDocFormOpenChange={setIsDocFormOpen}
              onAddDocument={handleAddDocument}
              onViewDocument={setViewingDoc}
              onDownloadDocument={(document) => {
                void triggerDocumentDownload(document.id, document.name);
                announce(`Downloading "${document.name}"…`);
              }}
              onDeleteDocument={handleDeleteDocument}
              onEdit={() => setIsEditOpen(true)}
            />
          </div>
        </TabPanel>
      )}
    </div>
  );
}

function TabPanel({ tab, children }: { tab: ShipperTabKey; children: React.ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`shipper-panel-${tab}`}
      aria-labelledby={`shipper-tab-${tab}`}
      tabIndex={-1}
      className="animate-in fade-in duration-200 focus-visible:outline-none"
    >
      {children}
    </div>
  );
}

