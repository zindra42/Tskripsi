// Domain-agnostic links from the Laravel payload remain internal on the new host.
// Payloads themselves are retained verbatim for import/audit.
export function notificationUrl(value: unknown) {
  if (typeof value !== "string" || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://sias.invalid");
    if (!["http:", "https:"].includes(url.protocol) || value.startsWith("//")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
