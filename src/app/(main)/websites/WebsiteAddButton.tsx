import { Button, Column, Row, useToast } from '@umami/react-zen';
import { useState } from 'react';
import { IconLabel } from '@/components/common/IconLabel';
import { useConfig, useMessages, useModified } from '@/components/hooks';
import { Plus } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import { WebsiteTrackingCode } from './[websiteId]/settings/WebsiteTrackingCode';
import { WebsiteAddForm } from './WebsiteAddForm';

export function WebsiteAddButton({
  teamId,
  kind = 'site',
  onSave,
}: {
  teamId?: string;
  kind?: 'site' | 'api';
  onSave?: () => void;
}) {
  const { t, labels, messages } = useMessages();
  const { toast } = useToast();
  const { touch } = useModified();
  const { cloudMode } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [createdWebsite, setCreatedWebsite] = useState<{ id: string } | null>(null);

  const label = kind === 'api' ? 'Add API' : 'Add site';

  const handleSave = async (website: { id: string }) => {
    toast(t(messages.saved));
    touch('websites');
    onSave?.();

    if (cloudMode && kind === 'site') {
      setCreatedWebsite(website);
    } else {
      setIsOpen(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      setCreatedWebsite(null);
    }
  };

  return (
    <>
      <Button onPress={() => handleOpenChange(true)} variant="primary">
        <IconLabel icon={<Plus />} label={label} />
      </Button>
      <DialogButton
        title={createdWebsite ? t(labels.trackingCode) : label}
        width={createdWebsite ? '720px' : '400px'}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
      >
        {({ close }) =>
          createdWebsite ? (
            <TrackingCodeStep
              websiteId={createdWebsite.id}
              onClose={() => handleOpenChange(false)}
            />
          ) : (
            <WebsiteAddForm
              teamId={teamId}
              kind={kind}
              onSave={handleSave}
              onClose={close}
              closeOnSave={!cloudMode || kind === 'api'}
            />
          )
        }
      </DialogButton>
    </>
  );
}

function TrackingCodeStep({ websiteId, onClose }: { websiteId: string; onClose: () => void }) {
  const { t, labels } = useMessages();

  return (
    <Column gap="4">
      <WebsiteTrackingCode websiteId={websiteId} showHeader={false} />
      <Row justifyContent="flex-end" paddingTop="2">
        <Button onPress={onClose}>{t(labels.close)}</Button>
      </Row>
    </Column>
  );
}
