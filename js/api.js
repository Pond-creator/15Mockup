var API_URL = 'https://script.google.com/macros/s/AKfycbwwquk7dOo8DZN5TUXTVpbSBdC-FMMSMeS89YkB8usDM5xncJj1wAoxg5XSJaiA32eZzA/exec';
// ต้องตรงกับ API_SECRET ใน gas/Code.gs เป๊ะๆ — เปลี่ยนทั้งสองที่พร้อมกันก่อน deploy จริง
var API_SECRET = '61DCROZSKOyko7qUXZD36FInWGz5pVv';

// ===== ตัดรอบที่ค้าง + ลองใหม่อัตโนมัติ (timeout + retry) =====
// Apps Script ของ Google "สุ่มค้าง" เป็นบางครั้ง: ตอนดีตอบ ~2 วิ ตอนเพี้ยนค้าง 30-60 วิ แล้วคาย 302/404
// วัดจริง 22/09/2569 ด้วย curl (ไม่ผ่านโค้ดนี้เลย): URL เดิมคำสั่งเดิม สลับได้ตั้งแต่ 1.7 วิ ถึง 34 วิ
// -> เป็นปัญหาฝั่ง Google ไม่ใช่โค้ดนี้ (ดูบันทึก feedback_gas_random_404)
// กลยุทธ์ที่ใช้: รอเกิน 15 วิ = ตัดทิ้งแล้วยิงใหม่ เพราะรอบใหม่มักได้ ~2 วิ (เร็วกว่ารอรอบที่ค้างจนจบ)
var REQUEST_TIMEOUT_MS = 15000;   // ตัดรอบที่ค้างทิ้งที่ 15 วิ
var RETRY_MAX = 2;                // ลองใหม่อีก 2 ครั้ง (รวม 3 โอกาส ~สำเร็จ 94%) แย่สุดรอ ~48 วิ
var RETRY_GAP_MS = 1200;          // เว้นระหว่างแต่ละครั้ง
// คำสั่งเขียนข้อมูลที่ retry ไม่ได้ ให้เวลายาวกว่า - กันตัดทิ้งทั้งที่ server เขียนสำเร็จไปแล้ว
// (ถ้าตัดเร็วจะขึ้น error ทั้งที่ข้อมูลเข้าชีตแล้ว ผู้ใช้จะกดซ้ำจนได้ข้อมูลซ้ำ)
var WRITE_TIMEOUT_MS = 60000;

// คำสั่ง POST ที่ยิงซ้ำได้อย่างปลอดภัย (ไม่ appendRow ไม่สร้างแถวใหม่ในชีต)
// ห้ามเติม addLink/addUser เข้ามา - สองตัวนี้ใช้ appendRow ยิงซ้ำจะได้ข้อมูลซ้ำในชีต
var RETRY_SAFE_POST = ['login', 'logoutUser'];

// fetch พร้อมนาฬิกาจับเวลา - เกินเวลาแล้วยกเลิกคำขอนั้นทิ้ง
function fetchWithTimeout(url, options, timeoutMs) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
  var opts = Object.assign({}, options || {}, { signal: ctrl.signal });
  return fetch(url, opts).then(function (r) {
    clearTimeout(timer);
    // 302/404 ที่ Google คายออกมาตอนเพี้ยน ก็นับเป็นความผิดพลาด ให้ไปลองใหม่
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();   // ถ้าได้หน้า error HTML ของ Google มาแทน JSON ตัวนี้จะ throw เอง
  }).catch(function (err) {
    clearTimeout(timer);
    throw err;
  });
}

// ลองซ้ำได้สูงสุด RETRY_MAX ครั้ง - ใช้เฉพาะคำสั่งที่ยิงซ้ำแล้วข้อมูลไม่เพี้ยน
function fetchWithRetry(url, options, timeoutMs, attemptsLeft) {
  if (attemptsLeft === undefined) attemptsLeft = RETRY_MAX;
  return fetchWithTimeout(url, options, timeoutMs).catch(function (err) {
    if (attemptsLeft <= 0) throw err;
    return new Promise(function (resolve) { setTimeout(resolve, RETRY_GAP_MS); })
      .then(function () { return fetchWithRetry(url, options, timeoutMs, attemptsLeft - 1); });
  });
}

