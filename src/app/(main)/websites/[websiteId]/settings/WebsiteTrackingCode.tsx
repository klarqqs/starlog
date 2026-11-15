import { Column, Label, Text, TextField } from '@umami/react-zen';
import { useConfig, useMessages } from '@/components/hooks';
import { TRACKER_INTEGRITY, trackerSrc, trackingSnippet } from '@/stellog/tracker-pin';

export function WebsiteTrackingCode({
  websiteId,
  hostUrl,
  showHeader = true,
}: {
  websiteId: string;
  hostUrl?: string;
  showHeader?: boolean;
}) {
  const { t, messages, labels } = useMessages();
  const config = useConfig();
  const origin = hostUrl || (typeof window === 'undefined' ? '' : window.location.origin);
  const src = trackerSrc(origin, process.env.basePath || '', config?.trackerScriptName);
  const code = trackingSnippet(src, TRACKER_INTEGRITY, websiteId);

  return (
    <Column gap>
      {showHeader && <Label>{t(labels.trackingCode)}</Label>}
      <Text color="muted">{t(messages.trackingCode)}</Text>
      <TextField
        value={code}
        isReadOnly
        allowCopy
        asTextArea
        resize="none"
        className="code-textarea"
      />
    </Column>
  );
}
