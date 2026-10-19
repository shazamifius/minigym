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
  // --- Configuration Initiale ---
  let config = {
    myIdentity: 'user1', // 'user1' (Shaza) ou 'user2' (darling)
    activeLoggerUser: 'user1',
    activeAgendaOwner: 'user1',
    activeProfileStats: 'user1',
    activeTab: 'calendar'
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
    ParticleFX.init();
    loadLocalConfig();
    checkUrlParams();
    loadLocalData();
    ensureDataStructure();
    initFirebase();
    setupEventListeners();
    setupRevolutKeypad();
    setupNavigation();
    restoreActiveTab();
    updateUI();
    updateHeaderIdentityBadge();
    generateShareUrl();
  }

  // Vérifier si le lien a été ouvert avec ?role=darling ou ?role=shaza
  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (role === 'copine' || role === 'darling' || role === 'user2') {
      setMyIdentity('user2', false);
      showToast('🌸 Espace darling connecté');
      // Nettoyer l'URL dans la barre d'adresse pour ne pas re-forcer le rôle à chaque rafraîchissement
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {}
    } else if (role === 'shaza' || role === 'user1') {
      setMyIdentity('user1', false);
      showToast('💪 Espace Shaza connecté');
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {}
    }
  }

  // Changer et verrouiller l'identité active sur cet appareil
  function setMyIdentity(userId, showFeedback = true) {
    config.myIdentity = userId;
    config.activeLoggerUser = userId;
    config.activeAgendaOwner = userId;
    config.activeProfileStats = userId;
    saveConfig();

    if ($('myIdentitySelect')) $('myIdentitySelect').value = userId;
    updateHeaderIdentityBadge();
    updateUI();

    if (showFeedback) {
      SoundFX.preset(20);
      const name = appData.users[userId]?.name || (userId === 'user1' ? 'Shaza' : 'darling');
      showToast(`Profil actif : ${name}`);
    }
  }

  function updateHeaderIdentityBadge() {
    const dot = $('headerIdentityDot');
    const label = $('headerIdentityName');
    if (!label) return;
    const isU2 = config.myIdentity === 'user2';
    const user = isU2 ? appData.users.user2 : appData.users.user1;
    label.textContent = user?.name || (isU2 ? 'darling' : 'Shaza');
    if (dot) dot.style.color = user?.color || (isU2 ? 'var(--p2)' : 'var(--p1)');
  }

  function loadLocalConfig() {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        config = { ...config, ...JSON.parse(savedConfig) };
      }
      if (!config.activeLoggerUser) config.activeLoggerUser = config.myIdentity || 'user1';
      if (!config.activeAgendaOwner) config.activeAgendaOwner = config.myIdentity || 'user1';
      if (!config.activeProfileStats) config.activeProfileStats = config.myIdentity || 'user1';

      if ($('myIdentitySelect')) $('myIdentitySelect').value = config.myIdentity || 'user1';
      if ($('firebaseRoomInput')) $('firebaseRoomInput').value = fbConfig.room;
      if ($('firebaseDbUrlInput')) $('firebaseDbUrlInput').value = fbConfig.databaseURL;
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

  // --- Moteur Audio & Synthétiseur Procédural (Web Audio API) ---
  let sharedAudioCtx = null;

  function getAudioCtx() {
    if (!sharedAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  }

  const SoundFX = {
    // Touche pavé numérique : clic doux marimba avec pitch montant légèrement par chiffre
    key(digit) {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const num = typeof digit === 'number' ? digit : (parseInt(digit, 10) || 1);
        const freq = 360 + num * 24;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.82, now + 0.045);

        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    },

    // Touche Effacer (⌫) : léger tap étouffé descendant
    backspace() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.065);
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    },

    // Touche Clear (C) : double micro-tap
    clear() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        [0, 0.04].forEach((delay, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + delay;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(i === 0 ? 340 : 230, t);
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.035);
        });
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate([10, 20, 10]); } catch (e) {}
    },

    // Presets rapides (+5, +10, +15, +20, +50) : double tonalité cristalline ascendante
    preset(addVal) {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const base = addVal >= 50 ? 660 : addVal >= 20 ? 587 : 523;
        [0, 0.04].forEach((delay, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + delay;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(i === 0 ? base : base * 1.33, t);
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.08);
        });
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) {}
    },

    // Validation série pompes : accord céleste arpégé (C5, E5, G5, C6) riche et gratifiant
    submit() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.065;
          osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.38);
        });
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate([35, 40, 60]); } catch (e) {}
    },

    // Collage d'une gommette : bruitage mécanique de tampon satisfaisant avec résonance
    stamp() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        // Bruit d'impact
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);

        // Résonance brillante
        const bell = ctx.createOscillator();
        const bellGain = ctx.createGain();
        bell.type = 'triangle';
        bell.frequency.setValueAtTime(880, now + 0.02);
        bellGain.gain.setValueAtTime(0.1, now + 0.02);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        bell.connect(bellGain);
        bellGain.connect(ctx.destination);
        bell.start(now + 0.02);
        bell.stop(now + 0.16);
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(28); } catch (e) {}
    },

    // Décollage gommette : son de décollement / pincement papier
    unstick() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(680, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    },

    // Validation traitement pris ("Valider ✓") : carillon de cristal pur (E6 & A6)
    validate() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        [1318.5, 1760.0].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + i * 0.05;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.42);
        });
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate([40, 30, 45]); } catch (e) {}
    },

    // Changement d'onglet : swoosh aéré futuriste
    tab() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.05);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } catch (e) {}
    },

    // Annuler (Undo) : glissando descendant doux
    undo() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.12);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) {}
    },

    // Micro interaction : navigation calendrier, sélecteur
    nav() {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.03);
      } catch (e) {}
    }
  };

  function playSound(type) {
    if (SoundFX[type]) {
      SoundFX[type]();
    } else {
      SoundFX.key();
    }
  }

  // --- Moteur de Particules & Sparkles Visuels (Canvas 2D) ---
  const ParticleFX = {
    canvas: null,
    ctx: null,
    particles: [],
    animId: null,

    init() {
      this.canvas = $('fxCanvas');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    },

    resize() {
      if (!this.canvas) return;
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      if (this.ctx) {
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    },

    burst(x, y, options = {}) {
      if (!this.canvas || !this.ctx) this.init();
      if (!this.canvas || !this.ctx) return;
      const count = options.count || 28;
      const colors = options.colors || ['#f43f5e', '#ec4899', '#8b5cf6', '#ffffff', '#38bdf8'];
      const maxSpeed = options.speed || 5;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * maxSpeed + 1.2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 4.5 + 2;
        const isStar = Math.random() > 0.6;

        this.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          color: color,
          size: size,
          alpha: 1,
          decay: Math.random() * 0.022 + 0.016,
          gravity: options.gravity !== undefined ? options.gravity : 0.16,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.2,
          isStar: isStar
        });
      }

      if (!this.animId) {
        this.loop();
      }
    },

    burstElement(el, options = {}) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      this.burst(x, y, options);
    },

    loop() {
      if (!this.ctx || !this.canvas) return;
      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98;
        p.alpha -= p.decay;
        p.rotation += p.rotSpeed;

        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
          continue;
        }

        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.alpha);
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = 6;

        if (p.isStar) {
          const s = p.size;
          this.ctx.fillRect(-s / 2, -s / 6, s, s / 3);
          this.ctx.fillRect(-s / 6, -s / 2, s / 3, s);
        } else {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }

        this.ctx.restore();
      }

      if (this.particles.length > 0) {
        this.animId = requestAnimationFrame(() => this.loop());
      } else {
        this.animId = null;
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }
  };

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

        if (keyVal === 'clear') {
          SoundFX.clear();
          revolutInputValue = 0;
        } else if (keyVal === 'backspace') {
          SoundFX.backspace();
          const str = String(revolutInputValue);
          if (str.length <= 1) {
            revolutInputValue = 0;
          } else {
            revolutInputValue = parseInt(str.slice(0, -1), 10) || 0;
          }
        } else {
          // Ajouter le chiffre avec feedback sonore mélodique
          SoundFX.key(keyVal);
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
        SoundFX.preset(addVal);
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
    const selectActor = (userId) => {
      SoundFX.nav();
      config.activeLoggerUser = userId;
      saveConfig();
      const isU2 = userId === 'user2';
      $('selectP2Btn').classList.toggle('active', isU2);
      $('selectP1Btn').classList.toggle('active', !isU2);
      $('cardPartnerP2').classList.toggle('active-selected', isU2);
      $('cardPartnerP1').classList.toggle('active-selected', !isU2);
      $('revolutTargetBadge').textContent = `Pour ${appData.users[userId]?.name || 'Duo'}`;
      updateRevolutDisplay();
    };

    $('selectP1Btn').addEventListener('click', () => selectActor('user1'));
    $('selectP2Btn').addEventListener('click', () => selectActor('user2'));
    $('cardPartnerP1').addEventListener('click', () => selectActor('user1'));
    $('cardPartnerP2').addEventListener('click', () => selectActor('user2'));
  }

  function updateRevolutDisplay() {
    const inputEl = $('revolutCurrentInput');
    inputEl.textContent = revolutInputValue;
    inputEl.classList.remove('digit-bounce');
    void inputEl.offsetWidth; // re-flow pour rejouer l'animation élastique
    inputEl.classList.add('digit-bounce');

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

    SoundFX.submit();
    ParticleFX.burstElement($('revolutSubmitBtn'), {
      count: 38,
      colors: [user.color, '#38bdf8', '#fbbf24', '#ffffff', '#ec4899'],
      speed: 6
    });

    showToast(`+${count} pompes enregistrées pour ${user.name}`);

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
        SoundFX.undo();
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
        SoundFX.unstick();
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

  function toggleStickerOnDay(userId, dateStr, stickerId, clickEvent = null) {
    ensureDataStructure();
    if (!appData.health.calendar[userId][dateStr]) {
      appData.health.calendar[userId][dateStr] = [];
    }

    let dayStickers = appData.health.calendar[userId][dateStr];
    const existingIndex = dayStickers.findIndex((s) => s.stickerId === stickerId);
    const def = (appData.health.stickers || []).find((s) => s.id === stickerId) || { name: 'Gommette', color: '#f43f5e' };

    if (existingIndex !== -1) {
      // Décoller
      dayStickers.splice(existingIndex, 1);
      SoundFX.unstick();
      showToast(`Gommette "${def.name}" retirée`);
    } else {
      // Coller
      dayStickers.push({
        id: 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        stickerId: stickerId,
        taken: false,
        addedAt: new Date().toISOString()
      });
      SoundFX.stamp();
      if (clickEvent && clickEvent.clientX) {
        ParticleFX.burst(clickEvent.clientX, clickEvent.clientY, {
          count: 22,
          colors: [def.color, '#ffffff', '#fbbf24', '#f43f5e'],
          speed: 4
        });
      }
      showToast(`"${def.name}" collée sur le ${formatDateFrench(dateStr)}`);
    }

    appData.health.calendar[userId][dateStr] = dayStickers;
    renderCalendar();
    syncDataToFirebase();
  }

  function toggleStickerTaken(userId, dateStr, entryId, clickEvent = null) {
    ensureDataStructure();
    const dayStickers = appData.health.calendar[userId]?.[dateStr] || [];
    const entry = dayStickers.find((s) => s.id === entryId);
    if (entry) {
      entry.taken = !entry.taken;
      if (entry.taken) {
        SoundFX.validate();
        if (clickEvent && clickEvent.clientX) {
          ParticleFX.burst(clickEvent.clientX, clickEvent.clientY, {
            count: 26,
            colors: ['#10b981', '#34d399', '#fbbf24', '#ffffff'],
            speed: 4.5
          });
        }
        showToast('Validé ✓ Traitement pris');
      } else {
        SoundFX.unstick();
        showToast('Statut réinitialisé');
      }
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
          // Mode collage actif : coller ou décoller directement avec animation de cellule
          cell.classList.remove('cell-stamped');
          void cell.offsetWidth;
          cell.classList.add('cell-stamped');
          toggleStickerOnDay(agendaOwner, fullDateStr, activeSelectedStickerId, e);
        } else {
          // Mode consultation : ouvrir le détail de la journée
          SoundFX.nav();
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
          SoundFX.unstick();
          $('activeStickerAlert').style.display = 'none';
        } else {
          // Activer le mode collage
          activeSelectedStickerId = stk.id;
          SoundFX.nav();
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

        const doneBtn = row.querySelector(`#toggleDone_${entry.id}`);
        doneBtn.addEventListener('click', (e) => {
          doneBtn.classList.add('btn-success-fx');
          toggleStickerTaken(userId, dateStr, entry.id, e);
          openDayDetailModal(userId, dateStr);
        });

        row.querySelector(`#delStk_${entry.id}`).addEventListener('click', (e) => {
          toggleStickerOnDay(userId, dateStr, entry.stickerId, e);
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
      btn.addEventListener('click', (e) => {
        toggleStickerOnDay(userId, dateStr, stk.id, e);
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

    // Synchronisation dynamique de tous les sélecteurs
    const isLogU2 = config.activeLoggerUser === 'user2';
    $('selectP2Btn').classList.toggle('active', isLogU2);
    $('selectP1Btn').classList.toggle('active', !isLogU2);
    $('cardPartnerP2').classList.toggle('active-selected', isLogU2);
    $('cardPartnerP1').classList.toggle('active-selected', !isLogU2);
    $('revolutTargetBadge').textContent = `Pour ${isLogU2 ? u2.name : u1.name}`;

    const isAgendaU2 = config.activeAgendaOwner === 'user2';
    $('agendaOwnerP2Btn').classList.toggle('active', isAgendaU2);
    $('agendaOwnerP1Btn').classList.toggle('active', !isAgendaU2);

    const isProfU2 = config.activeProfileStats === 'user2';
    $('profTabP2').classList.toggle('active', isProfU2);
    $('profTabP1').classList.toggle('active', !isProfU2);

    updateHeaderIdentityBadge();
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
    if ($('shareUrlDarlingInput')) $('shareUrlDarlingInput').value = `${baseUrl}?role=darling`;
    if ($('shareUrlShazaInput')) $('shareUrlShazaInput').value = `${baseUrl}?role=shaza`;
  }

  // --- Gestion des Événements & Modals ---
  function setupEventListeners() {
    $('undoBtn').addEventListener('click', undoLastLog);

    // Navigation Calendrier (Mois précédent / suivant)
    $('calPrevMonthBtn').addEventListener('click', () => {
      SoundFX.nav();
      currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
      renderCalendar();
    });

    $('calNextMonthBtn').addEventListener('click', () => {
      SoundFX.nav();
      currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
      renderCalendar();
    });

    $('calTodayBtn').addEventListener('click', () => {
      SoundFX.nav();
      currentMonthDate = new Date();
      renderCalendar();
    });

    // Switcher Propriétaire Agenda
    $('agendaOwnerP2Btn').addEventListener('click', () => {
      SoundFX.nav();
      config.activeAgendaOwner = 'user2';
      saveConfig();
      $('agendaOwnerP2Btn').classList.add('active');
      $('agendaOwnerP1Btn').classList.remove('active');
      renderCalendar();
    });

    $('agendaOwnerP1Btn').addEventListener('click', () => {
      SoundFX.nav();
      config.activeAgendaOwner = 'user1';
      saveConfig();
      $('agendaOwnerP1Btn').classList.add('active');
      $('agendaOwnerP2Btn').classList.remove('active');
      renderCalendar();
    });

    // Bouton Changement Rapide d'Identité dans l'En-tête
    if ($('headerIdentityBtn')) {
      $('headerIdentityBtn').addEventListener('click', (e) => {
        const nextId = config.myIdentity === 'user1' ? 'user2' : 'user1';
        setMyIdentity(nextId, true);
        if (e && e.clientX) {
          const color = nextId === 'user2' ? '#f43f5e' : '#4ade80';
          ParticleFX.burst(e.clientX, e.clientY, { count: 18, colors: [color, '#ffffff'] });
        }
      });
    }

    // Arrêter mode collage
    $('stopPlacingStickerBtn').addEventListener('click', () => {
      activeSelectedStickerId = null;
      SoundFX.unstick();
      $('activeStickerAlert').style.display = 'none';
      renderStickersRibbon();
    });

    // Modal Nouvelle Gommette
    $('openNewStickerModalBtn').addEventListener('click', () => {
      SoundFX.nav();
      $('newStickerModal').classList.add('sheet-open');
      $('newStickerName').value = '';
    });

    $('closeNewStickerModalBtn').addEventListener('click', () => {
      SoundFX.nav();
      $('newStickerModal').classList.remove('sheet-open');
    });

    $('saveNewStickerBtn').addEventListener('click', (e) => {
      const name = $('newStickerName').value.trim();
      const color = $('newStickerColor').value;
      if (!name) return;

      ensureDataStructure();
      appData.health.stickers.push({
        id: 'stk_' + Date.now(),
        name: name,
        color: color
      });

      SoundFX.submit();
      if (e && e.clientX) {
        ParticleFX.burst(e.clientX, e.clientY, { count: 20, colors: [color, '#ffffff'] });
      }

      renderStickersRibbon();
      syncDataToFirebase();
      $('newStickerModal').classList.remove('sheet-open');
      showToast(`Gommette "${name}" ajoutée`);
    });

    $('closeDayDetailModalBtn').addEventListener('click', () => {
      SoundFX.nav();
      $('dayDetailModal').classList.remove('sheet-open');
    });

    // Modal Partage
    $('openShareModalBtn').addEventListener('click', () => {
      SoundFX.nav();
      generateShareUrl();
      $('shareModal').classList.add('sheet-open');
    });

    $('closeShareModalBtn').addEventListener('click', () => {
      SoundFX.nav();
      $('shareModal').classList.remove('sheet-open');
    });

    if ($('copyShareUrlDarlingBtn')) {
      $('copyShareUrlDarlingBtn').addEventListener('click', (e) => {
        const input = $('shareUrlDarlingInput');
        input.select();
        SoundFX.preset(20);
        if (e && e.clientX) {
          ParticleFX.burst(e.clientX, e.clientY, { count: 20, colors: ['#f43f5e', '#ffffff'] });
        }
        navigator.clipboard.writeText(input.value).then(() => {
          showToast('Lien darling copié !');
        });
      });
    }

    if ($('copyShareUrlShazaBtn')) {
      $('copyShareUrlShazaBtn').addEventListener('click', (e) => {
        const input = $('shareUrlShazaInput');
        input.select();
        SoundFX.preset(20);
        if (e && e.clientX) {
          ParticleFX.burst(e.clientX, e.clientY, { count: 20, colors: ['#4ade80', '#ffffff'] });
        }
        navigator.clipboard.writeText(input.value).then(() => {
          showToast('Lien Shaza copié !');
        });
      });
    }

    // Stats Switch
    $('profTabP1').addEventListener('click', () => {
      SoundFX.nav();
      config.activeProfileStats = 'user1';
      saveConfig();
      $('profTabP1').classList.add('active');
      $('profTabP2').classList.remove('active');
      renderProfileStats();
      renderHeatmap();
    });

    $('profTabP2').addEventListener('click', () => {
      SoundFX.nav();
      config.activeProfileStats = 'user2';
      saveConfig();
      $('profTabP2').classList.add('active');
      $('profTabP1').classList.remove('active');
      renderProfileStats();
      renderHeatmap();
    });

    // Paramètres Profils
    $('saveProfilesBtn').addEventListener('click', () => {
      appData.users.user1.name = $('p1NameInput').value.trim() || 'Shaza';
      appData.users.user2.name = $('p2NameInput').value.trim() || 'darling';
      if ($('myIdentitySelect')) config.myIdentity = $('myIdentitySelect').value;
      saveConfig();
      updateHeaderIdentityBadge();
      updateUI();
      syncDataToFirebase();
      showToast('Profils enregistrés');
    });

    if ($('myIdentitySelect')) {
      $('myIdentitySelect').addEventListener('change', () => {
        setMyIdentity($('myIdentitySelect').value, true);
      });
    }

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
        SoundFX.tab();
        const targetTab = tab.dataset.tab;
        config.activeTab = targetTab;
        saveConfig();

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

  function restoreActiveTab() {
    const targetTab = config.activeTab || 'calendar';
    const tab = document.querySelector(`.bottom-nav-tab[data-tab="${targetTab}"]`);
    if (tab) {
      $$('.bottom-nav-tab').forEach((t) => t.classList.remove('active-tab'));
      $$('.tab-view-container').forEach((v) => v.classList.remove('active-view'));

      tab.classList.add('active-tab');
      const view = $(`view-${targetTab}`);
      if (view) view.classList.add('active-view');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
