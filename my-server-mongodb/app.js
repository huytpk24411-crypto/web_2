// Assembly follows the LearnAngular CommonJS pattern: configure, register services/routes, then start.
const dependencies = { serverDirectory: __dirname };
try {
  process.loadEnvFile(require("path").join(__dirname, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const express = require("express");
const app = express();
const port = Number(process.env.API_PORT || 3002);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid API_PORT");

const morgan = require("morgan");
app.use(morgan("combined"));

const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

const corsMiddleware = require("cors");
// Use the same CORS options on every route
function cors() {
  return corsMiddleware({
    origin: [
      "http://localhost:4200",
      "http://localhost:4201",
      "http://localhost:4202",
    ],
    credentials: true,
  });
}
app.use(cors());
// payOS does not send portal headers or cookies. Keep this before session/auth barriers.
app.post("/payos/webhook", express.json({ limit: "100kb" }), (req, res, next) =>
  dependencies.payosWebhook(req, res, next),
);
const cookieParser = require("cookie-parser");
app.use(cookieParser());
const {
  portalRoles,
  portalOf,
  sessionCookieName,
  rememberCookieName,
  sessionStore,
  portalSessions,
  sessionMiddleware,
} = require("./middleware/portal-session").createPortalSessions();
app.use(sessionMiddleware);
const crypto = require("crypto");
const bodyParser = require("body-parser");
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

const {
  MongoClient,
  ObjectId,
  client,
  database,
  roomCollection,
  propertyCollection,
  schoolCollection,
  propertySchoolCollection,
  accountCollection,
  viewingCollection,
  customerCollection,
  accountRoleCollection,
  employeeCollection,
  favoriteCollection,
  contactCollection,
  viewingDetailCollection,
  notificationCollection,
  auditCollection,
} = require("./config/database").createDatabase();
const p3Collections = Object.fromEntries(
  [
    "Hold",
    "Payment",
    "Receipt",
    "Deposit",
    "DepositDraft",
    "Contract",
    "BrokerageAgreement",
    "BrokerageTransaction",
    "EmployeeRevenue",
    "CompanyRevenue",
    "PayrollPeriod",
    "Policy",
    "PolicyLevel",
    "Counter",
    "Room",
    "Customer",
    "Employee",
    "Account",
    "AuditLog",
    "Notification",
    "Favorite",
    "RoomImage",
    "RoomPriceHistory",
    "ViewingDetail",
    "Viewing",
  ].map((name) => [name, database.collection(name)]),
);
Object.assign(dependencies, {
  express,
  app,
  port,
  morgan,
  path,
  corsMiddleware,
  cors,
  cookieParser,
  portalRoles,
  portalOf,
  sessionCookieName,
  rememberCookieName,
  sessionStore,
  portalSessions,
  crypto,
  bodyParser,
  MongoClient,
  ObjectId,
  client,
  database,
  roomCollection,
  propertyCollection,
  schoolCollection,
  propertySchoolCollection,
  accountCollection,
  viewingCollection,
  customerCollection,
  accountRoleCollection,
  employeeCollection,
  favoriteCollection,
  contactCollection,
  viewingDetailCollection,
  notificationCollection,
  auditCollection,
  p3Collections,
});
require("./services/common-service").createCommonService(dependencies);
require("./services/deposit-service").createDepositService(dependencies);
require("./services/shift-service").createShiftService(dependencies);
require("./services/payroll-service").createPayrollService(dependencies);
require("./services/catalog-service").createCatalogService(dependencies);
const passwordReset = require("./password-reset").createPasswordReset({
  database,
  accounts: accountCollection,
  sessionStore,
  normalizePhone: dependencies.normalizePhone,
  validPhone: dependencies.validPhone,
  portalOf,
  portalRoles,
});

app.use("/auth/password-reset", passwordReset.router);

// Catalog recovery must precede P2 writes and authentication as well as /data reads.
app.use(async (req, res, next) => {
  try {
    await dependencies.p6Barrier();
    next();
  } catch (error) {
    res
      .status(503)
      .send({ code: "CATALOG_RECOVERY_REQUIRED", message: error.message });
  }
});

// P5 recovery barrier also protects existing P3/P4 routes after an interrupted payroll write.
app.use("/data", async (req, res, next) => {
  try {
    await dependencies.p5Barrier();
    next();
  } catch (error) {
    res
      .status(503)
      .send({ code: "PAYROLL_RECOVERY_REQUIRED", message: error.message });
  }
});

// Registration order is preserved, including literal routes before parameter routes.
require("./routes/catalog-routes").registerPublicCatalogRoutes(dependencies);
require("./routes/auth-routes").registerLoginRoutes(dependencies);
require("./routes/viewing-routes").registerViewingCartRoutes(dependencies);
require("./routes/auth-routes").registerRegistrationRoutes(dependencies);
require("./routes/customer-routes").registerCustomerRoutes(dependencies);
require("./routes/viewing-routes").registerViewingRoutes(dependencies);
require("./routes/notification-routes").registerNotificationRoutes(
  dependencies,
);
require("./routes/viewing-routes").registerViewingCheckoutRoutes(dependencies);
require("./routes/deposit-routes").registerDepositRoutes(dependencies);
require("./routes/shift-routes").registerShiftRoutes(dependencies);
require("./routes/payroll-routes").registerPayrollRoutes(dependencies);
require("./routes/catalog-routes").registerAdminCatalogRoutes(dependencies);

async function start() {
  try {
    await client.connect();
    await roomCollection.createIndex({ id: 1 }, { unique: true });
    await roomCollection.createIndex({ code: 1 }, { unique: true });
    await roomCollection.createIndex(
      { slug: 1 },
      { unique: true, sparse: true },
    );
    await accountCollection.createIndex({ phone: 1 }, { unique: true });
    await accountCollection.createIndex(
      { username: 1 },
      {
        unique: true,
        partialFilterExpression: { username: { $type: "string" } },
      },
    );
    await accountRoleCollection.createIndex(
      { accountId: 1, roleId: 1 },
      { unique: true },
    );
    await customerCollection.createIndex(
      { accountId: 1 },
      {
        name: "linked_customer_account",
        unique: true,
        partialFilterExpression: { accountId: { $type: "string" } },
      },
    );
    const customerIndexes = await customerCollection.listIndexes().toArray();
    if (
      customerIndexes.some(
        (index) =>
          index.name === "accountId_1" && !index.partialFilterExpression,
      )
    ) {
      await customerCollection.dropIndex("accountId_1").catch((error) => {
        if (error.code !== 27) throw error;
      });
    }
    await customerCollection.createIndex(
      { phone: 1 },
      { unique: true, partialFilterExpression: { phone: { $type: "string" } } },
    );
    await customerCollection.createIndex(
      { "identity.number": 1 },
      {
        unique: true,
        partialFilterExpression: { "identity.number": { $type: "string" } },
      },
    );
    await favoriteCollection.createIndex(
      { customerId: 1, roomId: 1 },
      { unique: true },
    );
    await viewingDetailCollection.createIndex(
      { viewingId: 1, roomId: 1 },
      { unique: true },
    );
    await viewingDetailCollection.createIndex(
      { viewingId: 1, order: 1 },
      { unique: true },
    );
    await viewingCollection.createIndex({ customerId: 1, startAt: -1 });
    await contactCollection.createIndex({ phone: 1, createdAt: -1 });
    await contactCollection.createIndex({ dedupeHash: 1 }, { unique: true });
    await notificationCollection.createIndex(
      { dedupeKey: 1 },
      { unique: true },
    );
    await notificationCollection.createIndex({ accountId: 1, createdAt: -1 });
    await passwordReset.initialize();
    await dependencies.initializeP3();
    await dependencies.initializeP4();
    await dependencies.initializeP5();
    await dependencies.initializeP6();
    return await new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        console.log(`My Server listening on port ${port}`);
        resolve(server);
      });
      server.once("error", reject);
    });
  } catch (error) {
    await client.close();
    throw error;
  }
}
module.exports = {
  app,
  p3Money: dependencies.p3Money,
  p3Month: dependencies.p3Month,
  p3Fee: dependencies.p3Fee,
  p3Transition: dependencies.p3Transition,
  p3AvailableFilter: dependencies.p3AvailableFilter,
  p3Prepare: dependencies.p3Prepare,
  p3Run: dependencies.p3Run,
  p3Collections,
  p3ReadBarrier: dependencies.p3ReadBarrier,
  initializeP3: dependencies.initializeP3,
  client,
  database,
  payosSign: dependencies.payosSign,
  payosVerify: dependencies.payosVerify,
  payosCreateLink: dependencies.payosCreateLink,
  payosGetRequest: dependencies.payosGetRequest,
  completeHoldPayment: dependencies.completeHoldPayment,
  p3StatusLabels: dependencies.p3StatusLabels,
};
Object.assign(module.exports, {
  p4ShiftLimit: dependencies.p4ShiftLimit,
  p4LateMinutes: dependencies.p4LateMinutes,
  p4Penalty: dependencies.p4Penalty,
  p4Distance: dependencies.p4Distance,
  p4NextAssignment: dependencies.p4NextAssignment,
  p4CarryDecision: dependencies.p4CarryDecision,
  p4Collections: dependencies.p4Collections,
  p4Run: dependencies.p4Run,
  p4Recover: dependencies.p4Recover,
  p4Maintenance: dependencies.p4Maintenance,
  initializeP4: dependencies.initializeP4,
  p4PickLeastBusy: dependencies.p4PickLeastBusy,
  p4ViewingWindow: dependencies.p4ViewingWindow,
  p4EmployeeFreeAt: dependencies.p4EmployeeFreeAt,
  p4PickViewingEmployee: dependencies.p4PickViewingEmployee,
  p4ViewingOut: dependencies.p4ViewingOut,
});
Object.assign(module.exports, {
  p5Commission: dependencies.p5Commission,
  p5Net: dependencies.p5Net,
  p5Mutable: dependencies.p5Mutable,
  p5MonthBounds: dependencies.p5MonthBounds,
  p5Levels: dependencies.p5Levels,
  p5Calculate: dependencies.p5Calculate,
  p5Execute: dependencies.p5Execute,
  p5Run: dependencies.p5Run,
  p5Barrier: dependencies.p5Barrier,
  p5Collections: dependencies.p5Collections,
  initializeP5: dependencies.initializeP5,
});
Object.assign(module.exports, {
  p6Overlap: dependencies.p6Overlap,
  p6Geo: dependencies.p6Geo,
  p6Day: dependencies.p6Day,
  p6ImageList: dependencies.p6ImageList,
  p6Safe: dependencies.p6Safe,
  p6Unreferenced: dependencies.p6Unreferenced,
  p6Validate: dependencies.p6Validate,
  p6Execute: dependencies.p6Execute,
  p6Run: dependencies.p6Run,
  p6SaveRoom: dependencies.p6SaveRoom,
  p6DeleteRoom: dependencies.p6DeleteRoom,
  p6RoomHasHistory: dependencies.p6RoomHasHistory,
  roomHasActiveFlow: dependencies.roomHasActiveFlow,
  deleteRoomWithSnapshot: dependencies.deleteRoomWithSnapshot,
  roomReadFilter: dependencies.roomReadFilter,
  adminOccupancy: dependencies.adminOccupancy,
  p5TransactionDetails: dependencies.p5TransactionDetails,
  p6Collections: dependencies.p6Collections,
  p6References: dependencies.p6References,
  initializeP6: dependencies.initializeP6,
});
module.exports.start = start;
