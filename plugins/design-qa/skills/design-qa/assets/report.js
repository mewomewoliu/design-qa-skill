(() => {
  const root = document.documentElement;
  const KEY = 'design-qa-theme';
  try { const t = localStorage.getItem(KEY); if (t) root.dataset.theme = t; } catch (e) {}
  const themeBtn = document.querySelector('.theme');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
  });

  const buttons = document.querySelectorAll('.filters button');
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = b.dataset.filter;
    document.querySelectorAll('.matrix tbody tr').forEach((tr) => {
      const show = f === 'all'
        || (f === 'failing' && tr.dataset.failing === 'true')
        || (f === 'critical' && tr.dataset.imp === 'critical')
        || (f === 'edge' && (tr.dataset.kind === 'edge' || tr.dataset.kind === 'counterexample'));
      tr.hidden = !show;
    });
  }));

  const all = (open) => document.querySelectorAll('details.scn').forEach((d) => { d.open = open; });
  document.querySelector('[data-expand]')?.addEventListener('click', () => all(true));
  document.querySelector('[data-collapse]')?.addEventListener('click', () => all(false));

  // Open a collapsed scenario when it is linked to.
  const reveal = () => { const el = location.hash && document.getElementById(location.hash.slice(1)); if (el && el.tagName === 'DETAILS') el.open = true; };
  addEventListener('hashchange', reveal); reveal();

  const dlg = document.querySelector('.lightbox');
  if (dlg && dlg.showModal) {
    const body = dlg.querySelector('.lb-body');
    document.querySelectorAll('.gallery .shot').forEach((s) => s.addEventListener('click', () => {
      body.innerHTML = '';
      const c = s.cloneNode(true); c.removeAttribute('aria-label'); c.tabIndex = -1;
      body.appendChild(c); dlg.showModal();
    }));
    dlg.querySelector('.close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
})();
