const mongoose = require("mongoose");

const creditNoteCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "CreditNoteCounter",
  creditNoteCounterSchema,
  "credit_note_counters"
);
