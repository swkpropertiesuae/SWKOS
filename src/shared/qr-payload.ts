/** Shape of a reception code: SWK2 is the fixed code, SWK1 the 30-second rotating one. The check-in page uses this to decide what its camera accepts, so it must match what the server issues. */
export const QR_PAYLOAD_RE = /^SWK[12]\.[A-Za-z0-9_-]{40,200}$/
