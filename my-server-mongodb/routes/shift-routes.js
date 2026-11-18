function registerShiftRoutes(dependencies) {
  dependencies.app.get(
    "/data/registration-periods",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      res.send(await dependencies.p4OpenPeriods());
    }),
  );
  dependencies.app.get(
    "/data/registration-periods/current",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      res.set("Cache-Control", "private, no-store");
      res.send((await dependencies.p4OpenPeriods())[0] || null);
    }),
  );

  dependencies.app.get(
    "/data/shifts",
    dependencies.p4Staff,
    dependencies.p4Route(async (req, res) => {
      dependencies.p4Require(
        typeof req.query.periodId === "string",
        "PERIOD_REQUIRED",
        400,
      );
      res.send(
        (
          await dependencies.p4Collections.Shift.find({
            periodId: req.query.periodId,
          })
            .sort({ startsAt: 1 })
            .toArray()
        ).map(dependencies.p4Clean),
      );
    }),
  );

  dependencies.app.post(
    "/data/me/shift-registrations",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      const { periodId, shiftIds, submit } = req.body;
      dependencies.p4Require(
        Array.isArray(shiftIds) &&
          shiftIds.length <= 8 &&
          shiftIds.every((id) => typeof id === "string") &&
          new Set(shiftIds).size === shiftIds.length,
        "INVALID_SHIFT_IDS",
        400,
      );
      dependencies.p4Open(
        await dependencies.p4Get("RegistrationPeriod", periodId),
      );
      const results = [];
      for (const shiftId of shiftIds) {
        try {
          dependencies.p4Require(
            (await dependencies.p4Get("Shift", shiftId)).periodId === periodId,
            "SHIFT_PERIOD_MISMATCH",
            400,
          );
          const assignment = await dependencies.p4Execute(
            req,
            `register:${periodId}:${shiftId}`,
            (plan) => dependencies.p4Register(plan, req.p2Employee.id, shiftId),
          );
          results.push({ shiftId, ok: true, assignment });
        } catch (error) {
          if (!error.status && error.code !== 11000) throw error;
          const code = error.code === 11000 ? "ALREADY_REGISTERED" : error.code;
          results.push({
            shiftId,
            ok: false,
            error: { code, message: dependencies.p4Message(code) },
          });
        }
      }
      let registration =
        await dependencies.p4Collections.PeriodRegistration.findOne({
          periodId,
          employeeId: req.p2Employee.id,
        });
      if (submit && results.every((r) => r.ok)) {
        dependencies.p4Require(
          dependencies.p4ShiftLimit(registration?.shiftCount || 0, true),
          "REQUIRE_5_TO_8_SHIFTS",
        );
        registration = await dependencies.p4Execute(
          req,
          `submit:${periodId}`,
          async (plan) => {
            dependencies.p4Open(
              await dependencies.p4Get("RegistrationPeriod", periodId),
              plan.at,
            );
            return dependencies.p4Set(
              plan,
              "PeriodRegistration",
              registration,
              {
                submittedAt: plan.at,
                status: "CONFIRMED",
              },
            );
          },
        );
      }
      res
        .status(results.some((r) => !r.ok) ? 409 : 200)
        .send({ results, shiftCount: registration?.shiftCount || 0 });
    }),
  );

  dependencies.app.get(
    "/data/me/shift-assignments",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      await dependencies.p4Maintenance();
      const records = await dependencies.p4Collections.ShiftAssignment.find({
        employeeId: req.p2Employee.id,
      }).toArray();
      // Current task rows of this employee, computed once (not once per assignment).
      const counts = new Map(),
        data = await dependencies.p4TaskData(),
        now = new Date();
      for (const task of await dependencies.p4Collections.Task.find({
        status: { $ne: "CANCELLED" },
      }).toArray()) {
        for (const row of (
          await dependencies.p4TaskRows(task.id, undefined, data)
        ).current.filter((r) => r.employeeId === req.p2Employee.id)) {
          const count = counts.get(row.assignmentId) || {
            taskCount: 0,
            openTaskCount: 0,
          };
          count.taskCount++;
          if (
            !["DONE", "PENDING_CONFIRM"].includes(task.status) &&
            row.personalStatus !== "DONE"
          )
            count.openTaskCount++;
          counts.set(row.assignmentId, count);
        }
      }
      const shifts = new Map(
        (
          await dependencies.p4Collections.Shift.find({
            id: { $in: records.map((a) => a.shiftId) },
          }).toArray()
        ).map((s) => [s.id, s]),
      );
      const attendanceByAssignment = new Map(
        (
          await dependencies.p4Collections.Attendance.find({
            assignmentId: { $in: records.map((a) => a.id) },
          }).toArray()
        ).map((a) => [a.assignmentId, a]),
      );
      const result = [];
      for (const a of records) {
        // A deletable period can still have cancelled assignment history.
        const shift = shifts.get(a.shiftId) || a.shiftSnapshot || null;
        if (req.query.periodId && shift?.periodId !== req.query.periodId)
          continue;
        const attendance = attendanceByAssignment.get(a.id) || null;
        const count = counts.get(a.id) || { taskCount: 0, openTaskCount: 0 };
        const canCheckIn =
          a.status === "REGISTERED" &&
          shift?.status === "OPEN" &&
          new Date(shift.startsAt) <= now &&
          now < new Date(shift.endsAt);
        result.push({
          ...dependencies.p4Clean(a),
          shift: dependencies.p4Clean(shift),
          attendance: dependencies.p4Clean(attendance),
          ...count,
          canCheckIn,
        });
      }
      res.send(result);
    }),
  );

  dependencies.app.delete(
    "/data/me/shift-assignments/:id",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `cancel:${req.params.id}`,
          async (plan) =>
            dependencies.p4Cancel(
              plan,
              await dependencies.p4Owned(req, req.params.id),
            ),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/me/shift-assignments/:id/check-in",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(req, `checkIn:${req.params.id}`, (plan) =>
          dependencies.p4CheckIn(plan, req),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/me/shift-assignments/:id/check-out",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(req, `checkOut:${req.params.id}`, (plan) =>
          dependencies.p4CheckOut(plan, req),
        ),
      );
    }),
  );

  dependencies.app.get(
    "/data/me/shift-assignments/:id/tasks",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      const assignment = await dependencies.p4Owned(req, req.params.id);
      const tasks = await dependencies.p4Collections.Task.find({
          status: { $ne: "CANCELLED" },
        }).toArray(),
        result = [];
      const data = await dependencies.p4TaskData();
      for (const t of tasks) {
        const taskRows = await dependencies.p4TaskRows(t.id, undefined, data),
          { rows, current } = taskRows;
        const parts = rows.filter(
          (r) =>
            r.assignmentId === assignment.id &&
            r.employeeId === req.p2Employee.id,
        );
        const part =
          parts.find((r) => current.some((c) => c.id === r.id)) || parts.at(-1);
        if (!part) continue;
        const isCurrent = current.some((r) => r.id === part.id);
        const view = await dependencies.p4TaskView(
          t,
          undefined,
          isCurrent && t.kind === "VIEWING",
          taskRows,
        );
        result.push({
          ...view,
          mine: {
            taskAssignmentId: part.id,
            personalStatus: part.personalStatus,
            current: isCurrent,
          },
          editable:
            assignment.status === "IN_PROGRESS" &&
            isCurrent &&
            !["DONE", "CANCELLED", "PENDING_CONFIRM"].includes(t.status),
        });
      }
      res.send(result);
    }),
  );

  dependencies.app.put(
    "/data/tasks/:id/my-status",
    dependencies.p4Employee,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `taskStatus:${req.params.id}`,
          async (plan) => {
            const a = await dependencies.p4Owned(req, req.body.assignmentId),
              task = await dependencies.p4Get("Task", req.params.id);
            dependencies.p4Require(
              task.status !== "CANCELLED",
              "TASK_NOT_EDITABLE",
            );
            dependencies.p4Require(
              a.status === "IN_PROGRESS" &&
                !["DONE", "PENDING_CONFIRM"].includes(task.status),
              "TASK_NOT_EDITABLE",
            );
            dependencies.p4Require(
              ["TODO", "DONE"].includes(req.body.personalStatus),
              "INVALID_TASK_STATUS",
              400,
            );
            const { current } = await dependencies.p4TaskRows(task.id),
              parts = current.filter(
                (r) => r.assignmentId === a.id && r.employeeId === a.employeeId,
              );
            dependencies.p4Require(parts.length, "NOT_YOUR_TASK", 403);
            dependencies.p4Require(
              parts.every((r) => r.personalStatus !== "DONE"),
              "TASK_PENDING_CONFIRM",
            );
            if (task.kind === "VIEWING") {
              dependencies.p4Require(
                req.body.personalStatus === "DONE",
                "INVALID_TASK_STATUS",
                400,
              );
              const viewing = (
                await dependencies.p4Records("Viewing", plan)
              ).find((v) => v.id === task.viewingId);
              dependencies.p4Require(
                viewing?.status === "DA_XAC_NHAN",
                "TASK_NOT_EDITABLE",
              );
              const details = (
                await dependencies.p4Records("ViewingDetail", plan)
              ).filter((d) => d.viewingId === viewing.id);
              const submitted = req.body.viewingDetails;
              dependencies.p4Require(
                Array.isArray(submitted) &&
                  submitted.length === details.length &&
                  new Set(submitted.map((d) => d.detailId)).size ===
                    details.length &&
                  submitted.every(
                    (d) =>
                      details.some((row) => row.id === d.detailId) &&
                      ["CHUA_XEM", "DA_XEM"].includes(d.viewStatus) &&
                      typeof d.note === "string" &&
                      d.note.length <= 1000,
                  ),
                "INVALID_VIEWING_DETAILS",
                400,
              );
              for (const detail of details) {
                const result = submitted.find((d) => d.detailId === detail.id);
                dependencies.p4Set(plan, "ViewingDetail", detail, {
                  viewStatus: result.viewStatus,
                  note: result.note.trim(),
                  updatedAt: plan.at,
                });
              }
              dependencies.p4Set(plan, "Viewing", viewing, {
                status: "DA_XEM",
                updatedAt: plan.at,
                version: (viewing.version || 0) + 1,
                rooms: viewing.rooms.map((room) => {
                  const detail = details.find((d) => d.roomId === room.roomId),
                    result = submitted.find((d) => d.detailId === detail?.id);
                  return result
                    ? {
                        ...room,
                        viewStatus: result.viewStatus,
                        note: result.note.trim(),
                      }
                    : room;
                }),
              });
            }
            for (const row of parts)
              dependencies.p4Set(plan, "TaskAssignment", row, {
                personalStatus: req.body.personalStatus,
                doneAt: req.body.personalStatus === "DONE" ? plan.at : null,
              });
            await dependencies.p4TaskSummary(plan, task);
            return { id: task.id };
          },
        ),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/registration-periods",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      await dependencies.p4Maintenance();
      const result = [];
      for (const period of await dependencies.p4Collections.RegistrationPeriod.find(
        {},
      )
        .sort({ weekStart: 1 })
        .toArray())
        result.push(await dependencies.p4PeriodView(period));
      res.send(result);
    }),
  );

  dependencies.app.post(
    "/data/admin/registration-periods",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.status(201).send(
        await dependencies.p4Execute(req, "createPeriod", async (plan) => {
          const { weekStart, name } = req.body || {};
          dependencies.p4Require(
            typeof weekStart === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(weekStart) &&
              new Date(`${weekStart}T00:00:00Z`).getUTCDay() === 1 &&
              dependencies.p4Day(weekStart) === weekStart,
            "MONDAY_REQUIRED",
            400,
          );
          dependencies.p4Require(
            typeof name === "string" &&
              name.trim() &&
              name.trim().length <= 200,
            "NAME_REQUIRED",
            400,
          );
          dependencies.p4Require(
            dependencies.p4At(dependencies.p4Day(weekStart, 7), "00:00") >
              plan.at,
            "PAST_WEEK",
          );
          dependencies.p4Require(
            dependencies.p4RegistrationDeadline({ weekStart }) > plan.at,
            "PERIOD_OPEN_WINDOW",
          );
          dependencies.p4Require(
            !(await dependencies.p4Collections.RegistrationPeriod.findOne({
              weekStart,
            })),
            "WEEK_EXISTS",
          );
          const locations = await dependencies.p4Collections.WorkLocation.find(
            {},
          ).toArray();
          dependencies.p4Require(
            locations.length === 1 && locations[0].allowedRadiusM > 0,
            "ONE_HEADQUARTERS_REQUIRED",
          );
          const period = dependencies.p4New(plan, "RegistrationPeriod", {
            name: name.trim(),
            weekStart,
            weekEnd: dependencies.p4Day(weekStart, 6),
            opensAt: plan.at,
            closesAt: dependencies.p4RegistrationDeadline({ weekStart }),
            minShifts: 5,
            maxShifts: 8,
            status: "DRAFT",
          });
          for (let day = 0; day < 7; day++)
            for (const [
              startTime,
              ,
              endTime,
              label,
            ] of dependencies.VIEWING_WINDOWS) {
              const date = dependencies.p4Day(weekStart, day);
              dependencies.p4New(plan, "Shift", {
                periodId: period.id,
                workLocationId: locations[0].id,
                date,
                label,
                startTime,
                endTime,
                startsAt: dependencies.p4At(date, startTime),
                endsAt: dependencies.p4At(date, endTime),
                capacity: 6,
                assignedCount: 0,
                status: "OPEN",
              });
            }
          await dependencies.p4AssignWaitingViewings(plan);
          return period;
        }),
      );
    }),
  );

  dependencies.app.put(
    "/data/admin/registration-periods/:id",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `renamePeriod:${req.params.id}`,
          async (plan) => {
            const { name } = req.body || {};
            dependencies.p4Require(
              typeof name === "string" &&
                name.trim().length >= 1 &&
                name.trim().length <= 200,
              "NAME_REQUIRED",
              400,
            );
            return dependencies.p4Set(
              plan,
              "RegistrationPeriod",
              await dependencies.p4Get("RegistrationPeriod", req.params.id),
              { name: name.trim() },
            );
          },
        ),
      );
    }),
  );

  dependencies.app.delete(
    "/data/admin/registration-periods/:id",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `deletePeriod:${req.params.id}`,
          async (plan) => {
            const period = await dependencies.p4Get(
                "RegistrationPeriod",
                req.params.id,
              ),
              view = await dependencies.p4PeriodView(period);
            dependencies.p4Require(view.canDelete, "PERIOD_IN_USE");
            for (const registration of await dependencies.p4Collections.PeriodRegistration.find(
              { periodId: period.id },
            ).toArray())
              dependencies.p4Remove(plan, "PeriodRegistration", registration);
            for (const shift of await dependencies.p4Collections.Shift.find({
              periodId: period.id,
            }).toArray()) {
              for (const assignment of await dependencies.p4Collections.ShiftAssignment.find(
                { shiftId: shift.id, status: "CANCELLED" },
              ).toArray()) {
                dependencies.p4Set(plan, "ShiftAssignment", assignment, {
                  shiftSnapshot: dependencies.p4Clean(shift),
                });
              }
              dependencies.p4Remove(plan, "Shift", shift);
            }
            dependencies.p4Remove(plan, "RegistrationPeriod", period);
            return { id: period.id, deleted: true };
          },
        ),
      );
    }),
  );

  for (const [action, status] of [
    ["open", "OPEN"],
    ["close", "CLOSED"],
    ["finalize", "FINALIZED"],
  ]) {
    dependencies.app.post(
      `/data/admin/registration-periods/:id/${action}`,
      dependencies.p4Admin,
      dependencies.p4Route(async (req, res) => {
        res.send(
          await dependencies.p4Execute(
            req,
            `${action}:${req.params.id}`,
            async (plan) => {
              const p = await dependencies.p4Get(
                "RegistrationPeriod",
                req.params.id,
              );
              if (p.status === status) return dependencies.p4Clean(p);
              if (action === "open") {
                dependencies.p4Require(p.status === "DRAFT", "PERIOD_STATE");
                dependencies.p4Require(
                  dependencies.p4At(
                    dependencies.p4Day(p.weekStart, 7),
                    "00:00",
                  ) > plan.at,
                  "PAST_WEEK",
                );
                dependencies.p4Require(
                  dependencies.p4RegistrationDeadline(p) > plan.at,
                  "PERIOD_OPEN_WINDOW",
                );
                return dependencies.p4Set(plan, "RegistrationPeriod", p, {
                  status,
                  opensAt: plan.at,
                  closesAt: dependencies.p4RegistrationDeadline(p),
                });
              }
              dependencies.p4Require(
                action === "close"
                  ? ["DRAFT", "OPEN"].includes(p.status)
                  : p.status === "CLOSED",
                "PERIOD_STATE",
              );
              return dependencies.p4Close(plan, p, status);
            },
          ),
        );
      }),
    );
  }

  // Admin "Xếp bù ca thiếu": top every ACTIVE employee up to the minimum on a CLOSED/FINALIZED period
  // (future shifts with free seats only). The period status does not change.
  dependencies.app.post(
    "/data/admin/registration-periods/:id/fill-minimum",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `fillMinimum:${req.params.id}`,
          async (plan) => {
            const p = await dependencies.p4Get(
              "RegistrationPeriod",
              req.params.id,
            );
            dependencies.p4Require(
              ["CLOSED", "FINALIZED"].includes(p.status),
              "PERIOD_STATE",
            );
            dependencies.p4Require(
              new Date(`${p.weekEnd}T17:00:00+07:00`) > plan.at,
              "PERIOD_ENDED",
            );
            return dependencies.p4Close(
              plan,
              p,
              p.status,
              `FILL-${new Date(plan.at).getTime()}`,
            );
          },
        ),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/shift-state",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      await dependencies.p4Maintenance();
      const result = {};
      const types = [
        "Shift",
        "ShiftAssignment",
        "Attendance",
        "WorkLocation",
        "Employee",
        "PeriodRegistration",
        "Policy",
        "PolicyLevel",
      ];
      const snapshots = await Promise.all(
        types.map((type) =>
          dependencies.p4Collections[type].find({}).toArray(),
        ),
      );
      types.forEach((type, index) => {
        result[type] = snapshots[index].map(dependencies.p4Clean);
      });
      result.ShiftAssignment = result.ShiftAssignment.map((a) => ({
        source: null,
        ...a,
      }));
      const data = await dependencies.p4TaskData();
      result.Task = await Promise.all(
        (await dependencies.p4Collections.Task.find({}).toArray()).map(
          async (task) =>
            dependencies.p4TaskView(
              task,
              undefined,
              false,
              await dependencies.p4TaskRows(task.id, undefined, data),
            ),
        ),
      );
      res.send(result);
    }),
  );

  dependencies.app.post(
    "/data/admin/shift-registrations",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(req, "adminRegister", async (plan) => {
          const employee = await dependencies.p4Get(
            "Employee",
            req.body.employeeId,
          );
          dependencies.p4Require(
            employee.status === "ACTIVE",
            "INACTIVE_EMPLOYEE",
          );
          return dependencies.p4Register(
            plan,
            employee.id,
            req.body.shiftId,
            true,
          );
        }),
      );
    }),
  );

  dependencies.app.delete(
    "/data/admin/shift-assignments/:id",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `adminCancel:${req.params.id}`,
          async (plan) =>
            dependencies.p4Cancel(
              plan,
              await dependencies.p4Get("ShiftAssignment", req.params.id),
              true,
            ),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/shift-assignments/:id/move",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `move:${req.params.id}`,
          async (plan) => {
            const a = await dependencies.p4Get(
                "ShiftAssignment",
                req.params.id,
              ),
              source = await dependencies.p4Get("Shift", a.shiftId),
              target = await dependencies.p4Get("Shift", req.body.toShiftId);
            dependencies.p4Require(a.shiftId !== target.id, "SAME_SHIFT");
            const next = await dependencies.p4Register(
              plan,
              a.employeeId,
              target.id,
              true,
              a.id,
            );
            await dependencies.p4Cancel(
              plan,
              a,
              true,
              source.periodId === target.periodId,
            );
            return next;
          },
        ),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/tasks",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      const query = req.query.status ? { status: req.query.status } : {};
      const tasks = await dependencies.p4Collections.Task.find(query)
        .sort({ createdAt: -1, id: -1 })
        .toArray();
      const data = await dependencies.p4TaskData(),
        employees = new Map(
          (await dependencies.p4Records("Employee")).map((e) => [e.id, e]),
        );
      const shifts = new Map(
          (await dependencies.p4Records("Shift")).map((s) => [s.id, s]),
        ),
        result = [];
      const pendingAssignmentIds = new Set();
      for (const task of tasks.filter((t) => t.status === "PENDING_CONFIRM")) {
        for (const row of (
          await dependencies.p4TaskRows(task.id, undefined, data)
        ).current)
          pendingAssignmentIds.add(row.assignmentId);
      }
      const attendanceByAssignment = new Map(
        (
          await dependencies.p4Collections.Attendance.find({
            assignmentId: { $in: [...pendingAssignmentIds] },
          }).toArray()
        ).map((a) => [a.assignmentId, a]),
      );
      for (const task of tasks) {
        const taskRows = await dependencies.p4TaskRows(
            task.id,
            undefined,
            data,
          ),
          view = await dependencies.p4TaskView(
            task,
            undefined,
            false,
            taskRows,
          );
        const shift = shifts.get(task.currentShiftId);
        const assignees = taskRows.current.map((row) => ({
          ...dependencies.p4Clean(row),
          employeeCode: employees.get(row.employeeId)?.employeeCode || "",
          fullName: employees.get(row.employeeId)?.fullName || "",
        }));
        const pendingConfirm =
          task.status === "PENDING_CONFIRM"
            ? {
                at: task.pendingConfirmAt,
                shift: shift
                  ? {
                      id: shift.id,
                      date: shift.date,
                      label: shift.label,
                      startsAt: shift.startsAt,
                    }
                  : null,
                employees: [
                  ...new Map(
                    taskRows.current.map((row) => [
                      row.employeeId,
                      {
                        employeeId: row.employeeId,
                        fullName: employees.get(row.employeeId)?.fullName || "",
                        employeeCode:
                          employees.get(row.employeeId)?.employeeCode || "",
                        doneAt: row.doneAt || null,
                        checkOutAt:
                          attendanceByAssignment.get(row.assignmentId)
                            ?.checkOutAt || null,
                      },
                    ]),
                  ).values(),
                ],
              }
            : null;
        result.push({
          ...view,
          currentShift: shift
            ? {
                id: shift.id,
                date: shift.date,
                label: shift.label,
                startTime: shift.startTime,
                endTime: shift.endTime,
              }
            : null,
          assignees,
          currentAssignees: assignees,
          pendingConfirm,
        });
      }
      res.send(result);
    }),
  );

  dependencies.app.post(
    "/data/admin/tasks",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.status(201).send(
        await dependencies.p4Execute(req, "createTask", async (plan) => {
          const { title, shiftId, assigneeAssignmentIds } = req.body || {};
          dependencies.p4Require(
            typeof title === "string" &&
              title.trim() &&
              title.trim().length <= 200,
            "NAME_REQUIRED",
            400,
          );
          dependencies.p4Require(
            req.body.description === undefined ||
              (typeof req.body.description === "string" &&
                req.body.description.length <= 2000),
            "INVALID_DESCRIPTION",
            400,
          );
          const task = dependencies.p4New(plan, "Task", {
            kind: "GENERAL",
            title: title.trim(),
            description: req.body.description || "",
            status: "UNASSIGNED",
            createdAt: plan.at,
            createdBy: req.p2Account.id,
            updatedAt: plan.at,
            updatedBy: plan.actorId,
            currentShiftId: null,
          });
          if (shiftId != null && shiftId !== "")
            return dependencies.p4EditTask(plan, task, {
              shiftId,
              assigneeAssignmentIds,
            });
          dependencies.p4Require(
            assigneeAssignmentIds === undefined ||
              (Array.isArray(assigneeAssignmentIds) &&
                !assigneeAssignmentIds.length),
            "INVALID_ASSIGNEE",
          );
          return dependencies.p4TaskView(task, plan);
        }),
      );
    }),
  );

  dependencies.app.put(
    "/data/admin/tasks/:id",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `editTask:${req.params.id}`,
          async (plan) =>
            dependencies.p4EditTask(
              plan,
              await dependencies.p4Get("Task", req.params.id),
              req.body || {},
            ),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/tasks/:id/confirm",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `confirmTask:${req.params.id}`,
          async (plan) =>
            dependencies.p4ConfirmTask(
              plan,
              await dependencies.p4Get("Task", req.params.id),
            ),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/tasks/:id/reject",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `rejectTask:${req.params.id}`,
          async (plan) =>
            dependencies.p4RejectTask(
              plan,
              await dependencies.p4Get("Task", req.params.id),
              req.body || {},
            ),
        ),
      );
    }),
  );

  dependencies.app.delete(
    "/data/admin/tasks/:id",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `deleteTask:${req.params.id}`,
          async (plan) => {
            const task = await dependencies.p4Get("Task", req.params.id);
            dependencies.p4Require(
              task.status !== "PENDING_CONFIRM",
              "TASK_PENDING_CONFIRM",
            );
            dependencies.p4Require(
              task.kind !== "VIEWING",
              "VIEWING_TASK_CANCEL_VIA_VIEWING",
            );
            const { current, rows, links } = await dependencies.p4TaskRows(
              task.id,
            );
            dependencies.p4Require(
              task.status !== "DONE" &&
                !rows.some((r) => r.personalStatus === "DONE"),
              "TASK_HAS_PROGRESS",
            );
            for (const row of current) {
              const employee = await dependencies.employeeCollection.findOne({
                id: row.employeeId,
              });
              await dependencies.p4Notify(
                plan,
                employee?.accountId,
                "TASK_CANCELLED",
                "Task",
                task.id,
                "Công việc đã bị xóa",
                task.title,
                `p4-delete-task:${task.id}`,
              );
            }
            for (const row of rows)
              dependencies.p4Remove(plan, "TaskAssignment", row);
            for (const link of links)
              dependencies.p4Remove(plan, "TaskShift", link);
            dependencies.p4Remove(plan, "Task", task);
            return { id: task.id, deleted: true };
          },
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/tasks/:id/carry",
    dependencies.p4Admin,
    dependencies.p4Route(async (req, res) => {
      res.send(
        await dependencies.p4Execute(
          req,
          `carry:${req.params.id}`,
          async (plan) => {
            const task = await dependencies.p4Get("Task", req.params.id),
              target = await dependencies.p4Get("Shift", req.body.toShiftId);
            dependencies.p4Require(
              !["DONE", "CANCELLED"].includes(task.status) &&
                target.status === "OPEN" &&
                new Date(target.endsAt) > plan.at,
              "CANNOT_CARRY_TASK",
            );
            const ids = req.body.assigneeAssignmentIds;
            dependencies.p4Require(
              Array.isArray(ids) &&
                ids.length &&
                ids.every((id) => typeof id === "string") &&
                new Set(ids).size === ids.length,
              "ASSIGNEES_REQUIRED",
              400,
            );
            dependencies.p4Require(
              task.kind !== "VIEWING" || ids.length === 1,
              "ONE_ASSIGNEE_REQUIRED",
              400,
            );
            if (task.kind === "VIEWING") {
              const viewing = await dependencies.p4Get(
                "Viewing",
                task.viewingId,
              );
              dependencies.p4Require(
                (await dependencies.p4ViewingShift(viewing, plan))?.id ===
                  target.id,
                "VIEWING_SHIFT_LOCKED",
                400,
              );
            }
            const { current, rows } = await dependencies.p4TaskRows(task.id);
            const pending = [
              ...current.filter((r) => r.personalStatus !== "DONE"),
              ...rows.filter(
                (r) => r.waitingAdmin && !r.removed && !r.transferredTo,
              ),
            ];
            const used = new Set();
            for (const id of ids) {
              const a = await dependencies.p4Get("ShiftAssignment", id);
              dependencies.p4Require(
                a.shiftId === target.id &&
                  ["REGISTERED", "IN_PROGRESS"].includes(a.status),
                "INVALID_ASSIGNEE",
              );
              dependencies.p4Require(
                (await dependencies.p4Get("Employee", a.employeeId)).status ===
                  "ACTIVE",
                "INACTIVE_EMPLOYEE",
              );
              const row =
                pending.find(
                  (r) =>
                    !used.has(r.id) &&
                    r.assignmentId !== a.id &&
                    r.employeeId === a.employeeId,
                ) ||
                pending.find((r) => !used.has(r.id) && r.assignmentId !== a.id);
              dependencies.p4Require(
                row && row.assignmentId !== a.id,
                "NO_PENDING_PART",
              );
              used.add(row.id);
              await dependencies.p4Transfer(
                plan,
                req,
                row,
                task,
                await dependencies.p4Get("ShiftAssignment", row.assignmentId),
                a,
              );
            }
            return dependencies.p4Set(plan, "Task", task, {
              currentShiftId: target.id,
              status: pending.some((r) => r.waitingAdmin && !used.has(r.id))
                ? "WAITING_ADMIN"
                : "IN_PROGRESS",
            });
          },
        ),
      );
    }),
  );
}

module.exports = { registerShiftRoutes };
