import type { Metadata } from 'next';
import { EnrollmentPage } from './EnrollmentPage';

export default function () {
  return <EnrollmentPage />;
}

export const metadata: Metadata = {
  title: 'Enrollment',
};
