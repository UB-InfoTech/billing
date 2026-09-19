//using
const mongoose = require('mongoose');

const ewayAuthTokenSchema = new mongoose.Schema({
  token: { type: String, default:"123" ,required: true },
  tokenExp: { type: Date, required: true  },
  createdBy: { type: String  }
}, { timestamps: true });

module.exports = mongoose.model('EwayAuthToken', ewayAuthTokenSchema);
