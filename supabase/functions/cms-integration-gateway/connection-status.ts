/** Status written when the upstream CMS call throws (DNS, timeout, connection reset). */
export function cmsConnectionPatchForThrownUpstream(message: string, correlationId: string) {
  return {
    status: "error" as const,
    last_error: message.slice(0, 500),
    last_test_json: { ok: false as const, error: message, correlation_id: correlationId },
  };
}
