const session = require("express-session");

function createPortalSessions() {
  const portalRoles = {
    customer: "CUSTOMER",
    employee: "EMPLOYEE",
    admin: "ADMIN",
  };
  function portalOf(req) {
    const portal = String(req.get("x-ihouzz-portal") || "").toLowerCase();
    return portalRoles[portal] ? portal : null;
  }
  const sessionCookieName = (portal) =>
    !portal || portal === "customer" ? "connect.sid" : `connect.sid.${portal}`;
  const rememberCookieName = (portal) =>
    !portal || portal === "customer"
      ? "remember_user"
      : `remember_user_${portal}`;
  const sessionStore = new session.MemoryStore();
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
        secure: false,
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
