// CommonJS services retain the existing rules and MongoDB native-driver operations.
function createCatalogService(dependencies) {
  // P6 catalog administration. Keep the LearnAngular CommonJS/single-file structure.
  const p6Types = [
    "Employee",
    "Account",
    "AccountRole",
    "Owner",
    "Property",
    "School",
    "PropertySchool",
    "BrokerageAgreement",
    "WorkLocation",
    "Room",
    "RoomImage",
    "RoomPriceHistory",
    "Hold",
    "Deposit",
    "Contract",
    "BrokerageTransaction",
    "ViewingDetail",
    "Viewing",
    "Favorite",
  ];

  const p6Collections = Object.fromEntries(
    p6Types.map((type) => [type, dependencies.database.collection(type)]),
  );

  p6Collections.Counter = dependencies.database.collection("Counter");

  const p6Admin = dependencies.requireRole("ADMIN");

  function p6Clean(value) {
    if (!value) return value;
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) => key !== "_id" && !/^(_p[456]|p3LastStep)/.test(key),
      ),
    );
  }

  function p6Safe(value) {
    if (value instanceof Date || value === null || typeof value !== "object")
      return value;
    if (Array.isArray(value)) return value.map(p6Safe);
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            key !== "demo" &&
            !/^(password|passwordHash|salt|temporaryPassword|_id|_p\d|p3LastStep)/i.test(
              key,
            ),
        )
        .map(([key, item]) => [
          key,
          key === "locationStatus" && item === "demo"
            ? "estimated"
            : p6Safe(item),
        ]),
    );
  }

  function p6Text(value, field, min = 1, max = 200) {
    dependencies.p3Assert(
      typeof value === "string" &&
        value.trim().length >= min &&
        value.trim().length <= max,
      `INVALID_${field}`,
      400,
    );
    return value.trim();
  }

  function p6Day(value, field) {
    dependencies.p3Assert(
      typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value,
      `INVALID_${field}`,
      400,
    );
    return value;
  }

  function p6Geo(body, nullable = false) {
    if (nullable && body.lat === null && body.lng === null)
      return { lat: null, lng: null, geo: null };
    const lat = body.lat ?? body.geo?.coordinates?.[1],
      lng = body.lng ?? body.geo?.coordinates?.[0];
    dependencies.p3Assert(
      typeof lat === "number" &&
        Number.isFinite(lat) &&
        Math.abs(lat) <= 90 &&
        typeof lng === "number" &&
        Number.isFinite(lng) &&
        Math.abs(lng) <= 180,
      "INVALID_COORDINATES",
      400,
    );
    return { lat, lng, geo: { type: "Point", coordinates: [lng, lat] } };
  }

  function p6ImageUrl(value, category) {
    dependencies.p3Assert(
      typeof value === "string" &&
        value.length <= 1000 &&
        !value.includes("..") &&
        !/[?#\\]/.test(value) &&
        new RegExp(
          `^/(assets|uploads)/${category}/[a-zA-Z0-9_./% -]+\\.(png|jpe?g|webp|svg)$`,
          "i",
        ).test(value),
      "INVALID_IMAGE_URL",
      400,
    );
    return value;
  }

  function p6ImageList(value, published = false) {
    dependencies.p3Assert(
      Array.isArray(value) &&
        value.length <= 15 &&
        (!published || value.length > 0) &&
        new Set(value).size === value.length,
      "INVALID_ROOM_IMAGES",
      400,
    );
    return value.map((url) => p6ImageUrl(url, "rooms"));
  }

  function p6Overlap(a, b) {
    return (
      a.effectiveFrom <= (b.effectiveTo || "9999-12-31") &&
      b.effectiveFrom <= (a.effectiveTo || "9999-12-31")
    );
  }

  function p6Effect(plan, type, before, fields, action) {
    const after = fields === null ? null : { ...p6Clean(before), ...fields };
    if (type === "Property" && after) {
      delete after.demo;
      if (after.locationStatus === "demo") after.locationStatus = "estimated";
    }
    if (after && !before) after.id ||= `p6-${new dependencies.ObjectId()}`;
    plan.effects.push({
      type,
      before: p6Clean(before),
      after,
      action: action || (before ? (after ? "UPDATE" : "DELETE") : "CREATE"),
    });
    return after;
  }

  async function p6Get(type, id) {
    dependencies.p3Assert(
      typeof id === "string" && id.length > 0,
      "INVALID_ID",
      400,
    );
    const record = await dependencies.database.collection(type).findOne({ id });
    dependencies.p3Assert(record, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return record;
  }

  async function p6Foreign(type, id, active = false) {
    dependencies.p3Assert(
      typeof id === "string" && id.length > 0,
      `INVALID_${type.toUpperCase()}_REFERENCE`,
      400,
    );
    const record = await dependencies.database.collection(type).findOne({ id });
    dependencies.p3Assert(
      record &&
        (!active ||
          (record.active !== false &&
            !["INACTIVE", "DISABLED", "ENDED"].includes(record.status))),
      `${type.toUpperCase()}_REFERENCE_UNAVAILABLE`,
      409,
    );
    return record;
  }

  const p6References = {
    Employee: [
      ["ShiftAssignment", "employeeId"],
      ["PeriodRegistration", "employeeId"],
      ["Payslip", "employeeId"],
      ["Commission", "employeeId"],
      ["EmployeeRevenue", "employeeId"],
      ["Deposit", "employeeId"],
      ["Hold", "employeeId"],
      ["Viewing", "employeeId"],
      ["ContactRequest", "respondedBy"],
      ["TaskAssignment", "employeeId"],
      ["Payment", "confirmedByEmployeeId"],
      ["Payment", "employeeId"],
      ["Receipt", "employeeId"],
      ["BrokerageTransaction", "employeeId"],
    ],
    Owner: [
      ["Room", "ownerId"],
      ["BrokerageAgreement", "ownerId"],
      ["Deposit", "ownerId"],
      ["Contract", "ownerId"],
    ],
    Property: [
      ["Room", "propertyId"],
      ["PropertySchool", "propertyId"],
    ],
    School: [
      ["PropertySchool", "schoolId"],
      ["Property", "nearbySchools.schoolId"],
    ],
    WorkLocation: [["Shift", "workLocationId"]],
    BrokerageAgreement: [
      ["BrokerageTransaction", "agreementId"],
      ["Contract", "agreementId"],
    ],
    Room: [
      ["Hold", "roomId"],
      ["Deposit", "roomId"],
      ["Contract", "roomId"],
      ["BrokerageAgreement", "roomId"],
      ["Favorite", "roomId"],
      ["ViewingDetail", "roomId"],
      ["Viewing", "rooms.roomId"],
      ["BrokerageTransaction", "roomId"],
      ["Payment", "roomId"],
      ["Receipt", "roomId"],
    ],
  };

  async function p6Referenced(type, id) {
    for (const [source, field] of p6References[type] || []) {
      if (
        await dependencies.database.collection(source).findOne({ [field]: id })
      )
        return true;
    }
    return false;
  }

  async function p6Unreferenced(type, id) {
    if (type === "Room") {
      dependencies.p3Assert(
        !(await roomHasActiveFlow(id)),
        "ROOM_HAS_ACTIVE_FLOW",
      );
      return;
    }
    if (!(await p6Referenced(type, id))) return;
    const messages = {
      Employee:
        "Nhân viên đã có ca làm, lương hoặc hồ sơ liên quan; hãy ngừng hoạt động thay vì xóa.",
      Owner:
        "Chủ phòng đang được sử dụng bởi phòng hoặc hồ sơ môi giới; hãy ngưng hoạt động thay vì xóa.",
      Property:
        "Tòa nhà đang có phòng hoặc liên kết trường học; hãy ngưng hoạt động thay vì xóa.",
      School:
        "Trường học đang được liên kết với tòa nhà; hãy ngưng hoạt động thay vì xóa.",
      WorkLocation:
        "Địa điểm đang được dùng trong lịch ca; hãy ngưng hoạt động thay vì xóa.",
      BrokerageAgreement:
        "Thỏa thuận đã có hợp đồng hoặc giao dịch; hãy kết thúc hiệu lực thay vì xóa.",
    };
    throw Object.assign(dependencies.p3Error(409, "REFERENCED_RECORD"), {
      resource: type,
      reason:
        messages[type] ||
        "Bản ghi đang được sử dụng; hãy ngưng hoạt động thay vì xóa.",
    });
  }

  async function p6RoomHasHistory(room) {
    return !!(
      room.lock ||
      room.hasHistory ||
      ["HELD", "RENTED"].includes(room.businessStatus || room.status) ||
      (await p6Referenced("Room", room.id))
    );
  }

  async function p6DeleteRoom(plan, room) {
    await deleteRoomWithSnapshot(plan, room);
    return p6Safe(room);
  }

  async function roomHasActiveFlow(roomId, completingContractId) {
    for (const [type, statuses] of [
      ["Hold", ["PAYMENT_PENDING", "ACTIVE"]],
      ["Deposit", ["PAYMENT_PENDING", "PAID"]],
      ["Contract", ["DRAFT", "SIGNED"]],
    ]) {
      if (
        await dependencies.p3Collections[type].findOne({
          roomId,
          status: { $in: statuses },
          ...(type === "Contract" && completingContractId
            ? { id: { $ne: completingContractId } }
            : {}),
        })
      )
        return true;
    }
    return false;
  }

  async function snapshotRoom(room) {
    const property = room.propertyId
      ? await dependencies.propertyCollection.findOne({ id: room.propertyId })
      : null;
    return {
      id: room.id,
      code: room.code || "",
      name: room.name || "",
      type: room.type || room.roomType || "",
      address: room.address || property?.address || "",
      propertyId: room.propertyId || "",
      propertyName: room.propertyName || property?.name || "",
      ownerId: room.ownerId || "",
      monthlyRent: room.monthlyRent ?? room.price ?? 0,
      area: room.area ?? 0,
      capacity: room.capacity ?? 0,
    };
  }

  async function deleteRoomWithSnapshot(plan, room, completingContractId) {
    if (await roomHasActiveFlow(room.id, completingContractId))
      throw Object.assign(dependencies.p3Error(409, "ROOM_HAS_ACTIVE_FLOW"), {
        resource: "Room",
        reason:
          "Phòng còn giữ chỗ, cọc hoặc hợp đồng đang xử lý. Hãy kết thúc hồ sơ trước khi xóa.",
      });
    const roomSnapshot = await snapshotRoom(room);
    const p3 = !!plan.opId;
    const change = async (type, before, fields) =>
      p3
        ? dependencies.p3Change(plan, type, before, fields)
        : p6Effect(plan, type, before, fields);
    const contracts = await dependencies.p3Collections.Contract.find({
      roomId: room.id,
    }).toArray();
    for (const type of [
      "Contract",
      "Deposit",
      "Hold",
      "BrokerageTransaction",
      "BrokerageAgreement",
      "ViewingDetail",
    ]) {
      const filter =
        type === "BrokerageTransaction"
          ? {
              $or: [
                { roomId: room.id },
                { contractId: { $in: contracts.map((c) => c.id) } },
              ],
            }
          : { roomId: room.id };
      for (const row of await dependencies.database
        .collection(type)
        .find(filter)
        .toArray()) {
        await change(type, row, {
          roomSnapshot,
          ...(type === "BrokerageAgreement" && row.status === "ACTIVE"
            ? {
                status: "ENDED",
                effectiveTo: new Date(
                  new Date(plan.now || plan.at).getTime() + 7 * 3600000,
                )
                  .toISOString()
                  .slice(0, 10),
              }
            : {}),
        });
      }
    }
    // Viewing embeds the same details for customer history and cancellation responses.
    for (const row of await dependencies.viewingCollection
      .find({ "rooms.roomId": room.id })
      .toArray()) {
      await change("Viewing", row, {
        rooms: row.rooms.map((detail) =>
          detail.roomId === room.id ? { ...detail, roomSnapshot } : detail,
        ),
      });
    }
    for (const type of ["Favorite", "RoomImage", "RoomPriceHistory", "Room"]) {
      const rows =
        type === "Room"
          ? [room]
          : await dependencies.database
              .collection(type)
              .find({ roomId: room.id })
              .toArray();
      for (const row of rows) {
        if (p3) {
          plan.effects.push({ kind: "delete", type, id: row.id });
          await dependencies.p3Event(
            plan,
            type,
            row.id,
            "DELETE",
            type === "Room" ? { ...row, roomSnapshot } : row,
            null,
          );
        } else {
          p6Effect(plan, type, row, null);
          if (type === "Room")
            plan.effects[plan.effects.length - 1].roomSnapshot = roomSnapshot;
        }
      }
    }
    return roomSnapshot;
  }

  async function p6P2Serial(work) {
    const previous = dependencies.p2WriteQueue;
    let release;
    dependencies.p2WriteQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  function p6Serial(work) {
    return dependencies.p3Serial(() =>
      dependencies.p4Serial(() => p6P2Serial(work)),
    );
  }

  async function p6PrepareImageOrder(op, cursor) {
    const remaining = op.plan.effects.slice(cursor);
    const moving = remaining.filter(
      (effect) =>
        effect.type === "RoomImage" &&
        effect.before &&
        effect.after &&
        effect.before.order !== effect.after.order,
    );
    if (!moving.length) return null;

    // Park changing positions before assigning the final order. The unique
    // (roomId, order) index otherwise rejects swaps and cover-image changes.
    // Persist these steps first so interrupted and legacy operations can resume.
    const stages = [],
      parked = new Map(),
      nextOrder = new Map();
    for (const effect of moving) {
      const before = effect.before;
      if (!nextOrder.has(before.roomId)) {
        const images = await p6Collections.RoomImage.find({
          roomId: before.roomId,
        }).toArray();
        nextOrder.set(
          before.roomId,
          Math.min(0, ...images.map((image) => image.order)) - 1,
        );
      }
      const order = nextOrder.get(before.roomId);
      dependencies.p3Assert(Number.isSafeInteger(order), "INVALID_IMAGE_ORDER");
      nextOrder.set(before.roomId, order - 1);
      parked.set(before.id, order);
      stages.push({
        type: "RoomImage",
        before,
        after: { ...before, order },
        action: "REORDER_STAGE",
        internal: true,
      });
    }
    const effects = [
      ...op.plan.effects.slice(0, cursor),
      ...stages,
      ...remaining.map((effect) =>
        effect.type === "RoomImage" && parked.has(effect.before?.id)
          ? {
              ...effect,
              auditBefore: effect.before,
              before: { ...effect.before, order: parked.get(effect.before.id) },
            }
          : effect,
      ),
    ];
    const saved = await dependencies.auditCollection.updateOne(
      { id: op.id, state: "PENDING", cursor },
      { $set: { "plan.effects": effects, imageOrderPrepared: true } },
    );
    dependencies.p3Assert(
      saved.matchedCount === 1,
      "CATALOG_RECOVERY_REQUIRED",
      503,
    );
    return {
      ...op,
      cursor,
      imageOrderPrepared: true,
      plan: { ...op.plan, effects },
    };
  }

  async function p6Run(op) {
    for (let i = op.cursor || 0; i < op.plan.effects.length; i++) {
      const effect = op.plan.effects[i],
        col = p6Collections[effect.type],
        token = `${op.id}:${i}`;
      const id = effect.after?.id || effect.before.id,
        current = await col.findOne({ id });
      if (current?._p6Token !== token) {
        if (effect.type === "RoomImage" && !op.imageOrderPrepared) {
          const prepared = await p6PrepareImageOrder(op, i);
          if (prepared) return p6Run(prepared);
        }
        let applied = true;
        if (!effect.after) {
          if (current)
            applied =
              (await col.deleteOne({ id, ...effect.before })).deletedCount ===
              1;
        } else if (!effect.before) {
          if (current) applied = false;
          else await col.insertOne({ ...effect.after, _p6Token: token });
        } else {
          applied =
            (
              await col.updateOne(
                { id, ...effect.before },
                { $set: { ...effect.after, _p6Token: token } },
              )
            ).matchedCount === 1;
        }
        if (!applied) {
          if (i === 0)
            await dependencies.auditCollection.updateOne(
              { id: op.id },
              { $set: { state: "FAILED" } },
            );
          throw dependencies.p3Error(
            i === 0 ? 409 : 503,
            i === 0 ? "CONCURRENT_CHANGE" : "CATALOG_RECOVERY_REQUIRED",
          );
        }
      }
      const event = {
        id: `${token}:audit`,
        entityType: effect.type,
        entityId: id,
        action: effect.action,
        before: p6Safe(effect.auditBefore || effect.before),
        after: p6Safe(effect.after),
        actorId: op.actorId,
        at: op.at,
        reason: op.reason,
        ...(effect.roomSnapshot ? { roomSnapshot: effect.roomSnapshot } : {}),
      };
      if (!effect.internal)
        await dependencies.auditCollection.updateOne(
          { id: event.id },
          { $setOnInsert: event },
          { upsert: true },
        );
      await dependencies.auditCollection.updateOne(
        { id: op.id },
        { $set: { cursor: i + 1 } },
      );
    }
    // Intent data is private; discard credentials once recovery no longer needs them.
    await dependencies.auditCollection.updateOne(
      { id: op.id },
      { $set: { state: "DONE" }, $unset: { plan: "" } },
    );
    return op.result;
  }

  async function p6Recover() {
    for (const op of await dependencies.auditCollection
      .find({ entityType: "P6Operation", state: "PENDING" })
      .sort({ at: 1 })
      .toArray())
      await p6Run(op);
  }

  async function p6Barrier() {
    return p6Serial(p6Recover);
  }

  async function p6Execute(req, prepare) {
    const key = req.get?.("Idempotency-Key");
    dependencies.p3Assert(
      !key || (typeof key === "string" && key.length >= 8 && key.length <= 160),
      "INVALID_IDEMPOTENCY_KEY",
      400,
    );
    const p6Key = key && `${req.p2Account.id}:${key}`;
    const fingerprint = dependencies.crypto
      .createHash("sha256")
      .update(
        JSON.stringify(
          dependencies.p3Stable({
            method: req.method,
            path: req.path,
            body: req.body || {},
          }),
        ),
      )
      .digest("hex");
    if (p6Key) {
      const prior = await dependencies.auditCollection.findOne({ p6Key });
      if (prior) {
        dependencies.p3Assert(
          prior.fingerprint === fingerprint,
          "IDEMPOTENCY_CONFLICT",
        );
        dependencies.p3Assert(prior.state !== "FAILED", "CONCURRENT_CHANGE");
        return prior.state === "DONE" ? prior.result : p6Run(prior);
      }
    }
    const plan = { effects: [], at: new Date() },
      result = await prepare(plan);
    const op = {
      id: `p6-op-${new dependencies.ObjectId()}`,
      entityType: "P6Operation",
      state: "PENDING",
      cursor: 0,
      at: plan.at,
      actorId: req.p2Account.id,
      reason:
        typeof req.body?.reason === "string"
          ? req.body.reason.slice(0, 1000)
          : "",
      plan,
      result: p6Safe(result),
      fingerprint,
      ...(p6Key ? { p6Key } : {}),
    };
    await dependencies.auditCollection.insertOne(op);
    return p6Run(op);
  }

  function p6Route(handler) {
    return async (req, res) => {
      try {
        await p6Serial(async () => {
          await dependencies.p3Recover();
          await dependencies.p4Recover();
          await dependencies.p5Recover();
          await p6Recover();
          await handler(req, res);
        });
      } catch (error) {
        res.status(error.status || (error.code === 11000 ? 409 : 503)).send({
          code:
            error.code === 11000
              ? "DUPLICATE_RECORD"
              : error.code || "CATALOG_RECOVERY_REQUIRED",
          message: error.reason || error.message,
          ...(error.reason ? { reason: error.reason } : {}),
          ...(error.resource ? { resource: error.resource } : {}),
        });
      }
    };
  }

  async function p6Validate(type, body, before) {
    dependencies.p3Assert(
      body && typeof body === "object" && !Array.isArray(body),
      "INVALID_BODY",
      400,
    );
    const value = { ...before, ...body },
      fields = {};
    const text = (key, min = 1, max = 200) => {
      fields[key] = p6Text(value[key], key.toUpperCase(), min, max);
    };
    if (type === "Owner" || type === "Employee") {
      text("fullName", 2, 120);
      fields.phone = dependencies.normalizePhone(value.phone);
      dependencies.p3Assert(
        dependencies.validPhone(fields.phone),
        "INVALID_PHONE",
        400,
      );
    } else if (type !== "BrokerageAgreement") text("name", 2);
    if (type === "Employee") {
      for (const key of ["position", "email"]) text(key);
      dependencies.p3Assert(
        ["FULL_TIME", "PART_TIME", "INTERNSHIP"].includes(value.contractType),
        "INVALID_CONTRACT_TYPE",
        400,
      );
      fields.contractType = value.contractType;
      fields.email = fields.email.toLowerCase();
      dependencies.p3Assert(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email),
        "INVALID_EMAIL",
        400,
      );
      fields.birthDate = p6Day(value.birthDate, "BIRTH_DATE");
      fields.startDate = p6Day(value.startDate, "START_DATE");
      const today = new Date().toISOString().slice(0, 10);
      dependencies.p3Assert(
        fields.birthDate < today &&
          fields.startDate >= fields.birthDate &&
          fields.startDate <= today,
        "INVALID_EMPLOYEE_DATES",
        400,
      );
      dependencies.p3Assert(
        ["FEMALE", "MALE", "OTHER"].includes(value.gender),
        "INVALID_GENDER",
        400,
      );
      fields.gender = value.gender;
      fields.status = value.status || "ACTIVE";
      dependencies.p3Assert(
        ["ACTIVE", "ON_LEAVE", "INACTIVE"].includes(fields.status),
        "INVALID_STATUS",
        400,
      );
      if (
        before &&
        fields.status === "INACTIVE" &&
        before.status !== "INACTIVE"
      )
        throw dependencies.p3Error(409, "USE_DEACTIVATE");
      fields.baseSalary = value.baseSalary ?? null;
      dependencies.p3Assert(
        fields.baseSalary === null ||
          (Number.isSafeInteger(fields.baseSalary) && fields.baseSalary >= 0),
        "INVALID_BASE_SALARY",
        400,
      );
      fields.name = fields.fullName;
      if (value.avatar) {
        p6ImageUrl(
          value.avatar,
          value.avatar.startsWith("/uploads/employees/")
            ? "employees"
            : "employee",
        );
        fields.avatar = value.avatar;
        fields.avatarUrl = value.avatar;
      }
      // WorkLocation belongs to Shift, never to Employee (D-15).
    }
    if (type === "Owner")
      fields.note =
        typeof value.note === "string" ? value.note.trim().slice(0, 1000) : "";
    if (["Owner", "Property", "School", "WorkLocation"].includes(type)) {
      dependencies.p3Assert(
        value.active === undefined || typeof value.active === "boolean",
        "INVALID_ACTIVE",
        400,
      );
      fields.active = value.active !== false;
    }
    if (["Property", "School", "WorkLocation"].includes(type)) {
      const coordinates = body.geo?.coordinates;
      Object.assign(
        fields,
        p6Geo(
          coordinates && body.lat === undefined && body.lng === undefined
            ? { ...value, lat: coordinates[1], lng: coordinates[0] }
            : value,
          type === "Property",
        ),
      );
      if (type === "Property") {
        for (const key of ["addressLine", "ward", "district", "province"])
          text(key);
        fields.address = [
          fields.addressLine,
          fields.ward,
          fields.district,
          fields.province,
        ].join(", ");
        fields.locationStatus = fields.geo
          ? value.locationStatus === "demo"
            ? "estimated"
            : value.locationStatus || "estimated"
          : "pending";
        dependencies.p3Assert(
          ["estimated", "sourced", "pending"].includes(fields.locationStatus),
          "INVALID_LOCATION_STATUS",
          400,
        );
        fields.locationSource =
          typeof value.locationSource === "string"
            ? value.locationSource.slice(0, 1000)
            : "Admin";
        fields.images = before?.images || [];
      } else {
        text("address");
        if (type === "School") {
          text("campus");
          text("source", 1, 1000);
          fields.logoUrl = value.logoUrl || value.logo || "";
          if (fields.logoUrl) p6ImageUrl(fields.logoUrl, "schools");
          fields.logo = fields.logoUrl;
        } else {
          dependencies.p3Assert(
            Number.isFinite(value.allowedRadiusM) && value.allowedRadiusM > 0,
            "INVALID_RADIUS",
            400,
          );
          fields.allowedRadiusM = value.allowedRadiusM;
        }
      }
    }
    if (type === "BrokerageAgreement") {
      const room = await p6Foreign("Room", value.roomId);
      fields.roomId = room.id;
      fields.ownerId = value.ownerId ?? room.ownerId ?? null;
      if (fields.ownerId) {
        await p6Foreign(
          "Owner",
          fields.ownerId,
          !before || fields.ownerId !== before.ownerId,
        );
        dependencies.p3Assert(
          fields.ownerId === room.ownerId,
          "AGREEMENT_OWNER_MISMATCH",
          409,
        );
      }
      fields.effectiveFrom = p6Day(value.effectiveFrom, "EFFECTIVE_FROM");
      fields.effectiveTo = value.effectiveTo
        ? p6Day(value.effectiveTo, "EFFECTIVE_TO")
        : null;
      dependencies.p3Assert(
        !fields.effectiveTo || fields.effectiveTo >= fields.effectiveFrom,
        "INVALID_AGREEMENT_DATES",
        400,
      );
      fields.status = value.status || "ACTIVE";
      dependencies.p3Assert(
        ["ACTIVE", "ENDED"].includes(fields.status),
        "INVALID_STATUS",
        400,
      );
      // DATA-PLAN: common brokerage fee 50% of one month, no new fee policy in P6.
      dependencies.p3Assert(
        (value.feeMethod || "PERCENT_OF_MONTHLY_RENT") ===
          "PERCENT_OF_MONTHLY_RENT" && (value.feeValue ?? 5000) === 5000,
        "BROKERAGE_FEE_FIXED_BY_DATA_PLAN",
        400,
      );
      fields.feeMethod = "PERCENT_OF_MONTHLY_RENT";
      fields.feeValue = 5000;
      const others = await p6Collections.BrokerageAgreement.find({
        roomId: room.id,
        id: { $ne: before?.id || "" },
      }).toArray();
      dependencies.p3Assert(
        !others.some((other) => p6Overlap(fields, other)),
        "AGREEMENT_OVERLAP",
      );
      if (
        before &&
        (await dependencies.database
          .collection("BrokerageTransaction")
          .findOne({ agreementId: before.id }))
      ) {
        dependencies.p3Assert(
          ["roomId", "ownerId", "effectiveFrom", "feeMethod", "feeValue"].every(
            (key) => fields[key] === before[key],
          ),
          "AGREEMENT_ALREADY_USED",
        );
      }
    }
    return fields;
  }

  async function p6Nearby(plan, property, schools) {
    const current = await dependencies.propertySchoolCollection
      .find({ propertyId: property.id })
      .toArray();
    const links = [];
    if (property.geo && property.active !== false)
      for (const school of schools.filter((s) => s.active !== false)) {
        // A school counts as nearby within a 7 km straight-line radius (user decision 14/11/2026);
        // the stored distance/travel time stay the road estimate (haversine × 1.3).
        const straight = dependencies.p4Distance(property, school);
        if (!Number.isFinite(straight) || straight > 7000) continue;
        const meters = straight * 1.3;
        const distanceM = Math.round(meters),
          old = current.find((link) => link.schoolId === school.id);
        links.push(
          p6Effect(plan, "PropertySchool", old || null, {
            id: old?.id || `${property.id}-${school.id}`,
            propertyId: property.id,
            schoolId: school.id,
            distanceM,
            distanceKm: distanceM / 1000,
            travelMinutes: Math.round((distanceM / 25000) * 60 * 10) / 10,
            source: "haversine × 1.3; xe máy 25 km/h; ước lượng",
          }),
        );
      }
    for (const old of current)
      if (!links.some((link) => link.id === old.id))
        p6Effect(plan, "PropertySchool", old, null);
    return links.map(({ schoolId, distanceM, travelMinutes, source }) => ({
      schoolId,
      distanceM,
      travelMinutes,
      source,
    }));
  }

  async function p6SaveCatalog(plan, type, body, id) {
    const before = id ? await p6Get(type, id) : null;
    const fields = await p6Validate(type, body, before);
    const after = {
      ...p6Clean(before),
      ...fields,
      id: before?.id || `p6-${new dependencies.ObjectId()}`,
      updatedAt: plan.at,
    };
    if (!before) after.createdAt = plan.at;
    if (type === "Property") {
      const result = p6Effect(plan, type, before, after);
      result.nearbySchools = await p6Nearby(
        plan,
        after,
        await dependencies.schoolCollection.find({}).toArray(),
      );
      return p6Safe(result);
    }
    p6Effect(plan, type, before, after);
    if (type === "School")
      for (const property of await dependencies.propertyCollection
        .find({})
        .toArray()) {
        const schools = (
          await dependencies.schoolCollection
            .find({ id: { $ne: after.id } })
            .toArray()
        ).concat(after);
        const nearbySchools = await p6Nearby(plan, property, schools);
        p6Effect(plan, "Property", property, {
          nearbySchools,
          updatedAt: plan.at,
        });
      }
    return p6Safe(after);
  }

  function p6Password(body) {
    const value =
      body?.temporaryPassword === undefined
        ? dependencies.crypto.randomBytes(12).toString("base64url")
        : body.temporaryPassword;
    dependencies.p3Assert(
      typeof value === "string" && value.length >= 8 && value.length <= 128,
      "INVALID_TEMPORARY_PASSWORD",
      400,
    );
    return value;
  }

  function p6Credentials(password) {
    const salt = dependencies.crypto.randomBytes(16).toString("hex");
    return {
      salt,
      passwordHash: dependencies.crypto
        .scryptSync(password, salt, 64)
        .toString("hex"),
      passwordTemporary: true,
    };
  }

  async function p6Images(plan, room, urls) {
    p6ImageList(urls, room.publicationStatus === "PUBLISHED");
    const current = await p6Collections.RoomImage.find({
      roomId: room.id,
    }).toArray();
    for (const old of current)
      if (!urls.includes(old.url)) p6Effect(plan, "RoomImage", old, null);
    const result = urls.map((url, index) => {
      const old = current.find((image) => image.url === url);
      return p6Effect(plan, "RoomImage", old || null, {
        roomId: room.id,
        url,
        order: index + 1,
        isCover: index === 0,
        caption: old?.caption || "",
        mimeType:
          old?.mimeType ||
          `image/${url.split(".").pop().toLowerCase().replace("jpg", "jpeg")}`,
      });
    });
    return result;
  }

  async function p6RoomFields(body, before) {
    const value = { ...before, ...body },
      fields = {};
    for (const key of ["code", "name", "number", "type", "description"])
      fields[key] = p6Text(
        value[key],
        key.toUpperCase(),
        1,
        key === "description" ? 10000 : key === "code" ? 40 : 200,
      );
    const roomTypes = {
      PHONG_TRO: "Phòng trọ",
      CAN_HO_MINI: "Căn hộ mini",
      STUDIO: "Studio",
      DUPLEX: "Duplex",
      CAN_HO: "Căn hộ",
      KTX: "Ký túc xá",
    };
    fields.roomType = Object.keys(roomTypes).includes(fields.type)
      ? fields.type
      : Object.keys(roomTypes).find((key) => roomTypes[key] === fields.type) ||
        value.roomType;
    dependencies.p3Assert(
      Object.keys(roomTypes).includes(fields.roomType),
      "INVALID_ROOM_TYPE",
      400,
    );
    fields.type = roomTypes[fields.roomType];
    fields.codeNormalized = fields.code.replace(/\s/g, "").toUpperCase();
    fields.numberNormalized = fields.number.replace(/\s/g, "").toUpperCase();
    fields.propertyId = (
      await p6Foreign(
        "Property",
        value.propertyId,
        !before || value.propertyId !== before.propertyId,
      )
    ).id;
    fields.ownerId = value.ownerId || null;
    if (fields.ownerId)
      await p6Foreign(
        "Owner",
        fields.ownerId,
        !before || fields.ownerId !== before.ownerId,
      );
    if (before && fields.ownerId !== before.ownerId) {
      dependencies.p3Assert(
        !(await p6Collections.BrokerageAgreement.findOne({
          roomId: before.id,
          status: "ACTIVE",
        })),
        "ROOM_OWNER_HAS_AGREEMENT",
      );
    }
    fields.price =
      body.price ?? body.monthlyRent ?? before?.price ?? before?.monthlyRent;
    dependencies.p3Assert(
      Number.isSafeInteger(fields.price) && fields.price > 0,
      "INVALID_PRICE",
      400,
    );
    fields.monthlyRent = fields.price;
    fields.deposit =
      body.deposit ?? body.standardDeposit ?? before?.deposit ?? fields.price;
    fields.standardDeposit = fields.deposit;
    dependencies.p3Assert(
      Number.isSafeInteger(fields.deposit) && fields.deposit >= 0,
      "INVALID_DEPOSIT",
      400,
    );
    fields.serviceFee =
      body.fees?.management ??
      body.fees?.["Dịch vụ"] ??
      body.serviceFee ??
      before?.serviceFee ??
      150000;
    dependencies.p3Assert(
      Number.isSafeInteger(fields.serviceFee) && fields.serviceFee >= 0,
      "INVALID_SERVICE_FEE",
      400,
    );
    dependencies.p3Assert(
      Number.isFinite(value.area) &&
        value.area > 0 &&
        Number.isSafeInteger(value.capacity) &&
        value.capacity > 0,
      "INVALID_ROOM_SIZE",
      400,
    );
    fields.area = value.area;
    fields.capacity = value.capacity;
    fields.publicationStatus = value.publicationStatus || "DRAFT";
    dependencies.p3Assert(
      ["DRAFT", "PUBLISHED", "HIDDEN"].includes(fields.publicationStatus),
      "INVALID_PUBLICATION_STATUS",
      400,
    );
    const status =
      body.businessStatus ||
      body.status ||
      before?.businessStatus ||
      before?.status ||
      "AVAILABLE";
    if (!before || status !== (before.businessStatus || before.status)) {
      dependencies.p3Assert(
        ["AVAILABLE", "MAINTENANCE"].includes(status) &&
          (!before ||
            (!before.lock &&
              ["AVAILABLE", "MAINTENANCE"].includes(
                before.businessStatus || before.status,
              ))),
        "USE_MONEY_WORKFLOW",
      );
    }
    fields.businessStatus = status;
    fields.status = status;
    if (
      fields.publicationStatus === "PUBLISHED" &&
      (!before || before.publicationStatus !== "PUBLISHED")
    ) {
      dependencies.p3Assert(status === "AVAILABLE", "ROOM_NOT_AVAILABLE");
    }
    fields.images = p6ImageList(
      value.images || [],
      fields.publicationStatus === "PUBLISHED",
    );
    dependencies.p3Assert(
      Array.isArray(value.amenities || []) &&
        (value.amenities || []).every((a) => typeof a === "string"),
      "INVALID_AMENITIES",
      400,
    );
    fields.amenities = value.amenities || [];
    for (const key of [
      "address",
      "district",
      "floor",
      "propertyName",
      "mediaStatus",
      "roomType",
    ])
      if (typeof value[key] === "string")
        fields[key] = value[key].slice(0, 1000);
    value.electricityPrice =
      body.fees?.electricity ?? body.fees?.["Điện"] ?? value.electricityPrice;
    value.waterPrice =
      body.fees?.water ?? body.fees?.["Nước"] ?? value.waterPrice;
    for (const key of [
      "electricityPrice",
      "waterPrice",
      "bedrooms",
      "bathrooms",
    ])
      if (value[key] !== undefined) {
        dependencies.p3Assert(
          Number.isSafeInteger(value[key]) && value[key] >= 0,
          `INVALID_${key.toUpperCase()}`,
          400,
        );
        fields[key] = value[key];
      }
    if (value.fees) {
      dependencies.p3Assert(
        typeof value.fees === "object" &&
          !Array.isArray(value.fees) &&
          Object.values(value.fees).every(
            (v) => Number.isSafeInteger(v) && v >= 0,
          ),
        "INVALID_FEES",
        400,
      );
      fields.fees = {
        ...value.fees,
        "Dịch vụ": fields.serviceFee,
        ...(fields.electricityPrice !== undefined
          ? { Điện: fields.electricityPrice }
          : {}),
        ...(fields.waterPrice !== undefined ? { Nước: fields.waterPrice } : {}),
      };
    }
    fields.featured = value.featured === true;
    const duplicate = await dependencies.roomCollection.findOne({
      id: { $ne: before?.id || "" },
      $or: [
        { codeNormalized: fields.codeNormalized },
        { code: fields.code },
        {
          propertyId: fields.propertyId,
          numberNormalized: fields.numberNormalized,
        },
      ],
    });
    dependencies.p3Assert(!duplicate, "DUPLICATE_ROOM");
    fields.slug =
      fields.name === before?.name && before.slug
        ? before.slug
        : dependencies.createSlug(fields.name);
    dependencies.p3Assert(fields.slug, "INVALID_ROOM_NAME", 400);
    if (
      await dependencies.roomCollection.findOne({
        slug: fields.slug,
        id: { $ne: before?.id || "" },
      })
    )
      fields.slug += "-" + (before?.id || new dependencies.ObjectId());
    return fields;
  }

  async function p6SaveRoom(req, plan, before) {
    dependencies.p3Assert(
      !before ||
        req.body?.version === undefined ||
        req.body.version === before.version,
      "CONCURRENT_CHANGE",
    );
    const fields = await p6RoomFields(req.body || {}, before);
    const id =
      before?.id ||
      (typeof req.body.id === "string" && /^[\w-]{1,80}$/.test(req.body.id)
        ? req.body.id
        : `phong-${new dependencies.ObjectId()}`);
    dependencies.p3Assert(
      before || !(await dependencies.roomCollection.findOne({ id })),
      "DUPLICATE_ROOM",
    );
    const result = p6Effect(plan, "Room", before, {
      ...fields,
      id,
      version: (before?.version || 0) + 1,
      ...(!before ? { lock: null, hasHistory: false, createdAt: plan.at } : {}),
      updatedAt: plan.at,
    });
    if (before && fields.price !== (before.price ?? before.monthlyRent)) {
      // Append-only events: do not rewrite the previous historical snapshot.
      p6Effect(plan, "RoomPriceHistory", null, {
        roomId: id,
        oldPrice: before.price ?? before.monthlyRent,
        newPrice: fields.price,
        effectiveFrom: plan.at,
        effectiveTo: null,
        changedBy: req.p2Account.id,
        reason:
          typeof req.body.reason === "string"
            ? req.body.reason.slice(0, 1000)
            : "",
      });
    }
    await p6Images(plan, { ...before, ...fields, id }, fields.images);
    return p6Safe(result);
  }

  async function p6ChangeImages(req, plan, change) {
    const room = await p6Get("Room", req.params.id);
    const urls = p6ImageList(
      await change(room),
      room.publicationStatus === "PUBLISHED",
    );
    p6Effect(plan, "Room", room, {
      images: urls,
      version: (room.version || 0) + 1,
      updatedAt: plan.at,
    });
    return (await p6Images(plan, room, urls)).map(p6Safe);
  }

  async function initializeP6() {
    for (const type of p6Types)
      await p6Collections[type].createIndex({ id: 1 }, { unique: true });
    await dependencies.employeeCollection.createIndex(
      { accountId: 1 },
      { unique: true },
    );
    await dependencies.employeeCollection.createIndex(
      { employeeCode: 1 },
      { unique: true },
    );
    await dependencies.employeeCollection.createIndex(
      { email: 1 },
      { unique: true, sparse: true },
    );
    await dependencies.accountCollection.createIndex(
      { phone: 1 },
      { unique: true },
    );
    await p6Collections.Counter.createIndex(
      { id: 1 },
      { unique: true, sparse: true },
    );
    await dependencies.roomCollection.createIndex(
      { codeNormalized: 1 },
      { unique: true, sparse: true },
    );
    await dependencies.roomCollection.createIndex(
      { propertyId: 1, numberNormalized: 1 },
      {
        unique: true,
        partialFilterExpression: { numberNormalized: { $type: "string" } },
      },
    );
    await dependencies.propertySchoolCollection.createIndex(
      { propertyId: 1, schoolId: 1 },
      { unique: true },
    );
    await p6Collections.RoomImage.createIndex(
      { roomId: 1, url: 1 },
      { unique: true },
    );
    await p6Collections.RoomPriceHistory.createIndex({
      roomId: 1,
      effectiveFrom: -1,
    });
    await p6Collections.BrokerageAgreement.createIndex({
      roomId: 1,
      effectiveFrom: 1,
      effectiveTo: 1,
    });
    await dependencies.auditCollection.createIndex(
      { p6Key: 1 },
      { unique: true, sparse: true },
    );
    await dependencies.auditCollection.createIndex({
      entityType: 1,
      actorId: 1,
      at: -1,
    });
    await p6Barrier();
  }

  Object.defineProperties(dependencies, {
    p6Types: { enumerable: true, get: () => p6Types },
    p6Collections: { enumerable: true, get: () => p6Collections },
    p6Admin: { enumerable: true, get: () => p6Admin },
    p6Clean: { enumerable: true, get: () => p6Clean },
    p6Safe: { enumerable: true, get: () => p6Safe },
    p6Text: { enumerable: true, get: () => p6Text },
    p6Day: { enumerable: true, get: () => p6Day },
    p6Geo: { enumerable: true, get: () => p6Geo },
    p6ImageUrl: { enumerable: true, get: () => p6ImageUrl },
    p6ImageList: { enumerable: true, get: () => p6ImageList },
    p6Overlap: { enumerable: true, get: () => p6Overlap },
    p6Effect: { enumerable: true, get: () => p6Effect },
    p6Get: { enumerable: true, get: () => p6Get },
    p6Foreign: { enumerable: true, get: () => p6Foreign },
    p6References: { enumerable: true, get: () => p6References },
    p6Referenced: { enumerable: true, get: () => p6Referenced },
    p6Unreferenced: { enumerable: true, get: () => p6Unreferenced },
    p6RoomHasHistory: { enumerable: true, get: () => p6RoomHasHistory },
    p6DeleteRoom: { enumerable: true, get: () => p6DeleteRoom },
    roomHasActiveFlow: { enumerable: true, get: () => roomHasActiveFlow },
    snapshotRoom: { enumerable: true, get: () => snapshotRoom },
    deleteRoomWithSnapshot: {
      enumerable: true,
      get: () => deleteRoomWithSnapshot,
    },
    p6P2Serial: { enumerable: true, get: () => p6P2Serial },
    p6Serial: { enumerable: true, get: () => p6Serial },
    p6Run: { enumerable: true, get: () => p6Run },
    p6Recover: { enumerable: true, get: () => p6Recover },
    p6Barrier: { enumerable: true, get: () => p6Barrier },
    p6Execute: { enumerable: true, get: () => p6Execute },
    p6Route: { enumerable: true, get: () => p6Route },
    p6Validate: { enumerable: true, get: () => p6Validate },
    p6Nearby: { enumerable: true, get: () => p6Nearby },
    p6SaveCatalog: { enumerable: true, get: () => p6SaveCatalog },
    p6Password: { enumerable: true, get: () => p6Password },
    p6Credentials: { enumerable: true, get: () => p6Credentials },
    p6Images: { enumerable: true, get: () => p6Images },
    p6RoomFields: { enumerable: true, get: () => p6RoomFields },
    p6SaveRoom: { enumerable: true, get: () => p6SaveRoom },
    p6ChangeImages: { enumerable: true, get: () => p6ChangeImages },
    initializeP6: { enumerable: true, get: () => initializeP6 },
  });
}
module.exports = { createCatalogService };
