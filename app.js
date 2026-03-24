// ==============================
// Configuración Supabase
// ==============================
const SUPABASE_URL = "https://yttyrqzicnyukirctceh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JAMyGyLX96jN0801Ro-cXA_igjGBulo";
const SUPABASE_STICKERS_BUCKET = "stickers";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stickersEl = document.getElementById("stickers");
const toggleStickersBtn = document.getElementById("toggle-stickers");
const previewEl = document.getElementById("preview");
const widgetEl = document.getElementById("widget-preview");
const formEl = document.getElementById("mood-form");
const messageEl = document.getElementById("mini-message");
const historyEl = document.getElementById("history");
const createStatusEl = document.getElementById("create-status");
const supabaseStatusEl = document.getElementById("supabase-status");

const pairCodeEl = document.getElementById("pair-code");
const applyPairBtn = document.getElementById("apply-pair");
const pairInfoEl = document.getElementById("pair-info");
const pairLinkEl = document.getElementById("pair-link");
const copyPairLinkBtn = document.getElementById("copy-pair-link");
const generatePairBtn = document.getElementById("generate-pair");

const currentUserEl = document.getElementById("current-user");
const currentAvatarEl = document.getElementById("current-avatar");
const menuScreenEl = document.getElementById("menu-screen");
const appContentEl = document.getElementById("app-content");
const menuUsernameEl = document.getElementById("menu-username");
const menuAvatarEl = document.getElementById("menu-avatar");
const menuPairCodeEl = document.getElementById("menu-pair-code");
const enterAppBtn = document.getElementById("enter-app");
const showTimeBtn = document.getElementById("show-time");
const openCameraBtn = document.getElementById("open-camera");
const capturePhotoBtn = document.getElementById("capture-photo");
const cameraPreviewEl = document.getElementById("camera-preview");
const stickerTextEl = document.getElementById("sticker-text");

let activePairCode = null;
let selectedSticker = null;
let stickersExpanded = false;
let stickerData = [];
let cameraStream = null;
let capturedPhotoDataUrl = "";
let realtimeMoodChannel = null;
let realtimeStickerChannel = null;
let renderedMoodIds = new Set();
let renderedStickerKeys = new Set();
let pendingNotificationTimeout = null;

const VISIBLE_STICKERS = 4;
const DEFAULT_AVATAR = "💖";
const STORAGE_KEYS = {
  username: "folUsername",
  avatar: "folAvatar",
  activePairCode: "folActivePairCode",
  darkMode: "folDarkMode"
};

// Usa rutas con mayúscula para coincidir con la carpeta real en deploy (Linux es case-sensitive)
const quickMoods = [
  { img: "Stickers/te-extraño.svg", label: "Modo te extraño", mini: "¿Abrazo virtual?" },
  { img: "Stickers/traviesa.svg", label: "Modo traviesa", mini: "Ven que tengo planes." },
  { img: "Stickers/siestita.svg", label: "Modo siestita", mini: "Dormimos pegaditas hoy." },
  { img: "Stickers/payasa.svg", label: "Modo payasa", mini: "Soy tu comediante." },
  { img: "Stickers/intensa.svg", label: "Modo intensa", mini: "100% enamorada." },
  { img: "Stickers/melosa.svg", label: "Modo melosa", mini: "Besitos x34." }
];

const baseStickerCatalog = quickMoods.map((mood) => ({
  label: mood.label,
  mini: mood.mini,
  // Solo usamos rutas que existen en el deploy para evitar 404 en consola
  candidates: [mood.img]
}));

function setCreateStatus(message) {
  if (createStatusEl) createStatusEl.textContent = message;
}

function setCurrentUserMessage(message) {
  if (currentUserEl) currentUserEl.textContent = message;
}

function setCurrentAvatar(avatar) {
  if (currentAvatarEl) currentAvatarEl.textContent = avatar || DEFAULT_AVATAR;
}

function setSupabaseStatus(message) {
  if (supabaseStatusEl) supabaseStatusEl.textContent = message;
}

function setLocalIdentity(username, avatar) {
  localStorage.setItem(STORAGE_KEYS.username, username);
  localStorage.setItem(STORAGE_KEYS.avatar, avatar || DEFAULT_AVATAR);
}

