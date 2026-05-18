export const AUTH_ERROR_MESSAGES = {
  generic: 'Authentication failed. Please try again.',
  missingOAuthParams: 'No authorization code provided.',
  githubCancelled: 'GitHub authentication was cancelled',
} as const;

export const AUTH_NOTICE_MESSAGES = {
  signInRequired: 'Please sign in to continue.',
} as const;

export const AUTH_NOTICE_QUERY_VALUES = {
  signInRequired: 'sign-in-required',
} as const;

export const GITHUB_PROFILE_CONFLICT_MESSAGES = {
  email:
    'This GitHub account uses an email address that is already connected to another OpenML account.',
  username:
    'This GitHub account uses a username that is already connected to another OpenML account.',
  github_id: 'This GitHub account is already connected to another OpenML account.',
} as const;

const USER_FACING_AUTH_ERRORS = new Set<string>([
  ...Object.values(AUTH_ERROR_MESSAGES),
  ...Object.values(GITHUB_PROFILE_CONFLICT_MESSAGES),
]);

export function sanitizeAuthErrorMessage(message: string | null | undefined): string | null {
  const normalizedMessage = message?.trim();

  if (!normalizedMessage) {
    return null;
  }

  return USER_FACING_AUTH_ERRORS.has(normalizedMessage)
    ? normalizedMessage
    : AUTH_ERROR_MESSAGES.generic;
}

export function loginErrorUrl(message: string): string {
  const sanitizedMessage = sanitizeAuthErrorMessage(message) ?? AUTH_ERROR_MESSAGES.generic;

  return `/login?error=${encodeURIComponent(sanitizedMessage)}`;
}

export function getAuthNoticeMessage(notice: string | null | undefined): string | null {
  if (notice === AUTH_NOTICE_QUERY_VALUES.signInRequired) {
    return AUTH_NOTICE_MESSAGES.signInRequired;
  }

  return null;
}
