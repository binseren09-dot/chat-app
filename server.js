require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Mengizinkan akses lintas perangkat (HP & PC) tanpa diblokir CORS
    methods: ["GET", "POST"]
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simpan Session di Express
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'rahasiasuper',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // Sesi bertahan 1 hari di HP
});
app.use(sessionMiddleware);

// Sambungkan session agar bisa dibaca di dalam Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME || 'dzsstwcnd',
  api_key: process.env.CLOUDINARY_API_KEY || '266415129671877',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'gwEC_FYql59CjfH2iE_AHu7t9CE'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return { folder: 'chat_app_media', resource_type: 'auto' };
  },
});
const upload = multer({ storage: storage });

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp')
.then(() => console.log("MongoDB Connected 🔥"))
.catch((err) => console.log("MongoDB Error:", err));

// USER SCHEMA
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
});
const User = mongoose.model('User', UserSchema);

// SCHEMA CHAT PERSONAL 
const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  fileUrl: String,   
  fileType: String,  
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// Mendapatkan info user aktif saat ini
app.get('/me', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.json({});
  }
});

// Mendapatkan daftar semua user terdaftar untuk sidebar kontak
app.get('/users', async (req, res) => {
  const users = await User.find({}, 'username');
  res.json(users);
});

// Mendapatkan histori pesan khusus antara 2 orang saja
app.get('/messages', async (req, res) => {
  if(!req.session.user) return res.status(401).json([]);
  const me = req.session.user.username;
  const target = req.query.with;

  if(!target) return res.json([]);

  const messages = await Message.find({
    $or: [
      { sender: me, receiver: target },
      { sender: target, receiver: me }
    ]
  }).sort({ createdAt: 1 });
  
  res.json(messages);
});

// REGISTER & LOGIN
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hash });
    await user.save();
    res.send('Register berhasil 🔥');
  } catch (err) {
    res.send('Username sudah terdaftar!');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if(!user) return res.send('User tidak ditemukan');
  const match = await bcrypt.compare(password, user.password);
  if(!match) return res.send('Password salah');
  req.session.user = user;
  res.send('Login berhasil 🔥. Silakan buka halaman utama.');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.post('/upload', upload.single('mediaFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
  const isVideo = req.file.mimetype.startsWith('video');
  res.json({ fileUrl: req.file.path, fileType: isVideo ? 'video' : 'image' });
});

// MAP UNTUK MENYIMPAN ID SOCKET USER YANG SEDANG ONLINE
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const sessionUser = socket.request.session.user;
  
  if (sessionUser && sessionUser.username) {
    socket.username = sessionUser.username;
    onlineUsers.set(sessionUser.username, socket.id);
    console.log(`[Session] ${sessionUser.username} terhubung dengan ID: ${socket.id}`);
  }
  
  socket.on('register user', (username) => {
    if (!username) return;
    socket.username = username;
    onlineUsers.set(username, socket.id);
    console.log(`[Manual] ${username} terhubung dengan ID: ${socket.id}`);
  });

  // LOGIKA MANAJEMEN CHAT & DISTRIBUSI CENTANG DUA
  socket.on('chat message', async (data) => {
    const senderName = socket.username || (sessionUser ? sessionUser.username : null);
    if (!senderName) return;

    const msg = new Message({
      sender: senderName,
      receiver: data.receiver || "GlobalChat", 
      message: data.message || "",
      fileUrl: data.fileUrl || null,
      fileType: data.fileType || null
    });
    await msg.save();

    const outputData = {
      _id: msg._id,
      username: senderName, 
      message: data.message,
      fileUrl: msg.fileUrl,
      fileType: msg.fileType
    };

    // 1. Tampilkan di layar kita sendiri (Secara bawaan berstatus Centang 1)
    socket.emit('chat message', outputData);

    // 2. Teruskan pesan ke semua orang yang online, lalu beri sinyal centang dua ke pengirim
    onlineUsers.forEach((socketId, namaUser) => {
      if (namaUser !== senderName) {
        io.to(socketId).emit('chat message', outputData);
        
        // Target sukses menerima data -> perintahkan HP pengirim ubah ikon jadi Centang Dua (✓✓)
        socket.emit('message delivered', msg._id);
      }
    });
  });

  // LOGIKA "SEDANG MENGETIK..."
  socket.on('typing', (data) => {
    const senderName = socket.username || (sessionUser ? sessionUser.username : null);
    if (!senderName) return;

    onlineUsers.forEach((socketId, namaUser) => {
      if (namaUser !== senderName) {
        io.to(socketId).emit('typing', { sender: senderName, isTyping: data.isTyping });
      }
    });
  });

  // LOGIKA HAPUS PESAN
  socket.on('delete message', async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg) return;

      if (msg.sender === data.username || msg.sender === socket.username) {
        await Message.findByIdAndDelete(data.messageId);
        socket.emit('message deleted', data.messageId);
        
        const receiverSocketId = onlineUsers.get(msg.receiver);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message deleted', data.messageId);
        }
      }
    } catch (err) {
      console.log("Gagal hapus:", err);
    }
  });

  socket.on('disconnect', () => {
    if(socket.username) {
      onlineUsers.delete(socket.username);
      console.log(`${socket.username} keluar dari jaringan.`);
    }
  });
});

// Jalankan server pada Port 3000
server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});

