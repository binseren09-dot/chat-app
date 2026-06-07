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
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simpan Session di Express
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'rahasiasuper',
  resave: false,
  saveUninitialized: true
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

// SCHEMA CHAT PERSONAL (Menyimpan Sender dan Receiver secara spesifik)
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
  // Ambil user dari session login
  const sessionUser = socket.request.session.user;
  
  socket.on('register user', (username) => {
    socket.username = username;
    onlineUsers.set(username, socket.id);
    console.log(`${username} terhubung dengan ID: ${socket.id}`);
  });

  // LOGIKA CHAT PERSONAL (PRIVATE MESSAGE)
  socket.on('private message', async (data) => {
    const senderName = socket.username || (sessionUser ? sessionUser.username : null);
    if (!senderName) return;

    const msg = new Message({
      sender: senderName,
      receiver: data.receiver,
      message: data.message,
      fileUrl: data.fileUrl || null,
      fileType: data.fileType || null
    });
    await msg.save();

    const outputData = {
      _id: msg._id,
      sender: senderName,
      receiver: data.receiver,
      message: data.message,
      fileUrl: msg.fileUrl,
      fileType: msg.fileType
    };

    // Kirim ke pengirim (saya)
    socket.emit('private message', outputData);

    // Kirim ke penerima (teman) jika dia sedang online
    const receiverSocketId = onlineUsers.get(data.receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('private message', outputData);
    }
  });

  // LOGIKA HAPUS PESAN PERSONAL
  socket.on('delete message', async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg) return;

      if (msg.sender === data.sender) {
        await Message.findByIdAndDelete(data.messageId);
        
        // Infokan ke pengirim
        socket.emit('message deleted', data.messageId);
        
        // Infokan ke penerima jika online
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
      console.log(`${socket.username} keluar`);
    }
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});
