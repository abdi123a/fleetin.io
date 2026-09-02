import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, X } from '@/design-system/icons';
import {
  Card,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useConfirm,
} from '@/design-system';
import {
  DocumentViewerModal,
  type DocumentToView,
} from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { useShipperAccount } from '@/features/shipper-bi';
import type { ShipperDocument } from '@/types/shipper';
import { useShipper, useUpdateShipper, useUploadShipperLogo, shipperQueryKeys } from '@/features/shippers/api/queries';
import { deleteDocument, uploadDocument } from '@/features/documents/api/documentsService';
import { useAuthStore } from '@/stores';
import { useShipmentStore } from '@/stores/shipment.store';
import { useBreadcrumbLabel } from '@/hooks/useBreadcrumbLabel';
import { AddShipperForm, type ShipperFormData } from './AddShipperForm';
import { ShipperAnalyticsSuite } from '@/pages/analytics';
import { MonthlyReportPanel } from '@/components/reports';
import { ShipmentsListView } from '@/pages/missions/components/ShipmentsListView';
import {
  AttentionRail,
  CompliancePanel,
  ShipperIdentityHeader,
  ShipperTabNav,
  type ShipperTabKey,
} from './components';

const SHIPPER_TABS: ShipperTabKey[] = ['analytics', 'monthly-report', 'shipments', 'profile'];

export function ShipperDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);

  // For Shipper user, default to their own shipperId
  const isShipperUser = user?.role === 'SHIPPER' || user?.role === 'CLIENT';
  const shipperId = isShipperUser ? user?.shipperId : (id ?? user?.shipperId);

  const tabParam = searchParams.get('tab') as ShipperTabKey | null;
  const [activeTab, setActiveTab] = useState<ShipperTabKey>(
    tabParam && SHIPPER_TABS.includes(tabParam) ? tabParam : 'shipments'
  );

  useEffect(() => {
    if (tabParam && SHIPPER_TABS.includes(tabParam)) {
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

  const { summary } = useShipperAccount({ shipperId: shipperId ?? '' });

  // The Shipments tab renders the exact same view as the Admin Shipments
  // page — only this filtered slice of the store differs.
  const missions = useShipmentStore((s) => s.missions);
  const shipperMissions = useMemo(
    () => missions.filter((mission) => mission.customer.id === shipperId),
    [missions, shipperId],
  );

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
    for (const staged of formData.stagedDocuments) {
      await uploadDocument({
        ownerType: 'SHIPPER',
        ownerId: shipperId,
        category: staged.category,
        file: staged.capture.file,
        issueDate: staged.capture.issueDate,
        expiryDate: staged.capture.expiryDate,
      });
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

  const { confirm, confirmDialog } = useConfirm();

  const handleDeleteDocument = async (documentId: string) => {
    if (documentId.startsWith('local-')) {
      setLocalDocuments((prev) => prev.filter((document) => document.id !== documentId));
      return;
    }
    const ok = await confirm({
      title: 'Delete this document?',
      description: 'The file will be permanently removed from this shipper\u2019s vault.',
    });
    if (!ok) return;
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
  const goToTab = (tab: ShipperTabKey) => {
    handleTabChange(tab);
    if (tab === 'profile') setIsDocFormOpen(false);
  };

  const openUploadForm = () => {
    setActiveTab('profile');
    setIsDocFormOpen(true);
  };

  // A shipper reading their own record already has a dedicated sidebar link to
  // each section (Dashboard, Analytics, Account Settings) — this page's own tab
  // bar would just be a second switcher for the same two destinations it still
  // owns (Shipments, Profile). Stray links to the other two collapse to
  // Shipments rather than a blank page.
  const effectiveTab: ShipperTabKey =
    isShipperUser && (activeTab === 'analytics' || activeTab === 'monthly-report')
      ? 'shipments'
      : activeTab;

  const shipmentsContent = (
    <ShipmentsListView missions={shipperMissions} canCreateShipment={false} />
  );

  const profileContent = (
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
  );

  return (
    <div className="flex flex-col gap-5 pb-10">
      {confirmDialog}
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
            Company details, contacts and compliance documents.
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

      {isShipperUser ? (
        // Reached straight from its own sidebar link (Shipments or Account
        // Settings), so the section itself is the page — no in-page tab bar
        // switching to destinations that already have their own link.
        <div
          key={effectiveTab}
          className="animate-in fade-in duration-200"
        >
          {effectiveTab === 'profile' ? profileContent : shipmentsContent}
        </div>
      ) : (
        <>
          <ShipperTabNav
            active={activeTab}
            onChange={handleTabChange}
            shipmentCount={shipperMissions.length}
            documentCount={documents.length}
          />

          {activeTab === 'analytics' && (
            <TabPanel tab="analytics">
              <div className="space-y-6">
                {/* No AccountHealthStrip on this tab: its four tiles are the same
                    figures the suite opens with, and one number should live in
                    one place. */}
                <AttentionRail alerts={summary.alerts} onNavigate={goToTab} />
                {/* The suite no longer pins anything, so there is no second
                    sticky tier to offset against ShipperTabNav. */}
                <ShipperAnalyticsSuite shipperId={shipper.id} />
              </div>
            </TabPanel>
          )}

          {activeTab === 'monthly-report' && (
            <TabPanel tab="monthly-report">
              <MonthlyReportPanel
                shipperId={shipper.id}
                shipperName={shipper.companyLegalName}
                shipperLogoUrl={shipper.logoUrl}
              />
            </TabPanel>
          )}

          {activeTab === 'shipments' && (
            <TabPanel tab="shipments">
              {/* The exact Admin Shipments page — KPI strip, filter toolbar, row/grid
                  views, pagination — scoped to this shipper's own missions. */}
              {shipmentsContent}
            </TabPanel>
          )}

          {activeTab === 'profile' && <TabPanel tab="profile">{profileContent}</TabPanel>}
        </>
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

