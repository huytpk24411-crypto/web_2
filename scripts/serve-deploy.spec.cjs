const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("../my-server-mongodb/node_modules/express");
const { mountPortal } = require("./serve-deploy.cjs");

for (const prefix of ["/staff", "/management"]) {
  test(`${prefix} serves its root, deep links and bundles without redirect loops`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ihouzz-portal-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const html = `<base href="${prefix}/"><h1>${prefix}</h1>`;
    await fs.writeFile(path.join(directory, "index.html"), html);
    await fs.writeFile(path.join(directory, "main.js"), "console.log('portal');");
    const web = express();
    mountPortal(web, { prefix, directory });
    web.use((req, res) => res.sendStatus(404));
    const server = await new Promise((resolve) => {
      const listener = web.listen(0, "127.0.0.1", () => resolve(listener));
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;

    for (const method of ["GET", "HEAD"]) {
      const root = await fetch(base + prefix + "/", { method, redirect: "manual" });
      assert.equal(root.status, 200, `${method} canonical root must not redirect`);
      assert.equal(root.headers.get("location"), null);
    }
    for (const suffix of ["/", "/login", "/employee/deposits/new", "/?from=notification"]) {
      const page = await fetch(base + prefix + suffix, { redirect: "manual" });
      assert.equal(page.status, 200, `Page ${suffix} must load directly`);
      assert.equal(await page.text(), html);
    }
    for (const query of ["", "?from=notification&tab=contracts"]) {
      const redirect = await fetch(base + prefix + query, { redirect: "manual" });
      assert.equal(redirect.status, 302);
      assert.equal(redirect.headers.get("location"), prefix + "/" + query);
      const page = await fetch(base + prefix + query);
      assert.equal(page.status, 200);
      assert.equal(new URL(page.url).pathname, prefix + "/");
    }
    const bundle = await fetch(base + prefix + "/main.js", { redirect: "manual" });
    assert.equal(bundle.status, 200);
    assert.match(await bundle.text(), /console\.log/);
    const missing = await fetch(base + prefix + "/missing.js", { redirect: "manual" });
    assert.equal(missing.status, 404);
  });
}