// ทุกคำขอ (นอกจาก login) แนบตัวตนของ session ปัจจุบันไปด้วยเสมอ ผ่านชื่อ field พิเศษ "_authUser"/"_authToken"
// (ตั้งใจใช้ชื่อไม่ซ้ำกับ field ธรรมดา — เคยใช้ชื่อ username/token เฉยๆ แล้วชนกับ payload ของ addUser/editUser/deleteUser
//  ที่ก็มี field ชื่อ "username" สำหรับ "user เป้าหมายที่กำลังจัดการ" เหมือนกัน ทำให้ค่าทับกันจนตรวจสอบสิทธิ์ผิดคน)
// backend เช็ค token กับที่ออกให้ตอน login จริง — ไม่เชื่อ role ที่ client ส่งมาอ้างเองอีกต่อไป
function apiGet(action, params) {
  var s = getSession();
  var url = API_URL + '?action=' + encodeURIComponent(action) + '&secret=' + encodeURIComponent(API_SECRET);
  if (s) url += '&_authUser=' + encodeURIComponent(s.username) + '&_authToken=' + encodeURIComponent(s.token || '');
  if (params) {
    for (var k in params) url += '&' + k + '=' + encodeURIComponent(params[k]);
  }
  // GET = อ่านอย่างเดียว ยิงซ้ำกี่ครั้งก็ไม่กระทบข้อมูล - retry ได้เต็มที่
  return fetchWithRetry(url, null, REQUEST_TIMEOUT_MS).then(handleSessionExpiry);
}

function apiPost(action, payload) {
  var s = getSession();
  var auth = s ? { _authUser: s.username, _authToken: s.token } : {};
  var body = Object.assign({ action: action, secret: API_SECRET }, auth, payload || {});
  var options = { method: 'POST', body: JSON.stringify(body) };
  // คำสั่งที่ยิงซ้ำปลอดภัย (login/logout) -> ตัดที่ 15 วิ + ลองใหม่อัตโนมัติ
  // คำสั่งเขียนข้อมูลอื่นๆ -> รอได้ถึง 60 วิ แต่ยิงครั้งเดียว (กันข้อมูลซ้ำในชีต)
  var p = (RETRY_SAFE_POST.indexOf(action) !== -1)
    ? fetchWithRetry(API_URL, options, REQUEST_TIMEOUT_MS)
    : fetchWithTimeout(API_URL, options, WRITE_TIMEOUT_MS);
  return p.then(handleSessionExpiry);
}

/**
 * ตัวเลข % จำลองระหว่างรอโหลด (ไม่ใช่ % จริงเพราะเป็นแค่ 1 คำขอ แบ่งขั้นไม่ได้ — เหมือนที่ใช้ใน Premium Stat)
 * วิ่งเร็วตอนแรกแล้วค่อยๆ ช้าลง ค้างที่ 89% รอผลจริง แล้วค่อยกระโดดไป 100%
 * ใช้: const p = startFakeProgress(el); ... p.finish(); หรือ p.stop() ตอน error
 */
function startFakeProgress(el) {
  var pct = 0;
  var timer = setInterval(function () {
    pct += (90 - pct) * 0.08 + 0.3;
    if (pct > 89) pct = 89;
    el.textContent = Math.floor(pct) + '%';
  }, 150);
  return {
    finish: function () {
      clearInterval(timer);
      el.textContent = '100%';
    },
    stop: function () {
      clearInterval(timer);
    }
  };
}

// ถ้า backend บอกว่า token ไม่ถูกต้อง/หมดอายุ → เคลียร์ session แล้วเด้งไป login ทันที
// ถ้าคำขอสำเร็จปกติ → เลื่อนเวลาหมดอายุฝั่ง client ให้ตรงกับที่ server ต่ออายุให้ (sliding window)
function handleSessionExpiry(res) {
  if (res && res.success === false && /เซสชัน/.test(res.message || '')) {
    logout();
  } else if (res && res.success !== false) {
    touchSession();
  }
  return res;
}

