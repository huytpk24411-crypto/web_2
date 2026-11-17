const { GridFSBucket, ObjectId } = require("mongodb");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const fileUpload = require("../../my-server/node_modules/express-fileupload");
const { createMediaStorage } = require("../media-storage");

const folders = new Set([
  "rooms",
  "cccd",
  "attendance",
  "schools",
  "employees",
]);
const imageTypes = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
const examples = new Set([
  "cccd/demo-front.png",
  "cccd/demo-back.png",
  "attendance/demo-evidence.png",
]);

function registerMediaRoutes({ app, database, uploadDirectory, storage = createMediaStorage() }) {
  const bucket = new GridFSBucket(database, { bucketName: "Upload" });
  const requireUser = (req, res, next) => {
    if (!req.session?.user)
      return res.status(401).send({ message: "Login required" });
    next();
  };

  app.post(
    "/api/upload/:folder",
    requireUser,
    (req, res, next) => {
      const allowed = {
        rooms: ["ADMIN"],
        schools: ["ADMIN"],
        employees: ["ADMIN"],
        cccd: ["ADMIN", "EMPLOYEE", "CUSTOMER"],
        attendance: ["ADMIN", "EMPLOYEE"],
      };
      if (!allowed[req.params.folder]?.includes(req.session.user.role))
        return res.status(403).send({ message: "Upload not allowed" });
      next();
    },
    fileUpload({ limits: { fileSize: 5 * 1024 * 1024 }, abortOnLimit: true }),
    async (req, res, next) => {
      try {
        const file = req.files?.file;
        if (!file || Array.isArray(file))
          return res
            .status(400)
            .send({ message: "Upload one file using field file" });
        if (file.truncated || file.size > 5 * 1024 * 1024)
          return res.status(413).send({ message: "File must not exceed 5 MB" });
        const extension = path.extname(file.name).toLowerCase();
        if (!imageTypes[extension] || file.mimetype !== imageTypes[extension])
          return res
            .status(400)
            .send({
              message: "Only jpg, png, webp and svg images are allowed",
            });
        const name = `${crypto.randomUUID()}${extension}`;
        const filename = `${req.params.folder}/${name}`;
        if (storage?.enabled) {
          const target = await storage.upload(filename, file.data, file.mimetype);
          try {
            // Keep the existing URL and file metadata contract used by customer profiles.
            await database.collection("Upload.files").insertOne({
              _id: new ObjectId(), filename, length: file.data.length, uploadDate: new Date(),
              metadata: { contentType: file.mimetype, accountId: req.session.user.id, storage: target },
            });
          } catch (error) {
            await storage.remove(target).catch(() => {});
            throw error;
          }
          return res.status(201).send({ url: `/uploads/${filename}` });
        }
        const target = bucket.openUploadStream(filename, {
          metadata: {
            contentType: file.mimetype,
            accountId: req.session.user.id,
          },
        });
        try {
          await pipeline(Readable.from(file.data), target);
        } catch (error) {
          await bucket.delete(target.id).catch(() => {});
          throw error;
        }
        res.status(201).send({ url: `/uploads/${filename}` });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/uploads/:folder/:name", async (req, res, next) => {
    try {
      const { folder, name } = req.params;
      if (!folders.has(folder) || !/^[A-Za-z0-9_.-]+$/.test(name))
        return res.status(404).end();
      const privateFile = folder === "cccd" || folder === "attendance";
      const user = req.session?.user;
      if (privateFile && !user) return res.status(401).end();
      const filename = `${folder}/${name}`;
      const file = await bucket.find({ filename }).limit(1).next();
      if (!file) {
        if (examples.has(filename)) {
          res.set("Cache-Control", "private, no-store");
          return res.sendFile(path.join(uploadDirectory, folder, name));
        }
        return res.status(404).end();
      }
      if (
        privateFile &&
        user.role !== "ADMIN" &&
        !(folder === "cccd" && user.role === "EMPLOYEE") &&
        file.metadata?.accountId !== user.id
      )
        return res.status(403).end();
      if (file.metadata?.storage?.provider === "supabase") {
        if (!storage) throw new Error("Supabase media credentials are missing");
        res.set({
          "Cache-Control": privateFile ? "private, no-store" : "public, max-age=3600",
          "Referrer-Policy": "no-referrer",
          Vary: "Cookie, X-iHouzz-Portal, Referer",
        });
        return res.redirect(302, await storage.url(filename));
      }
      res.set({
        "Content-Type":
          file.metadata?.contentType || "application/octet-stream",
        "Content-Length": String(file.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "Cache-Control": privateFile
          ? "private, no-store"
          : "public, max-age=86400",
      });
      await pipeline(bucket.openDownloadStream(file._id), res);
    } catch (error) {
      if (!res.headersSent) next(error);
      else res.destroy(error);
    }
  });

  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.session?.user?.role !== "ADMIN"
    )
      return res.status(403).send({ message: "Administrator required" });
    next();
  });
}

module.exports = { registerMediaRoutes };
