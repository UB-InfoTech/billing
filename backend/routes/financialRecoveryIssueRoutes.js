const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const FinancialRecoveryIssue = require("../models/FinancialRecoveryIssue");

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

    const issue = await FinancialRecoveryIssue.findOneAndUpdate(
      { _id: req.params.id, createdBy, status: "Open" },
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
