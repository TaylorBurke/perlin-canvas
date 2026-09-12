/*
 * perlin-canvas — a noise-driven "lamp grid" background.
 *
 * Usage:
 *   var field = PerlinCanvas.mount(document.getElementById('field'), {
 *     hues: ['#ff5a1f', '#f4c430', '#2fb88a'],
 *     cellSize: 11,
 *     speed: 1,
 *     density: 1,
 *   });
 *   field.setOptions({ speed: 2 });   // live-update any option
 *   field.stop();                    // pause the animation loop
 *   field.destroy();                 // stop and drop the resize listener
 *
 * See README.md for the full option list.
 */
(function (global) {
  var DEFAULTS = {
    // one CSS px per lamp cell — smaller reads finer-grained, larger reads chunkier
    cellSize: 11,
    // animation frames per second the draw loop targets
    fps: 24,
    // multiplies elapsed time before it reaches the noise fields: 1 is the
    // authored pace, 2 is twice as fast, 0.5 is half as fast
    speed: 1,
    // multiplies how many cells are eligible to be lit: 1 is the authored
    // density, <1 sparser, >1 fuller (values above ~1.6 start to saturate)
    density: 1,
    // the color path a cell's hue is drawn from, lit end to lit end —
    // hex strings or [r,g,b] triples, in visual order along the path
    hues: ['#ff5a1f', '#ff9a2e', '#f4c430', '#b5d93c', '#6fcf52', '#2fb88a', '#1e8a6e'],
    // the unlit floor and the hottest highlight a cell ramps between
    dark: '#080907',
    pale: '#ffeed6',
    // seeds the noise lattice — change it to get a different (but equally
    // structured) arrangement of where cells tend to cluster
    seed: 20260911,
    // freeze on a single frame when the OS asks for reduced motion
    respectReducedMotion: true
  };

  function normalizeColor(c) {
    if (Array.isArray(c)) return c;
    var hex = String(c).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
    var num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function buildPerm(seed) {
    var PERM = new Uint8Array(512);
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    for (var i2 = 255; i2 > 0; i2--) {
      s = (s * 16807) % 2147483647;
      var j = s % (i2 + 1);
      var tmp = p[i2]; p[i2] = p[j]; p[j] = tmp;
    }
    for (var i3 = 0; i3 < 512; i3++) PERM[i3] = p[i3 & 255];
    return PERM;
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(h, x, y, z) {
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  function mix(a, b, u) {
    return [(a[0] + (b[0] - a[0]) * u) | 0, (a[1] + (b[1] - a[1]) * u) | 0, (a[2] + (b[2] - a[2]) * u) | 0];
  }

  function hash2(i, j) {
    var h = (i * 374761393 + j * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function mount(canvas, userOptions) {
    var opts = Object.assign({}, DEFAULTS, userOptions || {});
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, dpr = 1;

    var PERM = buildPerm(opts.seed);
    var hues = opts.hues.map(normalizeColor);
    var dark = normalizeColor(opts.dark);
    var pale = normalizeColor(opts.pale);

    function noise3(x, y, z) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      var u = fade(x), v = fade(y), w = fade(z);
      var A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
      var B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
      return lerp(
        lerp(
          lerp(grad(PERM[AA] & 15, x, y, z), grad(PERM[BA] & 15, x - 1, y, z), u),
          lerp(grad(PERM[AB] & 15, x, y - 1, z), grad(PERM[BB] & 15, x - 1, y - 1, z), u), v),
        lerp(
          lerp(grad(PERM[AA + 1] & 15, x, y, z - 1), grad(PERM[BA + 1] & 15, x - 1, y, z - 1), u),
          lerp(grad(PERM[AB + 1] & 15, x, y - 1, z - 1), grad(PERM[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
        w);
    }
    function fbm(x, y, z) {
      return 0.55 * noise3(x, y, z) + 0.28 * noise3(x * 2.1, y * 2.1, z * 1.3) + 0.17 * noise3(x * 4.3, y * 4.3, z * 1.7);
    }
    function hueAt(h) {
      var f = h * (hues.length - 1), i = Math.min(hues.length - 2, Math.floor(f));
      return mix(hues[i], hues[i + 1], f - i);
    }
    function ramp(v, hue) {
      // dark -> this cell's hue at v~0.45 -> the pale highlight at v=1
      if (v < 0.45) { var u = v / 0.45; return mix(dark, hue, u * u); }
      var u2 = (v - 0.45) / 0.55; return mix(hue, pale, u2 * u2 * u2);
    }

    function resize() {
      dpr = Math.min(2, global.devicePixelRatio || 1);
      W = canvas.clientWidth || global.innerWidth;
      H = canvas.clientHeight || global.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(rawT) {
      var t = rawT * opts.speed;
      var CELL = opts.cellSize;
      ctx.clearRect(0, 0, W, H);
      var cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), R = CELL * 0.36;
      var tk = Math.floor(t * 20) / 20; // twenty ticks a second: brightness snaps on a beat rather than creeping
      ctx.globalCompositeOperation = 'lighter'; // overlapping glow adds toward the pale highlight, like lamps burning together
      for (var j = 0; j < rows; j++) {
        var y = j * CELL + CELL / 2, vy = y / H;
        for (var i = 0; i < cols; i++) {
          var x = i * CELL + CELL / 2, vx = x / W;
          // a slow, large-scale drift in overall density, so patches breathe brighter and
          // dimmer over time like embers shifting in a bed of coals, rather than one flat field
          var density = (0.5 + 0.5 * fbm(vx * 2.2 + 4.1, vy * 2.2 + 9.7, t * 0.015)) * opts.density;
          var n = fbm(x / 300 + tk * 0.06, y / 300 + tk * 0.02, tk * 0.13);
          var jit = (hash2(i, j) - 0.5) * 0.34; // each cell has its own fixed threshold, so lamps pop on one at a time
          var v = (n + 0.05 + jit) * 2.3 * density;
          if (v <= 0) {
            if (density > 0.6 && n + jit > -0.1 && hash2(j, i) < 0.5) {
              ctx.fillStyle = 'rgba(10,8,6,0.4)';
              ctx.fillRect(i * CELL, j * CELL + 1, CELL - 1, CELL - 2);
            }
            continue;
          }
          if (v > 1) v = 1;
          v = Math.ceil(v * 6) / 6; // six brightness steps: lamps pop on, they don't fade in
          var hv = (fbm(x / 210 + 11.7, y / 210 + 3.9, tk * 0.06) + 1) / 2;
          hv = Math.min(1, Math.max(0, (hv - 0.5) * 1.9 + 0.5));
          hv = Math.floor(hv * 7) / 6; // seven hue bands along the color path
          var c = ramp(v, hueAt(hv));
          if (v > 0.5) { // hot lamps bloom: a soft halo under the core
            var hr = R * (1.6 + 1.2 * (v - 0.5)), ha = 0.1 + 0.35 * (v - 0.5);
            ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + ha.toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(x, y, hr, 0, Math.PI * 2); ctx.fill();
          }
          // three vertical subpixel columns, each its own pure channel, additive-blended:
          // gives the field a low-res LED/circuit-board texture instead of flat squares
          var sw = CELL / 3, x0 = i * CELL, y0 = j * CELL + 1, sh = CELL - 2;
          ctx.fillStyle = 'rgb(' + c[0] + ',0,0)'; ctx.fillRect(x0, y0, sw - 0.6, sh);
          ctx.fillStyle = 'rgb(0,' + c[1] + ',0)'; ctx.fillRect(x0 + sw, y0, sw - 0.6, sh);
          ctx.fillStyle = 'rgb(0,0,' + c[2] + ')'; ctx.fillRect(x0 + 2 * sw, y0, sw - 0.6, sh);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    var reduceMotion = opts.respectReducedMotion && global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var rafId = null, t0 = null, lastFrame = 0, lastT = 0, running = false;

    function loop(ts) {
      if (t0 === null) t0 = ts;
      if (ts - lastFrame > 1000 / opts.fps) { lastT = (ts - t0) / 1000; draw(lastT); lastFrame = ts; }
      if (running) rafId = global.requestAnimationFrame(loop);
    }

    function onResize() { resize(); draw(reduceMotion ? 0.6 : lastT); }

    function start() {
      if (running) return;
      running = true;
      resize();
      if (reduceMotion) { draw(0.6); } else { t0 = null; rafId = global.requestAnimationFrame(loop); }
    }

    function stop() {
      running = false;
      if (rafId !== null) global.cancelAnimationFrame(rafId);
      rafId = null;
    }

    function setOptions(partial) {
      Object.assign(opts, partial);
      if (partial.hues) hues = opts.hues.map(normalizeColor);
      if (partial.dark) dark = normalizeColor(opts.dark);
      if (partial.pale) pale = normalizeColor(opts.pale);
      if (partial.seed !== undefined) PERM = buildPerm(opts.seed);
      draw(reduceMotion ? 0.6 : lastT);
    }

    function destroy() {
      stop();
      global.removeEventListener('resize', onResize);
    }

    global.addEventListener('resize', onResize);
    start();

    return { setOptions: setOptions, start: start, stop: stop, destroy: destroy };
  }

  global.PerlinCanvas = { mount: mount, DEFAULTS: DEFAULTS };
})(window);
