/* ---------- consent, deals, uploads and price updates ---------- */
(function(){
  const CFG = window.APP_CONFIG || {};
  const BUILD = window.APP_BUILD || {code:0, name:''};
  const API = (CFG.supabaseUrl || '').replace(/\/+$/, '');
  const QUESTIONS = [
    ['asks', 'Share the prices I check', 'When you type a seller\'s asking price, that price and the device details are sent anonymously to improve the estimates.'],
    ['deals', 'Share my purchases and sales', 'When you record a purchase or sale, its final price and the device details are sent anonymously. Real deal prices are the most useful data.'],
    ['remind', 'Ask me later if I made the deal', 'When you reopen the app, it can ask whether you bought or sold a device you checked, and for how much.'],
    ['updates', 'Download price updates', 'When online, the app checks for a newer price list. Nothing about you is sent.'],
    ['personal', 'Adjust estimates to my own deals', 'The app compares your recorded deals with its estimates and adjusts future estimates for you. This stays on this phone.']
  ];
  const DAY = 864e5;

  /* storage: every read and write is guarded, the page must work without it */
  const get = (k, d) => { try{ const v = localStorage.getItem('ua-' + k); return v === null ? d : JSON.parse(v); }catch(e){ return d; } };
  const put = (k, v) => { try{ localStorage.setItem('ua-' + k, JSON.stringify(v)); }catch(e){} };
  const uuid = () => {
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0,8) + '-' + h.slice(8,12) + '-' + h.slice(12,16) + '-' + h.slice(16,20) + '-' + h.slice(20);
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);

  let consent = get('consent', null);
  let installId = get('install', null);
  if(!installId){ installId = uuid(); put('install', installId); }
  const on = k => !!(consent && consent[k]);

  /* ---------- price file ---------- */
  const BUILTIN = {}; MODELS.forEach(m => BUILTIN[m.id] = m.base);
  const pricesVersion = () => (get('prices', null) || {}).version || 1;
  function applyPrices(p){
    MODELS.forEach(m => { const b = p && p.base && Number(p.base[m.id]); if(!m.custom) m.base = b > 0 ? b : BUILTIN[m.id]; });
  }
  function refreshBase(prevDefault){
    // only replace the base the user sees if they have not typed their own
    if(Number(S.base) === prevDefault){ S.base = model().base; $('base').value = S.base; }
    render();
  }
  async function checkPrices(manual){
    if(!CFG.pricesUrl){ if(manual) note(t('No server is set up yet, so records stay on this phone.')); return; }
    try{
      const res = await fetch(CFG.pricesUrl + (CFG.pricesUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), {cache:'no-store'});
      const p = await res.json();
      if(p && p.version > pricesVersion() && p.base){
        const prev = model().base;
        put('prices', p); applyPrices(p); refreshBase(prev);
        note(t('Prices updated to version {v}.', {v:p.version}));
      } else if(manual) note(t('Prices are up to date.'));
    }catch(e){ if(manual) note(t('Could not reach the server. Try again when online.')); }
    renderData();
  }

  /* ---------- newer APK notice (Android only; the web version is always current) ---------- */
  let newer = null;
  async function checkAppVersion(){
    if(!window.AndroidApp || !CFG.versionUrl) return;
    try{
      const v = await (await fetch(CFG.versionUrl + '?t=' + Date.now(), {cache:'no-store'})).json();
      if(v && v.versionCode > BUILD.code && v.apk && /^https:\/\//.test(v.apk)) newer = v;
    }catch(e){}
    renderUpdate();
  }
  function renderUpdate(){
    const bar = $('updateBar');
    if(!newer || get('upd-dismiss', 0) >= newer.versionCode){ bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '<span>' + esc(t('New version {v} is available.', {v:newer.versionName})) + '</span>' +
      '<a class="btn pri" href="' + esc(newer.apk) + '">' + t('Download') + '</a>' +
      '<button class="btn" type="button" id="updLater">' + t('Later') + '</button>';
  }
  $('updateBar').addEventListener('click', e => {
    if(e.target.id === 'updLater'){ put('upd-dismiss', newer.versionCode); renderUpdate(); }
  });

  /* ---------- personal adjustment (learned from this phone's own deals) ---------- */
  function personal(){
    const d = get('deals', []).filter(x => x.estimate > 0 && x.price > 0);
    if(!on('personal') || d.length < 2) return {f:1, n:d.length};
    const mean = d.reduce((s, x) => s + x.price / x.estimate - 1, 0) / d.length;
    const f = 1 + Math.max(-0.15, Math.min(0.15, mean * d.length / (d.length + 5)));   // shrink toward 1 while there are few deals
    return {f, n:d.length};
  }
  const baseCompute = compute;
  compute = function(){
    const r = baseCompute();
    r.raw = r.total; r.rawHeadline = r.headline;
    const p = personal();
    if(Math.abs(p.f - 1) < 0.005) return r;
    const i = r.lines.findIndex(x => x.k === 'tot');
    const d = Math.round(r.total * (p.f - 1));
    r.lines.splice(i, 0, {l:t('Adjustment from your deals ({n})', {n:p.n}), a:d, p:(p.f - 1) * 100});
    r.total += d; r.lines[i + 1].a = r.total;
    r.step = r.total >= 1000 ? 50 : 10;
    r.headline = Math.max(0, Math.round(r.total / r.step) * r.step);
    const rr = cfg.rangePct / 100;
    r.lo = Math.round(r.headline * (1 - rr) / r.step) * r.step; r.hi = Math.round(r.headline * (1 + rr) / r.step) * r.step;
    return r;
  };

  /* ---------- records ---------- */
  function snapshot(){
    const m = model(), r = compute();
    return {install_id:installId, model:m.id, storage:m.custom ? null : (S.storage || null), conn:m.type === 'tablet' ? S.conn : null,
      lock:S.lock, battery:S.batUnknown ? null : S.battery, bat_type:S.batType, bio:m.bio === 'none' ? null : S.bio,
      screen_origin:S.screenOrigin, screen_cond:S.screenCond, back:S.back, body:S.body,
      faults:Object.keys(S.funcs).filter(k => S.funcs[k] && funcVisible(k)), warranty:S.warranty,
      extras:Object.keys(S.acc).filter(k => S.acc[k] && accVisible(k)),
      base_used:Math.round(Number(S.base) || 0), base_default:m.base, total:Math.round(r.raw), estimate:r.rawHeadline,
      prices_version:pricesVersion(), app_version:BUILD.name + (window.AndroidApp ? '' : '-web'), lang:LANG};
  }
  const label = m => t(m.name) + (m.custom || !S.storage ? '' : ' ' + gbLabel(S.storage));
  function enqueue(rec){
    const q = get('queue', []); q.push(Object.assign({client_time:new Date().toISOString()}, rec)); put('queue', q.slice(-500));
    return flush();
  }
  let running = null;   // the upload in progress; later callers wait for it, then send what is left
  function headers(){
    const h = {'Content-Type':'application/json', apikey:CFG.supabaseKey, Prefer:'return=minimal'};
    if(/^eyJ/.test(CFG.supabaseKey)) h.Authorization = 'Bearer ' + CFG.supabaseKey;   // legacy anon keys are JWTs
    return h;
  }
  function flush(){
    if(!API || !CFG.supabaseKey || !navigator.onLine) return Promise.resolve(false);
    if(running) return running.then(() => flush());
    running = (async () => {
      let q = get('queue', []);
      try{
        while(q.length){
          const batch = q.slice(0, 50);
          const res = await fetch(API + '/rest/v1/records', {method:'POST', headers:headers(), body:JSON.stringify(batch)});
          // a rejected batch (bad value, daily limit) is dropped so it cannot block the queue forever
          if(!res.ok && (res.status >= 500 || res.status === 429 || res.status === 408)) break;
          q = get('queue', []).slice(batch.length); put('queue', q);
          if(res.ok) put('sent', get('sent', 0) + batch.length);
        }
      }catch(e){}
      return !get('queue', []).length;
    })().finally(() => { running = null; renderData(); });
    return running;
  }

  /* asking prices: one record per device and price, sent once the user has moved on */
  let pending = null, askTouched = false, askTimer = 0;
  $('ask').addEventListener('input', () => { askTouched = true; });
  function commitAsk(){
    clearTimeout(askTimer);
    if(!pending) return;
    const p = pending; pending = null; askTouched = false;
    const checks = get('checks', []).filter(c => Date.now() - c.ts < 7 * DAY);
    const dup = checks.find(c => c.key === p.key && Date.now() - c.ts < DAY);
    if(dup){ dup.snap = p.snap; put('checks', checks); return; }
    checks.push({key:p.key, ts:Date.now(), name:p.name, ask:p.ask, snap:p.snap, done:false});
    put('checks', checks.slice(-30));
    if(on('asks')) enqueue(Object.assign({}, p.snap, {kind:'ask', price:p.ask}));
  }
  function trackAsk(){
    const ask = Number(S.ask);
    if(pending && pending.snap.model !== S.model) commitAsk();
    if(!(ask > 0)){ if(pending) commitAsk(); return; }
    if(!askTouched || !(on('asks') || on('remind'))) return;
    pending = {key:S.model + '|' + (S.storage || 0) + '|' + ask, ask, name:label(model()), snap:snapshot()};
    clearTimeout(askTimer); askTimer = setTimeout(commitAsk, 20000);
  }
  document.addEventListener('visibilitychange', () => { if(document.hidden) commitAsk(); else flush(); });
  window.addEventListener('pagehide', commitAsk);
  window.addEventListener('online', () => flush());

  /* deals */
  async function saveDeal(kind, price, snap){
    const d = get('deals', []);
    d.push({kind, price, estimate:snap.estimate, model:snap.model, ts:Date.now()}); put('deals', d.slice(-200));
    const checks = get('checks', []); checks.forEach(c => { if(c.snap.model === snap.model && !c.done) c.done = true; }); put('checks', checks);
    let msg = t('Deal saved on this phone only.');
    if(on('deals') && API){ msg = (await enqueue(Object.assign({}, snap, {kind, price}))) ? t('Deal saved and sent.') : t('Deal saved. It will be sent when you are online.'); }
    render();
    return msg;
  }

  /* ---------- UI pieces ---------- */
  const yesNo = (name, val) => '<div class="pills yn">' + pill('radio', name, 'yes', t('Yes'), val === true) + pill('radio', name, 'no', t('No'), val === false) + '</div>';
  const questionsHtml = (prefix, vals) => QUESTIONS.map(([k, q, d]) =>
    '<div class="q"><b>' + t(q) + '</b><p class="hint">' + t(d) + '</p>' + yesNo(prefix + k, vals[k]) + '</div>').join('');
  const langBtns = () => '<div class="lang" role="group">' + [['en','EN'],['fr','FR'],['ar','الدارجة']].map(([l, n]) =>
    '<button type="button" data-lang="' + l + '" aria-pressed="' + (LANG === l) + '">' + n + '</button>').join('') + '</div>';

  /* first launch */
  let draft = {};
  function renderOnboard(){
    const box = $('onboard');
    if(consent){ box.hidden = true; document.documentElement.classList.remove('locked'); return; }
    box.hidden = false; document.documentElement.classList.add('locked');
    const all = QUESTIONS.every(([k]) => typeof draft[k] === 'boolean');
    box.innerHTML = '<div class="obin">' + langBtns() +
      '<h1>' + t('Welcome') + '</h1><p class="lede">' + t('Before you start, choose what this app may do. You can change any answer later in Data sharing, at the bottom of the page.') + '</p>' +
      questionsHtml('ob_', draft) +
      '<p class="hint">' + t('Never collected: your name, phone number, contacts, location, photos or IMEI. Each install gets a random code so you can delete your data later.') + '</p>' +
      '<button class="btn pri" id="obGo" type="button"' + (all ? '' : ' disabled') + '>' + t('Continue') + '</button>' +
      (all ? '' : '<p class="hint">' + t('Answer each question to continue.') + '</p>') + '</div>';
  }
  $('onboard').addEventListener('click', e => {
    const lb = e.target.closest('.lang button');
    if(lb){ applyLang(lb.dataset.lang); try{ localStorage.setItem('used-apple-lang', lb.dataset.lang); }catch(err){} return; }
    if(e.target.id === 'obGo'){
      consent = Object.assign({}, draft, {at:new Date().toISOString()}); put('consent', consent);
      renderAll(); flush(); if(on('updates')){ checkPrices(false); checkAppVersion(); }
    }
  });
  $('onboard').addEventListener('change', e => {
    const n = e.target.name || ''; if(!n.startsWith('ob_')) return;
    draft[n.slice(3)] = e.target.value === 'yes'; renderOnboard();
  });

  /* deal box under the receipt */
  function renderDeal(){
    $('dealBox').innerHTML = '<p class="eyebrow">' + t('Record a deal') + '</p>' +
      '<div class="pills">' + pill('radio', 'dealKind', 'bought', t('I bought it'), true) + pill('radio', 'dealKind', 'sold', t('I sold it'), false) + '</div>' +
      '<label for="dealPrice" class="lab">' + t('Final price in MAD') + '</label>' +
      '<div class="dealrow"><input type="number" id="dealPrice" min="0" step="50" inputmode="numeric"><button class="btn pri" id="dealSave" type="button">' + t('Save deal') + '</button></div>' +
      '<p class="hint" id="dealMsg" role="status"></p>';
  }
  $('dealBox').addEventListener('click', async e => {
    if(e.target.id !== 'dealSave') return;
    const price = Number($('dealPrice').value), msg = $('dealMsg');
    if(!(price > 0)){ msg.textContent = t('Type the final price first.'); return; }
    const kind = (document.querySelector('input[name=dealKind]:checked') || {}).value || 'bought';
    commitAsk();
    msg.textContent = await saveDeal(kind, price, snapshot());
    $('dealPrice').value = '';
  });

  /* "did you make the deal?" card on a later launch */
  let promptDismissed = false;
  function renderPrompt(){
    const box = $('askPrompt');
    const c = on('remind') && !promptDismissed && get('checks', []).find(x => !x.done && Date.now() - x.ts > 30 * 6e4 && Date.now() - x.ts < 7 * DAY);
    if(!c){ box.hidden = true; return; }
    box.hidden = false; box.dataset.key = c.key;
    box.innerHTML = '<b>' + t('Did you make the deal?') + '</b><p class="hint">' + esc(t('You checked {x}, asked at {n} MAD.', {x:c.name, n:fmt(c.ask)})) + '</p>' +
      '<div class="pills">' + pill('radio', 'pKind', 'bought', t('I bought it'), false) + pill('radio', 'pKind', 'sold', t('I sold it'), false) + '</div>' +
      '<div class="dealrow" id="pRow" hidden><input type="number" id="pPrice" min="0" step="50" inputmode="numeric" value="' + c.ask + '" aria-label="' + t('Final price in MAD') + '"><button class="btn pri" id="pSave" type="button">' + t('Save deal') + '</button></div>' +
      '<div class="btns"><button class="btn" id="pNo" type="button">' + t('No deal') + '</button><button class="btn" id="pLater" type="button">' + t('Later') + '</button></div>';
  }
  $('askPrompt').addEventListener('change', e => { if(e.target.name === 'pKind') $('pRow').hidden = false; });
  $('askPrompt').addEventListener('click', async e => {
    const id = e.target.id, key = $('askPrompt').dataset.key;
    const checks = get('checks', []), c = checks.find(x => x.key === key);
    if(!c) return;
    if(id === 'pLater'){ promptDismissed = true; renderPrompt(); return; }
    if(id === 'pNo'){ c.done = true; put('checks', checks); renderPrompt(); return; }
    if(id === 'pSave'){
      const price = Number($('pPrice').value); if(!(price > 0)) return;
      const kind = (document.querySelector('input[name=pKind]:checked') || {}).value || 'bought';
      c.done = true; put('checks', checks);
      const msg = await saveDeal(kind, price, c.snap);
      $('askPrompt').innerHTML = '<p class="hint">' + msg + '</p>';
      setTimeout(renderPrompt, 2500);
    }
  });

  /* Data sharing panel */
  let lastNote = '';
  function note(s){ lastNote = s; renderData(); }
  function renderData(){
    const body = $('dataBody'); if(!body) return;
    const p = get('prices', null);
    const q = get('queue', []).length, sent = get('sent', 0);
    body.innerHTML = questionsHtml('ds_', consent || {}) +
      '<div class="sg"><p class="hint">' + (p && p.version > 1 ? t('Price list version {v}, from {d}', {v:p.version, d:esc(p.date || '')}) : t('Built-in prices from 19 Oct 2026')) + '</p>' +
      '<p class="hint">' + (API ? t('Waiting to send: {n}. Sent: {m}.', {n:q, m:sent}) : t('No server is set up yet, so records stay on this phone.')) + '</p>' +
      '<p class="hint">' + t('Install code: {c}', {c:installId.slice(0, 8)}) + '</p>' +
      (lastNote ? '<p class="hint" role="status"><b>' + lastNote + '</b></p>' : '') + '</div>' +
      '<div class="btns"><button class="btn" id="dsSend" type="button">' + t('Send now') + '</button>' +
      '<button class="btn" id="dsPrices" type="button">' + t('Check for new prices') + '</button>' +
      '<button class="btn danger" id="dsDelete" type="button">' + t('Delete my data') + '</button></div>';
  }
  $('dataBody').addEventListener('change', e => {
    const n = e.target.name || ''; if(!n.startsWith('ds_')) return;
    consent = Object.assign({}, consent, {[n.slice(3)]: e.target.value === 'yes', at:new Date().toISOString()}); put('consent', consent);
    render(); renderPrompt();
  });
  $('dataBody').addEventListener('click', async e => {
    const id = e.target.id;
    if(id === 'dsSend'){ commitAsk(); note((await flush()) ? t('Sent.') : t('Could not reach the server. Try again when online.')); }
    else if(id === 'dsPrices') checkPrices(true);
    else if(id === 'dsDelete'){
      if(!confirm(t('Delete the data you shared from the server and this phone?'))) return;
      if(API){
        try{
          const res = await fetch(API + '/rest/v1/rpc/delete_install', {method:'POST', headers:headers(), body:JSON.stringify({p_install:installId})});
          if(!res.ok) throw new Error(res.status);
        }catch(err){ note(t('Could not reach the server. Try again when online.')); return; }
      }
      ['queue', 'deals', 'checks', 'sent'].forEach(k => { try{ localStorage.removeItem('ua-' + k); }catch(err){} });
      installId = uuid(); put('install', installId);
      render(); note(t('Your data was deleted.'));
    }
  });

  function renderAll(){ renderOnboard(); renderDeal(); renderPrompt(); renderData(); renderUpdate(); }

  /* hooks into the page script */
  const baseRender = render;
  render = function(){
    const r = baseRender();
    const p = get('prices', null);
    if(p && p.version > 1) $('chipRow').insertAdjacentHTML('beforeend', '<span class="chip"><i style="background:var(--accent)"></i>' + t('Prices updated {d}', {d:esc(p.date || 'v' + p.version)}) + '</span>');
    trackAsk();
    return r;
  };
  const baseApplyLang = applyLang;
  applyLang = function(l){ baseApplyLang(l); renderAll(); };

  /* start */
  const cached = get('prices', null);
  const prev = model().base;
  if(cached) applyPrices(cached);
  refreshBase(prev);
  renderAll();
  if(consent){ flush(); if(on('updates')){ checkPrices(false); checkAppVersion(); } }
})();
