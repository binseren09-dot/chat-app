require('dotenv').config();
console.log('MONGO_URI =', process.env.MONGO_URI);
console.log('SESSION_SECRET =', process.env.SESSION_SECRET);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');

// LIBRARY UNTUK UPLOAD MEDIA
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasiasuper',
  resave: false,
  saveUninitialized: true
}));

// ==========================================
// KONFIGURASI CLOUDINARY
// Isikan kredensial Anda di file .env atau langsung ganti teks di bawah ini
// ==========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME || 'dzsstwcnd',
  api_key: process.env.CLOUDINARY_API_KEY || '266415129671877',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'gwEC_FYql59CjfH2iE_AHu7t9CE'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'chat_app_media',
      resource_type: 'auto', // Otomatis mendeteksi foto atau video [1]
    };
  },
});

const upload = multer({ storage: storage });

// CONNECT DATABASE
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB Connected 🔥");
})
.catch((err) => {
  console.log("MongoDB Error:", err);
});

// USER SCHEMA
const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model('User', UserSchema);

// MESSAGE SCHEMA (Diperbarui untuk mendukung Foto & Video)
const MessageSchema = new mongoose.Schema({
  username: String,
  message: String,
  fileUrl: String,   // Menyimpan link foto/video [2]
  fileType: String,  // Menyimpan jenis file ('image' atau 'video') [1]
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const Message = mongoose.model('Message', MessageSchema);

// REGISTER
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hash });
  await user.save();
  res.send('Register berhasil 🔥');
});

// LOGIN
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if(!user) return res.send('User tidak ditemukan');
  const match = await bcrypt.compare(password, user.password);
  if(!match) return res.send('Password salah');
  req.session.user = user;
  res.send('Login berhasil 🔥');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/messages', async (req, res) => {
  const messages = await Message.find().sort({ createdAt: 1 });
  res.json(messages);
});

// ROUTE API BARU UNTUK PROSES UPLOAD KE CLOUDINARY
app.post('/upload', upload.single('mediaFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file yang dipilih' });
    }
    const isVideo = req.file.mimetype.startsWith('video');
    res.json({
      fileUrl: req.file.path,
      fileType: isVideo ? 'video' : 'image'
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengunggah file' });
  }
});

// SOCKET.IO (CHAT, HAPUS, & MEDIA REAL-TIME)
io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('chat message', async (data) => {
    console.log(data);

    const msg = new Message({
      username: data.username,
      message: data.message,
      fileUrl: data.fileUrl || null,
      fileType: data.fileType || null
    });

    await msg.save();

    io.emit('chat message', {
      _id: msg._id,
      username: data.username,
      message: data.message,
      fileUrl: msg.fileUrl,
      fileType: msg.fileType
    });
  });

  socket.on('delete message', async (data) => {
    try {
      const { messageId, username } = data;
      const msg = await Message.findById(messageId);
      if (!msg) return;

      if (msg.username === username) {
        await Message.findByIdAndDelete(messageId);
        io.emit('message deleted', messageId);
      }
    } catch (err) {
      console.log("Gagal menghapus pesan:", err);
    }
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});


