const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('chatgpt-tidy/content.js', 'utf8');
const key = 'cgt-settings-v1';
const fixture = `<nav aria-label="侧栏">
  <div id="project-a"><a href="/g/g-p-alpha/project">已完成项目</a><button>更多</button></div>
  <div id="project-b"><a href="/g/g-p-beta/project">常驻项目</a></div>
  <div id="regular"><a href="/g/g-custom-gpt">普通 GPT</a></div>
  <div id="conversation"><a href="/c/chat-one">聊天记录</a></div>
  <div id="nested"><h2>一组项目</h2><div><a href="/g/g-p-gamma/project">另一个项目</a></div><a href="/c/child">子对话</a></div>
</nav><main><article><div data-message-author-role="user">第一个问题</div><div data-message-author-role="assistant">回答</div></article><article><div data-message-author-role="user">第二个问题</div></article></main>`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup(stored = {}, options = {}) {
  const dom = new JSDOM(fixture, { url: 'https://chatgpt.com/c/chat-one', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  let saved = structuredClone(stored);
  win.chrome = { storage: { local: {
    get: async () => ({ [key]: structuredClone(saved), 'cgt-question-selector-v1':options.rule }),
    set: async value => { if (value[key]) saved = structuredClone(value[key]); }
  }, onChanged: { addListener() {} } } };
  win.matchMedia = () => ({ matches: true });
  win.HTMLElement.prototype.scrollIntoView = function(options) { this.scrolled = options; };
  if (options.html) win.document.body.innerHTML = options.html;
  const htmlDescriptor = Object.getOwnPropertyDescriptor(win.Element.prototype, 'innerHTML');
  if (options.strictHTML) Object.defineProperty(win.Element.prototype, 'innerHTML', {set() { throw new TypeError('TrustedHTML required'); }});
  if (options.pendingStorage) win.chrome.storage.local.get = () => new Promise(() => {});
  try { win.eval(source); } finally { if (options.strictHTML) Object.defineProperty(win.Element.prototype, 'innerHTML', htmlDescriptor); }
  await wait(10);
  return { win, dom, doc: win.document, ui: win.document.getElementById('cgt-assistant').shadowRoot, saved: () => saved };
}
test('目录跳转、新消息、切换对话和重复初始化', async () => {
  const { win, dom, doc, ui } = await setup();
  try {
    assert.equal(ui.querySelectorAll('.question').length, 2);
    ui.querySelectorAll('.question')[1].click();
    assert.equal(doc.querySelectorAll('[data-message-author-role="user"]')[1].scrolled.block, 'center');
    assert.equal(ui.querySelectorAll('.question')[1].getAttribute('aria-current'), 'true');
    const newMessage = doc.createElement('div'); newMessage.dataset.messageAuthorRole = 'user'; newMessage.textContent = '第三个问题';
    doc.querySelector('main').append(newMessage); await wait(230);
    assert.equal(ui.querySelectorAll('.question').length, 3);
    win.history.pushState({}, '', '/c/chat-two');
    doc.querySelector('main').innerHTML = '<div data-message-author-role="user">另一段对话</div>';
    await wait(230);
    assert.equal(ui.querySelectorAll('.question').length, 1);
    assert.match(ui.querySelector('.question').textContent, /另一段对话/);
    win.eval(source); assert.equal(doc.querySelectorAll('#cgt-assistant').length, 1);
  } finally { dom.window.close(); }
});
test('隐藏、恢复、持久化及安全的作用范围', async () => {
  const { dom, doc, ui, saved } = await setup();
  let reload;
  try {
    assert.equal(doc.querySelector('#regular .cgt-hide-project'), null);
    assert.equal(doc.querySelector('#conversation .cgt-hide-project'), null);
    doc.querySelector('#project-a .cgt-hide-project').click();
    await wait(5);
    assert.ok(doc.querySelector('#project-a').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('#project-b').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('#nested').classList.contains('cgt-hidden-project'));
    assert.equal(saved().hidden['g-p-alpha'].title, '已完成项目');
    reload = await setup(saved());
    assert.ok(reload.doc.querySelector('#project-a').classList.contains('cgt-hidden-project'));
    reload.ui.querySelector('[data-tab="projects"]').click();
    assert.equal(reload.ui.querySelector('.project a').getAttribute('href'), '/g/g-p-alpha/project');
    reload.ui.querySelector('.project button').click(); await wait(5);
    assert.ok(!reload.doc.querySelector('#project-a').classList.contains('cgt-hidden-project'));
    assert.deepEqual(reload.saved().hidden, {});
    ui.querySelector('.toggle').click(); await wait(5);
    assert.equal(ui.querySelector('.panel').hidden, saved().collapsed);
  } finally { dom.window.close(); reload?.dom.window.close(); }
});
test('拒绝异常存储链接，项目名称按文本显示', async () => {
  const { dom, ui } = await setup({ hidden: {
    'g-p-valid': { title: '<img src=x onerror=alert(1)>', href: '/g/g-p-valid/project' },
    'g-p-evil': { title: '异常链接', href: 'javascript:alert(1)' }
  }, collapsed: false });
  try {
    ui.querySelector('[data-tab="projects"]').click();
    assert.equal(ui.querySelectorAll('.project').length, 4);
    assert.ok(!ui.textContent.includes('异常链接'));
    assert.equal(ui.querySelector('.project img'), null);
    assert.match(ui.querySelector('.project a').textContent, /<img/);
  } finally { dom.window.close(); }
});
test('侧栏重绘后保持隐藏，复用节点时不误隐藏新项目', async () => {
  const { dom, doc } = await setup({ hidden: { 'g-p-alpha': { title: '已完成项目', href: '/g/g-p-alpha/project' } } });
  try {
    const row = doc.querySelector('#project-a');
    row.outerHTML = '<div id="project-a"><a href="/g/g-p-alpha/project">项目新名称</a></div>';
    await wait(230);
    const replacement = doc.querySelector('#project-a');
    assert.ok(replacement.classList.contains('cgt-hidden-project'));
    replacement.querySelector('a').href = '/g/g-p-other/project';
    replacement.querySelector('a').textContent = '另一个项目';
    await wait(230);
    assert.ok(!replacement.classList.contains('cgt-hidden-project'));
    assert.equal(replacement.querySelectorAll('.cgt-hide-project').length, 1);
  } finally { dom.window.close(); }
});

test('新版消息标记、无 main 容器、普通 div 侧栏及项目面板操作', async () => {
  const { dom, ui, doc } = await setup({}, {html: `<div id="sidebar"><div id="item"><a href="/g/g-p-new/project">新项目</a></div></div><div role="main"><article data-turn="user"><div data-message-author-role="user">新版问题</div></article><article data-turn="user">另一条问题</article><article data-turn="assistant">回复</article></div>`});
  try {
    assert.equal(ui.querySelectorAll('.question').length, 2);
    ui.querySelector('[data-tab="projects"]').click();
    assert.equal(ui.querySelectorAll('.project').length, 1);
    assert.equal(ui.querySelector('.project a').textContent, '新项目');
    ui.querySelector('.project button').click();
    assert.ok(doc.querySelector('#item').classList.contains('cgt-hidden-project'));
    assert.equal(ui.querySelector('.project button').textContent, '恢复');
    ui.querySelector('.project button').click();
    assert.ok(!doc.querySelector('#item').classList.contains('cgt-hidden-project'));
  } finally { dom.window.close(); }
});
test('不使用 innerHTML，存储读取未返回也能显示目录', async () => {
  const { dom, ui } = await setup({}, {strictHTML:true, pendingStorage:true});
  try {
    assert.equal(ui.querySelectorAll('.question').length, 2);
    assert.ok(ui.querySelector('.toggle'));
  } finally { dom.window.close(); }
});
test('连续页面变动不会无限推迟目录更新', async () => {
  const { dom, doc, ui } = await setup();
  try {
    const incoming = doc.createElement('article'); incoming.dataset.turn = 'user'; incoming.textContent = '流式更新期间的问题';
    doc.querySelector('main').append(incoming);
    const interval = setInterval(() => { incoming.textContent += '.'; }, 15);
    try { await wait(170); assert.equal(ui.querySelectorAll('.question').length, 3); }
    finally { clearInterval(interval); }
  } finally { dom.window.close(); }
});

test('没有作者属性时从用户气泡读取问题，排除回复与输入框', async () => {
  const { dom, ui, doc } = await setup({}, {html: `<main><div class="user-message-bubble-color"><div class="whitespace-pre-wrap">实际提问一</div><button>复制</button></div><div class="markdown">助手的回复</div><div data-turn="user"><div class="user-message-bubble-color"><div class="whitespace-pre-wrap">实际提问二</div></div></div><div contenteditable="true"><div class="user-message-bubble-color">草稿</div></div></main>`});
  try {
    assert.equal(ui.querySelectorAll('.question').length, 2);
    assert.equal(ui.querySelector('.label').textContent, '实际提问一');
    ui.querySelector('.question').click();
    assert.ok(doc.querySelector('.user-message-bubble-color').scrolled);
  } finally { dom.window.close(); }
});


test('同源 iframe 中的提问可跳转，动态消息可更新', async () => {
  const { dom, ui, doc } = await setup({}, {html:'<main><iframe></iframe></main>'});
  try {
    const frame = doc.querySelector('iframe');
    const inner = frame.contentDocument;
    inner.body.innerHTML = '<main><div data-message-author-role="user">内嵌页面里的问题</div></main>';
    inner.defaultView.HTMLElement.prototype.scrollIntoView = function() { this.scrolled = true; };
    await wait(180);
    assert.equal(ui.querySelectorAll('.question').length, 1);
    assert.equal(ui.querySelector('.label').textContent, '内嵌页面里的问题');
    ui.querySelector('.question').click();
    assert.ok(inner.querySelector('[data-message-author-role]').scrolled);
    const message = inner.createElement('div'); message.dataset.turn = 'user'; message.textContent = '内嵌新问题';
    inner.querySelector('main').append(message); await wait(180);
    assert.equal(ui.querySelectorAll('.question').length, 2);
  } finally { dom.window.close(); }
});
test('开放 Shadow DOM 内的提问与项目可发现，项目可隐藏恢复', async () => {
  const { dom, doc, ui } = await setup({}, {html:'<main></main>'});
  try {
    const container = doc.createElement('div');
    const shadow = container.attachShadow({mode:'open'});
    shadow.innerHTML = '<nav><div id="project"><a href="/g/g-p-shadow/project">内嵌项目</a></div></nav><article data-turn="user">Shadow DOM 问题</article>';
    doc.body.append(container); await wait(180);
    assert.equal(ui.querySelectorAll('.question').length, 1);
    assert.equal(ui.querySelector('.label').textContent, 'Shadow DOM 问题');
    ui.querySelector('[data-tab="projects"]').click();
    ui.querySelector('.project button').click();
    assert.ok(shadow.querySelector('#project').classList.contains('cgt-hidden-project'));
    assert.ok(shadow.querySelector('[data-cgt-scope-style]'));
    ui.querySelector('.project button').click();
    assert.ok(!shadow.querySelector('#project').classList.contains('cgt-hidden-project'));
  } finally { dom.window.close(); }
});




test('空节点、提示词图标与输入区不作为附件提问', async () => {
  const {dom, ui} = await setup({}, {html:'<main><div data-turn="user"></div><div class="user-message-bubble-color"><svg></svg></div><form><div data-turn="user">输入区文本</div></form><div data-turn="user"><img src="photo.png"></div></main>'});
  try {
    assert.equal(ui.querySelectorAll('.label').length, 1);
    assert.equal(ui.querySelector('.label').textContent, '图片或附件提问');
  } finally { dom.window.close(); }
});
test('空的预格式化子节点不覆盖实际文字', async () => {
  const {dom, ui} = await setup({}, {html:'<main><div data-turn="user"><div class="whitespace-pre-wrap"></div><p>真正的问题正文</p><button>复制</button></div></main>'});
  try { assert.equal(ui.querySelector('.label').textContent, '真正的问题正文'); }
  finally { dom.window.close(); }
});
test('用户消息文字位于 Shadow DOM 时仍能读取', async () => {
  const {dom, doc, ui} = await setup({}, {html:'<main></main>'});
  try {
    const message = doc.createElement('div'); message.dataset.turn = 'user';
    const shadow = message.attachShadow({mode:'open'}); shadow.innerHTML = '<p>组件内的问题文字</p>';
    doc.querySelector('main').append(message); await wait(180);
    assert.equal(ui.querySelector('.label').textContent, '组件内的问题文字');

  } finally { dom.window.close(); }
});





test('切换对话时清空旧目录，保留在 DOM 中的上一页不混入新对话', async () => {
  const {dom, doc, ui, win} = await setup({}, {html:'<main id="old"><div class="rich-text-user-turn">旧对话问题</div></main>'});
  try {
    assert.equal(ui.querySelector('.label').textContent, '旧对话问题');
    win.history.pushState({}, '', '/c/chat-two');
    // React may keep the old page mounted while the new page loads.
    doc.querySelector('#old').setAttribute('aria-hidden','true');
    const next = doc.createElement('main'); next.id = 'new';
    next.innerHTML = '<div class="rich-text-user-turn">新对话问题</div>';
    doc.body.append(next); await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent), ['新对话问题']);
    doc.querySelector('#old').removeAttribute('aria-hidden');
    next.setAttribute('aria-hidden','true');
    win.history.pushState({}, '', '/c/chat-one');
    await wait(160);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent), ['旧对话问题']);
  } finally {dom.window.close();}
});
test('URL先变化而旧页面暂未卸载时，不重新填回旧消息', async () => {
  const {dom, doc, ui, win} = await setup();
  try {
    win.history.pushState({}, '', '/c/chat-two');
    await wait(160);
    assert.equal(ui.querySelectorAll('.label').length, 0);
    doc.querySelector('main').innerHTML='<div data-turn="user">新对话加载完成</div>';
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent), ['新对话加载完成']);
  } finally {dom.window.close();}
});

