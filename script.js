/* ==========================================================================
   GYMSYNC — APP SCRIPT
   Phase 1: navigation between views + animated indicator positioning
   ========================================================================== */

(() => {
  'use strict';

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

  /** App entry point. */
  function init() {
    initNavigation();
    // Position the indicator once layout has settled on first paint.
    // No need to wait for DOMContentLoaded: this script sits at the end of
    // <body>, so every element above it is already parsed and in the DOM.
    requestAnimationFrame(moveIndicatorToActiveLink);
  }

  init();
})();