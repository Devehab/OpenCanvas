// OpenCanvas landing page: language links, mobile menu, the video, the
// feature showcase, install tabs, copy buttons and scroll reveals. No
// dependencies, no network requests. Each language is its own page (built by
// scripts/site/build.mjs), so nothing here translates the page.
(() => {
  const root = document.documentElement;
  const STORAGE_KEY = 'oc-site-lang';

  const TEXT = {
    en: { copy: 'Copy', copied: 'Copied to the clipboard' },
    ar: { copy: 'نسخ', copied: 'نُسِخ إلى الحافظة' },
  }[root.lang === 'ar' ? 'ar' : 'en'];

  const live = document.querySelector('[data-live]');
  const announce = (message) => {
    if (!live) return;
    live.textContent = '';
    window.setTimeout(() => {
      live.textContent = message;
    }, 50);
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- The video ----------
  const stage = document.querySelector('[data-stage]');
  const playButton = stage?.querySelector('[data-play]');
  const stageVideo = stage?.querySelector('video');
  const stagePoster = stage?.querySelector('[data-stage-poster]');
  // With JavaScript the poster carries a big play button; without it, the
  // browser's own controls stay.
  if (stageVideo) stageVideo.controls = false;
  if (playButton) playButton.hidden = false;
  function playStage() {
    const video = stageVideo;
    if (!video) return;
    playButton.hidden = true;
    if (stagePoster) stagePoster.hidden = true;
    video.controls = true;
    video.play().catch(() => {
      // Autoplay rules or a missing file: the controls are there to retry.
    });
    video.focus({ preventScroll: true });
  }
  playButton?.addEventListener('click', playStage);
  for (const link of document.querySelectorAll('[data-watch]')) {
    link.addEventListener('click', (event) => {
      if (!stage) return;
      event.preventDefault();
      stage.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      playStage();
    });
  }

  // ---------- Language link ----------
  // The other language is another page. Remember the choice (the English
  // page sends returning Arabic readers to theirs) and keep the place.
  for (const link of document.querySelectorAll('[data-lang-toggle]')) {
    link.addEventListener('click', () => {
      try {
        localStorage.setItem(STORAGE_KEY, link.hreflang === 'ar' ? 'ar' : 'en');
      } catch {
        // Storage can be unavailable (private mode); the link still works.
      }
      link.hash = window.location.hash;
    });
  }

  // ---------- Mobile menu ----------
  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('[data-menu-toggle]');
  const setMenu = (open) => {
    header.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
  };
  menuButton?.addEventListener('click', () => setMenu(!header.classList.contains('open')));
  for (const link of document.querySelectorAll('.nav-links a'))
    link.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('open')) {
      setMenu(false);
      menuButton.focus();
    }
  });

  // ---------- Feature showcase ----------
  const showcase = document.querySelector('[data-showcase]');
  const featureTabs = showcase ? [...showcase.querySelectorAll('[role="tab"]')] : [];
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  let showcaseSeen = false;
  let showcaseNear = false;
  /** Gives the selected clip its poster once the showcase is close to the screen. */
  function showPoster(video) {
    if (showcaseNear && video && !video.poster && video.dataset.poster) video.poster = video.dataset.poster;
  }
  /** Plays the clip of the selected feature, pauses the rest. */
  function playShowcase() {
    if (!showcase) return;
    for (const tab of featureTabs) {
      const selected = tab.getAttribute('aria-selected') === 'true';
      const video = panelOf(tab).querySelector('video');
      if (!video) continue;
      if (selected) showPoster(video);
      const play = selected && showcaseSeen;
      if (play && !video.src) {
        video.src = video.dataset.src;
        if (reducedMotion) video.controls = true;
      }
      if (play && !reducedMotion) video.play().catch(() => {});
      else if (!video.paused) video.pause();
    }
  }
  function selectFeature(tab, focus = false) {
    for (const other of featureTabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      panelOf(other).toggleAttribute('data-hidden', !selected);
    }
    if (focus) tab.focus();
    // Keep the chosen tab in view in the horizontal list (small screens).
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    const video = panelOf(tab).querySelector('video');
    if (video && video.src) video.currentTime = 0;
    playShowcase();
  }
  if (showcase) {
    for (const tab of featureTabs) tab.addEventListener('click', () => selectFeature(tab));
    showcase.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
      const index = featureTabs.indexOf(document.activeElement);
      if (index === -1) return;
      const rtl = root.dir === 'rtl';
      const forward = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
      let next = null;
      if (event.key in forward) next = index + forward[event.key];
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = featureTabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      selectFeature(featureTabs[(next + featureTabs.length) % featureTabs.length], true);
    });
    // Load the first poster when the showcase comes close, play clips only
    // once it is on screen, and pause them when it scrolls away.
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          showcaseNear = true;
          near.disconnect();
          playShowcase();
        },
        { rootMargin: '600px 0px' },
      );
      near.observe(showcase);
      new IntersectionObserver(
        (entries) => {
          const on = entries.some((entry) => entry.isIntersecting);
          showcaseSeen = on;
          if (on) playShowcase();
          else for (const video of showcase.querySelectorAll('video')) video.pause();
        },
        { threshold: 0.15 },
      ).observe(showcase);
    } else {
      showcaseNear = true;
      showcaseSeen = true;
      playShowcase();
    }
  }

  // ---------- Install tabs ----------
  const tablist = document.querySelector('[data-tabs] [role="tablist"]');
  if (tablist) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const select = (tab, focus = false) => {
      for (const other of tabs) {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
      }
      if (focus) tab.focus();
    };
    for (const tab of tabs) tab.addEventListener('click', () => select(tab));
    tablist.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(document.activeElement);
      if (index === -1) return;
      const rtl = root.dir === 'rtl';
      let next = null;
      if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
      else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });

    // Open the visitor's own operating system first.
    const platform = (
      navigator.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      ''
    ).toLowerCase();
    const os = platform.includes('win')
      ? 'windows'
      : platform.includes('mac') || platform.includes('iphone') || platform.includes('ipad')
        ? 'macos'
        : platform.includes('linux') || platform.includes('android') || platform.includes('cros')
          ? 'linux'
          : 'macos';
    const initial = tabs.find((tab) => tab.dataset.os === os);
    if (initial) select(initial);
  }

  // ---------- Copy buttons ----------
  const COPY_ICON =
    '<svg class="i copy-icon" aria-hidden="true"><use href="#i-copy"/></svg><svg class="i done-icon" aria-hidden="true"><use href="#i-check"/></svg>';
  for (const block of document.querySelectorAll('.code')) {
    const pre = block.querySelector('pre');
    // Long commands scroll sideways; keyboard users can focus and scroll them.
    pre.tabIndex = 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.setAttribute('aria-label', TEXT.copy);
    button.innerHTML = COPY_ICON;
    button.addEventListener('click', async () => {
      // Copy the commands without the explanatory comments.
      const text = pre.innerText
        .split('\n')
        .map((line) => line.replace(/\s+#.*$/, '').replace(/^#.*$/, ''))
        .filter((line) => line.trim() !== '')
        .join('\n');
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
      }
      button.classList.add('done');
      announce(TEXT.copied);
      window.setTimeout(() => button.classList.remove('done'), 1600);
    });
    block.appendChild(button);
  }

  // ---------- Reveal on scroll ----------
  const revealed = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    for (const el of revealed) observer.observe(el);
  } else {
    for (const el of revealed) el.classList.add('in');
  }

  playShowcase();
})();