function touchSession() {
  var s = getSession();
  if (!s || !s.token) return;
  s.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  setSession(s);
}

// เลิกรองรับ "จำฉันไว้" แล้ว — เก็บใน sessionStorage เท่านั้น (ปิดแท็บ/เบราว์เซอร์ = หลุด session ต้อง login ใหม่เสมอ)
function setSession(data) {
  sessionStorage.setItem('hubUser', JSON.stringify(data));
}

function getSession() {
  // เคลียร์ session แบบ "จำไว้" ของเก่าที่อาจค้างจาก localStorage (ฟีเจอร์นี้ถูกถอดออกแล้ว) — บังคับ login ใหม่เสมอ
  if (localStorage.getItem('hubUser')) localStorage.removeItem('hubUser');
  var raw = sessionStorage.getItem('hubUser');
  return raw ? JSON.parse(raw) : null;
}

function requireLogin() {
  var s = getSession();
  if (!s) {
    window.location.href = 'index.html';
    return null;
  }
  // เช็คหมดอายุฝั่ง client ก่อน (ประมาณการ ไม่ต้องรอ API ตอบ) — ไม่ใช้งานเกิน 8 ชม. ต้อง login ใหม่
  if (s.expiresAt && Date.now() > s.expiresAt) {
    logout();
    return null;
  }
  return s;
}

function logout() {
  var s = getSession();
  sessionStorage.removeItem('hubUser');
  localStorage.removeItem('hubUser');
  clearLinksCache();   // กันคนถัดไปที่ login เครื่อง/แท็บเดียวกัน เห็นลิงก์ค้างของคนก่อนหน้า
  if (s && s.username && s.token) {
    // แจ้ง server ให้ยกเลิก token ด้วย (fire-and-forget ไม่ต้องรอผลลัพธ์)
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'logoutUser', secret: API_SECRET, username: s.username, token: s.token })
    }).catch(function () {});
  }
  window.location.href = 'index.html';
}

// ===== แคชลิงก์สั้นๆ ฝั่งเบราว์เซอร์ (เฉพาะหน้า hub.html) =====
// เร่งความเร็ว "รู้สึกได้จริง" ตอนสลับหน้าไปมาบ่อยๆ ภายในไม่กี่วินาที โดยไม่เสี่ยงเห็นข้อมูลเก่าค้างนาน
// เพราะใช้แบบ stale-while-revalidate: โชว์ของแคชก่อนทันที (ไม่รอ) แล้วดึงของจริงมาอัปเดตเงียบๆ เบื้องหลังเสมอ
var LINKS_CACHE_KEY = 'hubLinksCache';
var LINKS_CACHE_TTL_MS = 45000;   // ใช้ของแคชได้ถ้าอายุไม่เกิน 45 วิ (เกินนี้ถือว่าเก่าเกินไป ไม่ใช้เลย)

function getLinksCache() {
  var s = getSession();
  if (!s) return null;
  try {
    var raw = sessionStorage.getItem(LINKS_CACHE_KEY);
    if (!raw) return null;
    var cache = JSON.parse(raw);
    if (cache.username !== s.username) return null;   // คนละ user ห้ามใช้แคชของกันและกัน
    if (Date.now() - cache.savedAt > LINKS_CACHE_TTL_MS) return null;
    return cache.data;
  } catch (e) {
    return null;
  }
}

function setLinksCache(data) {
  var s = getSession();
  if (!s) return;
  try {
    sessionStorage.setItem(LINKS_CACHE_KEY, JSON.stringify({ username: s.username, savedAt: Date.now(), data: data }));
  } catch (e) {
    /* เพิกเฉยถ้า storage เต็ม/ถูกปิดใช้งาน — แค่ไม่มีแคช ไม่กระทบการทำงานหลัก */
  }
}

function clearLinksCache() {
  sessionStorage.removeItem(LINKS_CACHE_KEY);
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
