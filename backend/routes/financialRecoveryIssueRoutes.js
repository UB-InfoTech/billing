const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const FinancialRecoveryIssue = require("../models/FinancialRecoveryIssue");
const Client = require("../models/Client");
const { syncClientData } = require("../utils/syncClientData");

const router = express.Router();
const ownerId = req => req.user?._id || req.user?.id || req.user?.userId;

router.get("/", auth, async (req, res) => {
  try {
    const createdBy = ownerId(req);
    if (!mongoose.isValidObjectId(createdBy)) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const requestedStatus = String(req.query.status || "Open");
    if (!["Open", "Resolved", "All"].includes(requestedStatus)) {
      return res.status(400).json({ message: "Status must be Open, Resolved, or All." });
    }

    const page = Math.max(1, Math.floor(Number(req.query.page || 1)) || 1);
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit || 25)) || 25));
    const filter = { createdBy };
    if (requestedStatus !== "All") filter.status = requestedStatus;

    const [issues, total] = await Promise.all([
      FinancialRecoveryIssue.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FinancialRecoveryIssue.countDocuments(filter)
    ]);

    return res.json({
      issues,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    console.error("Financial recovery issue list error:", error);
    return res.status(500).json({ message: "Unable to load financial recovery issues." });
  }
});


router.post("/:id/retry-customer-sync", auth, async (req, res) => {
  try {
    const createdBy = ownerId(req);
    if (!mongoose.isValidObjectId(createdBy)) {
      return res.status(401).json({ message: "Authentication required." });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid recovery issue ID." });
    }

    const issue = await FinancialRecoveryIssue.findOne({
      _id: req.params.id,
      createdBy,
      status: "Open",
      operation: "customer-summary-sync"
    }).lean();

    if (!issue) {
      const existing = await FinancialRecoveryIssue.findOne({ _id: req.params.id, createdBy })
        .select("status operation")
        .lean();
      if (!existing) return res.status(404).json({ message: "Recovery issue not found." });
      if (existing.operation !== "customer-summary-sync") {
        return res.status(409).json({ message: "This recovery issue does not support an automatic customer totals refresh." });
      }
      if (existing.status === "Resolved") {
        return res.status(409).json({ message: "This customer totals issue has already been resolved." });
      }
      return res.status(409).json({ message: "This customer totals issue is no longer available for refresh." });
    }

    const clientIds = [...new Set((issue.clientIds || []).map(id => String(id)))]
      .filter(mongoose.isValidObjectId);
    if (!clientIds.length) {
      return res.status(409).json({ message: "This issue has no valid customer reference. Keep it open for manual review." });
    }

    const clients = await Client.find({ _id: { $in: clientIds }, createdBy }).select("_id").lean();
    if (clients.length !== clientIds.length) {
      return res.status(409).json({ message: "One or more linked customers are unavailable in this business account. Keep this issue open for manual review." });
    }

    let failedClientId = "";
    try {
      for (const client of clients) {
        failedClientId = String(client._id);
        const refreshed = await syncClientData(client._id);
        if (!refreshed) throw new Error("The customer record could not be refreshed.");
      }
    } catch (refreshError) {
      const message = String(refreshError?.message || "Customer totals refresh failed.").slice(0, 1000);
      try {
        await FinancialRecoveryIssue.updateOne(
          { _id: issue._id, createdBy, status: "Open" },
          {
            $set: {
              originalError: message,
              recoveryFailures: [{
                step: "refresh-customer-financial-summary",
                entityType: "client",
                entityId: failedClientId,
                message
              }]
            }
          }
        );
      } catch (recordError) {
        console.error("Unable to update customer-summary recovery attempt:", recordError);
      }
      console.error("Customer totals recovery retry failed:", refreshError);
      return res.status(503).json({
        message: "Customer totals could not be refreshed yet. The issue remains open, and no saved invoice or payment was changed."
      });
    }

    const resolutionNote = "Customer financial totals were successfully rebuilt from the saved invoices and posted Credit Notes.";
    const resolvedIssue = await FinancialRecoveryIssue.findOneAndUpdate(
      { _id: issue._id, createdBy, status: "Open", operation: "customer-summary-sync" },
      {
        $set: {
          status: "Resolved",
          resolutionNote,
          resolvedAt: new Date(),
          resolvedBy: createdBy
        }
      },
      { new: true, runValidators: true }
    ).lean();

    if (resolvedIssue) {
      return res.json({ message: "Customer totals refreshed and the recovery issue was resolved.", issue: resolvedIssue });
    }

    const currentIssue = await FinancialRecoveryIssue.findOne({ _id: issue._id, createdBy }).lean();
    if (currentIssue?.status === "Resolved") {
      return res.json({ message: "Customer totals were refreshed; this issue is already resolved.", issue: currentIssue });
    }
    return res.status(409).json({ message: "The recovery issue changed while customer totals were being refreshed. Review it again." });
  } catch (error) {
    console.error("Customer totals recovery retry error:", error);
    return res.status(500).json({ message: "Unable to refresh customer totals right now." });
  }
});

router.patch("/:id/resolve", auth, async (req, res) => {
  try {
    const createdBy = ownerId(req);
    if (!mongoose.isValidObjectId(createdBy)) {
      return res.status(401).json({ message: "Authentication required." });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid recovery issue ID." });
    }

    const resolutionNote = String(req.body?.resolutionNote || "").trim();
    if (resolutionNote.length < 10 || resolutionNote.length > 1000) {
      return res.status(400).json({ message: "Describe the reconciliation completed (10–1000 characters)." });
    }

    const openIssue = await FinancialRecoveryIssue.findOne({ _id: req.params.id, createdBy, status: "Open" })
      .select("operation")
      .lean();
    if (openIssue?.operation === "customer-summary-sync") {
      return res.status(409).json({ message: "Use Refresh customer totals to rebuild this summary before closing the issue." });
    }

    const issue = await FinancialRecoveryIssue.findOneAndUpdate(
      { _id: req.params.id, createdBy, status: "Open", operation: { $ne: "customer-summary-sync" } },
      {
        $set: {
          status: "Resolved",
          resolutionNote,
          resolvedAt: new Date(),
          resolvedBy: createdBy
        }
      },
      { new: true, runValidators: true }
    ).lean();

    if (issue) return res.json({ message: "Recovery issue marked resolved.", issue });

    const existing = await FinancialRecoveryIssue.findOne({ _id: req.params.id, createdBy })
      .select("status")
      .lean();
    if (!existing) return res.status(404).json({ message: "Recovery issue not found." });
    return res.status(409).json({ message: "This recovery issue has already been resolved." });
  } catch (error) {
    console.error("Financial recovery issue resolution error:", error);
    return res.status(500).json({ message: "Unable to resolve the financial recovery issue." });
  }
});

module.exports = router;
