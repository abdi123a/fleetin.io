import { NOTIFICATION_EVENTS, useSystemSettings, type NotificationChannel } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';
import { cn } from '@/utils';

import { FieldGrid, SectionNote, SelectField, TextField, ToggleField } from '../components/fields';

const CHANNELS: ReadonlyArray<{ id: NotificationChannel; label: string; hint: string }> = [
  { id: 'inApp', label: 'In app', hint: 'The bell in the header.' },
  { id: 'email', label: 'Email', hint: 'Needs the SMTP settings under Integrations.' },
  { id: 'sms', label: 'SMS', hint: 'Costs money per message — reserve it.' },
  { id: 'webhook', label: 'Webhook', hint: 'POSTed to the URL under Integrations.' },
];

/**
 * Which events reach whom, and how.
 *
 * A matrix rather than a list of switches, because the real question an
 * operator has is not "do I want to know about overdue containers" — they
 * always do — but "does that warrant an SMS at nine at night". Rows are events,
 * columns are channels, and the answer is a cell.
 */
export function NotificationsSection() {
  const notifications = useSystemSettings().notifications;
  const update = useSettingsStore((s) => s.update);

  const groups = Array.from(new Set(NOTIFICATION_EVENTS.map((event) => event.group)));

  /** A rule that has never been touched falls back to the event's own default. */
  const ruleFor = (id: string) => {
    const stored = notifications.rules[id];
    if (stored) return stored;
    const event = NOTIFICATION_EVENTS.find((e) => e.id === id);
    return { enabled: true, channels: event?.defaultChannels ?? [] };
  };

  const toggleChannel = (id: string, channel: NotificationChannel) => {
    const rule = ruleFor(id);
    const channels = rule.channels.includes(channel)
      ? rule.channels.filter((c) => c !== channel)
      : [...rule.channels, channel];
    update('notifications', { rules: { [id]: { ...rule, channels } } as never });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Delivery" subtitle="Rules that apply to every message, whatever raised it">
        <FieldGrid>
          <SelectField
            label="Digest"
            value={notifications.digest}
            onChange={(v) => update('notifications', { digest: v })}
            options={[
              { value: 'off', label: 'Send each event as it happens' },
              { value: 'hourly', label: 'Roll repeats into an hourly summary' },
              { value: 'daily', label: 'Roll repeats into a daily summary' },
            ]}
            hint="Twenty containers going due-soon at once should be one message, not twenty."
          />
          <ToggleField
            label="Quiet hours"
            description="Holds email and SMS overnight. In-app notifications and webhooks are unaffected — nothing wakes anybody up."
            checked={notifications.quietHours.enabled}
            onChange={(v) => update('notifications', { quietHours: { enabled: v } })}
          />
          {notifications.quietHours.enabled ? (
            <>
              <TextField
                label="Quiet from"
                type="time"
                value={notifications.quietHours.from}
                onChange={(v) => update('notifications', { quietHours: { from: v } })}
              />
              <TextField
                label="Quiet until"
                type="time"
                value={notifications.quietHours.to}
                onChange={(v) => update('notifications', { quietHours: { to: v } })}
              />
            </>
          ) : null}
        </FieldGrid>
      </Panel>

      {groups.map((group) => (
        <Panel key={group} title={group} subtitle="Event, and the channels it goes out on" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/20">
                  <th className="px-5 py-2.5 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
                    Event
                  </th>
                  {CHANNELS.map((channel) => (
                    <th
                      key={channel.id}
                      className="w-24 px-2 py-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      {channel.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_EVENTS.filter((event) => event.group === group).map((event) => {
                  const rule = ruleFor(event.id);
                  return (
                    <tr key={event.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-bold text-foreground">{event.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                      </td>
                      {CHANNELS.map((channel) => {
                        const on = rule.channels.includes(channel.id);
                        return (
                          <td key={channel.id} className="px-2 py-3 text-center">
                            <button
                              type="button"
                              aria-label={`${event.label} via ${channel.label}`}
                              aria-pressed={on}
                              onClick={() => toggleChannel(event.id, channel.id)}
                              className={cn(
                                'h-6 w-6 rounded-md border transition-colors',
                                on
                                  ? 'border-primary bg-primary'
                                  : 'border-border bg-card hover:border-primary/40',
                              )}
                            >
                              {on ? (
                                <span className="block text-[13px] font-black leading-none text-primary-foreground">
                                  ✓
                                </span>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}

      <SectionNote>
        A channel selected here still needs its transport configured under Integrations — email needs SMTP, SMS
        needs a gateway, webhook needs a URL. Without one, that column is chosen but silent.
      </SectionNote>
    </div>
  );
}
