/**
 * MiniGym & Santé - Application de Duel de Pompes et Agenda Santé Partagé
 * Hébergée sur GitHub Pages + Synchronisation Firebase Realtime Database
 */

(function () {
  'use strict';

  // --- Clés LocalStorage ---
  const STORAGE_KEY = 'minigym_app_data';
  const CONFIG_KEY = 'minigym_app_config';
  const FIREBASE_KEY = 'minigym_firebase_config';

  // --- Configuration Initiale ---
  let config = {
    myIdentity: 'user1', // 'user1' (Shaza) ou 'user2' (Copine)
    activeLoggerUser: 'user1',
    activeAgendaOwner: 'user2', // Par défaut, on regarde l'agenda de Copine pour sa santé
    activeProfileStats: 'user1'
  };

  let fbConfig = {
    room: 'minigym-shaza-copine',
    apiKey: '',
    databaseURL: ''
  };

  // Base de données par défaut
  let appData = {
    version: 2,
    lastUpdated: new Date().toISOString(),
    users: {
      user1: {
        id: 'user1',
        name: 'Shaza',
        avatar: '⚡',
        color: '#39d353',
        logs: []
      },
      user2: {
        id: 'user2',
        name: 'Copine',
        avatar: '🌸',
        color: '#f43f5e',
        logs: []
      }
    },
    health: {
      stickers: [
        { id: 'stk_matin', name: 'Médicament Matin', icon: '💊', color: '#38bdf8' },
        { id: 'stk_midi', name: 'Médicament Midi', icon: '☀️', color: '#fbbf24' },
        { id: 'stk_soir', name: 'Médicament Soir', icon: '🌙', color: '#c084fc' },
        { id: 'stk_soin', name: 'Soin / Repos', icon: '❤️', color: '#f43f5e' }
      ],
      calendar: {
        user1: {},
        user2: {}
      }
    }
  };

  // État applicatif
  let currentMonthDate = new Date(); // Pour la navigation dans l'agenda
  let activeSelectedSticker = null; // Gommette sélectionnée en main pour le collage
  let selectedEmojiForNewSticker = '💊';
  let firebaseDb = null;
  let isFirebaseConnected = false;
  let lastLoggedId = null;
  let undoTimeout = null;

  // --- Sélecteurs DOM ---
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- Initialisation ---
  function init() {
    loadLocalConfig();
    checkUrlParams();
    loadLocalData();
    initFirebase();
    setupEventListeners();
    setupNavigation();
    updateUI();
    formatCurrentDate();

    // Définir la valeur de l'input de partage
    generateShareUrl();
  }

  // Vérifier les paramètres de l'URL pour la copine (ex: ?role=copine)
  function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    if (roleParam === 'copine' || roleParam === 'user2') {
      config.myIdentity = 'user2';
      config.activeLoggerUser = 'user2';
      config.activeAgendaOwner = 'user2';
      saveConfig();
      showToast('🌸 Bienvenue sur ton espace Copine !');
    }
  }

  // --- Gestion de la Configuration & Stockage Local ---
  function loadLocalConfig() {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        config = { ...config, ...JSON.parse(savedConfig) };
      }
      const savedFb = localStorage.getItem(FIREBASE_KEY);
      if (savedFb) {
        fbConfig = { ...fbConfig, ...JSON.parse(savedFb) };
      }

      $('myIdentitySelect').value = config.myIdentity || 'user1';
      $('firebaseRoomInput').value = fbConfig.room || 'minigym-shaza-copine';
      $('firebaseDbUrlInput').value = fbConfig.databaseURL || '';
      $('firebaseApiKeyInput').value = fbConfig.apiKey || '';
    } catch (e) {
      console.warn('Erreur chargement config', e);
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {}
  }

  function loadLocalData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.users) {
          appData = parsed;
          if (!appData.health) {
            appData.health = {
              stickers: [
                { id: 'stk_matin', name: 'Médicament Matin', icon: '💊', color: '#38bdf8' },
                { id: 'stk_midi', name: 'Médicament Midi', icon: '☀️', color: '#fbbf24' },
                { id: 'stk_soir', name: 'Médicament Soir', icon: '🌙', color: '#c084fc' },
                { id: 'stk_soin', name: 'Soin / Repos', icon: '❤️', color: '#f43f5e' }
              ],
              calendar: { user1: {}, user2: {} }
            };
          }
          if (!appData.health.calendar.user1) appData.health.calendar.user1 = {};
          if (!appData.health.calendar.user2) appData.health.calendar.user2 = {};
        }
      }
    } catch (e) {
      console.warn('Erreur data locale', e);
    }
  }

  function saveLocalData() {
    try {
      appData.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {}
  }

  // --- Initialisation Firebase Realtime Database ---
  function initFirebase() {
    if (!fbConfig.databaseURL && !fbConfig.apiKey) {
      updateSyncBadge('offline', 'Mode Local');
      return;
    }

    try {
      if (window.firebase && firebase.apps && !firebase.apps.length) {
        firebase.initializeApp({
          apiKey: fbConfig.apiKey,
          databaseURL: fbConfig.databaseURL
        });
      }

      if (window.firebase && firebase.database) {
        firebaseDb = firebase.database();
        const roomRef = firebaseDb.ref(fbConfig.room || 'minigym-shaza-copine');

        updateSyncBadge('syncing', 'Connexion...');

        // Écoute en temps réel via WebSocket
        roomRef.on('value', (snapshot) => {
          const val = snapshot.val();
          if (val && val.users) {
            appData = val;
            saveLocalData();
            updateUI();
            updateSyncBadge('synced', 'En direct');
          } else {
            // Première initialisation sur Firebase
            roomRef.set(appData);
            updateSyncBadge('synced', 'En direct');
          }
        });

        isFirebaseConnected = true;
      }
    } catch (err) {
      console.warn('Erreur connexion Firebase:', err);
      updateSyncBadge('offline', 'Mode Local');
    }
  }

  function syncDataToFirebase() {
    saveLocalData();
    if (firebaseDb && fbConfig.room) {
      updateSyncBadge('syncing', 'Envoi...');
      firebaseDb
        .ref(fbConfig.room)
        .set(appData)
        .then(() => {
          updateSyncBadge('synced', 'En direct');
        })
        .catch((err) => {
          console.error(err);
          updateSyncBadge('offline', 'Erreur Firebase');
        });
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

  // --- Audio Feedback & Notifications ---
  function playSound(type = 'rep') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'rep') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'sticker') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // Do
        osc.frequency.setValueAtTime(659.25, now + 0.08); // Mi
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {}
  }

  function showToast(msg, isSuccess = true) {
    const t = $('toast');
    t.textContent = msg;
    t.style.background = isSuccess ? '#238636' : '#da3633';
    t.classList.add('show');
    setTimeout(() => {
      t.classList.remove('show');
    }, 2800);
  }

  function formatCurrentDate() {
    const d = new Date();
    $('todayDateStr').textContent = d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // --- Logique Duel & Pompes ---
  function logPushups(reps, targetUser = null) {
    const userId = targetUser || config.activeLoggerUser || 'user1';
    const user = appData.users[userId];
    if (!user) return;

    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now(),
      date: getTodayString(),
      count: parseInt(reps, 10)
    };

    if (!user.logs) user.logs = [];
    user.logs.unshift(logEntry);
    lastLoggedId = { userId, logId: logEntry.id };

    playSound('rep');
    updateUI();
    syncDataToFirebase();

    $('undoText').textContent = `${user.avatar} ${user.name} : +${reps} pompes validées`;
    $('undoBar').style.display = 'flex';
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      $('undoBar').style.display = 'none';
      lastLoggedId = null;
    }, 8000);

    showToast(`💪 +${reps} pompes pour ${user.name} !`);
  }

  function undoLastLog() {
    if (!lastLoggedId) return;
    const { userId, logId } = lastLoggedId;
    const user = appData.users[userId];
    if (user && user.logs) {
      const idx = user.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        const removed = user.logs.splice(idx, 1)[0];
        updateUI();
        syncDataToFirebase();
        $('undoBar').style.display = 'none';
        lastLoggedId = null;
        showToast(`↩ Série de ${removed.count} pompes annulée.`, false);
      }
    }
  }

  function deleteLog(userId, logId) {
    const user = appData.users[userId];
    if (user && user.logs) {
      const idx = user.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        user.logs.splice(idx, 1);
        updateUI();
        syncDataToFirebase();
        showToast('Série supprimée', false);
      }
    }
  }

  function getTodayCount(userId) {
    const user = appData.users[userId];
    if (!user || !user.logs) return 0;
    const todayStr = getTodayString();
    return user.logs
      .filter((l) => l.date === todayStr)
      .reduce((sum, l) => sum + (l.count || 0), 0);
  }

  // --- Logique Agenda & Gommettes ---
  function getAgendaStickers(userId, dateStr) {
    if (!appData.health || !appData.health.calendar) return [];
    const userCal = appData.health.calendar[userId] || {};
    return userCal[dateStr] || [];
  }

  function toggleStickerOnDay(userId, dateStr, stickerId) {
    if (!appData.health) appData.health = { stickers: [], calendar: {} };
    if (!appData.health.calendar[userId]) appData.health.calendar[userId] = {};

    let dayStickers = appData.health.calendar[userId][dateStr] || [];
    const existingIndex = dayStickers.findIndex((s) => s.stickerId === stickerId);

    const stickerDef = (appData.health.stickers || []).find((s) => s.id === stickerId);
    const stickerName = stickerDef ? stickerDef.name : 'Gommette';

    if (existingIndex !== -1) {
      // Décoller la gommette
      dayStickers.splice(existingIndex, 1);
      showToast(`Gommette "${stickerName}" décollée`);
    } else {
      // Coller la gommette
      dayStickers.push({
        id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        stickerId: stickerId,
        taken: false,
        addedAt: new Date().toISOString()
      });
      playSound('sticker');
      showToast(`✨ Gommette "${stickerName}" collée sur le ${formatDateFrench(dateStr)} !`);
    }

    appData.health.calendar[userId][dateStr] = dayStickers;
    renderCalendar();
    syncDataToFirebase();
  }

  function toggleStickerTaken(userId, dateStr, entryId) {
    const dayStickers = appData.health.calendar[userId]?.[dateStr] || [];
    const entry = dayStickers.find((s) => s.id === entryId);
    if (entry) {
      entry.taken = !entry.taken;
      entry.takenAt = entry.taken ? new Date().toISOString() : null;
      playSound('sticker');
      showToast(entry.taken ? '✅ Médicament marqué comme pris !' : '⏳ Statut réinitialisé');
      renderCalendar();
      syncDataToFirebase();
    }
  }

  // --- Rendu & Mise à Jour Globale de l'UI ---
  function updateUI() {
    renderDuel();
    renderActivityFeed();
    renderCalendar();
    renderProfileStats();
    renderHeatmap();
    renderWeeklyComparison();
    updateFormFields();
  }

  function renderDuel() {
    const u1 = appData.users.user1 || { name: 'Shaza', avatar: '⚡' };
    const u2 = appData.users.user2 || { name: 'Copine', avatar: '🌸' };

    $('p1Name').textContent = u1.name;
    $('p2Name').textContent = u2.name;
    $('p1Avatar').textContent = u1.avatar;
    $('p2Avatar').textContent = u2.avatar;

    $('selectorP1Name').textContent = u1.name;
    $('selectorP2Name').textContent = u2.name;
    $('selectorP1Avatar').textContent = u1.avatar;
    $('selectorP2Avatar').textContent = u2.avatar;

    $('profTabP1').textContent = `${u1.avatar} ${u1.name}`;
    $('profTabP2').textContent = `${u2.avatar} ${u2.name}`;

    $('agendaOwnerP1Name').textContent = u1.name;
    $('agendaOwnerP2Name').textContent = u2.name;
    $('agendaOwnerP1Avatar').textContent = u1.avatar;
    $('agendaOwnerP2Avatar').textContent = u2.avatar;

    const score1 = getTodayCount('user1');
    const score2 = getTodayCount('user2');

    $('p1Score').textContent = score1;
    $('p2Score').textContent = score2;

    if (score1 > score2) {
      $('p1Crown').style.display = 'block';
      $('p2Crown').style.display = 'none';
      $('p1Box').classList.add('leading');
      $('p2Box').classList.remove('leading');
      $('duelDiff').textContent = `+${score1 - score2} pour ${u1.name}`;
      $('duelDiff').style.color = '#39d353';
    } else if (score2 > score1) {
      $('p1Crown').style.display = 'none';
      $('p2Crown').style.display = 'block';
      $('p1Box').classList.remove('leading');
      $('p2Box').classList.add('leading');
      $('duelDiff').textContent = `+${score2 - score1} pour ${u2.name}`;
      $('duelDiff').style.color = '#f43f5e';
    } else {
      $('p1Crown').style.display = 'none';
      $('p2Crown').style.display = 'none';
      $('p1Box').classList.remove('leading');
      $('p2Box').classList.remove('leading');
      $('duelDiff').textContent = score1 === 0 ? 'En attente' : 'Égalité parfaite 🤝';
      $('duelDiff').style.color = '#e3b341';
    }

    const total = score1 + score2;
    if (total === 0) {
      $('p1Bar').style.width = '50%';
      $('p2Bar').style.width = '50%';
    } else {
      const pct1 = Math.max(10, Math.min(90, Math.round((score1 / total) * 100)));
      $('p1Bar').style.width = pct1 + '%';
      $('p2Bar').style.width = 100 - pct1 + '%';
    }
  }

  function renderActivityFeed() {
    const logs1 = (appData.users.user1?.logs || []).map((l) => ({ ...l, userKey: 'user1' }));
    const logs2 = (appData.users.user2?.logs || []).map((l) => ({ ...l, userKey: 'user2' }));
    const allLogs = [...logs1, ...logs2].sort((a, b) => b.timestamp - a.timestamp);

    const todayStr = getTodayString();
    const todayLogs = allLogs.filter((l) => l.date === todayStr);
    $('totalLogsToday').textContent = `${todayLogs.length} série${todayLogs.length > 1 ? 's' : ''} aujourd'hui`;

    if (allLogs.length === 0) {
      $('activityList').innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 13px;">
          Aucune pompe enregistrée pour l'instant aujourd'hui.<br>Lance la première série !
        </div>`;
      return;
    }

    let html = '';
    allLogs.slice(0, 15).forEach((item) => {
      const user = appData.users[item.userKey];
      const isToday = item.date === todayStr;
      const timeStr = new Date(item.timestamp).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateLabel = isToday ? `Aujourd'hui à ${timeStr}` : `${item.date} à ${timeStr}`;

      html += `
        <div class="activity-item ${item.userKey}">
          <div class="activity-left">
            <span style="font-size: 20px;">${user.avatar}</span>
            <div>
              <div style="font-weight: 600;">${user.name} <span class="activity-count">+${item.count}</span></div>
              <div class="activity-time">${dateLabel}</div>
            </div>
          </div>
          <button class="activity-delete" title="Supprimer" data-user="${item.userKey}" data-id="${item.id}">✕</button>
        </div>`;
    });

    $('activityList').innerHTML = html;

    $('activityList').querySelectorAll('.activity-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const u = e.currentTarget.getAttribute('data-user');
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Supprimer cette série ?')) deleteLog(u, id);
      });
    });
  }

  // --- Rendu du Calendrier 2D et des Gommettes ---
  function renderCalendar() {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth(); // 0-indexed (0 = Janvier)

    // Titre Mois Année
    const monthTitle = currentMonthDate.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });
    $('calCurrentMonthTitle').textContent = monthTitle;

    // Rendu de la palette de gommettes en haut
    renderStickersRibbon();

    // Calcul des dates du mois
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDay.getDate(); // 28, 29, 30 ou 31

    // Jour de la semaine du 1er jour (0 = Lundi, 6 = Dimanche)
    const startDayIndex = (firstDay.getDay() + 6) % 7;

    const grid = $('calendarMonthGrid');
    grid.innerHTML = '';

    const todayStr = getTodayString();
    const agendaOwner = config.activeAgendaOwner || 'user2';

    // 1. Cases vides du mois précédent
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const prevDayNum = prevMonthLastDay - i;
      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.innerHTML = `<div class="cal-day-top"><span>${prevDayNum}</span></div>`;
      grid.appendChild(cell);
    }

    // 2. Jours du mois en cours (du 1 au 30/31)
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month + 1).padStart(2, '0');
      const fullDateStr = `${year}-${monthStr}-${dayStr}`;

      const isToday = fullDateStr === todayStr;
      const dayStickers = getAgendaStickers(agendaOwner, fullDateStr);

      const cell = document.createElement('div');
      cell.className = `cal-day-cell ${isToday ? 'today' : ''}`;
      cell.dataset.date = fullDateStr;

      let stickersHtml = '';
      dayStickers.forEach((item) => {
        const def = (appData.health.stickers || []).find((s) => s.id === item.stickerId) || {
          name: 'Gommette',
          icon: '💊',
          color: '#38bdf8'
        };
        const checkIcon = item.taken ? '✓' : '';
        stickersHtml += `
          <div class="day-sticker-tag ${item.taken ? 'taken' : ''}" style="background-color: ${def.color};" title="${def.name}">
            <span>${def.icon} ${def.name}</span>
            <span class="day-sticker-check">${checkIcon}</span>
          </div>`;
      });

      cell.innerHTML = `
        <div class="cal-day-top">
          <span>${day}</span>
          ${isToday ? '<span class="today-pill">Aujourd\'hui</span>' : ''}
        </div>
        <div class="cal-day-stickers">
          ${stickersHtml}
        </div>`;

      // Clic sur une case de jour
      cell.addEventListener('click', () => {
        if (activeSelectedSticker) {
          // Mode collage actif : on colle ou décolle directement la gommette sélectionnée
          toggleStickerOnDay(agendaOwner, fullDateStr, activeSelectedSticker);
        } else {
          // Mode consultation : ouvre la fenêtre de détail du jour
          openDayDetailModal(agendaOwner, fullDateStr);
        }
      });

      grid.appendChild(cell);
    }

    // 3. Compléter la dernière ligne si nécessaire
    const totalCells = startDayIndex + totalDaysInMonth;
    const remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
      for (let nextDay = 1; nextDay <= remaining; nextDay++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell other-month';
        cell.innerHTML = `<div class="cal-day-top"><span>${nextDay}</span></div>`;
        grid.appendChild(cell);
      }
    }
  }

  function renderStickersRibbon() {
    const ribbon = $('stickersRibbon');
    ribbon.innerHTML = '';

    const stickers = appData.health.stickers || [];
    stickers.forEach((stk) => {
      const badge = document.createElement('div');
      badge.className = `sticker-badge ${activeSelectedSticker === stk.id ? 'selected' : ''}`;
      badge.style.backgroundColor = stk.color;
      badge.innerHTML = `<span>${stk.icon}</span><span>${stk.name}</span>`;

      badge.addEventListener('click', () => {
        if (activeSelectedSticker === stk.id) {
          // Désélectionner
          activeSelectedSticker = null;
          $('activeStickerAlert').style.display = 'none';
        } else {
          // Sélectionner pour collage
          activeSelectedSticker = stk.id;
          $('activeStickerAlert').style.display = 'flex';
          $('activeStickerAlertText').textContent = `🎨 Gommette "${stk.name}" en main ! Clique sur les jours pour la coller.`;
        }
        renderStickersRibbon();
      });

      ribbon.appendChild(badge);
    });
  }

  function openDayDetailModal(userId, dateStr) {
    $('dayDetailModalDate').textContent = formatDateFrench(dateStr);
    const list = $('dayDetailStickersList');
    list.innerHTML = '';

    const dayStickers = getAgendaStickers(userId, dateStr);
    const user = appData.users[userId];

    if (dayStickers.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px 0;">Aucune gommette pour cette journée.</div>`;
    } else {
      dayStickers.forEach((entry) => {
        const def = (appData.health.stickers || []).find((s) => s.id === entry.stickerId) || {
          name: 'Gommette',
          icon: '💊',
          color: '#38bdf8'
        };

        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.background = '#21262d';
        item.style.padding = '8px 12px';
        item.style.borderRadius = '8px';
        item.style.borderLeft = `4px solid ${def.color}`;

        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">${def.icon}</span>
            <div>
              <div style="font-weight:600; font-size:13px; ${entry.taken ? 'text-decoration:line-through; opacity:0.6;' : ''}">${def.name}</div>
              <div style="font-size:10px; color:var(--text-muted);">${entry.taken ? 'Pris ✅' : 'À prendre ⏳'}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn" style="padding:4px 8px; font-size:11px;" id="toggleTaken_${entry.id}">
              ${entry.taken ? 'Annuler' : 'Marquer Pris ✅'}
            </button>
            <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" id="deleteStk_${entry.id}">
              🗑️
            </button>
          </div>`;

        list.appendChild(item);

        item.querySelector(`#toggleTaken_${entry.id}`).addEventListener('click', () => {
          toggleStickerTaken(userId, dateStr, entry.id);
          openDayDetailModal(userId, dateStr);
        });

        item.querySelector(`#deleteStk_${entry.id}`).addEventListener('click', () => {
          toggleStickerOnDay(userId, dateStr, entry.stickerId);
          openDayDetailModal(userId, dateStr);
        });
      });
    }

    // Palette rapide pour ajouter une gommette directement
    const addList = $('dayDetailAddList');
    addList.innerHTML = '';
    (appData.health.stickers || []).forEach((stk) => {
      const btn = document.createElement('button');
      btn.className = 'sticker-badge';
      btn.style.backgroundColor = stk.color;
      btn.innerHTML = `${stk.icon} ${stk.name}`;
      btn.addEventListener('click', () => {
        toggleStickerOnDay(userId, dateStr, stk.id);
        openDayDetailModal(userId, dateStr);
      });
      addList.appendChild(btn);
    });

    $('dayDetailModal').classList.add('open');
  }

  // --- Statistiques & Heatmap Style GitHub ---
  function calculateUserStats(userId) {
    const user = appData.users[userId] || { logs: [] };
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

    return { total, bestDay, avg, streak, dayMap, activeDays };
  }

  function renderProfileStats() {
    const profileView = config.activeProfileStats || 'user1';
    const stats = calculateUserStats(profileView);
    const user = appData.users[profileView];

    $('kpiTotal').textContent = stats.total.toLocaleString('fr-FR');
    $('kpiTotalSub').textContent = `par ${user.name}`;
    $('kpiStreak').textContent = `${stats.streak} j`;
    $('kpiStreakSub').textContent = stats.streak > 0 ? 'En plein feu ! 🔥' : 'Pas de série active';
    $('kpiBest').textContent = stats.bestDay.toLocaleString('fr-FR');
    $('kpiAvg').textContent = `${stats.avg} / j`;
  }

  function renderHeatmap() {
    const profileView = config.activeProfileStats || 'user1';
    const stats = calculateUserStats(profileView);
    const user = appData.users[profileView];
    const dayMap = stats.dayMap;

    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + (6 - dayOfWeek));

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (52 * 7 - 1));

    $('heatmapGrid').innerHTML = '';
    $('heatmapMonths').innerHTML = '';

    let totalYearPushups = 0;
    const monthsRecorded = [];

    const curDate = new Date(startDate);
    for (let w = 0; w < 52; w++) {
      const weekCol = document.createElement('div');
      weekCol.className = 'heatmap-week';

      for (let d = 0; d < 7; d++) {
        const y = curDate.getFullYear();
        const m = String(curDate.getMonth() + 1).padStart(2, '0');
        const dayNum = String(curDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dayNum}`;

        const isFuture = curDate > today;
        const count = isFuture ? 0 : dayMap[dateStr] || 0;
        totalYearPushups += count;

        let level = 0;
        if (count >= 100) level = 4;
        else if (count >= 50) level = 3;
        else if (count >= 25) level = 2;
        else if (count >= 1) level = 1;

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.level = isFuture ? '0' : level;
        cell.dataset.date = dateStr;
        cell.dataset.count = count;

        if (!isFuture) {
          cell.addEventListener('mouseenter', showHeatmapTooltip);
          cell.addEventListener('mouseleave', hideHeatmapTooltip);
          cell.addEventListener('click', () => {
            showToast(`${count} pompes le ${formatDateFrench(dateStr)}`);
          });
        }

        if (d === 0 && curDate.getDate() <= 7) {
          const monthName = curDate.toLocaleDateString('fr-FR', { month: 'short' });
          monthsRecorded.push({ weekIndex: w, name: monthName.replace('.', '') });
        }

        weekCol.appendChild(cell);
        curDate.setDate(curDate.getDate() + 1);
      }

      $('heatmapGrid').appendChild(weekCol);
    }

    monthsRecorded.forEach((m) => {
      const span = document.createElement('span');
      span.textContent = m.name;
      span.style.position = 'absolute';
      span.style.left = `${m.weekIndex * 14}px`;
      span.style.textTransform = 'capitalize';
      $('heatmapMonths').appendChild(span);
    });

    $('heatmapTotalTitle').textContent = `${totalYearPushups.toLocaleString('fr-FR')} pompes sur la dernière année (${user.name})`;
  }

  function showHeatmapTooltip(e) {
    const dateStr = e.currentTarget.dataset.date;
    const count = parseInt(e.currentTarget.dataset.count, 10);
    const rect = e.currentTarget.getBoundingClientRect();

    const formattedDate = formatDateFrench(dateStr);
    const countText = count === 0 ? 'Aucune pompe' : `${count} pompe${count > 1 ? 's' : ''}`;

    const tip = $('heatmap-tooltip');
    tip.innerHTML = `<strong>${countText}</strong> le ${formattedDate}`;
    tip.style.display = 'block';
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top - 8}px`;
  }

  function hideHeatmapTooltip() {
    $('heatmap-tooltip').style.display = 'none';
  }

  function renderWeeklyComparison() {
    const stats1 = calculateUserStats('user1');
    const stats2 = calculateUserStats('user2');

    let html = '';
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayNum}`;

      const c1 = stats1.dayMap[dateStr] || 0;
      const c2 = stats2.dayMap[dateStr] || 0;
      const maxVal = Math.max(c1, c2, 1);

      const dayName =
        i === 0
          ? "Aujourd'hui"
          : i === 1
          ? 'Hier'
          : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });

      html += `
        <div style="background: #21262d; border-radius: 8px; padding: 8px 12px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: 600;">
            <span>${dayName}</span>
            <span style="color: var(--text-muted);">${c1} vs ${c2}</span>
          </div>
          <div style="display: flex; gap: 4px; height: 6px; background: #161b22; border-radius: 4px; overflow: hidden;">
            <div style="background: var(--p1-color); width: ${(c1 / maxVal) * 50}%; transition: width 0.3s;"></div>
            <div style="background: var(--p2-color); width: ${(c2 / maxVal) * 50}%; transition: width 0.3s;"></div>
          </div>
        </div>`;
    }

    $('weeklyComparison').innerHTML = html;
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

  function updateFormFields() {
    $('p1NameInput').value = appData.users.user1?.name || 'Shaza';
    $('p1AvatarInput').value = appData.users.user1?.avatar || '⚡';
    $('p2NameInput').value = appData.users.user2?.name || 'Copine';
    $('p2AvatarInput').value = appData.users.user2?.avatar || '🌸';
  }

  function generateShareUrl() {
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?role=copine`;
    $('shareUrlInput').value = shareUrl;
  }

  // --- Gestion des Événements ---
  function setupEventListeners() {
    // Boutons de pompes
    $$('.rep-btn[data-reps]').forEach((btn) => {
      btn.addEventListener('click', () => {
        logPushups(btn.dataset.reps);
      });
    });

    $('selectP1Btn').addEventListener('click', () => {
      config.activeLoggerUser = 'user1';
      $('selectP1Btn').classList.add('active');
      $('selectP2Btn').classList.remove('active');
    });

    $('selectP2Btn').addEventListener('click', () => {
      config.activeLoggerUser = 'user2';
      $('selectP2Btn').classList.add('active');
      $('selectP1Btn').classList.remove('active');
    });

    $('undoBtn').addEventListener('click', undoLastLog);

    // Modal série personnalisée
    $('customRepsBtn').addEventListener('click', () => {
      $('customModal').classList.add('open');
      $('customRepsInput').value = '';
      $('customRepsInput').focus();
    });

    $('cancelCustomBtn').addEventListener('click', () => {
      $('customModal').classList.remove('open');
    });

    $('confirmCustomBtn').addEventListener('click', () => {
      const val = parseInt($('customRepsInput').value, 10);
      if (val && val > 0) {
        logPushups(val);
        $('customModal').classList.remove('open');
      }
    });

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

    // Switcher propriétaire d'agenda (Agenda Copine vs Agenda Shaza)
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

    // Arrêter le mode collage
    $('stopPlacingStickerBtn').addEventListener('click', () => {
      activeSelectedSticker = null;
      $('activeStickerAlert').style.display = 'none';
      renderStickersRibbon();
    });

    // Modal Nouvelle Gommette
    $('openNewStickerModalBtn').addEventListener('click', () => {
      $('newStickerModal').classList.add('open');
      $('newStickerName').value = '';
    });

    $('closeNewStickerModalBtn').addEventListener('click', () => {
      $('newStickerModal').classList.remove('open');
    });

    $$('.emoji-choice').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        selectedEmojiForNewSticker = e.currentTarget.dataset.emoji;
        $$('.emoji-choice').forEach((b) => (b.style.borderColor = 'transparent'));
        e.currentTarget.style.borderColor = '#58a6ff';
      });
    });

    $('saveNewStickerBtn').addEventListener('click', () => {
      const name = $('newStickerName').value.trim();
      const color = $('newStickerColor').value;
      if (!name) {
        alert('Veuillez entrer un nom pour la gommette.');
        return;
      }

      const newSticker = {
        id: 'stk_' + Date.now(),
        name: name,
        icon: selectedEmojiForNewSticker,
        color: color
      };

      if (!appData.health) appData.health = { stickers: [], calendar: {} };
      if (!appData.health.stickers) appData.health.stickers = [];
      appData.health.stickers.push(newSticker);

      renderStickersRibbon();
      syncDataToFirebase();
      $('newStickerModal').classList.remove('open');
      showToast(`✨ Gommette "${name}" créée !`);
    });

    // Modal Détail Jour
    $('closeDayDetailModalBtn').addEventListener('click', () => {
      $('dayDetailModal').classList.remove('open');
    });

    // Modal Partage
    $('openShareModalBtn').addEventListener('click', () => {
      generateShareUrl();
      $('shareModal').classList.add('open');
    });

    $('closeShareModalBtn').addEventListener('click', () => {
      $('shareModal').classList.remove('open');
    });

    $('copyShareUrlBtn').addEventListener('click', () => {
      const copyText = $('shareUrlInput');
      copyText.select();
      copyText.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(copyText.value).then(() => {
        showToast('📋 Lien copié dans le presse-papier !');
      });
    });

    // Profil Switcher dans Stats
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
      appData.users.user1.avatar = $('p1AvatarInput').value.trim() || '⚡';
      appData.users.user2.name = $('p2NameInput').value.trim() || 'Copine';
      appData.users.user2.avatar = $('p2AvatarInput').value.trim() || '🌸';
      updateUI();
      syncDataToFirebase();
      showToast('Profils mis à jour !');
    });

    // Paramètres Firebase
    $('saveFirebaseBtn').addEventListener('click', () => {
      fbConfig.room = $('firebaseRoomInput').value.trim() || 'minigym-shaza-copine';
      fbConfig.databaseURL = $('firebaseDbUrlInput').value.trim();
      fbConfig.apiKey = $('firebaseApiKeyInput').value.trim();
      localStorage.setItem(FIREBASE_KEY, JSON.stringify(fbConfig));
      initFirebase();
      showToast('Configuration Firebase enregistrée !');
    });

    $('testSyncBtn').addEventListener('click', () => {
      initFirebase();
      syncDataToFirebase();
    });

    // Sauvegarde Export / Import
    $('exportDataBtn').addEventListener('click', () => {
      const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appData, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `minigym_sante_${getTodayString()}.json`);
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
            updateUI();
            syncDataToFirebase();
            showToast('Données importées avec succès !');
          }
        } catch (err) {
          alert('Fichier JSON invalide.');
        }
      };
      reader.readAsText(file);
    });

    $('resetDataBtn').addEventListener('click', () => {
      if (confirm('Voulez-vous vraiment effacer les pompes et réinitialiser ?')) {
        appData.users.user1.logs = [];
        appData.users.user2.logs = [];
        updateUI();
        syncDataToFirebase();
        showToast('Données réinitialisées.', false);
      }
    });
  }

  // --- Navigation par Onglets ---
  function setupNavigation() {
    $$('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        $$('.nav-btn').forEach((b) => b.classList.remove('active'));
        $$('.tab-view').forEach((v) => v.classList.remove('active'));

        btn.classList.add('active');
        const view = $(`view-${targetTab}`);
        if (view) view.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (targetTab === 'calendar') renderCalendar();
        if (targetTab === 'profile') renderHeatmap();
      });
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
