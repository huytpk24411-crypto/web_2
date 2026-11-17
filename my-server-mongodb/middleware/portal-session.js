const session = require("express-session");

function createPortalSessions({ database } = {}) {
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  )
    throw new Error(
      "Production requires SESSION_SECRET with at least 32 characters",
    );
  const portalRoles = {
    customer: "CUSTOMER",
    employee: "EMPLOYEE",
    admin: "ADMIN",
  };
  function portalOf(req) {
    const portal = String(req.get("x-ihouzz-portal") || "").toLowerCase();
    if (production && !portal && req.get("referer")) {
      try {
        const reference = new URL(req.get("referer"));
        if (reference.origin === new URL(process.env.CUSTOMER_APP_URL).origin) {
          if (/^\/staff(?:\/|$)/.test(reference.pathname)) return "employee";
          if (/^\/management(?:\/|$)/.test(reference.pathname)) return "admin";
        }
      } catch {}
    }
    return portalRoles[portal] ? portal : null;
  }
  const sessionCookieName = (portal) =>
    !portal || portal === "customer" ? "connect.sid" : `connect.sid.${portal}`;
  const rememberCookieName = (portal) =>
    !portal || portal === "customer"
      ? "remember_user"
      : `remember_user_${portal}`;
  const persistent = production || process.env.SESSION_STORE === "mongodb";
  const sessionStore = persistent
    ? new (require("./mongo-session-store").MongoSessionStore)(database)
    : new session.MemoryStore();
  const portalSessions = {};
  for (const portal of [null, "employee", "admin"]) {
    portalSessions[portal || "customer"] = session({
      name: sessionCookieName(portal),
      store: sessionStore,
      secret:
        process.env.SESSION_SECRET ||
        "ihouzz-learnangular-local-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: production,
      },
    });
  }
  const sessionMiddleware = (req, res, next) =>
    portalSessions[portalOf(req) || "customer"](req, res, next);
  return {
    portalRoles,
    portalOf,
    sessionCookieName,
    rememberCookieName,
    sessionStore,
    portalSessions,
    sessionMiddleware,
  };
}
module.exports = { createPortalSessions };
