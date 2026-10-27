/* Madressa System — site behaviour. Everything here is an enhancement: the pages read fully without it. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Gregorian + Hijri date lines */
  var now = new Date();
  var greg = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  var hijri = '';
  try { hijri = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch (e) { hijri = ''; }
  document.querySelectorAll('[data-today]').forEach(function (el) {
    el.textContent = '';
    var g = document.createElement('b'); g.textContent = greg; el.appendChild(g);
    if (hijri) el.appendChild(document.createTextNode(' · ' + hijri));
  });
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(now.getFullYear()); });

  /* Section entrances: heading, then text, then picture */
  var risers = document.querySelectorAll('[data-rise]');
  if ('IntersectionObserver' in window && risers.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    risers.forEach(function (el) { io.observe(el); });
  } else {
    risers.forEach(function (el) { el.classList.add('in'); });
  }

  /* Fire-drill demo loops only while it is on screen */
  var holdDemo = document.querySelector('.hold');
  if (holdDemo && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { holdDemo.classList.toggle('playing', en[0].isIntersecting); }, { threshold: 0.3 }).observe(holdDemo);
  }

  /* The evening at a madressa (hero live thing) */
  var ev = document.getElementById('evening');
  if (ev) {
    var range = ev.querySelector('input[type=range]');
    var out = ev.querySelector('.evening-time');
    var feed = document.getElementById('ev-feed');
    var k = {
      teachers: document.getElementById('k-teachers'), teachersEm: document.getElementById('k-teachers-em'),
      registers: document.getElementById('k-registers'), registersEm: document.getElementById('k-registers-em'),
      att: document.getElementById('k-att'), attEm: document.getElementById('k-att-em'),
      notes: document.getElementById('k-notes'), notesEm: document.getElementById('k-notes-em')
    };
    var greet = document.getElementById('ev-greet');
    var START = 16 * 60 + 30; // 16:30
    var EVENTS = [
      [16 * 60 + 41, 'Ustadh Bilal Karim signed in at the kiosk'],
      [16 * 60 + 47, 'Fatima Siddiqui: “Yusuf is away today, dentist.”'],
      [16 * 60 + 58, 'Ustadha Maryam Ali signed in on her phone'],
      [17 * 60 + 4, 'Maktab 1A register taken: 27 of 28 present'],
      [17 * 60 + 12, 'Imran Chowdhury: “Zayd will be 15 minutes late.”'],
      [17 * 60 + 18, 'All 8 registers complete'],
      [17 * 60 + 25, 'Absence texts sent to 3 families'],
      [18 * 60 + 35, 'Homework set for Maktab 3B: Surah Al-Mulk, ayat 11–20'],
      [19 * 60 + 2, 'Fees reminders sent for 46 overdue invoices'],
      [19 * 60 + 40, 'Teachers signed out. Day report ready']
    ];
    var teachersAt = [[16 * 60 + 35, 2], [16 * 60 + 41, 4], [16 * 60 + 50, 7], [16 * 60 + 58, 11], [17 * 60 + 10, 12], [19 * 60 + 40, 0]];
    var registersAt = [[17 * 60 + 4, 1], [17 * 60 + 8, 4], [17 * 60 + 14, 7], [17 * 60 + 18, 8]];
    var notesAt = [[16 * 60 + 20, 2], [16 * 60 + 47, 3], [17 * 60 + 12, 4]];
    var lastAt = function (list, t, dflt) { var v = dflt; list.forEach(function (p) { if (t >= p[0]) v = p[1]; }); return v; };
    var hhmm = function (m) { var h = Math.floor(m / 60), mi = m % 60; return (h > 12 ? h - 12 : h) + ':' + (mi < 10 ? '0' : '') + mi + ' pm'; };
    var hm24 = function (m) { var h = Math.floor(m / 60), mi = m % 60; return h + ':' + (mi < 10 ? '0' : '') + mi; };
    var shown = 0;

    var render = function (fromUser) {
      var t = START + Number(range.value) * 5;
      out.textContent = hhmm(t);
      range.setAttribute('aria-valuetext', hhmm(t));
      range.style.setProperty('--p', (Number(range.value) / Number(range.max) * 100) + '%');
      var tin = lastAt(teachersAt, t, 0), reg = lastAt(registersAt, t, 0), notes = lastAt(notesAt, t, 2);
      k.teachers.textContent = tin; k.teachersEm.textContent = t >= 19 * 60 + 40 ? 'all signed out' : 'of 12 signed in';
      k.registers.textContent = reg; k.registersEm.textContent = 'of 8 taken';
      k.att.textContent = reg === 8 ? '93.2%' : '—'; k.attEm.textContent = reg === 8 ? '+2.2 pts on last week' : 'after registers';
      k.notes.textContent = notes; k.notesEm.textContent = notes === 1 ? 'parent notice' : 'parent notices';
      greet.textContent = t < 17 * 60 ? 'Teachers are arriving. Registers open at 5:00.' : reg < 8 ? 'Registers are being taken in ' + (8 - reg) + (8 - reg === 1 ? ' class.' : ' classes.') : t < 19 * 60 ? 'Every register is in. Attendance is 93.2% tonight.' : 'Classes are finishing. Reminders and reports go out.';
      var items = EVENTS.filter(function (e) { return e[0] <= t; }).slice(-4).reverse();
      var newCount = Math.max(0, EVENTS.filter(function (e) { return e[0] <= t; }).length - shown);
      shown = EVENTS.filter(function (e) { return e[0] <= t; }).length;
      feed.querySelectorAll('.feed-item, .feed-empty').forEach(function (n) { n.remove(); });
      if (!items.length) {
        var p = document.createElement('p'); p.className = 'feed-empty'; p.style.cssText = 'font-size:.8125rem;color:#4A5072;margin:0';
        p.textContent = 'Quiet so far. The first teacher arrives soon.'; feed.appendChild(p);
      }
      items.forEach(function (e, i) {
        var row = document.createElement('div'); row.className = 'feed-item';
        if (fromUser && i < newCount) row.setAttribute('data-new', '');
        var tm = document.createElement('time'); tm.textContent = hm24(e[0]);
        var tx = document.createElement('span'); tx.textContent = e[1];
        row.appendChild(tm); row.appendChild(tx); feed.appendChild(row);
      });
    };
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var startVal = nowMin >= START && nowMin <= 20 * 60 ? Math.round((nowMin - START) / 5) : Math.round((17 * 60 + 20 - START) / 5);
    range.value = String(startVal);
    ev.hidden = false;
    range.addEventListener('input', function () { render(true); });

    /* Signature move: on first view the evening plays from 4:30 to the starting time, once. Any touch stops it. */
    var played = false, timer = null;
    var stop = function () { if (timer) { clearInterval(timer); timer = null; } };
    range.addEventListener('pointerdown', stop); range.addEventListener('keydown', stop);
    if (reduce || !('IntersectionObserver' in window)) { render(false); }
    else {
      range.value = '0'; render(false);
      var heroIo = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting || played) return; played = true; heroIo.disconnect();
        var v = 0;
        timer = setInterval(function () { v++; range.value = String(v); render(true); if (v >= startVal) stop(); }, 90);
      }, { threshold: 0.4 });
      heroIo.observe(ev);
    }
  }

  /* Forms: validate in place, post to the app, say what happened */
  document.querySelectorAll('form[data-post]').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('button[type=submit]');
    var label = btn.textContent;
    var check = function (input) {
      var err = document.getElementById(input.getAttribute('aria-describedby') && input.getAttribute('aria-describedby').split(' ').filter(function (id) { return id.indexOf('-err') > -1; })[0]);
      var msg = '';
      if (input.validity.valueMissing) msg = input.dataset.required || 'Please fill this in.';
      else if (input.validity.typeMismatch && input.type === 'email') msg = 'Enter an email address like name@example.org.';
      else if (input.validity.rangeUnderflow || input.validity.badInput) msg = 'Enter a number, or leave it blank.';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) err.textContent = msg;
      return !msg;
    };
    form.querySelectorAll('.input').forEach(function (inp) {
      inp.addEventListener('blur', function () { if (inp.value) check(inp); });
      inp.addEventListener('input', function () { if (inp.getAttribute('aria-invalid') === 'true') check(inp); });
    });
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = null;
      form.querySelectorAll('.input').forEach(function (inp) { if (!check(inp) && !bad) bad = inp; });
      if (bad) { bad.focus(); status.dataset.kind = 'error'; status.textContent = 'Please check the highlighted field.'; return; }
      btn.disabled = true; btn.textContent = 'Sending…'; status.textContent = '';
      var data = {}; new FormData(form).forEach(function (v, key) { data[key] = String(v).trim(); });
      fetch(form.getAttribute('action'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); })
        .then(function () {
          status.dataset.kind = 'ok';
          status.textContent = form.dataset.ok || 'Thank you. We will be in touch soon.';
          form.reset();
        })
        .catch(function () {
          status.dataset.kind = 'error';
          status.textContent = 'We couldn’t send this just now. Please try again in a minute, or email us at ' + (form.dataset.email || '[YOUR EMAIL]') + '.';
        })
        .then(function () { btn.disabled = false; btn.textContent = label; status.focus(); });
    });
  });
})();
