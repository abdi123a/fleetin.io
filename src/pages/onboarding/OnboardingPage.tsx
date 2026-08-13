import { useState, useMemo } from 'react';
import {
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Plus,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  User,
  Send,
  Layers,
} from '@/design-system/icons';
import { RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components';
import {
  Button,
  Card,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Input,
  Select,
  StatisticCard,
} from '@/design-system';
import type {
  OnboardingRecord,
  OnboardingStatus,
  PendingAction,
  CommentItem,
} from '@/types/onboarding';
import {
  INITIAL_ONBOARDING_RECORDS,
  ACCOUNT_MANAGERS,
  MOCK_PERFORMANCE_METRICS,
} from '@/data/onboardingData';

function renderStatusBadge(status: OnboardingStatus) {
  switch (status) {
    case 'Approved':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20">
          <CheckCircle2 className="h-3 w-3 text-success-subtle-foreground shrink-0" />
          Approved
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-info-subtle text-info-subtle-foreground border border-info/20">
          <Clock className="h-3 w-3 text-info-subtle-foreground shrink-0" />
          In Progress
        </span>
      );
    case 'Under Review':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20">
          <Clock className="h-3 w-3 text-warning-subtle-foreground shrink-0" />
          Under Review
        </span>
      );
    case 'Action Required':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20">
          <AlertTriangle className="h-3 w-3 text-warning-subtle-foreground shrink-0" />
          Action Required
        </span>
      );
    case 'Draft':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border/60">
          Draft
        </span>
      );
    case 'Rejected':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-destructive-subtle text-destructive-subtle-foreground border border-destructive/20">
          <XCircle className="h-3 w-3 text-destructive-subtle-foreground shrink-0" />
          Rejected
        </span>
      );
  }
}

function CompanyAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [hasError, setHasError] = useState(false);
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  if (!logoUrl || hasError) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs shrink-0 border border-primary/20">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      onError={() => setHasError(true)}
      className="h-10 w-10 object-cover rounded-lg border border-border/60 shrink-0"
    />
  );
}

