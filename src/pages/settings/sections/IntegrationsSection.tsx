import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import {
  FieldGrid,
  NumberField,
  SecretField,
  SectionNote,
  SelectField,
  TextField,
  ToggleField,
} from '../components/fields';

/** Model choices per provider. Ids, not marketing names — they go on the wire. */
const AI_MODELS: Record<string, ReadonlyArray<{ value: string; label: string }>> = {
  anthropic: [
    { value: 'claude-opus-5', label: 'Claude Opus 5 — most capable' },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  none: [],
};

/**
 * Everything the app talks to that is not its own backend.
 *
 * The security position, stated plainly and repeated on the screen: these keys
 * live in the browser's local storage. Anything running on the page can read
 * them, and so can anyone with the machine. They are here so an operator can
 * configure and try the integrations without a deploy — the moment one of
 * these is a real production key, it belongs behind the backend and this field
 * should hold nothing.
 */
export function IntegrationsSection() {
  const integrations = useSystemSettings().integrations;
  const update = useSettingsStore((s) => s.update);
  const ai = integrations.ai;
  // A provider with no listed models still has to show whatever is configured,
  // so the select never renders empty.
  const models = AI_MODELS[ai.provider]?.length
    ? (AI_MODELS[ai.provider] as ReadonlyArray<{ value: string; label: string }>)
    : [{ value: ai.model, label: ai.model || 'No model' }];

  return (
    <div className="flex flex-col gap-4">
      <SectionNote tone="warning">
        Keys entered on this page are stored in this browser, not on the server. Treat them as readable by anyone
        with access to this machine, and use a key scoped to the narrowest permissions the provider offers. A
        production deployment must hold its keys behind the backend instead.
      </SectionNote>

      <Panel title="AI assistant" subtitle="Document reading, route suggestions and the in-app assistant">
        <FieldGrid>
          <ToggleField
            label="Enable AI features"
            description="Off, nothing is sent to a model and every feature below is inert regardless of its own switch."
            checked={ai.enabled}
            onChange={(v) => update('integrations', { ai: { enabled: v } })}
          />
          <SelectField
            label="Provider"
            value={ai.provider}
            onChange={(v) =>
              update('integrations', {
                ai: { provider: v, model: AI_MODELS[v]?.[0]?.value ?? '' },
              })
            }
            options={[
              { value: 'anthropic', label: 'Anthropic (Claude)' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'none', label: 'None' },
            ]}
          />
          <SelectField
            label="Model"
            value={ai.model}
            onChange={(v) => update('integrations', { ai: { model: v } })}
            options={models}
            hint="A faster model is enough for extracting fields off a delivery note; reserve the capable one for reasoning over a shipment."
          />
          <SecretField
            label="API key"
            value={ai.apiKey}
            onChange={(v) => update('integrations', { ai: { apiKey: v } })}
            placeholder="sk-…"
            hint="Stored in this browser. See the warning above."
          />
          <TextField
            label="Base URL"
            value={ai.baseUrl}
            onChange={(v) => update('integrations', { ai: { baseUrl: v } })}
            placeholder="Leave blank for the provider's own endpoint"
            mono
            hint="Set this to route through a proxy or a self-hosted gateway."
          />
          <NumberField
            label="Max tokens per call"
            value={ai.maxTokens}
            onChange={(v) => update('integrations', { ai: { maxTokens: v } })}
            min={256}
            max={64000}
            step={256}
            hint="A ceiling, so one bad prompt cannot run up a bill."
          />

          <ToggleField
            label="Document extraction"
            description="Reads fields off an uploaded delivery note, invoice or licence instead of retyping them."
            checked={ai.features.documentExtraction}
            onChange={(v) => update('integrations', { ai: { features: { documentExtraction: v } } })}
          />
          <ToggleField
            label="Route suggestions"
            description="Proposes backhaul pairings and container-return sequences from live positions."
            checked={ai.features.routeSuggestions}
            onChange={(v) => update('integrations', { ai: { features: { routeSuggestions: v } } })}
          />
          <ToggleField
            label="In-app assistant"
            description="Answers questions about shipments, partners and money using what is on screen."
            checked={ai.features.chatAssistant}
            onChange={(v) => update('integrations', { ai: { features: { chatAssistant: v } } })}
          />
          <ToggleField
            label="Anomaly detection"
            description="Flags a rate, a dwell time or a cost line that does not look like the others."
            checked={ai.features.anomalyDetection}
            onChange={(v) => update('integrations', { ai: { features: { anomalyDetection: v } } })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="Email" subtitle="Outbound mail — invoices, alerts and access decisions">
        <FieldGrid>
          <ToggleField
            label="Send email"
            description="Off, notifications selected for email are simply not sent."
            checked={integrations.email.enabled}
            onChange={(v) => update('integrations', { email: { enabled: v } })}
          />
          <TextField
            label="From name"
            value={integrations.email.fromName}
            onChange={(v) => update('integrations', { email: { fromName: v } })}
          />
          <TextField
            label="From address"
            type="email"
            value={integrations.email.fromAddress}
            onChange={(v) => update('integrations', { email: { fromAddress: v } })}
          />
          <TextField
            label="Reply-to"
            type="email"
            value={integrations.email.replyTo}
            onChange={(v) => update('integrations', { email: { replyTo: v } })}
            hint="Optional. Where a client's reply to an invoice lands."
          />
          <TextField
            label="SMTP host"
            value={integrations.email.smtpHost}
            onChange={(v) => update('integrations', { email: { smtpHost: v } })}
            mono
          />
          <NumberField
            label="SMTP port"
            value={integrations.email.smtpPort}
            onChange={(v) => update('integrations', { email: { smtpPort: v } })}
            min={1}
            max={65535}
          />
          <TextField
            label="SMTP user"
            value={integrations.email.smtpUser}
            onChange={(v) => update('integrations', { email: { smtpUser: v } })}
            mono
          />
          <SecretField
            label="SMTP password"
            value={integrations.email.smtpPassword}
            onChange={(v) => update('integrations', { email: { smtpPassword: v } })}
          />
          <ToggleField
            label="Use TLS"
            description="Required by every reputable provider on port 587."
            checked={integrations.email.useTls}
            onChange={(v) => update('integrations', { email: { useTls: v } })}
          />
        </FieldGrid>
      </Panel>

      <Panel title="SMS" subtitle="For the alerts a driver or dispatcher must see away from a screen">
        <FieldGrid>
          <ToggleField
            label="Send SMS"
            checked={integrations.sms.enabled}
            onChange={(v) => update('integrations', { sms: { enabled: v } })}
            description="Reserved for the short list of events worth a phone buzzing — a container past free time, a hold opened."
          />
          <SelectField
            label="Gateway"
            value={integrations.sms.provider}
            onChange={(v) => update('integrations', { sms: { provider: v } })}
            options={[
              { value: 'twilio', label: 'Twilio' },
              { value: 'africastalking', label: "Africa's Talking" },
              { value: 'custom', label: 'Custom HTTP gateway' },
            ]}
          />
          <TextField
            label="Sender ID"
            value={integrations.sms.senderId}
            onChange={(v) => update('integrations', { sms: { senderId: v } })}
            hint="What the message shows as. Alphanumeric sender IDs need registration with most carriers."
          />
          <SecretField
            label="API key"
            value={integrations.sms.apiKey}
            onChange={(v) => update('integrations', { sms: { apiKey: v } })}
          />
          {integrations.sms.provider === 'custom' ? (
            <TextField
              label="Gateway URL"
              value={integrations.sms.baseUrl}
              onChange={(v) => update('integrations', { sms: { baseUrl: v } })}
              mono
            />
          ) : null}
        </FieldGrid>
      </Panel>

      <Panel title="Vehicle tracking" subtitle="The telematics feed behind live positions and ETA drift">
        <FieldGrid>
          <ToggleField
            label="Pull vehicle positions"
            description="Without a feed, positions come from milestone updates entered by hand and ETA drift is only as fresh as the last one."
            checked={integrations.tracking.enabled}
            onChange={(v) => update('integrations', { tracking: { enabled: v } })}
          />
          <TextField
            label="Provider"
            value={integrations.tracking.provider}
            onChange={(v) => update('integrations', { tracking: { provider: v } })}
            placeholder="e.g. Wialon, Traccar"
          />
          <SecretField
            label="API key"
            value={integrations.tracking.apiKey}
            onChange={(v) => update('integrations', { tracking: { apiKey: v } })}
          />
          <NumberField
            label="Poll interval"
            value={integrations.tracking.pollIntervalSeconds}
            onChange={(v) => update('integrations', { tracking: { pollIntervalSeconds: v } })}
            min={15}
            max={3600}
            suffix="sec"
            hint="Faster polling costs API quota and rarely changes a decision on a multi-day haul."
          />
        </FieldGrid>
      </Panel>

      <Panel title="Storage & API" subtitle="Where uploads land, and which backend the app talks to">
        <FieldGrid>
          <SelectField
            label="Document storage"
            value={integrations.storage.provider}
            onChange={(v) => update('integrations', { storage: { provider: v } })}
            options={[
              { value: 'backend', label: 'Managed by the backend' },
              { value: 's3', label: 'S3-compatible bucket' },
            ]}
          />
          {integrations.storage.provider === 's3' ? (
            <>
              <TextField
                label="Bucket"
                value={integrations.storage.bucket}
                onChange={(v) => update('integrations', { storage: { bucket: v } })}
                mono
              />
              <TextField
                label="Region"
                value={integrations.storage.region}
                onChange={(v) => update('integrations', { storage: { region: v } })}
                mono
              />
            </>
          ) : null}
          <NumberField
            label="Maximum upload size"
            value={integrations.storage.maxUploadMb}
            onChange={(v) => update('integrations', { storage: { maxUploadMb: v } })}
            min={1}
            max={200}
            suffix="MB"
          />
          <TextField
            label="API base URL"
            value={integrations.apiBaseUrl}
            onChange={(v) => update('integrations', { apiBaseUrl: v })}
            placeholder="Leave blank to use the build-time value"
            mono
            hint="Overrides the endpoint the app was built against. Wrong here means nothing loads at all."
          />
          <TextField
            label="Webhook URL"
            value={integrations.webhookUrl}
            onChange={(v) => update('integrations', { webhookUrl: v })}
            placeholder="https://…"
            mono
            hint="Events selected for the webhook channel in Notifications are POSTed here."
          />
          <SecretField
            label="Webhook signing secret"
            value={integrations.webhookSecret}
            onChange={(v) => update('integrations', { webhookSecret: v })}
            hint="Signs the payload so the receiver can tell a genuine delivery from a forged one."
          />
        </FieldGrid>
      </Panel>
    </div>
  );
}