function getCurrentUser() {
  return (localStorage.getItem(STORAGE_KEYS.username) || "").trim();
}

function getCurrentUserAvatar() {
  return localStorage.getItem(STORAGE_KEYS.avatar) || DEFAULT_AVATAR;
}

function clearLocalIdentity() {
  localStorage.removeItem(STORAGE_KEYS.username);
  localStorage.removeItem(STORAGE_KEYS.avatar);
}

function normalizePairCode(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generatePairCode(username) {
  const base = normalizePairCode(username || "pareja") || "pareja";
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `${base}-${randomPart}`;
}

function getPairCodeFromUrlOrStorage() {
  const params = new URLSearchParams(window.location.search);
  const urlPair = normalizePairCode(params.get("pair") || "");
  const storedPair = normalizePairCode(localStorage.getItem(STORAGE_KEYS.activePairCode) || "");
  return urlPair || storedPair || generatePairCode(getCurrentUser() || "pareja");
}

function updatePairLink() {
  const link = `${window.location.origin}${window.location.pathname}?pair=${encodeURIComponent(activePairCode)}`;
  pairLinkEl.value = link;
  pairInfoEl.textContent = `Conectada al código: ${activePairCode}`;
}

function getStickerKey(sticker) {
  return sticker.id || sticker.img;
}

async function canLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = encodeURI(src);
  });
}

async function resolveFirstExistingPath(candidates) {
  for (const path of candidates) {
    if (await canLoadImage(path)) return path;
  }
  return null;
}

async function buildDefaultStickerData() {
  const resolved = [];
  for (const item of baseStickerCatalog) {
    const img = await resolveFirstExistingPath(item.candidates);
    if (img) resolved.push({ img, label: item.label, mini: item.mini });
  }
  // Fallback para asegurar al menos un sticker disponible (evita que botones queden inertes)
  if (!resolved.length) {
    resolved.push({
      img: "icons/icon-512.png",
      label: "Show time",
      mini: "Ready to shine ✨"
    });
  }
  return resolved;
}

function updateStickerVisibility() {
  const buttons = [...document.querySelectorAll(".sticker-btn")];
  buttons.forEach((btn, index) => btn.classList.toggle("is-hidden", !stickersExpanded && index >= VISIBLE_STICKERS));
  const hasOverflow = buttons.length > VISIBLE_STICKERS;
  toggleStickersBtn.disabled = !hasOverflow;
  toggleStickersBtn.textContent = hasOverflow
    ? (stickersExpanded ? "➖ Ver menos moodcitos 💕" : "➕ Ver más moodcitos 💕")
    : "➕ Moodcitos completos 💕";
}

function renderStickerBtn(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sticker-btn";
  btn.innerHTML = `<img src="${item.img}" class="sticker-img" alt="${item.label}"/><strong>${item.label}</strong><br><span class="mini">${item.mini || ""}</span>`;
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sticker-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    selectedSticker = item;
    previewEl.innerHTML = `<img src="${item.img}" class="sticker-img-preview" alt="${item.label}"/><div><strong>${item.label}</strong></div><div>${item.mini || ""}</div>`;
  });
  stickersEl.appendChild(btn);
  updateStickerVisibility();
}

function renderAllStickers() {
  stickersEl.innerHTML = "";
  stickerData.forEach(renderStickerBtn);
  if (!stickerData.length) previewEl.innerHTML = `<div class="stamp">⚠️ No se encontraron stickers disponibles</div>`;
}

function addStickerIfMissing(sticker) {
  const stickerKey = getStickerKey(sticker);
  if (renderedStickerKeys.has(stickerKey) || stickerData.find((item) => item.img === sticker.img)) return;
  renderedStickerKeys.add(stickerKey);
  stickerData.push(sticker);
  renderStickerBtn(sticker);
}

function normalizeMoodRow(row) {
  return {
    id: row.id,
    pairCode: row.pairCode || row.pair_code,
    img: row.img,
    label: row.label,
    miniMessage: row.miniMessage || row.mini_message || "",
    sender: row.sender,
    createdAt: row.createdAt || row.created_at
  };
}

