/* One progressive fallback for asta-visual-002. Native timelines do no work
   here. Content stays visible without JS; observers never hide a waiting row. */
(() => {
  const nativeEntry = CSS.supports('animation-timeline: view()') && CSS.supports('animation-range: entry 0% entry 40%');
  const nativeSweep = CSS.supports('animation-timeline: scroll()');
  if (nativeEntry && nativeSweep) return;
  const main = document.querySelector('.mc-main');
  const sweep = main?.querySelector('.v4-scanline');
  if (!main || !sweep) return;
  const mobile = matchMedia('(max-width: 820px)');
  let stop = () => {};
  function start() {
    stop();
    if (document.documentElement.dataset.motion === 'off') return;
    const selector = mobile.matches ? '.v4-entry, .v4-group' : '.v4-entry, .v4-group > :not(.mc-ascii-head):not(.v4-divider):not(.is-floating)';
    const seen = new WeakSet();
    const io = !nativeEntry && 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.15) continue;
        entry.target.classList.add('v4-seen');
        io.unobserve(entry.target);
      }
    }, { root: main, threshold: 0.15 }) : null;
    function discover(root) {
      if (!(root instanceof Element) || !io) return;
      const observe = node => {
        if (seen.has(node)) return;
        seen.add(node);
        io.observe(node);
      };
      if (root.matches(selector)) observe(root);
      root.querySelectorAll(selector).forEach(observe);
    }
    discover(main);
    // Child-list only: handles streamed panels + client navigation, never
    // reacts to our own classes or to the live clock's character data.
    const mutations = io ? new MutationObserver(records => {
      for (const record of records) {
        record.removedNodes.forEach(root => {
          if (!(root instanceof Element)) return;
          io.unobserve(root);
          root.querySelectorAll(selector).forEach(node => io.unobserve(node));
        });
        record.addedNodes.forEach(discover);
      }
    }) : null;
    mutations?.observe(main, { childList: true, subtree: true });
    let frame = 0;
    let travel = window.innerHeight;
    const resize = () => { travel = window.innerHeight; };
    const scroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sweep.style.transform = `translateY(${main.scrollTop % travel}px)`;
      });
    };
    const fallbackSweep = !nativeSweep && !mobile.matches;
    if (fallbackSweep) {
      main.addEventListener('scroll', scroll, { passive: true });
      window.addEventListener('resize', resize, { passive: true });
      scroll();
    }
    stop = () => {
      io?.disconnect();
      mutations?.disconnect();
      main.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frame);
      sweep.style.removeProperty('transform');
      main.querySelectorAll('.v4-seen').forEach(node => node.classList.remove('v4-seen'));
    };
  }
  mobile.addEventListener('change', start);
  new MutationObserver(start).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  start();
})();
