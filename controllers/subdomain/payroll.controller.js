import Compensation from '../../models/tenant/compensation.model.js';
import DeductionRule from '../../models/tenant/deductionRule.model.js';
import SalarySlip from '../../models/tenant/salarySlip.model.js';
import PayrollRun from '../../models/tenant/payrollRun.model.js';
import MonthlyAttendance from '../../models/tenant/monthlyAttendance.model.js';
import AttendanceConfig from '../../models/tenant/attendanceConfig.model.js';
import { successResponse } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/errorClasses.js';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import TenantUser from '../../models/tenant/auth.model.js';

const computeWorkingDays = (year, month, cfg) => {
  const wd = cfg?.workingDays || { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false };
  const rules = cfg?.weekdayRules || { monday: { rule: 'all' }, tuesday: { rule: 'all' }, wednesday: { rule: 'all' }, thursday: { rule: 'all' }, friday: { rule: 'all' }, saturday: { rule: 'none' }, sunday: { rule: 'none' } };
  const map = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  let d = new Date(Date.UTC(year, month - 1, 1)), c = 0;
  while (d.getUTCMonth() === month - 1) {
    const k = map[d.getUTCDay()];
    if (wd[k]) {
      const r = rules[k]?.rule || 'all';
      const i = d.getUTCDate() % 2 === 1;
      if (r === 'all' || (r === 'odd' && i) || (r === 'even' && !i)) c++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return c;
};

const suggestDeductionsForSalary = async (organizationId, baseSalary) => {
  const rules = await DeductionRule.find({ organizationId, active: true }).lean();
  return rules.flatMap(r => {
    const t = (r.tiers || []).find(x => baseSalary >= (x.minSalary || 0) && (x.maxSalary == null || baseSalary <= x.maxSalary));
    if (!t) return [];
    let amt = t.type === 'percent' ? (t.value / 100) * baseSalary : t.value;
    if (t.capAmount != null) amt = Math.min(amt, t.capAmount);
    return [{ code: r.code, label: r.label, type: t.type, amount: Math.round(amt) }];
  });
};

export const getCompensation = async (req, res, next) => {
  try {
    const comp = await Compensation.findOne({ organizationId: req.organization?._id, userId: req.params.userId }).lean();
    return successResponse(res, 200, 'Compensation fetched', comp || {});
  } catch (e) { next(e); }
};

export const upsertCompensation = async (req, res, next) => {
  try {
    const { userId } = req.params; const org = req.organization?._id; const by = req.user?._id;
    const { baseSalary, allowances = [], variableComponents = [], deductionOverrides = [], effectiveFrom } = req.body || {};
    if (!org || !by || !userId) throw new ApiError('Context missing', 400);
    if (baseSalary == null || Number(baseSalary) < 0) throw new ApiError('baseSalary required', 422);
    const comp = await Compensation.findOneAndUpdate(
      { organizationId: org, userId },
      { $set: { organizationId: org, userId, baseSalary: Number(baseSalary), allowances, variableComponents, deductionOverrides, effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(), updatedBy: by }, $setOnInsert: { createdBy: by } },
      { upsert: true, new: true }
    );
    return successResponse(res, 200, 'Compensation saved', comp);
  } catch (e) { next(e); }
};

export const listDeductionRules = async (req, res, next) => {
  try { const rules = await DeductionRule.find({ organizationId: req.organization?._id }).lean(); return successResponse(res, 200, 'Deduction rules', rules);
  } catch (e) { next(e); }
};

export const upsertDeductionRule = async (req, res, next) => {
  try {
    const org = req.organization?._id; const by = req.user?._id; const { code, label, active = true, isDefault = false, tiers = [] } = req.body || {};
    if (!org || !by) throw new ApiError('Context missing', 400);
    if (!code || !label) throw new ApiError('code and label required', 422);
    const doc = await DeductionRule.findOneAndUpdate(
      { organizationId: org, code: String(code).toLowerCase().trim() },
      { $set: { label, active: !!active, isDefault: !!isDefault, tiers, updatedBy: by }, $setOnInsert: { createdBy: by } },
      { upsert: true, new: true }
    );
    return successResponse(res, 200, 'Deduction rule saved', doc);
  } catch (e) { next(e); }
};

export const deleteDeductionRule = async (req, res, next) => {
  try { await DeductionRule.deleteOne({ organizationId: req.organization?._id, code: req.params.code }); return successResponse(res, 200, 'Deduction rule deleted', { code: req.params.code });
  } catch (e) { next(e); }
};

export const getDeductionSuggestions = async (req, res, next) => {
  try { const s = await suggestDeductionsForSalary(req.organization?._id, Number(req.query.salary || 0)); return successResponse(res, 200, 'Deduction suggestions', s);
  } catch (e) { next(e); }
};

export const generateSalarySlip = async (req, res, next) => {
  try {
    const org = req.organization?._id; const by = req.user?._id; let { userId, year, month } = req.body || {}; year = Number(year); month = Number(month);
    if (!org || !by || !userId || !year || !month) throw new ApiError('userId, year, month required', 422);
    const comp = await Compensation.findOne({ organizationId: org, userId }); if (!comp) throw new ApiError('Compensation not set for user', 404);
    const cfg = await AttendanceConfig.findOne({ organizationId: org }).lean(); const w = computeWorkingDays(year, month, cfg);
    const ma = await MonthlyAttendance.findOne({ organizationId: org, userId, year, month }).lean();
    let present = 0, half = 0, leave = 0, absent = 0, mins = 0;
    if (ma?.days && Object.keys(ma.days).length > 0) {
      for (const d of Object.values(ma.days)) {
        if (!d?.workingDay) continue;
        mins += Number(d?.workedMinutes || 0);
        if (d?.isPresent) present++;
        else if (d?.isHalfDay) half++;
        else if (d?.isLeaveApproved) leave++;
        else absent++;
      }
    } else {
      // No attendance recorded: default to full payable for the period
      present = w;
      half = 0;
      leave = 0;
      absent = 0;
      mins = 0;
    }
    const payable = present + (half * 0.5) + leave; const ratio = w > 0 ? Math.min(1, Math.max(0, payable / w)) : 1;
    const basePay = Math.round((comp.baseSalary || 0) * ratio);

    // Compute amounts for earnings (allowances, variableComponents)
    const computeAmount = (entry) => {
      const type = entry?.type || 'fixed';
      const val = Number(entry?.value ?? entry?.amount ?? 0);
      return Math.round(type === 'percent' ? (val / 100) * basePay : val);
    };

    const allowanceItems = (comp.allowances || []).map(a => ({
      code: a.code,
      label: a.label,
      type: 'earning',
      amount: computeAmount(a)
    }));

    const variableItems = (comp.variableComponents || []).map(a => ({
      code: a.code,
      label: a.label,
      type: 'earning',
      amount: computeAmount(a)
    }));

    // Compute deductions from overrides (percent or fixed, optional cap)
    const deductionItems = (comp.deductionOverrides || [])
      .filter(d => d.apply !== false)
      .map(d => {
        const val = Number(d?.value ?? 0);
        let amt = Math.round((d?.type === 'percent') ? (val / 100) * basePay : val);
        if (d?.capAmount != null) amt = Math.min(amt, Number(d.capAmount));
        return { code: d.code, label: d.label, type: 'deduction', amount: amt };
      });

    const gross = basePay + allowanceItems.reduce((s, a) => s + (a.amount || 0), 0) + variableItems.reduce((s, a) => s + (a.amount || 0), 0);
    const totalDed = deductionItems.reduce((s, d) => s + (Math.abs(d.amount) || 0), 0);
    const net = Math.max(0, gross - totalDed);

    const items = [
      { code: 'base', label: 'Base (prorated)', type: 'earning', amount: basePay },
      ...allowanceItems,
      ...variableItems,
      ...deductionItems
    ];

    const slip = await SalarySlip.findOneAndUpdate(
      { organizationId: org, userId, year, month },
      { $set: { status: 'draft', lineItems: items, grossAmount: gross, totalDeductions: totalDed, netPay: net, attendanceSummary: { workingDays: w, presentDays: present, halfDays: half, paidLeaveDays: leave, absentDays: absent, workedMinutesTotal: mins }, updatedBy: by }, $setOnInsert: { createdBy: by } },
      { upsert: true, new: true }
    );
    const run = await PayrollRun.findOneAndUpdate({ organizationId: org, year, month }, { $set: { status: 'draft', updatedBy: by }, $setOnInsert: { createdBy: by } }, { upsert: true, new: true });
    if (!run.slipIds.map(x => String(x)).includes(String(slip._id))) { run.slipIds.push(slip._id); run.totalEmployees = run.slipIds.length; await run.save(); }
    return successResponse(res, 200, 'Salary slip generated (draft)', slip);
  } catch (e) { next(e); }
};

export const getSalarySlip = async (req, res, next) => {
  try { const { userId, year, month } = req.params; const slip = await SalarySlip.findOne({ organizationId: req.organization?._id, userId, year: Number(year), month: Number(month) }).lean(); if (!slip) throw new ApiError('Slip not found', 404); return successResponse(res, 200, 'Salary slip', slip);
  } catch (e) { next(e); }
};

export const updateSalarySlip = async (req, res, next) => {
  try {
    const { userId, year, month } = req.params; const org = req.organization?._id; const by = req.user?._id;
    const slip = await SalarySlip.findOne({ organizationId: org, userId, year: Number(year), month: Number(month) }); if (!slip) throw new ApiError('Slip not found', 404); if (slip.status !== 'draft') throw new ApiError('Only draft slips can be edited', 400);
    const { lineItems, notes, attendanceSummary, paidDays, lopDays, payDate } = req.body || {};

    // Update line items
    if (Array.isArray(lineItems)) {
      slip.lineItems = lineItems.map(li => ({ code: String(li.code || '').trim(), label: String(li.label || '').trim(), type: li.type === 'deduction' ? 'deduction' : (li.type === 'adjustment' ? 'adjustment' : 'earning'), amount: Number(li.amount) || 0 }));
    }

    // Update notes
    slip.notes = notes || slip.notes;

    // Update pay date
    if (payDate) {
      const d = new Date(payDate);
      if (!isNaN(d.getTime())) slip.payDate = d;
    }

    // Attendance overrides
    if (attendanceSummary && typeof attendanceSummary === 'object') {
      slip.attendanceSummary = {
        ...slip.attendanceSummary,
        workingDays: Number(attendanceSummary.workingDays ?? slip.attendanceSummary?.workingDays ?? 0),
        presentDays: Number(attendanceSummary.presentDays ?? slip.attendanceSummary?.presentDays ?? 0),
        halfDays: Number(attendanceSummary.halfDays ?? slip.attendanceSummary?.halfDays ?? 0),
        paidLeaveDays: Number(attendanceSummary.paidLeaveDays ?? slip.attendanceSummary?.paidLeaveDays ?? 0),
        unpaidLeaveDays: Number(attendanceSummary.unpaidLeaveDays ?? slip.attendanceSummary?.unpaidLeaveDays ?? 0),
        absentDays: Number(attendanceSummary.absentDays ?? slip.attendanceSummary?.absentDays ?? 0),
        workedMinutesTotal: Number(attendanceSummary.workedMinutesTotal ?? slip.attendanceSummary?.workedMinutesTotal ?? 0),
      };
    } else if (paidDays != null || lopDays != null) {
      // Simplified override using paidDays and lopDays
      const cfg = await AttendanceConfig.findOne({ organizationId: org }).lean();
      const w = computeWorkingDays(Number(year), Number(month), cfg);
      const pd = Number(paidDays ?? (slip.attendanceSummary?.presentDays || 0) + (slip.attendanceSummary?.halfDays || 0) * 0.5 + (slip.attendanceSummary?.paidLeaveDays || 0));
      const ld = Number(lopDays ?? slip.attendanceSummary?.unpaidLeaveDays ?? 0);
      slip.attendanceSummary = {
        ...slip.attendanceSummary,
        workingDays: w,
        presentDays: pd, // aggregate value stored in presentDays for simplicity
        halfDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: ld,
        absentDays: Math.max(0, w - Math.round(pd) - Math.round(ld)),
        workedMinutesTotal: slip.attendanceSummary?.workedMinutesTotal || 0,
      };
    }

    // Recompute base line item from attendance overrides if available
    const a = slip.attendanceSummary || {};
    const payableUnits = Number(a.presentDays || 0) + (Number(a.halfDays || 0) * 0.5) + Number(a.paidLeaveDays || 0);
    const workingUnits = Number(a.workingDays || 0) || 0;
    let ratio = workingUnits > 0 ? Math.min(1, Math.max(0, payableUnits / workingUnits)) : null;
    if (ratio != null) {
      const comp = await Compensation.findOne({ organizationId: org, userId });
      if (comp && comp.baseSalary != null) {
        const newBase = Math.round(Number(comp.baseSalary) * ratio);
        let foundBase = false;
        slip.lineItems = (slip.lineItems || []).map(li => {
          if (!foundBase && (li.code === 'base' || /base/i.test(li.label))) {
            foundBase = true;
            return { ...li, amount: newBase, type: 'earning' };
          }
          return li;
        });
        if (!foundBase) {
          slip.lineItems.unshift({ code: 'base', label: 'Base (prorated)', type: 'earning', amount: newBase });
        }
      }
    }

    // Recalc totals
    const gross = slip.lineItems.filter(li => li.type === 'earning' || (li.type === 'adjustment' && li.amount > 0)).reduce((s, li) => s + (Number(li.amount) || 0), 0);
    const ded = slip.lineItems.filter(li => li.type === 'deduction' || (li.type === 'adjustment' && li.amount < 0)).reduce((s, li) => s + Math.abs(Number(li.amount) || 0), 0);
    slip.grossAmount = gross; slip.totalDeductions = ded; slip.netPay = Math.max(0, gross - ded); slip.updatedBy = by; await slip.save();
    return successResponse(res, 200, 'Slip updated', slip);
  } catch (e) { next(e); }
};

export const finalizeSalarySlip = async (req, res, next) => {
  try {
    const { userId, year, month } = req.params; const org = req.organization?._id; const by = req.user?._id;
    const slip = await SalarySlip.findOne({ organizationId: org, userId, year: Number(year), month: Number(month) }); if (!slip) throw new ApiError('Slip not found', 404); if (slip.status !== 'draft') throw new ApiError('Only draft slips can be finalized', 400);
    slip.status = 'finalized'; slip.updatedBy = by; await slip.save();
    const run = await PayrollRun.findOneAndUpdate({ organizationId: org, year: Number(year), month: Number(month) }, { $set: { status: 'draft' } }, { upsert: true, new: true });
    run.finalizedCount = await SalarySlip.countDocuments({ organizationId: org, year: Number(year), month: Number(month), status: 'finalized' });
    run.totalEmployees = await SalarySlip.countDocuments({ organizationId: org, year: Number(year), month: Number(month) });
    await run.save();
    return successResponse(res, 200, 'Slip finalized', slip);
  } catch (e) { next(e); }
};

// Helper to ensure directory exists
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

export const generateSalarySlipPDF = async (req, res, next) => {
  try {
    const organizationId = req.organization?._id;
    const orgDoc = req.organization || {};
    const { userId, year, month } = req.params;

    const slip = await SalarySlip.findOne({
      organizationId: organizationId,
      userId,
      year: Number(year),
      month: Number(month)
    }).lean();

    if (!slip) throw new ApiError('Slip not found', 404);
    const userDoc = await TenantUser.findOne({ _id: userId, organization: organizationId }).lean();

    // File setup
    const uploadsBase = path.join(process.cwd(), 'uploads');
    const outDir = path.join(uploadsBase, 'payroll', String(organizationId), 'slips');
    ensureDir(outDir);
    const filename = `${year}-${month}-${userId}.pdf`;
    const outPath = path.join(outDir, filename);

    // Helpers
    const formatINR = (num) => {
      if (num === undefined || num === null || Number.isNaN(Number(num))) return 'Rs.0.00';
      const formatted = Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `Rs.${formatted}`;
    };

    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' });
    const safeText = (v, fallback = '-') => (v ? String(v) : fallback);

    const earnings = (slip.lineItems || []).filter((li) => li.type === 'earning');
    const deductions = (slip.lineItems || []).filter((li) => li.type === 'deduction');
    const grossAmount = slip.grossAmount ?? earnings.reduce((a, b) => a + Number(b.amount || 0), 0);
    const totalDeductions = slip.totalDeductions ?? deductions.reduce((a, b) => a + Number(b.amount || 0), 0);
    const netPay = slip.netPay ?? Number(grossAmount) - Number(totalDeductions);

    // Amount in words (simple; crores/lakhs/thousands)
    const toWords = (num) => {
      const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      const two = (n) => n < 20 ? ones[n] : `${tens[Math.floor(n/10)]}${n%10?`-${ones[n%10]}`:''}`;
      const three = (n) => {
        const h = Math.floor(n/100), r = n%100; return h?`${ones[h]} Hundred${r?` ${two(r)}`:''}`:two(r);
      };
      if (num === 0) return 'Zero';
      let n = Math.floor(Math.abs(Number(num)));
      const parts = [];
      const units = [
        { v: 10000000, name: 'Crore' },
        { v: 100000, name: 'Lakh' },
        { v: 1000, name: 'Thousand' },
        { v: 100, name: 'Hundred' }
      ];
      for (const u of units) {
        if (n >= u.v) { const q = Math.floor(n / u.v); parts.push(`${three(q)} ${u.name}`); n = n % u.v; }
      }
      if (n > 0 && n < 100) parts.push(two(n));
      else if (n >= 100) parts.push(three(n));
      return parts.join(' ');
    };

    // PDF creation
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const pageWidth = doc.page.width;
    const startX = doc.page.margins.left;
    let y = 36; // start below margin

    // Header: org name + address, month on right
    const orgName = safeText(orgDoc.name, 'Organization');
    const addrObj = orgDoc.address || {};
    const addressLine = [addrObj.city, addrObj.state, addrObj.country].filter(Boolean).join(' ');

    // Optional top separator
    doc.moveTo(startX, y).lineTo(pageWidth - startX, y).strokeColor('#e5e7eb').stroke();
    y += 10;

    // Organization section
    doc.fontSize(18).fillColor('#111827').text(orgName, startX, y, { continued: false });
    y += 22;
    doc.fontSize(10).fillColor('#6b7280').text(addressLine || '-', startX, y);

    // Right title
    const title = `Payslip For the Month\n${monthName} ${year}`;
    doc.fontSize(10).fillColor('#6b7280').text('Payslip For the Month', pageWidth - 250, 36, { width: 220, align: 'right' });
    doc.fontSize(14).fillColor('#111827').text(`${monthName} ${year}`, pageWidth - 250, 52, { width: 220, align: 'right' });

    y += 24;
    doc.moveTo(startX, y).lineTo(pageWidth - startX, y).strokeColor('#e5e7eb').stroke();
    y += 20;

    // Employee summary left + Net pay card right
    const leftBoxWidth = (pageWidth - startX * 2) - 220;
    doc.fontSize(11).fillColor('#111827').text('EMPLOYEE SUMMARY', startX, y);
    y += 12;
    const row = (label, value) => {
      doc.fontSize(10).fillColor('#374151').text(label, startX, y, { width: 120 });
      doc.text(':', startX + 124, y);
      doc.fillColor('#111827').text(value, startX + 136, y, { width: leftBoxWidth - 136 });
      y += 16;
    };
    const employeeName = safeText(
      ((userDoc?.firstName || '') + (userDoc?.lastName ? ` ${userDoc.lastName}` : '')).trim(),
      userId
    );
    const payDateText = slip.payDate ? new Date(slip.payDate).toLocaleDateString('en-GB') : '-';
    row('Employee Name', employeeName.toUpperCase());
    row('Employee Code', safeText(userDoc?.employeeId, '-'));
    row('Department', safeText(userDoc?.department, '-'));
    row('Designation', safeText(userDoc?.position, '-'));
    row('Pay Period', `${monthName} ${year}`);
    row('Pay Date', payDateText);

    // Net pay card
    const cardX = pageWidth - startX - 200;
    const cardY = 110;
    doc.roundedRect(cardX, cardY, 200, 80, 8).fillAndStroke('#e8f5e9', '#d1fae5');
    doc.fillColor('#16a34a').fontSize(18).text(formatINR(netPay), cardX + 16, cardY + 20, { width: 168, align: 'left' });
    doc.fillColor('#374151').fontSize(10).text('Total Net Pay', cardX + 16, cardY + 48);

    // Identity and attendance sections
    const drawInfoSection = (titleText, pairs) => {
      const boxW = leftBoxWidth;
      const boxH = 36 + pairs.length * 16 + 12;
      const boxY = y;
      doc.roundedRect(startX, boxY, boxW, boxH, 8).strokeColor('#d1d5db').stroke();
      doc.fontSize(11).fillColor('#111827').text(titleText, startX + 12, boxY + 10);
      doc.moveTo(startX + 12, boxY + 28).lineTo(startX + boxW - 12, boxY + 28).strokeColor('#e5e7eb').stroke();
      let ly = boxY + 36;
      pairs.forEach(([label, value]) => {
        doc.fontSize(10).fillColor('#374151').text(label, startX + 12, ly, { width: 140 });
        doc.fontSize(10).fillColor('#111827').text(safeText(value), startX + 160, ly, { width: boxW - 172 });
        ly += 16;
      });
      y += boxH + 8;
    };

    // const identityPairs = [
    //   ['Date of Joining', userDoc?.dateOfJoining ? new Date(userDoc.dateOfJoining).toLocaleDateString('en-GB') : '-'],
    //   ['Gender', userDoc?.gender],
    //   ['PAN No', userDoc?.panNumber],
    //   ['Aadhaar No', userDoc?.aadhaarNumber],
    //   ['UAN No', userDoc?.uanNumber],
    //   ['ESIC IP No', userDoc?.esicIpNumber],
    //   ['Bank A/C No', userDoc?.bankAccountNumber],
    //   ['IFSC Code', userDoc?.ifscCode]
    // ];
    // drawInfoSection('IDENTITY DETAILS', identityPairs);

    // const a = slip.attendanceSummary || {};
    // const payableDays = Number(a.presentDays || 0) + Number(a.halfDays || 0) * 0.5 + Number(a.paidLeaveDays || 0);
    // const workedHours = Math.round(Number(a.workedMinutesTotal || 0) / 60);
    // const attendancePairs = [
    //   ['Working Days', a.workingDays ?? '-'],
    //   ['Present Days', a.presentDays ?? '-'],
    //   ['Half Days', a.halfDays ?? '-'],
    //   ['Paid Leave Days', a.paidLeaveDays ?? '-'],
    //   ['Unpaid Leave Days', a.unpaidLeaveDays ?? '0'],
    //   ['Absent Days', a.absentDays ?? '-'],
    //   ['Payable Days', payableDays],
    //   ['Worked Hours', workedHours]
    // ];
    // drawInfoSection('ATTENDANCE SUMMARY', attendancePairs);

    y = Math.max(y, cardY + 100) + 8;

    // Earnings vs Deductions table
    y = Math.max(y, cardY + 100) + 8;
    const tableWidth = pageWidth - startX * 2;
    const colWidth = (tableWidth - 20) / 2; // gap 20 between tables

    const drawTable = (titleText, items, amountRight = true) => {
      const boxH = 140 + Math.max(0, (items.length - 3) * 18);
      const boxY = y;
      const boxW = colWidth;
      const x = titleText === 'EARNINGS' ? startX : startX + colWidth + 20;
      doc.roundedRect(x, boxY, boxW, boxH, 8).strokeColor('#d1d5db').stroke();
      doc.fontSize(11).fillColor('#111827').text(titleText, x + 12, boxY + 10);
      doc.moveTo(x + 12, boxY + 28).lineTo(x + boxW - 12, boxY + 28).strokeColor('#e5e7eb').stroke();
      let ly = boxY + 36;
      items.forEach((it) => {
        doc.fontSize(10).fillColor('#111827').text(safeText(it.label, '-'), x + 12, ly, { width: boxW - 120 });
        doc.fontSize(10).fillColor('#111827').text(formatINR(it.amount || 0), x + boxW - 12 - 100, ly, { width: 100, align: 'right' });
        ly += 18;
      });
      // Total row
      doc.fontSize(10).fillColor('#374151').text(
        titleText === 'EARNINGS' ? 'Gross Earnings' : 'Total Deductions',
        x + 12,
        ly + 8,
        { width: boxW - 120 }
      );
      const totalVal = titleText === 'EARNINGS' ? grossAmount : totalDeductions;
      doc.fontSize(10).fillColor('#111827').text(formatINR(totalVal), x + boxW - 12 - 100, ly + 8, { width: 100, align: 'right' });
      return boxH;
    };

    const h1 = drawTable('EARNINGS', earnings);
    const h2 = drawTable('DEDUCTIONS', deductions);
    y += Math.max(h1, h2) + 16;

    // Net payable bar
    const barH = 46; const barX = startX; const barW = tableWidth;
    doc.roundedRect(barX, y, barW, barH, 8).strokeColor('#d1d5db').stroke();
    doc.fontSize(11).fillColor('#111827').text('TOTAL NET PAYABLE', barX + 12, y + 10);
    doc.fontSize(10).fillColor('#6b7280').text('Gross Earnings - Total Deductions', barX + 12, y + 26);
    doc.roundedRect(barX + barW - 180, y, 180, barH, 8).fill('#e8f5e9');
    doc.fillColor('#16a34a').fontSize(12).text(formatINR(netPay), barX + barW - 180 + 16, y + 14, { width: 148, align: 'right' });
    y += barH + 16;

    // Amount in words
    const words = toWords(Math.round(netPay));
    doc.fontSize(10).fillColor('#6b7280').text(`Amount In Words : Indian Rupee ${words} Only`, startX, y);
    y += 24;

    // Footer note
    doc.moveTo(startX, y).lineTo(pageWidth - startX, y).strokeColor('#e5e7eb').stroke();
    y += 18;
    doc.fontSize(9).fillColor('#6b7280').text('-- This is a system-generated document. --', startX, y, { width: tableWidth, align: 'center' });

    doc.end();
    await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });

    const url = `${req.protocol}://${req.get('host')}/uploads/payroll/${String(organizationId)}/slips/${filename}`;
    return successResponse(res, 200, 'Salary slip PDF generated', { url });
  } catch (e) {
    next(e);
  }
};

export const getSalarySlipPDF = async (req, res, next) => {
  try {
    const org = req.organization?._id; const { userId, year, month } = req.params;
    const uploadsBase = path.join(process.cwd(), 'uploads');
    const outDir = path.join(uploadsBase, 'payroll', String(org), 'slips');
    const filename = `${year}-${month}-${userId}.pdf`;
    const outPath = path.join(outDir, filename);
    if (!fs.existsSync(outPath)) throw new ApiError('PDF not found', 404);
    const url = `${req.protocol}://${req.get('host')}/uploads/payroll/${String(org)}/slips/${filename}`;
    return successResponse(res, 200, 'Salary slip PDF', { url });
  } catch (e) { next(e); }
};
