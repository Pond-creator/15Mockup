var API_URL = 'https://script.google.com/macros/s/AKfycbwwquk7dOo8DZN5TUXTVpbSBdC-FMMSMeS89YkB8usDM5xncJj1wAoxg5XSJaiA32eZzA/exec';
// ต้องตรงกับ API_SECRET ใน gas/Code.gs เป๊ะๆ — เปลี่ยนทั้งสองที่พร้อมกันก่อน deploy จริง
var API_SECRET = '61DCROZSKOyko7qUXZD36FInWGz5pVv';

function apiGet(action, params) {
  var url = API_URL + '?action=' + encodeURIComponent(action) + '&secret=' + encodeURIComponent(API_SECRET);
  if (params) {
    for (var k in params) url += '&' + k + '=' + encodeURIComponent(params[k]);
  }
  return fetch(url).then(function (r) { return r.json(); });
}

function apiPost(action, payload) {
  var body = Object.assign({ action: action, secret: API_SECRET }, payload || {});
  return fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(body)
  }).then(function (r) { return r.json(); });
}

// "จำฉันไว้" ติ๊ก = เก็บใน localStorage (อยู่ข้ามการปิดเบราว์เซอร์ จนกว่าจะ logout เอง)
// ไม่ติ๊ก = เก็บใน sessionStorage (หายเมื่อปิดแท็บ) เหมือนเดิม
function setSession(data, remember) {
  var raw = JSON.stringify(data);
  if (remember) {
    localStorage.setItem('hubUser', raw);
    sessionStorage.removeItem('hubUser');
  } else {
    sessionStorage.setItem('hubUser', raw);
    localStorage.removeItem('hubUser');
  }
}

function getSession() {
  var raw = localStorage.getItem('hubUser') || sessionStorage.getItem('hubUser');
  return raw ? JSON.parse(raw) : null;
}

function requireLogin() {
  var s = getSession();
  if (!s) {
    window.location.href = 'index.html';
    return null;
  }
  return s;
}

function logout() {
  sessionStorage.removeItem('hubUser');
  localStorage.removeItem('hubUser');
  window.location.href = 'index.html';
}

