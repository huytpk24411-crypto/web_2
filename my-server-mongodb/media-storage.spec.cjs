const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createMediaStorage } = require("./media-storage");
const { registerMediaRoutes } = require("./routes/media-routes");

const config = { MEDIA_STORAGE: "supabase", SUPABASE_URL: "https://project.example.test", SUPABASE_SECRET_KEY: "test-only-key" };
test("Supabase keeps identity/evidence private and uses short-lived signed URLs", async () => {
  const calls = [];
  const client = { storage: { from: (bucket) => ({
    createSignedUrl: async (path, seconds) => { calls.push({ bucket, path, seconds }); return { data: { signedUrl: "https://storage.example.test/signed" } }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.example.test/${bucket}/${path}` } }),
  }) } };
  const storage = createMediaStorage(config, client);
  assert.equal(await storage.url("cccd/front.png"), "https://storage.example.test/signed");
  assert.equal(await storage.url("attendance/evidence.png"), "https://storage.example.test/signed");
  assert.deepEqual(calls.map((item) => [item.bucket, item.seconds]), [["ihouzz-private", 60], ["ihouzz-private", 60]]);
  assert.match(await storage.url("rooms/photo.webp"), /ihouzz-public\/uploads\/rooms/);
  assert.throws(() => storage.location("cccd/../rooms/front.png"), /Invalid media path/);
  assert.throws(() => createMediaStorage({ ...config, SUPABASE_PRIVATE_BUCKET: "ihouzz-public" }, client), /separate buckets/);
  assert.throws(() => createMediaStorage({ MEDIA_STORAGE: "supabase" }), /requires/);
  assert.equal(createMediaStorage({}), null);
});

test("media routes authorize private images before generating a cloud URL and preserve upload URLs", async (t) => {
  const records = new Map([
    ["cccd/private.png", { filename: "cccd/private.png", length: 4, metadata: { accountId: "owner", storage: { provider: "supabase" } } }],
    ["rooms/public.png", { filename: "rooms/public.png", length: 4, metadata: { storage: { provider: "supabase" } } }],
  ]);
  let failInsert = false;
  const database = { collection: () => ({
    find: ({ filename }) => ({ limit() { return this; }, next: async () => records.get(filename) }),
    insertOne: async (record) => { if (failInsert) throw new Error("Database unavailable"); records.set(record.filename, record); },
  }) };
  const calls = [];
  const storage = {
    enabled: true,
    upload: async (filename) => { calls.push(["upload", filename]); return { provider: "supabase", bucket: "ihouzz-private", objectPath: `uploads/${filename}` }; },
    remove: async (target) => calls.push(["remove", target.objectPath]),
    url: async (filename) => { calls.push(["url", filename]); return "https://storage.example.test/file"; },
  };
  const app = express();
  app.use((req, res, next) => {
    const id = req.get("x-test-user");
    req.session = id ? { user: { id, role: "CUSTOMER" } } : {};
    next();
  });
  registerMediaRoutes({ app, database, uploadDirectory: __dirname, storage });
  app.use((error, req, res, next) => res.sendStatus(503));
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/uploads/cccd/private.png", { redirect: "manual" })).status, 401);
  assert.equal((await fetch(base + "/uploads/cccd/private.png", { redirect: "manual", headers: { "x-test-user": "other" } })).status, 403);
  assert.equal(calls.length, 0, "unauthorized requests must never obtain signed URLs");
  const privateFile = await fetch(base + "/uploads/cccd/private.png", { redirect: "manual", headers: { "x-test-user": "owner" } });
  assert.equal(privateFile.status, 302);
  assert.equal(privateFile.headers.get("cache-control"), "private, no-store");
  assert.equal(privateFile.headers.get("location"), "https://storage.example.test/file");
  assert.equal((await fetch(base + "/uploads/rooms/public.png", { redirect: "manual" })).status, 302);
  const upload = () => {
    const data = new FormData(); data.append("file", new Blob(["illustration"], { type: "image/png" }), "test.png");
    return fetch(base + "/api/upload/cccd", { method: "POST", headers: { "x-test-user": "owner" }, body: data });
  };
  const created = await upload();
  assert.equal(created.status, 201);
  const { url } = await created.json();
  assert.match(url, /^\/uploads\/cccd\/[^/]+\.png$/);
  assert.equal(records.get(url.slice("/uploads/".length)).metadata.accountId, "owner");
  failInsert = true;
  assert.equal((await upload()).status, 503);
  assert.equal(calls.at(-1)[0], "remove", "failed metadata writes must remove only the new orphaned object");
});
