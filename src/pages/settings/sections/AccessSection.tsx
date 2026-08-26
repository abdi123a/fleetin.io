import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import { FieldGrid, ListField, NumberField, SectionNote, ToggleField } from '../components/fields';

/**
 * Who gets in, and on what terms.
 *
 * These are policy declarations, not enforcement: the server decides whether a
 * session is valid, and it has to agree with what is set here for any of it to
 * be real. The screen says so rather than implying a password rule typed in a
 * browser stops anybody.
 */
export function AccessSection() {
  const access = useSystemSettings().access;
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof access>) => update('access', patch);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Sessions" subtitle="Session lifetime">
        <FieldGrid>
          <NumberField
            label="Idle timeout"
            value={access.sessionTimeoutMinutes}
            onChange={(v) => set({ sessionTimeoutMinutes: v })}
            min={0}
            max={1440}
            step={5}
            suffix="min"
            hint="0 never signs a user out."
          />
          <ToggleField
            label="Require two-factor authentication"
            description="Applies to everybody, not only administrators."
            checked={access.requireTwoFactor}
            onChange={(v) => set({ requireTwoFactor: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Passwords" subtitle="Minimum requirements">
        <FieldGrid>
          <NumberField
            label="Minimum length"
            value={access.passwordMinLength}
            onChange={(v) => set({ passwordMinLength: v })}
            min={6}
            max={64}
            suffix="chars"
            hint="Ten is a reasonable floor; twelve is better."
          />
          <NumberField
            label="Expire after"
            value={access.passwordExpiryDays}
            onChange={(v) => set({ passwordExpiryDays: v })}
            min={0}
            max={730}
            suffix="days"
            hint="0 never expires."
          />
          <ToggleField
            label="Require mixed case, a digit and a symbol"
            description="Adds a complexity check on top of the length floor."
            checked={access.passwordRequireComplexity}
            onChange={(v) => set({ passwordRequireComplexity: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Joining" subtitle="Account request handling">
        <FieldGrid>
          <ToggleField
            label="Auto-approve requests from allowed domains"
            description="A matching request becomes an account without a human decision."
            checked={access.autoApproveAccessRequests}
            onChange={(v) => set({ autoApproveAccessRequests: v })}
          />
          <ListField
            label="Allowed email domains"
            value={access.allowedEmailDomains}
            onChange={(v) => set({ allowedEmailDomains: v })}
            placeholder="fleetin.dj"
            hint="One per line or comma-separated. Empty allows every domain."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Audit & network" subtitle="Retention and IP restrictions">
        <FieldGrid>
          <NumberField
            label="Audit retention"
            value={access.auditRetentionDays}
            onChange={(v) => set({ auditRetentionDays: v })}
            min={30}
            max={3650}
            suffix="days"
            hint="Keep at least as long as the payroll records it explains."
          />
          <ListField
            label="IP allowlist"
            value={access.ipAllowlist}
            onChange={(v) => set({ ipAllowlist: v })}
            placeholder="41.203.0.0/16"
            hint="CIDR ranges, one per line. Empty places no restriction."
          />
          <SectionNote tone="warning">
            Policy declarations only. The backend enforces these and has to be configured to match.
          </SectionNote>
        </FieldGrid>
      </Panel>
    </div>
  );
}
