const crypto = require("crypto");

const ENDPOINT =
  "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/";
const unavailable = () =>
  Object.assign(
    new Error(
      "Chức năng gửi mã SMS chưa được kích hoạt. Vui lòng liên hệ hỗ trợ.",
    ),
    { status: 503 },
  );
const rejected = () =>
  Object.assign(
    new Error(
      "eSMS chưa chấp nhận gửi mã. Vui lòng kiểm tra cấu hình dịch vụ hoặc thử lại sau.",
    ),
    { status: 503 },
  );

// Uses the provider's OTP/CSKH POST API. The account's approved template is required;
// no trial brand/template is selected automatically, and credentials never enter URLs.
function createEsmsSender(
  env = process.env,
  { fetchImpl = globalThis.fetch, requestId = crypto.randomUUID } = {},
) {
  const configurationCheck = () => {
    const template = env.ESMS_OTP_TEMPLATE;
    if (
      !env.PASSWORD_RESET_SECRET ||
      env.PASSWORD_RESET_SECRET.length < 32 ||
      !env.ESMS_API_KEY?.trim() ||
      !env.ESMS_SECRET_KEY?.trim() ||
      !env.ESMS_BRANDNAME?.trim() ||
      env.ESMS_SMS_TYPE !== "2" ||
      !["0", "1"].includes(env.ESMS_IS_UNICODE || "0") ||
      typeof template !== "string" ||
      template.length > 500 ||
      (template.match(/\{PIN\}/g) || []).length !== 1 ||
      /[\u0000-\u001f\u007f]/.test(template)
    )
      throw unavailable();
  };
  const send = async ({ phone, pin }) => {
    configurationCheck();
    if (!/^0[35789]\d{8}$/.test(phone) || !/^\d{6}$/.test(pin))
      throw rejected();
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ApiKey: env.ESMS_API_KEY.trim(),
          SecretKey: env.ESMS_SECRET_KEY.trim(),
          Phone: phone,
          Brandname: env.ESMS_BRANDNAME.trim(),
          SmsType: "2",
          IsUnicode: env.ESMS_IS_UNICODE || "0",
          Sandbox: "0",
          Content: env.ESMS_OTP_TEMPLATE.replace("{PIN}", pin),
          RequestId: requestId(),
        }),
      });
      if (!response.ok) throw rejected();
      const result = await response.json();
      // 100 means accepted by eSMS, not confirmed delivery to the handset.
      if (
        String(result?.CodeResult) !== "100" ||
        typeof result.SMSID !== "string" ||
        !result.SMSID.trim()
      )
        throw rejected();
      return { provider: "esms", messageId: result.SMSID };
    } catch {
      // Provider errors and network exceptions can contain request data: do not expose them.
      throw rejected();
    }
  };
  send.configurationCheck = configurationCheck;
  return send;
}
module.exports = { createEsmsSender };
