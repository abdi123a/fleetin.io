export type { AppSettingsRecord, UpdateSettingsPayload } from './api/settingsService';
export { settingsQueryKeys, useSettings, useUpdateSettings } from './api/queries';

export type {
  AccessSettings,
  BrandingSettings,
  CommissionSettings,
  DocumentSettings,
  FinancePolicySettings,
  IntegrationSettings,
  LocalizationSettings,
  NotificationChannel,
  NotificationRule,
  NotificationSettings,
  NumberingSettings,
  OperationsSettings,
  OrganizationSettings,
  SettingsSection,
  Signatory,
  SystemSettings,
} from './model/types';

export { DEFAULT_SETTINGS, NOTIFICATION_EVENTS } from './model/defaults';

export {
  defaultFreeTimeDays,
  detentionRate,
  paymentTermsDays,
  toDjf,
  usdToDjfRate,
  useBranding,
  useFinancePolicy,
  useLetterhead,
  useOperationsPolicy,
  useOrganization,
  useSystemSettings,
} from './model/hooks';
