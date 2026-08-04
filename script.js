// ==========================================================================
// 1. KONEKSI SOCKET.IO & PENGATURAN IZIN NOTIFIKASI MELAYANG
// ==========================================================================
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5
});

// Default Avatar Seed
let selectedAvatarSeed = "User1";

// Meminta izin Notifikasi Melayang dari browser tepat saat aplikasi dimuat
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission().then(permission => {
      console.log("Status izin notifikasi melayang:", permission);
    });
  }
}
requestNotificationPermission();

// Fungsi memicu munculnya kotak notifikasi melayang di sistem operasi (PC / HP)
function showNotification(data) {
  let currentUsername = document.getElementById('username').value.trim();
  
  // SYARAT: Izin aktif, dan BUKAN pesan milik sendiri (langsung muncul tanpa batas document.hidden)
  if (Notification.permission === "granted" && data.username !== currentUsername) {
    
    let bodyText = data.message;
    if (!bodyText) {
      bodyText = data.fileType === 'video' ? '🎥 Mengirim video' : '📷 Mengirim foto';
    }
    
    const notif = new Notification(`Pesan baru dari ${data.username}`, {
      body: bodyText,
      icon: `https://dicebear.com{data.avatarSeed || 'User1'}`, // Menggunakan avatar pengirim
      tag: 'chat-app-message' // Menggabungkan tumpukan pop-up agar tidak memenuhi layar pengguna
    });

    // Jika notifikasi melayang diklik, arahkan pengguna kembali masuk ke tab chat
    notif.onclick = (e) => { 
      e.preventDefault();
      window.focus(); 
      notif.close(); 
    };
  }
}

// ==========================================================================
// 2. FITUR PROFIL (AVATAR) & TEMA REALTIME
// ==========================================================================

// Fungsi mengganti avatar profil pengguna
function changeAvatar(seed) {
  selectedAvatarSeed = seed;
  document.getElementById('current-avatar').src = `https://dicebear.com{seed}`;
  
  // Update visual opsi aktif
  document.querySelectorAll('.avatar-opt').forEach(img => img.classList.remove('active'));
  if (event && event.target) {
    event.target.classList.add('active');
  }
}

// Fungsi untuk mengubah tema aplikasi secara dinamis
function setTheme(themeName) {
  // Bersihkan semua class tema yang menempel di body terlebih dahulu
  document.body.classList.remove('theme-cyberpunk', 'theme-midnight', 'theme-forest');
  
  // Pasang class tema baru yang dipilih oleh user
  document.body.classList.add(`theme-${themeName}`);
  
  // Update status tombol aktif di panel pengaturan tema kiri
  document.querySelectorAll('.btn-theme').forEach(btn => btn.classList.remove('active'));
  
  if (event && event.target) {
    event.target.classList.add('active');
  }
}

// ==========================================================================
// 3. MANAGEMENT SYNC DATA DAN PENGIRIMAN PESAN
// ==========================================================================

// Fungsi mengambil seluruh riwayat chat lama dari database backend Anda
function fetchAllMessages() {
  document.getElementById('messages').innerHTML = ""; 
  fetch('/messages')
    .then(res => res.json())
    .then(messages => {
      messages.forEach(data => { appendMessageElement(data); });
      scrollToBottom();
      renderDeleteButtons();
    })
    .catch(err => console.error("Gagal mengambil database pesan:", err));
}

// Jalankan penarikan data pertama kali saat web dimuat
fetchAllMessages();

// Memaksa browser HP menarik ulang data jika pengguna kembali membuka layar utama aplikasi
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!socket.connected) socket.connect();
    fetchAllMessages();
  }
});
socket.on('connect', () => {
  console.log("Terhubung ke server chat!");
  let currentUsername = document.getElementById('username').value.trim();
  if (currentUsername) socket.emit('register user', currentUsername);
  fetchAllMessages();
});

// Menerima pesan teks atau media file realtime dari Socket server
socket.on('chat message', (data) => {
  appendMessageElement(data);
  scrollToBottom();
  renderDeleteButtons();
  
  // Pemicu Notifikasi Melayang otomatis
  showNotification(data);
});

// Fungsi memproses pengiriman pesan teks biasa
function sendMsg() {
  let username = document.getElementById('username').value.trim();
  let msg = document.getElementById('msg').value.trim();

  if(username === "") { alert("Isi username terlebih dahulu di panel profil!"); return; }
  if(msg === "") return;

  // Ikut sertakan data seed avatar saat mengirim pesan ke server
  socket.emit('chat message', { 
    username: username, 
    message: msg,
    avatarSeed: selectedAvatarSeed 
  });
  document.getElementById('msg').value = "";
}

document.getElementById('msg').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') sendMsg();
});

