const { test } = require("node:test");
const assert = require("node:assert/strict");
const { paymentReturnAppUrl } = require("./config/payment-return-url");
const request = (origin) => ({ get: () => origin });

test("payOS returns to the local hostname and port used by the browser", () => {
  for (const origin of [
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    "http://localhost:4370",
    "http://[::1]:4200",
  ])
    assert.equal(
      paymentReturnAppUrl(request(origin), {
        CUSTOMER_APP_URL: "http://localhost:4200",
      }),
      origin,
    );
});

test("configured public app URL and base path are retained", () => {
  assert.equal(
    paymentReturnAppUrl(request("https://rooms.example"), {
      CUSTOMER_APP_URL: "https://rooms.example/customer/",
    }),
    "https://rooms.example/customer",
  );
  assert.equal(
    paymentReturnAppUrl(request(), { CUSTOMER_PORT: "4370" }),
    "http://localhost:4370",
  );
});

test("foreign origins, credentials, invalid protocols and malformed origins are rejected", () => {
  for (const origin of [
    "https://untrusted.example",
    "null",
    "javascript:alert(1)",
    "http://user:password@localhost:4200",
    "http://localhost:4200/other",
    "http://localhost:4200?redirect=elsewhere",
  ])
    assert.throws(
      () =>
        paymentReturnAppUrl(request(origin), {
          CUSTOMER_APP_URL: "http://localhost:4200",
        }),
      { code: "PAYMENT_RETURN_URL_INVALID" },
    );
});