function renderWidget(data) {
  if (!data) {
    widgetEl.innerHTML = `<div class="widget-title">Último mood</div><div class="widget-empty">Aún no hay moodcitos compartidos.</div>`;
    return;
  }

  widgetEl.innerHTML = `<div class="widget-title">Último mood</div><img src="${data.img}" class="sticker-img-preview" alt="${data.label}"/><div><strong>${data.label}</strong></div><div class="history-sender">de ${data.sender || "alguien"}</div><div>${data.miniMessage}</div>`;
}

function renderHistory(items) {
  historyEl.innerHTML = "";
  items.forEach((data) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `<img src="${data.img}" style="width:40px;height:40px;object-fit:contain;vertical-align:middle" alt="${data.label}"/><div class="history-meta"><strong>${data.label}</strong><span>${data.miniMessage}</span><span class="history-sender">${data.sender || "Mood anónimo"}</span></div>`;
    historyEl.appendChild(div);
  });
  renderWidget(items[0]);
}

function showNotification(text) {
  const existing = document.querySelector(".notif");
  if (existing) existing.remove();
  if (pendingNotificationTimeout) clearTimeout(pendingNotificationTimeout);

  const notif = document.createElement("div");
  notif.className = "notif";
  notif.textContent = text;
  document.body.appendChild(notif);
  pendingNotificationTimeout = window.setTimeout(() => notif.remove(), 3000);
}

function renderNewMood(row) {
  if (!row?.id || renderedMoodIds.has(row.id)) return;
  renderedMoodIds.add(row.id);
  const data = normalizeMoodRow(row);

  const div = document.createElement("div");
  div.className = "history-item";
  div.innerHTML = `<img src="${data.img}" style="width:40px;height:40px;object-fit:contain;vertical-align:middle" alt="${data.label}"/><div class="history-meta"><strong>${data.label}</strong><span>${data.miniMessage}</span><span class="history-sender">${data.sender || "Mood anónimo"}</span></div>`;
  historyEl.prepend(div);
  renderWidget(data);

  if (data.sender && data.sender !== getCurrentUser()) {
    showNotification(`💌 Te llegó un mood de ${data.sender}`);
  }
}

async function loadMoodsFromSupabase() {
  if (!activePairCode) return;

  try {
    const { data, error } = await supabaseClient
      .from("moods")
      .select("id,pair_code,sender,img,label,mini_message,created_at")
      .eq("pair_code", activePairCode)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    renderedMoodIds = new Set((data || []).map((item) => item.id));
    renderHistory((data || []).map(normalizeMoodRow));
    setSupabaseStatus("Supabase: conectado en tiempo real ✅");
  } catch (error) {
    console.error("Supabase load moods error:", error);
    setSupabaseStatus("Supabase: error de conexión ❌");
    setCreateStatus("No se pudieron cargar moods desde Supabase.");
  }
}

function subscribeToRealtimeMoods() {
  if (realtimeMoodChannel) supabaseClient.removeChannel(realtimeMoodChannel);

  realtimeMoodChannel = supabaseClient
    .channel(`realtime-moods-${activePairCode}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "moods" },
      (payload) => {
        if (payload.new.pair_code === activePairCode) {
          renderNewMood(payload.new);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setSupabaseStatus("Supabase: realtime activo 🟢");
      if (status === "CHANNEL_ERROR") setSupabaseStatus("Supabase: error realtime 🔴");
    });
}

function isSupportedStickerFile(file) {
  if (!file) return false;
  const validMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  const hasValidMime = validMimeTypes.includes((file.type || "").toLowerCase());
  const hasValidExt = /\.(png|jpe?g|webp)$/i.test(file.name || "");
  return hasValidMime || hasValidExt;
}

async function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function createStickerWithText(source, text) {
  const imgSrc = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadImageElement(imgSrc);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width || 1080;
    canvas.height = img.naturalHeight || img.height || 1080;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const overlayText = (text || "").trim();
    if (overlayText) {
      const fontSize = Math.max(28, Math.round(canvas.width * 0.07));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.14));
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.fillStyle = "white";
      const y = canvas.height - Math.max(28, Math.round(fontSize * 0.8));
      ctx.strokeText(overlayText, canvas.width / 2, y);
      ctx.fillText(overlayText, canvas.width / 2, y);
    }

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(imgSrc);
  }
}

async function loadSharedStickersFromSupabase() {
  if (!activePairCode) return [];

  try {
    const { data, error } = await supabaseClient
      .from("stickers")
      .select("id,pair_code,img,label,mini,created_at")
      .eq("pair_code", activePairCode)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const normalized = (data || []).map((row) => ({
      id: row.id,
      img: row.img,
      label: row.label,
      mini: row.mini || ""
    }));
    renderedStickerKeys = new Set(normalized.map(getStickerKey));
    return normalized;
  } catch (error) {
    console.error("Supabase load stickers error:", error);
    setCreateStatus("No se pudieron cargar stickers compartidos.");
    return [];
  }
}

function subscribeToRealtimeStickers() {
  if (realtimeStickerChannel) supabaseClient.removeChannel(realtimeStickerChannel);

  realtimeStickerChannel = supabaseClient
    .channel(`realtime-stickers-${activePairCode}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "stickers" },
      (payload) => {
        if (payload.new.pair_code !== activePairCode) return;
        addStickerIfMissing({
          id: payload.new.id,
          img: payload.new.img,
          label: payload.new.label,
          mini: payload.new.mini || ""
        });
      }
    )
    .subscribe();
}

