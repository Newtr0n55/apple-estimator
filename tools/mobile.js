/* ---------- Android app shell ---------- */
(function(){
  const app = window.AndroidApp;   // Java bridge, absent in a normal browser
  const copyBtn = $('copyBtn'), shareBtn = $('shareBtn');

  // Copy and Share go through Android: the WebView clipboard API is unreliable on file:// pages
  if(app){
    shareBtn.hidden = false;
    copyBtn.addEventListener('click', e => {
      e.stopImmediatePropagation();
      app.copy(summaryText());
      copyBtn.textContent = t('Copied');
      setTimeout(() => copyBtn.textContent = t('Copy summary'), 1600);
    }, true);
    shareBtn.addEventListener('click', () => app.share(summaryText()));
  } else if(navigator.share){
    // web version on a phone: use the browser's own share sheet
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', () => navigator.share({text:summaryText()}).catch(() => {}));
  }

  // Hide the floating price bar while the receipt itself is on screen
  const dock = $('dock');
  if('IntersectionObserver' in window){
    new IntersectionObserver(es => es.forEach(x => dock.classList.toggle('away', x.isIntersecting)), {threshold:0.15}).observe($('result'));
  }

  // Match the Android status and navigation bars to the page background
  function syncBars(){
    if(!app || !app.setBars) return;
    const cs = getComputedStyle(document.documentElement);
    app.setBars(cs.getPropertyValue('--bg').trim(), cs.colorScheme.indexOf('dark') !== -1);
  }
  new MutationObserver(syncBars).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncBars); }catch(e){}
  syncBars();

  // Android back button: close the open panel first, then let the app exit
  window.appBack = function(){
    const set = $('settings');
    if(set.open){ set.open = false; set.scrollIntoView({block:'nearest'}); return true; }
    if(!$('copyBox').hidden){ $('copyBox').hidden = true; return true; }
    return false;
  };
})();
