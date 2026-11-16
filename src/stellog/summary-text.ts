import { z } from 'zod';

const summarySchema = z.object({
  headline: z.string().min(1).max(120),
  paragraphs: z.array(z.string().min(1).max(500)).min(1).max(4),
  table: z
    .object({
      columns: z.array(z.string().min(1).max(40)).min(1).max(6),
      rows: z.array(z.array(z.string().max(80)).max(6)).max(8),
    })
    .nullable(),
  bars: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        value: z.number().finite().nonnegative(),
      }),
    )
    .max(8)
    .nullable(),
});

export type AiSummary = z.infer<typeof summarySchema>;

export type SummaryScope = 'projects' | 'overview' | 'apis' | 'website';

/** Pull a JSON object out of a model reply. */
export function parseSummary(text: string): AiSummary | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = summarySchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