async function reloadPairData() {
  const defaults = await buildDefaultStickerData();
  const sharedCustom = await loadSharedStickersFromSupabase();
  stickerData = [...defaults, ...sharedCustom];
  renderAllStickers();
  subscribeToRealtimeStickers();
}

async function refreshMoodsRealtimeForPair() {
  await loadMoodsFromSupabase();
  subscribeToRealtimeMoods();
}

async function refreshForCurrentUser() {
  const username = getCurrentUser();
  if (username) {
    setCurrentAvatar(getCurrentUserAvatar());
    setCurrentUserMessage(`Usuario activo: ${getCurrentUserAvatar()} ${username}`);
  } else {
    setCurrentAvatar(DEFAULT_AVATAR);
    setCurrentUserMessage("Sin sesión local. Elige un username para entrar.");
  }

  await reloadPairData();
  await refreshMoodsRealtimeForPair();
}

function openAppShell() {
  menuScreenEl?.classList.add("is-hidden-initial");
  appContentEl?.classList.remove("is-hidden-initial");
}

async function handleEnterApp() {
  const username = (menuUsernameEl?.value || "").trim();
  const avatar = menuAvatarEl?.value || DEFAULT_AVATAR;
  const pairCandidate = normalizePairCode(menuPairCodeEl?.value || "");

  if (!username) {
    setCurrentUserMessage("Completa tu username para entrar.");
    return;
  }

  setLocalIdentity(username, avatar);
  activePairCode = pairCandidate || getPairCodeFromUrlOrStorage() || generatePairCode(username);
  localStorage.setItem(STORAGE_KEYS.activePairCode, activePairCode);
  pairCodeEl.value = activePairCode;

  updatePairLink();
  openAppShell();
  await refreshForCurrentUser();
  setCreateStatus(`Lista para moodcitos, ${avatar} ${username} 💕`);
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setCreateStatus("Tu navegador no soporta cámara en este modo.");
    return;
  }

  try {
    if (!cameraStream) cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    cameraPreviewEl.srcObject = cameraStream;
    cameraPreviewEl.classList.remove("is-hidden-initial");
    setCreateStatus("Cámara lista. Pulsa 'Tomar foto'.");
  } catch (error) {
    console.error(error);
    setCreateStatus("No se pudo abrir la cámara.");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraPreviewEl.srcObject = null;
  cameraPreviewEl.classList.add("is-hidden-initial");
}

function capturePhotoAsJpg() {
  if (!cameraPreviewEl || !cameraPreviewEl.srcObject) {
    setCreateStatus("Primero abre la cámara.");
    return;
  }

  const canvas = document.createElement("canvas");
  const width = cameraPreviewEl.videoWidth || 640;
  const height = cameraPreviewEl.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(cameraPreviewEl, 0, 0, width, height);
  capturedPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  setCreateStatus("Foto tomada. Ahora pulsa 'Crear Sticker'.");
}

