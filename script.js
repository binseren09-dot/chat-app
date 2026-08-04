const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5
});

// Default Avatar Seed
let selectedAvatarSeed = "User1";

// Fungsi mengganti avatar profil pengguna
function changeAvatar(seed) {
  selectedAvatarSeed = seed;
  document.getElementById('current-avatar').src = `https://dicebear.com{seed}`;
  
  // Update visual opsi aktif
  document.querySelectorAll('.avatar-opt').forEach(img => img.classList.remove('active'));
  event.target.classList.add('active');
}

// Meminta izin Notifikasi Melayang saat aplikasi dimuat
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// Fungsi menampilkan Notifikasi Melayang Pop-up
function showNotification(data) {
  let currentUsername = document.getElementById('username').value.trim();
  
  // Notifikasi muncul jika diizinkan DAN bukan pesan dari diri kita sendiri
  if (Notification.permission === "granted" && data.username !== currentUsername) {
    let bodyText = data.message || (data.fileType === 'video' ? '🎥 Mengirim video' : '📷 Mengirim foto');
    
    const notif = new Notification(`Pesan dari ${data.username}`, {
      body: bodyText,
      icon: `https://dicebear.com{data.avatarSeed || 'User1'}`, // Memakai gambar avatar pengirim
      tag: 'chat-app-message'
    });

    notif.onclick = (e) => { 
      e.preventDefault();
      window.focus(); 
      notif.close(); 
    };
  }
}

function fetchAllMessages() {
  document.getElementById('messages').innerHTML = ""; 
  fetch('/messages')
    .then(res => res.json())
    .then(messages => {
      messages.forEach(data => { appendMessageElement(data); });
      scrollToBottom();
      renderDeleteButtons();
    })
    .catch(err => console.error("Gagal mengambil data:", err));
}
fetchAllMessages();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!socket.connected) socket.connect();
    fetchAllMessages();
  }
});

socket.on('connect', () => {
  let currentUsername = document.getElementById('username').value.trim();
  if (currentUsername) socket.emit('register user', currentUsername);
  fetchAllMessages();
});

// Menerima pesan baru
socket.on('chat message', (data) => {
  appendMessageElement(data);
  scrollToBottom();
  renderDeleteButtons();
  showNotification(data); // Picu Notifikasi Melayang
});

// Fungsi Mengirim Pesan Teks
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

// Indikator Mengetik
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

// Menangani Unggahan File Media
function handleFileSelect() {
  let fileInput = document.getElementById('file-input');
  let username = document.getElementById('username').value.trim();
  let file = fileInput.files[0];

  if (username === "") { alert("Isi username terlebih dahulu!"); fileInput.value = ""; return; }
  if (!file) return;

  let fileType = file.type.split('/')[0];
  let reader = new FileReader();

  reader.onload = function(e) {
    socket.emit('chat message', {
      username: username,
      message: "", 
      fileData: e.target.result,
      fileType: fileType,
      avatarSeed: selectedAvatarSeed
    });
    fileInput.value = ""; 
  };
  reader.readAsDataURL(file); 
}

// Fungsi Menyusun Bubble Chat Kanan-Kiri dengan Avatar Profil
function appendMessageElement(data) {
  const messagesDiv = document.getElementById('messages');
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.setAttribute('data-sender', data.username);

  let currentUsername = document.getElementById('username').value.trim();
  if (currentUsername !== "" && data.username === currentUsername) {
    messageElement.classList.add('outgoing'); // Diri Sendiri (Kanan)
  } else {
    messageElement.classList.add('incoming'); // Lawan Bicara (Kiri)
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
  contentHtml += `<button class="btn-delete" onclick="deleteMessage('${data.id || data._id}')" style="display:none;">🗑️</button>`;
  
  messageElement.innerHTML = contentHtml;
  messagesDiv.appendChild(messageElement);
}

// Penyegaran Tombol Hapus & Perataan Posisi Chat secara Dinamis
function renderDeleteButtons() {
  let currentUsername = document.getElementById('username').value.trim();
  let allMessages = document.querySelectorAll('.message');
  
  allMessages.forEach(msg => {
    let sender = msg.getAttribute('data-sender');
    let deleteBtn = msg.querySelector('.btn-delete');
    
    if (currentUsername !== "" && currentUsername === sender) {
      msg.classList.remove('incoming');
      msg.classList.add('outgoing');
      if (deleteBtn) deleteBtn.style.display = "block";
    } else {
      msg.classList.remove('outgoing');
      msg.classList.add('incoming');
      if (deleteBtn) deleteBtn.style.display = "none";
    }
  });
}

function deleteMessage(messageId) {
  if (confirm("Hapus pesan ini?")) {
    fetch(`/messages/${messageId}`, { method: 'DELETE' })
      .then(() => fetchAllMessages())
      .catch(err => console.error("Gagal menghapus:", err));
  }
}

function scrollToBottom() {
  const messagesDiv = document.getElementById('messages');
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
