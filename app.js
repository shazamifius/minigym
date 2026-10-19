/**
 * Duo & Santé - Shaza & darling
 * Interface Mobile Premium inspirée de Revolut pour les pompes,
 * Agenda 2D interactif avec gommettes de santé & synchronisation Firebase en temps réel.
 */

(function () {
  'use strict';

  // --- Clés de Stockage ---
  const STORAGE_KEY = 'duo_sante_data_v4';
  const CONFIG_KEY = 'duo_sante_config_v4';

  // --- Configuration Initiale ---
  let config = {
    myIdentity: 'user1', // 'user1' (Shaza) ou 'user2' (darling)
    activeLoggerUser: 'user1',
    activeAgendaOwner: 'user2', // Par défaut : l'agenda de darling
    activeProfileStats: 'user1'
  };

  let fbConfig = {
    room: 'shaza-darling',
    databaseURL: 'https://sante-2003b-default-rtdb.firebaseio.com'
  };

  // Base de données structurée
  let appData = {
    version: 4,
    lastUpdated: new Date().toISOString(),
    users: {
      user1: { id: 'user1', name: 'Shaza', color: '#4ade80', logs: [] },
      user2: { id: 'user2', name: 'darling', color: '#f43f5e', logs: [] }
    },
    health: {
      stickers: [
        { id: 'stk_matin', name: 'Matin', color: '#38bdf8' },
        { id: 'stk_midi', name: 'Midi', color: '#fbbf24' },
        { id: 'stk_soir', name: 'Soir', color: '#a855f7' },
        { id: 'stk_soin', name: 'Traitement', color: '#f43f5e' },
        { id: 'stk_repos', name: 'Repos', color: '#10b981' }
      ],
      calendar: {
        user1: {},
        user2: {}
      }
    }
  };

  // État local
  let revolutInputValue = 0;
  let currentMonthDate = new Date();
  let activeSelectedStickerId = null;
  let firebaseDb = null;
  let isFirebaseConnected = false;
  let lastLoggedInfo = null;
  let undoTimeout = null;

  // Sélecteur utilitaire
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- Initialisation ---
  function init() {
    loadLocalConfig();
    checkUrlParams();
    loadLocalData();
    ensureDataStructure();
    initFirebase();
    setupEventListeners();
    setupRevolutKeypad();
    setupNavigation();
    updateUI();
    generateShareUrl();
  }

  // Vérifier si le lien a été ouvert avec ?role=copine ou ?role=darling
  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (role === 'copine' || role === 'darling' || role === 'user2') {
      config.myIdentity = 'user2';
      config.activeLoggerUser = 'user2';
      config.activeAgendaOwner = 'user2';
      saveConfig();
      showToast('🌸 Espace darling connecté');
    }
  }

  function loadLocalConfig() {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) config = { ...config, ...JSON.parse(savedConfig) };

      $('myIdentitySelect').value = config.myIdentity || 'user1';
      $('firebaseRoomInput').value = fbConfig.room;
      $('firebaseDbUrlInput').value = fbConfig.databaseURL;
    } catch (e) {}
  }

  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {}
  }

  // Garantir qu'aucune clé n'est undefined même si Firebase supprime les objets vides
  function ensureDataStructure() {
    if (!appData) appData = {};
    if (!appData.users) appData.users = {};
    if (!appData.users.user1) appData.users.user1 = { id: 'user1', name: 'Shaza', color: '#4ade80', logs: [] };
    if (!appData.users.user2) appData.users.user2 = { id: 'user2', name: 'darling', color: '#f43f5e', logs: [] };
    if (!Array.isArray(appData.users.user1.logs)) appData.users.user1.logs = [];
    if (!Array.isArray(appData.users.user2.logs)) appData.users.user2.logs = [];

    if (!appData.health) appData.health = {};
    if (!Array.isArray(appData.health.stickers) || appData.health.stickers.length === 0) {
      appData.health.stickers = [
        { id: 'stk_matin', name: 'Matin', color: '#38bdf8' },
        { id: 'stk_midi', name: 'Midi', color: '#fbbf24' },
        { id: 'stk_soir', name: 'Soir', color: '#a855f7' },
        { id: 'stk_soin', name: 'Traitement', color: '#f43f5e' },
        { id: 'stk_repos', name: 'Repos', color: '#10b981' }
      ];
    }
    if (!appData.health.calendar) appData.health.calendar = {};
    if (!appData.health.calendar.user1) appData.health.calendar.user1 = {};
    if (!appData.health.calendar.user2) appData.health.calendar.user2 = {};
  }

  function loadLocalData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.users) {
          appData = parsed;
        }
      }
    } catch (e) {}
  }

  function saveLocalData() {
    try {
      ensureDataStructure();
      appData.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {}
  }

  // --- Connexion & Synchronisation Firebase ---
  function initFirebase() {
    if (!fbConfig.databaseURL) {
      updateSyncBadge('offline', 'Mode Local');
      return;
    }

    try {
      if (window.firebase && firebase.apps && !firebase.apps.length) {
        firebase.initializeApp({
          databaseURL: fbConfig.databaseURL
        });
      }

      if (window.firebase && firebase.database) {
        firebaseDb = firebase.database();
        const roomRef = firebaseDb.ref(fbConfig.room);

        updateSyncBadge('syncing', 'Connexion...');

        roomRef.on(
          'value',
          (snapshot) => {
            const val = snapshot.val();
            if (val && val.users) {
              appData = val;
              ensureDataStructure();
              saveLocalData();
              updateUI();
              updateSyncBadge('synced', 'En direct');
            } else {
              // Initialiser la base si vide
              ensureDataStructure();
              roomRef.set(appData).catch(() => {});
              updateSyncBadge('synced', 'En direct');
            }
            isFirebaseConnected = true;
          },
          (err) => {
            console.warn('Firebase sync info:', err.message);
            updateSyncBadge('offline', 'Mode Local');
          }
        );
      }
    } catch (err) {
      console.warn('Firebase init:', err);
      updateSyncBadge('offline', 'Mode Local');
    }
  }

  function syncDataToFirebase() {
    ensureDataStructure();
    saveLocalData();
    if (firebaseDb && fbConfig.room) {
      updateSyncBadge('syncing', 'Envoi...');
      firebaseDb
        .ref(fbConfig.room)
        .set(appData)
        .then(() => updateSyncBadge('synced', 'En direct'))
        .catch(() => updateSyncBadge('offline', 'Mode Local'));
    }
  }

  function updateSyncBadge(status, text) {
    const dot = $('syncDot');
    const label = $('syncText');
    if (dot && label) {
      dot.className = 'status-dot ' + status;
      label.textContent = text;
    }
  }

  // --- Audio Haptics & Effets Sonores ---
  function playSound(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'key') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'sticker') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch (e) {}

    if (navigator.vibrate) {
      try {
        navigator.vibrate(type === 'success' ? [40, 30, 60] : [25]);
      } catch (e) {}
    }
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('toast-visible');
    setTimeout(() => t.classList.remove('toast-visible'), 2400);
  }

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDateFrench(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  // --- Module Clavier & Input Style Revolut ---
  function setupRevolutKeypad() {
    // Chiffres et touches du clavier
    $$('.keypad-key').forEach((key) => {
      key.addEventListener('click', () => {
        const keyVal = key.dataset.key;
        playSound('key');

        if (keyVal === 'clear') {
          revolutInputValue = 0;
        } else if (keyVal === 'backspace') {
          const str = String(revolutInputValue);
          if (str.length <= 1) {
            revolutInputValue = 0;
          } else {
            revolutInputValue = parseInt(str.slice(0, -1), 10) || 0;
          }
        } else {
          // Ajouter le chiffre
          const str = String(revolutInputValue);
          if (str === '0') {
            revolutInputValue = parseInt(keyVal, 10);
          } else if (str.length < 4) {
            // Maximum 9999 pompes
            revolutInputValue = parseInt(str + keyVal, 10);
          }
        }

        updateRevolutDisplay();
      });
    });

    // Boutons de presets rapides (+5, +10, +15, +20, +50)
    $$('.preset-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const addVal = parseInt(pill.dataset.add, 10);
        playSound('key');
        revolutInputValue = Math.min(9999, revolutInputValue + addVal);
        updateRevolutDisplay();
      });
    });

    // Bouton de validation de la série
    $('revolutSubmitBtn').addEventListener('click', () => {
      if (revolutInputValue <= 0) return;
      submitRevolutReps(revolutInputValue);
      revolutInputValue = 0;
      updateRevolutDisplay();
    });

    // Sélecteur d'acteur pour la saisie (Noter pour Shaza / Noter pour darling)
    $('selectP1Btn').addEventListener('click', () => {
      config.activeLoggerUser = 'user1';
      $('selectP1Btn').classList.add('active');
      $('selectP2Btn').classList.remove('active');
      $('cardPartnerP1').classList.add('active-selected');
      $('cardPartnerP2').classList.remove('active-selected');
      $('revolutTargetBadge').textContent = `Pour ${appData.users.user1.name}`;
    });

    $('selectP2Btn').addEventListener('click', () => {
      config.activeLoggerUser = 'user2';
      $('selectP2Btn').classList.add('active');
      $('selectP1Btn').classList.remove('active');
      $('cardPartnerP2').classList.add('active-selected');
      $('cardPartnerP1').classList.remove('active-selected');
      $('revolutTargetBadge').textContent = `Pour ${appData.users.user2.name}`;
    });
  }

  function updateRevolutDisplay() {
    $('revolutCurrentInput').textContent = revolutInputValue;
    const submitBtn = $('revolutSubmitBtn');

    if (revolutInputValue > 0) {
      submitBtn.disabled = false;
      const targetName = appData.users[config.activeLoggerUser || 'user1']?.name || 'Duo';
      submitBtn.querySelector('span').textContent = `AJOUTER +${revolutInputValue} POMPES (${targetName})`;
    } else {
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = 'VALIDER LA SÉRIE';
    }
  }

  function submitRevolutReps(count) {
    ensureDataStructure();
    const userId = config.activeLoggerUser || 'user1';
    const user = appData.users[userId];
    if (!user) return;

    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      date: getTodayString(),
      count: count
    };

    user.logs.unshift(logItem);
    lastLoggedInfo = { userId, logId: logItem.id };

    playSound('success');
    showToast(`💪 +${count} pompes ajoutées pour ${user.name} !`);

    // Afficher la barre d'annulation temporaire
    $('undoText').textContent = `${user.name} : +${count} pompes`;
    $('undoBar').style.display = 'flex';
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      $('undoBar').style.display = 'none';
      lastLoggedInfo = null;
    }, 8000);

    updateUI();
    syncDataToFirebase();
  }

  function undoLastLog() {
    if (!lastLoggedInfo) return;
    ensureDataStructure();
    const { userId, logId } = lastLoggedInfo;
    const user = appData.users[userId];
    if (user && user.logs) {
      const idx = user.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        const removed = user.logs.splice(idx, 1)[0];
        updateUI();
        syncDataToFirebase();
        $('undoBar').style.display = 'none';
        lastLoggedInfo = null;
        showToast(`Série de ${removed.count} annulée`);
      }
    }
  }

  function deleteLog(userId, logId) {
    ensureDataStructure();
    const user = appData.users[userId];
    if (user && user.logs) {
      const idx = user.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        user.logs.splice(idx, 1);
        updateUI();
        syncDataToFirebase();
        showToast('Série supprimée');
      }
    }
  }

  function getTodayCount(userId) {
    ensureDataStructure();
    const user = appData.users[userId];
    if (!user || !user.logs) return 0;
    const todayStr = getTodayString();
    return user.logs
      .filter((l) => l.date === todayStr)
      .reduce((sum, l) => sum + (l.count || 0), 0);
  }

  // --- Module Agenda 2D & Gommettes ---
  function getAgendaStickers(userId, dateStr) {
    ensureDataStructure();
    return appData.health.calendar[userId]?.[dateStr] || [];
  }

  function toggleStickerOnDay(userId, dateStr, stickerId) {
    ensureDataStructure();
    if (!appData.health.calendar[userId][dateStr]) {
      appData.health.calendar[userId][dateStr] = [];
    }

    let dayStickers = appData.health.calendar[userId][dateStr];
    const existingIndex = dayStickers.findIndex((s) => s.stickerId === stickerId);
    const def = (appData.health.stickers || []).find((s) => s.id === stickerId) || { name: 'Gommette' };

    if (existingIndex !== -1) {
      // Décoller
      dayStickers.splice(existingIndex, 1);
      playSound('key');
      showToast(`Gommette "${def.name}" retirée`);
    } else {
      // Coller
      dayStickers.push({
        id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        stickerId: stickerId,
        taken: false,
        addedAt: new Date().toISOString()
      });
      playSound('sticker');
      showToast(`✨ "${def.name}" collée sur le ${formatDateFrench(dateStr)} !`);
    }

    appData.health.calendar[userId][dateStr] = dayStickers;
    renderCalendar();
    syncDataToFirebase();
  }

  function toggleStickerTaken(userId, dateStr, entryId) {
    ensureDataStructure();
    const dayStickers = appData.health.calendar[userId]?.[dateStr] || [];
    const entry = dayStickers.find((s) => s.id === entryId);
    if (entry) {
      entry.taken = !entry.taken;
      playSound(entry.taken ? 'success' : 'key');
      showToast(entry.taken ? 'Validé ✓ Traitement pris' : 'Statut réinitialisé');
      renderCalendar();
      syncDataToFirebase();
    }
  }

  // --- Rendu & Mise à Jour de l'Agenda 2D ---
  function renderCalendar() {
    ensureDataStructure();
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    $('calCurrentMonthTitle').textContent = currentMonthDate.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });

    renderStickersRibbon();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDay.getDate();
    const startDayIndex = (firstDay.getDay() + 6) % 7; // 0 = Lundi

    const grid = $('calendarMonthGrid');
    grid.innerHTML = '';

    const todayStr = getTodayString();
    const agendaOwner = config.activeAgendaOwner || 'user2';

    // Jours du mois précédent (grisés)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const prevNum = prevMonthLastDay - i;
      const cell = document.createElement('div');
      cell.className = 'cal-day-card other-month-day';
      cell.innerHTML = `<div class="cal-day-num-row"><span>${prevNum}</span></div>`;
      grid.appendChild(cell);
    }

    // Jours du mois (1 à 30/31)
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month + 1).padStart(2, '0');
      const fullDateStr = `${year}-${monthStr}-${dayStr}`;

      const isToday = fullDateStr === todayStr;
      const dayStickers = getAgendaStickers(agendaOwner, fullDateStr);

      const cell = document.createElement('div');
      cell.className = `cal-day-card ${isToday ? 'is-today-day' : ''}`;
      cell.dataset.date = fullDateStr;

      let stickersHtml = '';
      dayStickers.forEach((item) => {
        const def = (appData.health.stickers || []).find((s) => s.id === item.stickerId) || {
          name: 'Gommette',
          color: '#38bdf8'
        };
        stickersHtml += `
          <div class="sticker-chip-tag ${item.taken ? 'taken-checked' : ''}" style="background-color: ${def.color};">
            <span>${def.name}</span>
            <span>${item.taken ? '✓' : ''}</span>
          </div>`;
      });

      cell.innerHTML = `
        <div class="cal-day-num-row">
          <span>${day}</span>
          ${isToday ? '<span class="today-micro-badge">AUJ</span>' : ''}
        </div>
        <div class="cal-day-stickers-container">${stickersHtml}</div>`;

      // Clic sur une case du calendrier
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeSelectedStickerId) {
          // Mode collage actif : coller ou décoller directement
          toggleStickerOnDay(agendaOwner, fullDateStr, activeSelectedStickerId);
        } else {
          // Mode consultation : ouvrir le détail de la journée
          openDayDetailModal(agendaOwner, fullDateStr);
        }
      });

      grid.appendChild(cell);
    }

    // Compléter la grille
    const totalCells = startDayIndex + totalDaysInMonth;
    const remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
      for (let nextDay = 1; nextDay <= remaining; nextDay++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day-card other-month-day';
        cell.innerHTML = `<div class="cal-day-num-row"><span>${nextDay}</span></div>`;
        grid.appendChild(cell);
      }
    }
  }

  function renderStickersRibbon() {
    ensureDataStructure();
    const ribbon = $('stickersRibbon');
    ribbon.innerHTML = '';

    const stickers = appData.health.stickers || [];
    stickers.forEach((stk) => {
      const chip = document.createElement('div');
      chip.className = `sticker-swatch-item ${activeSelectedStickerId === stk.id ? 'stamp-active' : ''}`;
      chip.style.backgroundColor = stk.color;
      chip.innerHTML = `<span>●</span><span>${stk.name}</span>`;

      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeSelectedStickerId === stk.id) {
          // Désactiver le mode collage
          activeSelectedStickerId = null;
          $('activeStickerAlert').style.display = 'none';
        } else {
          // Activer le mode collage
          activeSelectedStickerId = stk.id;
          playSound('key');
          $('activeStickerAlert').style.display = 'flex';
          $('activeStickerAlertText').textContent = `Gommette "${stk.name}" en main ! Touche les jours du calendrier pour la coller.`;
        }
        renderStickersRibbon();
      });

      ribbon.appendChild(chip);
    });
  }

  function openDayDetailModal(userId, dateStr) {
    ensureDataStructure();
    $('dayDetailModalDate').textContent = formatDateFrench(dateStr);
    const list = $('dayDetailStickersList');
    list.innerHTML = '';

    const dayStickers = getAgendaStickers(userId, dateStr);

    if (dayStickers.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 12px 0; font-size: 12px;">Aucun traitement programmé pour ce jour.</div>`;
    } else {
      dayStickers.forEach((entry) => {
        const def = (appData.health.stickers || []).find((s) => s.id === entry.stickerId) || {
          name: 'Gommette',
          color: '#38bdf8'
        };

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.background = 'rgba(255, 255, 255, 0.04)';
        row.style.border = '1px solid var(--border)';
        row.style.padding = '10px 14px';
        row.style.borderRadius = '12px';
        row.style.borderLeft = `4px solid ${def.color}`;

        row.innerHTML = `
          <div>
            <div style="font-size:13px; font-weight:700; ${entry.taken ? 'text-decoration:line-through; opacity:0.5;' : ''}">${def.name}</div>
            <div style="font-size:10px; color:var(--text-dim);">${entry.taken ? 'Pris ✓' : 'À prendre'}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="cal-btn-mini" style="font-size:11px;" id="toggleDone_${entry.id}">
              ${entry.taken ? 'Annuler' : 'Valider ✓'}
            </button>
            <button class="cal-btn-mini" style="font-size:11px; color:#f43f5e;" id="delStk_${entry.id}">✕</button>
          </div>`;

        list.appendChild(row);

        row.querySelector(`#toggleDone_${entry.id}`).addEventListener('click', () => {
          toggleStickerTaken(userId, dateStr, entry.id);
          openDayDetailModal(userId, dateStr);
        });

        row.querySelector(`#delStk_${entry.id}`).addEventListener('click', () => {
          toggleStickerOnDay(userId, dateStr, entry.stickerId);
          openDayDetailModal(userId, dateStr);
        });
      });
    }

    // Nuancier rapide pour ajouter sur ce jour
    const addList = $('dayDetailAddList');
    addList.innerHTML = '';
    (appData.health.stickers || []).forEach((stk) => {
      const btn = document.createElement('button');
      btn.className = 'sticker-swatch-item';
      btn.style.backgroundColor = stk.color;
      btn.innerHTML = `+ ${stk.name}`;
      btn.addEventListener('click', () => {
        toggleStickerOnDay(userId, dateStr, stk.id);
        openDayDetailModal(userId, dateStr);
      });
      addList.appendChild(btn);
    });

    $('dayDetailModal').classList.add('sheet-open');
  }

  // --- Rendu Global UI & Stats ---
  function updateUI() {
    ensureDataStructure();
    renderDuoOverview();
    renderActivityFeed();
    renderCalendar();
    renderProfileStats();
    renderHeatmap();
    updateFormFields();
  }

  function renderDuoOverview() {
    const u1 = appData.users.user1;
    const u2 = appData.users.user2;

    $('p1DisplayName').textContent = u1.name;
    $('p2DisplayName').textContent = u2.name;

    $('selectP1Btn').textContent = `Noter pour ${u1.name}`;
    $('selectP2Btn').textContent = `Noter pour ${u2.name}`;

    $('profTabP1').textContent = u1.name;
    $('profTabP2').textContent = u2.name;

    $('agendaOwnerP1Btn').querySelector('span').textContent = `Agenda de ${u1.name}`;
    $('agendaOwnerP2Btn').querySelector('span').textContent = `Agenda de ${u2.name}`;

    const score1 = getTodayCount('user1');
    const score2 = getTodayCount('user2');

    $('p1Score').textContent = score1;
    $('p2Score').textContent = score2;
  }

  function renderActivityFeed() {
    ensureDataStructure();
    const logs1 = (appData.users.user1?.logs || []).map((l) => ({ ...l, userKey: 'user1' }));
    const logs2 = (appData.users.user2?.logs || []).map((l) => ({ ...l, userKey: 'user2' }));
    const allLogs = [...logs1, ...logs2].sort((a, b) => b.timestamp - a.timestamp);

    const todayStr = getTodayString();
    const todayLogs = allLogs.filter((l) => l.date === todayStr);
    $('totalLogsToday').textContent = `${todayLogs.length} série${todayLogs.length > 1 ? 's' : ''}`;

    const list = $('activityList');
    if (allLogs.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px 0; font-size: 12px;">Aucune série pour l'instant aujourd'hui.</div>`;
      return;
    }

    let html = '';
    allLogs.slice(0, 10).forEach((item) => {
      const user = appData.users[item.userKey];
      const isToday = item.date === todayStr;
      const timeStr = new Date(item.timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateLabel = isToday ? `Aujourd'hui à ${timeStr}` : `${item.date} à ${timeStr}`;

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border); padding:10px 14px; border-radius:12px; font-size:12px; border-left:3px solid ${user.color};">
          <div>
            <strong>${user.name}</strong> <span style="font-family:var(--font-display); font-weight:700; margin-left:6px; color:#fff;">+${item.count}</span>
            <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">${dateLabel}</div>
          </div>
          <button style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; padding:4px;" data-user="${item.userKey}" data-id="${item.id}" class="act-del-btn">✕</button>
        </div>`;
    });

    list.innerHTML = html;

    list.querySelectorAll('.act-del-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        deleteLog(e.currentTarget.dataset.user, e.currentTarget.dataset.id);
      });
    });
  }

  // --- Statistiques & Heatmap Carrés Verts ---
  function calculateStats(userId) {
    ensureDataStructure();
    const user = appData.users[userId];
    const logs = user.logs || [];
    const total = logs.reduce((sum, l) => sum + (l.count || 0), 0);

    const dayMap = {};
    logs.forEach((l) => {
      dayMap[l.date] = (dayMap[l.date] || 0) + (l.count || 0);
    });

    const activeDays = Object.keys(dayMap).length;
    let bestDay = 0;
    for (const d in dayMap) {
      if (dayMap[d] > bestDay) bestDay = dayMap[d];
    }
    const avg = activeDays > 0 ? Math.round(total / activeDays) : 0;

    let streak = 0;
    const today = new Date();
    let checkDate = new Date(today);
    const todayStr = getTodayString();
    if (!dayMap[todayStr]) checkDate.setDate(checkDate.getDate() - 1);

    while (true) {
      const y = checkDate.getFullYear();
      const m = String(checkDate.getMonth() + 1).padStart(2, '0');
      const d = String(checkDate.getDate()).padStart(2, '0');
      const dStr = `${y}-${m}-${d}`;
      if (dayMap[dStr] && dayMap[dStr] > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return { total, bestDay, avg, streak, dayMap };
  }

  function renderProfileStats() {
    const pKey = config.activeProfileStats || 'user1';
    const stats = calculateStats(pKey);

    $('kpiTotal').textContent = stats.total.toLocaleString('fr-FR');
    $('kpiStreak').textContent = `${stats.streak} j`;
    $('kpiBest').textContent = stats.bestDay.toLocaleString('fr-FR');
    $('kpiAvg').textContent = `${stats.avg} / j`;
  }

  function renderHeatmap() {
    const pKey = config.activeProfileStats || 'user1';
    const stats = calculateStats(pKey);
    const user = appData.users[pKey];
    const dayMap = stats.dayMap;

    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + (6 - dayOfWeek));

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (52 * 7 - 1));

    $('heatmapGrid').innerHTML = '';
    $('heatmapMonths').innerHTML = '';

    let totalYear = 0;
    const monthsRecorded = [];

    const curDate = new Date(startDate);
    for (let w = 0; w < 52; w++) {
      const col = document.createElement('div');
      col.className = 'heatmap-matrix-col';

      for (let d = 0; d < 7; d++) {
        const y = curDate.getFullYear();
        const m = String(curDate.getMonth() + 1).padStart(2, '0');
        const dayNum = String(curDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dayNum}`;

        const isFuture = curDate > today;
        const count = isFuture ? 0 : dayMap[dateStr] || 0;
        totalYear += count;

        let level = 0;
        if (count >= 100) level = 4;
        else if (count >= 50) level = 3;
        else if (count >= 25) level = 2;
        else if (count >= 1) level = 1;

        const cell = document.createElement('div');
        cell.className = 'heatmap-square-cell';
        cell.dataset.level = isFuture ? '0' : level;
        cell.dataset.date = dateStr;
        cell.dataset.count = count;

        if (!isFuture) {
          cell.addEventListener('mouseenter', (e) => {
            const tip = $('heatmap-tooltip');
            tip.textContent = `${count} pompes le ${formatDateFrench(dateStr)}`;
            tip.style.display = 'block';
            const rect = e.currentTarget.getBoundingClientRect();
            tip.style.left = `${rect.left + rect.width / 2}px`;
            tip.style.top = `${rect.top - 6}px`;
          });
          cell.addEventListener('mouseleave', () => ($('heatmap-tooltip').style.display = 'none'));
        }

        if (d === 0 && curDate.getDate() <= 7) {
          const monthName = curDate.toLocaleDateString('fr-FR', { month: 'short' });
          monthsRecorded.push({ weekIndex: w, name: monthName.replace('.', '') });
        }

        col.appendChild(cell);
        curDate.setDate(curDate.getDate() + 1);
      }

      $('heatmapGrid').appendChild(col);
    }

    monthsRecorded.forEach((m) => {
      const span = document.createElement('span');
      span.textContent = m.name;
      span.style.position = 'absolute';
      span.style.left = `${m.weekIndex * 14}px`;
      span.style.textTransform = 'capitalize';
      $('heatmapMonths').appendChild(span);
    });

    $('heatmapTotalTitle').textContent = `${totalYear.toLocaleString('fr-FR')} pompes sur l'année (${user.name})`;
  }

  function updateFormFields() {
    $('p1NameInput').value = appData.users.user1?.name || 'Shaza';
    $('p2NameInput').value = appData.users.user2?.name || 'darling';
  }

  function generateShareUrl() {
    const baseUrl = window.location.origin + window.location.pathname;
    $('shareUrlInput').value = `${baseUrl}?role=darling`;
  }

  // --- Gestion des Événements & Modals ---
  function setupEventListeners() {
    $('undoBtn').addEventListener('click', undoLastLog);

    // Navigation Calendrier (Mois précédent / suivant)
    $('calPrevMonthBtn').addEventListener('click', () => {
      currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
      renderCalendar();
    });

    $('calNextMonthBtn').addEventListener('click', () => {
      currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
      renderCalendar();
    });

    $('calTodayBtn').addEventListener('click', () => {
      currentMonthDate = new Date();
      renderCalendar();
    });

    // Switcher Propriétaire Agenda
    $('agendaOwnerP2Btn').addEventListener('click', () => {
      config.activeAgendaOwner = 'user2';
      $('agendaOwnerP2Btn').classList.add('active');
      $('agendaOwnerP1Btn').classList.remove('active');
      renderCalendar();
    });

    $('agendaOwnerP1Btn').addEventListener('click', () => {
      config.activeAgendaOwner = 'user1';
      $('agendaOwnerP1Btn').classList.add('active');
      $('agendaOwnerP2Btn').classList.remove('active');
      renderCalendar();
    });

    // Arrêter mode collage
    $('stopPlacingStickerBtn').addEventListener('click', () => {
      activeSelectedStickerId = null;
      $('activeStickerAlert').style.display = 'none';
      renderStickersRibbon();
    });

    // Modal Nouvelle Gommette
    $('openNewStickerModalBtn').addEventListener('click', () => {
      $('newStickerModal').classList.add('sheet-open');
      $('newStickerName').value = '';
    });

    $('closeNewStickerModalBtn').addEventListener('click', () => {
      $('newStickerModal').classList.remove('sheet-open');
    });

    $('saveNewStickerBtn').addEventListener('click', () => {
      const name = $('newStickerName').value.trim();
      const color = $('newStickerColor').value;
      if (!name) return;

      ensureDataStructure();
      appData.health.stickers.push({
        id: 'stk_' + Date.now(),
        name: name,
        color: color
      });

      renderStickersRibbon();
      syncDataToFirebase();
      $('newStickerModal').classList.remove('sheet-open');
      showToast(`Gommette "${name}" ajoutée`);
    });

    $('closeDayDetailModalBtn').addEventListener('click', () => {
      $('dayDetailModal').classList.remove('sheet-open');
    });

    // Modal Partage
    $('openShareModalBtn').addEventListener('click', () => {
      generateShareUrl();
      $('shareModal').classList.add('sheet-open');
    });

    $('closeShareModalBtn').addEventListener('click', () => {
      $('shareModal').classList.remove('sheet-open');
    });

    $('copyShareUrlBtn').addEventListener('click', () => {
      const input = $('shareUrlInput');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('📋 Lien copié ! Envoie-le à darling');
      });
    });

    // Stats Switch
    $('profTabP1').addEventListener('click', () => {
      config.activeProfileStats = 'user1';
      $('profTabP1').classList.add('active');
      $('profTabP2').classList.remove('active');
      renderProfileStats();
      renderHeatmap();
    });

    $('profTabP2').addEventListener('click', () => {
      config.activeProfileStats = 'user2';
      $('profTabP2').classList.add('active');
      $('profTabP1').classList.remove('active');
      renderProfileStats();
      renderHeatmap();
    });

    // Paramètres Profils
    $('saveProfilesBtn').addEventListener('click', () => {
      appData.users.user1.name = $('p1NameInput').value.trim() || 'Shaza';
      appData.users.user2.name = $('p2NameInput').value.trim() || 'darling';
      updateUI();
      syncDataToFirebase();
      showToast('Prénoms enregistrés');
    });

    // Paramètres Firebase
    $('saveFirebaseBtn').addEventListener('click', () => {
      fbConfig.room = $('firebaseRoomInput').value.trim() || 'shaza-darling';
      fbConfig.databaseURL = $('firebaseDbUrlInput').value.trim();
      initFirebase();
      syncDataToFirebase();
      showToast('Firebase synchronisé !');
    });

    // Export / Import
    $('exportDataBtn').addEventListener('click', () => {
      const str = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appData, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', str);
      a.setAttribute('download', `duo_sante_${getTodayString()}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    $('importDataBtn').addEventListener('click', () => $('importFileInput').click());

    $('importFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed && parsed.users) {
            appData = parsed;
            ensureDataStructure();
            updateUI();
            syncDataToFirebase();
            showToast('Données importées');
          }
        } catch (err) {}
      };
      reader.readAsText(file);
    });
  }

  // Navigation par Onglets (Bottom Floating Bar)
  function setupNavigation() {
    $$('.bottom-nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        $$('.bottom-nav-tab').forEach((t) => t.classList.remove('active-tab'));
        $$('.tab-view-container').forEach((v) => v.classList.remove('active-view'));

        tab.classList.add('active-tab');
        const view = $(`view-${targetTab}`);
        if (view) view.classList.add('active-view');

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (targetTab === 'calendar') renderCalendar();
        if (targetTab === 'profile') renderHeatmap();
      });
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
