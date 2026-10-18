/**
 * MiniGym - Application de suivi de pompes entre potes avec Heatmap style GitHub
 * Stockage local + Synchronisation GitHub REST API (Dépôt privé)
 */

(function () {
  'use strict';

  // --- Configuration initiale & Clés LocalStorage ---
  const STORAGE_KEY = 'minigym_app_data';
  const CONFIG_KEY = 'minigym_config';
  const TOKEN_KEY = 'minigym_gh_token';

  // Configuration par défaut
  let config = {
    repo: 'shazamifius/minigym',
    branch: 'main',
    activeUser: 'user1', // 'user1' (Shaza) ou 'user2' (Pote)
    myIdentity: 'user1'
  };

  // Base de données par défaut
  let appData = {
    version: 1,
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
        name: 'Pote',
        avatar: '🔥',
        color: '#58a6ff',
        logs: []
      }
    },
    settings: {
      dailyGoal: 100
    }
  };

  let ghFileSha = null;
  let isSyncing = false;
  let lastLoggedId = null;
  let undoTimeout = null;
  let currentProfileView = 'user1';

  // --- Sélecteurs DOM ---
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Éléments du DOM
  const syncStatusBtn = $('syncStatusBtn');
  const syncDot = $('syncDot');
  const syncText = $('syncText');
  const toast = $('toast');
  const heatmapTooltip = $('heatmap-tooltip');

  // Duel Elements
  const p1Score = $('p1Score');
  const p2Score = $('p2Score');
  const p1Name = $('p1Name');
  const p2Name = $('p2Name');
  const p1Avatar = $('p1Avatar');
  const p2Avatar = $('p2Avatar');
  const p1Bar = $('p1Bar');
  const p2Bar = $('p2Bar');
  const p1Box = $('p1Box');
  const p2Box = $('p2Box');
  const p1Crown = $('p1Crown');
  const p2Crown = $('p2Crown');
  const duelDiff = $('duelDiff');
  const todayDateStr = $('todayDateStr');
  const activityList = $('activityList');
  const totalLogsToday = $('totalLogsToday');

  // Logger Elements
  const selectP1Btn = $('selectP1Btn');
  const selectP2Btn = $('selectP2Btn');
  const selectorP1Name = $('selectorP1Name');
  const selectorP2Name = $('selectorP2Name');
  const selectorP1Avatar = $('selectorP1Avatar');
  const selectorP2Avatar = $('selectorP2Avatar');
  const undoBar = $('undoBar');
  const undoText = $('undoText');
  const undoBtn = $('undoBtn');
  const customRepsBtn = $('customRepsBtn');
  const customModal = $('customModal');
  const customRepsInput = $('customRepsInput');
  const confirmCustomBtn = $('confirmCustomBtn');
  const cancelCustomBtn = $('cancelCustomBtn');

  // Profile / Stats Elements
  const profTabP1 = $('profTabP1');
  const profTabP2 = $('profTabP2');
  const kpiTotal = $('kpiTotal');
  const kpiTotalSub = $('kpiTotalSub');
  const kpiStreak = $('kpiStreak');
  const kpiStreakSub = $('kpiStreakSub');
  const kpiBest = $('kpiBest');
  const kpiBestSub = $('kpiBestSub');
  const kpiAvg = $('kpiAvg');
  const heatmapGrid = $('heatmapGrid');
  const heatmapMonths = $('heatmapMonths');
  const heatmapTotalTitle = $('heatmapTotalTitle');
  const weeklyComparison = $('weeklyComparison');

  // Settings Elements
  const ghRepoInput = $('ghRepoInput');
  const ghTokenInput = $('ghTokenInput');
  const saveGhBtn = $('saveGhBtn');
  const forceSyncBtn = $('forceSyncBtn');
  const myIdentitySelect = $('myIdentitySelect');
  const p1NameInput = $('p1NameInput');
  const p1AvatarInput = $('p1AvatarInput');
  const p2NameInput = $('p2NameInput');
  const p2AvatarInput = $('p2AvatarInput');
  const saveProfilesBtn = $('saveProfilesBtn');
  const exportDataBtn = $('exportDataBtn');
  const importDataBtn = $('importDataBtn');
  const importFileInput = $('importFileInput');
  const resetDataBtn = $('resetDataBtn');

  // --- Initialisation ---
  function init() {
    loadLocalConfig();
    loadLocalData();
    setupEventListeners();
    setupNavigation();
    updateUI();
    formatCurrentDate();

    // Première synchronisation GitHub automatique
    syncWithGitHub(true);

    // Synchronisation périodique toutes les 30 secondes
    setInterval(() => {
      if (!isSyncing && getGitHubToken()) {
        syncWithGitHub(false);
      }
    }, 30000);
  }

  // --- Gestion du Stockage Local ---
  function loadLocalConfig() {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        config = { ...config, ...JSON.parse(savedConfig) };
      }
      let savedToken = localStorage.getItem(TOKEN_KEY);
      if (!savedToken) {
        // Token actif initial pour prise en main immédiate
        savedToken = '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';
        localStorage.setItem(TOKEN_KEY, savedToken);
      }
      ghTokenInput.value = savedToken;
      ghRepoInput.value = config.repo || 'shazamifius/minigym';
      myIdentitySelect.value = config.myIdentity || 'user1';
      config.activeUser = config.myIdentity || 'user1';
    } catch (e) {
      console.warn('Erreur chargement config locale', e);
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error(e);
    }
  }

  function getGitHubToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setGitHubToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
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
    } catch (e) {
      console.warn('Erreur chargement data locale', e);
    }
  }

  function saveLocalData() {
    try {
      appData.lastUpdated = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
      console.error('Erreur sauvegarde locale', e);
    }
  }

  // --- Audio & Haptics Feedback ---
  function playBeep(reps) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';

      const baseFreq = reps >= 50 ? 659.25 : reps >= 30 ? 587.33 : reps >= 15 ? 523.25 : 440;
      const now = ctx.currentTime;

      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}

    if (navigator.vibrate) {
      try {
        navigator.vibrate(reps >= 30 ? [50, 40, 80] : [40]);
      } catch (e) {}
    }
  }

  function showToast(msg, isSuccess = true) {
    toast.textContent = msg;
    toast.style.background = isSuccess ? '#238636' : '#da3633';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function formatCurrentDate() {
    const d = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    todayDateStr.textContent = d.toLocaleDateString('fr-FR', options);
  }

  // --- Logique Pompes (Ajout, Annulation, Calculs) ---
  function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function logPushups(reps, targetUser = null) {
    const userId = targetUser || config.activeUser || 'user1';
    const user = appData.users[userId];
    if (!user) return;

    const logEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: Date.now(),
      date: getTodayString(),
      count: parseInt(reps, 10)
    };

    if (!user.logs) user.logs = [];
    user.logs.unshift(logEntry);
    lastLoggedId = { userId, logId: logEntry.id };

    saveLocalData();
    playBeep(reps);
    updateUI();

    // Activer barre annulation
    undoText.textContent = `${user.avatar} ${user.name} : +${reps} pompes validées`;
    undoBar.style.display = 'flex';
    clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
      undoBar.style.display = 'none';
      lastLoggedId = null;
    }, 8000);

    showToast(`💪 +${reps} pompes enregistrées pour ${user.name} !`);

    // Synchronisation immédiate vers GitHub
    pushToGitHub(`💪 ${user.name}: +${reps} pompes`);
  }

  function undoLastLog() {
    if (!lastLoggedId) return;
    const { userId, logId } = lastLoggedId;
    const user = appData.users[userId];
    if (user && user.logs) {
      const idx = user.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        const removed = user.logs.splice(idx, 1)[0];
        saveLocalData();
        updateUI();
        undoBar.style.display = 'none';
        lastLoggedId = null;
        showToast(`↩ Série de ${removed.count} pompes annulée.`, false);
        pushToGitHub(`↩ Annulation série de ${removed.count} pompes pour ${user.name}`);
      }
    }
  }

  function deleteLog(userId, logId) {
    const user = appData.users[userId];
    if (user && user.logs) {
      const idx = user.logs.findIndex((l) => l.id === logId);
      if (idx !== -1) {
        user.logs.splice(idx, 1);
        saveLocalData();
        updateUI();
        showToast('Série supprimée', false);
        pushToGitHub(`🗑️ Série supprimée (${user.name})`);
      }
    }
  }

  // --- Calculs Statistiques ---
  function calculateUserStats(userId) {
    const user = appData.users[userId] || { logs: [] };
    const logs = user.logs || [];

    // Total
    const total = logs.reduce((sum, l) => sum + (l.count || 0), 0);

    // Par jour (map date -> total)
    const dayMap = {};
    logs.forEach((l) => {
      dayMap[l.date] = (dayMap[l.date] || 0) + (l.count || 0);
    });

    const activeDays = Object.keys(dayMap).length;

    // Record 1 jour
    let bestDay = 0;
    for (const d in dayMap) {
      if (dayMap[d] > bestDay) bestDay = dayMap[d];
    }

    // Moyenne
    const avg = activeDays > 0 ? Math.round(total / activeDays) : 0;

    // Streak (Série en cours en jours)
    let streak = 0;
    const today = new Date();
    let checkDate = new Date(today);

    // Vérifier si aujourd'hui a été fait
    const todayStr = getTodayString();
    if (!dayMap[todayStr]) {
      // Si pas encore fait aujourd'hui, vérifier si hier était fait
      checkDate.setDate(checkDate.getDate() - 1);
    }

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

  function getTodayCount(userId) {
    const user = appData.users[userId];
    if (!user || !user.logs) return 0;
    const todayStr = getTodayString();
    return user.logs
      .filter((l) => l.date === todayStr)
      .reduce((sum, l) => sum + (l.count || 0), 0);
  }

  // --- Rendu & Mise à jour de l'Interface (UI) ---
  function updateUI() {
    renderDuel();
    renderActivityFeed();
    renderProfileStats();
    renderHeatmap();
    renderWeeklyComparison();
    updateSettingsFields();
  }

  function renderDuel() {
    const u1 = appData.users.user1 || { name: 'Shaza', avatar: '⚡' };
    const u2 = appData.users.user2 || { name: 'Pote', avatar: '🔥' };

    p1Name.textContent = u1.name;
    p2Name.textContent = u2.name;
    p1Avatar.textContent = u1.avatar;
    p2Avatar.textContent = u2.avatar;

    selectorP1Name.textContent = u1.name;
    selectorP2Name.textContent = u2.name;
    selectorP1Avatar.textContent = u1.avatar;
    selectorP2Avatar.textContent = u2.avatar;

    profTabP1.textContent = `${u1.avatar} ${u1.name}`;
    profTabP2.textContent = `${u2.avatar} ${u2.name}`;

    const score1 = getTodayCount('user1');
    const score2 = getTodayCount('user2');

    p1Score.textContent = score1;
    p2Score.textContent = score2;

    // Leader crown & Diff
    if (score1 > score2) {
      p1Crown.style.display = 'block';
      p2Crown.style.display = 'none';
      p1Box.classList.add('leading');
      p2Box.classList.remove('leading');
      duelDiff.textContent = `+${score1 - score2} pour ${u1.name}`;
      duelDiff.style.color = '#39d353';
    } else if (score2 > score1) {
      p1Crown.style.display = 'none';
      p2Crown.style.display = 'block';
      p1Box.classList.remove('leading');
      p2Box.classList.add('leading');
      duelDiff.textContent = `+${score2 - score1} pour ${u2.name}`;
      duelDiff.style.color = '#58a6ff';
    } else {
      p1Crown.style.display = 'none';
      p2Crown.style.display = 'none';
      p1Box.classList.remove('leading');
      p2Box.classList.remove('leading');
      duelDiff.textContent = score1 === 0 ? 'En attente' : 'Égalité parfaite 🤝';
      duelDiff.style.color = '#e3b341';
    }

    // Duel progress bar
    const totalToday = score1 + score2;
    if (totalToday === 0) {
      p1Bar.style.width = '50%';
      p2Bar.style.width = '50%';
    } else {
      const pct1 = Math.max(10, Math.min(90, Math.round((score1 / totalToday) * 100)));
      p1Bar.style.width = pct1 + '%';
      p2Bar.style.width = (100 - pct1) + '%';
    }
  }

  function renderActivityFeed() {
    const logs1 = (appData.users.user1?.logs || []).map((l) => ({ ...l, userKey: 'user1' }));
    const logs2 = (appData.users.user2?.logs || []).map((l) => ({ ...l, userKey: 'user2' }));
    const allLogs = [...logs1, ...logs2].sort((a, b) => b.timestamp - a.timestamp);

    const todayStr = getTodayString();
    const todayLogs = allLogs.filter((l) => l.date === todayStr);
    totalLogsToday.textContent = `${todayLogs.length} série${todayLogs.length > 1 ? 's' : ''} aujourd'hui`;

    if (allLogs.length === 0) {
      activityList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 24px 0; font-size: 13px;">
          Aucune pompe enregistrée pour l'instant.<br>Clique sur un bouton ci-dessus pour commencer ! 💪
        </div>`;
      return;
    }

    const recentLogs = allLogs.slice(0, 15);
    let html = '';

    recentLogs.forEach((item) => {
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
          <button class="activity-delete" title="Supprimer cette série" data-user="${item.userKey}" data-id="${item.id}">✕</button>
        </div>`;
    });

    activityList.innerHTML = html;

    // Écouteurs de suppression
    activityList.querySelectorAll('.activity-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const u = e.currentTarget.getAttribute('data-user');
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Supprimer cette série de pompes ?')) {
          deleteLog(u, id);
        }
      });
    });
  }

  function renderProfileStats() {
    const stats = calculateUserStats(currentProfileView);
    const user = appData.users[currentProfileView];

    kpiTotal.textContent = stats.total.toLocaleString('fr-FR');
    kpiTotalSub.textContent = `par ${user.name}`;
    kpiStreak.textContent = `${stats.streak} j`;
    kpiStreakSub.textContent = stats.streak > 0 ? 'En plein feu ! 🔥' : 'Pas de série active';
    kpiBest.textContent = stats.bestDay.toLocaleString('fr-FR');
    kpiAvg.textContent = `${stats.avg} / j`;
  }

  // --- Rendu de la Heatmap Style GitHub ---
  function renderHeatmap() {
    const stats = calculateUserStats(currentProfileView);
    const user = appData.users[currentProfileView];
    const dayMap = stats.dayMap;

    // Calcul des dates pour exactement 52 semaines (364 jours)
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Lundi, 6 = Dimanche

    // On calcule la date de fin de la semaine en cours (Dimanche)
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + (6 - dayOfWeek));

    // Date de début : 52 semaines plus tôt (Lundi)
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (52 * 7 - 1));

    heatmapGrid.innerHTML = '';
    heatmapMonths.innerHTML = '';

    let totalYearPushups = 0;
    const monthsRecorded = [];

    // Boucle sur les 52 semaines
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
        const count = isFuture ? 0 : (dayMap[dateStr] || 0);
        totalYearPushups += count;

        // Calcul du niveau (0 à 4)
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

        if (isFuture) {
          cell.style.opacity = '0.25';
          cell.style.cursor = 'default';
        } else {
          // Tooltip interactions
          cell.addEventListener('mouseenter', showHeatmapTooltip);
          cell.addEventListener('mouseleave', hideHeatmapTooltip);
          cell.addEventListener('click', () => {
            showToast(`${count} pompes le ${formatDateFrench(dateStr)}`);
          });
        }

        // Marquer le début d'un nouveau mois pour l'en-tête
        if (d === 0 && curDate.getDate() <= 7) {
          const monthName = curDate.toLocaleDateString('fr-FR', { month: 'short' });
          monthsRecorded.push({ weekIndex: w, name: monthName.replace('.', '') });
        }

        weekCol.appendChild(cell);
        curDate.setDate(curDate.getDate() + 1);
      }

      heatmapGrid.appendChild(weekCol);
    }

    // Affichage des étiquettes de mois au-dessus
    monthsRecorded.forEach((m) => {
      const span = document.createElement('span');
      span.textContent = m.name;
      span.style.position = 'absolute';
      span.style.left = `${m.weekIndex * 14}px`;
      span.style.textTransform = 'capitalize';
      heatmapMonths.appendChild(span);
    });

    heatmapTotalTitle.textContent = `${totalYearPushups.toLocaleString('fr-FR')} pompes sur la dernière année (${user.name})`;
  }

  function showHeatmapTooltip(e) {
    const dateStr = e.currentTarget.dataset.date;
    const count = parseInt(e.currentTarget.dataset.count, 10);
    const rect = e.currentTarget.getBoundingClientRect();

    const formattedDate = formatDateFrench(dateStr);
    const countText = count === 0 ? 'Aucune pompe' : `${count} pompe${count > 1 ? 's' : ''}`;

    heatmapTooltip.innerHTML = `<strong>${countText}</strong> le ${formattedDate}`;
    heatmapTooltip.style.display = 'block';
    heatmapTooltip.style.left = `${rect.left + rect.width / 2}px`;
    heatmapTooltip.style.top = `${rect.top - 8}px`;
  }

  function hideHeatmapTooltip() {
    heatmapTooltip.style.display = 'none';
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

  // --- Comparatif des 7 derniers jours ---
  function renderWeeklyComparison() {
    const u1 = appData.users.user1;
    const u2 = appData.users.user2;
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

      const dayName = i === 0 ? "Aujourd'hui" : i === 1 ? 'Hier' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });

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

    weeklyComparison.innerHTML = html;
  }

  function updateSettingsFields() {
    p1NameInput.value = appData.users.user1?.name || 'Shaza';
    p1AvatarInput.value = appData.users.user1?.avatar || '⚡';
    p2NameInput.value = appData.users.user2?.name || 'Pote';
    p2AvatarInput.value = appData.users.user2?.avatar || '🔥';
  }

  // --- Synchronisation GitHub REST API ---
  function updateSyncBadge(state, text) {
    syncDot.className = 'status-dot ' + state;
    syncText.textContent = text;
  }

  async function syncWithGitHub(silent = false) {
    const token = getGitHubToken();
    const repo = config.repo || 'shazamifius/minigym';

    if (!token) {
      updateSyncBadge('error', 'Token manquant');
      if (!silent) showToast('Ajoute ton token GitHub dans les Paramètres', false);
      return;
    }

    if (isSyncing) return;
    isSyncing = true;
    updateSyncBadge('syncing', 'Synchro...');

    try {
      const url = `https://api.github.com/repos/${repo}/contents/data.json?ref=${config.branch || 'main'}&t=${Date.now()}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache'
        }
      });

      if (res.status === 404) {
        // Le fichier n'existe pas encore sur le repo, on va le créer
        await pushToGitHub('Initialisation data.json pour MiniGym');
        updateSyncBadge('synced', 'Connecté');
        isSyncing = false;
        return;
      }

      if (!res.ok) {
        throw new Error(`Erreur GitHub API: ${res.status}`);
      }

      const fileData = await res.json();
      ghFileSha = fileData.sha;

      // Décodage base64 UTF-8
      const rawContent = decodeURIComponent(
        escape(window.atob(fileData.content.replace(/\s/g, '')))
      );
      const remoteData = JSON.parse(rawContent);

      // Fusion intelligente des données locales et distantes
      mergeData(remoteData);
      saveLocalData();
      updateUI();

      updateSyncBadge('synced', 'Connecté');
      if (!silent) showToast('Synchronisé avec GitHub avec succès !');
    } catch (err) {
      console.error('Erreur synchronisation GitHub:', err);
      updateSyncBadge('error', 'Erreur synchro');
      if (!silent) showToast(`Erreur synchro : ${err.message}`, false);
    } finally {
      isSyncing = false;
    }
  }

  // Fusion sans perte des logs des deux utilisateurs
  function mergeData(remote) {
    if (!remote || !remote.users) return;

    ['user1', 'user2'].forEach((uKey) => {
      if (!appData.users[uKey]) appData.users[uKey] = remote.users[uKey];
      if (!appData.users[uKey].logs) appData.users[uKey].logs = [];

      const remoteLogs = remote.users[uKey]?.logs || [];
      const localMap = new Map();

      // Indexer par ID
      appData.users[uKey].logs.forEach((l) => localMap.set(l.id, l));
      remoteLogs.forEach((l) => localMap.set(l.id, l));

      // Reconstituer et trier par timestamp décroissant
      appData.users[uKey].logs = Array.from(localMap.values()).sort(
        (a, b) => b.timestamp - a.timestamp
      );

      // Synchroniser les noms si modifiés à distance
      if (remote.users[uKey]?.name) appData.users[uKey].name = remote.users[uKey].name;
      if (remote.users[uKey]?.avatar) appData.users[uKey].avatar = remote.users[uKey].avatar;
    });

    if (remote.settings) {
      appData.settings = { ...appData.settings, ...remote.settings };
    }
  }

  async function pushToGitHub(commitMsg = 'Mise à jour pompes') {
    const token = getGitHubToken();
    const repo = config.repo || 'shazamifius/minigym';

    if (!token) return;

    updateSyncBadge('syncing', 'Envoi...');

    try {
      const contentStr = JSON.stringify(appData, null, 2);
      const base64Content = window.btoa(unescape(encodeURIComponent(contentStr)));

      const bodyPayload = {
        message: commitMsg,
        content: base64Content,
        branch: config.branch || 'main'
      };

      if (ghFileSha) {
        bodyPayload.sha = ghFileSha;
      }

      const res = await fetch(`https://api.github.com/repos/${repo}/contents/data.json`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (res.status === 409) {
        // Conflit SHA (l'autre a poussé en même temps) : on refetch, on fusionne, et on repousse
        console.warn('Conflit SHA détecté, réconciliation automatique...');
        await syncWithGitHub(true);
        // Réessayer une fois
        bodyPayload.sha = ghFileSha;
        const retryRes = await fetch(`https://api.github.com/repos/${repo}/contents/data.json`, {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bodyPayload)
        });
        if (retryRes.ok) {
          const resData = await retryRes.json();
          ghFileSha = resData.content.sha;
          updateSyncBadge('synced', 'Connecté');
        }
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Erreur ${res.status}`);
      }

      const resData = await res.json();
      ghFileSha = resData.content.sha;
      updateSyncBadge('synced', 'Connecté');
    } catch (err) {
      console.error('Erreur push GitHub:', err);
      updateSyncBadge('error', 'Erreur push');
    }
  }

  // --- Gestion des Événements & Interactions ---
  function setupEventListeners() {
    // Boutons de répétitions rapides (5, 10, 15, 20, 30, 50)
    $$('.rep-btn[data-reps]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const reps = parseInt(btn.dataset.reps, 10);
        logPushups(reps);
      });
    });

    // Sélecteur d'acteur dans le Logger
    selectP1Btn.addEventListener('click', () => {
      config.activeUser = 'user1';
      selectP1Btn.classList.add('active');
      selectP2Btn.classList.remove('active');
      saveConfig();
    });

    selectP2Btn.addEventListener('click', () => {
      config.activeUser = 'user2';
      selectP2Btn.classList.add('active');
      selectP1Btn.classList.remove('active');
      saveConfig();
    });

    // Annulation
    undoBtn.addEventListener('click', undoLastLog);

    // Modal personnalisé
    customRepsBtn.addEventListener('click', () => {
      customModal.classList.add('open');
      customRepsInput.value = '';
      customRepsInput.focus();
    });

    cancelCustomBtn.addEventListener('click', () => {
      customModal.classList.remove('open');
    });

    confirmCustomBtn.addEventListener('click', () => {
      const val = parseInt(customRepsInput.value, 10);
      if (val && val > 0) {
        logPushups(val);
        customModal.classList.remove('open');
      } else {
        alert('Veuillez entrer un nombre positif.');
      }
    });

    customRepsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmCustomBtn.click();
    });

    // Profil Switcher dans l'onglet Statistiques
    profTabP1.addEventListener('click', () => {
      currentProfileView = 'user1';
      profTabP1.classList.add('active');
      profTabP2.classList.remove('active');
      renderProfileStats();
      renderHeatmap();
    });

    profTabP2.addEventListener('click', () => {
      currentProfileView = 'user2';
      profTabP2.classList.add('active');
      profTabP1.classList.remove('active');
      renderProfileStats();
      renderHeatmap();
    });

    // Header Sync status click
    syncStatusBtn.addEventListener('click', () => {
      syncWithGitHub(false);
    });

    // Settings : Sauvegarde token & Repo
    saveGhBtn.addEventListener('click', () => {
      const token = ghTokenInput.value.trim();
      const repo = ghRepoInput.value.trim();
      setGitHubToken(token);
      config.repo = repo;
      saveConfig();
      showToast('Configuration enregistrée');
      syncWithGitHub(false);
    });

    forceSyncBtn.addEventListener('click', () => {
      syncWithGitHub(false);
    });

    // Identité par défaut
    myIdentitySelect.addEventListener('change', (e) => {
      config.myIdentity = e.target.value;
      config.activeUser = e.target.value;
      if (e.target.value === 'user1') {
        selectP1Btn.click();
      } else {
        selectP2Btn.click();
      }
      saveConfig();
      showToast(`Identité définie sur ${appData.users[e.target.value].name}`);
    });

    // Paramètres profils
    saveProfilesBtn.addEventListener('click', () => {
      appData.users.user1.name = p1NameInput.value.trim() || 'Shaza';
      appData.users.user1.avatar = p1AvatarInput.value.trim() || '⚡';
      appData.users.user2.name = p2NameInput.value.trim() || 'Pote';
      appData.users.user2.avatar = p2AvatarInput.value.trim() || '🔥';
      saveLocalData();
      updateUI();
      showToast('Profils mis à jour !');
      pushToGitHub('Mise à jour des profils');
    });

    // Export / Import
    exportDataBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appData, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `minigym_backup_${getTodayString()}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    importDataBtn.addEventListener('click', () => {
      importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed && parsed.users) {
            appData = parsed;
            saveLocalData();
            updateUI();
            showToast('Données importées avec succès !');
            pushToGitHub('Restauration sauvegarde JSON');
          } else {
            alert('Fichier JSON invalide.');
          }
        } catch (err) {
          alert('Erreur lors de la lecture du fichier JSON.');
        }
      };
      reader.readAsText(file);
    });

    resetDataBtn.addEventListener('click', () => {
      if (confirm('⚠️ Attention : Voulez-vous vraiment effacer toutes les pompes ?')) {
        appData.users.user1.logs = [];
        appData.users.user2.logs = [];
        saveLocalData();
        updateUI();
        showToast('Données réinitialisées.', false);
        pushToGitHub('Réinitialisation des données');
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

        // Scroll top on tab change
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (targetTab === 'profile') {
          renderHeatmap();
        }
      });
    });
  }

  // Démarrage au chargement de la page
  window.addEventListener('DOMContentLoaded', init);
})();