test('隐藏或移出视口的旧页面不混入目录，当前页屏幕外的提问仍保留', async () => {
  const {dom, doc, ui, win} = await setup({}, {html:'<main id="current"><div class="rich-text-user-turn">当前提问一</div><div class="rich-text-user-turn">当前提问二</div></main><main style="display:none"><div class="rich-text-user-turn">隐藏页旧提问</div></main>'});
  try {
    const old = doc.createElement('main'); old.innerHTML='<div class="rich-text-user-turn">横向移出的旧页面</div>';
    old.getClientRects = () => [{}]; old.getBoundingClientRect = () => ({left:-1200,right:-100,top:0,bottom:800,width:1100,height:800});
    doc.body.append(old);
    const messages = doc.querySelectorAll('#current .rich-text-user-turn');
    messages[0].getBoundingClientRect=()=>({top:-3000,bottom:-2900});
    messages[1].getBoundingClientRect=()=>({top:3000,bottom:3100});
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent), ['当前提问一','当前提问二']);
  } finally {dom.window.close();}
});
test('只有 URL 变化时自动清空，复用节点更新后加载新提问', async () => {
  const {dom, doc, ui, win} = await setup({}, {html:'<main><div class="rich-text-user-turn">旧问题</div></main>'});
  try {
    win.history.pushState({}, '', '/c/another-chat');
    await wait(160);
    assert.equal(ui.querySelectorAll('.label').length,0);
    doc.querySelector('.rich-text-user-turn').textContent='新问题';
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['新问题']);
  } finally {dom.window.close();}
});

