/* The key desk (admin/index.html): product keys made, listed and revoked by people at Reloader. The sign-in is the
 * Reload OS Account's (the same one in this browser as the account page and Studio: one key in localStorage); whether
 * that account may use the desk is the server's word (its list of admins). The keys come only in the answers to the
 * signed-in admin and stay hidden on the page until "Show the keys" is ticked. Apps given to accounts are the account
 * server's (api/account/admin/apps, its own ADMIN_EMAILS): the section shows only to someone on that list. */
(function () {
  var box = document.getElementById('desk');
  if (!box) return;
  var ROOT = box.dataset.root, ACCOUNT = ROOT + 'api/account', DESK = ROOT + 'api/shop/admin', KEY = 'ros-studio-account';
  var account = null, keys = [], made = [], MAX_ROWS = 300;
  var $ = function (id) { return document.getElementById(id); };
  var SAY = { sign_in: 'Sign in again', not_admin: 'This account is not on the key desk\'s list', bad_note: 'Say who the keys are for',
    bad_count: '1 to 100 keys at a time', rate_limited: 'Too many for today: ask for a higher limit, or wait', bad_key: 'Not a product key',
    key_unknown: 'Not a key of this server', no_account_server: 'The account service does not answer: try again in a moment',
    not_found: 'Not found', upload_off: 'Publishing here is off on this server', not_newer: 'Not newer than the version on the server',
    not_tested: 'Only a file that ran on that board', bad_version: 'A Reload OS version is three numbers, like 1.5.10', too_large: 'The file is too large', bad_app: 'Not an app file', shop_closed: 'The shop is off on this server', 'Wrong email or password': 'Wrong email or password' };
  try { account = JSON.parse(localStorage.getItem(KEY)); } catch (e) { account = null; }

  /* ---------------------------------------------------------------- Thai
   * The page is written in English; TH has each text's Thai by the English one ({0}, {1}: what is put in). The choice
   * (the button at the top) is kept in this browser; Thai unless English was chosen. T() is for what this script
   * writes; the page's own texts and hints are swapped once, here. What the account server says stays as it says it. */
  var LANG = 'th';
  try { if (localStorage.getItem('ros-desk-lang') === 'en') LANG = 'en'; } catch (e) { /* Thai */ }
  var TH = {
    'Make product keys for a customer, see every key and who used it, the keys bought online, and manage the apps devices can get. For people at Reloader: sign in with a Reload OS Account that is on the desk\'s list.':
      'ออก product key ให้ลูกค้า ดู key ทั้งหมดและเครื่องที่ใช้ ดู key ที่ซื้อออนไลน์ และจัดการแอปของเครื่อง สำหรับทีม Reloader: ลงชื่อเข้าใช้ด้วย Reload OS Account ที่มีสิทธิ์',
    'This page needs JavaScript.': 'หน้านี้ต้องใช้ JavaScript', 'Loading…': 'กำลังโหลด…', 'Sign in': 'ลงชื่อเข้าใช้', 'Email': 'อีเมล', 'Password': 'รหัสผ่าน',
    'Signed in as': 'ลงชื่อเข้าใช้ในชื่อ', 'Sign out': 'ออกจากระบบ', 'Keys': 'Key', 'Bought online': 'ซื้อออนไลน์', 'Apps': 'แอป', 'Accounts': 'บัญชี',
    'Make keys': 'ออก key', 'How many': 'จำนวน', 'For whom - customer, invoice': 'สำหรับใคร - ลูกค้า, ใบแจ้งหนี้', 'Copy': 'คัดลอก', 'Copied': 'คัดลอกแล้ว',
    'Save as a text file': 'บันทึกเป็นไฟล์ข้อความ',
    'An unused key is worth an activation: hand these to that customer only.': 'key ที่ยังไม่ใช้ activate ได้หนึ่งเครื่อง: ส่งให้ลูกค้ารายนั้นเท่านั้น',
    'All': 'ทั้งหมด', 'Unused': 'ยังไม่ใช้', 'Used': 'ใช้แล้ว', 'Revoked': 'เพิกถอนแล้ว', 'Show the keys': 'แสดง key', 'Reload': 'โหลดใหม่',
    'State': 'สถานะ', 'Device': 'เครื่อง', 'Made': 'วันที่ออก', 'Note': 'หมายเหตุ', 'Order': 'คำสั่งซื้อ', 'Buyer': 'ผู้ซื้อ', 'Amount': 'ยอดเงิน', 'Mail': 'อีเมล',
    'Apps on the update server': 'แอปบนเซิร์ฟเวอร์อัปเดต',
    'Public: in Settings › Apps › Get apps on every device of that board. Not public: only on the devices of accounts it is given to (Accounts).':
      'Public: แสดงใน Settings › Apps › Get apps ของทุกเครื่องในบอร์ดนั้น ไม่ Public: เฉพาะเครื่องของบัญชีที่ได้รับแอป (แท็บบัญชี)',
    '+ New app or version': '+ แอปใหม่หรือรุ่นใหม่', 'Show all boards': 'แสดงทุกบอร์ด', 'Fold all': 'พับทั้งหมด',
    'Publishing here is off on this server.': 'เซิร์ฟเวอร์นี้ปิดการเผยแพร่จากหน้านี้', 'Public - on every device of that board': 'Public - ทุกเครื่องของบอร์ดนั้น',
    'This file ran on that board': 'ไฟล์นี้รันบนบอร์ดนั้นแล้ว', 'Publish': 'เผยแพร่', 'Cancel': 'ยกเลิก', 'New account: email': 'บัญชีใหม่: อีเมล', 'Name': 'ชื่อ',
    'Create': 'สร้าง', 'Apps of accounts': 'แอปของบัญชี',
    'An app given to an account shows in Settings › Apps › Get apps on its devices, beside the public ones. It must be published on the update server for the device\'s board.':
      'แอปที่ให้กับบัญชีจะแสดงใน Settings › Apps › Get apps ของเครื่องในบัญชีนั้น คู่กับแอป Public แอปต้องเผยแพร่บนเซิร์ฟเวอร์อัปเดตสำหรับบอร์ดของเครื่องก่อน',
    'Account\'s email': 'อีเมลของบัญชี', 'App': 'แอป', 'App id': 'id ของแอป', 'Give': 'ให้', 'Accounts without apps too': 'รวมบัญชีที่ไม่มีแอป',
    'Account': 'บัญชี', 'Last sign-in': 'เข้าใช้ล่าสุด', 'Devices': 'เครื่อง', 'Projects': 'โปรเจกต์',
    'Invoice 6711-042, Example Clinic': 'ใบแจ้งหนี้ 6711-042, คลินิกตัวอย่าง', 'Find: number, key, note, device': 'ค้นหา: เลข, key, หมายเหตุ, เครื่อง',
    'Find a key': 'ค้นหา key', 'Search apps and boards': 'ค้นหาแอปและบอร์ด', 'Find an app': 'ค้นหาแอป', 'Front desk': 'เคาน์เตอร์หน้า',
    'Find: email, name, app': 'ค้นหา: อีเมล, ชื่อ, แอป', 'Log': 'บันทึก', 'When': 'เมื่อ', 'Who': 'ใคร', 'What': 'ทำอะไร', 'Find: who, what': 'ค้นหา: ใคร, ทำอะไร',
    'Find in the log': 'ค้นหาในบันทึก', 'What was done at this desk, the newest first: keys by their numbers, never a key itself.': 'สิ่งที่ทำจากหน้านี้ ใหม่สุดอยู่บน: key แสดงเป็นเลข ไม่แสดงตัว key',
    '{0} deeds': '{0} รายการ', 'Nothing here yet.': 'ยังไม่มีรายการ', 'Find an account': 'ค้นหาบัญชี',
    /* what the servers answer */
    'Sign in again': 'ลงชื่อเข้าใช้ใหม่', 'This account is not on the key desk\'s list': 'บัญชีนี้ไม่มีสิทธิ์ใช้ Key desk', 'Say who the keys are for': 'ระบุว่า key สำหรับใคร',
    '1 to 100 keys at a time': 'ครั้งละ 1 ถึง 100 key', 'Too many for today: ask for a higher limit, or wait': 'เกินจำนวนของวันนี้: ขอเพิ่มเพดาน หรือรอ',
    'Not a product key': 'ไม่ใช่ product key', 'Not a key of this server': 'ไม่ใช่ key ของเซิร์ฟเวอร์นี้',
    'The account service does not answer: try again in a moment': 'บริการบัญชีไม่ตอบ: ลองใหม่อีกครู่', 'Not found': 'ไม่พบ',
    'Publishing here is off on this server': 'เซิร์ฟเวอร์นี้ปิดการเผยแพร่จากหน้านี้', 'Not newer than the version on the server': 'ไม่ใหม่กว่ารุ่นบนเซิร์ฟเวอร์',
    'Only a file that ran on that board': 'เฉพาะไฟล์ที่รันบนบอร์ดนั้นแล้ว', 'The file is too large': 'ไฟล์ใหญ่เกินไป', 'Not an app file': 'ไม่ใช่ไฟล์แอป', 'A Reload OS version is three numbers, like 1.5.10': 'รุ่นของ Reload OS เป็นเลขสามตัว เช่น 1.5.10',
    'needs Reload OS {0}': 'ต้องใช้ Reload OS {0} ขึ้นไป', 'any Reload OS': 'Reload OS ทุกรุ่น', 'The oldest Reload OS this app opens on': 'รุ่น Reload OS ขั้นต่ำที่เปิดแอปนี้ได้',
    'The oldest Reload OS {0} for {1} opens on, like 1.5.10. Empty: any.': 'รุ่น Reload OS ขั้นต่ำที่เปิด {0} บน {1} ได้ เช่น 1.5.10 เว้นว่าง: ทุกรุ่น',
    'The shop is off on this server': 'เซิร์ฟเวอร์นี้ปิดร้านอยู่', 'Wrong email or password': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'Sign in first': 'ลงชื่อเข้าใช้ก่อน',
    'This account may not use the key desk': 'บัญชีนี้ไม่มีสิทธิ์ใช้ Key desk', 'The mail could not be sent': 'ส่งอีเมลไม่ได้', 'The account is disabled': 'บัญชีถูกปิดอยู่',
    'An account of the key desk is not closed here': 'ปิดหรือลบบัญชีของ Key desk จากหน้านี้ไม่ได้',
    'The server answered {0}': 'เซิร์ฟเวอร์ตอบ {0}', 'The server does not answer': 'เซิร์ฟเวอร์ไม่ตอบ', 'There is no key desk on this server.': 'เซิร์ฟเวอร์นี้ไม่มี Key desk',
    /* keys and orders */
    '{0} key(s) for: {1} ({2})': '{0} key สำหรับ: {1} ({2})', 'Take back': 'ยกเลิกการเพิกถอน', 'Revoke': 'เพิกถอน',
    'Revoke key #{0}? It activates nothing any more - {1} keeps the license it got.': 'เพิกถอน key #{0}? key นี้จะ activate ไม่ได้อีก - {1} ยังใช้ license ที่ได้ไปแล้วต่อได้',
    'Revoke key #{0}? It activates nothing any more.': 'เพิกถอน key #{0}? key นี้จะ activate ไม่ได้อีก',
    'The first {0} of {1}: narrow it down with Find.': 'แสดง {0} รายการแรกจาก {1}: ใช้ช่องค้นหาเพื่อกรอง', 'No key here.': 'ไม่มี key',
    'unused': 'ยังไม่ใช้', 'used': 'ใช้แล้ว', 'revoked': 'เพิกถอนแล้ว', 'paid': 'ชำระแล้ว', 'pending': 'รอชำระ', 'expired': 'หมดเวลา', 'TAX INVOICE': 'ใบกำกับภาษี',
    'sent {0}': 'ส่งแล้ว {0}', 'NOT SENT': 'ยังไม่ได้ส่ง', 'Mail again': 'ส่งอีเมลอีกครั้ง', 'On its way': 'กำลังส่ง',
    '{0} unused · {1} used · {2} revoked': 'ยังไม่ใช้ {0} · ใช้แล้ว {1} · เพิกถอน {2}',
    /* the apps on the update server */
    '{0} versions': '{0} รุ่น', '{0} board': '{0} บอร์ด', '{0} boards': '{0} บอร์ด', 'Public': 'Public', '{0}/{1} public': 'Public {0}/{1}', 'Private': 'Private',
    '{0} for {1} is public': '{0} สำหรับ {1} เป็น Public', 'Public: every device of this board is offered it': 'Public: ทุกเครื่องของบอร์ดนี้เห็นแอป',
    'Private: only the accounts it is given to': 'Private: เฉพาะบัญชีที่ได้รับแอป', 'Show {0} {1} on every {2}?': 'แสดง {0} {1} บนทุกเครื่อง {2}?',
    'Take {0} off for {1}': 'ถอน {0} ออกจาก {1}',
    'Take {0} off for {1}? No device is offered it or an update of it any more; one that has it keeps it.': 'ถอน {0} ออกจาก {1}? เครื่องจะไม่เห็นแอปและอัปเดตของแอปนี้อีก เครื่องที่ติดตั้งแล้วยังใช้ต่อได้',
    '{0} app(s) · {1} public releases · {2} private': '{0} แอป · Public {1} รายการ · Private {2} รายการ', 'No app here.': 'ไม่มีแอป',
    'No app on the server yet.': 'ยังไม่มีแอปบนเซิร์ฟเวอร์', 'for {0}': 'สำหรับ {0}', '{0} there now': 'ตอนนี้มีรุ่น {0}', 'new there': 'ใหม่',
    'Not newer: raise its version.txt and build it again.': 'ไม่ใหม่กว่า: เพิ่มเลขใน version.txt แล้ว build ใหม่',
    'Publish {0} {1} for {2} - on every device of it?': 'เผยแพร่ {0} {1} สำหรับ {2} - ให้ทุกเครื่องเห็น?',
    'Publish {0} {1} for {2} - for the accounts it is given to?': 'เผยแพร่ {0} {1} สำหรับ {2} - เฉพาะบัญชีที่ได้รับแอป?',
    /* accounts */
    'Choose an app…': 'เลือกแอป…', 'Another id…': 'id อื่น…', 'disabled': 'ปิดอยู่', 'not confirmed': 'ยังไม่ยืนยัน', 'never (made {0})': 'ยังไม่เคย (สร้าง {0})',
    'Take {0} from {1}': 'เอา {0} ออกจาก {1}',
    'Take {0} from {1}? Its devices no longer list it in Get apps (one that has it keeps it).': 'เอา {0} ออกจาก {1}? เครื่องของบัญชีนี้จะไม่เห็นแอปใน Get apps อีก (เครื่องที่ติดตั้งแล้วยังใช้ต่อได้)',
    '+ app': '+ แอป', '{0} account(s) · {1} with apps of their own': '{0} บัญชี · {1} บัญชีมีแอปของตัวเอง', 'No account here.': 'ไม่มีบัญชี',
    'No account has an app of its own yet.': 'ยังไม่มีบัญชีที่มีแอปของตัวเอง', 'Manage {0}': 'จัดการ {0}', 'Manage…': 'จัดการ…', 'Confirm the address': 'ยืนยันอีเมลให้',
    'Send a new-password mail': 'ส่งอีเมลตั้งรหัสผ่านใหม่', 'Enable': 'เปิดบัญชี', 'Disable': 'ปิดบัญชี', 'Delete…': 'ลบ…',
    'Disable {0}? It is signed out and cannot sign in; its devices stay in it.': 'ปิดบัญชี {0}? บัญชีจะถูกออกจากระบบและลงชื่อเข้าใช้ไม่ได้ เครื่องยังอยู่ในบัญชี',
    'Send {0} a mail with a link to set a new password?': 'ส่งอีเมลพร้อมลิงก์ตั้งรหัสผ่านใหม่ถึง {0}?',
    'Delete {0} with its {1} device(s), {2} Studio design(s) and its apps? This cannot be undone.\n\nType the address to delete it:':
      'ลบ {0} พร้อมเครื่อง {1} เครื่อง งานออกแบบ Studio {2} งาน และแอปของบัญชี? ย้อนกลับไม่ได้\n\nพิมพ์อีเมลของบัญชีเพื่อยืนยันการลบ:',
    'Not deleted: the address typed was another': 'ไม่ได้ลบ: อีเมลที่พิมพ์ไม่ตรง', 'A new-password mail is on its way to {0}.': 'ส่งอีเมลตั้งรหัสผ่านใหม่ถึง {0} แล้ว',
    'No device in this account.': 'บัญชีนี้ไม่มีเครื่อง', 'activated': 'activate แล้ว', 'trial, {0} days left': 'ทดลองใช้ เหลือ {0} วัน', 'not activated': 'ยังไม่ activate',
    'heard of {0}': 'ติดต่อล่าสุด {0}', 'Remove': 'เอาออก',
    'Take {0} out of {1}? The device signs itself out at its next contact.': 'เอา {0} ออกจากบัญชี {1}? เครื่องจะออกจากระบบเองเมื่อติดต่อเซิร์ฟเวอร์ครั้งถัดไป',
    '{0} of {1} projects, {2} together (one may be {3}).': '{0} จาก {1} โปรเจกต์ รวม {2} (โปรเจกต์ละไม่เกิน {3})', 'changed {0}': 'แก้ล่าสุด {0}', 'made {0}': 'สร้าง {0}',
    'Delete': 'ลบ', 'Delete the Studio project "{0}" of {1}? It cannot be brought back.': 'ลบโปรเจกต์ Studio "{0}" ของ {1}? กู้คืนไม่ได้',
    'The new account\'s email': 'ใส่อีเมลของบัญชีใหม่',
    'Made {0}. A mail with a link to set the password is on its way to it (72 hours, once).': 'สร้าง {0} แล้ว ส่งอีเมลพร้อมลิงก์ตั้งรหัสผ่านไปแล้ว (ใช้ได้ครั้งเดียว ภายใน 72 ชั่วโมง)',
    'Made {0}. No mail could be sent: give the person this link to set the password (72 hours, once):': 'สร้าง {0} แล้ว แต่ส่งอีเมลไม่ได้: ส่งลิงก์นี้ให้เจ้าของบัญชีตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว ภายใน 72 ชั่วโมง):',
    'The account\'s email and the app': 'ใส่อีเมลของบัญชีและเลือกแอป'
  };
  function T(s) {
    var t = (LANG === 'th' && Object.prototype.hasOwnProperty.call(TH, s) ? TH[s] : s), a = arguments;
    return t.replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1]; });
  }
  (function () {
    var sw = document.getElementById('desk-lang');
    if (sw) {
      sw.textContent = LANG === 'th' ? 'English' : 'ไทย';
      sw.hidden = false;
      sw.addEventListener('click', function () {
        try { localStorage.setItem('ros-desk-lang', LANG === 'th' ? 'en' : 'th'); } catch (e) { /* this visit stays as it is */ }
        location.reload();
      });
    }
    if (LANG !== 'th') return;
    document.documentElement.lang = 'th';
    [document.querySelector('.page-head'), box].forEach(function (root) {
      if (!root) return;
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = [];
      while ((n = w.nextNode())) list.push(n);
      list.forEach(function (n) {
        var k = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (k && Object.prototype.hasOwnProperty.call(TH, k)) n.nodeValue = n.nodeValue.replace(/^(\s*)[\s\S]*?(\s*)$/, '$1' + TH[k].replace(/\$/g, '$$$$') + '$2');
      });
      Array.prototype.forEach.call(root.querySelectorAll('[placeholder], [aria-label], [title]'), function (e) {
        ['placeholder', 'aria-label', 'title'].forEach(function (at) {
          var v = e.getAttribute(at);
          if (v && Object.prototype.hasOwnProperty.call(TH, v)) e.setAttribute(at, TH[v]);
        });
      });
    });
  })();


  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function api(base, method, p, body) {
    return fetch(base + p, { method: method, cache: 'no-store',
      headers: Object.assign({ 'Content-Type': body instanceof Blob ? 'application/octet-stream' : 'application/json' }, account ? { Authorization: 'Bearer ' + account.token } : {}),
      body: body == null ? undefined : body instanceof Blob ? body : JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error((j.error === 'bad_app' && j.detail) || T(SAY[j.error] || j.error || '') || T('The server answered {0}', r.status));
          e.status = r.status;
          throw e;
        });
      }, function () { var e = new Error(T('The server does not answer')); e.status = 0; throw e; });
  }
  function setAccount(a) {
    account = a;
    try { if (a) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY); } catch (e) { /* this page only */ }
  }
  function view(id, note) {
    ['desk-wait', 'desk-no', 'desk-sign', 'desk-in'].forEach(function (v) { $(v).hidden = v !== id; });
    if (note != null) $('desk-no').textContent = note;
  }
  var day = function (iso) { return iso ? iso.slice(0, 10) : ''; };
  var hide = function (k) { return k.slice(0, 4) + '-····-····-····'; };

  // ---------------------------------------------------------------- who

  function start() {
    if (!account || !account.token) return view('desk-sign');
    view('desk-wait');
    api(DESK, 'GET', '').then(function (r) {
      $('desk-who').textContent = r.email;
      $('desk-shop').hidden = !r.shop;
      view('desk-in');
      load();
      loadStore();
      loadAccounts();
      loadLog();
    }, function (x) {
      if (x.status === 401) { setAccount(null); return view('desk-sign'); }
      if (x.status === 403) { $('desk-sign-err').textContent = x.message + ' (' + account.email + ')'; setAccount(null); return view('desk-sign'); }
      view('desk-no', x.status === 404 ? T('There is no key desk on this server.') : x.message);
    });
  }
  $('desk-sign').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-sign-go');
    go.disabled = true;
    $('desk-sign-err').textContent = '';
    api(ACCOUNT, 'POST', '/login', { email: $('desk-email').value.trim(), password: $('desk-pass').value }).then(function (r) {
      $('desk-pass').value = '';
      setAccount({ token: r.token, email: r.user.email, name: r.user.name });
      start();
    }, function (x) { $('desk-sign-err').textContent = x.message; }).then(function () { go.disabled = false; });
  });
  $('desk-out').addEventListener('click', function () {
    api(ACCOUNT, 'POST', '/logout').catch(function () { /* signed out here anyway */ }).then(function () {
      setAccount(null);
      keys = made = accounts = storeApps = [];
      $('desk-store').hidden = true;
      pickFile(null);
      $('desk-keys').tBodies[0].replaceChildren();
      $('desk-accounts').tBodies[0].replaceChildren();
      $('desk-apps').hidden = true;
      $('desk-made').hidden = true;
      view('desk-sign');
    });
  });

  // ---------------------------------------------------------------- make keys

  $('desk-new').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-new-go'), count = parseInt($('desk-count').value, 10), note = $('desk-note').value.trim();
    $('desk-new-err').textContent = '';
    go.disabled = true;
    api(DESK, 'POST', '/keys', { count: count, note: note }).then(function (r) {
      made = r.keys;
      $('desk-made-what').textContent = T('{0} key(s) for: {1} ({2})', r.keys.length, note,
        '#' + r.keys[0].id + (r.keys.length > 1 ? ' - #' + r.keys[r.keys.length - 1].id : ''));
      var list = $('desk-made-keys');
      list.replaceChildren();
      r.keys.forEach(function (k) { list.appendChild(el('li', null, k.key)); });
      $('desk-made-copy').textContent = T('Copy');
      $('desk-made').hidden = false;
      $('desk-note').value = '';
      load();
    }, function (x) { $('desk-new-err').textContent = x.message; }).then(function () { go.disabled = false; });
  });
  var madeText = function () { return made.map(function (k) { return k.key; }).join('\n') + '\n'; };
  $('desk-made-copy').addEventListener('click', function () {
    navigator.clipboard.writeText(madeText()).then(function () { $('desk-made-copy').textContent = T('Copied'); });
  });
  $('desk-made-save').addEventListener('click', function () {
    var a = el('a');
    a.href = URL.createObjectURL(new Blob([madeText()], { type: 'text/plain' }));
    a.download = 'reloados-keys-' + made[0].id + (made.length > 1 ? '-' + made[made.length - 1].id : '') + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------------------------------------------------------------- the keys, the orders

  function drawKeys() {
    var find = $('desk-find').value.trim().toLowerCase().replace(/^#/, ''), state = $('desk-state').value, show = $('desk-show').checked;
    var flat = find.replace(/[\s-]/g, '');
    var rows = keys.filter(function (k) {
      if (state && k.state !== state) return false;
      if (!find) return true;
      return String(k.id) === find || (k.note || '').toLowerCase().indexOf(find) >= 0 || (k.device || '').toLowerCase().indexOf(find) >= 0 ||
        (flat.length >= 4 && k.key.replace(/-/g, '').toLowerCase().indexOf(flat) >= 0);
    });
    var body = $('desk-keys').tBodies[0];
    body.replaceChildren();
    rows.slice(0, MAX_ROWS).forEach(function (k) {
      var tr = el('tr');
      tr.appendChild(el('td', null, '#' + k.id));
      tr.appendChild(el('td', 'desk-key', show ? k.key : hide(k.key)));
      tr.appendChild(el('td', 'desk-' + k.state, T(k.state)));
      tr.appendChild(el('td', 'desk-dev', k.device ? k.device + ' ' + day(k.redeemed) : ''));
      tr.appendChild(el('td', null, day(k.created)));
      tr.appendChild(el('td', 'desk-notecell', k.note));
      var act = el('td'), b = el('button', 'acct-link', k.state === 'revoked' ? T('Take back') : T('Revoke'));
      b.type = 'button';
      b.addEventListener('click', function () {
        var undo = k.state === 'revoked';
        if (!undo && !confirm(k.device ? T('Revoke key #{0}? It activates nothing any more - {1} keeps the license it got.', k.id, k.device) : T('Revoke key #{0}? It activates nothing any more.', k.id))) return;
        api(DESK, 'POST', '/keys/revoke', { key: k.key, revoked: !undo }).then(load, function (x) { $('desk-err').textContent = x.message; });
      });
      act.appendChild(b);
      tr.appendChild(act);
      body.appendChild(tr);
    });
    $('desk-keys-more').textContent = rows.length > MAX_ROWS ? T('The first {0} of {1}: narrow it down with Find.', MAX_ROWS, rows.length) : rows.length ? '' : T('No key here.');
  }
  function drawOrders(orders) {
    var body = $('desk-orders').tBodies[0];
    body.replaceChildren();
    orders.forEach(function (o) {
      var tr = el('tr');
      tr.appendChild(el('td', 'desk-dev', o.order + ' ' + day(o.created)));
      tr.appendChild(el('td', 'desk-' + (o.status === 'paid' ? 'used' : 'revoked'), T(o.status)));
      tr.appendChild(el('td', 'desk-wrap', o.email + (o.tax ? ' · ' + T('TAX INVOICE') + ': ' + o.tax.name + ', ' + o.tax.address + ', ' + o.tax.id : '')));
      tr.appendChild(el('td', null, o.keys.map(function (n) { return '#' + n; }).join(' ') || (o.qty + ' x')));
      tr.appendChild(el('td', null, o.amount + ' ' + o.currency));
      tr.appendChild(el('td', null, o.status !== 'paid' ? '' : o.mailed ? T('sent {0}', day(o.mailed)) : T('NOT SENT') + (o.mailError ? ': ' + o.mailError : '')));
      var act = el('td');
      if (o.status === 'paid') {
        var b = el('button', 'acct-link', T('Mail again'));
        b.type = 'button';
        b.addEventListener('click', function () {
          b.disabled = true;
          api(DESK, 'POST', '/orders/' + o.order + '/resend').then(function () { b.textContent = T('On its way'); }, function (x) { $('desk-err').textContent = x.message; b.disabled = false; });
        });
        act.appendChild(b);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }
  function load() {
    $('desk-err').textContent = '';
    api(DESK, 'GET', '/keys').then(function (r) {
      keys = r.keys;
      $('desk-keys-count').textContent = T('{0} unused · {1} used · {2} revoked', r.unused, r.used, r.revoked);
      drawKeys();
    }, function (x) { if (x.status === 401 || x.status === 403) return start(); $('desk-err').textContent = x.message; });
    if (!$('desk-shop').hidden) api(DESK, 'GET', '/orders').then(function (r) { drawOrders(r.orders); }, function () { /* the keys' error says it */ });
  }
  // ---------------------------------------------------------------- the apps on the update server

  var storeApps = [], storeTiles = {}, upFile = null, upApp = null;
  var unfolded = {};                                // app id -> its boards are shown (a card starts folded)
  var sizeText = function (n) { return n < 1e5 ? Math.ceil(n / 1000) + ' KB' : (n / 1e6).toFixed(1) + ' MB'; };
  /* an app's tile as its device shows it: its picture, or its icon on its colour - a drawn one ("@globe": icons/) or a
   * glyph of the devices' symbol font ("f067"); its first letter when it names neither */
  var DRAWN = ['camera', 'chart', 'chip', 'clock', 'database', 'globe', 'heartbeat', 'hotspot', 'idcard', 'info', 'lan', 'mic', 'moon', 'person', 'screen', 'stopwatch', 'sun'];
  function icon(box, a) {
    box.replaceChildren();
    box.className = 'store-icon' + (a.white ? ' store-white' : '');
    box.style.background = a.white ? '' : a.color || '';
    if (storeTiles[a.id]) {
      var img = el('img');
      img.src = storeTiles[a.id];
      img.alt = '';
      box.appendChild(img);
    } else if (a.icon && a.icon.charAt(0) === '@' && DRAWN.indexOf(a.icon.slice(1)) >= 0) {
      var pic = el('i', 'store-drawn'), url = 'url(' + ROOT + 'assets/icons/' + a.icon.slice(1) + '.png)';
      pic.style.webkitMaskImage = url;
      pic.style.maskImage = url;
      box.appendChild(pic);
    } else if (a.icon && /^[0-9a-f]{4,5}$/.test(a.icon)) {
      box.appendChild(el('span', 'store-glyph', String.fromCodePoint(parseInt(a.icon, 16))));
    } else box.textContent = (a.name || a.id).charAt(0).toUpperCase();
    return box;
  }
  function drawStore() {
    var find = $('desk-store-find').value.trim().toLowerCase(), groups = {}, order = [];
    storeApps.forEach(function (a) {
      if (find && (a.id + ' ' + a.name + ' ' + a.board).toLowerCase().indexOf(find) < 0) return;
      if (!groups[a.id]) { groups[a.id] = []; order.push(a.id); }
      groups[a.id].push(a);
    });
    order.sort(function (x, y) { return groups[x][0].name.localeCompare(groups[y][0].name); });
    var grid = $('desk-store-list');
    grid.replaceChildren();
    order.forEach(function (id) {
      var list = groups[id], first = list[0], card = el('details', 'store-card'), head = el('summary', 'store-head');
      card.open = !!unfolded[id];
      card.addEventListener('toggle', function () { unfolded[id] = card.open; });
      var pub = list.filter(function (a) { return a.public; }).length;
      var vers = list.map(function (a) { return a.version; }).filter(function (v, i, all) { return all.indexOf(v) === i; });
      var title = el('div', 'store-title');
      title.appendChild(el('h3', null, first.name));
      title.appendChild(el('p', 'muted', id + ' · ' + (vers.length === 1 ? vers[0] : T('{0} versions', vers.length)) + ' · ' +
        T(list.length === 1 ? '{0} board' : '{0} boards', list.length)));
      head.appendChild(icon(el('div'), first));
      head.appendChild(title);
      head.appendChild(el('span', 'store-badge' + (pub ? ' on' : ''), pub === list.length ? T('Public') : pub ? T('{0}/{1} public', pub, list.length) : T('Private')));
      head.appendChild(el('span', 'store-fold'));
      card.appendChild(head);
      var rows = el('ul', 'store-boards');
      list.forEach(function (a) {
        var li = el('li'), what = el('div', 'store-board');
        what.appendChild(el('span', 'desk-dev', a.board));
        what.appendChild(el('span', 'muted', a.version + ' · ' + sizeText(a.size) + ' · ' + day(a.published)));
        if (a.minFw !== undefined) {                          // the oldest Reload OS it opens on: older devices are not offered it
          var need = el('button', 'acct-link store-need', a.minFw ? T('needs Reload OS {0}', a.minFw) : T('any Reload OS'));
          need.type = 'button';
          need.title = T('The oldest Reload OS this app opens on');
          need.addEventListener('click', function () {
            var v = prompt(T('The oldest Reload OS {0} for {1} opens on, like 1.5.10. Empty: any.', a.name, a.board), a.minFw || '');
            if (v == null || v.trim() === (a.minFw || '')) return;
            storeCall('/minfw', { board: a.board, id: a.id, minFw: v.trim() });
          });
          what.appendChild(need);
        }
        li.appendChild(what);
        var sw = el('label', 'store-switch'), tick = el('input');
        tick.type = 'checkbox';
        tick.checked = a.public;
        tick.setAttribute('aria-label', T('{0} for {1} is public', a.name, a.board));
        sw.title = a.public ? T('Public: every device of this board is offered it') : T('Private: only the accounts it is given to');
        tick.addEventListener('change', function () {
          var on = tick.checked;
          if (on && !confirm(T('Show {0} {1} on every {2}?', a.name, a.version, a.board))) { tick.checked = false; return; }
          tick.disabled = true;
          storeCall('/public', { board: a.board, id: a.id, public: on });
        });
        sw.appendChild(tick);
        sw.appendChild(el('span'));
        li.appendChild(sw);
        var b = el('button', 'acct-link store-off', '×');
        b.type = 'button';
        b.title = T('Take {0} off for {1}', a.name, a.board);
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', function () {
          if (!confirm(T('Take {0} off for {1}? No device is offered it or an update of it any more; one that has it keeps it.', a.name, a.board))) return;
          b.disabled = true;
          storeCall('/remove', { board: a.board, id: a.id });
        });
        li.appendChild(b);
        rows.appendChild(li);
      });
      card.appendChild(rows);
      grid.appendChild(card);
    });
    var ids = storeApps.map(function (a) { return a.id; }).filter(function (v, i, all) { return all.indexOf(v) === i; });
    $('desk-store-count').textContent = T('{0} app(s) · {1} public releases · {2} private', ids.length,
      storeApps.filter(function (a) { return a.public; }).length, storeApps.filter(function (a) { return !a.public; }).length);
    $('desk-store-more').textContent = order.length ? '' : find ? T('No app here.') : T('No app on the server yet.');
    $('desk-store-fold').hidden = !order.length;
    $('desk-store-fold').textContent = order.every(function (id) { return unfolded[id]; }) ? T('Fold all') : T('Show all boards');
  }
  function storeHas(r) {
    storeApps = r.apps;
    storeTiles = r.tiles || {};
    $('desk-store').hidden = false;
    $('desk-up').hidden = !r.upload;
    $('desk-up-off').hidden = r.upload;
    drawStore();
    drawPick();
  }
  function storeCall(p, body) {
    $('desk-store-err').textContent = '';
    api(DESK, 'POST', '/apps' + p, body).then(storeHas, function (x) { $('desk-store-err').textContent = x.message; drawStore(); });
  }
  function loadStore() {
    $('desk-store-err').textContent = '';
    api(DESK, 'GET', '/apps').then(storeHas, function (x) {
      if (x.status === 404 || x.status === 405) { $('desk-store').hidden = true; return; }      // a server from before
      $('desk-store').hidden = false;
      $('desk-store-err').textContent = x.message;
    });
  }
  function upReady() { $('desk-up-go').disabled = !(upApp && upApp.newer && $('desk-up-tested').checked); }
  function pickFile(f) {
    upFile = f;
    upApp = null;
    $('desk-up-card').hidden = true;
    $('desk-up-tested').checked = $('desk-up-public').checked = false;
    if (!f) $('desk-up-file').value = '';
    upReady();
  }
  $('desk-up-file').addEventListener('change', function () {
    var f = this.files[0] || null;
    pickFile(f);
    $('desk-store-err').textContent = '';
    if (!f) return;
    api(DESK, 'POST', '/apps/check', f).then(function (r) {
      if (upFile !== f) return;                              // another file was picked meanwhile
      upApp = r;
      $('desk-up-name').textContent = r.name + ' ' + r.version;
      icon($('desk-up-icon'), r);
      $('desk-up-what').textContent = r.id + ' · ' + sizeText(r.size) + ' · ' + T('for {0}', r.boards.map(function (b) {
        return b.board + ' - ' + (b.version ? T('{0} there now', b.version) : T('new there'));
      }).join(', ')) + (r.newer ? '' : '. ' + T('Not newer: raise its version.txt and build it again.'));
      $('desk-up-public').checked = r.boards.some(function (b) { return b.public; });
      $('desk-up-card').hidden = false;
      upReady();
    }, function (x) { if (upFile === f) $('desk-store-err').textContent = x.message; });
  });
  $('desk-up-tested').addEventListener('change', upReady);
  $('desk-up-cancel').addEventListener('click', function () { pickFile(null); });
  $('desk-up-go').addEventListener('click', function () {
    var pub = $('desk-up-public').checked, go = this;
    if (!confirm(T(pub ? 'Publish {0} {1} for {2} - on every device of it?' : 'Publish {0} {1} for {2} - for the accounts it is given to?',
      upApp.name, upApp.version, upApp.boards.map(function (b) { return b.board; }).join(', ')))) return;
    go.disabled = true;
    $('desk-store-err').textContent = '';
    api(DESK, 'POST', '/apps/publish?tested=1' + (pub ? '&public=1' : ''), upFile).then(function (r) { storeHas(r); pickFile(null); },
      function (x) { $('desk-store-err').textContent = x.message; upReady(); });
  });
  $('desk-store-find').addEventListener('input', drawStore);
  $('desk-store-fold').addEventListener('click', function () {
    var ids = storeApps.map(function (a) { return a.id; }), all = ids.every(function (id) { return unfolded[id]; });
    ids.forEach(function (id) { unfolded[id] = !all; });
    drawStore();
  });
  $('desk-store-reload').addEventListener('click', loadStore);

  // ---------------------------------------------------------------- apps given to accounts (the account server's)

  var accounts = [];
  /* Give: the apps on the update server to choose from, "Another id" for one that is not there yet; without that
   * list (a server from before it) the id is typed */
  function drawPick() {
    var pick = $('desk-give-pick'), was = pick.value, seen = {};
    pick.replaceChildren();
    var first = el('option', null, T('Choose an app…'));
    first.value = '';
    pick.appendChild(first);
    storeApps.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (a) {
      if (seen[a.id]) return;
      seen[a.id] = true;
      var n = storeApps.filter(function (x) { return x.id === a.id; }).length;
      var o = el('option', null, a.name + ' (' + a.id + ') · ' + T(n === 1 ? '{0} board' : '{0} boards', n));
      o.value = a.id;
      pick.appendChild(o);
    });
    var other = el('option', null, T('Another id…'));
    other.value = '*';
    pick.appendChild(other);
    pick.value = seen[was] || was === '*' ? was : '';
    $('desk-give-pick-box').hidden = !storeApps.length;
    pickChanged();
  }
  function pickChanged() {
    var typed = $('desk-give-pick-box').hidden || $('desk-give-pick').value === '*';
    $('desk-give-app-box').hidden = !typed;
  }
  function pickedApp() {
    return $('desk-give-app-box').hidden ? $('desk-give-pick').value : $('desk-give-app').value.trim().toLowerCase();
  }
  $('desk-give-pick').addEventListener('change', function () { pickChanged(); if (this.value === '*') $('desk-give-app').focus(); });
  function drawAccounts() {
    var find = $('desk-apps-find').value.trim().toLowerCase(), all = $('desk-apps-all').checked;
    var rows = accounts.filter(function (a) {
      if (!all && !a.apps.length && !find) return false;
      return !find || a.email.toLowerCase().indexOf(find) >= 0 || (a.name || '').toLowerCase().indexOf(find) >= 0 ||
        a.apps.some(function (x) { return x.indexOf(find) >= 0; });
    });
    var body = $('desk-accounts').tBodies[0];
    body.replaceChildren();
    rows.slice(0, MAX_ROWS).forEach(function (a) {
      var tr = el('tr');
      tr.appendChild(el('td', 'desk-wrap', a.email + (a.disabled ? ' (' + T('disabled') + ')' : !a.verified ? ' (' + T('not confirmed') + ')' : '')));
      tr.appendChild(el('td', null, a.name));
      tr.appendChild(el('td', null, a.lastLogin ? day(a.lastLogin) : a.created ? T('never (made {0})', day(a.created)) : ''));
      var dv = el('td');
      if (a.devices && a.lastLogin !== undefined) {              // a server that manages accounts: its devices on a tap
        var show = el('button', 'acct-link', a.devices + (shown[a.email] ? ' ▾' : ' ▸'));
        show.type = 'button';
        show.setAttribute('aria-expanded', shown[a.email] ? 'true' : 'false');
        show.addEventListener('click', function () { toggleDevices(a.email); });
        dv.appendChild(show);
      } else dv.textContent = String(a.devices);
      tr.appendChild(dv);
      var pj = el('td');
      if (a.lastLogin === undefined) pj.textContent = '';
      else if (a.projects) {                                  // its Studio projects on a tap: what there is, not the designs
        var showP = el('button', 'acct-link', a.projects + (shownProjects[a.email] ? ' ▾' : ' ▸'));
        showP.type = 'button';
        showP.setAttribute('aria-expanded', shownProjects[a.email] ? 'true' : 'false');
        showP.addEventListener('click', function () { toggleProjects(a.email); });
        pj.appendChild(showP);
      } else pj.textContent = '0';
      tr.appendChild(pj);
      var td = el('td', 'desk-appcell');
      a.apps.forEach(function (id) {
        var chip = el('span', 'desk-app', id), x = el('button', 'acct-link', '×');
        x.type = 'button';
        x.title = T('Take {0} from {1}', id, a.email);
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', function () {
          if (!confirm(T('Take {0} from {1}? Its devices no longer list it in Get apps (one that has it keeps it).', id, a.email))) return;
          give(a.email, id, false);
        });
        chip.appendChild(x);
        td.appendChild(chip);
      });
      var add = el('button', 'acct-link', T('+ app'));
      add.type = 'button';
      add.addEventListener('click', function () {
        $('desk-give-email').value = a.email;
        $('desk-give').scrollIntoView({ block: 'nearest' });
        ($('desk-give-app-box').hidden ? $('desk-give-pick') : $('desk-give-app')).focus();
      });
      td.appendChild(add);
      tr.appendChild(td);
      tr.appendChild(manage(a));
      body.appendChild(tr);
      if (shown[a.email]) body.appendChild(devicesRow(a.email, shown[a.email]));
      if (shownProjects[a.email]) body.appendChild(projectsRow(a.email, shownProjects[a.email]));
    });
    var given = accounts.filter(function (a) { return a.apps.length; }).length;
    $('desk-apps-count').textContent = T('{0} account(s) · {1} with apps of their own', accounts.length, given);
    $('desk-apps-more').textContent = rows.length > MAX_ROWS ? T('The first {0} of {1}: narrow it down with Find.', MAX_ROWS, rows.length)
      : rows.length ? '' : all || find ? T('No account here.') : T('No account has an app of its own yet.');
    var list = $('desk-emails');
    list.replaceChildren();
    accounts.forEach(function (a) { var o = el('option'); o.value = a.email; list.appendChild(o); });
  }
  /* ---- managing an account (the account server's admin calls: a server from before them has no lastLogin) */
  var shown = {};                                   // email -> its devices, while the row is open
  function manage(a) {
    var td = el('td');
    if (a.lastLogin === undefined) return td;
    var menu = el('select', 'desk-manage');
    menu.setAttribute('aria-label', T('Manage {0}', a.email));
    [['', T('Manage…')], !a.verified && ['verify', T('Confirm the address')], !a.disabled && ['reset', T('Send a new-password mail')],
      !a.admin && (a.disabled ? ['enable', T('Enable')] : ['disable', T('Disable')]), !a.admin && ['delete', T('Delete…')]].forEach(function (o) {
      if (!o) return;
      var opt = el('option', null, o[1]);
      opt.value = o[0];
      menu.appendChild(opt);
    });
    menu.addEventListener('change', function () {
      var action = menu.value;
      menu.value = '';
      if (!action) return;
      if (action === 'disable' && !confirm(T('Disable {0}? It is signed out and cannot sign in; its devices stay in it.', a.email))) return;
      if (action === 'reset' && !confirm(T('Send {0} a mail with a link to set a new password?', a.email))) return;
      if (action === 'delete') {
        var typed = prompt(T('Delete {0} with its {1} device(s), {2} Studio design(s) and its apps? This cannot be undone.\n\nType the address to delete it:', a.email, a.devices, a.projects || 0));
        if (typed == null) return;
        if (typed.trim().toLowerCase() !== a.email.toLowerCase()) { $('desk-give-err').textContent = T('Not deleted: the address typed was another'); return; }
      }
      $('desk-give-err').textContent = '';
      api(ACCOUNT, 'POST', '/admin/account', { email: a.email, action: action }).then(function () {
        if (action === 'delete') { delete shown[a.email]; delete shownProjects[a.email]; }
        if (action === 'reset') say(T('A new-password mail is on its way to {0}.', a.email));
        loadAccounts();
      }, function (x) { $('desk-give-err').textContent = x.message; });
    });
    td.appendChild(menu);
    return td;
  }
  function say(text, link) {
    var box = $('desk-acct-done');
    box.replaceChildren(text);
    if (link) { box.appendChild(el('br')); box.appendChild(el('code', null, link)); }
    box.hidden = false;
  }
  function devicesRow(email, list) {
    var tr = el('tr', 'desk-devrow'), td = el('td');
    td.colSpan = 7;
    if (!list.length) td.appendChild(el('span', 'muted', T('No device in this account.')));
    list.forEach(function (d) {
      var line = el('div', 'desk-devline');
      line.appendChild(el('span', 'desk-dev', d.device));
      line.appendChild(el('span', null, (d.name || '') + ' · ' + d.board + ' · Reload OS ' + (d.fw || '?') + ' · ' +
        (d.licensed ? T('activated') : d.trial > 0 ? T('trial, {0} days left', d.trial) : T('not activated')) + ' · ' + T('heard of {0}', day(d.seen))));
      var out = el('button', 'acct-link', T('Remove'));
      out.type = 'button';
      out.addEventListener('click', function () {
        if (!confirm(T('Take {0} out of {1}? The device signs itself out at its next contact.', d.device, email))) return;
        api(ACCOUNT, 'POST', '/admin/unlink', { device: d.device }).then(function () { delete shown[email]; return loadAccounts(); },
          function (x) { $('desk-give-err').textContent = x.message; });
      });
      line.appendChild(out);
      td.appendChild(line);
    });
    tr.appendChild(td);
    return tr;
  }
  /* an account's Studio projects: name, size, when - and Delete */
  var shownProjects = {};                           // email -> { projects, bytes, most, mostBytes }, while the row is open
  var kb = function (n) { return n < 1e5 ? Math.ceil(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; };
  function projectsRow(email, r) {
    var tr = el('tr', 'desk-devrow'), td = el('td');
    td.colSpan = 7;
    td.appendChild(el('div', 'muted', T('{0} of {1} projects, {2} together (one may be {3}).', r.projects.length, r.most, kb(r.bytes), kb(r.mostBytes))));
    r.projects.forEach(function (p) {
      var line = el('div', 'desk-devline');
      line.appendChild(el('strong', null, p.name));
      line.appendChild(el('span', null, kb(p.size) + ' · ' + T('changed {0}', day(p.updated)) + ' · ' + T('made {0}', day(p.created))));
      var del = el('button', 'acct-link', T('Delete'));
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm(T('Delete the Studio project "{0}" of {1}? It cannot be brought back.', p.name, email))) return;
        api(ACCOUNT, 'POST', '/admin/project', { email: email, id: p.id, action: 'delete' }).then(function () {
          return loadProjects(email).then(loadAccounts);
        }, function (x) { $('desk-give-err').textContent = x.message; });
      });
      line.appendChild(del);
      td.appendChild(line);
    });
    tr.appendChild(td);
    return tr;
  }
  function loadProjects(email) {
    return api(ACCOUNT, 'GET', '/admin/projects?email=' + encodeURIComponent(email)).then(function (r) {
      if (r.projects.length) shownProjects[email] = r; else delete shownProjects[email];
    });
  }
  function toggleProjects(email) {
    if (shownProjects[email]) { delete shownProjects[email]; return drawAccounts(); }
    loadProjects(email).then(drawAccounts, function (x) { $('desk-give-err').textContent = x.message; });
  }
  function toggleDevices(email) {
    if (shown[email]) { delete shown[email]; return drawAccounts(); }
    api(ACCOUNT, 'GET', '/admin/devices?email=' + encodeURIComponent(email)).then(function (r) { shown[email] = r.devices; drawAccounts(); },
      function (x) { $('desk-give-err').textContent = x.message; });
  }
  $('desk-acct-new').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-acct-go'), email = $('desk-acct-email').value.trim();
    $('desk-acct-err').textContent = '';
    $('desk-acct-done').hidden = true;
    if (!email) { $('desk-acct-err').textContent = T('The new account\'s email'); return; }
    go.disabled = true;
    api(ACCOUNT, 'POST', '/admin/accounts', { email: email, name: $('desk-acct-name').value.trim() }).then(function (r) {
      $('desk-acct-email').value = $('desk-acct-name').value = '';
      if (r.mailed) say(T('Made {0}. A mail with a link to set the password is on its way to it (72 hours, once).', r.email));
      else say(T('Made {0}. No mail could be sent: give the person this link to set the password (72 hours, once):', r.email), r.link);
      return loadAccounts();
    }, function (x) { $('desk-acct-err').textContent = x.message; }).then(function () { go.disabled = false; });
  });

  function loadAccounts() {
    return api(ACCOUNT, 'GET', '/admin/apps').then(function (r) {
      accounts = r.accounts;
      $('desk-acct-new').hidden = !accounts.length || accounts[0].lastLogin === undefined;
      $('desk-apps').hidden = false;
      drawAccounts();
    }, function (x) {
      if (x.status === 404 || x.status === 403) { $('desk-apps').hidden = true; return; }   // not on the account server's list
      $('desk-apps').hidden = false;
      $('desk-give-err').textContent = x.message;
    });
  }
  function give(email, app, yes) {
    $('desk-give-err').textContent = '';
    return api(ACCOUNT, 'POST', '/admin/apps', { email: email, app: app, give: yes }).then(function (r) {
      accounts.forEach(function (a) { if (a.email === r.email) a.apps = r.apps; });
      drawAccounts();
      return r;
    }, function (x) { $('desk-give-err').textContent = x.message; throw x; });
  }
  $('desk-give').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = $('desk-give-go'), email = $('desk-give-email').value.trim(), app = pickedApp();
    if (!email || !app) { $('desk-give-err').textContent = T('The account\'s email and the app'); return; }
    go.disabled = true;
    give(email, app, true).then(function () { $('desk-give-app').value = ''; if ($('desk-give-pick').value !== '*') $('desk-give-pick').value = ''; }, function () { /* said */ })
      .then(function () { go.disabled = false; });
  });
  ['desk-apps-find', 'desk-apps-all'].forEach(function (id) { $(id).addEventListener('input', drawAccounts); });
  $('desk-apps-reload').addEventListener('click', loadAccounts);

  // ---------------------------------------------------------------- the log: what was done at the desk, on both servers

  var deeds = [];
  function when(at) {                    // this computer's time, as 2026-11-25 23:05
    var d = new Date(at), p = function (n) { return (n < 10 ? '0' : '') + n; };
    if (isNaN(d)) return String(at).slice(0, 16);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function drawLog() {
    var find = $('desk-log-find').value.trim().toLowerCase();
    var rows = deeds.filter(function (d) { return !find || (d.who + ' ' + d.what).toLowerCase().indexOf(find) >= 0; });
    var body = $('desk-log').tBodies[0];
    body.replaceChildren();
    rows.slice(0, MAX_ROWS).forEach(function (d) {
      var tr = el('tr');
      tr.appendChild(el('td', 'desk-dev', when(d.at)));
      tr.appendChild(el('td', null, d.who));
      tr.appendChild(el('td', 'desk-wrap', d.what));
      body.appendChild(tr);
    });
    $('desk-log-count').textContent = T('{0} deeds', deeds.length);
    $('desk-log-more').textContent = rows.length ? '' : T('Nothing here yet.');
  }
  function loadLog() {
    var got = function (p) { return p.then(function (r) { return r.log || []; }, function () { return []; }); };     // a server from before it: none
    Promise.all([got(api(DESK, 'GET', '/log')), got(api(ACCOUNT, 'GET', '/admin/log'))]).then(function (l) {
      deeds = l[0].concat(l[1]).sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
      drawLog();
    });
  }
  $('desk-log-tab').addEventListener('click', loadLog);
  $('desk-log-reload').addEventListener('click', loadLog);
  $('desk-log-find').addEventListener('input', drawLog);

  ['desk-find', 'desk-state', 'desk-show'].forEach(function (id) { $(id).addEventListener('input', drawKeys); });
  $('desk-reload').addEventListener('click', load);

  start();
})();
