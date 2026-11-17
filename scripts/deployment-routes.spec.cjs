const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { API_PATHS, PORTALS, vercelConfig } = require("./deployment-routes.cjs");
const { packagePortals } = require("./build-vercel.cjs");

test("Vercel forwards complete API paths and keeps customer pages out of the API", () => {
  const proxy = vercelConfig("https://backend.example.test/").routes[0];
  const matcher = new RegExp(proxy.src);
  for (const pathname of [
    "/auth/login", "/auth/me", "/api/upload/cccd", "/data/HoSoCoc/example",
    "/viewing-cart/checkout", "/viewings", "/viewings/mine", "/viewings/availability",
    "/viewings/example/cancel", "/favorites/mine", "/user-login", "/user-register",
    "/uploads/cccd/example.png", "/payos/webhook", "/notifications/mine",
  ]) {
    assert.equal(API_PATHS.test(pathname), true, pathname);
    assert.equal(pathname.replace(matcher, proxy.dest), `https://backend.example.test${pathname}`);
  }
  for (const pathname of [
    "/", "/login", "/favorites", "/viewings/new", "/viewings/new/",
    "/bookings/gc-example/receipt", "/staff/", "/staff/login",
    "/staff/employee/deposits/new", "/management/login", "/management/admin",
  ]) {
    assert.equal(matcher.test(pathname), false, pathname);
    assert.equal(API_PATHS.test(pathname), false, pathname);
  }
});

test("each portal has a one-way root redirect and its own SPA fallback", () => {
  const { routes } = vercelConfig("https://backend.example.test");
  const redirects = routes.filter((route) => route.status === 307);
  for (const base of ["/staff/", "/management/"]) {
    const redirect = redirects.find((route) => new RegExp(route.src).test(base.slice(0, -1)));
    assert.equal(redirect.headers.Location, base);
    assert.equal(redirects.some((route) => new RegExp(route.src).test(base)), false);
    const fallback = routes.find((route) => route.dest === `${base}index.html`);
    assert.ok(new RegExp(fallback.src).test(base + "login"));
    assert.deepEqual(fallback.methods, ["GET", "HEAD"]);
  }
  const missing = routes.find((route) => route.status === 404);
  for (const pathname of ["/staff/missing.js", "/management/assets/missing.webp", "/missing.css"]) {
    assert.ok(new RegExp(missing.src).test(pathname));
  }
  assert.equal(new RegExp(missing.src).test("/bookings/gc-example/receipt"), false);
});

test("packaging keeps all three builds separate and preserves Vercel project settings", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ihouzz-vercel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".vercel"));
  fs.writeFileSync(path.join(root, ".vercel/project.json"), '{"projectId":"preserve"}');
  for (const { name, base } of PORTALS) {
    const directory = path.join(root, `my-app-${name}/dist/my-app-${name}/browser`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.html"), `<base href="${base}"><h1>${name}</h1>`);
    fs.writeFileSync(path.join(directory, "main.js"), name);
  }
  const output = packagePortals(root, "https://backend.example.test");
  fs.writeFileSync(path.join(output, "static/stale.js"), "old deployment");
  packagePortals(root, "https://backend.example.test");
  assert.equal(fs.existsSync(path.join(output, "static/stale.js")), false);
  assert.equal(fs.readFileSync(path.join(root, ".vercel/project.json"), "utf8"), '{"projectId":"preserve"}');
  for (const { name, base } of PORTALS) {
    const directory = path.join(output, "static", base.slice(1));
    assert.match(fs.readFileSync(path.join(directory, "index.html"), "utf8"), new RegExp(`<h1>${name}</h1>`));
    assert.equal(fs.readFileSync(path.join(directory, "main.js"), "utf8"), name);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, "config.json"))).version, 3);
});

test("build rejects backend URLs containing credentials, paths or insecure protocols", () => {
  for (const url of ["http://backend.example.test", "https://user:password@backend.example.test", "https://backend.example.test/api", "https://backend.example.test?key=secret"]) {
    assert.throws(() => vercelConfig(url), /HTTPS origin/);
  }
});

test("optional Supabase image routing covers all portals and leaves other assets local", () => {
  const { routes } = vercelConfig("https://backend.example.test", "https://project.example.test/storage/v1/object/public/ihouzz-public");
  const rule = routes.find((route) => route.dest?.includes("/storage/v1/object/public/"));
  const matcher = new RegExp(rule.src);
  for (const prefix of ["/", "/staff/", "/management/"]) {
    assert.equal((prefix + "assets/auth/login.jpg").replace(matcher, rule.dest), "https://project.example.test/storage/v1/object/public/ihouzz-public/assets/auth/login.jpg");
  }
  assert.equal(matcher.test("/staff/assets/fonts/regular.woff2"), false);
  assert.equal(matcher.test("/uploads/cccd/front.png"), false);
  assert.throws(() => vercelConfig("https://backend.example.test", "https://project.example.test/storage/v1/object/private/identity"), /public bucket/);
});
