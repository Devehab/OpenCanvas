// OpenCanvas landing page: language switch, mobile menu, install tabs, copy
// buttons and scroll reveals. No dependencies, no network requests.
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

  // Images whose alt text has an Arabic variant keep the English one aside.
  const altImages = [...document.querySelectorAll('img[data-alt-ar]')];
  for (const img of altImages) img.dataset.altEn = img.alt;

  function applyLanguage(lang) {
    const t = TEXT[lang];
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
    for (const img of altImages) img.alt = lang === 'ar' ? img.dataset.altAr : img.dataset.altEn;
    for (const button of document.querySelectorAll('.copy')) button.setAttribute('aria-label', t.copy);
    document.querySelector('[role="tablist"]')?.setAttribute('aria-label', t.tabs);
    document.querySelector('.stats')?.setAttribute('aria-label', t.stats);
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

  // ---------- Install tabs ----------
  const tablist = document.querySelector('[role="tablist"]');
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
    if (block.closest('.tabpanel')) pre.tabIndex = 0;
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
