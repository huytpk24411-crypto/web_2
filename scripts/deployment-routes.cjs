// Keep API routes distinct from Angular pages such as /viewings/new and /favorites.
const API_PATHS =
  /^\/(?:data(?:\/|$)|auth(?:\/|$)|api(?:\/|$)|uploads(?:\/|$)|payos\/webhook(?:\/|$)|user-login$|user-register$|viewing-cart(?:\/|$)|favorites\/|contact-requests(?:\/|$)|notifications(?:\/|$)|audit-logs(?:\/|$)|viewing-details(?:\/|$)|viewings(?:$|\/(?!new(?:\/|$))))/;

const PORTALS = [
  { name: "customer", base: "/" },
  { name: "employee", base: "/staff/" },
  { name: "admin", base: "/management/" },
];

function vercelConfig(backendUrl) {
  const backend = new URL(backendUrl);
  if (
    backend.protocol !== "https:" ||
    backend.username || backend.password ||
    backend.pathname !== "/" || backend.search || backend.hash
  ) {
    throw new Error("BACKEND_URL must be an HTTPS origin without credentials or a path");
  }
  return {
    version: 3,
    routes: [
      {
        // Capture the whole path, including the suffix after an API prefix.
        src: `^(${API_PATHS.source.slice(1)}.*)$`,
        dest: `${backend.origin}$1`,
        headers: { "Cache-Control": "private, no-store" },
      },
      { src: "^/healthz$", dest: `${backend.origin}/healthz`, headers: { "Cache-Control": "no-store" } },
      ...PORTALS.slice(1).map(({ base }) => ({
        src: `^${base.slice(0, -1)}$`,
        status: 307,
        headers: { Location: base },
      })),
      { handle: "filesystem" },
      // Missing scripts/images must return 404 instead of an Angular HTML page.
      { src: "^/.*\\.[^/]+$", status: 404 },
      ...PORTALS.slice(1).map(({ base }) => ({
        src: `^${base}.*$`,
        methods: ["GET", "HEAD"],
        dest: `${base}index.html`,
        headers: { "Cache-Control": "no-cache" },
      })),
      {
        src: "^/.*$",
        methods: ["GET", "HEAD"],
        dest: "/index.html",
        headers: { "Cache-Control": "no-cache" },
      },
    ],
  };
}

module.exports = { API_PATHS, PORTALS, vercelConfig };
