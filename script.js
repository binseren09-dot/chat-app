// Inisialisasi Socket.io dengan opsi auto-reconnect
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5
});

// Meminta izin notifikasi browser
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// Fungsi menampilkan notifikasi push saat tab sedang tidak dibuka
function showNotification(data) {
  if (Notification.permission === "granted" && document.hidden) {
    let bodyText = data.message || (data.fileType === 'video' ? '🎥 Mengirim video' : '📷 Mengirim foto');
    const notif = new Notification(`Pesan dari ${data.username}`, {
      body: bodyText,
      icon: 'https://flaticon.com'
    });
    notif.onclick = () => { window.focus(); notif.close(); };
  }
}

// Fungsi memuat ulang seluruh database pesan dari server
function fetchAllMessages() {
  document.getElementById('messages').innerHTML = ""; 
  fetch('/messages')
    .then(res => res.json())
    .then(messages => {
      messages.forEach(data => { appendMessageElement(data); });
      scrollToBottom();
      renderDeleteButtons();
    })
    .catch(err => console.error("Gagal mengambil pesan:", err));
}

// Jalankan pengambilan data pertama kali saat aplikasi dibuka
fetchAllMessages();

// Mengecek jika layar kembali aktif dari background hp
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

// Menerima pesan teks atau file baru dari socket server
socket.on('chat message', (data) => {
  appendMessageElement(data);
  scrollToBottom();
  renderDeleteButtons();
  showNotification(data);
});

// Fungsi untuk mengirim pesan teks biasa
function sendMsg() {
  let username = document.getElementById('username').value.trim();
  let msg = document.getElementById('msg').value.trim();

  if(username === "") { alert("Isi username terlebih dahulu"); return; }
  if(msg === "") return;

  socket.emit('chat message', { username: username, message: msg });
  document.getElementById('msg').value = "";
}

document.getElementById('msg').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') sendMsg();
});

// Logika mendeteksi status ketikan (Typing Indicator)
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

// Menampilkan indikator jika lawan bicara sedang mengetik
socket.on('typing', (data) => {
  const typingStatusDiv = document.getElementById('typing-status');
  let currentUsername = document.getElementById('username').value.trim();

  if (data.sender !== currentUsername && data.isTyping) {
    typingStatusDiv.innerText = `${data.sender} sedang mengetik...`;
  } else {
    typingStatusDiv.innerText = "";
  }
});

// LANJUTAN KODE YANG TERPOTONG: Menangani unggahan file (Gambar/Video)
function handleFileSelect() {
  let fileInput = document.getElementById('file-input');
  let username = document.getElementById('username').value.trim();
  let file = fileInput.files[0];

  if (username === "") { alert("Isi username terlebih dahulu!"); fileInput.value = ""; return; }
  if (!file) return;

  let fileType = file.type.split('/')[0]; // Mendeteksi 'image' atau 'video'
  let reader = new FileReader();

  reader.onload = function(e) {
    let base64Data = e.target.result;
    
    // Kirim objek file ke server lewat Socket
    socket.emit('chat message', {
      username: username,
      message: "", // Teks kosong karena mengirim media
      fileData: base64Data,
      fileType: fileType
    });
    
    fileInput.value = ""; // Reset form file input setelah terkirim
  };

  reader.readAsDataURL(file); // Konversi file biner ke string Base64
}

// Fungsi untuk menyusun tampilan bubble chat
function appendMessageElement(data) {
  const messagesDiv = document.getElementById('messages');
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  
  // Penanda atribut data-sender untuk logika tombol hapus
  messageElement.setAttribute('data-sender', data.username);

  let contentHtml = `<div class="message-content"><strong>${data.username}:</strong> `;
  
  if (data.message) {
    contentHtml += `<span>${data.message}</span>`;
  } else if (data.fileData) {
    if (data.fileType === 'image') {
      contentHtml += `<img src="${data.fileData}" alt="Foto">`;
    } else if (data.fileType === 'video') {
      contentHtml += `<video src="${data.fileData}" controls></video>`;
    }
  }
  contentHtml += `</div>`;
  
  // Tambahkan tombol hapus (default disembunyikan lewat renderDeleteButtons)
  contentHtml += `<button class="btn-delete" onclick="deleteMessage('${data.id || data._id}')" style="display:none;">🗑️</button>`;
  
  messageElement.innerHTML = contentHtml;
  messagesDiv.appendChild(messageElement);
}

// Fungsi menampilkan tombol hapus HANYA jika username sesuai pemilik pesan
function renderDeleteButtons() {
  let currentUsername = document.getElementById('username').value.trim();
  let allMessages = document.querySelectorAll('.message');
  
  allMessages.forEach(msg => {
    let sender = msg.getAttribute('data-sender');
    let deleteBtn = msg.querySelector('.btn-delete');
    if (deleteBtn) {
      if (currentUsername !== "" && currentUsername === sender) {
        deleteBtn.style.display = "block";
      } else {
        deleteBtn.style.display = "none";
      }
    }
  });
}

// Kerangka fungsi hapus pesan (bisa disesuaikan dengan rute API backend Anda)
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
