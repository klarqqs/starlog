// Adapted from umami src/components/common/PageHeader.tsx (MIT).
import { Column, Grid, Heading, Row, Text } from '@umami/react-zen';

export function PageHeader({ title, description, children }) {
  return (
    <Grid columns="1fr auto" paddingY="6" marginBottom="6" border="bottom" alignItems="center">
      <Column gap="2">
        {title && <Heading size="3xl">{title}</Heading>}
        {description && <Text color="muted" style={{ maxWidth: 680 }}>{description}</Text>}
      </Column>
      <Row justifyContent="flex-end" alignItems="center">{children}</Row>
    </Grid>
  );
}
