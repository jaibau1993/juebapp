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

// Estado de la aplicación
let allGames = [];
let currentUser = null;
let filterStatus = "all";
let filterPlatform = "ALL";
let searchQuery = "";

// Referencias DOM
const gamesListEl = document.getElementById("games-list");
const emptyStateEl = document.getElementById("empty-state");
const statsBarEl = document.getElementById("stats-bar");
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search");

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

// Autenticación
document.getElementById("btn-login").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    alert("Error al iniciar sesión: " + err.message);
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  document.getElementById("btn-login").hidden = !!user;
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.hidden = !user;
  });
  renderGames();
});

// Escucha en tiempo real de Firestore
onSnapshot(
  gamesCol,
  (snapshot) => {
    allGames = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    allGames.sort((a, b) =>
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
    if (filterPlatform !== "ALL" && game.platform !== filterPlatform) return false;
    if (normQuery) {
      const haystack = `${normalize(game.title)} ${normalize(game.notes)}`;
      if (!haystack.includes(normQuery)) return false;
    }
    return true;
  });

  gamesListEl.innerHTML = "";
  emptyStateEl.hidden = filtered.length > 0;

  filtered.forEach((game) => {
    const card = document.createElement("article");
    card.className = "game-card";

    const statusLabel = game.status === "owned" ? "Lo tengo" : "Lo quiero";
    const statusClass = game.status === "owned" ? "badge-owned" : "badge-wishlist";
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
          <span class="badge badge-platform">${escapeHtml(game.platform)}</span>
          <span class="badge ${statusClass}">${statusLabel}</span>
          ${exceptionBadge}
        </div>
        ${notesHtml}
      </div>
      ${adminButtons}
    `;

    gamesListEl.appendChild(card);
  });
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

document.querySelectorAll(".pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    filterPlatform = pill.dataset.platform;
    renderGames();
  });
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
    if (filterPlatform !== "ALL") platformInput.value = filterPlatform;
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