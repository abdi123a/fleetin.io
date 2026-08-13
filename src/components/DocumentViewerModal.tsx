import { Badge, Button, IconChip, Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';
import { FileText, Download, X, CheckCircle2, ShieldCheck, Printer } from 'lucide-react';
import { triggerDocumentDownload } from './documentDownload';

export interface DocumentToView {
  id?: string;
  name: string;
  category?: string;
  uploadDate?: string;
  expiryDate?: string;
  fileSize?: string;
  status?: string;
  version?: number;
}

interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentToView | null;
}

export function DocumentViewerModal({ open, onOpenChange, document: doc }: DocumentViewerModalProps) {
  if (!doc) return null;

  const handleDownload = () => {
    void triggerDocumentDownload(doc.id, doc.name);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-6 bg-background border-l border-border space-y-6">
        <SheetTitle className="sr-only">Document Preview</SheetTitle>
        <SheetDescription className="sr-only">Document viewer and metadata details</SheetDescription>

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconChip icon={FileText} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-foreground tracking-tight truncate">{doc.name}</h3>
                <Badge intent={doc.status === 'Verified' ? 'success' : 'warning'} size="sm">
                  {doc.status || 'Verified'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                {doc.category || 'Compliance Document'} {doc.fileSize ? `· ${doc.fileSize}` : ''} {doc.uploadDate ? `· Uploaded ${doc.uploadDate}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            <span>Official Fleetin Encrypted Vault Document</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              leadingIcon={<Printer className="h-3.5 w-3.5" />}
              className="text-xs font-semibold rounded-lg h-8 px-3"
            >
              Print
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              leadingIcon={<Download className="h-3.5 w-3.5" />}
              className="bg-primary text-primary-foreground text-xs font-semibold rounded-lg h-8 px-4"
            >
              Download PDF
            </Button>
          </div>
        </div>

        {/* Realistic PDF Document Preview Canvas */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs space-y-6 min-h-[420px] relative overflow-hidden">
          {/* Watermark badge */}
          <div className="absolute right-6 top-6 opacity-10 pointer-events-none flex flex-col items-end">
            <ShieldCheck className="h-32 w-32 text-primary" />
          </div>

          <div className="border-b border-border/80 pb-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-black tracking-wider text-primary uppercase block">FLEETIN LOGISTICS SYSTEM</span>
              <h4 className="text-lg font-extrabold text-foreground">{doc.category || 'Official Document Record'}</h4>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-subtle text-success-subtle-foreground border border-success/20">
              <CheckCircle2 className="h-3.5 w-3.5 text-success-subtle-foreground" /> Digital Stamp Verified
            </span>
          </div>

          {/* Document Content Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/40 border border-border/60 text-xs">
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Document Reference</span>
              <strong className="font-mono text-foreground font-bold">{doc.id || 'DOC-2026-X81'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">File Name</span>
              <strong className="text-foreground font-bold truncate block">{doc.name}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">File Size</span>
              <strong className="text-foreground font-bold">{doc.fileSize || '1.8 MB'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Upload Date</span>
              <strong className="text-foreground font-bold">{doc.uploadDate || '10 Jan 2025'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Expiry Date</span>
              <strong className="text-foreground font-bold">{doc.expiryDate || '2027-12-31'}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Version</span>
              <strong className="text-foreground font-bold font-mono">v{doc.version || 1}.0</strong>
            </div>
          </div>

          {/* Mock Document Text Content */}
          <div className="space-y-3 pt-2 text-xs text-foreground/90 leading-relaxed font-sans">
            <p className="font-semibold text-foreground">
              CERTIFICATE OF COMPLIANCE & OPERATIONAL CLEARANCE
            </p>
            <p className="text-muted-foreground">
              This document certifies that <strong>{doc.name}</strong> has been audited and validated according to international freight and port transport regulations. All licensing data, transport insurance coverage, and vehicle safety inspections associated with this record remain in good standing.
            </p>
            <div className="p-4 rounded-lg border border-dashed border-border/80 bg-background/50 space-y-2 text-2xs font-mono text-muted-foreground">
              <p>HASH: SHA256: 8f9b2a1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a</p>
              <p>ISSUER: Maritime & Land Transport Authority Authority ID: MLTA-DJ-2026</p>
              <p>STATUS: ACTIVE & VERIFIED</p>
            </div>
          </div>

          {/* Footer Signature */}
          <div className="pt-6 border-t border-border/60 flex items-center justify-between text-2xs text-muted-foreground">
            <span>Generated electronically by Fleetin Management Platform</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
