const crypto = require("crypto");
const { Router } = require("express");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
const invalidPin = () =>
  fail(
    400,
    "Mã PIN không đúng, đã hết hạn hoặc vượt quá số lần thử. Vui lòng yêu cầu mã mới.",
  );

// A private SMS adapter is configured by the operator after choosing a provider.
// Never return/log the PIN, and never enable a fake delivery path in the application.
function configuredSms(env = process.env) {
  const provider = (env.SMS_PROVIDER || "").trim().toLowerCase();
  if (provider === "esms") return require("./sms-esms").createEsmsSender(env);
  if (provider && provider !== "gateway") {
    const unavailable = () => {
      throw fail(
        503,
        "Chức năng gửi mã SMS chưa được kích hoạt. Vui lòng liên hệ hỗ trợ.",
      );
    };
    unavailable.configurationCheck = unavailable;
    return unavailable;
  }
  const configurationCheck = () => {
    let url;
    try {
      url = new URL(env.SMS_GATEWAY_URL);
    } catch {
      /* checked below */
    }
    if (
      url?.protocol !== "https:" ||
      !env.SMS_GATEWAY_TOKEN ||
      !env.PASSWORD_RESET_SECRET ||
      env.PASSWORD_RESET_SECRET.length < 32
    )
      throw fail(
        503,
        "Chức năng gửi mã SMS chưa được kích hoạt. Vui lòng liên hệ hỗ trợ.",
      );
    return url;
  };
  const send = async ({ phone, pin }) => {
    const url = configurationCheck();
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SMS_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        phone,
        message: `Ma PIN dat lai mat khau iHOUZZ Uni: ${pin}. Hieu luc 5 phut. Khong chia se ma nay voi bat ky ai.`,
        purpose: "PASSWORD_RESET",
      }),
    });
    if (!response.ok)
      throw fail(503, "Chưa gửi được SMS. Vui lòng thử lại sau.");
    const result = await response.json().catch(() => null);
    if (result?.accepted !== true)
      throw fail(503, "Chưa gửi được SMS. Vui lòng thử lại sau.");
  };
  send.configurationCheck = configurationCheck;
  return send;
}

