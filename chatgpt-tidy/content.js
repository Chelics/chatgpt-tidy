(() => {
  'use strict';
  if (document.getElementById('cgt-assistant')) return;
  const KEY = 'cgt-settings-v1';
  const SELECTOR_KEY = 'cgt-question-selector-v1';
  let learnedSelector = '';
  let settings = { hidden: {}, collapsed: innerWidth < 1280 };
  let projects = new Map();
  let roots = [document];
  const messageOwners = new WeakMap();
  let catalog = [], nextMessageId = 1, scrollDirection = 1, pendingJump = null;
  const elementKeys = new WeakMap(), scrollPositions = new WeakMap();
  let messages = [], active = -1, activeKey = null, tab = 'questions', signature = '', timer;
  let route = location.pathname, storageReady = false;
  const host = document.createElement('div');
  host.id = 'cgt-assistant';
  host.style.cssText = 'position:fixed;right:20px;top:24%;z-index:2147483000;color-scheme:light dark';
  const ui = host.attachShadow({ mode: 'open' });
  // Build with DOM APIs so initialization also works under Trusted Types enforcement.
  function el(tag, attrs = {}, text = '') {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    return node;
  }
  const style = el('style');
  style.textContent = `
    :host{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#353535;--paper:#ffffff;--muted:#858585;--line:#ededed;--hover:#f5f5f5}
    :host([data-dark]){color:#dedede;--paper:#232323;--muted:#969696;--line:#383838;--hover:#303030}
    *{box-sizing:border-box}button,a,input{font:inherit}button{cursor:pointer;color:inherit}
    button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #929292;outline-offset:2px}
    .toggle{display:flex;align-items:center;gap:7px;margin-left:auto;border:1px solid var(--line);border-radius:9px;padding:7px 10px;background:var(--paper);color:var(--muted)}
    .toggle:hover{color:inherit;background:var(--hover)}
    .panel{width:230px;margin-top:8px;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:0 4px 20px #00000008;overflow:hidden}
    header{display:flex;gap:18px;padding:0 16px;border-bottom:1px solid var(--line)}
    header button{position:relative;background:none;border:0;padding:13px 0 11px;color:var(--muted);font-size:12px}
    header button[aria-selected=true]{color:inherit}
    header button[aria-selected=true]:after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:2px;background:currentColor;border-radius:2px}
    .body{max-height:min(54vh,530px);overflow:auto;padding:8px;scrollbar-width:thin;scrollbar-color:#9995 transparent}
    .question{display:flex;align-items:baseline;text-align:left;width:100%;border:0;background:none;padding:9px 8px;border-radius:6px;margin:1px 0;line-height:1.6}
    .question:hover,.question[aria-current=true]{background:var(--hover)}
    .question[aria-current=true] .number{color:inherit}
    .label{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:anywhere}
    .number{color:var(--muted);margin-right:5px;min-width:5px;flex-shrink:0;font-size:11px;font-variant-numeric:tabular-nums}
    .note{font-size:11px;color:var(--muted);padding:7px 8px;margin:0;line-height:1.7}
    input{width:calc(100% - 12px);margin:4px 6px 8px;border:0;border-bottom:1px solid var(--line);padding:7px 2px;background:transparent;color:inherit;outline-offset:0}
    .project{display:flex;align-items:center;gap:8px;padding:9px 8px;border-radius:6px}
    .project:hover{background:var(--hover)}
    .project a{flex:1;color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .project button{flex:none;background:none;border:0;color:var(--muted);padding:3px;font-size:11px}
    .project button:hover{color:inherit}
    .project-state-icon{width:14px;height:14px;flex:none;color:var(--muted)}
    .project[data-project-state=hidden]{background:var(--hover);margin:3px 0}
    .project[data-project-state=hidden] a{color:var(--muted)}
    .project[data-project-state=hidden]:hover a{color:inherit}
    .project[data-project-state=hidden] button{border:1px solid var(--line);border-radius:5px;padding:2px 7px;color:inherit;background:var(--paper)}
    .project[data-project-state=hidden] button:hover{border-color:var(--muted)}
    .group{font-size:10px;letter-spacing:1px;color:var(--muted);padding:13px 8px 4px}
    .notice{padding:0 16px 10px;font-size:11px;color:var(--muted)}.notice:empty{display:none}
    .tooltip{position:fixed;z-index:2;width:min(360px,calc(100vw - 24px));max-height:45vh;overflow:auto;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--paper);box-shadow:0 6px 24px #0002;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;user-select:text;scrollbar-width:thin}
    [hidden]{display:none!important}
    @media(max-width:600px){.panel{width:min(230px,calc(100vw - 40px))}}
  `;
  const launcher = el('button', {class:'toggle', 'aria-expanded':'true', 'aria-label':'展开或收起对话导航'}, '☰  导航');
  const section = el('section', {class:'panel', 'aria-label':'对话导航'});
  const header = el('header', {role:'tablist', 'aria-label':'功能'});
  header.append(el('button', {role:'tab','data-tab':'questions','aria-selected':'true'}, '对话目录'), el('button', {role:'tab','data-tab':'projects','aria-selected':'false'}, '项目'));
  section.append(header, el('div', {class:'body'}), el('div', {class:'notice',role:'status','aria-live':'polite'}));
  const preview = el('div', {class:'tooltip',id:'cgt-question-preview',role:'tooltip',hidden:''});
  ui.append(style, launcher, section, preview);
  document.body.append(host);
  const body = ui.querySelector('.body');
  const toggle = ui.querySelector('.toggle');
  const panel = ui.querySelector('.panel');
  let previewTrigger = null, previewTimer;
  function hidePreview() {
    clearTimeout(previewTimer);
    preview.hidden = true;
    previewTrigger?.removeAttribute('aria-describedby');
    previewTrigger = null;
  }
  function scheduleHidePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(hidePreview, 140); }
  function showPreview(button, text) {
    hidePreview(); previewTrigger = button;
    preview.textContent = text; preview.hidden = false; preview.scrollTop = 0;
    button.setAttribute('aria-describedby', preview.id);
    const rect = button.getBoundingClientRect(), box = preview.getBoundingClientRect();
    const left = rect.left >= box.width + 20 ? rect.left - box.width - 8 : Math.min(rect.right + 8, innerWidth - box.width - 12);
    preview.style.left = Math.max(12,left)+'px';
    preview.style.top = Math.max(12,Math.min(rect.top,innerHeight-box.height-12))+'px';
  }
  preview.addEventListener('mouseenter', () => clearTimeout(previewTimer));
  preview.addEventListener('mouseleave', scheduleHidePreview);
  body.addEventListener('scroll', hidePreview, {passive:true});
  window.addEventListener('resize', hidePreview);
  ui.addEventListener('keydown', event => { if (event.key === 'Escape') hidePreview(); });
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type !== 'attributes' || (record.attributeName === 'class' && !record.target.classList.contains('cgt-jump-target')) || record.attributeName !== 'class')) schedule();
  });
  function collectRoots() {
    const result = [], seen = new Set();
    function visit(root) {
      if (seen.has(root)) return;
      seen.add(root); result.push(root);
      for (const node of root.querySelectorAll('*')) {
        if (node === host) continue;
        if (node.shadowRoot) visit(node.shadowRoot);
        if (node.tagName === 'IFRAME') {
          try { if (node.contentDocument?.documentElement) visit(node.contentDocument); } catch {}
        }
      }
    }
    visit(document);
    return result;
  }
  function queryAll(selector) {
    return roots.flatMap(root => [...root.querySelectorAll(selector)]);
  }
  function observe() {
    for (const root of roots) observer.observe(root.nodeType === 9 ? root.documentElement : root, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['href', 'data-message-author-role', 'data-turn', 'data-user-message-bubble', 'data-content-search-unit-key', 'class', 'data-app-action-sidebar-project-id', 'data-app-action-sidebar-project-label']
    });
  }
  document.addEventListener('load', event => { if (event.target.tagName === 'IFRAME') schedule(); }, true);
  function note(text) { ui.querySelector('.notice').textContent = text; }
  function applyCollapsed() {
    panel.hidden = settings.collapsed;
    if (settings.collapsed) hidePreview();
    toggle.setAttribute('aria-expanded', String(!settings.collapsed));
  }
  async function persist() {
    try { await chrome.storage.local.set({ [KEY]: settings }); }
    catch { note('设置未保存，请刷新页面后重试。当前操作仍有效。'); }
  }
  toggle.addEventListener('click', () => {
    if (!storageReady) return;
    settings.collapsed = !settings.collapsed;
    applyCollapsed(); void persist();
  });
  for (const button of ui.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => {
      tab = button.dataset.tab;
      for (const item of ui.querySelectorAll('[data-tab]')) item.setAttribute('aria-selected', String(item === button));
      signature = ''; render();
    });
  }
  function projectInfo(anchor) {
    try {
      const url = new URL(anchor.getAttribute('href'), location.origin);
      if (url.origin !== location.origin) return null;
      const match = url.pathname.match(/^\/g\/(g-p-[^/]+)(?:\/project)?\/?$/);
      if (!match) return null;
      const title = (anchor.textContent.trim() || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
      return title ? { id: match[1], title, href: url.pathname } : null;
    } catch { return null; }
  }
  function projectRow(anchor) {
    // Never hide a container holding multiple links or unrelated controls.
    const parent = anchor.parentElement;
    if (!parent || parent.matches('nav,aside,main,section,[role="main"],[role="navigation"],[data-app-shell-main-surface],[data-thread-user-message-navigation-content]')) return null;
    if (parent.querySelectorAll('a[href]').length !== 1) return null;
    if (parent.querySelector('h1,h2,h3,nav,section')) return null;
    if (['A', 'BUTTON'].includes(parent.tagName)) return null;
    return parent;
  }
  function setHidden(info) {
    if (!storageReady) return;
    settings.hidden[info.id] = { title: info.title, href: info.href };
    update(); void persist(); note('项目已隐藏，可在“项目”中恢复。');
  }
  function restore(id) {
    delete settings.hidden[id]; update(); void persist(); note('项目已恢复显示。');
  }
  function syncProjects() {
    for (const element of queryAll('.cgt-hidden-project')) element.classList.remove('cgt-hidden-project');
    const seen = new Set();
    projects = new Map();
    // Current sidebar projects are div buttons, not links. Use their explicit domain metadata.
    for (const row of queryAll('[data-app-action-sidebar-project-row][data-app-action-sidebar-project-id]')) {
      const id = row.getAttribute('data-app-action-sidebar-project-id');
      const title = (row.getAttribute('data-app-action-sidebar-project-label') || row.querySelector('[data-marquee-content]')?.textContent || '').trim();
      if (!/^g-p-[\w-]+$/.test(id || '') || !title) continue;
      const info = {id,title,href:'/g/'+id+'/project'};
      projects.set(id,info);
      const container = row.closest('[data-sidebar-project-kind][data-sidebar-project-container-id]');
      const item = container?.closest('[role="listitem"]');
      // Hide the project group including expanded child chats; never hide the containing list.
      const target = item && item.querySelectorAll('[data-app-action-sidebar-project-row]').length === 1 ? item : container || row;
      if (settings.hidden[id]) {
        settings.hidden[id].title = title;
        target.classList.add('cgt-hidden-project');
      }
    }
    for (const anchor of queryAll('a[href]')) {
      if (anchor.closest('header,[data-app-shell-main-titlebar],[data-app-shell-titlebar],[data-app-shell-header-slot],article,[data-message-author-role],[data-user-message-bubble],[data-content-search-unit-key],[data-turn-key],[data-content-search-turn-key],[data-thread-user-message-navigation-content],.rich-text-user-turn,.markdown,.prose')) continue;
      const info = projectInfo(anchor);
      if (!info) continue;
      if (projects.has(info.id)) continue;
      projects.set(info.id, info);
      const row = projectRow(anchor);
      if (settings.hidden[info.id]) {
        settings.hidden[info.id].title = info.title;
        (row || anchor).classList.add('cgt-hidden-project');
      }
      if (!row) continue;
      seen.add(row);
      row.classList.add('cgt-project-wrap');
      let button = row.querySelector(':scope > .cgt-hide-project');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button'; button.className = 'cgt-hide-project'; button.textContent = '−';
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          const current = projectInfo(row.querySelector('a[href]'));
          if (current) setHidden(current);
        });
        row.append(button);
      }
      button.title = `在本机隐藏项目：${info.title}`;
      button.setAttribute('aria-label', button.title);
    }
    for (const button of queryAll('.cgt-hide-project')) {
      if (!seen.has(button.parentElement)) { button.parentElement.classList.remove('cgt-project-wrap'); button.remove(); }
    }
  }
  function textOf(element) {
    function walk(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 && node.nodeType !== 11) return '';
      if (node.nodeType === 1 && node.matches('script,style,button,input,textarea,[contenteditable="true"],[hidden],[aria-hidden="true"]')) return '';
      return [...(node.shadowRoot || node).childNodes].map(walk).join(' ');
    }
    const preferred = element.querySelector('.whitespace-pre-wrap');
    const preferredText = preferred ? walk(preferred).trim() : '';
    return (preferredText || walk(element)).replace(/\s+/g, ' ').trim();
  }
  function composedParent(node) {
    return node.parentElement || node.getRootNode().host || node.ownerDocument?.defaultView?.frameElement || null;
  }
  function inActivePage(element) {
    for (let node = element; node; node = composedParent(node)) {
      if (node.matches('[hidden],[inert],[aria-hidden="true"],[data-state="inactive"]')) return false;
      const view = node.ownerDocument.defaultView;
      const css = view.getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || css.contentVisibility === 'hidden') return false;
      if (node.matches('main,[role="main"],[data-codex-history-swipe-page],[data-app-shell-main-surface]') && node.getClientRects().length) {
        const box = node.getBoundingClientRect();
        // Check the page, not each message: scrolled-off questions still belong in the directory.
        if (box.width > 0 && box.height > 0 && (box.right <= 0 || box.left >= view.innerWidth || box.bottom <= 0 || box.top >= view.innerHeight)) return false;
      }
    }
    return true;
  }
  function messageOf(element) {
    if (!inActivePage(element)) return null;
    if (element.closest('nav, aside, header, footer, form, [contenteditable="true"], [role="textbox"], [hidden], [aria-hidden="true"]')) return null;
    const text = textOf(element);
    const media = element.matches('img,video,audio') || element.querySelector('img,video,audio,[data-testid="attachment"],[data-test-id="attachment"]');
    return text || media ? {element, text:text || '图片或附件提问'} : null;
  }
  function readMessages() {
    if (learnedSelector) {
      const oldMatches = queryAll(learnedSelector).filter(element => messageOf(element));
      if (oldMatches.length === 1) {
        const ancestors = [];
        for (let node = oldMatches[0]; node && ancestors.length < 9; node = node.parentElement || node.getRootNode().host) {
          if (['MAIN','BODY','HTML'].includes(node.tagName)) break;
          ancestors.push(node);
        }
        const better = bestQuestionRule(ancestors);
        if (better && better.count > 1 && better.selector !== learnedSelector) {
          learnedSelector = mergeRule(learnedSelector, better.selector);
          if (storageReady) chrome.storage.local.set({[SELECTOR_KEY]:learnedSelector}).catch(() => {});
        }
      }
    }
    const selectors = '.rich-text-user-turn, [data-user-message-bubble="true"], [data-content-search-unit-key$=":user"], [data-message-author-role="user"], [data-turn="user"], .user-message-bubble-color, [data-testid="user-message"], [data-test-id="user-message"]' + (learnedSelector ? ', ' + learnedSelector : '');
    const candidates = queryAll(selectors).map(messageOf).filter(Boolean).filter(message => {
      const turn = message.element.closest('[data-content-search-unit-key],[data-turn-key],[data-content-search-turn-key]');
      const fingerprint = [turn?.getAttribute('data-content-search-unit-key'), turn?.getAttribute('data-turn-key'), turn?.getAttribute('data-content-search-turn-key'), message.text].join('\n');
      const owner = messageOwners.get(message.element);
      // URL changes can precede React replacing the old conversation nodes.
      if (owner && owner.route !== route && owner.fingerprint === fingerprint) return false;
      messageOwners.set(message.element, {route, fingerprint});
      return true;
    });
    return candidates.filter(candidate => !candidates.some(other => other !== candidate && candidate.element.contains(other.element)));
  }
  function turnKey(element) {
    let searchKey = null;
    for (let node = element; node; node = composedParent(node)) {
      if (node.matches('main,[role="main"]')) break;
      // Prefer true message/turn IDs over positional search-unit keys on inner wrappers.
      for (const attr of ['data-message-id','data-turn-key','data-content-search-turn-key']) {
        const value = node.getAttribute(attr);
        if (value && !value.startsWith('fallback-')) return attr+':'+value;
      }
      const unit = node.getAttribute('data-content-search-unit-key');
      if (unit && !unit.startsWith('fallback-') && !searchKey) searchKey = 'data-content-search-unit-key:'+unit;
    }
    // fallback-* identifies a search position, which may be reused after history loading.
    // Use the existing element/text matching path rather than merging by this index.
    return searchKey;
  }
  function mergeMessages(live) {
    const used = new Set();
    for (const record of catalog) record.element = null;
    const batch = live.map(message => {
      const stable = turnKey(message.element);
      const prior = elementKeys.get(message.element);
      let record = stable ? catalog.find(item => item.key === stable) : null;
      if (!record && !stable && prior?.route === route && prior.text === message.text) record = catalog.find(item => item.key === prior.key);
      if (!record && !stable) record = catalog.find(item => item.text === message.text && !used.has(item.key));
      if (!record) record = {key:stable || 'local:'+nextMessageId++, text:message.text, element:null};
      record.text = message.text; record.element = message.element;
      used.add(record.key);
      elementKeys.set(message.element,{route,key:record.key,text:record.text});
      return record;
    });
    const unique = batch.filter((record,i) => batch.findIndex(other=>other.key === record.key) === i);
    const hasAnchor = unique.some(record => catalog.includes(record));
    if (!hasAnchor) {
      const additions = unique.filter(record=>!catalog.includes(record));
      catalog = scrollDirection < 0 ? [...additions,...catalog] : [...catalog,...additions];
    } else {
      // New history goes before its next known neighbor; existing records keep their order.
      for (let i = 0; i < unique.length; i++) {
        const record = unique[i];
        if (catalog.includes(record)) continue;
        const next = unique.slice(i+1).find(other=>catalog.includes(other));
        if (next) catalog.splice(catalog.indexOf(next),0,record);
        else {
          const previous = unique.slice(0,i).reverse().find(other=>catalog.includes(other));
          catalog.splice(previous ? catalog.indexOf(previous)+1 : catalog.length,0,record);
        }
      }
    }
    return catalog;
  }
  function scrollContainer() {
    const live = messages.find(message=>message.element?.isConnected && inActivePage(message.element));
    for (let node = live?.element; node; node = composedParent(node)) {
      if (node.matches('[data-app-action-timeline-scroll]')) return node;
      if (/(auto|scroll)/.test(node.ownerDocument.defaultView.getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
    }
    return queryAll('[data-app-action-timeline-scroll]').find(node=>inActivePage(node)) || document.scrollingElement || document.documentElement;
  }
  function jumpTo(key) {
    pendingJump = {key,route,attempts:0}; advanceJump();
  }
  function advanceJump() {
    if (!pendingJump) return;
    if (pendingJump.route !== route) { pendingJump = null; return; }
    const index = messages.findIndex(message=>message.key === pendingJump.key);
    const record = messages[index];
    if (!record) { pendingJump = null; return; }
    if (record.element?.isConnected && inActivePage(record.element)) {
      const target = record.element;
      target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'center'});
      target.classList.add('cgt-jump-target'); setTimeout(()=>target.classList.remove('cgt-jump-target'),1400);
      markActive(index); pendingJump = null; note(''); return;
    }
    if (++pendingJump.attempts > 24) { pendingJump = null; note('暂时未能定位这条提问，可滚动到附近后再试。'); return; }
    const liveIndices = messages.map((message,i)=>message.element?.isConnected ? i : -1).filter(i=>i>=0);
    const midpoint = liveIndices.length ? (liveIndices[0]+liveIndices[liveIndices.length-1])/2 : messages.length/2;
    const direction = index < midpoint ? -1 : 1;
    const container = scrollContainer();
    scrollDirection = direction;
    container.scrollTop += direction * Math.max(300,(container.clientHeight || innerHeight)*.8);
    note('正在定位提问…');
  }
  function mergeRule(existing, added) {
    return [...new Set([...existing.split(', '), added].filter(Boolean))].join(', ');
  }
  function validSavedRule(candidate) {
    return typeof candidate === 'string' && candidate.length < 2000 && candidate.split(', ').every(selector =>
      /^\[data-[a-z-]+="[a-zA-Z0-9_-]+"\]$/.test(selector) || /^\.[a-zA-Z0-9_-]+$/.test(selector));
  }
  function bestQuestionRule(ancestors) {
    const choices = [];
    const escape = value => window.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, char => '\\' + char);
    // Learn only an explicit user/prompt marker, never a generic text/container class.
    for (const [depth, node] of ancestors.entries()) {
      for (const attribute of [...node.attributes]) {
        if (/^data-(test-?id|role|author|message-role|message-author-role|turn|type)$/.test(attribute.name) &&
          /user|human|prompt/i.test(attribute.value) && /^[a-zA-Z0-9_-]{1,100}$/.test(attribute.value)) {
        choices.push({selector:`[${attribute.name}="${attribute.value}"]`, score:100-depth});
        }
      }
      for (const name of node.classList) {
        if (/user|human|prompt/i.test(name) && !/cursor|select|focus|hover|group|composer|input|avatar|profile/i.test(name)) {
        choices.push({selector:'.'+escape(name), score:50-depth});
        }
      }
    }
    const evaluated = choices.map(choice => {
      try { return {...choice, count: queryAll(choice.selector).filter(element => messageOf(element)).length}; }
      catch { return {...choice, count:0}; }
    }).filter(choice => choice.count > 0);
    // A selector shared by messages beats an ID identifying only the clicked message.
    return evaluated.sort((a,b) => Number(b.count > 1)-Number(a.count > 1) || b.score-a.score || b.count-a.count)[0];
  }
  function render() {
    const next = JSON.stringify([tab, tab === 'questions' ? messages.map(m => [m.key,m.text]) : [settings.hidden, [...projects]]]);
    if (signature === next) return;
    const listTop = body.getBoundingClientRect().top;
    const anchor = [...body.querySelectorAll('[data-key]')].find(button=>button.getBoundingClientRect().bottom > listTop);
    const anchorKey = anchor?.dataset.key, anchorTop = anchor?.getBoundingClientRect().top, oldScroll = body.scrollTop;
    hidePreview(); signature = next; body.replaceChildren();
    if (tab === 'questions') {
      const hint = document.createElement('p'); hint.className = 'note';
      hint.textContent = messages.length ? `已加载${messages.length}个问题，点击跳转` : location.pathname.includes('/c/') ? '正在加载对话…' : '进入任一对话，目录会自动出现。';
      body.append(hint);
      messages.forEach((message, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'question'; button.dataset.key = message.key;
        button.addEventListener('mouseenter', () => showPreview(button,message.text));
        button.addEventListener('mouseleave', scheduleHidePreview);
        button.addEventListener('focus', () => showPreview(button,message.text));
        button.addEventListener('blur', hidePreview);
        const number = document.createElement('span'); number.className = 'number'; number.textContent = '·';
        const label = el('span', {class:'label'}, message.text);
        button.append(number, label);
        button.addEventListener('click', () => {
          if (route !== location.pathname) { update(); return; }
          hidePreview(); jumpTo(message.key);
        });
        body.append(button);
      });
      body.scrollTop = oldScroll;
      const newAnchor = [...body.querySelectorAll('[data-key]')].find(button=>button.dataset.key === anchorKey);
      if (newAnchor) body.scrollTop += newAnchor.getBoundingClientRect().top - anchorTop;
      markActive(messages.findIndex(message=>message.key === activeKey));
    } else {
      const hiddenEntries = Object.entries(settings.hidden);
      const visibleEntries = [...projects].filter(([id]) => !settings.hidden[id]);
      const all = [...hiddenEntries.map(([id, info]) => [id, info, true]), ...visibleEntries.map(([id, info]) => [id, info, false])];
      if (!all.length) body.append(el('p', {class:'note'}, '展开 ChatGPT 左侧的项目列表后，这里会自动显示。'));
      if (all.length > 5) {
        const input = el('input', {type:'search',placeholder:'查找项目','aria-label':'查找项目'});
        body.append(input);
        input.addEventListener('input', () => {
          for (const row of body.querySelectorAll('.project')) row.hidden = !row.textContent.toLowerCase().includes(input.value.toLowerCase());
        });
      }
      for (const hidden of [true, false]) {
        const entries = all.filter(item => item[2] === hidden);
        if (!entries.length) continue;
        body.append(el('div', {class:'group'}, hidden ? `已隐藏 · ${entries.length}` : `显示中 · ${entries.length}`));
        for (const [id, info] of entries) {
          const row = el('div', {class:'project','data-project-state':hidden ? 'hidden' : 'visible'});
          const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
          for (const [name,value] of Object.entries({class:'project-state-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) icon.setAttribute(name,value);
          const path = document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d',hidden ? 'M3 3l18 18M10.5 10.5a2.1 2.1 0 003 3M9.5 5.3A10.5 10.5 0 0112 5c6 0 10 7 10 7a18 18 0 01-3.2 3.9M6.2 6.2A20 20 0 002 12s4 7 10 7a10 10 0 005.8-1.8' : 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 11-6 0 3 3 0 016 0');
          icon.append(path);
          const link = el('a', {href:info.href,title:info.title}, info.title);
          const button = el('button', {type:'button','aria-label':`${hidden ? '恢复' : '隐藏'}项目：${info.title}`}, hidden ? '恢复' : '隐藏');
          button.addEventListener('click', () => hidden ? restore(id) : setHidden({id,...info}));
          row.append(icon, link, button); body.append(row);
        }
      }
    }
  }
  function markActive(index) {
    active = index; activeKey = messages[index]?.key || null;
    ui.querySelectorAll('.question').forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  }
  let scrolling = false;
  document.addEventListener('scroll', event => {
    if (event.composedPath().includes(host)) return;
    const container = event.target === document ? (document.scrollingElement || document.documentElement) : event.target;
    const position = container.scrollTop || 0;
    const prior = scrollPositions.get(container);
    if (prior !== undefined && position !== prior) scrollDirection = position < prior ? -1 : 1;
    scrollPositions.set(container,position);
    if (scrolling || tab !== 'questions') return;
    scrolling = true;
    requestAnimationFrame(() => {
      scrolling = false;
      let index = -1;
      messages.forEach((message, i) => { if (message.element?.isConnected && inActivePage(message.element) && message.element.getBoundingClientRect().top <= innerHeight * .45) index = i; });
      markActive(index < 0 && messages.length ? 0 : index);
    });
  }, { capture: true, passive: true });
  function update() {
    clearTimeout(timer); timer = undefined; observer.disconnect();
    try {
      if (route !== location.pathname) {
        route = location.pathname; signature = ''; active = -1; activeKey = null;
        catalog = []; nextMessageId = 1; pendingJump = null; scrollDirection = 1; messages = []; note(''); render();
      }
      host.toggleAttribute('data-dark', document.documentElement.classList.contains('dark') || document.documentElement.style.colorScheme === 'dark');
      roots = collectRoots();
      for (const root of roots) {
        if (root === document || root.querySelector('[data-cgt-scope-style]')) continue;
        const localStyle = (root.ownerDocument || root).createElement('style');
        localStyle.setAttribute('data-cgt-scope-style', '');
        localStyle.textContent = '.cgt-hidden-project{display:none!important}.cgt-project-wrap{position:relative}.cgt-hide-project{position:absolute;right:30px;top:6px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer}.cgt-jump-target{outline:1px solid #8888;outline-offset:6px}';
        (root.head || (root.nodeType === 9 ? root.documentElement : root)).append(localStyle);
      }
      syncProjects(); messages = mergeMessages(readMessages()); render(); advanceJump();
    } finally { observe(); }
  }
  // Throttle instead of debounce: streaming responses must not postpone updates forever.
  function schedule() { if (!timer) timer = setTimeout(() => { timer = undefined; update(); }, 120); }
  applyCollapsed(); update(); // Render immediately, even while storage is unavailable.
  Promise.resolve().then(() => chrome.storage.local.get([KEY, SELECTOR_KEY])).then(result => {
    const candidate = result[SELECTOR_KEY];
    if (validSavedRule(candidate)) {
      try { document.querySelector(candidate); learnedSelector = candidate; } catch {}
    }
    const stored = result[KEY];
    if (stored && typeof stored === 'object') {
      if (typeof stored.collapsed === 'boolean') settings.collapsed = stored.collapsed;
      if (stored.hidden && typeof stored.hidden === 'object' && !Array.isArray(stored.hidden)) {
        // Stored links are rendered in the page; accept only same-site project paths.
        settings.hidden = Object.fromEntries(Object.entries(stored.hidden).filter(([id, item]) =>
          /^g-p-[\w-]+$/.test(id) && item && typeof item.title === 'string' && typeof item.href === 'string' &&
          new RegExp('^/g/' + id + '(/project)?/?$').test(item.href)));
      }
    }
  }).catch(() => note('无法读取本地设置，本次仍可使用。')).finally(() => {
    storageReady = true; applyCollapsed(); update();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      // Other tabs may change settings. Reload to apply through the same validation path.
      const value = changes[KEY].newValue;
      if (value && (value.collapsed !== settings.collapsed || JSON.stringify(Object.keys(value.hidden || {}).sort()) !== JSON.stringify(Object.keys(settings.hidden).sort()))) note('项目设置已更新，刷新页面可同步。');
    }
  });
  document.addEventListener('wheel', event => {
    if (event.composedPath().includes(host)) return;
    pendingJump = null; if (event.deltaY) scrollDirection = event.deltaY < 0 ? -1 : 1;
  }, {passive:true,capture:true});
  setInterval(() => { if (pendingJump) update(); }, 250);
  window.addEventListener('popstate', update);
  window.addEventListener('hashchange', update);
  setInterval(() => { if (route !== location.pathname) update(); }, 100);
  setInterval(schedule, 1500); // Also discover late-attached shadow roots and iframe documents.
})();
