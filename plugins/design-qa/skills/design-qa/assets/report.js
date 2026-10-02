(() => {
  const root = document.documentElement;
  const KEY = 'design-qa-theme';
  // Light gray is the default; dark only when the reader picks it.
  try { if (localStorage.getItem(KEY) === 'dark') root.dataset.theme = 'dark'; } catch (e) {}
  const themeBtn = document.querySelector('.theme');
  const syncTheme = () => {
    if (!themeBtn) return;
    const dark = root.dataset.theme === 'dark';
    themeBtn.setAttribute('aria-pressed', String(dark));
    const label = themeBtn.querySelector('span');
    if (label) label.textContent = dark ? 'Light theme' : 'Dark theme';
  };
  syncTheme();
  if (themeBtn) themeBtn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
    syncTheme();
  });

  // Scenario filters.
  const buttons = document.querySelectorAll('.filters button[data-filter]');
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = b.dataset.filter;
    document.querySelectorAll('details.scn').forEach((d) => {
      d.hidden = !(f === 'all'
        || (f === 'failing' && d.dataset.failing === 'true')
        || (f === 'critical' && d.dataset.imp === 'critical')
        || (f === 'edge' && (d.dataset.kind === 'edge' || d.dataset.kind === 'counterexample')));
    });
  }));
  const all = (open) => document.querySelectorAll('details.scn').forEach((d) => { if (!d.hidden) d.open = open; });
  document.querySelector('[data-expand]')?.addEventListener('click', () => all(true));
  document.querySelector('[data-collapse]')?.addEventListener('click', () => all(false));

  // Open a collapsed scenario when it is linked to.
  const reveal = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el && el.tagName === 'DETAILS') { el.hidden = false; el.open = true; }
  };
  addEventListener('hashchange', reveal); reveal();

  // Highlight the section in view in the left menu.
  const links = [...document.querySelectorAll('.nav a[href^="#"]')];
  const secs = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const mark = (id) => links.forEach((a) => {
    const on = a.getAttribute('href') === `#${id}`;
    a.setAttribute('aria-current', String(on));
    if (on && matchMedia('(max-width: 820px)').matches) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  let current = null, queued = false;
  const spy = () => {
    queued = false;
    // The active section is the last one whose top has passed a third of the viewport.
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    let id = secs[0]?.id;
    if (atEnd) id = secs[secs.length - 1]?.id;
    else for (const s of secs) if (s.getBoundingClientRect().top <= innerHeight * 0.33) id = s.id;
    if (id && id !== current) { current = id; mark(id); }
  };
  if (secs.length) {
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(spy); } }, { passive: true });
    addEventListener('resize', spy);
    spy();
  }

  // Copy a finding as a Claude Code prompt.
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); return ok;
  };
  document.querySelectorAll('.copy-cc').forEach((btn) => {
    const label = btn.querySelector('span');
    const idle = label.textContent;
    btn.addEventListener('click', async () => {
      const src = document.getElementById(btn.dataset.copy);
      const ok = src && await copyText(src.value);
      btn.classList.toggle('done', !!ok); btn.classList.toggle('failed', !ok);
      label.textContent = ok ? 'Copied' : 'Copy failed';
      clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('done', 'failed'); label.textContent = idle; }, 1800);
    });
  });

  // Lightbox for screenshots.
  const dlg = document.querySelector('.lightbox');
  if (dlg && dlg.showModal) {
    const body = dlg.querySelector('.lb-body');
    document.querySelectorAll('.shot').forEach((s) => s.addEventListener('click', () => {
      body.innerHTML = '';
      const c = s.cloneNode(true); c.removeAttribute('aria-label'); c.tabIndex = -1;
      body.appendChild(c); dlg.showModal();
    }));
    dlg.querySelector('.close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
})();