// ==========================================================================
// 4. LOGIKA INDIKATOR STATUS MENGETIK (TYPING INDICATOR)
// ==========================================================================
let typingTimeout;
document.getElementById('msg').addEventListener('input', () => {
  let username = document.getElementById('username').value.trim();
  if(!username) return;
  
  socket.emit('typing', { sender: username, isTyping: true });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', { sender: username, isTyping: false });
  }, 2000);
});

socket.on('typing', (data) => {
  const typingStatusDiv = document.getElementById('typing-status');
  let currentUsername = document.getElementById('username').value.trim();

  if (data.sender !== currentUsername && data.isTyping) {
    typingStatusDiv.innerText = `${data.sender} sedang mengetik...`;
  } else {
    typingStatusDiv.innerText = "";
  }
});

// ==========================================================================
// 5. PEMBACAAN DAN UNGGAHAN FILE MEDIA (IMAGE/VIDEO)
// ==========================================================================
function handleFileSelect() {
  let fileInput = document.getElementById('file-input');
  let username = document.getElementById('username').value.trim();
  let file = fileInput.files;

  if (username === "") { alert("Isi username terlebih dahulu!"); fileInput.value = ""; return; }
  if (!file) return;

  let fileType = file.type.split('/'); // Mendeteksi pay-load berupa 'image' atau 'video'
  let reader = new FileReader();

  reader.onload = function(e) {
    let base64Data = e.target.result;
    
    // Kirim objek string media Base64 langsung ke server lewat jalur Socket
    socket.emit('chat message', {
      username: username,
      message: "", 
      fileData: base64Data,
      fileType: fileType,
      avatarSeed: selectedAvatarSeed
    });
    
    fileInput.value = ""; // Bersihkan form file input setelah berhasil dilempar
  };

  reader.readAsDataURL(file); 
}

// ==========================================================================
// 6. MANIPULASI TAMPILAN BUBBLE CHAT (SINKRONISASI KANAN-KIRI)
// ==========================================================================
function appendMessageElement(data) {
  const messagesDiv = document.getElementById('messages');
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.setAttribute('data-sender', data.username);

  // LOGIKA SINKRONISASI CSS BARU: Memisahkan letak perataan kanan/kiri chat
  let currentUsername = document.getElementById('username').value.trim();
  if (currentUsername !== "" && data.username === currentUsername) {
    messageElement.classList.add('outgoing'); // Pesan Anda sendiri, melompat ke KANAN (Tema Utama)
  } else {
    messageElement.classList.add('incoming'); // Pesan masuk orang lain, menetap di KIRI (Gelap Transparan)
  }

  // Ambil avatar berdasarkan seed yang tersimpan atau default
  let avatarUrl = `https://dicebear.com{data.avatarSeed || 'User1'}`;

  let contentHtml = `
    <img class="msg-avatar" src="${avatarUrl}" alt="Avatar">
    <div class="msg-body">
      <span class="msg-info">${data.username}</span>
      <div class="msg-text">
  `;
  
  if (data.message) {
    contentHtml += `<span>${data.message}</span>`;
  } else if (data.fileData) {
    if (data.fileType === 'image') {
      contentHtml += `<img src="${data.fileData}" alt="Foto">`;
    } else if (data.fileType === 'video') {
      contentHtml += `<video src="${data.fileData}" controls></video>`;
    }
  }
  contentHtml += `</div></div>`;
  
  // Memasang tombol hapus bertanda id data dari database backend Anda
  contentHtml += `<button class="btn-delete" onclick="deleteMessage('${data.id || data._id}')" style="display:none;">🗑️</button>`;
  
  messageElement.innerHTML = contentHtml;
  messagesDiv.appendChild(messageElement);
}

// Fungsi memeriksa dan meremajakan tombol hapus dan posisi secara dinamis sewaktu-waktu kolom username diedit
function renderDeleteButtons() {
  let currentUsername = document.getElementById('username').value.trim();
  let allMessages = document.querySelectorAll('.message');
  
  allMessages.forEach(msg => {
    let sender = msg.getAttribute('data-sender');
    let deleteBtn = msg.querySelector('.btn-delete');
    
    if (currentUsername !== "" && currentUsername === sender) {
      msg.classList.remove('incoming');
      msg.classList.add('outgoing'); // Ubah ke kanan
      if (deleteBtn) deleteBtn.style.display = "block";
    } else {
      msg.classList.remove('outgoing');
      msg.classList.add('incoming'); // Ubah ke kiri
      if (deleteBtn) deleteBtn.style.display = "none";
    }
  });
}

// Mengirim instruksi hapus pesan ke server API backend Anda
function deleteMessage(messageId) {
  if (confirm("Hapus pesan ini?")) {
    fetch(`/messages/${messageId}`, { method: 'DELETE' })
      .then(() => fetchAllMessages())
      .catch(err => console.error("Gagal melakukan instruksi hapus:", err));
  }
}

// Otomatisasi gulir halaman ke bawah agar pesan paling baru selalu terlihat langsung
function scrollToBottom() {
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}
