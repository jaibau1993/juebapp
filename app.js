import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTJJWQAQmwEXcIikl0KC6Y8br8OPuwBM0",
  authDomain: "juebapp.firebaseapp.com",
  projectId: "juebapp",
  storageBucket: "juebapp.firebasestorage.app",
  messagingSenderId: "86214319479",
  appId: "1:86214319479:web:99323743c55ec418051572"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const gamesCol = collection(db, "games");
const platformFamilies = {
  nintendo: ["GB", "GBC", "GBA", "DS/3DS", "Switch", "Switch 2"],
  xbox: ["XBOX 360", "XBOX One/X"],
  playstation: ["PS2", "PS4", "PS5"]
};
const platformOrder = new Map(
  Object.values(platformFamilies).flat().map((platform, index) => [platform, index])
);

// Estado de la aplicación
let allGames = [];
let currentUser = null;
let filterStatus = "all";
let filterFamily = "ALL";
let filterPlatform = "ALL";
let searchQuery = "";

// Referencias DOM
const gamesListEl = document.getElementById("games-list");
const emptyStateEl = document.getElementById("empty-state");
const statsBarEl = document.getElementById("stats-bar");
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search");
const platformFiltersEl = document.getElementById("platform-filters");
const consoleFiltersEl = document.getElementById("console-filters");

const gameModal = document.getElementById("game-modal");
const gameForm = document.getElementById("game-form");
const modalTitle = document.getElementById("modal-title");
const gameIdInput = document.getElementById("game-id");
const titleInput = document.getElementById("field-title");
const platformInput = document.getElementById("field-platform");
const statusInput = document.getElementById("field-status");
const integrityInput = document.getElementById("field-integrity");
const notesInput = document.getElementById("field-notes");
const duplicateWarning = document.getElementById("duplicate-warning");
const deleteBtn = document.getElementById("btn-delete");

const backupModal = document.getElementById("backup-modal");
const loginBtn = document.getElementById("btn-login");
const logoutBtn = document.getElementById("btn-logout");
const userBadge = document.getElementById("user-badge");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const defaultAvatar =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="12" fill="#334155"/><circle cx="12" cy="8" r="4" fill="#38bdf8"/><path d="M4 23v-3a8 8 0 0 1 16 0v3" fill="#38bdf8"/></svg>'
  );

// Utilidades
function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function getPlatformFamily(platform) {
  return Object.keys(platformFamilies).find((family) =>
    platformFamilies[family].includes(platform)
  );
}

// Notificaciones Toast
let toastTimer = null;
function showToast(message) {
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

// Autenticación
loginBtn.addEventListener("click", async () => {
  loginBtn.disabled = true;
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    showToast(`Sesión iniciada: ${cred.user.email}`);
  } catch (err) {
    alert("Error al iniciar sesión: " + err.message);
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try {
    await signOut(auth);
    showToast("Sesión cerrada");
  } catch (err) {
    alert("Error al cerrar sesión: " + err.message);
  } finally {
    logoutBtn.disabled = false;
  }
});

userAvatar.addEventListener("error", () => {
  console.warn("No se pudo cargar el avatar del perfil.");
  if (userAvatar.getAttribute("src") === defaultAvatar) {
    userAvatar.hidden = true;
  } else {
    userAvatar.src = defaultAvatar;
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  loginBtn.hidden = !!user;
  logoutBtn.hidden = !user;
  loginBtn.disabled = false;
  logoutBtn.disabled = false;
  userBadge.hidden = !user;
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.hidden = !user;
  });

  userAvatar.hidden = false;
  if (user) {
    userBadge.title = user.email || "";
    userName.textContent = user.displayName ? user.displayName.split(" ")[0] : user.email;
    userAvatar.src =
      user.photoURL ||
      user.providerData.find((provider) => provider.providerId === "google.com")?.photoURL ||
      defaultAvatar;
  } else {
    userBadge.removeAttribute("title");
    userName.textContent = "";
    userAvatar.removeAttribute("src");
  }

  renderGames();
});

// Escucha en tiempo real de Firestore
onSnapshot(
  gamesCol,
  (snapshot) => {
    allGames = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    allGames.sort((a, b) =>
      (platformOrder.get(a.platform) ?? platformOrder.size) -
        (platformOrder.get(b.platform) ?? platformOrder.size) ||
      (a.platform || "").localeCompare(b.platform || "", "es", { sensitivity: "base" }) ||
      (a.title || "").localeCompare(b.title || "", "es", { sensitivity: "base" })
    );
    updateStats();
    renderGames();
  },
  (error) => {
    console.error("Error leyendo Firestore:", error);
    statsBarEl.textContent = "Error al conectar con la base de datos.";
  }
);

function updateStats() {
  const owned = allGames.filter((g) => g.status === "owned").length;
  const wishlist = allGames.filter((g) => g.status === "wishlist").length;
  statsBarEl.textContent = `Tengo: ${owned} · Quiero: ${wishlist}`;
}

