const crypto = require("node:crypto");

function storageLocation(filename, { publicBucket, privateBucket }) {
  if (typeof filename !== "string" || filename.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("Invalid media path");
  }
  const privateFile = /^(cccd|attendance)\//.test(filename);
  return {
    provider: "supabase",
    bucket: privateFile ? privateBucket : publicBucket,
    objectPath: `uploads/${filename}`,
  };
}

function createMediaStorage(env = process.env, suppliedClient) {
  const enabled = env.MEDIA_STORAGE === "supabase";
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (enabled) throw new Error("Supabase media storage requires SUPABASE_URL and SUPABASE_SECRET_KEY");
    return null;
  }
  const origin = new URL(url);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("SUPABASE_URL must be an HTTPS origin");
  }
  const publicBucket = env.SUPABASE_PUBLIC_BUCKET || "ihouzz-public";
  const privateBucket = env.SUPABASE_PRIVATE_BUCKET || "ihouzz-private";
  for (const name of [publicBucket, privateBucket]) {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) throw new Error("Invalid Supabase bucket name");
  }
  if (publicBucket === privateBucket) throw new Error("Public and private media need separate buckets");
  const client = suppliedClient || require("@supabase/supabase-js").createClient(origin.origin, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(60000) }) },
  });
  function result(data, error) {
    // SDK errors may include a request URL. Do not expose credentials or signed URLs in logs.
    if (error) throw new Error("Supabase media operation failed");
    return data;
  }
  const location = (filename) => storageLocation(filename, { publicBucket, privateBucket });
  return {
    enabled, client, publicBucket, privateBucket, location,
    async upload(filename, bytes, contentType) {
      const target = location(filename);
      const { data, error } = await client.storage.from(target.bucket).upload(target.objectPath, bytes, {
        contentType, cacheControl: target.bucket === privateBucket ? "0" : "86400", upsert: false,
      });
      result(data, error);
      return { ...target, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
    },
    async remove(target) {
      const { data, error } = await client.storage.from(target.bucket).remove([target.objectPath]);
      result(data, error);
    },
    async url(filename) {
      const target = location(filename);
      if (target.bucket === privateBucket) {
        const { data, error } = await client.storage.from(target.bucket).createSignedUrl(target.objectPath, 60);
        return result(data, error).signedUrl;
      }
      return client.storage.from(target.bucket).getPublicUrl(target.objectPath).data.publicUrl;
    },
  };
}

module.exports = { createMediaStorage, storageLocation };