test('加载时只显示加载状态，界面不再包含调试入口', async () => {
  const {dom, ui} = await setup({}, {html:'<main></main>',pendingStorage:true});
  try {
    assert.match(ui.querySelector('.body').textContent,/正在加载对话/);
    assert.ok(!/选取|检测|匹配/.test(ui.querySelector('.body').textContent));
    assert.equal(ui.querySelector('.tools'),null);
    assert.equal(ui.querySelector('.more'),null);
    assert.equal(ui.querySelector('.diagnose'),null);
    assert.equal(ui.querySelector('.add-question'),null);
    assert.equal(ui.querySelector('footer'),null);
  } finally {dom.window.close();}
});
test('虚拟列表卸载历史节点不减少目录，再挂载同一轮次不重复', async () => {
  const {dom, ui, doc} = await setup({}, {html:'<main><div data-turn-key="t3" class="rich-text-user-turn">问题三</div><div data-turn-key="t4" class="rich-text-user-turn">问题四</div></main>'});
  try {
    const main = doc.querySelector('main');
    main.insertAdjacentHTML('afterbegin','<div data-turn-key="t1" class="rich-text-user-turn">问题一</div><div data-turn-key="t2" class="rich-text-user-turn">问题二</div>');
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['问题一','问题二','问题三','问题四']);
    const keys = [...ui.querySelectorAll('.question')].map(node=>node.dataset.key);
    main.innerHTML='<div data-turn-key="t4" class="rich-text-user-turn">问题四</div>';
    await wait(180);
    assert.equal(ui.querySelectorAll('.label').length,4);
    assert.deepEqual([...ui.querySelectorAll('.question')].map(node=>node.dataset.key),keys);
    main.innerHTML='<div data-turn-key="t1" class="rich-text-user-turn">问题一</div><div data-turn-key="t2" class="rich-text-user-turn">问题二</div>';
    await wait(180);
    assert.equal(ui.querySelectorAll('.label').length,4);
    assert.ok([...ui.querySelectorAll('.number')].every(node=>node.textContent==='·'));
  } finally {dom.window.close();}
});
test('相同文字但不同轮次的问题保留两条，刷新节点后身份不变', async () => {
  const html='<main><div data-turn-key="one" class="rich-text-user-turn">继续</div><div data-turn-key="two" class="rich-text-user-turn">继续</div></main>';
  const {dom, ui, doc} = await setup({}, {html});
  try {
    assert.equal(ui.querySelectorAll('.label').length,2);
    const keys=[...ui.querySelectorAll('.question')].map(node=>node.dataset.key);
    doc.querySelector('main').innerHTML='<div data-turn-key="two" class="rich-text-user-turn">继续</div>';
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.question')].map(node=>node.dataset.key),keys);
  } finally {dom.window.close();}
});
test('缓存目录仍按当前对话隔离', async () => {
  const {dom, ui, doc, win} = await setup({}, {html:'<main><div data-turn-key="one" class="rich-text-user-turn">旧对话</div></main>'});
  try {
    doc.querySelector('main').replaceChildren(); await wait(180);
    assert.equal(ui.querySelectorAll('.label').length,1);
    win.history.pushState({},'', '/c/new-chat');
    await wait(160);
    assert.equal(ui.querySelectorAll('.label').length,0);
    doc.querySelector('main').innerHTML='<div data-turn-key="one" class="rich-text-user-turn">新对话</div>';
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['新对话']);
  } finally {dom.window.close();}
});

