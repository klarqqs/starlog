// Adapted from umami src/components/metrics/MetricsBar.tsx (MIT).
import { Box, Grid } from '@umami/react-zen';
import { createContext, useContext } from 'react';

const MetricsBarJoinedContext = createContext(false);
export function useMetricsBarJoined() {
  return useContext(MetricsBarJoinedContext);
}

export function MetricsBar({ joined = true, children, ...props }) {
  if (joined) {
    return (
      <Box border borderRadius backgroundColor="surface" overflow="hidden">
        <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" {...props}>
          <MetricsBarJoinedContext.Provider value={true}>{children}</MetricsBarJoinedContext.Provider>
        </Grid>
      </Box>
    );
  }
  return (
    <Grid columns="repeat(auto-fit, minmax(160px, 1fr))" gap {...props}>
      {children}
    </Grid>
  );
}
