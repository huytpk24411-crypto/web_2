const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createEsmsSender } = require("./sms-esms");
const { configuredSms } = require("./password-reset");

const config = () => ({
  SMS_PROVIDER: "esms",
  PASSWORD_RESET_SECRET: "independent-test-secret-12345678901234567890",
  ESMS_API_KEY: "test-api-key",
  ESMS_SECRET_KEY: "test-secret-key",
  ESMS_BRANDNAME: "ApprovedTestBrand",
  ESMS_SMS_TYPE: "2",
  ESMS_IS_UNICODE: "0",
  ESMS_OTP_TEMPLATE: "{PIN} la ma xac minh cho tai khoan test.",
});
const recipient = { phone: "0901234567", pin: "012345" };
describe("eSMS adapter (mock HTTP only, no paid messages)", () => {
  it("posts credentials in JSON to the fixed HTTPS API, with the exact template and a unique request id", async () => {
    let captured;
    const send = createEsmsSender(config(), {
      fetchImpl: async (url, options) => {
        captured = { url, options, body: JSON.parse(options.body) };
        return {
          ok: true,
          json: async () => ({ CodeResult: "100", SMSID: "sms-id" }),
        };
      },
      requestId: () => "test-request-id",
    });
    assert.deepEqual(await send(recipient), {
      provider: "esms",
      messageId: "sms-id",
    });
    assert.equal(
      captured.url,
      "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/",
    );
    assert.equal(captured.options.method, "POST");
    assert.equal(
      captured.body.Content,
      "012345 la ma xac minh cho tai khoan test.",
    );
    assert.equal(captured.body.Sandbox, "0");
    assert.equal(captured.body.RequestId, "test-request-id");
    assert.equal(captured.body.ApiKey, "test-api-key");
    assert.equal(captured.body.SecretKey, "test-secret-key");
    assert.ok(!captured.url.includes("test-secret-key"));
    assert.equal(captured.body.Brandname, "ApprovedTestBrand");
  });
  it("stays disabled until keys, approved brand, SMS type, template and reset secret are present", async () => {
    for (const field of [
      "ESMS_API_KEY",
      "ESMS_SECRET_KEY",
      "ESMS_BRANDNAME",
      "ESMS_SMS_TYPE",
      "ESMS_OTP_TEMPLATE",
      "PASSWORD_RESET_SECRET",
    ]) {
      const env = config();
      delete env[field];
      const sender = createEsmsSender(env, {
        fetchImpl: () => assert.fail("must not send"),
      });
      assert.throws(() => sender.configurationCheck(), { status: 503 });
      await assert.rejects(sender(recipient), { status: 503 });
    }
  });
  it("does not silently choose a demo template or allow an unsupported SMS type", () => {
    for (const patch of [
      { ESMS_OTP_TEMPLATE: "no placeholder" },
      { ESMS_OTP_TEMPLATE: "{PIN} {PIN}" },
      { ESMS_SMS_TYPE: "1" },
      { ESMS_IS_UNICODE: "5" },
    ]) {
      assert.throws(
        () => createEsmsSender({ ...config(), ...patch }).configurationCheck(),
        { status: 503 },
      );
    }
  });
  it("rejects all provider failures including HTTP 200 with a rejected template", async () => {
    for (const response of [
      { ok: false },
      {
        ok: true,
        json: async () => ({ CodeResult: "146", SMSID: "rejected" }),
      },
      { ok: true, json: async () => ({ CodeResult: "100" }) },
      {
        ok: true,
        json: async () => {
          throw new Error("invalid-json");
        },
      },
    ]) {
      await assert.rejects(
        createEsmsSender(config(), { fetchImpl: async () => response })(
          recipient,
        ),
        { status: 503 },
      );
    }
  });
  it("never exposes secrets, PINs or provider error bodies to callers", async () => {
    await assert.rejects(
      createEsmsSender(config(), {
        fetchImpl: async () => {
          throw new Error("test-secret-key 012345");
        },
      })(recipient),
      (error) =>
        error.status === 503 && !/test-secret-key|012345/.test(error.message),
    );
  });
  it("selects eSMS explicitly and keeps unknown providers disabled", () => {
    assert.doesNotThrow(() => configuredSms(config()).configurationCheck());
    assert.throws(
      () =>
        configuredSms({
          ...config(),
          SMS_PROVIDER: "unknown",
        }).configurationCheck(),
      { status: 503 },
    );
  });
});