test('点击已卸载问题时滚动恢复，并定位到重新挂载的正确节点', async () => {
  const {dom, ui, doc, win} = await setup({}, {html:'<main><div data-app-action-timeline-scroll><div data-turn-key="t1" class="rich-text-user-turn">历史问题</div><div data-turn-key="t2" class="rich-text-user-turn">近期问题</div></div></main>'});
  try {
    const scroller=doc.querySelector('[data-app-action-timeline-scroll]');
    scroller.innerHTML='<div data-turn-key="t2" class="rich-text-user-turn">近期问题</div>';
    await wait(180);
    let scrolled = 0;
    Object.defineProperty(scroller,'scrollTop',{configurable:true,get:()=>scrolled,set:value=>{
      scrolled=value;
      if (!scroller.querySelector('[data-turn-key="t1"]')) scroller.insertAdjacentHTML('afterbegin','<div data-turn-key="t1" class="rich-text-user-turn">历史问题</div>');
    }});
    ui.querySelectorAll('.question')[0].click();
    await wait(200);
    assert.ok(scrolled < 0);
    assert.equal(scroller.querySelector('[data-turn-key="t1"]').scrolled.block,'center');
    assert.equal(ui.querySelector('.notice').textContent,'');
    assert.equal(ui.querySelectorAll('.label').length,2);
  } finally {dom.window.close();}
});
test('没有稳定轮次标记时也保留已加载的问题，不因重复挂载而增加', async () => {
  const {dom, ui, doc} = await setup({}, {html:'<main><div class="rich-text-user-turn">较早问题</div><div class="rich-text-user-turn">较晚问题</div></main>'});
  try {
    doc.querySelector('main').innerHTML='<div class="rich-text-user-turn">较晚问题</div>';
    await wait(180);
    assert.equal(ui.querySelectorAll('.label').length,2);
    doc.querySelector('main').innerHTML='<div class="rich-text-user-turn">较早问题</div>';
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['较早问题','较晚问题']);
  } finally {dom.window.close();}
});

