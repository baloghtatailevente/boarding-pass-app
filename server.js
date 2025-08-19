const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const bwipjs = require('bwip-js');
const path = require('path');
const BoardingPass = require('./models/BoardingPass');

require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB sikeresen csatlakozott!'))
.catch(err => console.error('❌ MongoDB csatlakozási hiba:', err));

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Random flight number generator
function generateFlightNumber(airline) {
  const num = Math.floor(Math.random() * 9000) + 1000;
  return airline.slice(0, 2).toUpperCase() + num;
}

// Airlines and destinations
const airlines = ['Lufthansa', 'KLM', 'Turkish Airlines', 'Qatar Airways', 'Emirates'];
const destinations = [
  { name: 'Budapest Liszt Ferenc Nemzetközi', code: 'BUD' },
  { name: 'London Heathrow', code: 'LHR' },
  { name: 'Paris Charles de Gaulle', code: 'CDG' },
  { name: 'Dubai International', code: 'DXB' },
  { name: 'Frankfurt am Main', code: 'FRA' },
  { name: 'Amsterdam Schiphol', code: 'AMS' }
];

// Helper to send email
async function sendBoardingPassEmail(to, pass, fromAirport, toAirport) {
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(pass._id.toString())}&size=200`;

  const barcode = await new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid: 'code128',
      text: pass._id.toString(),
      scale: 3,
      height: 10,
      includetext: false
    }, (err, png) => {
      if (err) reject(err);
      else resolve('data:image/png;base64,' + png.toString('base64'));
    });
  });

  pass.qr = qrUrl;
  pass.barcode = barcode;
  await pass.save();

  const html = `
  <div style="font-family: Arial, sans-serif; background-color:#f7f9fc; padding:20px;">
    <div style="max-width:600px; margin:auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
      
      <div style="background:#0052cc; color:white; padding:20px; text-align:center;">
        <h2 style="margin:0;">Boarding Pass</h2>
      </div>
      
      <div style="padding:20px;">
        <p style="font-size:16px;">Kedves <b>${pass.passengerName || 'Utas'}</b>,</p>
        <p style="font-size:15px;">Az alábbi beszállókártyát állítottuk ki számodra:</p>
        
        <div style="margin:20px 0; padding:15px; border:1px solid #eee; border-radius:8px; text-align:center;">
          <h3 style="margin:0; color:#333;">
            ${fromAirport.name} (${fromAirport.code}) → ${toAirport.name} (${toAirport.code})
            ${pass.connection ? ` via ${pass.connection}` : ''}
          </h3>
          <p style="font-size:14px; margin:5px 0; color:#666;">Beszállókártya száma: <b>${pass._id}</b></p>
          <p style="font-size:14px; margin:5px 0; color:#666;">Flight: ${pass.flightNumber} | Seat: ${pass.seat}</p>
        </div>
        
        <div style="text-align:center; margin:20px 0;">
          <img src="${qrUrl}" alt="QR Code" style="width:200px; height:200px;" />
          <br/>
          <img src="${barcode}" alt="Barcode" style="margin-top:10px;"/>
        </div>
        
        <p style="font-size:14px; color:#888;">Kérjük, őrizd meg ezt az emailt és mutasd fel a beszálláskor.</p>
      </div>
      
      <div style="background:#f0f0f0; padding:15px; text-align:center; font-size:13px; color:#777;">
        &copy; 2025 Boarding Pass System
      </div>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from: `"Boarding System" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Boarding Pass - ${fromAirport.code} → ${toAirport.code}${pass.connection ? ' via ' + pass.connection : ''}`,
    html
  });
}

// Get a boarding pass by ID
app.get('/api/pass/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pass = await BoardingPass.findById(id);
    if (!pass) return res.status(404).json({ error: 'Boarding pass not found' });

    res.json({
      id: pass._id,
      airline: pass.airline,
      flightNumber: pass.flightNumber,
      destination: pass.destination,
      connection: pass.connection || null,
      seat: pass.seat,
      passengerName: pass.passengerName,
      qr: pass.qr,
      barcode: pass.barcode,
      createdAt: pass.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});



// API to generate boarding passes
app.post('/generate', async (req, res) => {
  const { count, email, passengerName } = req.body;
  if (!count || count < 1 || count > 5) return res.status(400).send('Count must be 1-5');
  if (!email) return res.status(400).send('Email required');

  const airline = airlines[Math.floor(Math.random() * airlines.length)];
  const destination = destinations[Math.floor(Math.random() * destinations.length)];
  const connection = Math.random() > 0.5 ? destinations[Math.floor(Math.random() * destinations.length)] : null;

  let passes = [];
  for (let i = 0; i < count; i++) {
    const flightNumber = generateFlightNumber(airline);
    const seat = String.fromCharCode(65 + i) + (Math.floor(Math.random() * 30) + 1);

    const pass = new BoardingPass({
      airline,
      flightNumber,
      destination: destination.code,
      connection: connection ? connection.code : null,
      seat,
      passengerName
    });

    await pass.save();
    passes.push(pass);

    await sendBoardingPassEmail(email, pass, { name: "Vienna Schwechat Int'l", code: 'VIE' }, destination);
  }

  res.json({ message: 'Boarding passes generated and sent', passes });
});

// Admin view
app.get('/admin', async (req, res) => {
  const passes = await BoardingPass.find();
  res.render('admin', { passes });
});

// Admin view
app.get('/view', async (req, res) => {
  res.sendFile(__dirname + "/view.html")
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "192.168.1.22", () => console.log('Server running on port ' + PORT));
