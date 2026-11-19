import { Icon, Row, Text } from '@umami/react-zen';
import { X } from '@/components/icons';

export function FilterChip({
  name,
  label,
  operator,
  value,
  onRemove,
}: {
  name: string;
  label: string;
  operator: string;
  value: string;
  onRemove: (name: string) => void;
}) {
  return (
    <Row
      border
      padding="2"
      color
      backgroundColor
      borderRadius
      alignItems="center"
      justifyContent="space-between"
      theme="dark"
    >
      <Row alignItems="center" gap="4">
        <Row
          alignItems="center"
          gap="2"
          style={{ maxWidth: 'min(500px, calc(100vw - 10rem))', minWidth: 0, overflow: 'hidden' }}
        >
          <Text color="primary" weight="bold">
            {label}
          </Text>
          <Text color="muted">{operator}</Text>
          <Text
            color="primary"
            weight="bold"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {value}
          </Text>
        </Row>
        <Icon
          aria-label={`Remove ${label}`}
          onClick={() => onRemove(name)}
          size="xs"
          style={{ cursor: 'pointer' }}
        >
          <X />
        </Icon>
      </Row>
    </Row>
  );
}