test('顶部插入历史问题时保持目录内原有阅读锚点', async () => {
  const {dom, doc, ui, win} = await setup({}, {html:'<main><div data-turn-key="t2" class="rich-text-user-turn">二</div><div data-turn-key="t3" class="rich-text-user-turn">三</div><div data-turn-key="t4" class="rich-text-user-turn">四</div></main>'});
  try {
    const body=ui.querySelector('.body');
    body.getBoundingClientRect=()=>({top:100});
    const original=win.HTMLElement.prototype.getBoundingClientRect;
    win.HTMLElement.prototype.getBoundingClientRect=function(){
      if (this.classList.contains('question')) {
        const i=[...ui.querySelectorAll('.question')].indexOf(this);
        return {top:100+i*20-body.scrollTop,bottom:120+i*20-body.scrollTop};
      }
      return original.call(this);
    };
    const replace=body.replaceChildren.bind(body);
    body.replaceChildren=(...nodes)=>{replace(...nodes);body.scrollTop=0;};
    body.scrollTop=40;
    doc.querySelector('main').insertAdjacentHTML('afterbegin','<div data-turn-key="t1" class="rich-text-user-turn">一</div>');
    await wait(180);
    assert.equal(body.scrollTop,60);
  } finally {dom.window.close();}
});