function triggerRainbowGlitter(originEl) {
  const layer = document.createElement("div");
  layer.className = "glitter-layer";
  document.body.appendChild(layer);
  const colors = ["#ff004c", "#ff7a00", "#ffd400", "#24d05a", "#00b7ff", "#6a38ff", "#ff4fd8"];
  const rect = originEl?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

  for (let i = 0; i < 60; i += 1) {
    const dot = document.createElement("span");
    dot.className = "glitter";
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    dot.style.background = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 60;
    const distance = 70 + Math.random() * 190;
    dot.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
    dot.style.setProperty("--ty", `${Math.sin(angle) * distance}px`);
    layer.appendChild(dot);
  }

  originEl?.classList.add("rainbow-pop");
  setTimeout(() => {
    originEl?.classList.remove("rainbow-pop");
    layer.remove();
  }, 1000);
}

function bindPairLinkActions() {
  applyPairBtn.addEventListener("click", () => {
    const next = normalizePairCode(pairCodeEl.value);
    if (!next) {
      pairInfoEl.textContent = "Escribe un código de pareja válido.";
      return;
    }

    localStorage.setItem(STORAGE_KEYS.activePairCode, next);
    const url = new URL(window.location.href);
    url.searchParams.set("pair", next);
    window.history.replaceState({}, "", url.toString());

    activePairCode = next;
    updatePairLink();
    void refreshForCurrentUser();
  });

  generatePairBtn?.addEventListener("click", () => {
    const currentUser = getCurrentUser() || "pareja";
    const generated = generatePairCode(currentUser);
    pairCodeEl.value = generated;
    localStorage.setItem(STORAGE_KEYS.activePairCode, generated);
    activePairCode = generated;
    updatePairLink();
    void refreshForCurrentUser();
    pairInfoEl.textContent = `Código generado: ${generated}`;
  });

  copyPairLinkBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pairLinkEl.value);
      pairInfoEl.textContent = `Enlace copiado para ${activePairCode} 💌`;
    } catch {
      pairInfoEl.textContent = "No se pudo copiar automáticamente.";
    }
  });
}

openCameraBtn?.addEventListener("click", openCamera);
capturePhotoBtn?.addEventListener("click", capturePhotoAsJpg);

showTimeBtn?.addEventListener("click", async () => {
  const username = getCurrentUser();
  if (!username) {
    setCreateStatus("Define tu username local para usar It's show time.");
    return;
  }

  const showTimeSticker =
    selectedSticker ||
    stickerData[0] || { img: "icons/icon-512.png", label: "Show time", mini: "Listo ✨" };
  if (!showTimeSticker) {
    setCreateStatus("No hay stickers cargados todavía.");
    return;
  }

  const payload = {
    pair_code: activePairCode,
    sender: username,
    img: showTimeSticker.img,
    label: "It's show time ✨",
    mini_message: "Rupaul time 💅"
  };

  try {
    setCreateStatus("Enviando mood show time... ✨");
    const { error } = await supabaseClient.from("moods").insert([payload]);
    if (error) throw error;
    document.body.classList.add("rainbow");
    triggerRainbowGlitter(showTimeBtn);
    setTimeout(() => document.body.classList.remove("rainbow"), 2000);
    setCreateStatus("Mood enviado: It's show time 💅🌈✨");
  } catch (error) {
    console.error(error);
    setCreateStatus("No se pudo enviar mood show time.");
  }
});

toggleStickersBtn.addEventListener("click", () => {
  if (toggleStickersBtn.disabled) return;
  stickersExpanded = !stickersExpanded;
  updateStickerVisibility();
});

