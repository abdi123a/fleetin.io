export type OnboardingStatus =
  | 'Draft'
  | 'In Progress'
  | 'Under Review'
  | 'Action Required'
  | 'Approved'
  | 'Rejected';

export type EntityType = 'Partner' | 'Shipper';

export interface AccountManager {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  phone?: string;
}

export interface PendingAction {
  id: string;
  title: string;
  category: 'Document' | 'Legal' | 'Financial' | 'Verification' | 'Fleet';
  assignedTo: 'Applicant' | 'Account Manager' | 'Legal Team' | 'Risk Audit';
  dueDate?: string;
  isCompleted: boolean;
  priority: 'High' | 'Medium' | 'Low';
}

export interface CommentItem {
  id: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  timestamp: string;
  message: string;
  statusChange?: OnboardingStatus;
}

export interface OnboardingRecord {
  id: string;
  companyLegalName: string;
  entityType: EntityType;
  registrationNumber: string;
  country: string;
  logoUrl?: string;
  onboardingStatus: OnboardingStatus;
  assignedAccountManager: AccountManager;
  progress: number; // 0 to 100
  creationDate: string;
  approvalDate?: string;
  targetCompletionDate?: string;
  bottleneckStage?: string;
  pendingActions: PendingAction[];
  commentsHistory: CommentItem[];
  industry?: string;
  primaryContactName: string;
  primaryContactEmail: string;
}

export interface StageBottleneck {
  stageId: string;
  stageName: string;
  avgTimeDays: number;
  targetTimeDays: number;
  activeCount: number;
  delayedCount: number;
  bottleneckSeverity: 'Low' | 'Moderate' | 'Critical';
  delayReason: string;
}

export interface OnboardingPerformanceMetrics {
  avgOnboardingTimeDays: number; // e.g. 4.2
  timeTrendPercentage: number; // e.g. -12.5 (negative is good)
  approvalRatePercentage: number; // e.g. 88.5
  approvalRateTrend: number; // e.g. +3.2
  rejectionRatePercentage: number; // e.g. 4.5
  rejectionRateTrend: number; // e.g. -0.8
  pendingProfilesCount: number;
  completedOnboardingsCount: number;
  activeBottlenecksCount: number;
  stageBottlenecks: StageBottleneck[];
}
