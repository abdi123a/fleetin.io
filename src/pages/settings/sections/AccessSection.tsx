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
      <Panel title="Sessions" subtitle="How long a signed-in tab stays signed in">
        <FieldGrid>
          <NumberField
            label="Idle timeout"
            value={access.sessionTimeoutMinutes}
            onChange={(v) => set({ sessionTimeoutMinutes: v })}
            min={0}
            max={1440}
            step={5}
            suffix="min"
            hint="0 never signs a user out. On a shared dispatch machine, 15 is more honest than 480."
          />
          <ToggleField
            label="Require two-factor authentication"
            description="Everybody, not only administrators. Users without a second factor are prompted to set one up on next sign-in."
            checked={access.requireTwoFactor}
            onChange={(v) => set({ requireTwoFactor: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Passwords" subtitle="The floor every account has to clear">
        <FieldGrid>
          <NumberField
            label="Minimum length"
            value={access.passwordMinLength}
            onChange={(v) => set({ passwordMinLength: v })}
            min={6}
            max={64}
            suffix="chars"
            hint="Length beats character classes. Ten is a reasonable floor; twelve is better."
          />
          <NumberField
            label="Expire after"
            value={access.passwordExpiryDays}
            onChange={(v) => set({ passwordExpiryDays: v })}
            min={0}
            max={730}
            suffix="days"
            hint="0 never expires. Forced rotation mostly produces predictable variations of the same password."
          />
          <ToggleField
            label="Require mixed case, a digit and a symbol"
            description="Adds a complexity check on top of the length floor."
            checked={access.passwordRequireComplexity}
            onChange={(v) => set({ passwordRequireComplexity: v })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Joining" subtitle="What happens when somebody asks for an account">
        <FieldGrid>
          <ToggleField
            label="Auto-approve requests from allowed domains"
            description="A request whose email matches the list below becomes an account without a human decision. Anything else still queues in Administration."
            checked={access.autoApproveAccessRequests}
            onChange={(v) => set({ autoApproveAccessRequests: v })}
          />
          <ListField
            label="Allowed email domains"
            value={access.allowedEmailDomains}
            onChange={(v) => set({ allowedEmailDomains: v })}
            placeholder="fleetin.dj"
            hint="One per line, or comma-separated. Empty means every domain may request — requests still queue for approval unless auto-approve is on."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Audit & network" subtitle="What is kept, and from where the app may be reached">
        <FieldGrid>
          <NumberField
            label="Audit retention"
            value={access.auditRetentionDays}
            onChange={(v) => set({ auditRetentionDays: v })}
            min={30}
            max={3650}
            suffix="days"
            hint="Every view, upload, edit and deletion of an employee, document or payroll line is recorded. Keep it at least as long as the payroll records it explains."
          />
          <ListField
            label="IP allowlist"
            value={access.ipAllowlist}
            onChange={(v) => set({ ipAllowlist: v })}
            placeholder="41.203.0.0/16"
            hint="CIDR ranges, one per line. Empty places no restriction — get this wrong and you lock yourself out."
          />
          <SectionNote tone="warning">
            These are declarations of policy. The backend enforces sessions, passwords and network rules, and has to
            be configured to match — setting a value here does not by itself stop anybody.
          </SectionNote>
        </FieldGrid>
      </Panel>
    </div>
  );
}
