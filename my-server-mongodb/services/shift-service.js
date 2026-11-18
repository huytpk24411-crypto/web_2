// CommonJS services retain the existing rules and MongoDB native-driver operations.
function createShiftService(dependencies) {
  // P4 — LearnAngular/CommonJS, standalone MongoDB, one Express process.
  const p4Collections = Object.fromEntries(
    [
      "RegistrationPeriod",
      "PeriodRegistration",
      "Shift",
      "ShiftAssignment",
      "Attendance",
      "AttendanceEvidence",
      "WorkLocation",
      "Task",
      "TaskShift",
      "TaskAssignment",
      "PayrollPeriod",
      "PayrollAdjustment",
      "Payslip",
      "Policy",
      "PolicyLevel",
      "Notification",
      "AuditLog",
      "Employee",
      "Account",
      "Viewing",
      "ViewingDetail",
      "Room",
      "Property",
      "Customer",
    ].map((name) => [name, dependencies.database.collection(name)]),
  );

  const VIEWING_WINDOWS = [
    ["07:00", "10:30", "11:00", "Ca sáng"],
    ["13:00", "16:30", "17:00", "Ca chiều"],
  ];

  function p4ViewingWindow(startAt, endAt) {
    const start = new Date(startAt),
      end = new Date(endAt);
    if (!Number.isFinite(+start) || end - start !== 30 * 60000) return false;
    const local = new Date(+start + 7 * 3600000).toISOString();
    const time = local.slice(11, 16);
    return (
      local.slice(17, 23) === "00.000" &&
      ["00", "30"].includes(time.slice(3)) &&
      VIEWING_WINDOWS.some(([from, to]) => from <= time && time <= to)
    );
  }

  function p4Message(code) {
    return (
      {
        WEEK_EXISTS: "Tuần này đã có đợt đăng ký.",
        MONDAY_REQUIRED: "Ngày bắt đầu đợt phải là thứ Hai.",
        NAME_REQUIRED: "Vui lòng nhập tên.",
        PERIOD_IN_USE:
          "Không thể xóa đợt đã có nhân viên nhận ca hoặc đã có công việc.",
        PERIOD_STATE: "Trạng thái đợt không cho phép thao tác này.",
        PERIOD_OPEN_WINDOW: "Tuần làm việc đã bắt đầu, không thể mở đăng ký.",
        PAST_WEEK: "Không được tạo hoặc mở đợt đăng ký cho tuần đã qua.",
        TASK_LOCKED: "Công việc đã hoàn thành hoặc đã hủy, không thể thay đổi.",
        TASK_NOT_PENDING_CONFIRM: "Công việc không ở trạng thái chờ xác nhận.",
        TASK_PENDING_CONFIRM:
          "Công việc đang chờ xác nhận hoàn thành, hãy xác nhận hoặc trả lại trước.",
        REASON_REQUIRED: "Vui lòng nhập lý do từ 3 đến 500 ký tự.",
        SHIFT_STARTED: "Ca đã bắt đầu, hãy chọn ca khác.",
        OUTSIDE_CHECK_IN_WINDOW: "Chỉ được check-in trong giờ ca làm.",
        SHIFT_CANCELLATION_NOT_ALLOWED:
          "Nhân viên không được hủy ca đã đăng ký.",
        ASSIGNEE_DONE: "Không thể bỏ nhân viên đã hoàn thành phần việc.",
        ASSIGNEES_REQUIRED: "Chọn ít nhất một nhân viên trong ca.",
        ONE_ASSIGNEE_REQUIRED:
          "Việc dẫn khách xem phòng cần đúng một người phụ trách.",
        VIEWING_TITLE_LOCKED: "Không đổi tên việc dẫn khách xem phòng.",
        VIEWING_SHIFT_LOCKED:
          "Việc dẫn khách gắn với giờ xem, không đổi ca được.",
        TASK_HAS_PROGRESS: "Không thể xóa công việc đã có phần hoàn thành.",
        VIEWING_TASK_CANCEL_VIA_VIEWING:
          "Việc dẫn khách chỉ hủy khi lịch xem bị hủy.",
        VIEWING_TASK_AUTO:
          "Việc dẫn khách tự hoàn thành khi ghi kết quả xem phòng.",
        INVALID_ASSIGNEE: "Nhân viên được chọn không trực ca này.",
        SHIFT_CLOSED: "Ca đã kết thúc hoặc đã đóng.",
        CHECK_IN_REQUIRED: "Cần check-in ca trước khi ghi kết quả dẫn xem.",
        VIEWING_OUTSIDE_SHIFT_HOURS:
          "Giờ xem phải bắt đầu trong 07:00–10:30 hoặc 13:00–16:30, cách nhau 30 phút.",
        SLOT_NO_STAFF:
          "Hiện tại chưa có nhân viên trực cho ca này, vui lòng chọn khung giờ khác.",
        VIEWING_TIME_CONFLICT:
          "Bạn đã có lịch xem khác vào giờ này, vui lòng chọn giờ khác.",
        VIEWING_LOCKED:
          "Lịch xem đã qua hoặc không còn hoạt động, không thể thay đổi.",
        VIEWING_PAST: "Vui lòng chọn thời gian xem phòng trong tương lai.",
        EMPLOYEE_BUSY: "Nhân viên đã có lịch dẫn khách khác vào giờ này.",
        INVALID_VIEWING_DATE:
          "Ngày xem phòng không hợp lệ, vui lòng nhập theo định dạng YYYY-MM-DD.",
        INVALID_VIEWING_ITEMS:
          "Vui lòng chọn từ 1 đến 20 phòng khác nhau có trong giỏ đặt lịch.",
        INVALID_VIEWING_DETAILS:
          "Thông tin khách xem, số điện thoại, số người hoặc ghi chú không hợp lệ.",
        VIEWING_ROOM_UNAVAILABLE:
          "Phòng đã chọn không còn trống để đặt lịch xem.",
        VIEWING_NOT_FOUND: "Không tìm thấy lịch xem phòng.",
        NOT_YOUR_VIEWING: "Lịch xem thuộc khách hàng khác.",
      }[code] || "Không thực hiện được thao tác. Vui lòng tải lại và thử lại."
    );
  }

  const p4Fail = (code, status = 409) => {
    throw Object.assign(new Error(p4Message(code)), { code, status });
  };

  const p4Require = (ok, code, status = 409) => {
    if (!ok) p4Fail(code, status);
  };

  const p4Clean = (value) =>
    value &&
    Object.fromEntries(
      Object.entries(value).filter(
        ([k]) => k !== "_id" && !k.startsWith("_p4"),
      ),
    );

  function p4ShiftLimit(count, submit = false) {
    return Number.isInteger(count) && count >= (submit ? 5 : 0) && count <= 8;
  }

  function p4LateMinutes(startsAt, checkInAt) {
    return Math.max(
      0,
      Math.ceil((new Date(checkInAt) - new Date(startsAt)) / 60000),
    );
  }

  function p4Penalty(minutes, levels) {
    if (!minutes) return null;
    return (
      levels.find(
        (level) =>
          minutes >= level.from && (level.to == null || minutes < level.to),
      ) || null
    );
  }

  function p4Distance(a, b) {
    const rad = (v) => (v * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat),
      dLng = rad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  }

  function p4NextAssignment(employeeId, source, assignments, shifts) {
    return (
      assignments
        .filter((a) => a.employeeId === employeeId && a.status === "REGISTERED")
        .map((a) => ({
          assignment: a,
          shift: shifts.find((s) => s.id === a.shiftId),
        }))
        .filter(
          (x) =>
            x.shift?.status === "OPEN" &&
            new Date(x.shift.startsAt) > new Date(source.startsAt),
        )
        .sort(
          (a, b) => new Date(a.shift.startsAt) - new Date(b.shift.startsAt),
        )[0]?.assignment || null
    );
  }

  function p4CarryDecision(part, next) {
    if (part.personalStatus === "DONE" || part.transferredTo || part.removed)
      return { type: "SKIP" };
    return next
      ? { type: "CARRY_OVER", assignmentId: next.id }
      : { type: "WAITING_ADMIN" };
  }

  function p4Day(value, delta = 0) {
    return new Date(Date.parse(`${value}T00:00:00Z`) + delta * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  const p4At = (date, time) => new Date(`${date}T${time}:00+07:00`);

  const p4Get = async (type, id) => {
    const record = await p4Collections[type].findOne({ id });
    p4Require(record, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return record;
  };

  let p4Queue = Promise.resolve();

  function p4Serial(work) {
    const result = p4Queue.then(work);
    p4Queue = result.catch(() => {});
    return result;
  }

  // A durable intent is saved before any mutation. Replay uses per-document tokens;
  // it completes missing effects/audits without applying increments twice.
  function p4Plan(req) {
    return { effects: [], actorId: req.p2Account?.id || null, at: new Date() };
  }

  function p4Effect(plan, type, before, after, extra = {}) {
    plan.effects.push({
      type,
      before: p4Clean(before),
      after: p4Clean(after),
      extra,
    });
    return after;
  }

  function p4New(plan, type, fields, id) {
    return p4Effect(plan, type, null, {
      id: id || `p4-${new dependencies.ObjectId()}`,
      ...fields,
    });
  }

  function p4Set(plan, type, record, fields, extra) {
    record =
      plan.effects
        .filter((e) => e.type === type && e.after?.id === record.id)
        .at(-1)?.after || record;
    if (type === "Task")
      fields = { ...fields, updatedAt: plan.at, updatedBy: plan.actorId };
    return p4Effect(
      plan,
      type,
      record,
      { ...p4Clean(record), ...fields },
      extra,
    );
  }

  function p4Remove(plan, type, record) {
    return p4Effect(plan, type, record, null);
  }

  async function p4Records(type, plan) {
    const rows = new Map(
      (await p4Collections[type].find({}).toArray()).map((r) => [r.id, r]),
    );
    for (const e of plan?.effects || [])
      if (e.type === type) {
        if (e.after) rows.set(e.after.id, e.after);
        else rows.delete(e.before.id);
      }
    return [...rows.values()];
  }

  async function p4RunFromP2(req, action, prepare) {
    const work = async () => {
      await p4Recover();
      return p4Execute(req, action, prepare);
    };
    return req.p4Locked ? work() : p4Serial(work);
  }

  async function p4Run(op) {
    for (let i = op.cursor || 0; i < op.plan.effects.length; i++) {
      const effect = op.plan.effects[i],
        col = p4Collections[effect.type],
        token = `${op.id}:${i}`;
      const id = effect.after?.id || effect.before.id;
      let current = await col.findOne({ id });
      if (current?._p4Token !== token) {
        if (!effect.after) {
          // A replay after a successful delete (before cursor/audit persisted) is done.
          if (current) {
            const deleted = await col.deleteOne({ id, ...effect.before });
            p4Require(deleted.deletedCount, "P4_RECOVERY_REQUIRED", 503);
          }
        } else if (!effect.before) {
          p4Require(!current, "RECORD_EXISTS");
          await col.insertOne({ ...effect.after, _p4Token: token });
        } else {
          // Exact expected values + capacity predicates are checked atomically by MongoDB.
          const expected = Object.fromEntries(
            Object.entries(effect.before).filter(([k]) => k !== "id"),
          );
          const updated = await col.findOneAndUpdate(
            { $and: [{ id: effect.before.id, ...expected }, effect.extra] },
            { $set: { ...effect.after, _p4Token: token } },
            { returnDocument: "after" },
          );
          if (!updated) {
            if (i === 0) {
              await dependencies.auditCollection.updateOne(
                { id: op.id },
                { $set: { state: "FAILED" } },
              );
              p4Fail("CONCURRENT_CHANGE");
            }
            p4Fail("P4_RECOVERY_REQUIRED", 503);
          }
        }
      }
      const event = {
        id: `${token}:audit`,
        entityType: effect.type,
        entityId: id,
        action: !effect.after ? "DELETE" : effect.before ? "UPDATE" : "CREATE",
        before: effect.before,
        after: effect.after,
        actorId: op.plan.actorId,
        at: op.plan.at,
      };
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
    await dependencies.auditCollection.updateOne(
      { id: op.id },
      { $set: { state: "DONE" } },
    );
    return op.result;
  }

  async function p4Recover() {
    const pending = await dependencies.auditCollection
      .find({ entityType: "P4Operation", state: "PENDING" })
      .sort({ at: 1 })
      .toArray();
    for (const op of pending) await p4Run(op);
  }

  async function p4Execute(req, action, prepare) {
    const key = req.get?.("Idempotency-Key");
    p4Require(
      !key || (typeof key === "string" && key.length <= 200),
      "INVALID_IDEMPOTENCY_KEY",
      400,
    );
    const p4Key = key ? `${req.p2Account.id}:${action}:${key}` : undefined;
    const payload = JSON.stringify(req.body || {});
    if (p4Key) {
      const old = await dependencies.auditCollection.findOne({ p4Key });
      if (old) {
        p4Require(old.payload === payload, "IDEMPOTENCY_CONFLICT");
        p4Require(old.state !== "FAILED", "CONCURRENT_CHANGE");
        return old.state === "DONE" ? old.result : p4Run(old);
      }
    }
    const plan = p4Plan(req),
      result = await prepare(plan);
    // Background checks (no Idempotency-Key) that change nothing must not add empty journal rows.
    if (!p4Key && !plan.effects.length) return result;
    const op = {
      id: `p4-op-${new dependencies.ObjectId()}`,
      entityType: "P4Operation",
      state: "PENDING",
      at: plan.at,
      actorId: plan.actorId,
      plan,
      result,
      payload,
      ...(p4Key ? { p4Key } : {}),
    };
    await dependencies.auditCollection.insertOne(op);
    return p4Run(op);
  }

  function p4Route(handler) {
    return async (req, res) => {
      try {
        await p4Serial(async () => {
          await p4Recover();
          await handler(req, res);
        });
      } catch (error) {
        res
          .status(error.status || (error.code === 11000 ? 409 : 500))
          .send({
            code: error.code || "P4_ERROR",
            message: p4Message(error.code),
          });
      }
    };
  }

  const p4Employee = dependencies.requireRole("EMPLOYEE"),
    p4Admin = dependencies.requireRole("ADMIN"),
    p4Staff = dependencies.requireRole("EMPLOYEE", "ADMIN");

  async function p4Owned(req, id) {
    const a = await p4Get("ShiftAssignment", id);
    p4Require(a.employeeId === req.p2Employee.id, "NOT_YOUR_ASSIGNMENT", 403);
    return a;
  }

  function p4Open(period, now = new Date()) {
    p4Require(
      period.status === "OPEN" && now < p4RegistrationDeadline(period),
      "REGISTRATION_CLOSED",
    );
  }

  const p4RegistrationDeadline = (period) => p4At(period.weekStart, "00:00");

  async function p4OpenPeriods(now = new Date()) {
    const today = new Date(+now + 7 * 3600000).toISOString().slice(0, 10);
    return (
      await p4Collections.RegistrationPeriod.find({
        status: "OPEN",
        weekStart: { $gt: today },
      })
        .sort({ weekStart: 1 })
        .toArray()
    ).map((period) => ({
      ...p4Clean(period),
      closesAt: p4RegistrationDeadline(period),
    }));
  }

  async function p4Registration(plan, periodId, employeeId) {
    const planned = plan.effects
      .filter(
        (e) =>
          e.type === "PeriodRegistration" &&
          e.after?.periodId === periodId &&
          e.after?.employeeId === employeeId,
      )
      .at(-1)?.after;
    if (planned) return planned;
    const old = await p4Collections.PeriodRegistration.findOne({
      periodId,
      employeeId,
    });
    return (
      old ||
      p4New(plan, "PeriodRegistration", {
        periodId,
        employeeId,
        shiftCount: 0,
        status: "ACTIVE",
        submittedAt: null,
      })
    );
  }

  async function p4Register(
    plan,
    employeeId,
    shiftId,
    admin = false,
    movedFrom,
  ) {
    p4Require(
      (await p4Get("Employee", employeeId)).status === "ACTIVE",
      "INACTIVE_EMPLOYEE",
    );
    const shift = await p4Get("Shift", shiftId),
      period = await p4Get("RegistrationPeriod", shift.periodId),
      now = new Date();
    if (!admin) p4Open(period, now);
    p4Require(
      shift.status === "OPEN" &&
        new Date(admin ? shift.endsAt : shift.startsAt) > now,
      "SHIFT_CLOSED",
    );
    p4Require(shift.assignedCount < Math.min(6, shift.capacity), "SHIFT_FULL");
    const mine = await p4Collections.ShiftAssignment.find({
      employeeId,
      status: { $ne: "CANCELLED" },
    }).toArray();
    p4Require(!mine.some((a) => a.shiftId === shiftId), "ALREADY_REGISTERED");
    const otherShifts = await p4Collections.Shift.find({
      id: { $in: mine.filter((a) => a.id !== movedFrom).map((a) => a.shiftId) },
    }).toArray();
    p4Require(
      !otherShifts.some(
        (s) =>
          new Date(s.startsAt) < new Date(shift.endsAt) &&
          new Date(s.endsAt) > new Date(shift.startsAt),
      ),
      "SHIFT_OVERLAP",
    );
    const registration = await p4Registration(plan, period.id, employeeId);
    const samePeriodMove =
      movedFrom &&
      (
        await p4Get(
          "Shift",
          (await p4Get("ShiftAssignment", movedFrom)).shiftId,
        )
      ).periodId === period.id;
    p4Require(
      p4ShiftLimit(registration.shiftCount + (samePeriodMove ? 0 : 1)),
      "WEEKLY_SHIFT_LIMIT",
    );
    // Reserve the seat first, with an atomic conditional assignedCount update.
    // If this CAS loses the race there are no effects to compensate.
    const seat = {
      type: "Shift",
      before: p4Clean(shift),
      after: { ...p4Clean(shift), assignedCount: shift.assignedCount + 1 },
      extra: {
        assignedCount: { $lt: Math.min(6, shift.capacity) },
        status: "OPEN",
        startsAt: shift.startsAt,
      },
    };
    plan.effects.unshift(seat);
    p4Set(plan, "PeriodRegistration", registration, {
      shiftCount: registration.shiftCount + (samePeriodMove ? 0 : 1),
      status: "ACTIVE",
      submittedAt: null,
    });
    const assignment = p4New(plan, "ShiftAssignment", {
      shiftId,
      employeeId,
      registrationId: registration.id,
      status: "REGISTERED",
      isActive: true,
      source: admin ? "ADMIN" : "SELF_REGISTERED",
      ...(movedFrom ? { movedFromAssignmentId: movedFrom } : {}),
    });
    await p4AssignWaitingViewings(plan, shiftId);
    return assignment;
  }

  async function p4Cancel(
    plan,
    assignment,
    admin = false,
    samePeriodMove = false,
  ) {
    p4Require(admin, "SHIFT_CANCELLATION_NOT_ALLOWED", 403);
    const shift = await p4Get("Shift", assignment.shiftId),
      period = await p4Get("RegistrationPeriod", shift.periodId);
    p4Require(
      assignment.status === "REGISTERED" &&
        new Date(shift.startsAt) > new Date(),
      "CANNOT_CANCEL_ASSIGNMENT",
    );
    const registration = await p4Get(
      "PeriodRegistration",
      assignment.registrationId,
    );
    p4Set(plan, "Shift", shift, {
      assignedCount: Math.max(0, shift.assignedCount - 1),
    });
    if (!samePeriodMove)
      p4Set(plan, "PeriodRegistration", registration, {
        shiftCount: Math.max(0, registration.shiftCount - 1),
        status: "ACTIVE",
        submittedAt: null,
      });
    const after = p4Set(plan, "ShiftAssignment", assignment, {
      status: "CANCELLED",
      isActive: false,
    });
    await p4Redistribute(plan, [assignment]);
    return after;
  }

  async function p4TaskData(plan) {
    const [links, rows] = await Promise.all([
      p4Records("TaskShift", plan),
      p4Records("TaskAssignment", plan),
    ]);
    const byTask = new Map(),
      linkTasks = new Map();
    const entry = (id) => {
      if (!byTask.has(id)) byTask.set(id, { links: [], rows: [] });
      return byTask.get(id);
    };
    for (const link of links) {
      entry(link.taskId).links.push(link);
      linkTasks.set(link.id, link.taskId);
    }
    for (const row of rows) {
      const ids = new Set(
        [
          row.taskId,
          linkTasks.get(row.taskShiftId),
          linkTasks.get(row.shiftLinkId),
        ].filter(Boolean),
      );
      for (const id of ids) entry(id).rows.push(row);
    }
    return byTask;
  }

  async function p4TaskRows(taskId, plan, data) {
    const links = data
      ? [...(data.get(taskId)?.links || [])].sort(
          (a, b) =>
            new Date(a.linkedAt) - new Date(b.linkedAt) ||
            a.id.localeCompare(b.id),
        )
      : plan
        ? (await p4Records("TaskShift", plan))
            .filter((l) => l.taskId === taskId)
            .sort(
              (a, b) =>
                new Date(a.linkedAt) - new Date(b.linkedAt) ||
                a.id.localeCompare(b.id),
            )
        : await p4Collections.TaskShift.find({ taskId })
            .sort({ linkedAt: 1, id: 1 })
            .toArray();
    const rows = data
      ? data.get(taskId)?.rows || []
      : plan
        ? (await p4Records("TaskAssignment", plan)).filter(
            (r) =>
              r.taskId === taskId ||
              links.some((l) => l.id === (r.taskShiftId || r.shiftLinkId)),
          )
        : await p4Collections.TaskAssignment.find({
            $or: [
              { taskId },
              { taskShiftId: { $in: links.map((l) => l.id) } },
              { shiftLinkId: { $in: links.map((l) => l.id) } },
            ],
          }).toArray();
    // Historical assignments with a successor are no longer current.
    const sources = new Set(
      rows.map((r) => r.fromTaskAssignmentId).filter(Boolean),
    );
    const latest = rows.filter(
      (r) =>
        !sources.has(r.id) && !r.transferredTo && !r.waitingAdmin && !r.removed,
    );
    // Seed uses links without successor metadata; last link per employee wins.
    const order = (r) =>
      links.findIndex((l) => l.id === (r.taskShiftId || r.shiftLinkId));
    return {
      links,
      rows,
      current: latest.filter(
        (r) =>
          r.taskId ||
          !latest.some(
            (o) =>
              !o.taskId && o.employeeId === r.employeeId && order(o) > order(r),
          ),
      ),
    };
  }

  async function p4TaskView(task, plan, privateViewing = false, taskRows) {
    const { links, rows, current } =
      taskRows || (await p4TaskRows(task.id, plan));
    const viewing =
      task.kind === "VIEWING"
        ? await p4ViewingView(task.viewingId, privateViewing, plan)
        : null;
    return {
      kind: "GENERAL",
      description: "",
      ...p4Clean(task),
      shiftLinks: links.map(p4Clean),
      assignees: rows.map(p4Clean),
      currentAssignees: current.map(p4Clean),
      ...(viewing ? { viewing } : {}),
    };
  }

  async function p4TaskSummary(plan, task, { data } = {}) {
    const latest =
      plan.effects
        .filter((e) => e.type === "Task" && e.after?.id === task.id)
        .at(-1)?.after || task;
    if (["DONE", "CANCELLED", "PENDING_CONFIRM"].includes(latest.status))
      return latest;
    const { current, rows } = await p4TaskRows(task.id, plan, data);
    const pending = rows.some(
      (r) => r.waitingAdmin && !r.removed && !r.transferredTo,
    );
    let status = pending
      ? "WAITING_ADMIN"
      : current.length
        ? "IN_PROGRESS"
        : "UNASSIGNED";
    if (
      !pending &&
      current.length &&
      current.every((r) => r.personalStatus === "DONE")
    ) {
      status = "PENDING_CONFIRM";
      for (const admin of (await p4Records("Account", plan)).filter(
        (a) => a.role === "ADMIN" && a.status === "ACTIVE",
      )) {
        await p4Notify(
          plan,
          admin.id,
          "TASKS_PENDING_CONFIRM",
          "Task",
          task.id,
          "Công việc chờ xác nhận",
          `Tất cả nhân viên đã báo hoàn thành công việc "${task.title}".`,
          `p4-task-pending:${task.id}:${plan.at.toISOString()}`,
        );
      }
    }
    return p4Set(plan, "Task", latest, {
      status,
      ...(status === "PENDING_CONFIRM" ? { pendingConfirmAt: plan.at } : {}),
    });
  }

  function p4ViewingTimes() {
    return [7, 8, 9, 10, 13, 14, 15, 16].flatMap((hour) =>
      ["00", "30"].map(
        (minute) => `${String(hour).padStart(2, "0")}:${minute}`,
      ),
    );
  }

  function p4ViewingSchedule(date, startTime) {
    p4Require(dependencies.p3Date(date), "INVALID_VIEWING_DATE", 400);
    p4Require(
      typeof startTime === "string" && p4ViewingTimes().includes(startTime),
      "VIEWING_OUTSIDE_SHIFT_HOURS",
      400,
    );
    const startAt = p4At(date, startTime),
      endAt = new Date(+startAt + 30 * 60000);
    return {
      date,
      startTime,
      endTime: new Date(+endAt + 7 * 3600000).toISOString().slice(11, 16),
      startAt,
      endAt,
    };
  }

  async function p4OwnedViewing(req, id) {
    const viewing = await dependencies.viewingCollection.findOne(
      dependencies.recordFilter(id),
    );
    p4Require(viewing, "VIEWING_NOT_FOUND", 404);
    p4Require(
      String(viewing.customerId) === String(req.p2Account._id) &&
        viewing.customerProfileId === req.p2Customer.id,
      "NOT_YOUR_VIEWING",
      403,
    );
    return viewing;
  }

  async function p4ViewingConflict(plan, viewing) {
    return (await p4Records("Viewing", plan)).some(
      (v) =>
        v.id !== viewing.id &&
        ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(v.status) &&
        String(v.customerId) === String(viewing.customerId) &&
        +new Date(v.startAt) === +new Date(viewing.startAt),
    );
  }

  async function p4ViewingOut(viewing, plan) {
    const details = (await p4Records("ViewingDetail", plan))
      .filter((d) => d.viewingId === viewing.id)
      .sort((a, b) => a.order - b.order);
    const rooms = await p4Records("Room", plan),
      properties = await p4Records("Property", plan);
    const employee =
      viewing.employeeId &&
      (await p4Records("Employee", plan)).find(
        (e) => e.id === viewing.employeeId,
      );
    const roomsInfo = (viewing.rooms?.length ? viewing.rooms : details).map(
      (detail) => {
        const room = rooms.find((r) => r.id === detail.roomId);
        const snapshot =
          detail.roomSnapshot ||
          details.find((d) => d.roomId === detail.roomId)?.roomSnapshot ||
          viewing.roomSnapshot ||
          {};
        const value = room || snapshot,
          property = properties.find((p) => p.id === value.propertyId);
        const image = value.image || value.thumbnail || value.images?.[0];
        return {
          roomId: detail.roomId,
          code: value.code || "",
          name: value.name || "",
          address: value.address || property?.address || "",
          price: value.monthlyRent ?? value.price ?? 0,
          image: typeof image === "string" ? image : image?.url || "",
        };
      },
    );
    return {
      ...p4Clean(dependencies.publicRecord(viewing)),
      details: details.map((d) => p4Clean(dependencies.publicRecord(d))),
      roomsInfo,
      guide: employee
        ? {
            employeeId: employee.id,
            employeeCode: employee.employeeCode || "",
            fullName: employee.fullName || "",
            phone: employee.phone || "",
          }
        : null,
      canEdit: p4ActiveViewing(viewing, new Date()),
    };
  }

  async function p4ViewingDescription(viewing, plan) {
    const rooms = await p4ViewingView(viewing.id, false, plan);
    return `Giờ xem: ${p4ViewingTime(viewing)}. Mã phòng: ${(rooms?.rooms || []).map((r) => r.code || r.roomId).join(", ")}.${viewing.note ? ` Ghi chú: ${viewing.note}` : ""}`;
  }

  async function p4ViewingView(id, detailed = false, plan) {
    const viewing = (await p4Records("Viewing", plan)).find((v) => v.id === id);
    if (!viewing) return null;
    const details = (await p4Records("ViewingDetail", plan))
      .filter((d) => d.viewingId === id)
      .sort((a, b) => a.order - b.order);
    const rooms = await p4Records("Room", plan),
      properties = detailed ? await p4Records("Property", plan) : [];
    return {
      id: viewing.id,
      status: viewing.status,
      date: viewing.date,
      startTime: viewing.startTime,
      endTime: viewing.endTime,
      viewerName: viewing.viewerName || viewing.visitorName,
      peopleCount: viewing.peopleCount ?? viewing.visitorCount,
      ...(detailed
        ? {
            viewerPhone: viewing.viewerPhone || viewing.visitorPhone,
            note: viewing.note || "",
          }
        : {}),
      rooms: (details.length ? details : viewing.rooms || []).map((detail) => {
        const room = rooms.find((r) => r.id === detail.roomId),
          property = properties.find((p) => p.id === room?.propertyId);
        return {
          roomId: detail.roomId,
          code: room?.code || detail.code || "",
          name: room?.name || detail.name || "",
          ...(detailed
            ? {
                detailId: detail.id,
                address: property?.address || "",
                viewStatus: detail.viewStatus,
                note: detail.note || "",
              }
            : {}),
        };
      }),
    };
  }

  function p4ViewingTime(viewing) {
    const local = new Date(
      new Date(viewing.startAt).getTime() + 7 * 3600000,
    ).toISOString();
    return `${local.slice(11, 16)} ${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)}`;
  }

  function p4ActiveViewing(viewing, now) {
    return (
      viewing &&
      ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(viewing.status) &&
      new Date(viewing.startAt) > now
    );
  }

  function p4RoomViewable(room) {
    return (
      room?.publicationStatus === "PUBLISHED" &&
      (room.status === "AVAILABLE" ||
        (room.status === "HELD" && room.lock?.kind === "HOLD"))
    );
  }

  async function p4Notify(
    plan,
    accountId,
    type,
    entityType,
    entityId,
    title,
    body,
    eventId,
  ) {
    if (!accountId) return;
    const dedupeKey = `${accountId}:${eventId}`;
    if (
      plan.effects.some(
        (e) => e.type === "Notification" && e.after?.dedupeKey === dedupeKey,
      ) ||
      (await dependencies.notificationCollection.findOne({ dedupeKey }))
    )
      return;
    p4New(plan, "Notification", {
      accountId,
      type,
      entityType,
      entityId,
      title,
      body,
      read: false,
      readAt: null,
      createdAt: plan.at,
      dedupeKey,
    });
  }

  async function p4ViewingAssigned(
    plan,
    task,
    viewing,
    employeeId,
    eventId,
    incrementVersion = true,
  ) {
    const time = p4ViewingTime(viewing),
      previousId = viewing.employeeId;
    const after = p4Set(plan, "Viewing", viewing, {
      taskId: task.id,
      employeeId: employeeId || null,
      updatedAt: plan.at,
      version: (viewing.version || 0) + (incrementVersion ? 1 : 0),
    });
    if (previousId && previousId !== employeeId) {
      const previous = await dependencies.employeeCollection.findOne({
        id: previousId,
      });
      await p4Notify(
        plan,
        previous?.accountId,
        "VIEWING_REASSIGNED",
        "Viewing",
        viewing.id,
        "Lịch xem phòng đã được chuyển phân công",
        `Lịch xem ${time} đã được chuyển phân công.`,
        `${eventId}:old`,
      );
    }
    if (employeeId && previousId !== employeeId) {
      const employee = await dependencies.employeeCollection.findOne({
        id: employeeId,
      });
      await p4Notify(
        plan,
        employee?.accountId,
        "VIEWING_TASK_ASSIGNED",
        "Task",
        task.id,
        "Bạn được giao dẫn khách xem phòng",
        `${task.title} — ${time}.`,
        `${eventId}:new`,
      );
      const customer = await dependencies.customerCollection.findOne({
        id: viewing.customerProfileId,
      });
      await p4Notify(
        plan,
        customer?.accountId,
        "VIEWING_ASSIGNED",
        "Viewing",
        viewing.id,
        "Lịch xem phòng đã được phân công",
        `Lịch xem ${time} đã có nhân viên phụ trách.`,
        `${eventId}:customer`,
      );
    }
    return after;
  }

  async function p4WaitingNotice(plan, task, eventId, viewing) {
    const admins = await dependencies.accountCollection
      .find({ role: "ADMIN", status: "ACTIVE" })
      .toArray();
    const title = viewing
      ? "Lịch xem chưa có nhân viên phụ trách"
      : "Công việc cần sắp xếp";
    for (const admin of admins)
      await p4Notify(
        plan,
        admin.id,
        "TASK_WAITING_ADMIN",
        "Task",
        task.id,
        title,
        viewing
          ? `${title} — ${p4ViewingTime(viewing)}.`
          : `${task.title} — chưa có nhân viên phụ trách.`,
        eventId,
      );
  }

  async function p4ViewingShift(viewing, plan) {
    if (!viewing) return null;
    return (
      (await p4Records("Shift", plan))
        .filter(
          (s) =>
            new Date(s.startsAt) <= new Date(viewing.startAt) &&
            new Date(s.endsAt) >= new Date(viewing.endAt),
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0] || null
    );
  }

  async function p4PickLeastBusy(shiftId, excludeEmployeeIds = [], plan) {
    const employees = new Set(
      (await p4Records("Employee", plan))
        .filter((e) => e.status === "ACTIVE")
        .map((e) => e.id),
    );
    const candidates = (await p4Records("ShiftAssignment", plan)).filter(
      (a) =>
        a.shiftId === shiftId &&
        ["REGISTERED", "IN_PROGRESS"].includes(a.status) &&
        employees.has(a.employeeId) &&
        !excludeEmployeeIds.includes(a.employeeId),
    );
    if (!candidates.length) return null;
    const counts = new Map(candidates.map((a) => [a.id, 0]));
    const data = await p4TaskData(plan);
    for (const task of (await p4Records("Task", plan)).filter(
      (t) => !["DONE", "CANCELLED", "PENDING_CONFIRM"].includes(t.status),
    )) {
      const { current } = await p4TaskRows(task.id, plan, data);
      for (const row of current)
        if (row.personalStatus !== "DONE" && counts.has(row.assignmentId))
          counts.set(row.assignmentId, counts.get(row.assignmentId) + 1);
    }
    const minimum = Math.min(...counts.values()),
      tied = candidates.filter((a) => counts.get(a.id) === minimum);
    return tied[dependencies.crypto.randomInt(tied.length)];
  }

  async function p4EmployeeFreeAt(plan, employeeId, viewing, shift) {
    if (
      !employeeId ||
      !shift ||
      !(
        new Date(shift.startsAt) <= new Date(viewing.startAt) &&
        new Date(shift.endsAt) >= new Date(viewing.endAt)
      )
    )
      return null;
    const employee = (await p4Records("Employee", plan)).find(
      (e) => e.id === employeeId && e.status === "ACTIVE",
    );
    if (!employee) return null;
    const assignment = (await p4Records("ShiftAssignment", plan)).find(
      (a) =>
        a.employeeId === employeeId &&
        a.shiftId === shift.id &&
        ["REGISTERED", "IN_PROGRESS"].includes(a.status),
    );
    if (!assignment) return null;
    const busy = (await p4Records("Viewing", plan)).some(
      (v) =>
        v.id !== viewing.id &&
        v.employeeId === employeeId &&
        ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(v.status) &&
        +new Date(v.startAt) === +new Date(viewing.startAt),
    );
    return busy ? null : assignment;
  }

  async function p4PickViewingEmployee(plan, viewing, shift) {
    if (!shift) return null;
    const candidates = [];
    for (const a of (await p4Records("ShiftAssignment", plan)).filter(
      (a) =>
        a.shiftId === shift.id &&
        ["REGISTERED", "IN_PROGRESS"].includes(a.status),
    )) {
      if (
        !candidates.some((c) => c.employeeId === a.employeeId) &&
        (await p4EmployeeFreeAt(plan, a.employeeId, viewing, shift))
      )
        candidates.push(a);
    }
    if (!candidates.length) return null;
    const mine = (await p4Records("Viewing", plan))
      .filter(
        (v) =>
          v.id !== viewing.id &&
          String(v.customerId) === String(viewing.customerId) &&
          ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(v.status) &&
          candidates.some((a) => a.employeeId === v.employeeId),
      )
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    for (const previous of mine) {
      if ((await p4ViewingShift(previous, plan))?.id === shift.id)
        return candidates.find((a) => a.employeeId === previous.employeeId);
    }
    const counts = new Map(candidates.map((a) => [a.id, 0])),
      data = await p4TaskData(plan);
    for (const task of (await p4Records("Task", plan)).filter(
      (t) => !["DONE", "CANCELLED", "PENDING_CONFIRM"].includes(t.status),
    )) {
      const { current } = await p4TaskRows(task.id, plan, data);
      for (const row of current)
        if (row.personalStatus !== "DONE" && counts.has(row.assignmentId))
          counts.set(row.assignmentId, counts.get(row.assignmentId) + 1);
    }
    const minimum = Math.min(...counts.values()),
      tied = candidates.filter((a) => counts.get(a.id) === minimum);
    return tied[dependencies.crypto.randomInt(tied.length)];
  }

  // Guides are fixed only once the week's registration period is FINALIZED ("Đã chốt").
  async function p4ViewingFinalized(plan, shift) {
    if (!shift?.periodId) return false;
    return (
      (await p4Records("RegistrationPeriod", plan)).find(
        (p) => p.id === shift.periodId,
      )?.status === "FINALIZED"
    );
  }

  async function p4AssignViewingTask(plan, task, viewing) {
    if (
      task.kind !== "VIEWING" ||
      task.status !== "WAITING_ADMIN" ||
      !p4ActiveViewing(viewing, plan.at)
    )
      return task;
    const { current, rows, links } = await p4TaskRows(task.id, plan);
    if (current.length) return task;
    const shift = await p4ViewingShift(viewing, plan);
    if (!(await p4ViewingFinalized(plan, shift))) {
      // Booked far ahead: confirmed, "đang đợi người hỗ trợ" until finalize. No admin alert yet.
      if (viewing.taskId !== task.id || viewing.employeeId)
        await p4ViewingAssigned(
          plan,
          task,
          viewing,
          null,
          `p4-viewing-pending:${task.id}`,
        );
      return task;
    }
    if (shift && task.currentShiftId !== shift.id)
      task = p4Set(plan, "Task", task, { currentShiftId: shift.id });
    const link =
      shift &&
      (links.find((l) => l.shiftId === shift.id && !l.removed) ||
        p4New(plan, "TaskShift", {
          taskId: task.id,
          shiftId: shift.id,
          linkedAt: plan.at,
          reason: "ORIGIN",
          by: plan.actorId,
        }));
    const target = await p4PickViewingEmployee(plan, viewing, shift);
    if (!target) {
      if (viewing.taskId !== task.id || viewing.employeeId)
        await p4ViewingAssigned(
          plan,
          task,
          viewing,
          null,
          `p4-viewing-wait:${task.id}`,
        );
      // Transfer already reports this waiting episode. Maintenance must not send
      // another notification using the initial-booking dedupe key.
      if (!rows.some((r) => r.waitingAdmin && !r.removed && !r.transferredTo)) {
        await p4WaitingNotice(
          plan,
          task,
          `p4-viewing-wait:${task.id}`,
          viewing,
        );
      }
      return task;
    }
    const waiting = rows.filter(
      (r) => r.waitingAdmin && !r.removed && !r.transferredTo,
    );
    const next = p4New(plan, "TaskAssignment", {
      taskId: task.id,
      taskShiftId: link.id,
      shiftLinkId: link.id,
      assignmentId: target.id,
      employeeId: target.employeeId,
      personalStatus: "TODO",
      doneAt: null,
      ...(waiting.length ? { fromTaskAssignmentId: waiting[0].id } : {}),
    });
    for (const row of waiting)
      p4Set(plan, "TaskAssignment", row, {
        removed: true,
        removedAt: plan.at,
        removedBy: plan.actorId,
        removeReason: "REASSIGN",
        waitingAdmin: false,
        transferredTo: next.id,
      });
    task = p4Set(plan, "Task", task, {
      status: "TODO",
      currentShiftId: shift.id,
    });
    await p4ViewingAssigned(
      plan,
      task,
      viewing,
      target.employeeId,
      `p4-viewing-assign:${next.id}`,
    );
    return task;
  }

  async function p4EnsureViewingTask(plan, viewing, assign = true) {
    let task = (await p4Records("Task", plan)).find(
      (t) =>
        t.id === viewing.taskId ||
        (t.kind === "VIEWING" && t.viewingId === viewing.id),
    );
    if (!task) {
      task = p4New(
        plan,
        "Task",
        {
          kind: "VIEWING",
          title: `Dẫn khách xem phòng – ${viewing.viewerName || viewing.visitorName || ""}`,
          description: await p4ViewingDescription(viewing, plan),
          viewingId: viewing.id,
          scheduledAt: viewing.startAt,
          scheduledEndAt: viewing.endAt,
          status: "WAITING_ADMIN",
          currentShiftId: null,
          createdAt: plan.at,
          createdBy: plan.actorId,
          updatedAt: plan.at,
          updatedBy: plan.actorId,
        },
        `p4-viewing-${viewing.id}`,
      );
      // Persist the relation with task creation even when there is no shift yet.
      p4Set(plan, "Viewing", viewing, {
        taskId: task.id,
        employeeId: null,
        updatedAt: plan.at,
      });
    }
    return assign ? p4AssignViewingTask(plan, task, viewing) : task;
  }

  async function p4AssignWaitingViewings(plan, shiftId) {
    const viewings = await p4Records("Viewing", plan);
    const shiftIds =
      shiftId instanceof Set ? shiftId : shiftId ? new Set([shiftId]) : null;
    // Earlier bookings get a guide first (matters at finalize when a slot has more viewings than staff).
    const created = (task) =>
      +new Date(viewings.find((v) => v.id === task.viewingId)?.createdAt || 0);
    const waiting = (await p4Records("Task", plan))
      .filter((t) => t.kind === "VIEWING" && t.status === "WAITING_ADMIN")
      .sort((a, b) => created(a) - created(b));
    for (const task of waiting) {
      const viewing = viewings.find((v) => v.id === task.viewingId);
      if (shiftIds && !shiftIds.has((await p4ViewingShift(viewing, plan))?.id))
        continue;
      await p4AssignViewingTask(plan, task, viewing);
    }
  }

  async function p4RequireViewingCheckIn(viewing, employeeId, plan) {
    const task = (await p4Records("Task", plan)).find(
      (t) => t.id === viewing.taskId && t.kind === "VIEWING",
    );
    p4Require(
      task && !["DONE", "CANCELLED", "PENDING_CONFIRM"].includes(task.status),
      "CHECK_IN_REQUIRED",
    );
    const { current } = await p4TaskRows(task.id, plan);
    const part = current.find((r) => r.employeeId === employeeId);
    const assignment =
      part && (await p4Get("ShiftAssignment", part.assignmentId));
    p4Require(
      assignment?.status === "IN_PROGRESS" && part.personalStatus !== "DONE",
      "CHECK_IN_REQUIRED",
    );
    return { task, part };
  }

  async function p4Redistribute(plan, sources, { notifyGeneral = true } = {}) {
    const sourceIds = new Set(sources.map((a) => a.id)),
      data = await p4TaskData(plan);
    const viewings = await p4Records("Viewing", plan);
    // One task scan for all ended/cancelled assignments. Completed parts stay intact.
    for (const task of (await p4Records("Task", plan)).filter(
      (t) => !["DONE", "CANCELLED", "PENDING_CONFIRM"].includes(t.status),
    )) {
      const { current } = await p4TaskRows(task.id, plan, data);
      const parts = current.filter(
        (r) => sourceIds.has(r.assignmentId) && r.personalStatus !== "DONE",
      );
      if (!parts.length) continue;
      for (const row of parts)
        p4Set(plan, "TaskAssignment", row, { waitingAdmin: true });
      p4Set(plan, "Task", task, { status: "WAITING_ADMIN" });
      const viewing =
        task.kind === "VIEWING"
          ? viewings.find((v) => v.id === task.viewingId)
          : null;
      if (viewing)
        await p4ViewingAssigned(
          plan,
          task,
          viewing,
          null,
          `p4-viewing-wait:${parts[0].id}`,
        );
      if (notifyGeneral || task.kind === "VIEWING") {
        for (const assignmentId of new Set(parts.map((r) => r.assignmentId))) {
          await p4WaitingNotice(
            plan,
            task,
            `p4-wait:${task.id}:${assignmentId}`,
            viewing,
          );
        }
      }
    }
  }

  async function p4EditTask(plan, task, body) {
    p4Require(task.status !== "PENDING_CONFIRM", "TASK_PENDING_CONFIRM");
    p4Require(!["DONE", "CANCELLED"].includes(task.status), "TASK_LOCKED");
    const fields = {};
    if (body.title !== undefined) {
      p4Require(
        task.kind !== "VIEWING" || body.title === task.title,
        "VIEWING_TITLE_LOCKED",
        400,
      );
      p4Require(
        typeof body.title === "string" &&
          body.title.trim() &&
          body.title.trim().length <= 200,
        "NAME_REQUIRED",
        400,
      );
      fields.title = body.title.trim();
    }
    if (body.description !== undefined) {
      p4Require(
        typeof body.description === "string" && body.description.length <= 2000,
        "INVALID_DESCRIPTION",
        400,
      );
      fields.description = body.description;
    }
    const viewing =
      task.kind === "VIEWING"
        ? (await p4Records("Viewing", plan)).find(
            (v) => v.id === task.viewingId,
          )
        : null;
    const viewingShift =
      task.kind === "VIEWING" ? await p4ViewingShift(viewing, plan) : null;
    if (task.kind === "VIEWING" && body.shiftId !== undefined) {
      p4Require(body.shiftId === viewingShift?.id, "VIEWING_SHIFT_LOCKED", 400);
    }
    const shiftId =
      body.shiftId !== undefined
        ? body.shiftId
        : task.kind === "VIEWING"
          ? viewingShift?.id
          : task.currentShiftId;
    const reassign =
      shiftId !== task.currentShiftId ||
      ["UNASSIGNED", "WAITING_ADMIN"].includes(task.status);
    const ids = body.assigneeAssignmentIds;
    if (ids !== undefined || (body.shiftId !== undefined && reassign)) {
      p4Require(
        task.kind !== "VIEWING" || (Array.isArray(ids) && ids.length === 1),
        "ONE_ASSIGNEE_REQUIRED",
        400,
      );
      p4Require(Array.isArray(ids) && ids.length, "ASSIGNEES_REQUIRED", 400);
      p4Require(
        ids.every((id) => typeof id === "string") &&
          new Set(ids).size === ids.length,
        "INVALID_ASSIGNEE",
      );
      p4Require(typeof shiftId === "string" && shiftId, "INVALID_ASSIGNEE");
      const shift = (await p4Records("Shift", plan)).find(
        (s) => s.id === shiftId,
      );
      p4Require(
        shift && shift.status === "OPEN" && new Date(shift.endsAt) > plan.at,
        "SHIFT_CLOSED",
      );
      const assignments = await p4Records("ShiftAssignment", plan),
        employees = await p4Records("Employee", plan);
      const targets = ids.map((id) => assignments.find((a) => a.id === id));
      p4Require(
        targets.every(
          (a) =>
            a &&
            a.shiftId === shiftId &&
            ["REGISTERED", "IN_PROGRESS"].includes(a.status) &&
            employees.some(
              (e) => e.id === a.employeeId && e.status === "ACTIVE",
            ),
        ),
        "INVALID_ASSIGNEE",
      );
      const { current, rows, links } = await p4TaskRows(task.id, plan);
      const removed = reassign
        ? current
        : current.filter((r) => !ids.includes(r.assignmentId));
      if (!reassign)
        p4Require(
          removed.every((r) => r.personalStatus !== "DONE"),
          "ASSIGNEE_DONE",
        );
      const pending = rows.filter(
        (r) => r.waitingAdmin && !r.removed && !r.transferredTo,
      );
      const replaced = [...removed, ...pending];
      for (const row of replaced)
        p4Set(plan, "TaskAssignment", row, {
          removed: true,
          removedAt: plan.at,
          removedBy: plan.actorId,
          removeReason: reassign ? "REASSIGN" : "ADMIN_EDIT",
          waitingAdmin: false,
        });
      const link =
        (!reassign && links.filter((l) => l.shiftId === shiftId).at(-1)) ||
        p4New(plan, "TaskShift", {
          taskId: task.id,
          shiftId,
          linkedAt: plan.at,
          reason: "ADMIN_ASSIGN",
          ...(task.currentShiftId ? { fromShiftId: task.currentShiftId } : {}),
          by: plan.actorId,
        });
      let index = 0;
      for (const target of targets.filter(
        (a) => reassign || !current.some((r) => r.assignmentId === a.id),
      )) {
        const previous = replaced[index++];
        const next = p4New(plan, "TaskAssignment", {
          taskId: task.id,
          taskShiftId: link.id,
          shiftLinkId: link.id,
          assignmentId: target.id,
          employeeId: target.employeeId,
          personalStatus: "TODO",
          doneAt: null,
          ...(previous ? { fromTaskAssignmentId: previous.id } : {}),
        });
        if (previous)
          p4Set(plan, "TaskAssignment", previous, { transferredTo: next.id });
        if (viewing)
          await p4ViewingAssigned(
            plan,
            task,
            viewing,
            target.employeeId,
            `p4-viewing-edit:${next.id}`,
          );
        else if (task.kind !== "VIEWING")
          await p4Notify(
            plan,
            employees.find((e) => e.id === target.employeeId)?.accountId,
            "TASK_ASSIGNED",
            "Task",
            task.id,
            "Công việc mới được giao",
            `Bạn được giao công việc "${fields.title || task.title}".`,
            `p4-task-assign:${next.id}`,
          );
      }
      fields.currentShiftId = shiftId;
      const allDone =
        !reassign &&
        targets.every((a) =>
          current.some(
            (r) => r.assignmentId === a.id && r.personalStatus === "DONE",
          ),
        );
      fields.status = allDone ? "IN_PROGRESS" : "TODO";
      task = p4Set(plan, "Task", task, fields);
      if (allDone) task = await p4TaskSummary(plan, task);
    } else task = p4Set(plan, "Task", task, fields);
    return p4TaskView(task, plan);
  }

  async function p4TaskOutcomeNotice(plan, task, parts, type, body) {
    const employeeIds = new Set(parts.map((r) => r.employeeId));
    for (const employee of (await p4Records("Employee", plan)).filter((e) =>
      employeeIds.has(e.id),
    )) {
      await p4Notify(
        plan,
        employee.accountId,
        type,
        "Task",
        task.id,
        type === "TASK_CONFIRMED"
          ? "Công việc đã được xác nhận"
          : "Công việc chưa được xác nhận",
        body,
        `p4-task-outcome:${task.id}:${type}:${plan.at.toISOString()}`,
      );
    }
  }

  async function p4ConfirmTask(plan, task) {
    p4Require(task.status === "PENDING_CONFIRM", "TASK_NOT_PENDING_CONFIRM");
    const { current } = await p4TaskRows(task.id, plan);
    const after = p4Set(plan, "Task", task, {
      status: "DONE",
      confirmedAt: plan.at,
      confirmedBy: plan.actorId,
    });
    await p4TaskOutcomeNotice(
      plan,
      task,
      current,
      "TASK_CONFIRMED",
      `Công việc "${task.title}" đã được xác nhận hoàn thành.`,
    );
    return p4TaskView(after, plan);
  }

  async function p4RejectTask(plan, task, body) {
    p4Require(task.status === "PENDING_CONFIRM", "TASK_NOT_PENDING_CONFIRM");
    p4Require(
      typeof body.reason === "string" &&
        body.reason.trim().length >= 3 &&
        body.reason.length <= 500,
      "REASON_REQUIRED",
      400,
    );
    const reason = body.reason.trim(),
      reassign =
        body.shiftId !== undefined || body.assigneeAssignmentIds !== undefined;
    if (task.kind === "VIEWING") {
      p4Require(
        reassign && body.assigneeAssignmentIds?.length === 1,
        "ONE_ASSIGNEE_REQUIRED",
        400,
      );
      const shift = (await p4Records("Shift", plan)).find(
        (s) => s.id === body.shiftId,
      );
      p4Require(shift, "INVALID_ASSIGNEE", 400);
      const viewing = (await p4Records("Viewing", plan)).find(
        (v) => v.id === task.viewingId,
      );
      p4Require(viewing, "NOT_FOUND", 404);
      for (const item of viewing.rooms || []) {
        p4Require(
          p4RoomViewable(
            (await p4Records("Room", plan)).find(
              (room) => room.id === item.roomId,
            ),
          ),
          "VIEWING_ROOM_UNAVAILABLE",
        );
      }
      const schedule = p4ViewingSchedule(
        shift.date.slice(0, 10),
        body.viewingStartTime,
      );
      p4Require(
        schedule.startAt > plan.at &&
          schedule.startAt >= new Date(shift.startsAt) &&
          schedule.endAt <= new Date(shift.endsAt),
        "VIEWING_PAST",
        400,
      );
      const candidate = { ...viewing, ...schedule, status: "DA_XAC_NHAN" };
      p4Require(
        !(await p4ViewingConflict(plan, candidate)),
        "VIEWING_TIME_CONFLICT",
      );
      const target = (await p4Records("ShiftAssignment", plan)).find(
        (a) => a.id === body.assigneeAssignmentIds[0] && a.shiftId === shift.id,
      );
      p4Require(
        target &&
          (await p4EmployeeFreeAt(plan, target.employeeId, candidate, shift)),
        "EMPLOYEE_BUSY",
      );
      const details = (await p4Records("ViewingDetail", plan)).filter(
        (d) => d.viewingId === viewing.id,
      );
      for (const detail of details)
        p4Set(plan, "ViewingDetail", detail, {
          viewStatus: "CHUA_XEM",
          note: "",
          updatedAt: plan.at,
        });
      const rescheduled = p4Set(plan, "Viewing", viewing, {
        ...schedule,
        status: "DA_XAC_NHAN",
        rooms: (viewing.rooms || []).map((r) => ({
          ...r,
          viewStatus: "CHUA_XEM",
          note: "",
        })),
        updatedAt: plan.at,
        version: (viewing.version || 0) + 1,
      });
      task = p4Set(plan, "Task", task, {
        scheduledAt: schedule.startAt,
        scheduledEndAt: schedule.endAt,
        description: await p4ViewingDescription(rescheduled, plan),
      });
      if (target.employeeId === viewing.employeeId) {
        const employee = (await p4Records("Employee", plan)).find(
          (e) => e.id === target.employeeId,
        );
        await p4Notify(
          plan,
          employee?.accountId,
          "VIEWING_RESCHEDULED",
          "Viewing",
          viewing.id,
          "Lịch dẫn khách được sắp lại",
          `Lịch dẫn khách được sắp lại vào ${p4ViewingTime(candidate)}.`,
          `p4-viewing-retry-employee:${task.id}:${plan.at.toISOString()}`,
        );
      }
      const customer = (await p4Records("Customer", plan)).find(
        (c) => c.id === viewing.customerProfileId,
      );
      await p4Notify(
        plan,
        customer?.accountId,
        "VIEWING_RESCHEDULED",
        "Viewing",
        viewing.id,
        "Lịch xem phòng được sắp lại",
        `Lịch xem được sắp lại vào ${p4ViewingTime(candidate)}.`,
        `p4-viewing-retry:${task.id}:${plan.at.toISOString()}`,
      );
    }
    if (reassign) {
      p4Require(
        typeof body.shiftId === "string" &&
          body.shiftId &&
          Array.isArray(body.assigneeAssignmentIds) &&
          body.assigneeAssignmentIds.length > 0,
        "INVALID_ASSIGNEE",
      );
      const shift = (await p4Records("Shift", plan)).find(
        (s) => s.id === body.shiftId,
      );
      p4Require(shift && shift.status === "OPEN", "INVALID_ASSIGNEE");
      p4Require(new Date(shift.startsAt) > plan.at, "SHIFT_STARTED");
      p4Require(new Date(shift.endsAt) > plan.at, "INVALID_ASSIGNEE");
    }
    const { current } = await p4TaskRows(task.id, plan);
    for (const row of current)
      p4Set(plan, "TaskAssignment", row, {
        rejectedAt: plan.at,
        rejectedBy: plan.actorId,
        rejectReason: reason,
        personalStatus: "TODO",
        doneAt: null,
        waitingAdmin: true,
      });
    task = p4Set(plan, "Task", task, {
      status: "WAITING_ADMIN",
      pendingConfirmAt: null,
    });
    await p4TaskOutcomeNotice(
      plan,
      task,
      current,
      "TASK_REJECTED",
      `Công việc "${task.title}" chưa được xác nhận hoàn thành: ${reason}.`,
    );
    return reassign
      ? p4EditTask(plan, task, {
          shiftId: body.shiftId,
          assigneeAssignmentIds: body.assigneeAssignmentIds,
        })
      : p4TaskView(task, plan);
  }

  // Explicit legacy admin carry only; ended/cancelled shifts always use waitingAdmin.
  async function p4Transfer(plan, req, row, task, source, target) {
    if (p4CarryDecision(row, target).type === "SKIP") return;
    p4Require(target, "INVALID_ASSIGNEE");
    const link =
      plan.effects.find(
        (e) =>
          e.type === "TaskShift" &&
          e.after?.taskId === task.id &&
          e.after.fromAssignmentId === source.id &&
          e.after.shiftId === target.shiftId,
      )?.after ||
      p4New(plan, "TaskShift", {
        taskId: task.id,
        shiftId: target.shiftId,
        fromAssignmentId: source.id,
        fromShiftId: source.shiftId,
        transferredAt: plan.at,
        linkedAt: plan.at,
        reason: "CARRY_OVER",
        by: req.p2Account.id,
      });
    const next = p4New(plan, "TaskAssignment", {
      taskId: task.id,
      taskShiftId: link.id,
      shiftLinkId: link.id,
      assignmentId: target.id,
      employeeId: target.employeeId,
      personalStatus: "TODO",
      doneAt: null,
      fromTaskAssignmentId: row.id,
    });
    p4Set(plan, "TaskAssignment", row, {
      transferredTo: next.id,
      waitingAdmin: false,
    });
    if (task.kind === "VIEWING") {
      const viewing = (await p4Records("Viewing", plan)).find(
        (v) => v.id === task.viewingId,
      );
      if (viewing)
        await p4ViewingAssigned(
          plan,
          task,
          viewing,
          target.employeeId,
          `p4-viewing-transfer:${next.id}`,
        );
    }
  }

  async function p4Evidence(plan, attendanceId, kind, body) {
    const url = body.evidenceUrl || body.evidence?.url;
    p4Require(
      typeof url === "string" &&
        /^\/uploads\/attendance\/[a-zA-Z0-9_.-]+\.(jpe?g|png|webp)$/i.test(url),
      "ATTENDANCE_PHOTO_REQUIRED",
      400,
    );
    return p4New(plan, "AttendanceEvidence", {
      attendanceId,
      kind,
      url,
      takenAt: plan.at,
    });
  }

  async function p4CheckIn(plan, req) {
    const a = await p4Owned(req, req.params.id),
      shift = await p4Get("Shift", a.shiftId),
      now = plan.at;
    p4Require(
      a.status === "REGISTERED" && shift.status === "OPEN",
      "CHECK_IN_STATE",
    );
    p4Require(
      new Date(shift.startsAt) <= now && now < new Date(shift.endsAt),
      "OUTSIDE_CHECK_IN_WINDOW",
    );
    const location = await p4Get("WorkLocation", shift.workLocationId);
    const geo = req.body.geo || req.body.checkInGeo;
    const lat = geo?.lat ?? geo?.coordinates?.[1],
      lng = geo?.lng ?? geo?.coordinates?.[0];
    p4Require(
      typeof lat === "number" &&
        typeof lng === "number" &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180,
      "INVALID_COORDINATES",
      400,
    );
    p4Require(location.allowedRadiusM > 0, "WORK_LOCATION_NOT_CONFIGURED");
    p4Require(
      p4Distance(
        { lat, lng },
        { lat: location.geo.coordinates[1], lng: location.geo.coordinates[0] },
      ) <= location.allowedRadiusM,
      "OUTSIDE_WORK_LOCATION",
    );
    const attendanceId = `p4-att-${a.id}`;
    const evidence = await p4Evidence(plan, attendanceId, "CHECK_IN", req.body);
    let adjustmentId = null;
    const minutes = p4LateMinutes(shift.startsAt, now);
    if (minutes) {
      const policies = (
        await p4Collections.Policy.find({
          type: "PHAT_TRE",
          status: "ACTIVE",
        }).toArray()
      )
        .filter(
          (p) =>
            new Date(p.effectiveFrom) <= now &&
            (!p.effectiveTo || now < new Date(p.effectiveTo)),
        )
        .sort((x, y) => new Date(y.effectiveFrom) - new Date(x.effectiveFrom));
      p4Require(policies.length, "POLICY_NOT_CONFIGURED");
      const levels = await p4Collections.PolicyLevel.find({
        policyId: policies[0].id,
      }).toArray();
      const level = p4Penalty(minutes, levels);
      p4Require(
        level && Number.isSafeInteger(level.amount) && level.amount >= 0,
        "POLICY_NOT_CONFIGURED",
      );
      const month = dependencies.p3Month(now);
      const period = await p4Collections.PayrollPeriod.findOne({
        year: Number(month.slice(0, 4)),
        month: Number(month.slice(5)),
      });
      p4Require(
        period && !["CLOSED", "PAID"].includes(period.status),
        "PAYROLL_PERIOD_LOCKED_OR_MISSING",
      );
      let slip = await p4Collections.Payslip.findOne({
        periodId: period.id,
        employeeId: a.employeeId,
      });
      let adjustment =
        slip?.adjustmentId &&
        (await p4Get("PayrollAdjustment", slip.adjustmentId));
      if (!adjustment) {
        adjustment = p4New(plan, "PayrollAdjustment", {
          periodId: period.id,
          policyLevelId: level.id,
          totalBonus: 0,
          totalDeduction: 0,
          notes: "",
          status: "DRAFT",
        });
        if (slip) p4Set(plan, "Payslip", slip, { adjustmentId: adjustment.id });
        else {
          const employee = await p4Get("Employee", a.employeeId);
          slip = p4New(plan, "Payslip", {
            periodId: period.id,
            employeeId: a.employeeId,
            adjustmentId: adjustment.id,
            commissionId: null,
            baseSalary: employee.baseSalary || 0,
            totalRevenue: 0,
            commissionAmount: 0,
            totalDeductions: 0,
            netPay: employee.baseSalary || 0,
            status: "DRAFT",
          });
        }
      }
      p4Require(adjustment.status === "DRAFT", "ADJUSTMENT_LOCKED");
      adjustmentId = adjustment.id;
      p4Set(plan, "PayrollAdjustment", adjustment, {
        policyLevelId: level.id,
        totalDeduction: adjustment.totalDeduction + level.amount,
        notes:
          `${adjustment.notes || ""}\n${shift.date}: trễ ${minutes} phút; attendance ${attendanceId}; ${level.id}: ${level.amount} VND`.trim(),
      });
    }
    p4New(
      plan,
      "Attendance",
      {
        assignmentId: a.id,
        checkInAt: now,
        checkInGeo: { type: "Point", coordinates: [lng, lat] },
        checkOutAt: null,
        workedMinutes: null,
        adjustmentId,
        evidence: [p4Clean(evidence)],
        note: String(req.body.note || "").slice(0, 500),
      },
      attendanceId,
    );
    return p4Set(plan, "ShiftAssignment", a, { status: "IN_PROGRESS" });
  }

  async function p4CheckOut(plan, req) {
    const a = await p4Owned(req, req.params.id);
    if (a.status === "COMPLETED") return p4Clean(a);
    p4Require(a.status === "IN_PROGRESS", "CHECK_OUT_STATE");
    p4Require(
      req.body.confirmed === true,
      "CHECK_OUT_CONFIRMATION_REQUIRED",
      400,
    );
    const record = await p4Collections.Attendance.findOne({
      assignmentId: a.id,
    });
    p4Require(record && !record.checkOutAt, "ATTENDANCE_STATE");
    const evidence = await p4Evidence(plan, record.id, "CHECK_OUT", req.body);
    p4Set(plan, "Attendance", record, {
      checkOutAt: plan.at,
      workedMinutes: Math.max(
        0,
        Math.floor((plan.at - new Date(record.checkInAt)) / 60000),
      ),
      evidence: [...(record.evidence || []), p4Clean(evidence)],
    });
    const after = p4Set(plan, "ShiftAssignment", a, { status: "COMPLETED" });
    await p4Redistribute(plan, [a], { notifyGeneral: false });
    const data = await p4TaskData(plan);
    let pendingConfirmCount = 0,
      waitingAdminCount = 0;
    for (const task of (await p4Records("Task", plan)).filter(
      (t) => t.kind !== "VIEWING" && !["DONE", "CANCELLED"].includes(t.status),
    )) {
      const { current, rows } = await p4TaskRows(task.id, plan, data);
      if (
        !current.some((r) => r.assignmentId === a.id) &&
        !rows.some(
          (r) =>
            r.assignmentId === a.id &&
            r.waitingAdmin &&
            !r.removed &&
            !r.transferredTo,
        )
      )
        continue;
      const summary = await p4TaskSummary(plan, task, { data });
      if (summary.status === "PENDING_CONFIRM") pendingConfirmCount++;
      if (summary.status === "WAITING_ADMIN") waitingAdminCount++;
    }
    if (pendingConfirmCount + waitingAdminCount > 0) {
      const shift = await p4Get("Shift", a.shiftId),
        date = `${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)}`;
      const body = `${req.p2Employee.fullName} đã hoàn thành ${shift.label} ${date}: ${pendingConfirmCount} việc chờ xác nhận, ${waitingAdminCount} việc chờ giao lại.`;
      for (const admin of await dependencies.accountCollection
        .find({ role: "ADMIN", status: "ACTIVE" })
        .toArray()) {
        await p4Notify(
          plan,
          admin.id,
          "TASKS_PENDING_CONFIRM",
          "ShiftAssignment",
          a.id,
          "Kết quả hoàn thành ca làm",
          body,
          `p4-checkout:${a.id}`,
        );
      }
    }
    return after;
  }

  async function p4Maintenance() {
    await p4Recover();
    const req = { body: {}, p2Account: { id: null } },
      now = new Date();
    const periods = await p4Collections.RegistrationPeriod.find({
      status: { $in: ["DRAFT", "OPEN"] },
    }).toArray();
    for (const p of periods) {
      if (now >= p4RegistrationDeadline(p))
        await p4Execute(req, "autoClose", async (plan) =>
          p4Close(plan, p, "CLOSED"),
        );
    }
    const ended = await p4Collections.Shift.find({
      endsAt: { $lte: now },
    }).toArray();
    const absent = await p4Collections.ShiftAssignment.find({
      shiftId: { $in: ended.map((s) => s.id) },
      status: "REGISTERED",
    }).toArray();
    if (absent.length) {
      const attended = new Set(
        (
          await p4Collections.Attendance.find({
            assignmentId: { $in: absent.map((a) => a.id) },
          }).toArray()
        ).map((a) => a.assignmentId),
      );
      const missing = absent.filter((a) => !attended.has(a.id));
      if (missing.length)
        await p4Execute(req, "absent", async (plan) => {
          for (const a of missing)
            p4Set(plan, "ShiftAssignment", a, { status: "ABSENT" });
          await p4Redistribute(plan, missing);
          return { assignmentIds: missing.map((a) => a.id) };
        });
    }
    const viewings = await p4Collections.Viewing.find({
      status: { $in: ["CHO_XAC_NHAN", "DA_XAC_NHAN"] },
      startAt: { $gt: now },
    }).toArray();
    const taskIds = [
      ...new Set(viewings.map((viewing) => viewing.taskId).filter(Boolean)),
    ];
    const tasks = taskIds.length
      ? await p4Collections.Task.find({ id: { $in: taskIds } }).toArray()
      : [];
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    for (const viewing of viewings) {
      const task = viewing.taskId && tasksById.get(viewing.taskId);
      if (
        !task ||
        (task.kind === "VIEWING" && task.status === "WAITING_ADMIN")
      ) {
        await p4Execute(req, `repairViewing:${viewing.id}`, (plan) =>
          p4EnsureViewingTask(plan, viewing),
        );
        if (viewing.taskId)
          tasksById.set(
            viewing.taskId,
            await p4Collections.Task.findOne({ id: viewing.taskId }),
          );
      }
    }
  }

  async function p4Close(plan, period, status, fillTag) {
    const employees = await dependencies.employeeCollection
      .find({ status: "ACTIVE" })
      .toArray();
    const shifts = await p4Records("Shift", plan),
      periodIds = new Set(
        shifts.filter((s) => s.periodId === period.id).map((s) => s.id),
      );
    const assignments = (await p4Records("ShiftAssignment", plan)).filter(
      (a) => a.status !== "CANCELLED",
    );
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));
    const minimum = period.minShifts ?? 5,
      maximum = Math.min(8, period.maxShifts ?? 8);
    const changedShifts = new Set();
    // Random top-up to the minimum runs when a period closes AND again when an admin finalizes it
    // (shifts may have been removed after closing). Only future shifts with free seats are used.
    // fillTag: explicit "Xếp bù ca thiếu" action on a CLOSED/FINALIZED period (status unchanged).
    const randomize =
      !!fillTag ||
      (status === "CLOSED" && ["DRAFT", "OPEN"].includes(period.status)) ||
      (status === "FINALIZED" && period.status === "CLOSED");
    const noticeTag = fillTag || status;
    const pending = [...employees];
    while (pending.length) {
      const employee = pending.splice(
        randomize ? dependencies.crypto.randomInt(pending.length) : 0,
        1,
      )[0];
      const mine = assignments.filter((a) => a.employeeId === employee.id);
      let count = mine.filter((a) => periodIds.has(a.shiftId)).length,
        added = 0;
      const needsMore = count < minimum;
      if (randomize)
        while (count < Math.min(minimum, maximum)) {
          const candidates = [...shiftMap.values()].filter(
            (s) =>
              periodIds.has(s.id) &&
              s.status === "OPEN" &&
              new Date(s.startsAt) > plan.at &&
              s.assignedCount < Math.min(6, s.capacity) &&
              !mine.some(
                (a) =>
                  a.shiftId === s.id ||
                  (shiftMap.has(a.shiftId) &&
                    new Date(shiftMap.get(a.shiftId).startsAt) <
                      new Date(s.endsAt) &&
                    new Date(shiftMap.get(a.shiftId).endsAt) >
                      new Date(s.startsAt)),
              ),
          );
          if (!candidates.length) break;
          const leastAssigned = Math.min(
            ...candidates.map((s) => s.assignedCount),
          );
          const tied = candidates.filter(
            (s) => s.assignedCount === leastAssigned,
          );
          const shift = tied[dependencies.crypto.randomInt(tied.length)];
          const reserved = p4Set(
            plan,
            "Shift",
            shift,
            { assignedCount: shift.assignedCount + 1 },
            {
              assignedCount: { $lt: Math.min(6, shift.capacity) },
              status: "OPEN",
            },
          );
          shiftMap.set(shift.id, reserved);
          changedShifts.add(shift.id);
          const registration = await p4Registration(
            plan,
            period.id,
            employee.id,
          );
          const assignment = p4New(plan, "ShiftAssignment", {
            shiftId: shift.id,
            employeeId: employee.id,
            registrationId: registration.id,
            status: "REGISTERED",
            isActive: true,
            source: "AUTO_RANDOM",
          });
          assignments.push(assignment);
          mine.push(assignment);
          count++;
          added++;
        }
      const registration = await p4Registration(plan, period.id, employee.id);
      p4Set(plan, "PeriodRegistration", registration, {
        shiftCount: count,
        status:
          count >= minimum && count <= maximum ? "CONFIRMED" : "BELOW_MINIMUM",
      });
      if (randomize && needsMore && added)
        await p4Notify(
          plan,
          employee.accountId,
          "SHIFT_AUTO_ASSIGNED",
          "RegistrationPeriod",
          period.id,
          "Hệ thống đã xếp thêm ca trực",
          `Hệ thống đã xếp thêm ${added} ca cho tuần ${period.weekStart}.`,
          `p4-random:${period.id}:${noticeTag}:${employee.id}`,
        );
      if (randomize && count < minimum) {
        for (const admin of await dependencies.accountCollection
          .find({ role: "ADMIN", status: "ACTIVE" })
          .toArray()) {
          await p4Notify(
            plan,
            admin.id,
            "SHIFT_BELOW_MINIMUM",
            "RegistrationPeriod",
            period.id,
            "Chưa xếp đủ ca trực",
            `${employee.fullName || employee.employeeCode}: đã có ${count}/${minimum} ca cho tuần ${period.weekStart}, không còn ca phù hợp.`,
            `p4-random-short:${period.id}:${noticeTag}:${employee.id}`,
          );
        }
      }
    }
    // All random seats are visible in the same plan before assigning pending viewings.
    const after = p4Set(plan, "RegistrationPeriod", period, { status });
    // FINALIZED → every pending viewing of this week now gets its guide (customer is notified).
    if (status === "FINALIZED") await p4AssignWaitingViewings(plan, periodIds);
    else if (changedShifts.size)
      await p4AssignWaitingViewings(plan, changedShifts);
    return after;
  }

  async function p4PeriodView(period) {
    const shifts = await p4Collections.Shift.find({
        periodId: period.id,
      }).toArray(),
      ids = shifts.map((s) => s.id);
    const assignmentCount = await p4Collections.ShiftAssignment.countDocuments({
      shiftId: { $in: ids },
      status: { $ne: "CANCELLED" },
    });
    const links = await p4Collections.TaskShift.find({
      shiftId: { $in: ids },
    }).toArray();
    const tasks = await p4Collections.Task.find({
      currentShiftId: { $in: ids },
    }).toArray();
    const taskCount = new Set([
      ...links.map((l) => l.taskId),
      ...tasks.map((t) => t.id),
    ]).size;
    return {
      ...p4Clean(period),
      ...(["DRAFT", "OPEN"].includes(period.status)
        ? { closesAt: p4RegistrationDeadline(period) }
        : {}),
      shiftCount: shifts.length,
      assignmentCount,
      taskCount,
      canDelete: !assignmentCount && !taskCount,
    };
  }

  async function initializeP4() {
    for (const col of Object.values(p4Collections))
      await col.createIndex({ id: 1 }, { unique: true });
    await p4Collections.RegistrationPeriod.createIndex(
      { weekStart: 1 },
      { unique: true },
    );
    await p4Collections.PeriodRegistration.createIndex(
      { periodId: 1, employeeId: 1 },
      { unique: true },
    );
    await p4Collections.Shift.createIndex(
      { periodId: 1, date: 1, startTime: 1 },
      { unique: true },
    );
    await p4Collections.ShiftAssignment.createIndex(
      { shiftId: 1, employeeId: 1 },
      { unique: true, partialFilterExpression: { isActive: true } },
    );
    await p4Collections.Attendance.createIndex(
      { assignmentId: 1 },
      { unique: true },
    );
    await p4Collections.AttendanceEvidence.createIndex(
      { attendanceId: 1, kind: 1 },
      { unique: true },
    );
    await p4Collections.TaskAssignment.createIndex(
      { fromTaskAssignmentId: 1 },
      { unique: true, sparse: true },
    );
    await dependencies.auditCollection.createIndex(
      { p4Key: 1 },
      { unique: true, sparse: true },
    );
    await p4Serial(p4Maintenance);
    const timer = setInterval(
      () =>
        p4Serial(p4Maintenance).catch((error) =>
          console.error("P4 maintenance:", error.message),
        ),
      60000,
    );
    timer.unref();
  }

  Object.defineProperties(dependencies, {
    p4Collections: { enumerable: true, get: () => p4Collections },
    VIEWING_WINDOWS: { enumerable: true, get: () => VIEWING_WINDOWS },
    p4ViewingWindow: { enumerable: true, get: () => p4ViewingWindow },
    p4Message: { enumerable: true, get: () => p4Message },
    p4Fail: { enumerable: true, get: () => p4Fail },
    p4Require: { enumerable: true, get: () => p4Require },
    p4Clean: { enumerable: true, get: () => p4Clean },
    p4ShiftLimit: { enumerable: true, get: () => p4ShiftLimit },
    p4LateMinutes: { enumerable: true, get: () => p4LateMinutes },
    p4Penalty: { enumerable: true, get: () => p4Penalty },
    p4Distance: { enumerable: true, get: () => p4Distance },
    p4NextAssignment: { enumerable: true, get: () => p4NextAssignment },
    p4CarryDecision: { enumerable: true, get: () => p4CarryDecision },
    p4Day: { enumerable: true, get: () => p4Day },
    p4At: { enumerable: true, get: () => p4At },
    p4Get: { enumerable: true, get: () => p4Get },
    p4Queue: { enumerable: true, get: () => p4Queue },
    p4Serial: { enumerable: true, get: () => p4Serial },
    p4Plan: { enumerable: true, get: () => p4Plan },
    p4Effect: { enumerable: true, get: () => p4Effect },
    p4New: { enumerable: true, get: () => p4New },
    p4Set: { enumerable: true, get: () => p4Set },
    p4Remove: { enumerable: true, get: () => p4Remove },
    p4Records: { enumerable: true, get: () => p4Records },
    p4RunFromP2: { enumerable: true, get: () => p4RunFromP2 },
    p4Run: { enumerable: true, get: () => p4Run },
    p4Recover: { enumerable: true, get: () => p4Recover },
    p4Execute: { enumerable: true, get: () => p4Execute },
    p4Route: { enumerable: true, get: () => p4Route },
    p4Employee: { enumerable: true, get: () => p4Employee },
    p4Admin: { enumerable: true, get: () => p4Admin },
    p4Staff: { enumerable: true, get: () => p4Staff },
    p4Owned: { enumerable: true, get: () => p4Owned },
    p4Open: { enumerable: true, get: () => p4Open },
    p4OpenPeriods: { enumerable: true, get: () => p4OpenPeriods },
    p4RegistrationDeadline: {
      enumerable: true,
      get: () => p4RegistrationDeadline,
    },
    p4Registration: { enumerable: true, get: () => p4Registration },
    p4Register: { enumerable: true, get: () => p4Register },
    p4Cancel: { enumerable: true, get: () => p4Cancel },
    p4TaskData: { enumerable: true, get: () => p4TaskData },
    p4TaskRows: { enumerable: true, get: () => p4TaskRows },
    p4TaskView: { enumerable: true, get: () => p4TaskView },
    p4TaskSummary: { enumerable: true, get: () => p4TaskSummary },
    p4ViewingTimes: { enumerable: true, get: () => p4ViewingTimes },
    p4ViewingSchedule: { enumerable: true, get: () => p4ViewingSchedule },
    p4OwnedViewing: { enumerable: true, get: () => p4OwnedViewing },
    p4ViewingConflict: { enumerable: true, get: () => p4ViewingConflict },
    p4ViewingOut: { enumerable: true, get: () => p4ViewingOut },
    p4ViewingDescription: { enumerable: true, get: () => p4ViewingDescription },
    p4ViewingView: { enumerable: true, get: () => p4ViewingView },
    p4ViewingTime: { enumerable: true, get: () => p4ViewingTime },
    p4ActiveViewing: { enumerable: true, get: () => p4ActiveViewing },
    p4RoomViewable: { enumerable: true, get: () => p4RoomViewable },
    p4Notify: { enumerable: true, get: () => p4Notify },
    p4ViewingAssigned: { enumerable: true, get: () => p4ViewingAssigned },
    p4WaitingNotice: { enumerable: true, get: () => p4WaitingNotice },
    p4ViewingShift: { enumerable: true, get: () => p4ViewingShift },
    p4PickLeastBusy: { enumerable: true, get: () => p4PickLeastBusy },
    p4EmployeeFreeAt: { enumerable: true, get: () => p4EmployeeFreeAt },
    p4PickViewingEmployee: {
      enumerable: true,
      get: () => p4PickViewingEmployee,
    },
    p4ViewingFinalized: { enumerable: true, get: () => p4ViewingFinalized },
    p4AssignViewingTask: { enumerable: true, get: () => p4AssignViewingTask },
    p4EnsureViewingTask: { enumerable: true, get: () => p4EnsureViewingTask },
    p4AssignWaitingViewings: {
      enumerable: true,
      get: () => p4AssignWaitingViewings,
    },
    p4RequireViewingCheckIn: {
      enumerable: true,
      get: () => p4RequireViewingCheckIn,
    },
    p4Redistribute: { enumerable: true, get: () => p4Redistribute },
    p4EditTask: { enumerable: true, get: () => p4EditTask },
    p4TaskOutcomeNotice: { enumerable: true, get: () => p4TaskOutcomeNotice },
    p4ConfirmTask: { enumerable: true, get: () => p4ConfirmTask },
    p4RejectTask: { enumerable: true, get: () => p4RejectTask },
    p4Transfer: { enumerable: true, get: () => p4Transfer },
    p4Evidence: { enumerable: true, get: () => p4Evidence },
    p4CheckIn: { enumerable: true, get: () => p4CheckIn },
    p4CheckOut: { enumerable: true, get: () => p4CheckOut },
    p4Maintenance: { enumerable: true, get: () => p4Maintenance },
    p4Close: { enumerable: true, get: () => p4Close },
    p4PeriodView: { enumerable: true, get: () => p4PeriodView },
    initializeP4: { enumerable: true, get: () => initializeP4 },
  });
}
module.exports = { createShiftService };
