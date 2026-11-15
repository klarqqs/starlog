// Adapted from umami src/components/common/Panel.tsx (MIT).
import { Column, Heading, Text } from '@umami/react-zen';

export function Panel({ title, description, children, ...props }) {
  return (
    <Column paddingY="6" paddingX="6" border borderRadius backgroundColor="surface" gap {...props}>
      {title && <Heading>{title}</Heading>}
      {description && <Text color="muted">{description}</Text>}
      {children}
    </Column>
  );
}
