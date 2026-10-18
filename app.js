/**
 * Duo & Santé - Suivi de Pompes & Agenda Traitements
 * Design minimaliste & élégant, sans emojis criards, esprit Duo / Complices.
 */

(function () {
  'use strict';

  // --- Clés de Stockage ---
  const STORAGE_KEY = 'duo_sante_data';
  const CONFIG_KEY = 'duo_sante_config';
  const FIREBASE_KEY = 'duo_sante_firebase';

  // --- Configuration ---
  let config = {
    myIdentity: 'user1', // 'user1' (Shaza) ou 'user2' (Copine)
    activeLoggerUser: 'user1',
    activeAgendaOwner: 'user2', // Par défaut : l'agenda de Copine
    activeProfileStats: 'user1'
  };

  let fbConfig = {
    room: 'duo-shaza-copine',
    apiKey: '',
    databaseURL: ''
  };

  // Base de données par défaut
  let appData = {
    version: 3,
    lastUpdated: new Date().toISOString(),
    users: {
      user1: { id: 'user1', name: 'Shaza', color: '#4ade80', logs: [] },
      user2: { id: 'user2', name: 'Copine', color: '#fb7185', logs: [] }
    },
    health: {
      stickers: [
        { id: 'stk_matin', name: 'Matin', color: '#38bdf8' },
        { id: 'stk_midi', name: 'Midi', color: '#fbbf24' },
        { id: 'stk_soir', name: 'Soir', color: '#a855f7' },
        { id: 'stk_soin', name: 'Traitement', color: '#e11d48' },
        { id: 'stk_repos', name: 'Repos', color: '#059669' }
      ],
      calendar: { user1: {}, user2: {} }
    }
  };

  let currentMonthDate = new Date();
  let activeSelectedSticker = null;
  let firebaseDb = null;
  let isFirebaseConnected = false;
  let lastLoggedId = null;
  let undoTimeout = null;

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
    generateShareUrl();
  }

  function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    if (roleParam === 'copine' || roleParam === 'user2') {
      config.myIdentity = 'user2';
      config.activeLoggerUser = 'user2';
      config.activeAgendaOwner = 'user2';
      saveConfig();
      showToast('Espace Copine connecté');
    }
  }

  function loadLocalConfig() {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) config = { ...config, ...JSON.parse(savedConfig) };
      const savedFb = localStorage.getItem(FIREBASE_KEY);
      if (savedFb) fbConfig = { ...fbConfig, ...JSON.parse(savedFb) };

      $('myIdentitySelect').value = config.myIdentity || 'user1';
      $('firebaseRoomInput').value = fbConfig.room || 'duo-shaza-copine';
      $('firebaseDbUrlInput').value = fbConfig.databaseURL || '';
      $('firebaseApiKeyInput').value = fbConfig.apiKey || '';
    } catch (e) {}
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
          if (!appData.health) appData.health = { stickers: [], calendar: { user1: {}, user2: {} } };
          if (!appData.health.calendar.user1) appData.health.calendar.user1 = {};
          if (!appData.health.calendar.user2) appData.health.calendar.user2 = {};
        }
      }
    } catch (e) {}
  }

  function saveLocalData() {
    try {
      appData.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {}
  }

  // --- Initialisation Firebase Sans Erreurs Bloquantes ---
  function initFirebase() {
    if (!fbConfig.databaseURL) {
      updateSyncBadge('offline', 'Mode Local');
      return;
    }

    try {
      if (window.firebase && firebase.apps && !firebase.apps.length) {
        firebase.initializeApp({
          apiKey: fbConfig.apiKey || 'AIzaSyPlaceholder',
          databaseURL: fbConfig.databaseURL
        });
      }

      if (window.firebase && firebase.database) {
        firebaseDb = firebase.database();
        const roomRef = firebaseDb.ref(fbConfig.room || 'duo-shaza-copine');

        updateSyncBadge('syncing', 'Synchro...');

        roomRef.on(
          'value',
          (snapshot) => {
            const val = snapshot.val();
            if (val && val.users) {
              appData = val;
              saveLocalData();
              updateUI();
              updateSyncBadge('synced', 'En direct');
            } else {
              roomRef.set(appData).catch(() => {});
              updateSyncBadge('synced', 'En direct');
            }
            isFirebaseConnected = true;
          },
          (err) => {
            // Si erreur de permission (règles pas en mode test), on passe en local sans spammer d'alerte rouge
            console.warn('Firebase sync notice:', err.message);
            updateSyncBadge('offline', 'Mode Local (Règles)');
          }
        );
      }
    } catch (err) {
      console.warn('Firebase init:', err);
      updateSyncBadge('offline', 'Mode Local');
    }
  }

  function syncDataToFirebase() {
    saveLocalData();
    if (firebaseDb && fbConfig.room && isFirebaseConnected) {
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
      dot.className = 'sync-dot ' + status;
      label.textContent = text;
    }
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }

  function formatCurrentDate() {
    const d = new Date();
    $('todayDateStr').textContent = d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // --- Suivi des Pompes (Duo) ---
  function logPushups(reps, targetUser = null) {
    const userId = targetUser || config.activeLoggerUser || 'user1';
    const user = appData.users[userId];
    if (!user) return;

    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      date: getTodayString(),
      count: parseInt(reps, 10)
    };

    if (!user.logs) user.logs = [];
    user.logs.unshift(logEntry);
    lastLoggedId = { userId, logId: logEntry.id };

    updateUI();
    syncDataToFirebase();

    $('undoText').textContent = `${user.name} : +${reps} répétitions validées`;
    $('undoBar').style.display = 'flex';
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      $('undoBar').style.display = 'none';
      lastLoggedId = null;
    }, 8000);

    showToast(`+${reps} pour ${user.name}`);
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
        showToast(`Série de ${removed.count} annulée`);
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
        showToast('Série supprimée');
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

  // --- Agenda & Gommettes ---
  function getAgendaStickers(userId, dateStr) {
    if (!appData.health || !appData.health.calendar) return [];
    return appData.health.calendar[userId]?.[dateStr] || [];
  }

  function toggleStickerOnDay(userId, dateStr, stickerId) {
    if (!appData.health) appData.health = { stickers: [], calendar: {} };
    if (!appData.health.calendar[userId]) appData.health.calendar[userId] = {};

    let dayStickers = appData.health.calendar[userId][dateStr] || [];
    const existingIndex = dayStickers.findIndex((s) => s.stickerId === stickerId);

    const def = (appData.health.stickers || []).find((s) => s.id === stickerId);
    const stickerName = def ? def.name : 'Gommette';

    if (existingIndex !== -1) {
      dayStickers.splice(existingIndex, 1);
      showToast(`Gommette "${stickerName}" retirée`);
    } else {
      dayStickers.push({
        id: 'stk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        stickerId: stickerId,
        taken: false,
        addedAt: new Date().toISOString()
      });
      showToast(`Gommette "${stickerName}" collée sur le ${formatDateFrench(dateStr)}`);
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
      showToast(entry.taken ? 'Validé ✓' : 'Statut réinitialisé');
      renderCalendar();
      syncDataToFirebase();
    }
  }

  // --- Rendu UI Global ---
  function updateUI() {
    renderDuoSection();
    renderActivityFeed();
    renderCalendar();
    renderProfileStats();
    renderHeatmap();
    updateFormFields();
  }

  function renderDuoSection() {
    const u1 = appData.users.user1 || { name: 'Shaza' };
    const u2 = appData.users.user2 || { name: 'Copine' };

    $('p1DisplayName').textContent = u1.name;
    $('p2DisplayName').textContent = u2.name;

    $('selectP1Btn').textContent = u1.name;
    $('selectP2Btn').textContent = u2.name;

    $('profTabP1').textContent = u1.name;
    $('profTabP2').textContent = u2.name;

    $('agendaOwnerP1Btn').textContent = `Agenda de ${u1.name}`;
    $('agendaOwnerP2Btn').textContent = `Agenda de ${u2.name}`;

    const score1 = getTodayCount('user1');
    const score2 = getTodayCount('user2');

    $('p1Score').textContent = score1;
    $('p2Score').textContent = score2;
    $('duoTotalToday').textContent = score1 + score2;
  }

  function renderActivityFeed() {
    const logs1 = (appData.users.user1?.logs || []).map((l) => ({ ...l, userKey: 'user1' }));
    const logs2 = (appData.users.user2?.logs || []).map((l) => ({ ...l, userKey: 'user2' }));
    const allLogs = [...logs1, ...logs2].sort((a, b) => b.timestamp - a.timestamp);

    const todayStr = getTodayString();
    const todayLogs = allLogs.filter((l) => l.date === todayStr);
    $('totalLogsToday').textContent = `${todayLogs.length} série${todayLogs.length > 1 ? 's' : ''}`;

    if (allLogs.length === 0) {
      $('activityList').innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 16px 0; font-size: 12px;">
          Aucune série enregistrée pour l'instant aujourd'hui.
        </div>`;
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
      const dateLabel = isToday ? `${timeStr}` : `${item.date}`;

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-inner); padding:8px 12px; border-radius:6px; font-size:12px; border-left: 2px solid ${user.color || '#fff'};">
          <div>
            <strong>${user.name}</strong> <span style="color:var(--text-muted); margin-left:6px;">+${item.count}</span>
            <span style="font-size:10px; color:var(--text-dim); margin-left:8px;">${dateLabel}</span>
          </div>
          <button style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:12px;" data-user="${item.userKey}" data-id="${item.id}" class="act-del-btn">✕</button>
        </div>`;
    });

    $('activityList').innerHTML = html;

    $('activityList').querySelectorAll('.act-del-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        deleteLog(e.currentTarget.dataset.user, e.currentTarget.dataset.id);
      });
    });
  }

  // --- Rendu du Calendrier 2D ---
  function renderCalendar() {
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

    // Jours précédents
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const prevNum = prevMonthLastDay - i;
      const cell = document.createElement('div');
      cell.className = 'day-box outside';
      cell.innerHTML = `<div class="day-box-header"><span>${prevNum}</span></div>`;
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
      cell.className = `day-box ${isToday ? 'today' : ''}`;
      cell.dataset.date = fullDateStr;

      let stickersHtml = '';
      dayStickers.forEach((item) => {
        const def = (appData.health.stickers || []).find((s) => s.id === item.stickerId) || {
          name: 'Gommette',
          color: '#38bdf8'
        };
        stickersHtml += `
          <div class="sticker-dot-row ${item.taken ? 'done' : ''}" style="background-color: ${def.color};">
            <span>${def.name}</span>
            <span>${item.taken ? '✓' : ''}</span>
          </div>`;
      });

      cell.innerHTML = `
        <div class="day-box-header">
          <span>${day}</span>
          ${isToday ? '<span class="today-tag">Auj</span>' : ''}
        </div>
        <div class="day-box-stickers">${stickersHtml}</div>`;

      cell.addEventListener('click', () => {
        if (activeSelectedSticker) {
          toggleStickerOnDay(agendaOwner, fullDateStr, activeSelectedSticker);
        } else {
          openDayDetailModal(agendaOwner, fullDateStr);
        }
      });

      grid.appendChild(cell);
    }

    // Jours suivants pour compléter la grille
    const totalCells = startDayIndex + totalDaysInMonth;
    const remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
      for (let nextDay = 1; nextDay <= remaining; nextDay++) {
        const cell = document.createElement('div');
        cell.className = 'day-box outside';
        cell.innerHTML = `<div class="day-box-header"><span>${nextDay}</span></div>`;
        grid.appendChild(cell);
      }
    }
  }

  function renderStickersRibbon() {
    const ribbon = $('stickersRibbon');
    ribbon.innerHTML = '';

    const stickers = appData.health.stickers || [];
    stickers.forEach((stk) => {
      const chip = document.createElement('div');
      chip.className = `swatch-chip ${activeSelectedSticker === stk.id ? 'active-stamp' : ''}`;
      chip.style.backgroundColor = stk.color;
      chip.textContent = stk.name;

      chip.addEventListener('click', () => {
        if (activeSelectedSticker === stk.id) {
          activeSelectedSticker = null;
          $('activeStickerAlert').style.display = 'none';
        } else {
          activeSelectedSticker = stk.id;
          $('activeStickerAlert').style.display = 'flex';
          $('activeStickerAlertText').textContent = `Gommette "${stk.name}" sélectionnée : clique sur les jours du calendrier.`;
        }
        renderStickersRibbon();
      });

      ribbon.appendChild(chip);
    });
  }

  function openDayDetailModal(userId, dateStr) {
    $('dayDetailModalDate').textContent = formatDateFrench(dateStr);
    const list = $('dayDetailStickersList');
    list.innerHTML = '';

    const dayStickers = getAgendaStickers(userId, dateStr);

    if (dayStickers.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 10px 0; font-size: 11px;">Aucune gommette sur ce jour.</div>`;
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
        row.style.background = 'var(--card-inner)';
        row.style.padding = '8px 10px';
        row.style.borderRadius = '6px';
        row.style.borderLeft = `3px solid ${def.color}`;

        row.innerHTML = `
          <div style="font-size:12px; font-weight:600; ${entry.taken ? 'text-decoration:line-through; opacity:0.5;' : ''}">${def.name}</div>
          <div style="display:flex; gap:6px;">
            <button class="btn-outline" style="padding:3px 8px; font-size:10px;" id="toggleDone_${entry.id}">
              ${entry.taken ? 'Annuler' : 'Valider ✓'}
            </button>
            <button class="icon-btn" style="padding:3px 6px; font-size:10px;" id="delStk_${entry.id}">✕</button>
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

    const addList = $('dayDetailAddList');
    addList.innerHTML = '';
    (appData.health.stickers || []).forEach((stk) => {
      const btn = document.createElement('button');
      btn.className = 'swatch-chip';
      btn.style.backgroundColor = stk.color;
      btn.textContent = `+ ${stk.name}`;
      btn.addEventListener('click', () => {
        toggleStickerOnDay(userId, dateStr, stk.id);
        openDayDetailModal(userId, dateStr);
      });
      addList.appendChild(btn);
    });

    $('dayDetailModal').classList.add('open');
  }

  // --- Statistiques & Heatmap Carrés Verts ---
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

    return { total, bestDay, avg, streak, dayMap };
  }

  function renderProfileStats() {
    const pKey = config.activeProfileStats || 'user1';
    const stats = calculateUserStats(pKey);

    $('kpiTotal').textContent = stats.total.toLocaleString('fr-FR');
    $('kpiStreak').textContent = `${stats.streak} j`;
    $('kpiBest').textContent = stats.bestDay.toLocaleString('fr-FR');
    $('kpiAvg').textContent = `${stats.avg} / j`;
  }

  function renderHeatmap() {
    const pKey = config.activeProfileStats || 'user1';
    const stats = calculateUserStats(pKey);
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
      const weekCol = document.createElement('div');
      weekCol.className = 'heatmap-col';

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

        const square = document.createElement('div');
        square.className = 'heatmap-square';
        square.dataset.level = isFuture ? '0' : level;
        square.dataset.date = dateStr;
        square.dataset.count = count;

        if (!isFuture) {
          square.addEventListener('mouseenter', (e) => {
            const tip = $('heatmap-tooltip');
            tip.textContent = `${count} pompes le ${formatDateFrench(dateStr)}`;
            tip.style.display = 'block';
            const rect = e.currentTarget.getBoundingClientRect();
            tip.style.left = `${rect.left + rect.width / 2}px`;
            tip.style.top = `${rect.top - 6}px`;
          });
          square.addEventListener('mouseleave', () => ($('heatmap-tooltip').style.display = 'none'));
        }

        if (d === 0 && curDate.getDate() <= 7) {
          const monthName = curDate.toLocaleDateString('fr-FR', { month: 'short' });
          monthsRecorded.push({ weekIndex: w, name: monthName.replace('.', '') });
        }

        weekCol.appendChild(square);
        curDate.setDate(curDate.getDate() + 1);
      }

      $('heatmapGrid').appendChild(weekCol);
    }

    monthsRecorded.forEach((m) => {
      const span = document.createElement('span');
      span.textContent = m.name;
      span.style.position = 'absolute';
      span.style.left = `${m.weekIndex * 13}px`;
      span.style.textTransform = 'capitalize';
      $('heatmapMonths').appendChild(span);
    });

    $('heatmapTotalTitle').textContent = `${totalYear.toLocaleString('fr-FR')} pompes sur l'année (${user.name})`;
  }

  function formatDateFrench(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function updateFormFields() {
    $('p1NameInput').value = appData.users.user1?.name || 'Shaza';
    $('p2NameInput').value = appData.users.user2?.name || 'Copine';
  }

  function generateShareUrl() {
    const baseUrl = window.location.origin + window.location.pathname;
    $('shareUrlInput').value = `${baseUrl}?role=copine`;
  }

  // --- Gestion des Événements ---
  function setupEventListeners() {
    $$('.rep-chip[data-reps]').forEach((chip) => {
      chip.addEventListener('click', () => logPushups(chip.dataset.reps));
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

    $('customRepsBtn').addEventListener('click', () => {
      $('customModal').classList.add('open');
      $('customRepsInput').value = '';
      $('customRepsInput').focus();
    });

    $('cancelCustomBtn').addEventListener('click', () => $('customModal').classList.remove('open'));

    $('confirmCustomBtn').addEventListener('click', () => {
      const val = parseInt($('customRepsInput').value, 10);
      if (val && val > 0) {
        logPushups(val);
        $('customModal').classList.remove('open');
      }
    });

    // Navigation Calendrier
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

    $('saveNewStickerBtn').addEventListener('click', () => {
      const name = $('newStickerName').value.trim();
      const color = $('newStickerColor').value;
      if (!name) return;

      if (!appData.health) appData.health = { stickers: [], calendar: {} };
      if (!appData.health.stickers) appData.health.stickers = [];
      appData.health.stickers.push({
        id: 'stk_' + Date.now(),
        name: name,
        color: color
      });

      renderStickersRibbon();
      syncDataToFirebase();
      $('newStickerModal').classList.remove('open');
      showToast(`Gommette "${name}" créée`);
    });

    $('closeDayDetailModalBtn').addEventListener('click', () => $('dayDetailModal').classList.remove('open'));

    // Modal Partage
    $('openShareModalBtn').addEventListener('click', () => {
      generateShareUrl();
      $('shareModal').classList.add('open');
    });

    $('closeShareModalBtn').addEventListener('click', () => $('shareModal').classList.remove('open'));

    $('copyShareUrlBtn').addEventListener('click', () => {
      const input = $('shareUrlInput');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => showToast('Lien copié dans le presse-papier'));
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

    // Sauvegarde Profils
    $('saveProfilesBtn').addEventListener('click', () => {
      appData.users.user1.name = $('p1NameInput').value.trim() || 'Shaza';
      appData.users.user2.name = $('p2NameInput').value.trim() || 'Copine';
      updateUI();
      syncDataToFirebase();
      showToast('Prénoms enregistrés');
    });

    // Sauvegarde Firebase
    $('saveFirebaseBtn').addEventListener('click', () => {
      fbConfig.room = $('firebaseRoomInput').value.trim() || 'duo-shaza-copine';
      fbConfig.databaseURL = $('firebaseDbUrlInput').value.trim();
      fbConfig.apiKey = $('firebaseApiKeyInput').value.trim();
      localStorage.setItem(FIREBASE_KEY, JSON.stringify(fbConfig));
      initFirebase();
      syncDataToFirebase();
      showToast('Configuration enregistrée');
    });

    // Export / Import
    $('exportDataBtn').addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appData, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `duo_data_${getTodayString()}.json`);
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
            showToast('Données importées');
          }
        } catch (err) {}
      };
      reader.readAsText(file);
    });
  }

  function setupNavigation() {
    $$('.nav-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        $$('.nav-tab-btn').forEach((b) => b.classList.remove('active'));
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
