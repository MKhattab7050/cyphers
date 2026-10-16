/* =========================================================
   Cyphers Chat — Mobile behavior (mobile.js)
   حمّله بعد chat-script.js. مش بيغيّر منطق الشات، بس بيتحكم في الشاشات.
   ========================================================= */
(function () {
  'use strict';

  var mq = window.matchMedia('(max-width: 768px)');
  var app = document.querySelector('.chat-app');
  if (!app) return;

  var isMobile = function () { return mq.matches; };

  /* ---------- فتح / قفل شاشة الشات ---------- */
  function openChat() {
    if (!isMobile() || app.classList.contains('chat-open')) return;
    app.classList.add('chat-open');
    history.pushState({ chat: true }, '');          // زرار/إيماءة الرجوع في الموبايل
    var box = document.getElementById('chat-box');
    if (box) setTimeout(function () { box.scrollTop = box.scrollHeight; }, 300);
  }

  function closeChat(fromPop) {
    if (!app.classList.contains('chat-open')) return;
    app.classList.remove('chat-open');
    closePickers();
    if (!fromPop && history.state && history.state.chat) history.back();
  }

  function closePickers() {
    var ep = document.getElementById('emoji-picker');
    if (ep) ep.classList.remove('show');
    var input = document.getElementById('chat-input');
    if (input) input.blur();
  }

  window.addEventListener('popstate', function () { closeChat(true); });
  mq.addEventListener('change', function () {
    if (!isMobile()) app.classList.remove('chat-open');
  });

  /* ---------- زر رجوع في الهيدر ---------- */
  var header = document.querySelector('.chat-header');
  if (header && !header.querySelector('.mobile-back')) {
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'mobile-back';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = '<i class="fas fa-arrow-left"></i>';
    back.addEventListener('click', function () { closeChat(false); });
    header.insertBefore(back, header.firstChild);
  }

  /* ---------- أي ضغطة على غرفة / AI / صديق تفتح الشات ----------
     (بنستخدم capture وبنسيب الـ handlers الأصلية تشتغل عادي) */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('.room-btn') || t.closest('#askAIButton') ||
        t.closest('.friend-item .fa-comment')) {
      openChat();
    }
  }, true);

  /* ---------- حروف أول الاسم للأصدقاء (أفاتار) ---------- */
  var colors = ['#4a6cff', '#ff6b6b', '#10b981', '#a855f7', '#f59e0b', '#06b6d4'];
  function addAvatars() {
    document.querySelectorAll('.friend-item').forEach(function (item) {
      if (item.querySelector('.mobile-avatar') || item.querySelector('.friend-avatar')) return;
      var nameEl = item.querySelector('.friend-name');
      var name = nameEl ? nameEl.textContent.trim() : '';
      if (!name) return;
      var av = document.createElement('div');
      av.className = 'mobile-avatar';
      av.textContent = name.charAt(0).toUpperCase();
      av.style.background = colors[name.charCodeAt(0) % colors.length];
      item.insertBefore(av, item.firstChild);
    });
  }
  addAvatars();

  /* ---------- ضغطة على رسالة = تظهر أزرارها (رد / رياكشن / حذف) ---------- */
  var chatBox = document.getElementById('chat-box');
  if (chatBox) {
    chatBox.addEventListener('click', function (e) {
      if (!isMobile()) return;
      if (e.target.closest('.message-actions, .reply-overlay, .message-media, a, button')) return;
      var msg = e.target.closest('.message');
      var prev = chatBox.querySelector('.message.show-actions');
      if (prev && prev !== msg) prev.classList.remove('show-actions');
      if (msg) msg.classList.toggle('show-actions');
    });
  }

  /* ---------- الكيبورد: خلّي التطبيق بحجم المساحة المرئية ---------- */
  var vv = window.visualViewport;
  function syncViewport() {
    if (!vv || !isMobile()) return;
    var root = document.documentElement.style;
    root.setProperty('--vvh', vv.height + 'px');
    root.setProperty('--vvt', vv.offsetTop + 'px');
    if (chatBox && app.classList.contains('chat-open')) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }
  if (vv) {
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    syncViewport();
  }

  /* ---------- لما تفتح الإيموجي اقفل الكيبورد ---------- */
  var emojiBtn = document.getElementById('emoji-btn');
  if (emojiBtn) {
    emojiBtn.addEventListener('click', function () {
      if (isMobile()) { var i = document.getElementById('chat-input'); if (i) i.blur(); }
    });
  }

  /* ---------- بعد الإرسال سيب الكيبورد مفتوح (زي واتساب) ---------- */
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var sendBtn = document.getElementById('send-btn');
  if (sendBtn && input) {
    sendBtn.addEventListener('pointerdown', function (e) {
      if (isMobile()) e.preventDefault();           // مايسحبش الفوكس من الخانة
    });
  }
  if (form && input) {
    form.addEventListener('submit', function () {
      if (isMobile()) setTimeout(function () { input.focus(); }, 0);
    });
  }
})();
