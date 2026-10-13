/**
 * One-time temporary password display policy.
 * Password lives only in React state (memory). Never persist to storage/DB/logs.
 */

export type LoadPasswordOptions = {
  /** When false, a successful Generate must keep the password visible after refresh. */
  clearOneTimePassword?: boolean;
};

/** Pure helper used by StaffDetailPage load() and regression tests. */
export function nextOneTimePasswordAfterLoad(
  current: string | null,
  options: LoadPasswordOptions = {},
): string | null {
  if (options.clearOneTimePassword === false) return current;
  return null;
}

export function assertGenerateResponseHasPassword(data: {
  temporary_password?: unknown;
  error?: unknown;
}): string {
  if (data?.error) {
    throw new Error(String(data.error));
  }
  const pw = data?.temporary_password;
  if (typeof pw !== 'string' || pw.length < 12) {
    throw new Error('No password returned');
  }
  return pw;
}
