/* ==========================================================================
   GYMSYNC — APP SCRIPT
   Phase 1: navigation between views + animated indicator positioning
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * STORAGE — thin, namespaced wrapper around localStorage.
   * Every later phase (workouts, history, streaks) reads/writes through
   * this same helper, so there's one place that handles JSON + failures.
   * ------------------------------------------------------------------ */
  const Storage = {
    prefix: 'gymsync:',

    /**
     * @param {string} key
     * @param {*} fallback - returned if the key is missing or unreadable
     */
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(Storage.prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        console.warn(`GymSync: couldn't read "${key}" from storage.`, error);
        return fallback;
      }
    },

    /** @param {string} key @param {*} value - any JSON-serializable value */
    set(key, value) {
      try {
        localStorage.setItem(Storage.prefix + key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn(`GymSync: couldn't save "${key}" to storage.`, error);
        return false;
      }
    },

    remove(key) {
      localStorage.removeItem(Storage.prefix + key);
    },
  };

  /** Cached DOM references used across this module. */
  const navLinks = Array.from(document.querySelectorAll('.nav__link'));
  const indicator = document.getElementById('navIndicator');
  const viewPanels = Array.from(document.querySelectorAll('[data-view-panel]'));

  /**
   * Switches the visible content view and updates the active nav link.
   * @param {string} viewName - matches a button's data-view / panel's data-view-panel
   */
  function setActiveView(viewName) {
    navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.view === viewName);
    });

    viewPanels.forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== viewName;
    });

    moveIndicatorToActiveLink();
  }

  /**
   * Positions the glowing indicator pill under (mobile) or behind (desktop)
   * the currently active nav link, based on real layout measurements so it
   * stays correct across breakpoints and screen sizes.
   */
  function moveIndicatorToActiveLink() {
    const activeLink = navLinks.find((link) => link.classList.contains('is-active'));
    if (!activeLink || !indicator) return;

    const isDesktopSidebar = window.matchMedia('(min-width: 900px)').matches;

    if (isDesktopSidebar) {
      // Vertical stack: slide indicator down to the active row.
      const offsetTop = activeLink.parentElement.offsetTop;
      indicator.style.transform = `translateY(${offsetTop}px)`;
    } else {
      // Horizontal bar: slide indicator across to the active column.
      const linkRect = activeLink.getBoundingClientRect();
      const listRect = activeLink.closest('.nav__list').getBoundingClientRect();
      const offsetLeft = linkRect.left - listRect.left;
      indicator.style.transform = `translateX(${offsetLeft}px)`;
    }

    // Reveal only after the first real measurement, so it can never flash
    // in its CSS fallback position (which sits over the wrong tab).
    indicator.classList.add('is-ready');
  }

  /** Wires up click handlers for each nav link. */
  function initNavigation() {
    navLinks.forEach((link) => {
      link.addEventListener('click', () => setActiveView(link.dataset.view));
    });

    // Keep the indicator aligned if the viewport crosses the responsive breakpoint.
    window.addEventListener('resize', debounce(moveIndicatorToActiveLink, 120));

    // iOS Safari doesn't always fire 'resize' on rotation; cover it explicitly.
    window.addEventListener('orientationchange', () => {
      setTimeout(moveIndicatorToActiveLink, 50);
    });

    // Fonts/icons finishing their swap can shift column widths by a pixel or two;
    // re-measure once everything has fully loaded.
    window.addEventListener('load', moveIndicatorToActiveLink);
  }

  /**
   * Basic debounce helper so resize handling doesn't run on every pixel change.
   * @param {Function} fn
   * @param {number} delay
   */
  function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  /* ------------------------------------------------------------------ *
   * ONBOARDING — first-launch name capture.
   * Shown once; the saved name gates it out on every visit after.
   * ------------------------------------------------------------------ */
  const onboarding = document.getElementById('onboarding');
  const onboardingForm = document.getElementById('onboardingForm');
  const nameInput = document.getElementById('nameInput');
  const continueBtn = document.getElementById('continueBtn');
  const appShell = document.querySelector('.app');

  /** @returns {string|null} the saved user name, or null if none yet. */
  function getSavedName() {
    return Storage.get('userName', null);
  }

  /** Enables the Continue button only once there's real, trimmed input. */
  function updateContinueButtonState() {
    continueBtn.disabled = nameInput.value.trim().length === 0;
  }

  /**
   * Reveals the first-launch screen and locks interaction out of the app
   * shell behind it (both visually, via layering, and for assistive tech).
   */
  function showOnboarding() {
    onboarding.hidden = false;
    if (appShell) appShell.setAttribute('inert', '');
    // Slight delay so autofocus doesn't fight the fade-in animation.
    requestAnimationFrame(() => nameInput.focus());
  }

  /** Saves the name, then animates the first-launch screen away for good. */
  function completeOnboarding(name) {
    Storage.set('userName', name);
    Dashboard.renderGreeting();

    onboarding.classList.add('is-leaving');
    if (appShell) appShell.removeAttribute('inert');

    // Remove from the layout once the fade/scale transition finishes.
    window.setTimeout(() => {
      onboarding.hidden = true;
    }, 450); // matches --duration-slow
  }

  /** Wires up the onboarding form's input + submit behaviour. */
  function initOnboarding() {
    const savedName = getSavedName();

    if (savedName) {
      onboarding.hidden = true; // returning user: skip it entirely
      return;
    }

    showOnboarding();

    nameInput.addEventListener('input', updateContinueButtonState);

    onboardingForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return; // guarded by disabled button too, belt-and-braces
      completeOnboarding(name);
    });
  }

  /* ------------------------------------------------------------------ *
   * WORKOUT SPLIT — maps each weekday to its split.
   * This mapping is the seed for Phase 4 (which will build the full
   * workout-logic layer on top of it); the dashboard just needs to know
   * today's split to render itself honestly.
   * ------------------------------------------------------------------ */
  const WORKOUT_SPLIT_BY_DAY = [
    'REST', // Sunday
    'PUSH', // Monday
    'PULL', // Tuesday
    'LEGS', // Wednesday
    'PUSH', // Thursday
    'PULL', // Friday
    'LEGS', // Saturday
  ];

  const TRAINING_DAYS_PER_WEEK = WORKOUT_SPLIT_BY_DAY.filter((s) => s !== 'REST').length;

  /** @param {Date} [date] @returns {string} one of PUSH / PULL / LEGS / REST */
  function getTodaySplit(date = new Date()) {
    return WORKOUT_SPLIT_BY_DAY[date.getDay()];
  }

  /* ------------------------------------------------------------------ *
   * DASHBOARD — Home view: greeting, live clock, today's split,
   * quick stats, and the motivational quote.
   * ------------------------------------------------------------------ */
  const QUOTES = [
    { text: 'The only bad workout is the one that didn\u2019t happen.', author: 'Unknown' },
    { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
    { text: 'Strength doesn\u2019t come from what you can do. It comes from overcoming what you once couldn\u2019t.', author: 'Rikki Rogers' },
    { text: 'The body achieves what the mind believes.', author: 'Unknown' },
    { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Unknown' },
    { text: 'Consistency is what transforms average into excellence.', author: 'Unknown' },
    { text: 'You don\u2019t have to be extreme, just consistent.', author: 'Unknown' },
  ];

  /** Picks a quote deterministically from the date, so it holds steady all day. */
  function getQuoteForToday(date = new Date()) {
    const start = new Date(date.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((date - start) / 86400000);
    return QUOTES[dayOfYear % QUOTES.length];
  }

  const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' });
  const clockFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

  const Dashboard = {
    els: {
      greeting: document.getElementById('greeting'),
      currentDay: document.getElementById('currentDay'),
      currentDate: document.getElementById('currentDate'),
      liveClock: document.getElementById('liveClock'),
      splitCard: document.getElementById('splitCard'),
      splitName: document.getElementById('splitName'),
      splitSub: document.getElementById('splitSub'),
      statStreak: document.getElementById('statStreak'),
      statCompleted: document.getElementById('statCompleted'),
      statLastWorkout: document.getElementById('statLastWorkout'),
      quoteText: document.getElementById('quoteText'),
      quoteAuthor: document.getElementById('quoteAuthor'),
      startWorkoutBtn: document.getElementById('startWorkoutBtn'),
    },

    /** Renders "Welcome back, {Name}" — falls back gracefully if unset. */
    renderGreeting() {
      const name = getSavedName();
      this.els.greeting.textContent = name ? `Welcome back, ${name}` : 'Welcome back';
    },

    /** Renders weekday + date once; the clock ticks separately every second. */
    renderDateAndDay(date = new Date()) {
      this.els.currentDay.textContent = dayFormatter.format(date);
      this.els.currentDate.textContent = dateFormatter.format(date);
    },

    renderClock(date = new Date()) {
      this.els.liveClock.textContent = clockFormatter.format(date);
    },

    /** Starts the live clock, ticking once a second. */
    startLiveClock() {
      this.renderClock();
      window.setInterval(() => this.renderClock(), 1000);
    },

    /** Renders today's split, with a visually calmer state for rest days. */
    renderSplit(date = new Date()) {
      const split = getTodaySplit(date);
      const isRest = split === 'REST';

      this.els.splitName.textContent = isRest ? 'REST DAY' : split;
      this.els.splitSub.textContent = isRest
        ? 'Recover today \u2014 you\u2019ve earned it.'
        : 'Today\u2019s scheduled split';

      this.els.splitCard.classList.toggle('is-rest', isRest);
      this.els.startWorkoutBtn.classList.toggle('is-rest', isRest);
      this.els.startWorkoutBtn.textContent = isRest ? 'No Workout Today' : 'Start Workout';
    },

    /** Reads whatever real progress exists in storage; defaults are honest zeros. */
    renderStats() {
      const streak = Storage.get('streak', 0);
      const completedThisWeek = Storage.get('completedThisWeek', 0);
      const lastWorkout = Storage.get('lastWorkout', null);

      this.els.statStreak.textContent = String(streak);
      this.els.statCompleted.textContent = `${completedThisWeek}/${TRAINING_DAYS_PER_WEEK}`;
      this.els.statLastWorkout.textContent = lastWorkout
        ? `${lastWorkout.split} \u2014 ${lastWorkout.dateLabel}`
        : 'No workouts yet';
    },

    renderQuote(date = new Date()) {
      const quote = getQuoteForToday(date);
      this.els.quoteText.textContent = `\u201C${quote.text}\u201D`;
      this.els.quoteAuthor.textContent = `\u2014 ${quote.author}`;
    },

    /** Full render pass; called on load and whenever the saved name changes. */
    renderAll() {
      const now = new Date();
      this.renderGreeting();
      this.renderDateAndDay(now);
      this.renderSplit(now);
      this.renderStats();
      this.renderQuote(now);
    },

    init() {
      this.renderAll();
      this.startLiveClock();

      // The Workout screen itself arrives in Phase 5; for now this just
      // takes the person to that tab using the existing nav logic.
      this.els.startWorkoutBtn.addEventListener('click', () => setActiveView('workout'));
    },
  };

  /** App entry point. */
  function init() {
    initOnboarding();
    initNavigation();
    Dashboard.init();
    // Position the indicator once layout has settled on first paint.
    // No need to wait for DOMContentLoaded: this script sits at the end of
    // <body>, so every element above it is already parsed and in the DOM.
    requestAnimationFrame(moveIndicatorToActiveLink);
  }

  init();
})();