import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PROJECT_REPORT_SECTIONS, reportLabel } from '@/stellog/project-nav';
import { ProjectReportPage } from './ProjectReportPage';

export default async function ({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!PROJECT_REPORT_SECTIONS.includes(section as (typeof PROJECT_REPORT_SECTIONS)[number])) {
    notFound();
  }

  return <ProjectReportPage section={section} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: reportLabel(section) };
}