test('移除调试界面后仍加载以前保存的多种识别规则', async () => {
  const {dom, ui} = await setup({}, {
    rule:'.custom-human-content, [data-test-id="human-question"]',
    html:'<main><div class="rich-text-user-turn">默认结构</div><div class="custom-human-content">已保存规则一</div><div data-test-id="human-question">已保存规则二</div></main>'
  });
  try {
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['默认结构','已保存规则一','已保存规则二']);
    assert.ok(!/检测|补充识别|页面检测|选取/.test(ui.textContent));
  } finally {dom.window.close();}
});

test('目录提示使用新文案，悬浮和键盘聚焦均展示完整问题', async () => {
  const full='这是一个较长的问题，'.repeat(25)+'最后一句也应完整展示。';
  const {dom, ui, win} = await setup({}, {html:`<main><div class="rich-text-user-turn">${full}</div></main>`});
  try {
    assert.equal(ui.querySelector('.note').textContent,'已加载1个问题，点击跳转');
    const button=ui.querySelector('.question'), preview=ui.querySelector('[role="tooltip"]');
    assert.equal(preview.hidden,true);
    button.dispatchEvent(new win.MouseEvent('mouseenter'));
    assert.equal(preview.hidden,false);
    assert.equal(preview.textContent,full);
    assert.equal(button.getAttribute('aria-describedby'),preview.id);
    button.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(preview.hidden,true);
    button.dispatchEvent(new win.FocusEvent('focus'));
    assert.equal(preview.textContent,full);
    assert.equal(preview.hidden,false);
    button.click(); assert.equal(preview.hidden,true);
  } finally {dom.window.close();}
});

