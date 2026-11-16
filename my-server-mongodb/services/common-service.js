// CommonJS services retain the existing rules and MongoDB native-driver operations.
function createCommonService(dependencies) {
  // Create a slug from a Vietnamese name
  function createSlug(name) {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function roomReadFilter(req) {
    const sessionId = req.session?.user?.id;
    const account =
      sessionId && dependencies.ObjectId.isValid(sessionId)
        ? await dependencies.accountCollection.findOne({
            _id: new dependencies.ObjectId(sessionId),
            status: "ACTIVE",
          })
        : null;
    return ["ADMIN", "EMPLOYEE"].includes(account?.role)
      ? {}
      : {
          status: { $in: ["AVAILABLE", "HELD"] },
          publicationStatus: "PUBLISHED",
        };
  }

  // P2 uses the DATA-01 business IDs for FKs, except Viewing.customerId (Account ObjectId).
  function normalizePhone(value) {
    return typeof value === "string" ? value.trim().replace(/^\+84/, "0") : "";
  }

  function validPhone(value) {
    return /^0\d{9}$/.test(value);
  }

  function newRecord(prefix, fields) {
    const _id = new dependencies.ObjectId();
    return { _id, id: `${prefix}-${_id}`, ...fields };
  }

  function publicRecord(record) {
    const { _id, ...result } = record;
    return { ...result, id: record.id || _id.toString() };
  }

  function recordFilter(id) {
    return dependencies.ObjectId.isValid(id)
      ? { $or: [{ id }, { _id: new dependencies.ObjectId(id) }] }
      : { id };
  }

  function requireRole(...roles) {
    return async (req, res, next) => {
      try {
        if (
          !req.session.user ||
          !dependencies.ObjectId.isValid(req.session.user.id)
        ) {
          return res.status(401).send({ message: "Login required" });
        }
        const account = await dependencies.accountCollection.findOne({
          _id: new dependencies.ObjectId(req.session.user.id),
        });
        if (!account || account.status !== "ACTIVE") {
          return res.status(401).send({ message: "Active account required" });
        }
        // Resolve current role from the database, never from request body or a stale session role.
        if (roles.length && !roles.includes(account.role)) {
          return res.status(403).send({ message: "Role not allowed" });
        }
        req.p2Account = account;
        if (account.role === "CUSTOMER" && roles.includes("CUSTOMER")) {
          req.p2Customer = await dependencies.customerCollection.findOne({
            accountId: account.id,
          });
          if (!req.p2Customer)
            return res.status(404).send({ message: "Customer not found" });
        }
        if (account.role === "EMPLOYEE" && roles.includes("EMPLOYEE")) {
          req.p2Employee = await dependencies.employeeCollection.findOne({
            accountId: account.id,
            status: "ACTIVE",
          });
          if (!req.p2Employee)
            return res
              .status(403)
              .send({ message: "Active employee required" });
        }
        next();
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    };
  }

  // One local Express process / standalone MongoDB: serialize P2 writes, including deduplication
  // and the Viewing/ViewingDetail mirror. This is not a distributed transaction.
  let p2WriteQueue = Promise.resolve();

  function p2Write(handler) {
    return async (req, res) => {
      // P6 takes P4 before P2. Viewing writes use the same order, so a P2→P4
      // bridge never holds P2 while waiting for a P6 operation to release P4.
      if (
        !req.p4Locked &&
        /^\/(viewings\/|viewing-details\/|viewing-cart\/checkout\/?$)/.test(
          req.route?.path || req.path,
        )
      ) {
        return dependencies.p4Serial(async () => {
          req.p4Locked = true;
          try {
            await p2Write(handler)(req, res);
          } finally {
            delete req.p4Locked;
          }
        });
      }
      const previous = p2WriteQueue;
      let release;
      p2WriteQueue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        if (req.p4Locked) await dependencies.p4Recover();
        await handler(req, res);
      } catch (error) {
        if (req.p4Locked) {
          res.status(error.status || (error.code === 11000 ? 409 : 500)).send({
            code: error.code || "P4_ERROR",
            ...(error.roomId ? { roomId: error.roomId } : {}),
            message: error.status
              ? dependencies.p4Message(error.code)
              : error.code === 11000
                ? "Bản ghi đã tồn tại."
                : "Không thực hiện được thao tác. Vui lòng tải lại và thử lại.",
          });
        } else {
          res.status(error.code === 11000 ? 409 : 500).send({
            message:
              error.code === 11000 ? "Record already exists" : error.message,
          });
        }
      } finally {
        release();
      }
    };
  }

  async function audit(req, entityType, entityId, action, before, after) {
    await dependencies.auditCollection.insertOne(
      newRecord("nk", {
        entityType,
        entityId,
        action,
        actorId: req.p2Account?.id || null,
        at: new Date(),
        before,
        after,
      }),
    );
  }

  async function notify(
    req,
    accountId,
    type,
    entityType,
    entityId,
    title,
    body,
    eventId,
  ) {
    const dedupeKey = `${accountId}:${eventId}`;
    const record = newRecord("tb", {
      accountId,
      type,
      entityType,
      entityId,
      title,
      body,
      read: false,
      readAt: null,
      createdAt: new Date(),
      dedupeKey,
    });
    const result = await dependencies.notificationCollection.updateOne(
      { dedupeKey },
      { $setOnInsert: record },
      { upsert: true },
    );
    if (result.upsertedCount)
      await audit(
        req,
        "Notification",
        record.id,
        "CREATE",
        null,
        publicRecord(record),
      );
  }

  async function notifyAdmins(req, type, entityType, entityId, title, eventId) {
    const admins = await dependencies.accountCollection
      .find({ role: "ADMIN", status: "ACTIVE" })
      .toArray();
    for (const admin of admins) {
      await notify(
        req,
        admin.id,
        type,
        entityType,
        entityId,
        title,
        title,
        eventId,
      );
    }
  }

  async function notifyViewing(req, viewing, type, title, eventId) {
    const customer = await dependencies.customerCollection.findOne({
      id: viewing.customerProfileId,
    });
    if (customer)
      await notify(
        req,
        customer.accountId,
        type,
        "Viewing",
        viewing.id,
        title,
        title,
        eventId,
      );
    if (viewing.employeeId) {
      const employee = await dependencies.employeeCollection.findOne({
        id: viewing.employeeId,
      });
      if (employee)
        await notify(
          req,
          employee.accountId,
          type,
          "Viewing",
          viewing.id,
          title,
          title,
          eventId,
        );
    }
  }

  async function changeViewing(req, before, fields, action) {
    const after = {
      ...before,
      ...fields,
      updatedAt: new Date(),
      version: (before.version || 0) + 1,
    };
    await dependencies.viewingCollection.replaceOne({ _id: before._id }, after);
    await audit(
      req,
      "Viewing",
      before.id,
      action,
      publicRecord(before),
      publicRecord(after),
    );
    return after;
  }

  async function viewingRecords(records) {
    return Promise.all(
      records.map((record) => dependencies.p4ViewingOut(record)),
    );
  }

  async function initializeP3() {
    const indexes = {
      Hold: [
        [
          { roomId: 1 },
          { unique: true, partialFilterExpression: { isActive: true } },
        ],
      ],
      Payment: [
        [{ idempotencyKey: 1 }, { unique: true }],
        [
          { orderCode: 1 },
          { unique: true, partialFilterExpression: { provider: "PAYOS" } },
        ],
        [
          { holdId: 1, provider: 1 },
          { unique: true, partialFilterExpression: { provider: "PAYOS" } },
        ],
        [{ bankTransactionRef: 1 }, { unique: true, sparse: true }],
        [{ "receipt.number": 1 }, { unique: true, sparse: true }],
      ],
      Receipt: [
        [{ number: 1 }, { unique: true }],
        [{ paymentId: 1 }, { unique: true }],
      ],
      Deposit: [
        [{ number: 1 }, { unique: true }],
        [{ holdId: 1 }, { unique: true, sparse: true }],
      ],
      DepositDraft: [[{ employeeId: 1, updatedAt: -1 }, {}]],
      Contract: [
        [{ number: 1 }, { unique: true }],
        [{ depositId: 1 }, { unique: true }],
      ],
      BrokerageTransaction: [[{ contractId: 1 }, { unique: true }]],
      EmployeeRevenue: [[{ employeeId: 1, periodId: 1 }, { unique: true }]],
      CompanyRevenue: [[{ periodId: 1 }, { unique: true }]],
      AuditLog: [[{ p3Key: 1 }, { unique: true, sparse: true }]],
    };
    for (const [name, collection] of Object.entries(
      dependencies.p3Collections,
    )) {
      if (name !== "Counter")
        await collection.createIndex({ id: 1 }, { unique: true });
      for (const [keys, options] of indexes[name] || [])
        await collection.createIndex(keys, options);
    }
    await dependencies.p3ReadBarrier();
    setInterval(
      () =>
        dependencies
          .p3ReadBarrier()
          .catch((error) => console.error("P3 recovery:", error.message)),
      60000,
    ).unref();
  }

  Object.defineProperties(dependencies, {
    createSlug: { enumerable: true, get: () => createSlug },
    roomReadFilter: { enumerable: true, get: () => roomReadFilter },
    normalizePhone: { enumerable: true, get: () => normalizePhone },
    validPhone: { enumerable: true, get: () => validPhone },
    newRecord: { enumerable: true, get: () => newRecord },
    publicRecord: { enumerable: true, get: () => publicRecord },
    recordFilter: { enumerable: true, get: () => recordFilter },
    requireRole: { enumerable: true, get: () => requireRole },
    p2WriteQueue: { enumerable: true, get: () => p2WriteQueue },
    p2Write: { enumerable: true, get: () => p2Write },
    audit: { enumerable: true, get: () => audit },
    notify: { enumerable: true, get: () => notify },
    notifyAdmins: { enumerable: true, get: () => notifyAdmins },
    notifyViewing: { enumerable: true, get: () => notifyViewing },
    changeViewing: { enumerable: true, get: () => changeViewing },
    viewingRecords: { enumerable: true, get: () => viewingRecords },
    initializeP3: { enumerable: true, get: () => initializeP3 },
  });
}
module.exports = { createCommonService };
