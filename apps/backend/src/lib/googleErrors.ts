export function isInvalidGrant(e: any): boolean {
  const code = (e?.code ?? e?.response?.status);
  const err  = e?.response?.data?.error || e?.error || '';
  const desc = e?.response?.data?.error_description || e?.message || '';
  return code === 400 && (
    String(err).includes('invalid_grant') ||
    String(desc).includes('invalid_grant') ||
    String(desc).includes('Token has been expired or revoked')
  );
}