test('新版页面将侧栏放在 main 内时仍识别项目，隐藏不会移除整个主区域', async () => {
  const {dom, ui, doc} = await setup({}, {html:'<main data-app-shell-main-surface><div role="navigation"><div id="item"><a href="/g/g-p-inside-main/project">主区域里的侧栏项目</a></div></div><article><div class="rich-text-user-turn"><a href="/g/g-p-reference/project">正文引用项目</a></div></article></main>'});
  try {
    ui.querySelector('[data-tab="projects"]').click();
    assert.equal(ui.querySelectorAll('.project').length,1);
    assert.equal(ui.querySelector('.project a').textContent,'主区域里的侧栏项目');
    ui.querySelector('.project button').click();
    assert.ok(doc.querySelector('#item').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('main').classList.contains('cgt-hidden-project'));
  } finally {dom.window.close();}
});

test('用户实际项目路径可识别，主区域容器不会因隐藏项目而消失', async () => {
  const path='/g/g-p-6a2a28707ea08191b4a090dd495941fb/project';
  const {dom,ui,doc} = await setup({}, {html:`<main data-app-shell-main-surface><a href="${path}" aria-label="课程项目"></a></main>`});
  try {
    ui.querySelector('[data-tab="projects"]').click();
    assert.equal(ui.querySelector('.project a').getAttribute('href'),path);
    assert.equal(ui.querySelector('.project a').textContent,'课程项目');
    ui.querySelector('.project button').click();
    assert.ok(doc.querySelector('main > a').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('main').classList.contains('cgt-hidden-project'));
    ui.querySelector('.project button').click();
    assert.ok(!doc.querySelector('main > a').classList.contains('cgt-hidden-project'));
  } finally {dom.window.close();}
});

test('页面标题中的项目链接不进入项目列表，也不受隐藏状态影响', async () => {
  const hidden={hidden:{'g-p-active':{title:'当前项目',href:'/g/g-p-active/project'}},collapsed:false};
  const {dom,ui,doc}=await setup(hidden,{html:'<main><header><a id="heading" href="/g/g-p-active/project">当前项目</a></header><nav><div id="side-active"><a href="/g/g-p-active/project">当前项目</a></div><div><a href="/g/g-p-other/project">其他项目</a></div></nav></main>'});
  try {
    assert.ok(!doc.querySelector('#heading').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('header').classList.contains('cgt-hidden-project'));
    assert.equal(doc.querySelector('header .cgt-hide-project'),null);
    assert.ok(doc.querySelector('#side-active').classList.contains('cgt-hidden-project'));
    ui.querySelector('[data-tab="projects"]').click();
    assert.equal(ui.querySelectorAll('.project').length,2);
  } finally {dom.window.close();}
});

test('按实际侧栏 div 项目行识别所有项目，隐藏整个项目及子对话，恢复与重绘有效', async () => {
  const html=fs.readFileSync('tests/fixtures/sidebar-projects.html','utf8');
  const {dom,doc,ui,saved}=await setup({}, {html});
  try {
    ui.querySelector('[data-tab="projects"]').click();
    assert.equal(ui.querySelectorAll('.project').length,7);
    assert.deepEqual([...ui.querySelectorAll('.project a')].map(node=>node.textContent), Array.from({length:7},(_,i)=>'示例项目'+(i+1)));
    const projectRow=doc.querySelector('[data-app-action-sidebar-project-id="g-p-fixture-1"]');
    const group=projectRow.closest('[data-sidebar-project-kind]');
    const item=group.closest('[role="listitem"]');
    const expanded=group.querySelector('[role="list"]');
    assert.ok(expanded);
    [...ui.querySelectorAll('.project')].find(row=>row.querySelector('a').textContent==='示例项目2').querySelector('button').click();
    assert.ok(item.classList.contains('cgt-hidden-project'));
    assert.equal(expanded.closest('.cgt-hidden-project'),item);
    assert.ok(!doc.querySelector('main').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('header').classList.contains('cgt-hidden-project'));
    assert.ok(!doc.querySelector('#project-title').classList.contains('cgt-hidden-project'));
    assert.equal(doc.querySelectorAll('.cgt-hidden-project').length,1);
    assert.ok(saved().hidden['g-p-fixture-1']);
    const replacement=item.cloneNode(true); replacement.classList.remove('cgt-hidden-project'); item.replaceWith(replacement);
    await wait(180);
    assert.ok(replacement.classList.contains('cgt-hidden-project'));
    [...ui.querySelectorAll('.project')].find(row=>row.querySelector('a').textContent==='示例项目2').querySelector('button').click();
    assert.ok(!replacement.classList.contains('cgt-hidden-project'));
    assert.equal(ui.querySelectorAll('.project').length,7);
    assert.equal(doc.querySelectorAll('.cgt-hidden-project').length,0);
  } finally {dom.window.close();}
});

