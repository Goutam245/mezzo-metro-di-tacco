/* =========================================================================
   Mezzo Metro di Tacco — script del sito pubblico
   I testi arrivano da /api/data (pannello) oppure da /data/site.json.
   ========================================================================= */
(function () {
  'use strict';

  var IMG = 'assets/img/prodotti/';
  var PAGINA = document.body.dataset.pagina || 'home';
  var PASSO = PAGINA === 'catalogo' ? 12 : 8;

  var dati = null;
  var stato = { cat: 'tutto', mostrati: PASSO };

  /* ---------------------------------------------------------------- utili */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function leggi(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o && o[k] !== undefined && o[k] !== null) ? o[k] : null;
    }, obj);
  }

  function wa(testo) {
    var n = leggi(dati, 'impostazioni.whatsapp') || '393408737943';
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(testo || 'Ciao!');
  }

  function messaggio(chiave, sostituzioni) {
    var t = leggi(dati, 'messaggi.' + chiave) || '';
    Object.keys(sostituzioni || {}).forEach(function (k) {
      t = t.split('{' + k + '}').join(sostituzioni[k]);
    });
    // il pannello accetta anche la forma lunga dei segnaposto
    if (sostituzioni && sostituzioni.NOME) t = t.split('{NOME MODELLO}').join(sostituzioni.NOME);
    if (sostituzioni && sostituzioni.TAGLIA) t = t.split('{NUMERO}').join(sostituzioni.TAGLIA);
    return t;
  }

  function nomeCategoria(id) {
    var c = (leggi(dati, 'categorie') || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.nome : id;
  }

  /* ------------------------------------------------------------ caricamento */
  function carica() {
    var seme = function () {
      return fetch('data/contenuti.json').then(function (r) { return r.json(); });
    };
    return fetch('/api/contenuti', { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 204 || !r.ok) return seme();   // nessun contenuto salvato: vale il seme
        return r.json();
      })
      .catch(seme)
      .then(function (d) {
        try {
          var loc = localStorage.getItem('mmdt:bozza');
          if (loc && location.search.indexOf('bozza=1') > -1) d = JSON.parse(loc);
        } catch (e) { /* niente */ }
        return d;
      });
  }

  /* ------------------------------------------------------------- testi */
  function applicaTesti() {
    $$('[data-bind]').forEach(function (el) {
      var v = leggi(dati, el.dataset.bind);
      if (typeof v === 'string' && v.length) el.textContent = v;
    });
    $$('[data-toggle]').forEach(function (el) {
      var v = leggi(dati, el.dataset.toggle);
      if (v === false) el.hidden = true; else el.hidden = false;
    });
    $$('[data-wa]').forEach(function (el) {
      el.setAttribute('href', wa(messaggio(el.dataset.wa)));
    });
    $$('[data-href]').forEach(function (el) {
      var v = leggi(dati, el.dataset.href);
      if (v) el.setAttribute('href', v);
    });
    var mail = leggi(dati, 'impostazioni.email');
    $$('[data-mail]').forEach(function (el) {
      if (mail) { el.setAttribute('href', 'mailto:' + mail); el.textContent = mail; }
    });
  }

  /* ------------------------------------------------------------- testata */
  function testata() {
    var hdr = $('.hdr');
    if (hdr) {
      var segna = function () { hdr.classList.toggle('is-stuck', window.scrollY > 8); };
      segna(); addEventListener('scroll', segna, { passive: true });
    }
    var menu = $('#menu'), apri = $('#apri-menu'), chiudi = $('#chiudi-menu');
    if (menu && apri) {
      var set = function (on) {
        menu.classList.toggle('is-open', on);
        apri.setAttribute('aria-expanded', on ? 'true' : 'false');
        document.body.classList.toggle('is-locked', on);
        if (on) { var a = menu.querySelector('a'); if (a) a.focus(); } else apri.focus();
      };
      apri.addEventListener('click', function () { set(true); });
      if (chiudi) chiudi.addEventListener('click', function () { set(false); });
      $$('#menu a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
      addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false);
      });
    }
    // barra fissa da telefono: compare dopo il primo schermo
    var barra = $('.barra');
    if (barra) {
      var mostra = function () { barra.classList.toggle('is-on', window.scrollY > 380); };
      mostra(); addEventListener('scroll', mostra, { passive: true });
    }
  }

  /* ------------------------------------------------------------- comparse */
  function comparse() {
    var el = $$('.rv');
    if (!('IntersectionObserver' in window) ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.forEach(function (n) { n.classList.add('is-in'); }); return;
    }
    var io = new IntersectionObserver(function (voci) {
      voci.forEach(function (v) {
        if (!v.isIntersecting) return;
        var i = +(v.target.dataset.rvi || 0);
        v.target.style.transitionDelay = Math.min(i, 4) * 55 + 'ms';
        v.target.classList.add('is-in');
        io.unobserve(v.target);
      });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.02 });
    el.forEach(function (n) { io.observe(n); });
  }

  function indicizza(radice) {
    $$('.rv', radice).forEach(function (n, i) { if (!n.dataset.rvi) n.dataset.rvi = i % 5; });
  }

  /* ------------------------------------------------------------- cookie */
  function cookie() {
    var box = $('.cookie');
    if (!box) return;
    var chiave = 'mmdt:cookie';
    try { if (localStorage.getItem(chiave)) return; } catch (e) { return; }
    setTimeout(function () { box.classList.add('is-on'); }, 900);
    var b = $('button', box);
    if (b) b.addEventListener('click', function () {
      box.classList.remove('is-on');
      try { localStorage.setItem(chiave, '1'); } catch (e) { }
    });
  }

  /* ======================================================== CATALOGO */
  function prodottiVisibili() {
    var p = (leggi(dati, 'prodotti') || []).filter(function (x) { return x.stato !== 'nascosto'; });
    if (stato.cat !== 'tutto') p = p.filter(function (x) { return x.categoria === stato.cat; });
    return p.sort(function (a, b) { return (a.ordine || 0) - (b.ordine || 0); });
  }

  function chips() {
    var box = $('#filtri');
    if (!box) return;
    var cats = (leggi(dati, 'categorie') || []).slice().sort(function (a, b) {
      return (a.ordine || 0) - (b.ordine || 0);
    });
    var voci = [{ id: 'tutto', nome: 'Tutto' }].concat(cats);
    box.innerHTML = voci.map(function (c) {
      return '<button type="button" class="chip" data-cat="' + c.id + '" aria-pressed="' +
        (c.id === stato.cat) + '">' + c.nome + '</button>';
    }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      if (b.dataset.cat === stato.cat) return;
      stato.cat = b.dataset.cat;
      stato.mostrati = PASSO;
      $$('.chip', box).forEach(function (x) {
        x.setAttribute('aria-pressed', x.dataset.cat === stato.cat);
      });
      if (PAGINA === 'catalogo') {
        var q = stato.cat === 'tutto' ? location.pathname : '?cat=' + stato.cat;
        history.replaceState(null, '', q);
      }
      var g = $('#griglia');
      g.classList.add('is-swapping');
      setTimeout(function () { griglia(); g.classList.remove('is-swapping'); }, 190);
    });
  }

  function foto(p, grande) {
    var alt = (p.alt || p.nome).replace(/"/g, '&quot;');
    if (p.imgData) {
      return '<img src="' + p.imgData + '" alt="' + alt + '" loading="lazy" decoding="async" width="800" height="1000">';
    }
    var srcset = grande
      ? '<source type="image/webp" srcset="' + IMG + p.img + '.webp">'
      : '<source type="image/webp" srcset="' + IMG + p.img + '-sm.webp 480w, ' + IMG + p.img + '.webp 800w" sizes="(min-width:900px) 22vw, 46vw">';
    return '<picture>' + srcset +
      '<img src="' + IMG + p.img + '.jpg" alt="' + alt + '" loading="lazy" decoding="async" width="800" height="1000">' +
      '</picture>';
  }

  function cardHTML(p) {
    var finito = p.stato === 'finito';
    return '<button type="button" class="card rv" data-id="' + p.id + '">' +
      '<span class="card-img">' + foto(p, false) +
      (finito ? '<span class="card-finito">Finito</span>' : '') + '</span>' +
      '<span class="card-cat">' + nomeCategoria(p.categoria) + '</span>' +
      '<span class="card-nome">' + p.nome + '</span>' +
      '</button>';
  }

  function griglia() {
    var g = $('#griglia'); if (!g) return;
    var tutti = prodottiVisibili();
    var mostra = tutti.slice(0, stato.mostrati);
    if (!mostra.length) {
      g.innerHTML = '<p class="vuoto">In questa categoria non c’è ancora niente. Guarda le altre.</p>';
    } else {
      g.innerHTML = mostra.map(cardHTML).join('');
    }
    indicizza(g);
    comparse();
    var piu = $('#piu');
    if (piu) piu.hidden = tutti.length <= stato.mostrati;
  }

  function catalogo() {
    if (!$('#griglia')) return;
    var q = new URLSearchParams(location.search).get('cat');
    if (q && (leggi(dati, 'categorie') || []).some(function (c) { return c.id === q; })) stato.cat = q;
    chips();
    griglia();
    var piu = $('#piu button');
    if (piu) piu.addEventListener('click', function () {
      stato.mostrati += PASSO; griglia();
    });
    $('#griglia').addEventListener('click', function (e) {
      var c = e.target.closest('.card'); if (c) scheda(c.dataset.id, c);
    });
  }

  /* --------------------------------------------------- scheda prodotto */
  var apertoDa = null;

  function scheda(id, origine) {
    var p = (leggi(dati, 'prodotti') || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    apertoDa = origine || null;
    var box = $('#scheda'), sfondo = $('#scheda-bg');
    var taglie = p.taglie || [];
    var finito = p.stato === 'finito';

    var selettore = taglie.length
      ? '<div class="campo"><label for="mis">Scegli la misura</label>' +
        '<select class="sel" id="mis"><option value="" selected>Numero</option>' +
        taglie.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
        '</select></div>'
      : '<div class="campo"><p class="senza-taglie">Chiedi la tua misura in chat</p></div>';

    box.innerHTML =
      '<div class="scheda-top"><button type="button" class="scheda-close" id="scheda-close">Chiudi</button></div>' +
      '<div class="scheda-in">' +
        '<div class="scheda-img">' + foto(p, true) + '</div>' +
        '<div class="scheda-txt">' +
          '<p class="scheda-cat">' + nomeCategoria(p.categoria) + '</p>' +
          '<h3 id="scheda-tit">' + p.nome + '</h3>' +
          (p.alt ? '<p class="scheda-desc">' + p.alt + '</p>' : '') +
          (finito ? '<div class="campo"><p class="senza-taglie">Questo modello è finito. Scrivici: guardiamo se torna.</p></div>' : selettore) +
          '<div class="btn-row"><a class="btn btn-1 btn-full" id="richiedi" href="#" target="_blank" rel="noopener">Richiedi prodotto</a></div>' +
          '<p class="scheda-nota">Ti rispondiamo su WhatsApp.</p>' +
        '</div>' +
      '</div>';

    var link = $('#richiedi', box);
    var sel = $('#mis', box);
    var aggiorna = function () {
      var t = sel ? sel.value : '';
      link.href = wa(t
        ? messaggio('prodotto', { NOME: p.nome, TAGLIA: t })
        : messaggio('prodottoSenzaTaglia', { NOME: p.nome }));
    };
    aggiorna();
    if (sel) sel.addEventListener('change', aggiorna);

    box.setAttribute('aria-hidden', 'false');
    sfondo.classList.add('is-open');
    box.classList.add('is-open');
    document.body.classList.add('is-locked');
    $('#scheda-close', box).addEventListener('click', chiudiScheda);
    setTimeout(function () { $('#scheda-close', box).focus(); }, 60);
  }

  function chiudiScheda() {
    var box = $('#scheda'), sfondo = $('#scheda-bg');
    if (!box || !box.classList.contains('is-open')) return;
    box.classList.remove('is-open');
    sfondo.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    if (apertoDa) { apertoDa.focus(); apertoDa = null; }
    setTimeout(function () { if (!box.classList.contains('is-open')) box.innerHTML = ''; }, 420);
  }

  function schedaEventi() {
    var sfondo = $('#scheda-bg');
    if (sfondo) sfondo.addEventListener('click', chiudiScheda);
    addEventListener('keydown', function (e) { if (e.key === 'Escape') chiudiScheda(); });
    var box = $('#scheda');
    if (box) box.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('a[href],button,select,input', box).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var primo = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    });
  }

  /* ------------------------------------------------------------- avvio */
  testata();
  indicizza(document);
  comparse();
  cookie();
  schedaEventi();

  carica().then(function (d) {
    dati = d;
    applicaTesti();
    catalogo();
  }).catch(function () {
    var g = $('#griglia');
    if (g) g.innerHTML = '<p class="vuoto">Il catalogo non si carica in questo momento. Scrivici su WhatsApp.</p>';
  });
})();
