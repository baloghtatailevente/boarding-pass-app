const mongoose = require('mongoose');

const boardingPassSchema = new mongoose.Schema({
  airline: String,
  flightNumber: String,
  destination: String,
  connection: String,
  seat: String,
  qr: String,
  barcode: String
}, { timestamps: true });

module.exports = mongoose.model('BoardingPass', boardingPassSchema);