test('实际新版用户气泡可直接识别，并按消息单元标识保留历史与隔离对话', async () => {
  const question=(key,text)=>`<div class="w-full" data-content-search-unit-key="${key}"><div class="group/user-message"><div data-user-message-bubble="true" class="bg-user-message text-user-message"><div><div data-search-result-target=""><div><div class="text-size-chat whitespace-pre-wrap" dir="auto">${text}</div></div></div></div></div><div class="turn-action-controls"><button aria-label="复制消息">复制</button><button aria-label="编辑消息">编辑</button></div></div></div>`;
  const {dom,doc,ui,win}=await setup({}, {html:`<main>${question('fallback-turn-0:0:user','如何快速找到一个数组的中位数？')}${question('fallback-turn-1:0:user','继续')}<div data-content-search-unit-key="fallback-turn-1:1:assistant">助手回复</div></main>`});
  try {
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['如何快速找到一个数组的中位数？','继续']);
    const keys=[...ui.querySelectorAll('.question')].map(node=>node.dataset.key);
    assert.ok(keys[0].startsWith('local:'));
    doc.querySelector('main').innerHTML=question('fallback-turn-1:0:user','继续');
    await wait(180);
    assert.equal(ui.querySelectorAll('.label').length,2);
    assert.deepEqual([...ui.querySelectorAll('.question')].map(node=>node.dataset.key),keys);
    doc.querySelector('main').insertAdjacentHTML('beforeend',question('fallback-turn-2:0:user','继续'));
    await wait(180);
    assert.equal(ui.querySelectorAll('.label').length,3);
    win.history.pushState({},'', '/c/different-conversation');
    doc.querySelector('main').innerHTML=question('fallback-turn-0:0:user','新对话的问题');
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['新对话的问题']);
  } finally {dom.window.close();}
});

test('当前提供的纯气泡 HTML 无须旧类名即可识别', async () => {
  const {dom,ui}=await setup({}, {html:'<main><div data-user-message-bubble="true" class="bg-user-message text-user-message min-w-0 overflow-hidden bubble-vBnidZ"><div class="flex flex-col items-end gap-1"><div class="relative w-full min-w-0 text-size-chat leading-relaxed"><div data-search-result-target=""><div><div class="text-size-chat whitespace-pre-wrap" dir="auto">浏览器插件是需要单独审核报备的嘛？还是说传到GitHub上就可以让别人用了</div></div></div></div></div></div></main>'});
  try {assert.equal(ui.querySelector('.label').textContent,'浏览器插件是需要单独审核报备的嘛？还是说传到GitHub上就可以让别人用了');}
  finally {dom.window.close();}
});
test('重新加载历史时重复的 fallback 搜索索引不能覆盖不同提问', async () => {
  const bubble=text=>`<div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble="true"><div class="whitespace-pre-wrap">${text}</div></div></div>`;
  const {dom,doc,ui}=await setup({}, {html:'<main>'+bubble('原有的问题')+'</main>'});
  try {
    doc.querySelector('main').innerHTML=bubble('另一个加载出来的问题');
    await wait(180);
    assert.deepEqual([...ui.querySelectorAll('.label')].map(node=>node.textContent),['原有的问题','另一个加载出来的问题']);
  } finally {dom.window.close();}
});