export function OnboardingPage() {
  const [records, setRecords] = useState<OnboardingRecord[]>(INITIAL_ONBOARDING_RECORDS);
  const [activeTab, setActiveTab] = useState<'workspace' | 'analytics'>('workspace');
  const [selectedRecord, setSelectedRecord] = useState<OnboardingRecord | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [managerFilter, setManagerFilter] = useState<string>('all');

  // Comment input in drawer
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [selectedStatusChange, setSelectedStatusChange] = useState<string>('no-change');

  // Add Action input in drawer
  const [newActionTitle, setNewActionTitle] = useState<string>('');

  const metrics = MOCK_PERFORMANCE_METRICS;

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        rec.companyLegalName.toLowerCase().includes(q) ||
        rec.id.toLowerCase().includes(q) ||
        rec.country.toLowerCase().includes(q) ||
        rec.primaryContactName.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all' || rec.onboardingStatus.toLowerCase() === statusFilter.toLowerCase();

      const matchesEntity = entityFilter === 'all' || rec.entityType === entityFilter;

      const matchesManager = managerFilter === 'all' || rec.assignedAccountManager.id === managerFilter;

      return matchesSearch && matchesStatus && matchesEntity && matchesManager;
    });
  }, [records, searchTerm, statusFilter, entityFilter, managerFilter]);

  const hasActiveFilters =
    searchTerm !== '' || statusFilter !== 'all' || entityFilter !== 'all' || managerFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setEntityFilter('all');
    setManagerFilter('all');
  };

  // Handlers for Drawer updates
  const handleAddComment = () => {
    if (!selectedRecord || !newCommentText.trim()) return;

    const statusTransition =
      selectedStatusChange !== 'no-change' ? (selectedStatusChange as OnboardingStatus) : undefined;

    const newComment: CommentItem = {
      id: `COM-${Date.now()}`,
      authorName: 'Current User',
      authorRole: 'Onboarding Admin',
      timestamp:
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' +
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      message: newCommentText.trim(),
      statusChange: statusTransition,
    };

    const updatedRecord: OnboardingRecord = {
      ...selectedRecord,
      commentsHistory: [...selectedRecord.commentsHistory, newComment],
      onboardingStatus: statusTransition || selectedRecord.onboardingStatus,
      approvalDate: statusTransition === 'Approved' ? new Date().toISOString().split('T')[0] : selectedRecord.approvalDate,
      progress: statusTransition === 'Approved' ? 100 : selectedRecord.progress,
    };

    setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
    setSelectedRecord(updatedRecord);
    setNewCommentText('');
    setSelectedStatusChange('no-change');
  };

  const handleToggleAction = (actionId: string) => {
    if (!selectedRecord) return;

    const updatedActions = selectedRecord.pendingActions.map((act) =>
      act.id === actionId ? { ...act, isCompleted: !act.isCompleted } : act,
    );

    const completedCount = updatedActions.filter((a) => a.isCompleted).length;
    const totalCount = updatedActions.length;
    const calculatedProgress = totalCount > 0 ? Math.round(50 + (completedCount / totalCount) * 50) : selectedRecord.progress;

    const updatedRecord: OnboardingRecord = {
      ...selectedRecord,
      pendingActions: updatedActions,
      progress: calculatedProgress > 100 ? 100 : calculatedProgress,
    };

    setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
    setSelectedRecord(updatedRecord);
  };

  const handleAddAction = () => {
    if (!selectedRecord || !newActionTitle.trim()) return;

    const newAction: PendingAction = {
      id: `ACT-${Date.now()}`,
      title: newActionTitle.trim(),
      category: 'Verification',
      assignedTo: 'Applicant',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isCompleted: false,
      priority: 'Medium',
    };

    const updatedRecord: OnboardingRecord = {
      ...selectedRecord,
      pendingActions: [...selectedRecord.pendingActions, newAction],
    };

    setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
    setSelectedRecord(updatedRecord);
    setNewActionTitle('');
  };

  const handleReassignManager = (newManagerId: string) => {
    if (!selectedRecord) return;
    const manager = ACCOUNT_MANAGERS.find((m) => m.id === newManagerId);
    if (!manager) return;

    const updatedRecord: OnboardingRecord = {
      ...selectedRecord,
      assignedAccountManager: manager,
    };

    setRecords((prev) => prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)));
    setSelectedRecord(updatedRecord);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Centralized Onboarding Workspace"
        description="Unified tracking for Partner and Shipper onboarding pipelines, assigned account managers, audit histories, and bottleneck performance analytics."
        actions={
          <div className="flex items-center gap-2">
            <Button
              shape="pill"
              variant={activeTab === 'workspace' ? 'primary' : 'outline'}
              onClick={() => setActiveTab('workspace')}
              leadingIcon={<UserCheck className="h-4 w-4" />}
              className="text-xs font-semibold px-4 py-2"
            >
              Workspace View
            </Button>
            <Button
              shape="pill"
              variant={activeTab === 'analytics' ? 'primary' : 'outline'}
              onClick={() => setActiveTab('analytics')}
              leadingIcon={<TrendingUp className="h-4 w-4" />}
              className="text-xs font-semibold px-4 py-2"
            >
              Performance Dashboard
            </Button>
          </div>
        }
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatisticCard
          title="Avg Onboarding Time"
          value={`${metrics.avgOnboardingTimeDays} Days`}
          subtitle="Cycle duration SLA"
          variant="teal"
          trend="down"
          percentage={`${metrics.timeTrendPercentage}% faster`}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatisticCard
          title="Approval Rate"
          value={`${metrics.approvalRatePercentage}%`}
          subtitle="Verification score"
          variant="blue"
          trend="up"
          percentage={`+${metrics.approvalRateTrend}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatisticCard
          title="Rejection Rate"
          value={`${metrics.rejectionRatePercentage}%`}
          subtitle="Risk filter"
          variant="peach"
          trend="down"
          percentage={`${metrics.rejectionRateTrend}%`}
          icon={<XCircle className="h-5 w-5" />}
        />
        <StatisticCard
          title="Pending Profiles"
          value={metrics.pendingProfilesCount}
          subtitle="In pipeline"
          variant="pink"
          trend="neutral"
          percentage="Active"
          icon={<Layers className="h-5 w-5" />}
        />
        <StatisticCard
          title="Completed Onboardings"
          value={metrics.completedOnboardingsCount}
          subtitle="Total onboarded"
          variant="teal"
          trend="up"
          percentage="+18 this month"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </div>

      {/* TAB 1: CENTRALIZED ONBOARDING WORKSPACE */}
      {activeTab === 'workspace' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0 flex-1 w-full md:w-auto">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search profile or manager..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-7 py-1 text-xs font-medium rounded-md border-border bg-background h-8.5 w-full"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
                {[
                  { id: 'all', label: 'All Status' },
                  { id: 'in progress', label: 'In Progress' },
                  { id: 'under review', label: 'Under Review' },
                  { id: 'action required', label: 'Action Required' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'rejected', label: 'Rejected' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                      statusFilter === st.id
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Entity & Account Manager Dropdowns */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Select
                selectSize="sm"
                containerClassName="w-32"
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Entities' },
                  { value: 'Partner', label: 'Partners' },
                  { value: 'Shipper', label: 'Shippers' },
                ]}
                className="text-2xs py-1 rounded-md"
              />

              <Select
                selectSize="sm"
                containerClassName="w-40"
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Managers' },
                  ...ACCOUNT_MANAGERS.map((m) => ({ value: m.id, label: m.name })),
                ]}
                className="text-2xs py-1 rounded-md"
              />

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* High Density Unified Table */}
          <div className="space-y-2">
            <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-3">Applicant Company</div>
              <div className="col-span-2">Status & SLA</div>
              <div className="col-span-3">Assigned Manager</div>
              <div className="col-span-2">Progress & Pending</div>
              <div className="col-span-2 text-right">Dates & Actions</div>
            </div>

            {filteredRecords.map((rec) => {
              const pendingCount = rec.pendingActions.filter((a) => !a.isCompleted).length;
              return (
                <div
                  key={rec.id}
                  onClick={() => setSelectedRecord(rec)}
                  className="group relative flex flex-col lg:grid lg:grid-cols-12 items-start lg:items-center gap-3 rounded-lg border border-border/80 bg-card hover:bg-muted/30 p-3.5 sm:px-5 cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs"
                >
                  {/* Entity Company */}
                  <div className="col-span-3 flex items-center gap-3 min-w-0 w-full">
                    <CompanyAvatar name={rec.companyLegalName} logoUrl={rec.logoUrl} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-foreground truncate group-hover:text-primary transition-colors">
                          {rec.companyLegalName}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded-sm font-bold uppercase ${
                            rec.entityType === 'Partner'
                              ? 'bg-chart-5/10 text-chart-5 border border-chart-5/20'
                              : 'bg-primary-subtle text-primary-subtle-foreground border border-primary/20'
                          }`}
                        >
                          {rec.entityType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-2xs text-muted-foreground font-mono">
                        <span>{rec.id}</span>
                        <span>•</span>
                        <span className="font-sans">{rec.country}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Bottleneck */}
                  <div className="col-span-2 flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-1.5">{renderStatusBadge(rec.onboardingStatus)}</div>
                    {rec.bottleneckStage && (
                      <span className="text-[10px] text-warning-subtle-foreground font-medium truncate mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                        {rec.bottleneckStage}
                      </span>
                    )}
                  </div>

                  {/* Account Manager */}
                  <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                    <img
                      src={rec.assignedAccountManager.avatarUrl}
                      alt={rec.assignedAccountManager.name}
                      className="h-7 w-7 rounded-full object-cover border border-border shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {rec.assignedAccountManager.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {rec.assignedAccountManager.role}
                      </span>
                    </div>
                  </div>

                  {/* Progress & Pending Actions */}
                  <div className="col-span-2 flex flex-col justify-center min-w-0 w-full">
                    <div className="flex items-center justify-between text-2xs font-bold mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="text-foreground">{rec.progress}%</span>
                    </div>
                    <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          rec.progress === 100
                            ? 'bg-success'
                            : rec.progress >= 50
                              ? 'bg-primary'
                              : 'bg-warning'
                        }`}
                        style={{ width: `${rec.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px]">
                      <span
                        className={`font-medium ${
                          pendingCount > 0 ? 'text-warning-subtle-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {pendingCount} pending task{pendingCount === 1 ? '' : 's'}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {rec.commentsHistory.length} comment{rec.commentsHistory.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  {/* Dates & Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-2 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-muted-foreground block">Created {rec.creationDate}</span>
                      <span className="text-[10px] font-semibold text-foreground block">
                        {rec.approvalDate ? `Approved ${rec.approvalDate}` : rec.targetCompletionDate ? `Target ${rec.targetCompletionDate}` : 'In Review'}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      shape="pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRecord(rec);
                      }}
                      className="text-xs font-semibold h-7 px-3"
                    >
                      Audit
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredRecords.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
                <UserCheck className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-base font-bold text-foreground">No Onboarding Records Found</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  No applicants matched your search or filter parameters.
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
                    className="mt-4 rounded-full text-xs font-medium"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ONBOARDING PERFORMANCE DASHBOARD */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Bottleneck Analysis Section */}
          <Card className="p-5 border border-border shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/60 pb-3 gap-2">
              <div>
                <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning-subtle-foreground" />
                  Onboarding Bottleneck Analysis
                </h3>
                <p className="text-xs text-muted-foreground">
                  Diagnostic breakdown of delays across verification stages and SLA velocity benchmarks.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-warning-subtle text-warning-subtle-foreground border border-warning/20">
                  {metrics.activeBottlenecksCount} Active Bottlenecks Flagged
                </span>
              </div>
            </div>

            {/* Stage Bottleneck Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metrics.stageBottlenecks.map((stg) => {
                const isOverdue = stg.avgTimeDays > stg.targetTimeDays;
                return (
                  <div
                    key={stg.stageId}
                    className="p-4 rounded-lg border border-border bg-card space-y-3 shadow-2xs hover:border-primary/30 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-extrabold text-foreground">{stg.stageName}</h4>
                        <p className="text-[10px] text-muted-foreground font-mono">{stg.stageId}</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          stg.bottleneckSeverity === 'Critical'
                            ? 'bg-destructive-subtle text-destructive-subtle-foreground border-destructive/20'
                            : stg.bottleneckSeverity === 'Moderate'
                              ? 'bg-warning-subtle text-warning-subtle-foreground border-warning/20'
                              : 'bg-success-subtle text-success-subtle-foreground border-success/20'
                        }`}
                      >
                        {stg.bottleneckSeverity} Bottleneck
                      </span>
                    </div>

                    {/* Progress velocity metric */}
                    <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-md bg-muted/30 border border-border/40 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground font-medium block">Avg Duration</span>
                        <span className={`font-bold ${isOverdue ? 'text-destructive-subtle-foreground' : 'text-foreground'}`}>
                          {stg.avgTimeDays} Days
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-medium block">SLA Target</span>
                        <span className="font-semibold text-foreground">{stg.targetTimeDays} Days</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-medium block">Delayed Records</span>
                        <span className="font-extrabold text-warning-subtle-foreground">
                          {stg.delayedCount} / {stg.activeCount}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                        Root Cause Analysis
                      </span>
                      <p className="p-2 rounded-md bg-muted/20 border border-border/40 text-2xs text-foreground/90 font-medium leading-relaxed">
                        {stg.delayReason}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* QUICK AUDIT & COMMENTS SLIDE-OVER DRAWER */}
      <Sheet open={Boolean(selectedRecord)} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-6 bg-background border-l border-border">
          <SheetTitle className="sr-only">Onboarding Profile Audit</SheetTitle>
          <SheetDescription className="sr-only">Detailed onboarding audit and comments timeline</SheetDescription>

          {selectedRecord && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border pb-4 gap-4">
                <div className="flex items-center gap-3">
                  <CompanyAvatar name={selectedRecord.companyLegalName} logoUrl={selectedRecord.logoUrl} />
                  <div>
                    <h2 className="text-base font-extrabold text-foreground">{selectedRecord.companyLegalName}</h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono">{selectedRecord.id}</span>
                      <span>•</span>
                      <span>{selectedRecord.entityType}</span>
                      <span>•</span>
                      <span>{selectedRecord.country}</span>
                    </div>
                  </div>
                </div>

                <div>{renderStatusBadge(selectedRecord.onboardingStatus)}</div>
              </div>

              {/* Progress Summary Card */}
              <Card className="p-4 border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground">Onboarding Progress Pipeline</span>
                  <span className="font-extrabold text-primary">{selectedRecord.progress}% Complete</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${selectedRecord.progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 text-2xs text-muted-foreground border-t border-border/40">
                  <div>
                    <span className="block font-medium">Creation Date:</span>
                    <span className="font-bold text-foreground">{selectedRecord.creationDate}</span>
                  </div>
                  <div>
                    <span className="block font-medium">Approval Date:</span>
                    <span className="font-bold text-foreground">{selectedRecord.approvalDate || selectedRecord.targetCompletionDate || 'Pending Review'}</span>
                  </div>
                </div>
              </Card>

              {/* Account Manager Assignment */}
              <Card className="p-4 border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <User className="h-4 w-4 text-primary" />
                    Assigned Account Manager
                  </span>
                  <Select
                    selectSize="sm"
                    containerClassName="w-44"
                    value={selectedRecord.assignedAccountManager.id}
                    onChange={(e) => handleReassignManager(e.target.value)}
                    options={ACCOUNT_MANAGERS.map((m) => ({ value: m.id, label: m.name }))}
                    className="text-2xs py-1"
                  />
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/40">
                  <img
                    src={selectedRecord.assignedAccountManager.avatarUrl}
                    alt={selectedRecord.assignedAccountManager.name}
                    className="h-10 w-10 rounded-full object-cover border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground">{selectedRecord.assignedAccountManager.name}</p>
                    <p className="text-[11px] text-muted-foreground">{selectedRecord.assignedAccountManager.role}</p>
                    <p className="text-[10px] text-primary font-mono">{selectedRecord.assignedAccountManager.email}</p>
                  </div>
                </div>
              </Card>

              {/* Pending Actions Checklist */}
              <Card className="p-4 border border-border shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Pending Actions & Tasks ({selectedRecord.pendingActions.filter((a) => !a.isCompleted).length} Remaining)
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedRecord.pendingActions.map((act) => (
                    <div
                      key={act.id}
                      onClick={() => handleToggleAction(act.id)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                        act.isCompleted
                          ? 'bg-success-subtle border-success/20 text-muted-foreground'
                          : 'bg-card border-border/60 hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={act.isCompleted}
                        onChange={() => handleToggleAction(act.id)}
                        className="mt-0.5 h-4 w-4 rounded-sm border-border text-primary focus:ring-primary shrink-0"
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <span className={`font-semibold block ${act.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {act.title}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{act.category}</span>
                          <span>•</span>
                          <span>Assigned: {act.assignedTo}</span>
                          {act.dueDate && <span>• Due: {act.dueDate}</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add action inline input */}
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                      type="text"
                      placeholder="Add new pending action item..."
                      value={newActionTitle}
                      onChange={(e) => setNewActionTitle(e.target.value)}
                      className="text-xs py-1 h-8 flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddAction}
                      leadingIcon={<Plus className="h-3.5 w-3.5" />}
                      className="text-xs h-8 px-3"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Comments History Timeline */}
              <Card className="p-4 border border-border shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Comments & Audit Log History ({selectedRecord.commentsHistory.length})
                </h3>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {selectedRecord.commentsHistory.map((com) => (
                    <div key={com.id} className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">{com.authorName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{com.timestamp}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">{com.message}</p>
                      {com.statusChange && (
                        <div className="pt-1">
                          <span className="text-[10px] font-semibold text-primary">
                            Status changed to: {com.statusChange}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Comment & Status Change Form */}
                <div className="pt-3 border-t border-border/60 space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Add audit note or comment..."
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <Select
                      selectSize="sm"
                      containerClassName="w-48"
                      value={selectedStatusChange}
                      onChange={(e) => setSelectedStatusChange(e.target.value)}
                      options={[
                        { value: 'no-change', label: 'No Status Change' },
                        { value: 'In Progress', label: 'Set: In Progress' },
                        { value: 'Under Review', label: 'Set: Under Review' },
                        { value: 'Action Required', label: 'Set: Action Required' },
                        { value: 'Approved', label: 'Set: Approved' },
                        { value: 'Rejected', label: 'Set: Rejected' },
                      ]}
                      className="text-2xs py-1"
                    />

                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      leadingIcon={<Send className="h-3.5 w-3.5" />}
                      className="text-xs px-4"
                    >
                      Post Comment
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default OnboardingPage;
