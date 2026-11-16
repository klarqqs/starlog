import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { UserSecurityPage } from './UserSecurityPage';

const mockUseConfig = vi.fn();
const mockUseTwoFactorStatusQuery = vi.fn();

vi.mock('@/components/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/components/hooks')>('@/components/hooks');

  return {
    ...actual,
    useConfig: () => mockUseConfig(),
    useMessages: () => ({
      t: (value: string) => value,
      labels: {
        security: 'Security',
        password: 'Password',
        currentPassword: 'Current password',
        newPassword: 'New password',
        confirmPassword: 'Confirm password',
        save: 'Save',
        required: 'Required',
        twoFactorAuth: 'Two-factor authentication',
        twoFactorActive: 'Active',
        twoFactorStatusNotConfigured: 'Not configured',
        twoFactorEnable: 'Enable',
      },
      getErrorMessage: (error?: { message?: string }) => error?.message,
      messages: {
        twoFactorUserDescription: 'Protect your account with two-factor authentication.',
        minPasswordLength: 'At least {n} characters.',
        noMatchPassword: 'Passwords do not match.',
      },
    }),
    useTwoFactorStatusQuery: () => mockUseTwoFactorStatusQuery(),
    useUpdateQuery: () => ({ mutateAsync: vi.fn(), error: null, isPending: false }),
  };
});

test('renders password change panel and 2fa panel when cloudMode is disabled', () => {
  mockUseConfig.mockReturnValue({ cloudMode: false });
  mockUseTwoFactorStatusQuery.mockReturnValue({
    data: { isEnabled: false, isRequired: false, isConfigured: true },
    isLoading: false,
  });

  render(<UserSecurityPage />);

  expect(screen.getByText('Password')).toBeInTheDocument();
  expect(screen.getByLabelText('Current password')).toBeInTheDocument();
  expect(screen.getByText('Two-factor authentication')).toBeInTheDocument();
});

test('hides password panel when cloudMode is enabled', () => {
  mockUseConfig.mockReturnValue({ cloudMode: true });
  mockUseTwoFactorStatusQuery.mockReturnValue({
    data: { isEnabled: false, isRequired: false, isConfigured: true },
    isLoading: false,
  });

  render(<UserSecurityPage />);

  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  expect(screen.getByText('Two-factor authentication')).toBeInTheDocument();
});
