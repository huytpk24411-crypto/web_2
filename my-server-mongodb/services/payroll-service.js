// CommonJS services retain the existing rules and MongoDB native-driver operations.
function createPayrollService(dependencies) {
  // P5 — payroll/policy snapshots. Same single-process, standalone MongoDB style as P3/P4.
  const p5Collections = Object.fromEntries(
    [
      "PayrollPeriod",
      "Payslip",
      "PayrollAdjustment",
      "EmployeeRevenue",
      "CompanyRevenue",
      "Commission",
      "BrokerageTransaction",
      "Policy",
      "PolicyLevel",
      "Employee",
      "Attendance",
      "ShiftAssignment",
      "Shift",
      "Contract",
      "Room",
      "Customer",
      "Notification",
    ].map((name) => [name, dependencies.database.collection(name)]),
  );

  const p5Clean = (row) =>
    row &&
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          key !== "_id" && key !== "p3LastStep" && !key.startsWith("_p"),
      ),
    );

  const p5Get = async (type, id) => {
    const row = await p5Collections[type].findOne({ id });
    dependencies.p3Assert(row, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return row;
  };

  function p5Money(value) {
    dependencies.p3Assert(
      Number.isSafeInteger(value) && value >= 0,
      "INVALID_AMOUNT",
      400,
    );
    return value;
  }

  function p5Sum(values) {
    return p5Money(values.reduce((sum, value) => sum + p5Money(value), 0));
  }

  function p5Commission(revenue, levels) {
    p5Money(revenue);
    const matches = levels.filter(
      (l) => revenue >= l.from && (l.to == null || revenue < l.to),
    );
    dependencies.p3Assert(
      matches.length === 1 &&
        Number.isInteger(matches[0].rateBps) &&
        matches[0].rateBps >= 0 &&
        matches[0].rateBps <= 10000,
      "POLICY_NOT_CONFIGURED",
    );
    return {
      policyLevelId: matches[0].id,
      rateBps: matches[0].rateBps,
      amount: p5Money(Math.round((revenue * matches[0].rateBps) / 10000)),
    };
  }

  function p5Net(base, commission, bonus, deduction) {
    return Math.max(0, p5Sum([base, commission, bonus]) - p5Money(deduction));
  }

  function p5Mutable(period) {
    dependencies.p3Assert(
      ["OPEN", "CALCULATED"].includes(period.status),
      "PAYROLL_CLOSED",
    );
    dependencies.p3Assert(!period.p3Pending, "REVENUE_PENDING");
  }

  function p5MonthBounds(code) {
    dependencies.p3Assert(
      typeof code === "string" && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(code),
      "INVALID_PERIOD",
      400,
    );
    const year = Number(code.slice(0, 4)),
      month = Number(code.slice(5));
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      code,
      year,
      month,
      fromDate: `${code}-01`,
      toDate: `${code}-${last}`,
      start: new Date(`${code}-01T00:00:00+07:00`),
      end: new Date(Date.UTC(year, month, 1) - 7 * 3600000),
    };
  }

  function p5Levels(type, input) {
    dependencies.p3Assert(
      ["HOA_HONG", "PHAT_TRE", "GIU_CHO"].includes(type) &&
        Array.isArray(input) &&
        input.length > 0 &&
        input.every((l) => l && typeof l === "object"),
      "INVALID_POLICY",
      400,
    );
    const levels = input
      .map((l) => ({
        from: p5Money(l.from),
        to: l.to == null ? null : p5Money(l.to),
        rateBps: type === "HOA_HONG" ? p5Money(l.rateBps) : null,
        amount: type === "HOA_HONG" ? null : p5Money(l.amount),
      }))
      .sort((a, b) => a.from - b.from);
    levels.forEach((l, i) => {
      dependencies.p3Assert(
        l.to == null || l.to > l.from,
        "INVALID_POLICY_RANGE",
        400,
      );
      dependencies.p3Assert(
        !i || (levels[i - 1].to != null && levels[i - 1].to <= l.from),
        "POLICY_LEVEL_OVERLAP",
        400,
      );
      dependencies.p3Assert(
        l.rateBps == null || l.rateBps <= 10000,
        "INVALID_RATE",
        400,
      );
    });
    // Validate the agreed BR-18 schedule; calculation itself always reads stored levels.
    if (type === "HOA_HONG") {
      const agreed = [
        [0, 10000000, 2000],
        [10000000, 15000000, 3000],
        [15000000, 20000000, 3500],
        [20000000, 30000000, 4000],
        [30000000, null, 4500],
      ];
      dependencies.p3Assert(
        JSON.stringify(levels.map((l) => [l.from, l.to, l.rateBps])) ===
          JSON.stringify(agreed),
        "BR18_LEVELS_REQUIRED",
        400,
      );
    }
    dependencies.p3Assert(
      type !== "GIU_CHO" || levels.length === 1,
      "HOLD_POLICY_SINGLE_LEVEL_REQUIRED",
      400,
    );
    return levels;
  }

  function p5Effect(plan, type, before, fields) {
    const after = { ...p5Clean(before), ...fields };
    if (!before) after.id = fields.id || `p5-${new dependencies.ObjectId()}`;
    plan.effects.push({ type, before: p5Clean(before) || null, after });
    return after;
  }

  async function p5Run(op) {
    for (let i = op.cursor || 0; i < op.plan.effects.length; i++) {
      const e = op.plan.effects[i],
        col = p5Collections[e.type],
        token = `${op.id}:${i}`;
      const current = await col.findOne({ id: e.after.id });
      if (current?._p5Token !== token) {
        if (!e.before) {
          dependencies.p3Assert(!current, "PAYROLL_CONCURRENT_CHANGE");
          await col.insertOne({ ...e.after, _p5Token: token });
        } else {
          const expected = { ...e.before };
          const result = await col.updateOne(expected, {
            $set: { ...e.after, _p5Token: token },
          });
          if (!result.matchedCount) {
            if (i === 0)
              await dependencies.auditCollection.updateOne(
                { id: op.id },
                { $set: { state: "FAILED" } },
              );
            throw dependencies.p3Error(
              i === 0 ? 409 : 503,
              "PAYROLL_RECOVERY_REQUIRED",
            );
          }
        }
      }
      const event = {
        id: `${token}:audit`,
        entityType: e.type,
        entityId: e.after.id,
        action: op.action,
        before: e.before,
        after: e.after,
        actorId: op.actorId,
        at: op.at,
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

  async function p5Recover() {
    for (const op of await dependencies.auditCollection
      .find({ entityType: "P5Operation", state: "PENDING" })
      .sort({ at: 1 })
      .toArray())
      await p5Run(op);
  }

  async function p5Barrier() {
    return dependencies.p3Serial(() =>
      dependencies.p4Serial(async () => {
        await dependencies.p3Recover();
        await dependencies.p4Recover();
        await p5Recover();
      }),
    );
  }

  async function p5Execute(req, action, prepare) {
    const key = req.get("Idempotency-Key");
    dependencies.p3Assert(
      typeof key === "string" && key.length >= 8 && key.length <= 160,
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
    );
    const p5Key = `${req.p2Account.id}:${key}`;
    const fingerprint = JSON.stringify(
      dependencies.p3Stable({ action, path: req.path, body: req.body || {} }),
    );
    const old = await dependencies.auditCollection.findOne({ p5Key });
    if (old) {
      dependencies.p3Assert(
        old.fingerprint === fingerprint,
        "IDEMPOTENCY_CONFLICT",
      );
      dependencies.p3Assert(
        old.state !== "FAILED",
        "PAYROLL_CONCURRENT_CHANGE",
      );
      return old.state === "DONE" ? old.result : p5Run(old);
    }
    const plan = { effects: [], at: new Date() },
      result = await prepare(plan);
    const op = {
      id: `p5-op-${new dependencies.ObjectId()}`,
      entityType: "P5Operation",
      action,
      actorId: req.p2Account.id,
      at: plan.at,
      p5Key,
      fingerprint,
      plan,
      result,
      state: "PENDING",
      cursor: 0,
    };
    await dependencies.auditCollection.insertOne(op);
    return p5Run(op);
  }

  function p5Route(handler) {
    return async (req, res) => {
      try {
        await dependencies.p3Serial(() =>
          dependencies.p4Serial(async () => {
            await dependencies.p3Recover();
            await dependencies.p4Recover();
            await p5Recover();
            await handler(req, res);
          }),
        );
      } catch (error) {
        res.status(error.status || (error.code === 11000 ? 409 : 503)).send({
          code:
            error.code === 11000
              ? "DUPLICATE_RECORD"
              : error.code || "PAYROLL_RECOVERY_REQUIRED",
          message: error.message,
        });
      }
    };
  }

  async function p5Policy(at) {
    const policies = (
      await p5Collections.Policy.find({
        type: "HOA_HONG",
        status: { $in: ["ACTIVE", "RETIRED"] },
      }).toArray()
    ).filter(
      (p) =>
        new Date(p.effectiveFrom) <= at &&
        (!p.effectiveTo || at < new Date(p.effectiveTo)),
    );
    dependencies.p3Assert(policies.length === 1, "POLICY_NOT_CONFIGURED");
    const policy = policies[0];
    const stored = await p5Collections.PolicyLevel.find({
      policyId: policy.id,
    }).toArray();
    const levels = stored.length ? stored : policy.levels || [];
    p5Levels("HOA_HONG", levels);
    return { policy, levels };
  }

  async function p5Transactions(code) {
    const { start, end } = p5MonthBounds(code);
    return p5Collections.BrokerageTransaction.find({
      status: "RECOGNIZED",
      recognizedAt: { $gte: start, $lt: end },
    }).toArray();
  }

  function p5ContractCount(rows) {
    // Legacy recognized transactions were created only on completion.
    return rows.filter((row) => !row.outcome || row.outcome === "SUCCESS")
      .length;
  }

  async function p5AttendanceCounts(code) {
    const { start, end } = p5MonthBounds(code);
    const attendance = await p5Collections.Attendance.find({
      checkInAt: { $gte: start, $lt: end },
      checkOutAt: { $ne: null },
    }).toArray();
    const assignments = await p5Collections.ShiftAssignment.find({
      id: { $in: attendance.map((a) => a.assignmentId) },
    }).toArray();
    const counts = new Map();
    for (const row of attendance) {
      const employeeId = assignments.find(
        (a) => a.id === row.assignmentId,
      )?.employeeId;
      if (employeeId) counts.set(employeeId, (counts.get(employeeId) || 0) + 1);
    }
    return counts;
  }

  async function p5TransactionDetails(rows) {
    const result = [];
    for (const t of rows) {
      const c = await p5Collections.Contract.findOne({ id: t.contractId });
      const roomId = c?.roomId || t.roomId,
        customerId = c?.customerId || t.customerId;
      const room = roomId && (await p5Collections.Room.findOne({ id: roomId }));
      const customer =
        customerId &&
        (await p5Collections.Customer.findOne({ id: customerId }));
      const info = room || t.roomSnapshot || c?.roomSnapshot;
      result.push({
        id: t.id,
        contractId: t.contractId,
        depositId: t.depositId,
        outcome: t.outcome,
        room: info
          ? [info.code, info.name, info.address].filter(Boolean).join(" · ")
          : roomId || "",
        customer: customer?.fullName || customer?.name || "",
        amount: t.finalFee,
        at: t.recognizedAt,
        status: t.status,
      });
    }
    return result;
  }

  async function p5LateDetails(adjustment) {
    let lateness = [];
    // Seed notes are JSON; P4 appends one human-readable line per late check-in.
    try {
      lateness =
        JSON.parse((adjustment.notes || "{}").split("\n")[0]).lateness || [];
    } catch {
      /* P4 notes */
    }
    const pattern =
      /trễ (\d+) phút; attendance ([^;\s]+); ([^:\s]+): (\d+) VND/g;
    for (const match of String(adjustment.notes || "").matchAll(pattern)) {
      if (!lateness.some((row) => row.attendanceId === match[2]))
        lateness.push({
          attendanceId: match[2],
          lateMinutes: Number(match[1]),
          policyLevelId: match[3],
          amount: Number(match[4]),
        });
    }
    return lateness;
  }

  async function p5SlipView(slip) {
    const adjustment = await p5Get("PayrollAdjustment", slip.adjustmentId);
    const commission = slip.commissionId
      ? await p5Get("Commission", slip.commissionId)
      : null;
    const period = await p5Get("PayrollPeriod", slip.periodId);
    const employee = await p5Get("Employee", slip.employeeId);
    const shiftCount =
      slip.shiftCount ??
      (await p5AttendanceCounts(period.code)).get(slip.employeeId) ??
      0;
    const revenue = await p5Collections.EmployeeRevenue.findOne({
      employeeId: slip.employeeId,
      periodId: period.id,
    });
    const rows =
      slip.revenueDetails ||
      (await p5TransactionDetails(
        (await p5Transactions(period.code)).filter(
          (t) =>
            t.employeeRevenueId === revenue?.id ||
            t.employeeId === slip.employeeId,
        ),
      ));
    return {
      ...p5Clean(slip),
      shiftCount,
      periodCode: period.code,
      periodStatus: period.status,
      employee: {
        id: employee.id,
        accountId: employee.accountId,
        fullName: employee.fullName,
        employeeCode: employee.employeeCode,
        position: employee.position,
      },
      adjustment: p5Clean(adjustment),
      commission: p5Clean(commission),
      totalBonus: adjustment.totalBonus,
      lateness: slip.lateness || (await p5LateDetails(adjustment)),
      transactions: rows,
    };
  }

  async function p5Calculate(plan, id) {
    const period = await p5Get("PayrollPeriod", id);
    p5Mutable(period);
    const { end } = p5MonthBounds(period.code);
    const { policy, levels } = await p5Policy(new Date(end.getTime() - 1));
    const transactions = await p5Transactions(period.code);
    const attendanceCounts = await p5AttendanceCounts(period.code);
    const existingRevenues = await p5Collections.EmployeeRevenue.find({
      periodId: id,
    }).toArray();
    const slips = await p5Collections.Payslip.find({ periodId: id }).toArray();
    const ids = new Set([
      ...slips.map((s) => s.employeeId),
      ...existingRevenues.map((r) => r.employeeId),
    ]);
    for (const t of transactions) {
      const linkedEmployeeId = existingRevenues.find(
        (r) => r.id === t.employeeRevenueId,
      )?.employeeId;
      dependencies.p3Assert(
        !t.employeeId || !linkedEmployeeId || t.employeeId === linkedEmployeeId,
        "REVENUE_REFERENCE_MISMATCH",
      );
      const employeeId = t.employeeId || linkedEmployeeId;
      dependencies.p3Assert(employeeId, "TRANSACTION_EMPLOYEE_MISSING");
      ids.add(employeeId);
    }
    const employees = await p5Collections.Employee.find({
      $or: [
        { status: "ACTIVE", startDate: { $lte: period.toDate } },
        { id: { $in: [...ids] } },
      ],
    }).toArray();
    dependencies.p3Assert(
      employees.length &&
        [...ids].every((id) => employees.some((e) => e.id === id)),
      "EMPLOYEE_NOT_FOUND",
    );
    const policyIds = new Set([policy.id]),
      snapshots = [];
    // First effect claims the period version. P3 and P4 use the same queues during the entire plan.
    const claimed = p5Effect(plan, "PayrollPeriod", period, {
      version: (period.version || 0) + 1,
    });
    for (const employee of employees) {
      const er = existingRevenues.find((r) => r.employeeId === employee.id);
      const rows = transactions.filter(
        (t) => t.employeeId === employee.id || t.employeeRevenueId === er?.id,
      );
      const revenue = p5Sum(rows.map((t) => t.finalFee)),
        commission = p5Commission(revenue, levels);
      const oldSlip = slips.find((s) => s.employeeId === employee.id);
      const oldAdjustment = oldSlip?.adjustmentId
        ? await p5Get("PayrollAdjustment", oldSlip.adjustmentId)
        : null;
      dependencies.p3Assert(
        !oldAdjustment ||
          (oldAdjustment.status === "DRAFT" && oldAdjustment.periodId === id),
        "ADJUSTMENT_LOCKED",
      );
      const adjustment = p5Effect(plan, "PayrollAdjustment", oldAdjustment, {
        periodId: id,
        policyLevelId: oldAdjustment?.policyLevelId || null,
        totalBonus: oldAdjustment?.totalBonus || 0,
        totalDeduction: oldAdjustment?.totalDeduction || 0,
        notes: oldAdjustment?.notes || "Không điều chỉnh",
        status: "DRAFT",
      });
      const lateness = await p5LateDetails(adjustment);
      const penaltyLevels = new Set(
        [
          adjustment.policyLevelId,
          ...lateness.map((l) => l.policyLevelId),
        ].filter(Boolean),
      );
      for (const levelId of penaltyLevels) {
        const level = await p5Get("PolicyLevel", levelId),
          penaltyPolicy = await p5Get("Policy", level.policyId);
        dependencies.p3Assert(
          penaltyPolicy.type === "PHAT_TRE",
          "INVALID_PENALTY_POLICY",
        );
        policyIds.add(level.policyId);
      }
      const oldCommission = await p5Collections.Commission.findOne({
        periodId: id,
        employeeId: employee.id,
      });
      dependencies.p3Assert(
        !oldSlip?.commissionId || oldSlip.commissionId === oldCommission?.id,
        "COMMISSION_REFERENCE_MISMATCH",
      );
      const c = p5Effect(plan, "Commission", oldCommission, {
        employeeId: employee.id,
        periodId: id,
        ...commission,
        policyVersionId: policy.id,
        status: "DRAFT",
      });
      const employeeRevenue = p5Effect(plan, "EmployeeRevenue", er, {
        employeeId: employee.id,
        periodId: id,
        revenue,
        transactionCount: rows.length,
        commissionId: c.id,
      });
      // Keep P3-generated transaction revenue references stable; never rewrite P3 data.
      dependencies.p3Assert(
        rows.every((t) => t.employeeRevenueId === employeeRevenue.id),
        "REVENUE_REFERENCE_MISMATCH",
      );
      const baseSalary = p5Money(employee.baseSalary);
      const snapshot = p5Effect(plan, "Payslip", oldSlip, {
        periodId: id,
        employeeId: employee.id,
        baseSalary,
        totalRevenue: revenue,
        commissionId: c.id,
        commissionAmount: c.amount,
        adjustmentId: adjustment.id,
        totalBonus: adjustment.totalBonus,
        totalDeductions: adjustment.totalDeduction,
        netPay: p5Net(
          baseSalary,
          c.amount,
          adjustment.totalBonus,
          adjustment.totalDeduction,
        ),
        status: "DRAFT",
        paidAt: null,
        revenueDetails: await p5TransactionDetails(rows),
        lateness,
        calculatedAt: plan.at,
        shiftCount: attendanceCounts.get(employee.id) || 0,
      });
      snapshots.push(snapshot);
    }
    const company = await p5Collections.CompanyRevenue.findOne({
      periodId: id,
    });
    dependencies.p3Assert(
      transactions.every((t) => t.companyRevenueId === company?.id),
      "REVENUE_REFERENCE_MISMATCH",
    );
    const revenue = p5Sum(transactions.map((t) => t.finalFee));
    dependencies.p3Assert(
      p5Sum(snapshots.map((s) => s.totalRevenue)) === revenue,
      "REVENUE_REFERENCE_MISMATCH",
    );
    p5Effect(plan, "CompanyRevenue", company, {
      periodId: id,
      revenue: p5Sum([revenue, company?.forfeitedHoldRevenue || 0]),
      transactionCount: transactions.length,
    });
    return p5Effect(plan, "PayrollPeriod", claimed, {
      status: "CALCULATED",
      calculatedAt: plan.at,
      displayStatus: "DA_TINH",
      policyVersionIds: [...policyIds],
      totals: {
        revenue,
        commission: p5Sum(snapshots.map((s) => s.commissionAmount)),
        netPay: p5Sum(snapshots.map((s) => s.netPay)),
        contractCount: p5ContractCount(transactions),
      },
    });
  }

  async function p5Notice(plan, slip, status) {
    const employee = await p5Get("Employee", slip.employeeId);
    p5Effect(plan, "Notification", null, {
      accountId: employee.accountId,
      type: `PAYSLIP_${status}`,
      title:
        status === "PAID"
          ? "Phiếu lương đã thanh toán"
          : "Phiếu lương đã được duyệt",
      body: `Phiếu ${slip.id}: ${slip.netPay.toLocaleString("vi-VN")} đ.`,
      entityType: "Payslip",
      entityId: slip.id,
      createdAt: plan.at,
      read: false,
      readAt: null,
      dedupeKey: `p5:${slip.id}:${status}`,
    });
  }

  const p5Admin = dependencies.requireRole("ADMIN"),
    p5Employee = dependencies.requireRole("EMPLOYEE");

  async function p5Report(code) {
    const rows = await p5Transactions(code),
      employees = await p5Collections.Employee.find({}).toArray();
    const revenues = await p5Collections.EmployeeRevenue.find({}).toArray();
    const ranked = employees
      .map((e) => {
        const mine = rows.filter(
          (t) =>
            t.employeeId === e.id ||
            revenues.some(
              (r) => r.id === t.employeeRevenueId && r.employeeId === e.id,
            ),
        );
        return {
          employeeId: e.id,
          name: e.fullName,
          revenue: p5Sum(mine.map((t) => t.finalFee)),
          contractCount: p5ContractCount(mine),
        };
      })
      .sort(
        (a, b) =>
          b.revenue - a.revenue || a.employeeId.localeCompare(b.employeeId),
      );
    const period = await p5Collections.PayrollPeriod.findOne({ code });
    const company = period
      ? await p5Collections.CompanyRevenue.findOne({ periodId: period.id })
      : null;
    const slips = period
      ? await p5Collections.Payslip.find({ periodId: period.id }).toArray()
      : [];
    const attendanceCounts = await p5AttendanceCounts(code);
    const adjustments = period
      ? await p5Collections.PayrollAdjustment.find({
          periodId: period.id,
        }).toArray()
      : [];
    const lateDetails = await Promise.all(adjustments.map(p5LateDetails));
    return {
      month: code,
      revenue: p5Sum([
        ...rows.map((t) => t.finalFee),
        company?.forfeitedHoldRevenue || 0,
      ]),
      contractCount: p5ContractCount(rows),
      topEmployees: ranked,
      commission: p5Sum(slips.map((s) => s.commissionAmount)),
      baseSalary: p5Sum(slips.map((s) => s.baseSalary)),
      bonus: p5Sum(slips.map((s) => s.totalBonus || 0)),
      deductions: p5Sum(slips.map((s) => s.totalDeductions)),
      netPay: p5Sum(slips.map((s) => s.netPay)),
      shiftCount: [...attendanceCounts.values()].reduce((a, b) => a + b, 0),
      lateCount: lateDetails.reduce((sum, entries) => sum + entries.length, 0),
    };
  }

  function adminRoomCounts(rooms) {
    const byStatus = {};
    for (const room of rooms) {
      const status = room.businessStatus || room.status;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return {
      total: rooms.length,
      byStatus,
      occupancy: rooms.length
        ? Math.round(((byStatus.RENTED || 0) / rooms.length) * 1000) / 10
        : 0,
    };
  }

  async function adminOccupancy(now = new Date()) {
    const today = new Date(now.getTime() + 7 * 3600000)
      .toISOString()
      .slice(0, 10);
    const [rooms, properties, deposits, contracts, payments] =
      await Promise.all([
        dependencies.roomCollection.find({}).toArray(),
        dependencies.propertyCollection.find({}).toArray(),
        dependencies.p3Collections.Deposit.find({
          status: { $in: ["PAYMENT_PENDING", "PAID", "CONTRACTED"] },
        }).toArray(),
        dependencies.p3Collections.Contract.find({
          status: { $in: ["SIGNED", "COMPLETED"] },
          startDate: { $lte: today },
          endDate: { $gte: today },
        }).toArray(),
        dependencies.p3Collections.Payment.find({
          purpose: "DEPOSIT",
          status: "CONFIRMED",
        }).toArray(),
      ]);
    const currentDeposits = deposits.filter(
      (d) =>
        ["PAYMENT_PENDING", "PAID"].includes(d.status) ||
        contracts.some((c) => c.depositId === d.id),
    );
    const groups = new Map();
    for (const room of rooms) {
      const roomType = room.roomType || room.type || "Chưa phân loại";
      const key = JSON.stringify([room.propertyId, roomType]);
      if (!groups.has(key))
        groups.set(key, {
          propertyId: room.propertyId || "",
          propertyName:
            properties.find((p) => p.id === room.propertyId)?.name ||
            room.propertyId ||
            "Chưa gắn tòa",
          roomType,
          rooms: [],
        });
      groups.get(key).rooms.push(room);
    }
    const rows = [...groups.values()]
      .map((group) => {
        const ids = new Set(group.rooms.map((r) => r.id));
        const mine = currentDeposits.filter((d) => ids.has(d.roomId));
        return {
          propertyId: group.propertyId,
          propertyName: group.propertyName,
          roomType: group.roomType,
          ...adminRoomCounts(group.rooms),
          depositCount: mine.length,
          depositRequired: p5Sum(mine.map((d) => d.totalRequired)),
          depositConfirmed: p5Sum(
            mine.map(
              (d) =>
                (d.holdCredit || 0) +
                (d.collected
                  ? d.collected.amount
                  : p5Sum(
                      payments
                        .filter((p) => p.depositId === d.id)
                        .map((p) => p.amount),
                    )),
            ),
          ),
          contractCount: contracts.filter((c) => ids.has(c.roomId)).length,
        };
      })
      .sort(
        (a, b) =>
          a.propertyName.localeCompare(b.propertyName, "vi") ||
          a.roomType.localeCompare(b.roomType, "vi"),
      );
    return {
      asOf: now.toISOString(),
      date: today,
      ...adminRoomCounts(rooms),
      rows,
      depositCount: currentDeposits.filter((d) =>
        rooms.some((r) => r.id === d.roomId),
      ).length,
      contractCount: contracts.filter((c) =>
        rooms.some((r) => r.id === c.roomId),
      ).length,
    };
  }

  async function initializeP5() {
    for (const type of Object.keys(p5Collections))
      await p5Collections[type].createIndex({ id: 1 }, { unique: true });
    for (const [type, fields] of [
      ["PayrollPeriod", { code: 1 }],
      ["PayrollPeriod", { year: 1, month: 1 }],
      ["Payslip", { employeeId: 1, periodId: 1 }],
      ["Payslip", { adjustmentId: 1 }],
      ["EmployeeRevenue", { employeeId: 1, periodId: 1 }],
      ["CompanyRevenue", { periodId: 1 }],
      ["Commission", { employeeId: 1, periodId: 1 }],
      ["Policy", { type: 1, version: 1 }],
    ]) {
      await p5Collections[type].createIndex(fields, { unique: true });
    }
    for (const type of ["Payslip", "EmployeeRevenue"])
      await p5Collections[type].createIndex(
        { commissionId: 1 },
        {
          unique: true,
          partialFilterExpression: { commissionId: { $type: "string" } },
        },
      );
    await dependencies.auditCollection.createIndex(
      { p5Key: 1 },
      { unique: true, sparse: true },
    );
    await p5Collections.BrokerageTransaction.createIndex({
      status: 1,
      recognizedAt: 1,
    });
    await p5Barrier();
  }

  Object.defineProperties(dependencies, {
    p5Collections: { enumerable: true, get: () => p5Collections },
    p5Clean: { enumerable: true, get: () => p5Clean },
    p5Get: { enumerable: true, get: () => p5Get },
    p5Money: { enumerable: true, get: () => p5Money },
    p5Sum: { enumerable: true, get: () => p5Sum },
    p5Commission: { enumerable: true, get: () => p5Commission },
    p5Net: { enumerable: true, get: () => p5Net },
    p5Mutable: { enumerable: true, get: () => p5Mutable },
    p5MonthBounds: { enumerable: true, get: () => p5MonthBounds },
    p5Levels: { enumerable: true, get: () => p5Levels },
    p5Effect: { enumerable: true, get: () => p5Effect },
    p5Run: { enumerable: true, get: () => p5Run },
    p5Recover: { enumerable: true, get: () => p5Recover },
    p5Barrier: { enumerable: true, get: () => p5Barrier },
    p5Execute: { enumerable: true, get: () => p5Execute },
    p5Route: { enumerable: true, get: () => p5Route },
    p5Policy: { enumerable: true, get: () => p5Policy },
    p5Transactions: { enumerable: true, get: () => p5Transactions },
    p5ContractCount: { enumerable: true, get: () => p5ContractCount },
    p5AttendanceCounts: { enumerable: true, get: () => p5AttendanceCounts },
    p5TransactionDetails: { enumerable: true, get: () => p5TransactionDetails },
    p5LateDetails: { enumerable: true, get: () => p5LateDetails },
    p5SlipView: { enumerable: true, get: () => p5SlipView },
    p5Calculate: { enumerable: true, get: () => p5Calculate },
    p5Notice: { enumerable: true, get: () => p5Notice },
    p5Admin: { enumerable: true, get: () => p5Admin },
    p5Employee: { enumerable: true, get: () => p5Employee },
    p5Report: { enumerable: true, get: () => p5Report },
    adminRoomCounts: { enumerable: true, get: () => adminRoomCounts },
    adminOccupancy: { enumerable: true, get: () => adminOccupancy },
    initializeP5: { enumerable: true, get: () => initializeP5 },
  });
}
module.exports = { createPayrollService };
