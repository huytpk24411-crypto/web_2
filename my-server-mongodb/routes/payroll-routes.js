function registerPayrollRoutes(dependencies) {
  dependencies.app.get(
    "/data/admin/payroll-periods",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.send(
        (
          await dependencies.p5Collections.PayrollPeriod.find({})
            .sort({ code: 1 })
            .toArray()
        ).map(dependencies.p5Clean),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/payroll-periods",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.status(201).send(
        await dependencies.p5Execute(req, "CREATE_PERIOD", async (plan) => {
          const { start, end, ...fields } = dependencies.p5MonthBounds(
            req.body.code,
          );
          dependencies.p3Assert(
            !(await dependencies.p5Collections.PayrollPeriod.findOne({
              year: fields.year,
              month: fields.month,
            })),
            "PERIOD_EXISTS",
          );
          return dependencies.p5Effect(plan, "PayrollPeriod", null, {
            ...fields,
            name: `Lương tháng ${fields.month}/${fields.year}`,
            status: "OPEN",
            displayStatus: "DANG_MO",
            version: 0,
            closedAt: null,
            closedBy: null,
            policyVersionIds: [],
            totals: {},
          });
        }),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/payroll-periods/:id/calculate",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.send(
        await dependencies.p5Execute(req, "CALCULATE", (plan) =>
          dependencies.p5Calculate(plan, req.params.id),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/payroll-periods/:id/close",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.send(
        await dependencies.p5Execute(req, "CLOSE", async (plan) => {
          const period = await dependencies.p5Get(
            "PayrollPeriod",
            req.params.id,
          );
          dependencies.p5Mutable(period);
          dependencies.p3Assert(
            period.status === "CALCULATED",
            "CALCULATE_FIRST",
          );
          // Rebuild once while both queues are held: P3/P4 changes since calculation cannot leave stale snapshots.
          const calculated = await dependencies.p5Calculate(plan, period.id);
          for (const effect of plan.effects) {
            if (
              effect.type === "Commission" ||
              effect.type === "PayrollAdjustment"
            )
              effect.after.status = "CLOSED";
          }
          return dependencies.p5Effect(plan, "PayrollPeriod", calculated, {
            status: "CLOSED",
            displayStatus: "DA_CHOT",
            closedAt: plan.at,
            closedBy: req.p2Account.id,
          });
        }),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/payroll-periods/:id/payslips",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      await dependencies.p5Get("PayrollPeriod", req.params.id);
      res.send(
        await Promise.all(
          (
            await dependencies.p5Collections.Payslip.find({
              periodId: req.params.id,
            }).toArray()
          ).map(dependencies.p5SlipView),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/payslips/:id/adjustments",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.send(
        await dependencies.p5Execute(req, "ADJUST", async (plan) => {
          const slip = await dependencies.p5Get("Payslip", req.params.id),
            period = await dependencies.p5Get("PayrollPeriod", slip.periodId);
          dependencies.p5Mutable(period);
          dependencies.p3Assert(slip.status === "DRAFT", "PAYSLIP_LOCKED");
          const { kind, reason } = req.body,
            amount = dependencies.p5Money(req.body.amount);
          dependencies.p3Assert(
            ["BONUS", "DEDUCTION", "LATE_PENALTY", "ABSENCE"].includes(kind) &&
              typeof reason === "string" &&
              reason.trim().length >= 3,
            "INVALID_ADJUSTMENT",
            400,
          );
          const adjustment = await dependencies.p5Get(
            "PayrollAdjustment",
            slip.adjustmentId,
          );
          dependencies.p3Assert(
            adjustment.periodId === slip.periodId &&
              adjustment.status === "DRAFT",
            "ADJUSTMENT_LOCKED",
          );
          const bonus = dependencies.p5Sum([
            adjustment.totalBonus,
            kind === "BONUS" ? amount : 0,
          ]);
          const deduction = dependencies.p5Sum([
            adjustment.totalDeduction,
            kind !== "BONUS" ? amount : 0,
          ]);
          dependencies.p5Effect(plan, "PayrollAdjustment", adjustment, {
            totalBonus: bonus,
            totalDeduction: deduction,
            notes: `${adjustment.notes}\n${kind}: ${amount} VND; ${reason.trim()}`,
          });
          const next = dependencies.p5Effect(plan, "Payslip", slip, {
            totalBonus: bonus,
            totalDeductions: deduction,
            netPay: dependencies.p5Net(
              slip.baseSalary,
              slip.commissionAmount,
              bonus,
              deduction,
            ),
          });
          dependencies.p5Effect(plan, "PayrollPeriod", period, {
            status: "OPEN",
            displayStatus: "DANG_MO",
            version: (period.version || 0) + 1,
          });
          return next;
        }),
      );
    }),
  );

  for (const [action, from, to] of [
    ["approve", "DRAFT", "APPROVED"],
    ["pay", "APPROVED", "PAID"],
  ]) {
    dependencies.app.post(
      `/data/admin/payslips/:id/${action}`,
      dependencies.p5Admin,
      dependencies.p5Route(async (req, res) => {
        res.send(
          await dependencies.p5Execute(
            req,
            action.toUpperCase(),
            async (plan) => {
              const slip = await dependencies.p5Get("Payslip", req.params.id),
                period = await dependencies.p5Get(
                  "PayrollPeriod",
                  slip.periodId,
                );
              dependencies.p3Assert(
                period.status === "CLOSED",
                "CLOSE_PERIOD_FIRST",
              );
              dependencies.p3Assert(
                slip.status === from,
                "INVALID_PAYSLIP_TRANSITION",
              );
              const next = dependencies.p5Effect(plan, "Payslip", slip, {
                status: to,
                ...(to === "PAID"
                  ? { paidAt: plan.at }
                  : { approvedAt: plan.at, approvedBy: req.p2Account.id }),
              });
              if (to === "PAID") {
                if (slip.commissionId)
                  dependencies.p5Effect(
                    plan,
                    "Commission",
                    await dependencies.p5Get("Commission", slip.commissionId),
                    { status: "PAID" },
                  );
                const others = await dependencies.p5Collections.Payslip.find({
                  periodId: period.id,
                  id: { $ne: slip.id },
                  status: { $ne: "PAID" },
                }).toArray();
                if (!others.length)
                  dependencies.p5Effect(plan, "PayrollPeriod", period, {
                    status: "PAID",
                    displayStatus: "DA_TRA",
                    paidAt: plan.at,
                  });
              }
              await dependencies.p5Notice(plan, next, to);
              return next;
            },
          ),
        );
      }),
    );
  }

  dependencies.app.get(
    "/data/me/payroll-periods",
    dependencies.p5Employee,
    dependencies.p5Route(async (req, res) => {
      const slips = await dependencies.p5Collections.Payslip.find({
        employeeId: req.p2Employee.id,
      }).toArray();
      res.send(
        (
          await dependencies.p5Collections.PayrollPeriod.find({
            id: { $in: slips.map((s) => s.periodId) },
            status: { $in: ["CALCULATED", "CLOSED", "PAID"] },
          })
            .sort({ code: 1 })
            .toArray()
        ).map(dependencies.p5Clean),
      );
    }),
  );

  dependencies.app.get(
    "/data/me/payslips",
    dependencies.p5Employee,
    dependencies.p5Route(async (req, res) => {
      dependencies.p5MonthBounds(req.query.period);
      const period = await dependencies.p5Collections.PayrollPeriod.findOne({
        code: req.query.period,
        status: { $in: ["CALCULATED", "CLOSED", "PAID"] },
      });
      const slip =
        period &&
        (await dependencies.p5Collections.Payslip.findOne({
          periodId: period.id,
          employeeId: req.p2Employee.id,
        }));
      dependencies.p3Assert(slip, "PAYSLIP_NOT_FOUND", 404);
      res.send(await dependencies.p5SlipView(slip));
    }),
  );

  dependencies.app.get(
    "/data/admin/policies",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      const rows = await dependencies.p5Collections.Policy.find(
        req.query.type ? { type: String(req.query.type) } : {},
      )
        .sort({ type: 1, version: -1 })
        .toArray();
      res.send(
        await Promise.all(
          rows.map(async (p) => ({
            ...dependencies.p5Clean(p),
            levels: (
              await dependencies.p5Collections.PolicyLevel.find({
                policyId: p.id,
              })
                .sort({ from: 1 })
                .toArray()
            ).map(dependencies.p5Clean),
          })),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/policies",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.status(201).send(
        await dependencies.p5Execute(req, "CREATE_POLICY", async (plan) => {
          const { type, name } = req.body,
            levels = dependencies.p5Levels(type, req.body.levels);
          const effectiveFrom = new Date(req.body.effectiveFrom),
            effectiveTo = req.body.effectiveTo
              ? new Date(req.body.effectiveTo)
              : null;
          dependencies.p3Assert(
            typeof name === "string" &&
              name.trim() &&
              Number.isFinite(+effectiveFrom) &&
              (!effectiveTo ||
                (Number.isFinite(+effectiveTo) && effectiveTo > effectiveFrom)),
            "INVALID_POLICY",
            400,
          );
          const previous = await dependencies.p5Collections.Policy.find({
            type,
          })
            .sort({ version: -1 })
            .limit(1)
            .toArray();
          const policy = dependencies.p5Effect(plan, "Policy", null, {
            type,
            name: name.trim(),
            version: (previous[0]?.version || 0) + 1,
            effectiveFrom,
            effectiveTo,
            issuedByAccountId: req.p2Account.id,
            status: "DRAFT",
          });
          policy.levels = levels.map((level) =>
            dependencies.p5Effect(plan, "PolicyLevel", null, {
              policyId: policy.id,
              ...level,
            }),
          );
          return policy;
        }),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/policies/:id/activate",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.send(
        await dependencies.p5Execute(req, "ACTIVATE_POLICY", async (plan) => {
          const policy = await dependencies.p5Get("Policy", req.params.id);
          dependencies.p3Assert(policy.status === "DRAFT", "POLICY_IMMUTABLE");
          const levels = await dependencies.p5Collections.PolicyLevel.find({
            policyId: policy.id,
          }).toArray();
          dependencies.p5Levels(policy.type, levels);
          dependencies.p3Assert(
            new Date(policy.effectiveFrom) <= plan.at &&
              (!policy.effectiveTo || plan.at < new Date(policy.effectiveTo)),
            "POLICY_NOT_EFFECTIVE",
          );
          const previous = await dependencies.p5Collections.Policy.find({
            type: policy.type,
            status: "ACTIVE",
          }).toArray();
          for (const old of previous) {
            dependencies.p3Assert(
              new Date(old.effectiveFrom) < new Date(policy.effectiveFrom),
              "POLICY_EFFECTIVE_OVERLAP",
            );
            dependencies.p5Effect(plan, "Policy", old, {
              status: "RETIRED",
              displayStatus: "HET_HIEU_LUC",
              effectiveTo:
                old.effectiveTo &&
                new Date(old.effectiveTo) < new Date(policy.effectiveFrom)
                  ? old.effectiveTo
                  : policy.effectiveFrom,
            });
          }
          return dependencies.p5Effect(plan, "Policy", policy, {
            status: "ACTIVE",
            displayStatus: "DANG_HIEU_LUC",
          });
        }),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/reports/revenue",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      if (req.query.month)
        return res.send(await dependencies.p5Report(req.query.month));
      const year = String(req.query.year || new Date().getFullYear());
      dependencies.p3Assert(/^20\d{2}$/.test(year), "INVALID_YEAR", 400);
      const months = [];
      for (let i = 1; i <= 12; i++)
        months.push(
          await dependencies.p5Report(`${year}-${String(i).padStart(2, "0")}`),
        );
      res.send(months);
    }),
  );

  dependencies.app.get(
    "/data/admin/reports/occupancy",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      res.send(await dependencies.adminOccupancy());
    }),
  );

  dependencies.app.get(
    "/data/admin/summary",
    dependencies.p5Admin,
    dependencies.p5Route(async (req, res) => {
      const now = new Date(),
        code = req.query.month || dependencies.p3Month(now);
      dependencies.p5MonthBounds(code);
      const today = new Date(now.getTime() + 7 * 3600000)
        .toISOString()
        .slice(0, 10);
      const [
        finance,
        rooms,
        activeStaff,
        deposits,
        shifts,
        assignments,
        attendance,
      ] = await Promise.all([
        dependencies.p5Report(code),
        dependencies.roomCollection.find({}).toArray(),
        dependencies.employeeCollection.countDocuments({ status: "ACTIVE" }),
        // DEP: "pending" = contracts waiting for the admin decision (same rule as /data/admin/contract-reviews).
        dependencies.p3Collections.Deposit.find({
          status: { $in: ["PAID", "CONTRACTED"] },
        })
          .toArray()
          .then(async (list) =>
            (await Promise.all(list.map(dependencies.p3ContractReview))).filter(
              (item) => item.outcome === "PENDING",
            ),
          ),
        dependencies.p4Collections.Shift.find({ date: today }).toArray(),
        dependencies.p4Collections.ShiftAssignment.find({
          status: { $ne: "CANCELLED" },
        }).toArray(),
        dependencies.p4Collections.Attendance.find({}).toArray(),
      ]);
      const shiftIds = new Set(shifts.map((s) => s.id));
      const assigned = assignments.filter((a) => shiftIds.has(a.shiftId));
      const checked = assigned.flatMap((a) => {
        const record = attendance.find((r) => r.assignmentId === a.id);
        return record
          ? [{ ...record, shift: shifts.find((s) => s.id === a.shiftId) }]
          : [];
      });
      res.send({
        ...finance,
        asOf: now.toISOString(),
        rooms: dependencies.adminRoomCounts(rooms),
        activeStaff,
        pendingDeposits: deposits.length,
        pendingDepositAmount: dependencies.p5Sum(
          deposits.map((item) => item.amounts.total),
        ),
        today: {
          date: today,
          shifts: shifts.length,
          assignments: assigned.length,
          checkedIn: checked.length,
          checkedOut: checked.filter((r) => r.checkOutAt).length,
          late: checked.filter(
            (r) => new Date(r.checkInAt) > new Date(r.shift.startsAt),
          ).length,
          absent: assigned.filter((a) => a.status === "ABSENT").length,
        },
      });
    }),
  );
}

module.exports = { registerPayrollRoutes };
