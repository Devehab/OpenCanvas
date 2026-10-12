// OpenCanvas landing page: language switch, mobile menu, the video, the
// feature showcase, install tabs, copy buttons and scroll reveals. No
// dependencies, no network requests.
(() => {
  const root = document.documentElement;
  const STORAGE_KEY = 'oc-site-lang';

  const TEXT = {
    en: {
      title: 'OpenCanvas — The free, open-source design editor you own',
      description:
        'OpenCanvas is a free, open-source alternative to paid online design tools: photo frames, crop, about 2,900 icons, brand kits, multi-page designs and pro exports. Host it yourself; your designs stay on your device.',
      copy: 'Copy',
      copied: 'Copied to the clipboard',
      tabs: 'Operating system',
      features: 'Features',
      stats: 'OpenCanvas in numbers',
      switched: 'The page is now in English',
    },
    ar: {
      title: 'OpenCanvas — محرّر تصاميم مجاني ومفتوح المصدر تملكه أنت',
      description:
        'OpenCanvas بديل مجاني ومفتوح المصدر لأدوات التصميم المدفوعة: إطارات الصور، والقصّ، ونحو 2900 أيقونة، وحزم الهوية، والتصاميم متعددة الصفحات، والتصدير الاحترافي. استضِفه بنفسك، وتبقى تصاميمك على جهازك.',
      copy: 'نسخ',
      copied: 'نُسِخ إلى الحافظة',
      tabs: 'نظام التشغيل',
      features: 'الميزات',
      stats: 'OpenCanvas بالأرقام',
      switched: 'أصبحت الصفحة بالعربية',
    },
  };

  const live = document.querySelector('[data-live]');
  const announce = (message) => {
    if (!live) return;
    live.textContent = '';
    window.setTimeout(() => {
      live.textContent = message;
    }, 50);
  };

  // Media whose description has an Arabic variant keep the English one aside.
  const altMedia = [...document.querySelectorAll('[data-alt-ar]')];
  const altAttr = (el) => (el.tagName === 'IMG' ? 'alt' : 'aria-label');
  for (const el of altMedia) el.dataset.altEn = el.getAttribute(altAttr(el));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** The element of a pair shown in the current language. */
  const visible = (list) => list.find((el) => !el.dataset.l || el.dataset.l === root.lang) ?? list[0];

  function applyLanguage(lang) {
    const t = TEXT[lang];
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
    for (const el of altMedia)
      el.setAttribute(altAttr(el), lang === 'ar' ? el.dataset.altAr : el.dataset.altEn);
    for (const button of document.querySelectorAll('.copy')) button.setAttribute('aria-label', t.copy);
    document.querySelector('[data-tabs] [role="tablist"]')?.setAttribute('aria-label', t.tabs);
    document.querySelector('[data-showcase] [role="tablist"]')?.setAttribute('aria-label', t.features);
    document.querySelector('.stats')?.setAttribute('aria-label', t.stats);
    resetStage();
    playShowcase();
  }

  // ---------- The video ----------
  const stage = document.querySelector('[data-stage]');
  const playButton = stage?.querySelector('[data-play]');
  const stageVideos = stage ? [...stage.querySelectorAll('video')] : [];
  // With JavaScript the poster carries a big play button; without it, the
  // browser's own controls stay.
  for (const video of stageVideos) video.controls = false;
  if (playButton) playButton.hidden = false;
  function resetStage() {
    for (const video of stageVideos) {
      if (!video.paused) video.pause();
      video.controls = false;
    }
    if (playButton) playButton.hidden = false;
  }
  function playStage() {
    const video = visible(stageVideos);
    if (!video) return;
    playButton.hidden = true;
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

  // ---------- Language toggle ----------
  for (const toggle of document.querySelectorAll('[data-lang-toggle]')) {
    toggle.addEventListener('click', () => {
      const next = root.lang === 'ar' ? 'en' : 'ar';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be unavailable (private mode); the switch still works.
      }
      // Drop an explicit ?lang= so a reload keeps the visitor's choice.
      const url = new URL(window.location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.delete('lang');
        history.replaceState(null, '', url);
      }
      applyLanguage(next);
      announce(TEXT[next].switched);
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
  /** Plays the clip of the selected feature (in the page language), pauses the rest. */
  function playShowcase() {
    if (!showcase) return;
    for (const tab of featureTabs) {
      const selected = tab.getAttribute('aria-selected') === 'true';
      const videos = [...panelOf(tab).querySelectorAll('video')];
      const current = visible(videos);
      for (const video of videos) {
        const play = selected && video === current && showcaseSeen;
        if (play && !video.src) {
          video.src = video.dataset.src;
          if (reducedMotion) video.controls = true;
        }
        if (play && !reducedMotion) video.play().catch(() => {});
        else if (!video.paused) video.pause();
      }
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
    const video = visible([...panelOf(tab).querySelectorAll('video')]);
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
    // Load and play clips only once the showcase is on screen, and pause them
    // when it scrolls away.
    if ('IntersectionObserver' in window) {
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
    button.setAttribute('aria-label', TEXT[root.lang === 'ar' ? 'ar' : 'en'].copy);
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
      announce(TEXT[root.lang === 'ar' ? 'ar' : 'en'].copied);
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

  applyLanguage(root.lang === 'ar' ? 'ar' : 'en');
})();
