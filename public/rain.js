/* Matrix rain -- drop into any page as <canvas id="mc-rain-canvas" class="mc-rain"> */
(function () {
  /* Skip rain on mobile / coarse-pointer devices to save battery */
  var isCoarse = matchMedia('(pointer: coarse)').matches;
  if (isCoarse) return;

  /* Respect prefers-reduced-motion */
  var prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  function start(canvas) {
    var ctx = canvas.getContext('2d');
    var rafId = null;
    var running = false;

    function fit() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    fit();
    window.addEventListener('resize', fit);

    var fs = 14;
    var drops = new Array(Math.floor(canvas.width / fs)).fill(0);
    var STEP_MS = 90;            /* one rain-step per ~90ms — slow, ambient drift */
    var lastStep = 0;

    function frame(ts) {
      rafId = 0;
      if (ts - lastStep < STEP_MS) {
        if (running) rafId = requestAnimationFrame(frame);
        return;
      }
      lastStep = ts;
      ctx.fillStyle = 'rgba(7,8,11,0.09)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fs + "px 'JetBrains Mono', monospace";
      var cols = Math.floor(canvas.width / fs);
      if (drops.length !== cols) drops = new Array(cols).fill(0);
      for (var i = 0; i < drops.length; i++) {
        var ch = Math.random() < 0.5 ? '0' : '1';
        var y = drops[i] * fs;
        var isHead = Math.random() < 0.12;
        ctx.fillStyle = isHead
          ? 'rgba(188,208,255,0.85)'
          : 'rgba(127,160,255,' + (0.06 + Math.random() * 0.16) + ')';
        ctx.fillText(ch, i * fs, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      if (running && !rafId) rafId = requestAnimationFrame(frame);
    }

    function startAnimation() {
      if (running) return;
      running = true;
      lastStep = 0;
      if (!rafId) rafId = requestAnimationFrame(frame);
    }

    function stopAnimation() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    /* Pause when tab is hidden to save CPU */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        startAnimation();
      } else {
        stopAnimation();
      }
    });

    startAnimation();
  }

  window.PTRain = { start: start };

  function autoStart() {
    var canvas = document.getElementById('mc-rain-canvas');
    if (canvas) start(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart);
  } else {
    autoStart();
  }
})();
