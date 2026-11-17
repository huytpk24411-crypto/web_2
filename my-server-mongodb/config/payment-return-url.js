const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function invalidReturnUrl() {
  return Object.assign(
    new Error("Địa chỉ quay về sau thanh toán chưa được cấu hình phù hợp."),
    { status: 400, code: "PAYMENT_RETURN_URL_INVALID" },
  );
}

function parseAppUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw invalidReturnUrl();
    return url;
  } catch {
    throw invalidReturnUrl();
  }
}

function paymentReturnAppUrl(req, environment = process.env) {
  const configured = parseAppUrl(
    environment.CUSTOMER_APP_URL ||
      `http://localhost:${environment.CUSTOMER_PORT || 4200}`,
  );
  const origin = req?.get("origin");
  if (!origin) return configured.href.replace(/\/+$/, "");

  const browser = parseAppUrl(origin);
  if (browser.pathname !== "/") throw invalidReturnUrl();
  if (browser.origin === configured.origin)
    return configured.href.replace(/\/+$/, "");

  // A host-only session cookie must return to the same local browser hostname.
  // Local Angular ports may differ between independent development checkouts.
  if (
    loopbackHosts.has(browser.hostname) &&
    loopbackHosts.has(configured.hostname)
  )
    return `${browser.origin}${configured.pathname}`.replace(/\/+$/, "");

  throw invalidReturnUrl();
}

module.exports = { paymentReturnAppUrl };
