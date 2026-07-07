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

    function frame() {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fs + "px 'JetBrains Mono', monospace";
      var cols = Math.floor(canvas.width / fs);
      if (drops.length !== cols) drops = new Array(cols).fill(0);
      for (var i = 0; i < drops.length; i++) {
        var ch = Math.random() < 0.5 ? '0' : '1';
        var y = drops[i] * fs;
        ctx.fillStyle = 'rgba(255,16,240,' + (0.08 + Math.random() * 0.35) + ')';
        ctx.fillText(ch, i * fs, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      if (running) rafId = requestAnimationFrame(frame);
    }

    function startAnimation() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(frame);
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
