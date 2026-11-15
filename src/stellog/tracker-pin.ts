import pin from '@/stellog/tracker-pin.json';

/** Stellog tracker release. A new number is a new file; older files stay. */
export const TRACKER_VERSION = '1';

/** Chosen so the URL does not contain script.js, collect, analytics, or umami. */
export const TRACKER_FILE = `s/${TRACKER_VERSION}.js`;

/** Chosen so the collect URL does not contain /api/send. */
export const COLLECT_PATH = '/s/e';

export const TRACKER_INTEGRITY = pin.integrity;

export function trackerSrc(origin: string, basePath = '', configured?: string | null) {
  const custom = configured?.split(',')[0]?.trim();
  if (custom && !/^https?:\/\//i.test(custom)) {
    return `${origin}${basePath}/${custom.replace(/^\/+/, '')}`;
  }
  return `${origin}${basePath}/${TRACKER_FILE}`;
}

export function trackingSnippet(src: string, integrity: string, websiteId: string) {
  return `<script defer src="${src}" integrity="${integrity}" crossorigin="anonymous" data-website-id="${websiteId}"></script>`;
}

export function isPinnedTrackerPath(filePath: string) {
  return /(?:^|[/\\])public[/\\]s[/\\]/.test(filePath);
}