function renderGames() {
  const normQuery = normalize(searchQuery);

  const filtered = allGames.filter((game) => {
    if (filterStatus !== "all" && game.status !== filterStatus) return false;
    if (filterFamily !== "ALL" && getPlatformFamily(game.platform) !== filterFamily) return false;
    if (filterPlatform !== "ALL" && game.platform !== filterPlatform) return false;
    if (normQuery) {
      const haystack = `${normalize(game.title)} ${normalize(game.notes)}`;
      if (!haystack.includes(normQuery)) return false;
    }
    return true;
  });

  gamesListEl.innerHTML = "";
  emptyStateEl.hidden = filtered.length > 0;

  const gamesByPlatform = new Map();
  filtered.forEach((game) => {
    const platform = game.platform || "";
    if (!gamesByPlatform.has(platform)) gamesByPlatform.set(platform, []);
    gamesByPlatform.get(platform).push(game);
  });

  gamesByPlatform.forEach((games, platform) => {
    const section = document.createElement("section");
    const headingId = `console-heading-${gamesListEl.childElementCount}`;
    section.className = "console-section";
    section.setAttribute("aria-labelledby", headingId);
    section.innerHTML = `
      <div class="console-header">
        <h2 id="${headingId}" class="console-heading">${escapeHtml(platform || "Sin consola")}</h2>
        <span class="console-count">${games.length} ${games.length === 1 ? "juego" : "juegos"}</span>
      </div>
    `;

    const cards = document.createElement("div");
    cards.className = "console-games";
    games.forEach((game) => cards.appendChild(createGameCard(game)));
    section.appendChild(cards);
    gamesListEl.appendChild(section);
  });
}

function createGameCard(game) {
  const card = document.createElement("article");
  card.className = "game-card";

  const statusLabel = game.status === "owned" ? "Lo tengo" : "Lo quiero";
  const statusClass = game.status === "owned" ? "badge-owned" : "badge-wishlist";
  const platformFamily = getPlatformFamily(game.platform);
  const platformClass = platformFamily ? `badge-${platformFamily}` : "";
  const exceptionBadge =
    game.physicalIntegrity === "exception"
      ? `<span class="badge badge-exception">Excepción</span>`
      : "";
  const notesHtml = game.notes
    ? `<p class="game-notes">${escapeHtml(game.notes)}</p>`
    : "";

  const adminButtons = currentUser
    ? `<div class="card-actions">
        ${
          game.status === "wishlist"
            ? `<button class="btn btn-primary btn-sm action-acquire" data-id="${game.id}">✓ Ya lo tengo</button>`
            : ""
        }
        <button class="btn btn-secondary btn-sm action-edit" data-id="${game.id}">Editar</button>
      </div>`
    : "";

  card.innerHTML = `
    <div class="game-info">
      <div class="game-title">${escapeHtml(game.title)}</div>
      <div class="badges">
        <span class="badge badge-platform ${platformClass}">${escapeHtml(game.platform)}</span>
        <span class="badge ${statusClass}">${statusLabel}</span>
        ${exceptionBadge}
      </div>
      ${notesHtml}
    </div>
    ${adminButtons}
  `;

  return card;
}

// Eventos de búsqueda y filtros
searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  clearSearchBtn.hidden = !searchQuery;
  renderGames();
});

clearSearchBtn.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  clearSearchBtn.hidden = true;
  renderGames();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    filterStatus = tab.dataset.status;
    renderGames();
  });
});

platformFiltersEl.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-family]");
  if (!pill) return;

  filterFamily = pill.dataset.family;
  filterPlatform = "ALL";
  platformFiltersEl.querySelectorAll(".pill").forEach((button) => {
    const selected = button === pill;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  consoleFiltersEl.replaceChildren();
  consoleFiltersEl.hidden = filterFamily === "ALL";
  if (filterFamily !== "ALL") {
    consoleFiltersEl.setAttribute("aria-label", `Consolas de ${pill.textContent}`);
    ["ALL", ...platformFamilies[filterFamily]].forEach((platform) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = platform === "ALL" ? "pill active" : "pill";
      button.dataset.platform = platform;
      button.textContent = platform === "ALL" ? "Todas" : platform;
      button.setAttribute("aria-pressed", String(platform === "ALL"));
      consoleFiltersEl.appendChild(button);
    });
  }
  renderGames();
});