// แทรกฉากอวกาศ (โลกหมุนช้าๆ) แล้วยิงดาวตกแบบสุ่ม นานๆ ที (เบามาก — element เดียวโผล่แล้วหายทีละดวง)
(function injectSpaceScene() {
  var pendingTimer = null;
  var impactTimer = null;

  function build() {
    if (document.querySelector('.shooting-stars')) return;
    var wrap = document.createElement('div');
    wrap.className = 'shooting-stars';
    wrap.innerHTML = '<div class="earth"></div>';
    document.body.appendChild(wrap);

    if (!document.hidden) { scheduleNextMeteor(wrap); scheduleImpact(wrap); }

    // แท็บถูกซ่อน (สลับไปแท็บอื่น) → animation จะหยุดค้างกลางอากาศ ไม่จบรอบ
    // ไม่เก็บดาวเก่าค้างไว้เป็นภาระ + ไม่ยิงดาวใหม่เพิ่มระหว่างซ่อน กลับมาเปิดค่อยเริ่มใหม่สะอาดๆ
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        if (impactTimer) { clearTimeout(impactTimer); impactTimer = null; }
      } else {
        wrap.querySelectorAll('.shooting-star, .impact-boom').forEach(function (s) { s.remove(); });
        scheduleNextMeteor(wrap);
        scheduleImpact(wrap);
      }
    });
  }

  function spawnMeteor(wrap) {
    var star = document.createElement('span');
    var isFireball = Math.random() < 0.22;   // ~1 ใน 5 ครั้ง เป็นอุกกาบาตใหญ่มีไฟ
    star.className = 'shooting-star' + (isFireball ? ' fireball' : '');
    // หัวดาว (ด้านสว่าง) อยู่ฝั่งซ้ายของแท่ง (local -x) ก่อนหมุน
    // ต้องหมุนแท่งให้ "หัว" ชี้ไปตามทิศที่มันจะเคลื่อนที่จริง ไม่งั้นจะดูลอยเฉียงๆ ไม่เป็นธรรมชาติ
    var goRight = Math.random() < 0.5;
    var fallAngle = 25 + Math.random() * 30;              // มุมตกจากแนวนอน 25-55 องศา (ค่าบวกเสมอ)
    var dist = (isFireball ? 480 : 380) + Math.random() * 260;
    var rad = fallAngle * Math.PI / 180;
    var dirX = goRight ? 1 : -1;
    var tx = dirX * Math.cos(rad) * dist;                 // ทิศเคลื่อนที่จริง (ซ้าย/ขวา + ลงเสมอ)
    var ty = Math.sin(rad) * dist;
    // มุมหมุนแท่งให้ "หัว" (local -x) ชี้ตรงกับเวกเตอร์ (tx,ty) พอดี
    var srot = goRight ? (fallAngle + 180) : (-fallAngle);
    star.style.setProperty('--sx', (Math.random() * 80 + 5) + '%');
    star.style.setProperty('--sy', (Math.random() * 25) + '%');
    star.style.setProperty('--srot', srot.toFixed(1) + 'deg');
    star.style.setProperty('--stx', tx.toFixed(0) + 'px');
    star.style.setProperty('--sty', ty.toFixed(0) + 'px');
    wrap.appendChild(star);
    star.addEventListener('animationend', function () { star.remove(); });
  }

  function scheduleNextMeteor(wrap) {
    var delay = 3000 + Math.random() * 6000;   // สุ่มถี่: ทุก 3-9 วิ ≈ 7-20 ดวง/นาที
    pendingTimer = setTimeout(function () {
      spawnMeteor(wrap);
      scheduleNextMeteor(wrap);
    }, delay);
  }

  // ===== อุกกาบาตพุ่งชนโลก แล้วระเบิด (เหตุการณ์พิเศษ นานๆ ที) =====
  function spawnImpact(wrap) {
    var earth = wrap.querySelector('.earth');
    if (!earth) return;
    var er = earth.getBoundingClientRect();
    var target = { x: er.left + er.width / 2, y: er.top + er.height / 2 };
    // จุดเริ่มบนขอบบนของจอ แล้วพุ่งเข้าหาเป้า
    var startX = window.innerWidth * (0.1 + Math.random() * 0.8);
    var startY = -20 + Math.random() * 40;
    var dx = target.x - startX;
    var dy = target.y - startY;
    var theta = Math.atan2(dy, dx) * 180 / Math.PI;   // ทิศพุ่งจริง
    var star = document.createElement('span');
    star.className = 'shooting-star fireball';
    star.style.left = startX.toFixed(0) + 'px';
    star.style.top = startY.toFixed(0) + 'px';
    star.style.setProperty('--srot', (theta - 180).toFixed(1) + 'deg');  // หัวชี้ตามทิศพุ่ง
    star.style.setProperty('--stx', dx.toFixed(0) + 'px');
    star.style.setProperty('--sty', dy.toFixed(0) + 'px');
    wrap.appendChild(star);
    star.addEventListener('animationend', function () {
      star.remove();
      boom(wrap, target.x, target.y);   // ถึงเป้าแล้วระเบิด
    });
  }

  function boom(wrap, x, y) {
    var b = document.createElement('div');
    b.className = 'impact-boom';
    b.style.left = x.toFixed(0) + 'px';
    b.style.top = y.toFixed(0) + 'px';
    wrap.appendChild(b);
    b.addEventListener('animationend', function (e) {
      if (e.animationName === 'boom') b.remove();   // เอาเฉพาะ animation หลัก (ไม่ใช่ของวงแหวน ::before)
    });
  }

  function scheduleImpact(wrap) {
    var delay = 30000 + Math.random() * 45000;   // นานๆ ที: ทุก 30-75 วินาที
    impactTimer = setTimeout(function () {
      spawnImpact(wrap);
      scheduleImpact(wrap);
    }, delay);
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();

// แทรกปุ่มแฮมเบอร์เกอร์ในแถบบน (มือถือ) + สลับเปิด/ปิดเมนู
(function injectMenuToggle() {
  function build() {
    var topbar = document.querySelector('.topbar');
    if (!topbar || topbar.querySelector('.topbar-toggle')) return;
    var btn = document.createElement('button');
    btn.className = 'topbar-toggle';
    btn.setAttribute('aria-label', 'เมนู');
    btn.innerHTML = '&#9776;';   // ☰
    btn.addEventListener('click', function () {
      topbar.classList.toggle('open');
    });
    // ปิดเมนูเมื่อกดลิงก์/ปุ่มในเมนู
    var info = topbar.querySelector('.user-info');
    if (info) {
      info.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) topbar.classList.remove('open');
      });
    }
    topbar.appendChild(btn);
  }
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