function createPasswordReset({
  database,
  accounts,
  sessionStore,
  normalizePhone,
  validPhone,
  portalOf,
  portalRoles,
  sendPin = configuredSms(),
  secret = process.env.PASSWORD_RESET_SECRET,
  now = () => Date.now(),
}) {
  const router = Router();
  const requests = database.collection("PasswordReset");
  const limits = database.collection("PasswordResetLimit");
  const keyedHash = (value) =>
    crypto.createHmac("sha256", secret).update(value).digest("hex");
  const configured = () => {
    if (!secret || secret.length < 32)
      throw fail(
        503,
        "Chức năng gửi mã SMS chưa được kích hoạt. Vui lòng liên hệ hỗ trợ.",
      );
  };
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      configured();
      await fn(req, res);
    } catch (error) {
      res.status(error.status || 503).send({
        message: error.status
          ? error.message
          : "Không thể xử lý yêu cầu. Vui lòng thử lại sau.",
      });
    }
  };
  async function rate(key, max, windowMs) {
    const bucket = Math.floor(now() / windowMs);
    const row = await limits.findOneAndUpdate(
      { _id: keyedHash(`${key}:${bucket}`) },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs + 60000) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (row.count > max)
      throw fail(429, "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.");
  }
  async function ipLimit(req) {
    await rate(`ip:${req.ip}`, 60, 3600000);
  }
  router.post(
    "/request",
    wrap(async (req, res) => {
      if (sendPin.configurationCheck) sendPin.configurationCheck();
      await ipLimit(req);
      const phone = normalizePhone(req.body?.phone);
      if (!validPhone(phone) || !/^0[35789]\d{8}$/.test(phone))
        throw fail(400, "Số điện thoại không hợp lệ.");
      // Shared across portals: switching portals cannot bypass phone throttling.
      await rate(`phone:${phone}`, 5, 3600000);
      // Atomic rolling cooldown, unlike a fixed minute bucket at the boundary.
      const gateId = keyedHash(`cooldown:${phone}`);
      try {
        const gate = await limits.findOneAndUpdate(
          {
            _id: gateId,
            $or: [
              { nextAt: { $lte: new Date(now()) } },
              { nextAt: { $exists: false } },
            ],
          },
          {
            $set: {
              nextAt: new Date(now() + 60000),
              expiresAt: new Date(now() + 3600000),
            },
          },
          { upsert: true, returnDocument: "after" },
        );
        if (!gate)
          throw fail(429, "Vui lòng chờ 60 giây trước khi yêu cầu mã mới.");
      } catch (error) {
        if (error.code === 11000)
          throw fail(429, "Vui lòng chờ 60 giây trước khi yêu cầu mã mới.");
        throw error;
      }
      const role = portalRoles[portalOf(req) || "customer"];
      const account = await accounts.findOne({ phone, role, status: "ACTIVE" });
      const id = crypto.randomBytes(32).toString("hex"),
        pin = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
      const expiresAt = new Date(now() + 5 * 60000);
      // Check delivery configuration even for unknown accounts without exposing existence.
      const row = {
        _id: id,
        phoneHash: keyedHash(phone),
        role,
        accountId: account?._id || null,
        passwordVersion: account?.passwordHash || null,
        pinHash: keyedHash(`${id}:${pin}`),
        attempts: 0,
        state: "SENDING",
        expiresAt,
        createdAt: new Date(now()),
      };
      await requests.insertOne(row);
      try {
        if (account) await sendPin({ phone, pin });
        // A resend invalidates earlier PINs and reset grants for this phone in this portal.
        await requests.updateMany(
          {
            phoneHash: row.phoneHash,
            role,
            _id: { $ne: id },
            state: { $in: ["PENDING", "VERIFIED"] },
          },
          { $set: { state: "SUPERSEDED" } },
        );
        await requests.updateOne(
          { _id: id, state: "SENDING" },
          { $set: { state: "PENDING" } },
        );
      } catch (error) {
        await requests.updateOne({ _id: id }, { $set: { state: "FAILED" } });
        throw error;
      }
      res.send({
        requestId: id,
        expiresIn: 300,
        resendAfter: 60,
        message:
          "Nếu số điện thoại đã đăng ký tại cổng này, mã PIN sẽ được gửi qua SMS.",
      });
    }),
  );
  router.post(
    "/verify",
    wrap(async (req, res) => {
      await ipLimit(req);
      const { requestId, pin } = req.body || {};
      if (
        typeof requestId !== "string" ||
        !/^[a-f0-9]{64}$/.test(requestId) ||
        typeof pin !== "string" ||
        !/^\d{6}$/.test(pin)
      )
        throw invalidPin();
      const role = portalRoles[portalOf(req) || "customer"];
      const row = await requests.findOneAndUpdate(
        {
          _id: requestId,
          role,
          state: "PENDING",
          attempts: { $lt: 5 },
          expiresAt: { $gt: new Date(now()) },
        },
        { $inc: { attempts: 1 } },
        { returnDocument: "after" },
      );
      const digest = keyedHash(`${requestId}:${pin}`);
      if (
        !row ||
        !row.accountId ||
        !crypto.timingSafeEqual(
          Buffer.from(row.pinHash, "hex"),
          Buffer.from(digest, "hex"),
        )
      )
        throw invalidPin();
      const token = crypto.randomBytes(32).toString("hex");
      const granted = await requests.updateOne(
        {
          _id: requestId,
          state: "PENDING",
          attempts: row.attempts,
          expiresAt: { $gt: new Date(now()) },
        },
        {
          $set: {
            state: "VERIFIED",
            tokenHash: hash(token),
            expiresAt: new Date(now() + 5 * 60000),
          },
          $unset: { pinHash: "" },
        },
      );
      if (!granted.modifiedCount) throw invalidPin();
      res.send({ token, expiresIn: 300 });
    }),
  );
  router.post(
    "/complete",
    wrap(async (req, res) => {
      await ipLimit(req);
      const { requestId, token, password } = req.body || {};
      if (
        typeof requestId !== "string" ||
        !/^[a-f0-9]{64}$/.test(requestId) ||
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token)
      )
        throw invalidPin();
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      )
        throw fail(400, "Mật khẩu cần từ 8 đến 128 ký tự.");
      const role = portalRoles[portalOf(req) || "customer"];
      const row = await requests.findOneAndUpdate(
        {
          _id: requestId,
          role,
          state: "VERIFIED",
          tokenHash: hash(token),
          expiresAt: { $gt: new Date(now()) },
        },
        {
          $set: { state: "USED", usedAt: new Date(now()) },
          $unset: { tokenHash: "" },
        },
        { returnDocument: "before" },
      );
      if (!row) throw invalidPin();
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = await new Promise((resolve, reject) =>
        crypto.scrypt(password, salt, 64, (error, key) =>
          error ? reject(error) : resolve(key.toString("hex")),
        ),
      );
      const updated = await accounts.updateOne(
        {
          _id: row.accountId,
          status: "ACTIVE",
          role,
          passwordHash: row.passwordVersion,
        },
        {
          $set: {
            salt,
            passwordHash,
            passwordTemporary: false,
            passwordChangedAt: new Date(now()),
            updatedAt: new Date(now()),
          },
        },
      );
      if (!updated.modifiedCount) throw invalidPin();
      await requests.updateMany(
        { accountId: row.accountId, state: { $in: ["PENDING", "VERIFIED"] } },
        { $set: { state: "SUPERSEDED" } },
      );
      // Invalidate sessions in every portal; the user signs in with the new password.
      const sessions = await new Promise((resolve, reject) =>
        sessionStore.all((error, rows) =>
          error ? reject(error) : resolve(rows),
        ),
      );
      await Promise.all(
        Object.entries(sessions || {})
          .filter(([, value]) => value.user?.id === row.accountId.toString())
          .map(
            ([id]) =>
              new Promise((resolve, reject) =>
                sessionStore.destroy(id, (error) =>
                  error ? reject(error) : resolve(),
                ),
              ),
          ),
      );
      res.send({
        message: "Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.",
      });
    }),
  );
  return {
    router,
    initialize: async () => {
      await requests.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await requests.createIndex({ phoneHash: 1, role: 1, state: 1 });
      await limits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    },
  };
}
module.exports = { createPasswordReset, configuredSms };
