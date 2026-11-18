const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
process.env.NODE_ENV ||= "production";
process.env.CUSTOMER_APP_URL ||= process.env.RENDER_EXTERNAL_URL;
const express = require("../my-server-mongodb/node_modules/express");
const { API_PATHS } = require("./deployment-routes.cjs");

function mountPortal(web, { prefix, directory }) {
  // String routes also match a trailing slash in Express's default routing mode.
  // Match only the bare prefix so the canonical portal root can serve its HTML.
  web.get(new RegExp(`^${prefix}$`), (req, res) =>
    res.redirect(302, prefix + "/" + req.url.slice(prefix.length)),
  );
  web.use(prefix, express.static(directory), (req, res, next) => {
    if (req.method !== "GET" || path.extname(req.path)) return next();
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(directory, "index.html"));
  });
}

async function start({ frontends = true } = {}) {
  const portals = [
    ["customer", "/"],
    ["employee", "/staff"],
    ["admin", "/management"],
  ].map(([portal, prefix]) => ({
    prefix,
    directory: path.join(
      root,
      `my-app-${portal}/dist/my-app-${portal}/browser`,
    ),
  }));
  for (const portal of frontends ? portals : [])
    if (!fs.existsSync(path.join(portal.directory, "index.html")))
      throw new Error(
        "Missing production build. Run npm run build:deploy first.",
      );
  if (!process.env.MONGODB_URI || !process.env.CUSTOMER_APP_URL)
    throw new Error(
      "MONGODB_URI and CUSTOMER_APP_URL are required for deployment",
    );

  const api = require("../my-server-mongodb/app");
  const uploads = require("../my-server");
  require("../my-server-mongodb/routes/media-routes").registerMediaRoutes({
    app: api.app,
    database: api.database,
    uploadDirectory: path.join(root, "my-server/public/uploads"),
  });
  api.app.use(uploads.app);
  await api.start({ listen: false });

  const web = express();
  web.disable("x-powered-by");
  web.set("trust proxy", 1);
  web.get("/healthz", async (req, res) => {
    try {
      await api.database.command({ ping: 1 });
      res.set("Cache-Control", "no-store");
      res.send({ status: "ok", revision: process.env.RENDER_GIT_COMMIT || null });
    } catch {
      res.status(503).send({ status: "unavailable" });
    }
  });
  web.use((req, res, next) =>
    API_PATHS.test(req.path)
      ? api.app(req, res, () =>
          res.status(404).send({ message: "API not found" }),
        )
      : next(),
  );
  if (frontends) {
    for (const portal of portals.slice(1)) mountPortal(web, portal);
    web.use(express.static(portals[0].directory));
    web.get("/{*route}", (req, res, next) => {
      if (path.extname(req.path)) return next();
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(portals[0].directory, "index.html"));
    });
  }
  web.use((req, res) => res.status(404).send({ message: "Not found" }));
  web.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error("Deployment request failed", error.name);
    res
      .status(500)
      .send({ message: "Không xử lý được yêu cầu. Vui lòng thử lại." });
  });

  const port = Number(process.env.PORT || 10000);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid PORT");
  const server = web.listen(port, "0.0.0.0", () =>
    console.log(`iHOUZZ Uni ready on port ${server.address().port}`),
  );
  const shutdown = () => {
    server.close(() => api.client.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return server;
}

module.exports = { start, mountPortal };
if (require.main === module)
  start().catch((error) => {
    console.error(error.name + ": deployment startup failed");
    process.exitCode = 1;
  });