consoleFiltersEl.addEventListener("click", (e) => {
  const pill = e.target.closest("[data-platform]");
  if (!pill) return;

  filterPlatform = pill.dataset.platform;
  consoleFiltersEl.querySelectorAll(".pill").forEach((button) => {
    const selected = button === pill;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderGames();
});

// Acciones rápidas en tarjetas
gamesListEl.addEventListener("click", async (e) => {
  const acquireBtn = e.target.closest(".action-acquire");
  if (acquireBtn) {
    const id = acquireBtn.dataset.id;
    try {
      await updateDoc(doc(db, "games", id), {
        status: "owned",
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      alert("Sin permisos de escritura: " + err.message);
    }
    return;
  }

  const editBtn = e.target.closest(".action-edit");
  if (editBtn) {
    const game = allGames.find((g) => g.id === editBtn.dataset.id);
    if (game) openModal(game);
  }
});

// Modal Añadir / Editar + Warning de duplicados
function openModal(game = null) {
  duplicateWarning.hidden = true;
  if (game) {
    modalTitle.textContent = "Editar juego";
    gameIdInput.value = game.id;
    titleInput.value = game.title;
    platformInput.value = game.platform;
    statusInput.value = game.status;
    integrityInput.value = game.physicalIntegrity || "complete";
    notesInput.value = game.notes || "";
    deleteBtn.hidden = false;
  } else {
    modalTitle.textContent = "Añadir juego";
    gameForm.reset();
    gameIdInput.value = "";
    if (filterPlatform !== "ALL") {
      platformInput.value = filterPlatform;
    } else if (filterFamily !== "ALL") {
      platformInput.value = platformFamilies[filterFamily][0];
    }
    if (filterStatus !== "all") statusInput.value = filterStatus;
    deleteBtn.hidden = true;
  }
  gameModal.showModal();
}

titleInput.addEventListener("input", () => {
  const norm = normalize(titleInput.value);
  const editingId = gameIdInput.value;

  if (norm.length < 3) {
    duplicateWarning.hidden = true;
    return;
  }

  const matches = allGames.filter((g) => {
    if (g.id === editingId) return false;
    const gNorm = normalize(g.title);
    return gNorm === norm || gNorm.includes(norm) || norm.includes(gNorm);
  });

  if (matches.length > 0) {
    const list = matches
      .map(
        (m) =>
          `• ${escapeHtml(m.title)} (${escapeHtml(m.platform)} — ${
            m.status === "owned" ? "Lo tengo" : "Lo quiero"
          })`
      )
      .join("<br>");
    duplicateWarning.innerHTML = `<strong>Aviso: ya tienes un título similar registrado</strong>${list}`;
    duplicateWarning.hidden = false;
  } else {
    duplicateWarning.hidden = true;
  }
});

document.getElementById("btn-add").addEventListener("click", () => openModal());
document.getElementById("close-modal").addEventListener("click", () => gameModal.close());
document.getElementById("cancel-modal").addEventListener("click", () => gameModal.close());

gameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = gameIdInput.value;
  const payload = {
    title: titleInput.value.trim(),
    platform: platformInput.value,
    status: statusInput.value,
    physicalIntegrity: integrityInput.value,
    notes: notesInput.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    if (id) {
      await updateDoc(doc(db, "games", id), payload);
    } else {
      await addDoc(gamesCol, payload);
    }
    gameModal.close();
  } catch (err) {
    alert("No se pudo guardar (comprueba que has entrado con tu cuenta autorizada): " + err.message);
  }
});

deleteBtn.addEventListener("click", async () => {
  const id = gameIdInput.value;
  if (!id || !confirm("¿Seguro que quieres eliminar este juego?")) return;
  try {
    await deleteDoc(doc(db, "games", id));
    gameModal.close();
  } catch (err) {
    alert("Error al eliminar: " + err.message);
  }
});

// Backup e Importación JSON
document.getElementById("btn-backup").addEventListener("click", () => {
  document.getElementById("import-feedback").textContent = "";
  backupModal.showModal();
});
document.getElementById("close-backup").addEventListener("click", () => backupModal.close());

document.getElementById("btn-export-json").addEventListener("click", () => {
  const cleanData = allGames.map(({ title, platform, status, physicalIntegrity, notes }) => ({
    title,
    platform,
    status,
    physicalIntegrity: physicalIntegrity || "complete",
    notes: notes || ""
  }));
  const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `coleccion-juegos-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("input-import-json").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const feedback = document.getElementById("import-feedback");
  try {
    const text = await file.text();
    const items = JSON.parse(text);
    if (!Array.isArray(items)) throw new Error("El JSON debe ser una lista de juegos.");

    const batch = writeBatch(db);
    items.forEach((item) => {
      if (!item.title || !item.platform) return;
      const newRef = doc(gamesCol);
      batch.set(newRef, {
        title: String(item.title).trim(),
        platform: String(item.platform).trim(),
        status: item.status === "wishlist" ? "wishlist" : "owned",
        physicalIntegrity: item.physicalIntegrity === "exception" ? "exception" : "complete",
        notes: item.notes ? String(item.notes).trim() : "",
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    feedback.textContent = `Se han importado ${items.length} juegos correctamente.`;
  } catch (err) {
    feedback.textContent = "Error al importar: " + err.message;
  }
  e.target.value = "";
});