import { Box, Column, Icon, Text } from '@umami/react-zen';
import type { ReactNode } from 'react';

export interface EmptyPlaceholderProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  minHeight?: string;
  children?: ReactNode;
}

export function EmptyPlaceholder({
  title,
  description,
  icon,
  minHeight,
  children,
}: EmptyPlaceholderProps) {
  return (
    <Column
      alignItems="center"
      justifyContent="center"
      gap="5"
      height="100%"
      width="100%"
      minHeight={minHeight}
    >
      {icon && (
        <Icon color="muted" size="xl">
          {icon}
        </Icon>
      )}
      {title && (
        <Text weight="bold" size="base">
          {title}
        </Text>
      )}
      {description && (
        <Box maxWidth="560px">
          <Text as="div" color="muted" align="center">
            {description}
          </Text>
        </Box>
      )}
      {children}
    </Column>
  );
}

/** The Umami empty card: a title, a short line, and an optional action. */
export function EmptyCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <EmptyPlaceholder title={title} description={description} minHeight="240px">
      {children}
    </EmptyPlaceholder>
  );
}
