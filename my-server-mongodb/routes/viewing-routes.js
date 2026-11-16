function registerViewingCartRoutes(dependencies) {
  dependencies.app.post(
    "/viewing-cart/add",
    dependencies.cors(),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        const { roomId } = req.body || {};
        if (typeof roomId !== "string" || !roomId.trim()) {
          return res.status(400).send({ message: "roomId is required" });
        }
        const room = await dependencies.roomCollection.findOne({ id: roomId });
        if (!room) return res.status(404).send({ message: "Room not found" });
        if (!dependencies.p4RoomViewable(room)) {
          return res
            .status(409)
            .send({
              code: "VIEWING_ROOM_UNAVAILABLE",
              message: dependencies.p4Message("VIEWING_ROOM_UNAVAILABLE"),
            });
        }
        const cart = req.session.viewingCart || [];
        if (!cart.includes(roomId)) cart.push(roomId);
        req.session.viewingCart = cart;
        await new Promise((resolve, reject) =>
          req.session.save((error) => (error ? reject(error) : resolve())),
        );
        res.send(cart);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.get(
    "/viewing-cart",
    dependencies.cors(),
    async (req, res) => {
      res.send(req.session.viewingCart || []);
    },
  );

  dependencies.app.delete(
    "/viewing-cart/:roomId",
    dependencies.cors(),
    async (req, res) => {
      try {
        req.session.viewingCart = (req.session.viewingCart || []).filter(
          (id) => id !== req.params.roomId,
        );
        await new Promise((resolve, reject) =>
          req.session.save((error) => (error ? reject(error) : resolve())),
        );
        res.send(req.session.viewingCart);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );
}

function registerViewingRoutes(dependencies) {
  dependencies.app.get(
    "/viewings/availability",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p4Route(async (req, res) => {
      const { date, excludeViewingId } = req.query;
      dependencies.p4Require(
        dependencies.p3Date(date),
        "INVALID_VIEWING_DATE",
        400,
      );
      let excluded;
      if (excludeViewingId !== undefined) {
        dependencies.p4Require(
          typeof excludeViewingId === "string" && excludeViewingId,
          "VIEWING_NOT_FOUND",
          404,
        );
        excluded = await dependencies.p4OwnedViewing(req, excludeViewingId);
      }
      // Load once, evaluate 16 slots in memory (same rules as p4ViewingConflict / p4EmployeeFreeAt).
      const now = new Date(),
        slots = [];
      const [shifts, assignments, employees, viewings, periods] =
        await Promise.all(
          [
            "Shift",
            "ShiftAssignment",
            "Employee",
            "Viewing",
            "RegistrationPeriod",
          ].map((type) => dependencies.p4Records(type)),
        );
      const finalizedPeriods = new Set(
        periods.filter((p) => p.status === "FINALIZED").map((p) => p.id),
      );
      const activeEmployees = new Set(
        employees.filter((e) => e.status === "ACTIVE").map((e) => e.id),
      );
      const live = viewings.filter(
        (v) =>
          v.id !== excluded?.id &&
          ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(v.status),
      );
      for (const time of dependencies.p4ViewingTimes()) {
        const viewing = dependencies.p4ViewingSchedule(date, time),
          at = +viewing.startAt;
        const sameTime = live.filter((v) => +new Date(v.startAt) === at);
        const shift = shifts
          .filter(
            (s) =>
              new Date(s.startsAt) <= viewing.startAt &&
              new Date(s.endsAt) >= viewing.endAt,
          )
          .sort((a, b) => a.id.localeCompare(b.id))[0];
        // Week not finalized yet → bookable, guide shown after the period is finalized.
        const pendingGuide = !shift || !finalizedPeriods.has(shift.periodId);
        let reason = null;
        if (viewing.startAt <= now) reason = "PAST";
        else if (
          sameTime.some(
            (v) => String(v.customerId) === String(req.p2Account._id),
          )
        )
          reason = "MINE";
        else if (
          !pendingGuide &&
          !assignments.some(
            (a) =>
              a.shiftId === shift.id &&
              ["REGISTERED", "IN_PROGRESS"].includes(a.status) &&
              activeEmployees.has(a.employeeId) &&
              !sameTime.some((v) => v.employeeId === a.employeeId),
          )
        )
          reason = "NO_STAFF";
        slots.push({
          time,
          available: !reason,
          reason,
          pendingGuide: !reason && pendingGuide,
        });
      }
      res.send({ date, slots });
    }),
  );

  dependencies.app.get(
    "/viewings/mine",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        const result = await dependencies.viewingCollection
          .find({
            customerId: req.p2Account._id,
            customerProfileId: req.p2Customer.id,
          })
          .sort({ startAt: -1 })
          .toArray();
        res.send(await dependencies.viewingRecords(result));
      } catch (error) {
        res
          .status(500)
          .send({
            code: "P4_ERROR",
            message: dependencies.p4Message("P4_ERROR"),
          });
      }
    },
  );

  dependencies.app.put(
    "/viewings/:id",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p2Write(async (req, res) => {
      const viewing = await dependencies.p4OwnedViewing(req, req.params.id);
      res.send(
        await dependencies.p4RunFromP2(
          req,
          `editViewing:${viewing.id}`,
          async (plan) => {
            dependencies.p4Require(
              dependencies.p4ActiveViewing(viewing, plan.at),
              "VIEWING_LOCKED",
            );
            const body = req.body || {},
              note = body.note === undefined ? viewing.note || "" : body.note;
            dependencies.p4Require(
              typeof note === "string" && note.length <= 1000,
              "INVALID_VIEWING_DETAILS",
              400,
            );
            const schedule = dependencies.p4ViewingSchedule(
              body.date === undefined ? viewing.date : body.date,
              body.startTime === undefined ? viewing.startTime : body.startTime,
            );
            dependencies.p4Require(
              schedule.startAt > plan.at,
              "VIEWING_PAST",
              400,
            );
            let after = {
              ...viewing,
              ...schedule,
              note,
              status: "DA_XAC_NHAN",
            };
            dependencies.p4Require(
              !(await dependencies.p4ViewingConflict(plan, after)),
              "VIEWING_TIME_CONFLICT",
            );
            const timeChanged =
              +schedule.startAt !== +new Date(viewing.startAt);
            if (timeChanged)
              for (const item of viewing.rooms || []) {
                dependencies.p4Require(
                  dependencies.p4RoomViewable(
                    await dependencies.roomCollection.findOne({
                      id: item.roomId,
                    }),
                  ),
                  "VIEWING_ROOM_UNAVAILABLE",
                );
              }
            const shift = await dependencies.p4ViewingShift(after, plan);
            // Week not finalized yet → still confirmed, guide pending until the period is finalized.
            const finalized = await dependencies.p4ViewingFinalized(
              plan,
              shift,
            );
            let target = null;
            if (timeChanged && finalized) {
              target =
                (await dependencies.p4EmployeeFreeAt(
                  plan,
                  viewing.employeeId,
                  after,
                  shift,
                )) ||
                (await dependencies.p4PickViewingEmployee(plan, after, shift));
              dependencies.p4Require(target, "SLOT_NO_STAFF");
            }
            let task = await dependencies.p4EnsureViewingTask(
              plan,
              viewing,
              false,
            );
            after = dependencies.p4Set(plan, "Viewing", viewing, {
              ...schedule,
              note,
              status: "DA_XAC_NHAN",
              taskId: task.id,
              employeeId: viewing.employeeId || null,
              updatedAt: plan.at,
              version: (viewing.version || 0) + 1,
            });
            task = dependencies.p4Set(plan, "Task", task, {
              scheduledAt: after.startAt,
              scheduledEndAt: after.endAt,
              description: await dependencies.p4ViewingDescription(after, plan),
              currentShiftId: shift?.id || null,
            });
            if (timeChanged) {
              const { links, rows, current } = await dependencies.p4TaskRows(
                task.id,
                plan,
              );
              const detach = () => {
                for (const row of rows.filter(
                  (r) => !r.removed && !r.transferredTo,
                ))
                  dependencies.p4Set(plan, "TaskAssignment", row, {
                    removed: true,
                    removedAt: plan.at,
                    removedBy: plan.actorId,
                    removeReason: "RESCHEDULE",
                    waitingAdmin: false,
                  });
                for (const link of links.filter((l) => !l.removed))
                  dependencies.p4Set(plan, "TaskShift", link, {
                    removed: true,
                    removedAt: plan.at,
                    removedBy: plan.actorId,
                    removeReason: "RESCHEDULE",
                  });
              };
              if (!target) {
                detach();
                if (task.status !== "WAITING_ADMIN")
                  task = dependencies.p4Set(plan, "Task", task, {
                    status: "WAITING_ADMIN",
                  });
              } else if (
                viewing.employeeId !== target.employeeId ||
                !current.some((r) => r.assignmentId === target.id) ||
                !links.some(
                  (l) =>
                    !l.removed &&
                    l.shiftId === shift.id &&
                    current.some(
                      (r) => (r.taskShiftId || r.shiftLinkId) === l.id,
                    ),
                )
              ) {
                detach();
                const link = dependencies.p4New(plan, "TaskShift", {
                  taskId: task.id,
                  shiftId: shift.id,
                  linkedAt: plan.at,
                  reason: "RESCHEDULE",
                  fromShiftId: viewing.taskId
                    ? links.at(-1)?.shiftId || null
                    : null,
                  by: plan.actorId,
                });
                dependencies.p4New(plan, "TaskAssignment", {
                  taskId: task.id,
                  taskShiftId: link.id,
                  shiftLinkId: link.id,
                  assignmentId: target.id,
                  employeeId: target.employeeId,
                  personalStatus: "TODO",
                  doneAt: null,
                });
                task = dependencies.p4Set(plan, "Task", task, {
                  status: "TODO",
                });
              }
              const eventId = `viewing-reschedule:${viewing.id}:${(viewing.version || 0) + 1}`;
              after = await dependencies.p4ViewingAssigned(
                plan,
                task,
                after,
                target?.employeeId || null,
                eventId,
                false,
              );
              if (target && viewing.employeeId === target.employeeId) {
                const employee = (
                  await dependencies.p4Records("Employee", plan)
                ).find((e) => e.id === target.employeeId);
                await dependencies.p4Notify(
                  plan,
                  employee?.accountId,
                  "VIEWING_RESCHEDULED",
                  "Viewing",
                  viewing.id,
                  "Lịch xem đã đổi giờ",
                  `Lịch xem đã đổi giờ từ ${dependencies.p4ViewingTime(viewing)} sang ${dependencies.p4ViewingTime(after)}.`,
                  eventId,
                );
              }
            }
            return dependencies.p4ViewingOut(after, plan);
          },
        ),
      );
    }),
  );

  dependencies.app.delete(
    "/viewings/:id",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p2Write(async (req, res) => {
      const viewing = await dependencies.p4OwnedViewing(req, req.params.id);
      res.send(
        await dependencies.p4RunFromP2(
          req,
          `deleteViewing:${viewing.id}`,
          async (plan) => {
            dependencies.p4Require(
              dependencies.p4ActiveViewing(viewing, plan.at),
              "VIEWING_LOCKED",
            );
            const eventId = `viewing-delete:${viewing.id}`,
              title = `Khách hàng đã xóa lịch xem ${dependencies.p4ViewingTime(viewing)}`;
            const employee =
              viewing.employeeId &&
              (await dependencies.p4Records("Employee", plan)).find(
                (e) => e.id === viewing.employeeId,
              );
            for (const accountId of new Set(
              [
                employee?.accountId,
                ...(await dependencies.p4Records("Account", plan))
                  .filter((a) => a.role === "ADMIN" && a.status === "ACTIVE")
                  .map((a) => a.id),
              ].filter(Boolean),
            )) {
              await dependencies.p4Notify(
                plan,
                accountId,
                "VIEWING_DELETED",
                "Viewing",
                viewing.id,
                title,
                title,
                eventId,
              );
            }
            for (const task of (
              await dependencies.p4Records("Task", plan)
            ).filter(
              (t) =>
                t.kind === "VIEWING" &&
                (t.viewingId === viewing.id || t.id === viewing.taskId),
            )) {
              const { rows, links } = await dependencies.p4TaskRows(
                task.id,
                plan,
              );
              for (const row of rows)
                dependencies.p4Remove(plan, "TaskAssignment", row);
              for (const link of links)
                dependencies.p4Remove(plan, "TaskShift", link);
              dependencies.p4Remove(plan, "Task", task);
            }
            for (const detail of (
              await dependencies.p4Records("ViewingDetail", plan)
            ).filter((d) => d.viewingId === viewing.id))
              dependencies.p4Remove(plan, "ViewingDetail", detail);
            dependencies.p4Remove(plan, "Viewing", viewing);
            return { deleted: true, id: viewing.id };
          },
        ),
      );
    }),
  );

  dependencies.app.put(
    "/viewings/:id/cancel",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p2Write(async (req, res) => {
      const viewing = await dependencies.viewingCollection.findOne(
        dependencies.recordFilter(req.params.id),
      );
      if (!viewing)
        return res
          .status(404)
          .send({ message: "Không tìm thấy lịch xem phòng." });
      if (
        !viewing.customerId.equals(req.p2Account._id) ||
        viewing.customerProfileId !== req.p2Customer.id
      ) {
        return res
          .status(403)
          .send({ message: "Lịch xem thuộc khách hàng khác." });
      }
      if (!["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(viewing.status)) {
        return res
          .status(409)
          .send({ message: "Không thể hủy lịch xem ở trạng thái hiện tại." });
      }
      const after = await dependencies.p4RunFromP2(
        req,
        `cancelViewing:${viewing.id}`,
        async (plan) => {
          const task = await dependencies.p4EnsureViewingTask(
            plan,
            viewing,
            false,
          );
          dependencies.p4Set(plan, "Task", task, {
            status: "CANCELLED",
            cancelledAt: plan.at,
            cancelledBy: plan.actorId,
            cancelReason: "VIEWING_CANCELLED",
          });
          const eventId = `${viewing.id}:${(viewing.version || 0) + 1}:cancel`,
            time = dependencies.p4ViewingTime(viewing);
          const customer = await dependencies.customerCollection.findOne({
            id: viewing.customerProfileId,
          });
          const employee =
            viewing.employeeId &&
            (await dependencies.employeeCollection.findOne({
              id: viewing.employeeId,
            }));
          for (const accountId of [customer?.accountId, employee?.accountId])
            await dependencies.p4Notify(
              plan,
              accountId,
              "VIEWING_CANCELLED",
              "Viewing",
              viewing.id,
              "Lịch xem phòng đã bị hủy",
              `Lịch xem ${time} đã bị hủy.`,
              eventId,
            );
          for (const admin of await dependencies.accountCollection
            .find({ role: "ADMIN", status: "ACTIVE" })
            .toArray())
            await dependencies.p4Notify(
              plan,
              admin.id,
              "VIEWING_CANCELLED",
              "Viewing",
              viewing.id,
              "Khách hàng đã hủy lịch xem phòng",
              `Khách hàng đã hủy lịch xem ${time}.`,
              eventId,
            );
          return dependencies.p4Set(plan, "Viewing", viewing, {
            status: "DA_HUY",
            updatedAt: plan.at,
            version: (viewing.version || 0) + 1,
          });
        },
      );
      res.send(dependencies.publicRecord(after));
    }),
  );

  dependencies.app.get(
    "/viewings",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        res.send(
          await dependencies.viewingRecords(
            await dependencies.viewingCollection
              .find({})
              .sort({ startAt: -1 })
              .toArray(),
          ),
        );
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.put(
    "/viewings/:id/assign",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    dependencies.p2Write(async (req, res) => {
      const { employeeId } = req.body || {};
      dependencies.p4Require(
        typeof employeeId === "string" && employeeId,
        "INVALID_ASSIGNEE",
        400,
      );
      const viewing = await dependencies.viewingCollection.findOne(
        dependencies.recordFilter(req.params.id),
      );
      dependencies.p4Require(viewing, "VIEWING_NOT_FOUND", 404);
      dependencies.p4Require(
        ["CHO_XAC_NHAN", "DA_XAC_NHAN"].includes(viewing.status),
        "VIEWING_LOCKED",
      );
      res.send(
        await dependencies.p4RunFromP2(
          req,
          `assignViewing:${viewing.id}`,
          async (plan) => {
            const shift = await dependencies.p4ViewingShift(viewing, plan);
            const assignment =
              shift &&
              (await dependencies.p4Records("ShiftAssignment", plan)).find(
                (a) =>
                  a.shiftId === shift.id &&
                  a.employeeId === employeeId &&
                  ["REGISTERED", "IN_PROGRESS"].includes(a.status),
              );
            dependencies.p4Require(
              assignment &&
                (await dependencies.p4Records("Employee", plan)).some(
                  (e) => e.id === employeeId && e.status === "ACTIVE",
                ),
              "INVALID_ASSIGNEE",
            );
            dependencies.p4Require(
              await dependencies.p4EmployeeFreeAt(
                plan,
                employeeId,
                viewing,
                shift,
              ),
              "EMPLOYEE_BUSY",
            );
            const task = await dependencies.p4EnsureViewingTask(
              plan,
              viewing,
              false,
            );
            await dependencies.p4EditTask(plan, task, {
              assigneeAssignmentIds: [assignment.id],
            });
            return dependencies.p4Clean(
              (await dependencies.p4Records("Viewing", plan)).find(
                (v) => v.id === viewing.id,
              ),
            );
          },
        ),
      );
    }),
  );

  dependencies.app.put(
    "/viewings/:id/status",
    dependencies.cors(),
    dependencies.requireRole("EMPLOYEE"),
    dependencies.p2Write(async (req, res) => {
      const viewing = await dependencies.viewingCollection.findOne(
        dependencies.recordFilter(req.params.id),
      );
      if (!viewing)
        return res
          .status(404)
          .send({ message: "Không tìm thấy lịch xem phòng." });
      if (viewing.employeeId !== req.p2Employee.id)
        return res
          .status(403)
          .send({ message: "Bạn không phụ trách lịch xem này." });
      const { status } = req.body || {};
      if (!["DA_XAC_NHAN", "DA_XEM"].includes(status))
        return res
          .status(400)
          .send({ message: "Trạng thái lịch xem không hợp lệ." });
      if (
        (viewing.status !== "CHO_XAC_NHAN" || status !== "DA_XAC_NHAN") &&
        (viewing.status !== "DA_XAC_NHAN" || status !== "DA_XEM")
      ) {
        return res
          .status(409)
          .send({ message: "Không thể chuyển lịch xem sang trạng thái này." });
      }
      res.send(
        await dependencies.p4RunFromP2(
          req,
          `viewingStatus:${viewing.id}`,
          async (plan) => {
            if (status === "DA_XEM") {
              const { task, part } = await dependencies.p4RequireViewingCheckIn(
                viewing,
                req.p2Employee.id,
                plan,
              );
              dependencies.p4Set(plan, "TaskAssignment", part, {
                personalStatus: "DONE",
                doneAt: plan.at,
              });
              await dependencies.p4TaskSummary(plan, task);
            } else {
              const customer = await dependencies.customerCollection.findOne({
                id: viewing.customerProfileId,
              });
              await dependencies.p4Notify(
                plan,
                customer?.accountId,
                "VIEWING_CONFIRMED",
                "Viewing",
                viewing.id,
                "Lịch xem phòng đã được xác nhận",
                `Lịch xem phòng ${dependencies.p4ViewingTime(viewing)} đã được xác nhận.`,
                `viewing-confirm:${viewing.id}`,
              );
            }
            return dependencies.p4Set(plan, "Viewing", viewing, {
              status,
              updatedAt: plan.at,
              version: (viewing.version || 0) + 1,
            });
          },
        ),
      );
    }),
  );

  dependencies.app.put(
    "/viewing-details/:id",
    dependencies.cors(),
    dependencies.requireRole("EMPLOYEE"),
    dependencies.p2Write(async (req, res) => {
      const detail = await dependencies.viewingDetailCollection.findOne(
        dependencies.recordFilter(req.params.id),
      );
      if (!detail)
        return res
          .status(404)
          .send({ message: "Không tìm thấy phòng trong lịch xem." });
      const viewing = await dependencies.viewingCollection.findOne({
        id: detail.viewingId,
      });
      if (!viewing)
        return res
          .status(404)
          .send({ message: "Không tìm thấy lịch xem phòng." });
      if (viewing.employeeId !== req.p2Employee.id)
        return res
          .status(403)
          .send({ message: "Bạn không phụ trách lịch xem này." });
      if (viewing.status !== "DA_XAC_NHAN")
        return res
          .status(409)
          .send({ message: "Cần xác nhận lịch xem trước khi ghi kết quả." });
      const { viewStatus, note } = req.body || {};
      if (
        !["CHUA_XEM", "DA_XEM"].includes(viewStatus) ||
        typeof note !== "string" ||
        note.length > 1000
      ) {
        return res
          .status(400)
          .send({ message: "Kết quả xem hoặc ghi chú không hợp lệ." });
      }
      res.send(
        await dependencies.p4RunFromP2(
          req,
          `viewingDetail:${detail.id}`,
          async (plan) => {
            await dependencies.p4RequireViewingCheckIn(
              viewing,
              req.p2Employee.id,
              plan,
            );
            const after = dependencies.p4Set(plan, "ViewingDetail", detail, {
              viewStatus,
              note: note.trim(),
              updatedAt: plan.at,
            });
            const rooms = viewing.rooms.map((room) =>
              room.roomId === detail.roomId
                ? { ...room, viewStatus, note: after.note }
                : room,
            );
            dependencies.p4Set(plan, "Viewing", viewing, {
              rooms,
              updatedAt: plan.at,
              version: (viewing.version || 0) + 1,
            });
            return after;
          },
        ),
      );
    }),
  );
}

function registerViewingCheckoutRoutes(dependencies) {
  dependencies.app.post(
    "/viewing-cart/checkout",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p2Write(async (req, res) => {
      const cart = req.session.viewingCart || [];
      const {
        viewerName,
        viewerPhone,
        peopleCount,
        note = "",
        items,
      } = req.body || {};
      dependencies.p4Require(
        Array.isArray(items) &&
          items.length >= 1 &&
          items.length <= 20 &&
          items.every(
            (item) =>
              item &&
              typeof item.roomId === "string" &&
              cart.includes(item.roomId),
          ) &&
          new Set(items.map((item) => item.roomId)).size === items.length,
        "INVALID_VIEWING_ITEMS",
        400,
      );
      dependencies.p4Require(
        typeof viewerName === "string" &&
          viewerName.trim() &&
          dependencies.validPhone(dependencies.normalizePhone(viewerPhone)) &&
          Number.isInteger(peopleCount) &&
          peopleCount >= 1 &&
          typeof note === "string" &&
          note.length <= 1000,
        "INVALID_VIEWING_DETAILS",
        400,
      );
      const result = await dependencies.p4RunFromP2(
        req,
        "checkoutViewings",
        async (plan) => {
          const bookingId = `dl-${new dependencies.ObjectId()}`,
            created = [];
          const rooms = await dependencies.p4Records("Room", plan);
          // Preparation only stages effects. Nothing is written unless every item passes.
          for (const item of items) {
            try {
              const schedule = dependencies.p4ViewingSchedule(
                item.date,
                item.startTime,
              );
              dependencies.p4Require(
                schedule.startAt > plan.at,
                "VIEWING_PAST",
                400,
              );
              const candidate = { customerId: req.p2Account._id, ...schedule };
              dependencies.p4Require(
                !(await dependencies.p4ViewingConflict(plan, candidate)),
                "VIEWING_TIME_CONFLICT",
              );
              const room = rooms.find((r) => r.id === item.roomId);
              dependencies.p4Require(
                dependencies.p4RoomViewable(room),
                "VIEWING_ROOM_UNAVAILABLE",
              );
              // Finalized week: a free guide is required now. Otherwise the guide is assigned at finalize.
              const candidateShift = await dependencies.p4ViewingShift(
                candidate,
                plan,
              );
              const finalized = await dependencies.p4ViewingFinalized(
                plan,
                candidateShift,
              );
              dependencies.p4Require(
                !finalized ||
                  (await dependencies.p4PickViewingEmployee(
                    plan,
                    candidate,
                    candidateShift,
                  )),
                "SLOT_NO_STAFF",
              );
              const viewing = dependencies.p4New(
                plan,
                "Viewing",
                {
                  bookingId,
                  customerId: req.p2Account._id,
                  customerProfileId: req.p2Customer.id,
                  employeeId: null,
                  taskId: null,
                  status: "DA_XAC_NHAN",
                  rooms: [
                    {
                      roomId: room.id,
                      order: 1,
                      viewStatus: "CHUA_XEM",
                      note: "",
                    },
                  ],
                  ...schedule,
                  viewerName: viewerName.trim(),
                  viewerPhone: dependencies.normalizePhone(viewerPhone),
                  visitorName: viewerName.trim(),
                  visitorPhone: dependencies.normalizePhone(viewerPhone),
                  visitorCount: peopleCount,
                  peopleCount,
                  note,
                  createdAt: plan.at,
                  version: 1,
                },
                `lx-${new dependencies.ObjectId()}`,
              );
              dependencies.p4New(
                plan,
                "ViewingDetail",
                { viewingId: viewing.id, ...viewing.rooms[0] },
                `ctx-${new dependencies.ObjectId()}`,
              );
              await dependencies.p4EnsureViewingTask(plan, viewing);
              const saved = (
                await dependencies.p4Records("Viewing", plan)
              ).find((v) => v.id === viewing.id);
              dependencies.p4Require(
                !finalized || saved.employeeId,
                "SLOT_NO_STAFF",
              );
              created.push(await dependencies.p4ViewingOut(saved, plan));
            } catch (error) {
              if (error.status) error.roomId = item.roomId;
              throw error;
            }
          }
          return { bookingId, viewings: created };
        },
      );
      const booked = new Set(
        result.viewings.flatMap((viewing) =>
          viewing.rooms.map((room) => room.roomId),
        ),
      );
      req.session.viewingCart = cart.filter((roomId) => !booked.has(roomId));
      await new Promise((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
      res.status(201).send(result);
    }),
  );
}

module.exports = {
  registerViewingCartRoutes,
  registerViewingRoutes,
  registerViewingCheckoutRoutes,
};
