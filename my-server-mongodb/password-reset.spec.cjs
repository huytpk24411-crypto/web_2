const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const { MongoClient, ObjectId } = require("mongodb");
const { createPasswordReset } = require("./password-reset");

describe(
  "SMS password reset against isolated MongoDB",
  { concurrency: false },
  () => {
    const client = new MongoClient("mongodb://127.0.0.1:27017");
    const dbName = `iHouzzUniData_password_reset_test_${process.pid}`;
    const db = client.db(dbName),
      accounts = db.collection("Account");
    const store = new session.MemoryStore();
    let server, base, time, captured, failDelivery;
    const accountId = new ObjectId();
    const phone = "0991234567";
    const secret = "isolated-test-secret-never-use-in-production-123456789";
    const request = async (action, body, portal = "customer") => {
      const response = await fetch(base + "/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-iHouzz-Portal": portal,
        },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cache: response.headers.get("cache-control"),
      };
    };
    const pinRequest = async () => {
      const result = await request("request", { phone });
      assert.equal(result.status, 200);
      return { requestId: result.data.requestId, pin: captured.at(-1).pin };
    };
    const grant = async () => {
      const value = await pinRequest();
      const verified = await request("verify", value);
      assert.equal(verified.status, 200);
      return { requestId: value.requestId, token: verified.data.token };
    };
    before(async () => {
      await client.connect();
      assert.match(db.databaseName, /^iHouzzUniData_password_reset_test_\d+$/);
      const app = express();
      app.use(express.json());
      const dependencies = {
        database: db,
        accounts,
        sessionStore: store,
        normalizePhone: (value) =>
          typeof value === "string" ? value.replace(/^\+84/, "0") : "",
        validPhone: (value) => /^0\d{9}$/.test(value),
        portalOf: (req) => req.get("X-iHouzz-Portal"),
        portalRoles: {
          customer: "CUSTOMER",
          employee: "EMPLOYEE",
          admin: "ADMIN",
        },
        now: () => time,
      };
      const flow = createPasswordReset({
        ...dependencies,
        secret,
        sendPin: async (value) => {
          captured.push(value);
          if (failDelivery)
            throw Object.assign(new Error("SMS unavailable"), { status: 503 });
        },
      });
      const disabled = createPasswordReset({ ...dependencies, secret: "" });
      await flow.initialize();
      app.use("/reset", flow.router);
      app.use("/disabled", disabled.router);
      server = await new Promise((resolve) => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      });
      base = `http://127.0.0.1:${server.address().port}/reset`;
    });
    beforeEach(async () => {
      time = Date.now();
      captured = [];
      failDelivery = false;
      await Promise.all([
        db.collection("PasswordReset").deleteMany({}),
        db.collection("PasswordResetLimit").deleteMany({}),
        accounts.deleteMany({}),
      ]);
      await accounts.insertOne({
        _id: accountId,
        phone,
        role: "CUSTOMER",
        status: "ACTIVE",
        salt: "initial-test-salt",
        passwordHash: crypto
          .scryptSync("old-password", "initial-test-salt", 64)
          .toString("hex"),
      });
    });
    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      assert.match(db.databaseName, /^iHouzzUniData_password_reset_test_\d+$/);
      await db.dropDatabase();
      await client.close();
    });
    it("fails closed without configuration and never pretends to send SMS", async () => {
      const response = await fetch(
        base.replace("/reset", "/disabled") + "/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        },
      );
      assert.equal(response.status, 503);
      assert.equal(captured.length, 0);
      assert.equal(await db.collection("PasswordReset").countDocuments({}), 0);
    });
    it("verifies a PIN, changes the password once, and invalidates old sessions", async () => {
      await new Promise((resolve) =>
        store.set(
          "old-session",
          { cookie: {}, user: { id: accountId.toString() } },
          resolve,
        ),
      );
      const value = await pinRequest();
      const row = await db
        .collection("PasswordReset")
        .findOne({ _id: value.requestId });
      assert.equal(row.pin, undefined);
      assert.notEqual(row.pinHash, value.pin);
      assert.equal(row.state, "PENDING");
      assert.equal(
        (
          await request("complete", {
            requestId: value.requestId,
            token: "a".repeat(64),
            password: "new-password",
          })
        ).status,
        400,
      );
      const verified = await request("verify", value);
      assert.equal(verified.cache, "no-store");
      assert.equal(verified.data.pin, undefined);
      assert.equal(verified.status, 200);
      assert.equal((await request("verify", value)).status, 400);
      const body = {
        requestId: value.requestId,
        token: verified.data.token,
        password: "new-password",
      };
      assert.equal((await request("complete", body)).status, 200);
      assert.equal((await request("complete", body)).status, 400);
      const updated = await accounts.findOne({ _id: accountId });
      assert.equal(
        updated.passwordHash,
        crypto.scryptSync("new-password", updated.salt, 64).toString("hex"),
      );
      assert.equal(updated.passwordTemporary, false);
      assert.equal(
        await new Promise((resolve) =>
          store.get("old-session", (_, value) => resolve(value)),
        ),
        undefined,
      );
    });
    it("blocks brute force after five wrong PINs", async () => {
      const value = await pinRequest(),
        wrong = value.pin === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++)
        assert.equal(
          (await request("verify", { ...value, pin: wrong })).status,
          400,
        );
      assert.equal((await request("verify", value)).status, 400);
      assert.equal(
        (await db.collection("PasswordReset").findOne({ _id: value.requestId }))
          .attempts,
        5,
      );
    });
    it("enforces PIN and grant expiry before MongoDB TTL cleanup", async () => {
      const value = await pinRequest();
      time += 301000;
      assert.equal((await request("verify", value)).status, 400);
      const token = await grant();
      time += 301000;
      assert.equal(
        (await request("complete", { ...token, password: "new-password" }))
          .status,
        400,
      );
    });
    it("enforces the rolling resend cooldown and invalidates the previous PIN", async () => {
      const old = await pinRequest();
      assert.equal((await request("request", { phone })).status, 429);
      time += 61000;
      const current = await pinRequest();
      assert.equal((await request("verify", old)).status, 400);
      assert.equal((await request("verify", current)).status, 200);
    });
    it("binds requests and reset grants to the portal and hides unknown phone existence", async () => {
      const value = await pinRequest();
      assert.equal((await request("verify", value, "employee")).status, 400);
      const verified = await request("verify", value);
      assert.equal(
        (
          await request(
            "complete",
            {
              requestId: value.requestId,
              token: verified.data.token,
              password: "new-password",
            },
            "admin",
          )
        ).status,
        400,
      );
      const unknown = await request("request", { phone: "0981234567" });
      assert.equal(unknown.status, 200);
      assert.equal(captured.length, 1);
      assert.equal(unknown.data.pin, undefined);
    });
    it("does not activate a PIN when delivery fails", async () => {
      failDelivery = true;
      assert.equal((await request("request", { phone })).status, 503);
      const row = await db.collection("PasswordReset").findOne({});
      assert.equal(row.state, "FAILED");
      assert.equal(
        (await request("verify", { requestId: row._id, pin: captured[0].pin }))
          .status,
        400,
      );
    });
    it("allows only one concurrent use of a verified reset grant", async () => {
      const value = await grant();
      const responses = await Promise.all(
        ["password-one", "password-two"].map((password) =>
          request("complete", { ...value, password }),
        ),
      );
      assert.deepEqual(
        responses.map((value) => value.status).sort(),
        [200, 400],
      );
    });
    it("rejects short passwords without consuming a valid grant", async () => {
      const value = await grant();
      assert.equal(
        (await request("complete", { ...value, password: "short" })).status,
        400,
      );
      assert.equal(
        (await request("complete", { ...value, password: "valid-password" }))
          .status,
        200,
      );
    });
  },
);