document.getElementById("create-sticker").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!getCurrentUser()) {
    setCreateStatus("Define tu username local para guardar stickers.");
    return;
  }

  const file = document.getElementById("new-sticker-img").files[0];
  const label = document.getElementById("new-label").value.trim();
  const mini = document.getElementById("new-mini").value.trim();
  const stickerText = stickerTextEl?.value.trim() || "";

  if (!label) {
    setCreateStatus("Completa al menos el nombre del sticker.");
    return;
  }
  if (!file && !capturedPhotoDataUrl) {
    setCreateStatus("Sube una imagen o toma una foto.");
    return;
  }
  if (file && !isSupportedStickerFile(file)) {
    setCreateStatus("Formato no compatible. Usa PNG, JPG/JPEG o WEBP.");
    return;
  }

  try {
    setCreateStatus("Subiendo sticker... 💭");
    const rawSource = file || capturedPhotoDataUrl;
    const uploadSource = await createStickerWithText(rawSource, stickerText);
    const fileName = `${activePairCode}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const filePath = `${activePairCode}/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(SUPABASE_STICKERS_BUCKET)
      .upload(filePath, uploadSource, { contentType: "image/png", upsert: false });
    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      throw uploadError;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from(SUPABASE_STICKERS_BUCKET)
      .getPublicUrl(filePath);

    const { data: insertedRows, error: insertError } = await supabaseClient
      .from("stickers")
      .insert([{ pair_code: activePairCode, img: publicUrlData.publicUrl, label, mini }])
      .select("id,pair_code,img,label,mini,created_at");
    if (insertError) {
      console.error("Supabase insert sticker error:", insertError);
      throw insertError;
    }

    if (insertedRows?.[0]) {
      addStickerIfMissing({
        id: insertedRows[0].id,
        img: insertedRows[0].img,
        label: insertedRows[0].label,
        mini: insertedRows[0].mini || ""
      });
    }

    setCreateStatus("Sticker compartido 💕");
    document.getElementById("new-sticker-img").value = "";
    document.getElementById("new-label").value = "";
    document.getElementById("new-mini").value = "";
    if (stickerTextEl) stickerTextEl.value = "";
    capturedPhotoDataUrl = "";
    stopCamera();
  } catch (error) {
    console.error("Create sticker error:", error);
    setCreateStatus(`Error subiendo sticker: ${error?.message || "revisa policies de Supabase"}`);
  }
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = getCurrentUser();
  if (!username) {
    setCreateStatus("Define tu username local para enviar moods.");
    return;
  }
  if (!selectedSticker) {
    setCreateStatus("Selecciona un sticker antes de enviar.");
    return;
  }

  const miniMsg = messageEl.value.trim();
  if (!miniMsg) return;

  const payload = {
    pair_code: activePairCode,
    sender: username,
    img: selectedSticker.img,
    label: selectedSticker.label,
    mini_message: miniMsg
  };

  try {
    setCreateStatus("Enviando mood... 💌");
    const { error } = await supabaseClient.from("moods").insert([payload]);
    if (error) throw error;
    messageEl.value = "";
    setCreateStatus("Mood enviado ✅");
  } catch (error) {
    console.error(error);
    setCreateStatus("No se pudo enviar mood a Supabase.");
  }
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (realtimeMoodChannel) supabaseClient.removeChannel(realtimeMoodChannel);
  if (realtimeStickerChannel) supabaseClient.removeChannel(realtimeStickerChannel);
});

document.getElementById("toggle-dark").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(STORAGE_KEYS.darkMode, document.body.classList.contains("dark") ? "1" : "0");
});

(async function init() {
  activePairCode = getPairCodeFromUrlOrStorage();

  if (localStorage.getItem(STORAGE_KEYS.darkMode) === "1") document.body.classList.add("dark");

  localStorage.setItem(STORAGE_KEYS.activePairCode, activePairCode);
  pairCodeEl.value = activePairCode;

  updatePairLink();
  bindPairLinkActions();
  enterAppBtn?.addEventListener("click", handleEnterApp);

  await reloadPairData();
  await refreshMoodsRealtimeForPair();

  const user = getCurrentUser();
  if (user) {
    menuUsernameEl.value = user;
    menuAvatarEl.value = getCurrentUserAvatar();
    setCurrentAvatar(getCurrentUserAvatar());
    openAppShell();
    setCurrentUserMessage(`Usuario activo: ${getCurrentUserAvatar()} ${user}`);
  } else {
    setCurrentAvatar(DEFAULT_AVATAR);
    setCurrentUserMessage("Sin sesión local. Elige un username para entrar.");
  }

  renderWidget();
  setCreateStatus(`Supabase activo para ${activePairCode}. Compatible con Vercel y Capacitor.`);
})();



