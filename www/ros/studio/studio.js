/* Reload OS Studio: a screen designer in the manner of Android Studio's layout editor. The surface is the real UI: this
 * page keeps the design and sends it to the WebAssembly renderer (tools/sim/sim_design.c), which builds it with LVGL inside
 * the shell, answers where each widget landed, and writes the app's C from the same calls. All the page draws itself is
 * the selection, drag and drop and the panels around the screen. */
(function () {
  'use strict';
  const ENGINE = '../sim/sim_jc_dev', SAVE_KEY = 'ros-studio', FORMAT = 'reloados-studio';
  /* the build service: beside the site, or where the page was told (build.py --build-url: the office server's copy) */
  const BUILD_URL = (function () { var m = document.querySelector('meta[name="build-api"]'); return m && m.content ? m.content : '../api/build'; })();

  const $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, attrs) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'value') e.value = attrs[k];
      else if (k === 'checked') e.checked = attrs[k];
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (let i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (c) { if (c != null) e.append(c); });
    }
    return e;
  }
  function debounce(f, ms) {
    let t = 0;
    return function () { clearTimeout(t); t = setTimeout(f, ms); };
  }

  /* ---------------------------------------------------------------- what can be designed */

  /* the boards of the app kit (tools/appkit/build.sh): the screen each is sold with */
  const BOARDS = [
    { id: 'jc', name: 'JC1060P470C', inch: '7"', w: 1024, h: 600 },
    { id: 'evboard', name: 'ESP32-P4-Function-EV', inch: '7"', w: 1024, h: 600 },
    { id: 'matouch', name: 'MaTouch ESP32-P4', inch: '7"', w: 1024, h: 600 },
    { id: 'jc8012', name: 'JC8012P4A1', inch: '10.1"', w: 800, h: 1280 },
    { id: 'ws101', name: 'Waveshare Touch-LCD-10.1', inch: '10.1"', w: 1280, h: 800 },
    { id: 'jc4880', name: 'JC4880P443', inch: '4.3"', w: 480, h: 800 },
    { id: 'jc4848', name: 'JC4848S040', inch: '4"', w: 480, h: 480 },
    { id: 'jc3248', name: 'JC3248W535', inch: '3.5"', w: 320, h: 480 }
  ];
  /* the theme's colours, by the name the C reads them (ROS_C_*): as main/ros_services.c has them, dark */
  const COLORS = [['text', 'Text', '#E8ECF5'], ['muted', 'Muted', '#8A93A8'], ['dim', 'Dim', '#4A5270'], ['accent', 'Accent', '#FF6B35'],
    ['accent2', 'Accent 2', '#2EC4B6'], ['ok', 'OK', '#3DDC84'], ['warn', 'Warning', '#FFC145'], ['err', 'Error', '#FF4D6D'],
    ['bg', 'Background', '#0A0E17'], ['surface', 'Surface', '#141A28'], ['surface2', 'Surface 2', '#1E2638'], ['border', 'Border', '#2A3350']];
  const FONTS = ['12', '14', '16', '20', '24', '28', '32', '40', '48'];
  const SYMBOLS = ['AUDIO', 'VIDEO', 'LIST', 'OK', 'CLOSE', 'POWER', 'SETTINGS', 'HOME', 'DOWNLOAD', 'DRIVE', 'REFRESH', 'MUTE', 'VOLUME_MID',
    'VOLUME_MAX', 'IMAGE', 'TINT', 'PREV', 'PLAY', 'PAUSE', 'STOP', 'NEXT', 'EJECT', 'LEFT', 'RIGHT', 'PLUS', 'MINUS', 'EYE_OPEN', 'EYE_CLOSE',
    'WARNING', 'SHUFFLE', 'UP', 'DOWN', 'LOOP', 'DIRECTORY', 'UPLOAD', 'CALL', 'CUT', 'COPY', 'SAVE', 'BARS', 'ENVELOPE', 'CHARGE', 'PASTE',
    'BELL', 'KEYBOARD', 'GPS', 'FILE', 'WIFI', 'BATTERY_FULL', 'BATTERY_3', 'BATTERY_2', 'BATTERY_1', 'BATTERY_EMPTY', 'USB', 'BLUETOOTH',
    'TRASH', 'EDIT', 'BACKSPACE', 'SD_CARD', 'NEW_LINE'];
  const DRAWN = ['camera', 'chart', 'chip', 'clock', 'database', 'globe', 'heartbeat', 'hotspot', 'idcard', 'info', 'lan', 'mic', 'moon', 'screen', 'stopwatch', 'sun'];

  const ICONS = {
    label: '<path d="M3 3h10v2.500H9.300V13H6.700V5.500H3z"/>',
    field: '<path fill-rule="evenodd" d="M1 4h14v8H1zm1.500 1.500v5h11v-5z"/><path d="M4 6.500h1.500v3H4z"/>',
    button: '<rect x="1" y="4" width="14" height="8" rx="2.500"/>',
    icon: '<path d="m8 1.500 2 4.300 4.600.6-3.400 3.200.9 4.600L8 11.900l-4.100 2.300.9-4.600L1.400 6.400 6 5.800z"/>',
    check: '<path fill-rule="evenodd" d="M2 2h12v12H2zm3.200 6.200L7 10l4-4.800-1-.8L6.900 8.200 6 7.400z"/>',
    switch: '<path fill-rule="evenodd" d="M5 4h6a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8zm6 1.800a2.200 2.200 0 1 0 0 4.400 2.200 2.200 0 0 0 0-4.400z"/>',
    slider: '<path d="M1 7h14v2H1z"/><circle cx="9" cy="8" r="3.500"/>',
    bar: '<path fill-rule="evenodd" d="M1 5h14v6H1zm1.200 1.200v3.600h7V6.200z"/>',
    arc: '<path d="M8 2a6 6 0 0 1 6 6h-2a4 4 0 1 0-4 4v2A6 6 0 1 1 8 2z"/>',
    spinner: '<path d="M8 1a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5z"/>',
    dropdown: '<path fill-rule="evenodd" d="M1 4h14v8H1zm1.500 1.500v5h11v-5z"/><path d="m8 7 2.500 3L13 7z"/>',
    roller: '<path d="M3 2h10v2H3zM2 7h12v2H2zm1 5h10v2H3z"/>',
    qr: '<path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h2v2H9zm3 0h2v2h-2zm-3 3h2v2H9zm3 0h2v2h-2z"/>',
    list: '<path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z"/>',
    table: '<path fill-rule="evenodd" d="M1 2h14v12H1zm1.500 1.500v2.700h5.200V3.500zm6.700 0v2.700h4.100V3.500zM2.500 7.600v4.900h5.200V7.600zm6.700 0v4.900h4.100V7.600z"/>',
    chart: '<path d="M2 12h3V7H2zm4.500 0h3V3h-3zM11 12h3V9h-3zM1 13h14v1.500H1z"/>',
    calendar: '<path fill-rule="evenodd" d="M2 3h12v11H2zm1.500 3v6.500h9V6z"/><path d="M4 1h2v3H4zm6 0h2v3h-2z"/>',
    meter: '<path d="M8 3a6 6 0 0 1 6 6h-2a4 4 0 0 0-8 0H2a6 6 0 0 1 6-6z"/><path d="m7.300 9.700 3.200-3.900.800.600-2.600 4.300z"/><circle cx="8" cy="10" r="1.500"/>',
    spinbox: '<path d="M1 5h3v6H1zm11 0h3v6h-3z"/><path fill-rule="evenodd" d="M5 4h6v8H5zm1.500 1.500v5h3v-5z"/>',
    led: '<circle cx="8" cy="8" r="4"/><path d="M7 1h2v2H7zm0 12h2v2H7zM1 7h2v2H1zm12 0h2v2h-2z"/>',
    keypad: '<path d="M2 2h3v3H2zm4.500 0h3v3h-3zM11 2h3v3h-3zM2 6.500h3v3H2zm4.500 0h3v3h-3zM11 6.500h3v3h-3zM2 11h3v3H2zm4.500 0h3v3h-3zM11 11h3v3h-3z"/>',
    divider: '<path d="M1 7h14v2H1z"/>',
    image: '<path fill-rule="evenodd" d="M1 3h14v10H1zm1.500 1.500v6.200l3.300-3.400 2.400 2.400 1.600-1.500 3.700 3.300V4.500z"/><circle cx="11" cy="6.500" r="1.300"/>',
    sound: '<path d="M2 6h3l4-3.500v11L5 10H2z"/><path d="M11 5.200a4 4 0 0 1 0 5.600l-1-1a2.600 2.600 0 0 0 0-3.600zm2-2a6.800 6.800 0 0 1 0 9.600l-1-1a5.400 5.400 0 0 0 0-7.600z"/>',
    column: '<path fill-rule="evenodd" d="M2 2h12v12H2zm1.500 1.500v3.700h9V3.500zm0 5.300v3.700h9V8.800z"/>',
    row: '<path fill-rule="evenodd" d="M2 2h12v12H2zm1.500 1.500v9h3.700v-9zm5.300 0v9h3.700v-9z"/>',
    card: '<rect x="1.500" y="3" width="13" height="10" rx="3"/>',
    free: '<path fill-rule="evenodd" d="M2 2h12v12H2zm1.500 1.500v9h9v-9z"/><path d="M5 5h3v3H5zm4 4h2v2H9z"/>',
    spacer: '<path d="M8 1 5 4h2v8H5l3 3 3-3H9V4h2z"/>',
    screen: '<path fill-rule="evenodd" d="M4 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm.5 2v10h7V3z"/>',
    file: '<path d="M4 1h5l4 4v10H4zm5 1.500V6h3.500z"/>',
    app: '<path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/>',
    lock: '<path fill-rule="evenodd" d="M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7zm1.500 0h3V5a1.500 1.500 0 0 0-3 0z"/>',
    unlock: '<path fill-rule="evenodd" d="M5 7V5a3 3 0 0 1 5.800-1.100l-1.400.500A1.500 1.500 0 0 0 6.500 5v2H12v7H4V7z"/>'
  };
  function icon(name) {
    const t = document.createElement('template');
    t.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + ICONS[name] + '</svg>';
    return t.content.firstChild;
  }

  /* the palette: what a new widget starts as. A box is one type in the C, with the layout it is laid out by */
  const W = {
    label: { title: 'Label', type: 'label', props: { text: 'Label', font: '16', color: 'text' } },
    field: { title: 'Text field', type: 'field', props: { hint: 'Type here', oneline: '1', kb: '1', w: 'fill' } },
    button: { title: 'Button', type: 'button', props: { text: 'Button', color: 'accent' } },
    check: { title: 'Checkbox', type: 'check', props: { text: 'Checkbox' } },
    switch: { title: 'Switch', type: 'switch', props: { color: 'accent' } },
    icon: { title: 'Icon', type: 'icon', props: { icon: 'info', color: 'text' } },
    slider: { title: 'Slider', type: 'slider', props: { min: '0', max: '100', value: '50', color: 'accent', w: 'fill' } },
    bar: { title: 'Progress bar', type: 'bar', props: { min: '0', max: '100', value: '50', color: 'accent', w: 'fill' } },
    arc: { title: 'Arc', type: 'arc', props: { min: '0', max: '100', value: '50', color: 'accent', w: '140', h: '140' } },
    spinner: { title: 'Spinner', type: 'spinner', props: { color: 'accent', w: '56', h: '56' } },
    dropdown: { title: 'Dropdown', type: 'dropdown', props: { options: 'First\nSecond\nThird', w: '220' } },
    roller: { title: 'Roller', type: 'roller', props: { options: 'First\nSecond\nThird', rows: '3' } },
    qr: { title: 'QR code', type: 'qr', props: { text: 'https://os.re-loader.com', size: '160' } },
    list: { title: 'List', type: 'list', props: { items: 'First\nSecond\nThird', w: 'fill', h: '200' } },
    table: { title: 'Table', type: 'table', props: { cells: 'Name,Value\nFirst,1\nSecond,2', colw: '140', h: 'content' } },
    chart: { title: 'Chart', type: 'chart', props: { kind: 'line', values: '10,40,25,70,55,90', min: '0', max: '100', color: 'accent', w: 'fill', h: '160' } },
    calendar: { title: 'Calendar', type: 'calendar', props: { w: '320', h: '300' } },
    meter: { title: 'Meter', type: 'meter', props: { min: '0', max: '100', value: '50', color: 'accent', w: '180', h: '180' } },
    spinbox: { title: 'Spinbox', type: 'spinbox', props: { min: '0', max: '100', value: '10', step: '1', digits: '3' } },
    led: { title: 'LED', type: 'led', props: { color: 'ok', w: '28', h: '28' } },
    image: { title: 'Picture', type: 'image', props: {} },
    keypad: { title: 'Keypad', type: 'keypad', props: { keys: '1,2,3\n4,5,6\n7,8,9\nBACKSPACE,0,OK', w: '240', h: '220' } },
    column: { title: 'Column', type: 'box', base: 'column', props: { layout: 'column', gap: '8', w: 'fill', h: 'content' } },
    row: { title: 'Row', type: 'box', base: 'row', props: { layout: 'row', cross: 'center', gap: '8', w: 'fill', h: 'content' } },
    card: { title: 'Card', type: 'box', base: 'card', props: { kind: 'card', layout: 'column', gap: '8', w: 'fill', h: 'content' } },
    free: { title: 'Free area', type: 'box', base: 'area', props: { layout: 'free', w: 'fill', h: '200' } },
    spacer: { title: 'Spacer', type: 'box', base: 'spacer', props: { layout: 'free', w: 'fill', h: 'fill' } },
    divider: { title: 'Divider', type: 'divider', props: { color: 'border', w: 'fill', h: '1' } }
  };
  const PALETTE = [['Text', ['label', 'field']], ['Buttons', ['button', 'check', 'switch', 'keypad']],
    ['Widgets', ['image', 'icon', 'slider', 'bar', 'arc', 'meter', 'spinner', 'led', 'dropdown', 'roller', 'spinbox', 'qr', 'calendar']],
    ['Data', ['list', 'table', 'chart']],
    ['Layouts', ['column', 'row', 'card', 'free', 'spacer', 'divider']]];
  const ROWICON = { label: 'label', field: 'field', button: 'button', check: 'check', switch: 'switch', icon: 'icon', slider: 'slider', bar: 'bar',
    arc: 'arc', spinner: 'spinner', dropdown: 'dropdown', roller: 'roller', qr: 'qr', list: 'list', table: 'table', chart: 'chart', divider: 'divider',
    calendar: 'calendar', meter: 'meter', spinbox: 'spinbox', led: 'led', keypad: 'keypad', image: 'image' };
  function nodeIcon(n) {
    if (n.type === 'root') return 'screen';
    if (n.type !== 'box') return ROWICON[n.type];
    return n.props.kind === 'card' ? 'card' : n.props.layout === 'row' ? 'row' : n.props.layout === 'column' ? 'column' : 'free';
  }
  function kindName(n) {
    if (n.type === 'root') return 'Screen';
    if (n.type === 'box') return n.props.kind === 'card' ? 'Card' : { row: 'Row', column: 'Column' }[n.props.layout] || 'Free area';
    return Object.keys(W).map(function (k) { return W[k]; }).find(function (w) { return w.type === n.type; }).title;
  }

  /* the attributes of each type: [label, editor, options] */
  const YESNO = 'bool';
  const FLEXMAIN = [['start', 'Start'], ['center', 'Centre'], ['end', 'End'], ['between', 'Space between'], ['around', 'Space around'], ['evenly', 'Space evenly']];
  const FLEXCROSS = [['start', 'Start'], ['center', 'Centre'], ['end', 'End']];
  const A = {
    text: ['Text', 'area'], hint: ['Hint', 'line'], symbol: ['Symbol', 'select', [['', 'None']].concat(SYMBOLS.map(function (s) { return [s, s]; }))],
    font: ['Font size', 'select', FONTS.map(function (f) { return [f, f + ' px']; })], color: ['Colour', 'color'], fg: ['Text colour', 'color'],
    talign: ['Text align', 'select', [['', 'Default'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]],
    long: ['Long text', 'select', [['', 'Wrap'], ['dots', 'End with ...'], ['scroll', 'Scroll round'], ['clip', 'Cut off']]],
    oneline: ['One line', YESNO], password: ['Password', YESNO], max: ['Max length', 'number'], accept: ['Allowed chars', 'line'], kb: ['Keyboard', YESNO],
    checked: ['Checked', YESNO], min: ['Minimum', 'number'], max2: ['Maximum', 'number'], value: ['Value', 'number'],
    options: ['Options', 'area'], selected: ['Selected', 'number'], rows: ['Rows shown', 'number'], size: ['Size', 'number'],
    items: ['Items', 'area'], cells: ['Cells', 'area'], colw: ['Column width', 'number'], values: ['Values', 'line'],
    kind2: ['Chart type', 'select', [['line', 'Line'], ['bar', 'Bars']]],
    iconname: ['Icon', 'select', DRAWN.map(function (s) { return [s, s]; })],
    toggle: ['Toggle', YESNO], date: ['Today (YYYY-MM-DD)', 'line'],
    header: ['Month header', 'select', [['', 'Arrows'], ['dropdown', 'Dropdowns'], ['none', 'None']]],
    ticks: ['Ticks', 'number'], major: ['Major tick every', 'number'], labels: ['Tick labels', 'select', [['', 'Shown'], ['0', 'Hidden']]],
    step: ['Step', 'number'], digits: ['Digits', 'number'], decimals: ['Decimals', 'number'],
    lit: ['Lit', 'select', [['', 'On'], ['0', 'Off']]], keys: ['Keys', 'area'],
    src: ['Picture', 'picture'],
    fit: ['Size', 'select', [['', 'As it is'], ['fit', 'All of it, scaled'], ['stretch', 'Stretched'], ['center', 'Centre, cut'], ['tile', 'Tiled']]]
  };
  const KEYS = { max2: 'max', kind2: 'kind', iconname: 'icon' };   /* one key in the design, two meanings on the panel */
  /* (a label's colour, a button's, the text colour of a checkbox and a dropdown: on the Style panel, as their normal look) */
  const CONTENT = {
    label: ['text', 'symbol', 'font', 'talign', 'long'], field: ['hint', 'text', 'font', 'oneline', 'password', 'max', 'accept', 'kb'],
    button: ['text', 'symbol', 'font', 'toggle', 'checked'], icon: ['iconname', 'color'], check: ['text', 'symbol', 'font', 'checked'],
    switch: ['checked', 'color'], slider: ['min', 'max2', 'value', 'color'], bar: ['min', 'max2', 'value', 'color'], arc: ['min', 'max2', 'value', 'color'],
    spinner: ['color'], dropdown: ['options', 'selected', 'font'], roller: ['options', 'selected', 'rows', 'font'], qr: ['text', 'size'],
    list: ['items', 'font'], table: ['cells', 'colw', 'font'], chart: ['kind2', 'values', 'min', 'max2', 'color'], divider: ['color'],
    calendar: ['date', 'header', 'font'], meter: ['min', 'max2', 'value', 'ticks', 'major', 'labels', 'color', 'font'],
    spinbox: ['min', 'max2', 'value', 'step', 'digits', 'decimals', 'font'], led: ['color', 'lit'], keypad: ['keys', 'font'],
    image: ['src', 'fit'], box: [], root: []
  };
  const VALUE_TYPES = ['switch', 'check', 'slider', 'dropdown', 'roller', 'field', 'arc', 'calendar', 'spinbox', 'keypad'];
  const C_WORDS = 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while body ui e'.split(' ');

  /* ---------------------------------------------------------------- the project */

  let P = null;                      /* { app: { name, file, symbol, color }, screens: [{ name, root }], code: { 'app.c': text }, board, turned, light } */
  let cur = 0;                       /* the screen being edited */
  let sel = null;                    /* the widget selected, or 'app' */
  let multi = [];                    /* two or more widgets of this screen picked with Shift or Cmd / Ctrl; sel is the last */
  let nextId = 1;
  let reserved = {};                 /* names given while a tree is being made */
  let M = null, cfg = null;          /* the renderer */
  let L = { rects: new Map(), body: [0, 44, 1024, 556, 0] };
  let run = null;                    /* { stack: [screen names] } while it runs */
  let zoom = 1, autoFit = true;

  const screen = function () { return P.screens[cur]; };
  const root = function () { return screen().root; };
  function walk(n, f, parent) {
    f(n, parent);
    n.kids.forEach(function (k) { walk(k, f, n); });
  }
  function walkAll(f) { P.screens.forEach(function (s) { walk(s.root, f, null); }); }
  function parentOf(x) {
    let p = null;
    walk(root(), function (n, par) { if (n === x) p = par; }, null);
    return p;
  }
  function byId(id) {
    let f = null;
    walk(root(), function (n) { if (n.id === id) f = n; });
    return f;
  }
  function inside(top, x) {
    let yes = false;
    walk(top, function (n) { if (n === x) yes = true; });
    return yes;
  }
  const isBox = function (n) { return n.type === 'box' || n.type === 'root'; };
  function freshName(base) {
    const used = Object.assign({}, reserved);
    if (P) walkAll(function (n) { used[n.name] = 1; });
    for (let i = 1; ; i++) {
      const name = base + '_' + i;
      if (!used[name]) { reserved[name] = 1; return name; }
    }
  }
  function make(kind, props, kids) {
    const d = W[kind];
    const n = { id: nextId++, type: d.type, name: freshName(d.base || kind), props: Object.assign({}, d.props, props), kids: kids || [] };
    if (kind === 'image' && !n.props.src && P) {
      const first = (P.assets || []).find(function (a) { return a.kind === 'picture'; });
      if (first) n.props.src = first.name;
    }
    return n;
  }
  function makeRoot(props, kids) {
    return { id: nextId++, type: 'root', name: 'root', props: Object.assign({ layout: 'column', gap: '12' }, props), kids: kids || [] };
  }
  function clone(n) {
    const c = JSON.parse(JSON.stringify(n));
    walk(c, function (k) { k.id = nextId++; k.name = freshName(k.name.replace(/_\d+$/, '')); });
    return c;
  }
  function renumber() {
    nextId = 1;
    walkAll(function (n) { nextId = Math.max(nextId, n.id + 1); });
  }

  const TEMPLATES = [
    { title: 'Starter', note: 'Two screens, a card and a button', make: function () {
      const level = make('label', { text: 'Brightness 70%' });
      return [{ name: 'main', root: makeRoot({ cross: 'center', main: 'center', gap: '16' }, [
        make('label', { text: 'Hello', font: '32', an: 'up' }),
        make('label', { text: 'Made with Reload OS Studio', color: 'muted', an: 'fade', andl: '150' }),
        make('card', { w: '70%' }, [
          make('row', { main: 'between' }, [level, make('switch', { checked: '1' })]),
          make('slider', { value: '70', ev1: 'change|text|' + level.name + '|Brightness {value}%' })]),
        make('button', { text: 'More', symbol: 'RIGHT', on: 'screen', onv: 'details', 'sbg:p': 'accent2' })]) },
      { name: 'details', root: makeRoot({ gap: '14' }, [
        make('label', { text: 'Details', font: '24' }),
        make('bar', { value: '40' }),
        make('button', { text: 'Back', symbol: 'LEFT', color: 'surface2', on: 'back' })]) }];
    } },
    { title: 'Dashboard', note: 'Cards of numbers and a chart', make: function () {
      const stat = function (t, v, c) {
        return make('card', { w: 'fill', gap: '2' }, [make('label', { text: t, color: 'muted', font: '14' }), make('label', { text: v, font: '32', color: c })]);
      };
      return [{ name: 'main', root: makeRoot({ gap: '14' }, [
        make('row', { cross: 'start', gap: '14' }, [stat('Today', '128', 'accent'), stat('Week', '902', 'accent2'), stat('Errors', '0', 'ok')]),
        make('card', { h: 'fill' }, [make('label', { text: 'Last hours', color: 'muted', font: '14' }), make('chart', { h: 'fill' })])]) }];
    } },
    { title: 'Form', note: 'Fields, choices and Save', make: function () {
      return [{ name: 'main', root: makeRoot({ gap: '14' }, [
        make('label', { text: 'Settings', font: '24' }),
        make('card', {}, [
          make('field', { hint: 'Name' }),
          make('dropdown', { w: 'fill' }),
          make('row', { main: 'between' }, [make('label', { text: 'Sound' }), make('switch', {})])]),
        make('button', { text: 'Save', symbol: 'SAVE', on: 'toast', onv: 'Saved' })]) }];
    } },
    { title: 'Empty', note: 'One empty screen', make: function () {
      return [{ name: 'main', root: makeRoot({}, []) }];
    } }
  ];
  function newProject(t, keep) {
    P = null;
    nextId = 1;
    reserved = {};
    const screens = t.make();
    reserved = {};
    P = { format: FORMAT, version: 1, app: { name: 'My app', file: 'myapp', symbol: 'LIST', color: '#6B4FBB' }, screens: screens, code: {},
          board: keep ? keep.board : 'jc', turned: keep ? keep.turned : false, light: keep ? keep.light : false, assets: [] };
    cur = 0;
    sel = root();
    assetsReplace({});
  }

  /* ---------------------------------------------------------------- the assets: pictures and sounds
   * P.assets says what there is ({ name, kind: 'picture' | 'sound', w, h, ms, bytes }); the bytes are in DATA, kept in
   * this browser's IndexedDB (the design in localStorage would not hold them), in a .design file as base64, and in the
   * renderer (sim_design_asset). A picture is a PNG, at most the screen's size; a sound a WAV, 16-bit mono at 16 kHz,
   * which the device plays as it is. In the app they are files of main/assets/, embedded in the .elf. */
  const DATA = {};
  const KIND = { picture: 'p'.charCodeAt(0), sound: 's'.charCodeAt(0) };
  const EXT = { picture: 'png', sound: 'wav' };
  const SOUND_MAX_S = 60;
  let idb = null;
  function store(mode) {
    return new Promise(function (ok, no) {
      if (idb) return ok(idb.transaction('assets', mode).objectStore('assets'));
      const r = indexedDB.open('ros-studio', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('assets'); };
      r.onsuccess = function () { idb = r.result; ok(idb.transaction('assets', mode).objectStore('assets')); };
      r.onerror = function () { no(r.error); };
    });
  }
  function idbPut(name, data) { store('readwrite').then(function (st) { st.put(data, name); }).catch(function () {}); }
  function idbDel(name) { store('readwrite').then(function (st) { st.delete(name); }).catch(function () {}); }
  function idbAll() {
    return store('readonly').then(function (st) {
      return new Promise(function (ok) {
        const o = {}, c = st.openCursor();
        c.onsuccess = function () { const k = c.result; if (!k) return ok(o); o[k.key] = new Uint8Array(k.value); k.continue(); };
        c.onerror = function () { ok(o); };
      });
    }).catch(function () { return {}; });
  }
  function toEngine(name) {
    if (!M) return;
    const a = (P.assets || []).find(function (x) { return x.name === name; }), d = DATA[name];
    if (!a || !d) return;
    const ptr = M.ccall('sim_design_asset_buf', 'number', ['number'], [d.length]);
    M.HEAPU8.set(d, ptr);
    M.ccall('sim_design_asset', null, ['string', 'number', 'number', 'number'], [name, KIND[a.kind], ptr, d.length]);
  }
  function fromEngine(name, kind) {
    if (M) M.ccall('sim_design_asset', null, ['string', 'number', 'number', 'number'], [name, KIND[kind], 0, 0]);
  }
  /* every asset at once (New, Open): the old ones gone, here and in the browser's store */
  function assetsReplace(data) {
    Object.keys(DATA).forEach(function (k) {
      const a = (P && P.assets || []).find(function (x) { return x.name === k; });
      fromEngine(k, a ? a.kind : 'picture');
      fromEngine(k, a && a.kind === 'picture' ? 'sound' : 'picture');
      delete DATA[k];
    });
    store('readwrite').then(function (st) { st.clear(); Object.keys(data).forEach(function (k) { st.put(data[k], k); }); }).catch(function () {});
    Object.keys(data).forEach(function (k) { DATA[k] = data[k]; toEngine(k); });
  }
  function assetName(file) {
    let b = file.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!/^[a-z]/.test(b)) b = 'a_' + b;
    b = b.slice(0, 20);
    const used = {};
    (P.assets || []).forEach(function (a) { used[a.name] = 1; });
    if (!used[b]) return b;
    for (let i = 2; ; i++) if (!used[b + '_' + i]) return b + '_' + i;
  }
  function wav16(samples, rate) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = function (o, t) { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return new Uint8Array(buf);
  }
  /* a file into an asset: a picture as a PNG no larger than the screen, a sound as a 16 kHz mono WAV */
  function importAsset(file) {
    const name = assetName(file.name);
    const picture = /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
    const work = picture
      ? createImageBitmap(file).then(function (bmp) {
          const sz = size(), k = Math.min(1, Math.max(sz.w, sz.h) / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(bmp.width * k));
          c.height = Math.max(1, Math.round(bmp.height * k));
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          return new Promise(function (ok) { c.toBlob(ok, 'image/png'); }).then(function (b) { return b.arrayBuffer(); }).then(function (ab) {
            return { meta: { name: name, kind: 'picture', w: c.width, h: c.height, bytes: ab.byteLength }, data: new Uint8Array(ab),
                     note: k < 1 ? ' (made ' + c.width + ' x ' + c.height + ', the screen\'s size)' : '' };
          });
        })
      : file.arrayBuffer().then(function (ab) {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          return ctx.decodeAudioData(ab).then(function (buf) {
            ctx.close();
            const secs = Math.min(buf.duration, SOUND_MAX_S), off = new OfflineAudioContext(1, Math.max(1, Math.ceil(secs * 16000)), 16000);
            const src = off.createBufferSource();
            src.buffer = buf;
            src.connect(off.destination);
            src.start();
            return off.startRendering().then(function (out) {
              const d = wav16(out.getChannelData(0), 16000);
              return { meta: { name: name, kind: 'sound', ms: Math.round(secs * 1000), bytes: d.length }, data: d,
                       note: buf.duration > SOUND_MAX_S ? ' (the first ' + SOUND_MAX_S + ' s)' : '' };
            });
          });
        });
    return work.then(function (r) {
      P.assets = (P.assets || []).concat([r.meta]);
      DATA[name] = r.data;
      idbPut(name, r.data);
      toEngine(name);
      keep();
      msg('Added ' + (picture ? 'the picture ' : 'the sound ') + name + r.note);
      return r.meta;
    }, function () {
      msg('"' + file.name + '" is not a ' + (picture ? 'picture' : 'sound') + ' this browser can read');
      return null;
    });
  }
  function assetFiles(kind) {
    return new Promise(function (ok) {
      const i = $('#asset-file');
      i.accept = kind === 'picture' ? 'image/*' : kind === 'sound' ? 'audio/*,.wav,.mp3,.ogg,.m4a' : 'image/*,audio/*,.wav,.mp3,.ogg,.m4a';
      i.onchange = function () {
        const files = Array.from(i.files);
        i.value = '';
        files.reduce(function (pr, f) { return pr.then(function (list) { return importAsset(f).then(function (m) { return m ? list.concat([m]) : list; }); }); },
                     Promise.resolve([])).then(function (list) { project(); attrs(); lintSoon(); ok(list); });
      };
      i.click();
    });
  }
  function assetDelete(name) {
    const a = P.assets.find(function (x) { return x.name === name; });
    if (!a || !confirm('Delete the ' + a.kind + ' "' + name + '"? What uses it shows nothing.')) return;
    P.assets = P.assets.filter(function (x) { return x !== a; });
    delete DATA[name];
    idbDel(name);
    fromEngine(name, a.kind);
    if (assetSel === name) assetSel = null;
    keep();
    all();
  }
  /* a new name: what uses it follows */
  function assetRename(a, v) {
    if (!/^[a-z][a-z0-9_]{0,22}$/.test(v) || P.assets.some(function (x) { return x !== a && x.name === v; })) return false;
    const old = a.name;
    walkAll(function (n) {
      if (n.type === 'image' && n.props.src === old) n.props.src = v;
      if (n.type === 'root' && n.props.sound === old) n.props.sound = v;
    });
    renameRefs('sound', old, v);
    fromEngine(old, a.kind);
    DATA[v] = DATA[old];
    delete DATA[old];
    idbDel(old);
    idbPut(v, DATA[v]);
    a.name = v;
    toEngine(v);
    if (assetSel === old) assetSel = v;
    return true;
  }
  /* Run, and a sound's Play: the browser plays it (the renderer has no speaker) */
  let audio = null, playing = null;
  function playAsset(name) {
    const d = DATA[name];
    if (!d) return;
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (playing) { try { playing.stop(); } catch (e) { /* ended */ } }
    audio.decodeAudioData(d.slice().buffer).then(function (buf) {
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      src.start();
      playing = src;
    }, function () {});
  }
  function b64(d) {
    let t = '';
    for (let i = 0; i < d.length; i += 0x8000) t += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(t);
  }
  function unb64(t) {
    const s = atob(t), d = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) d[i] = s.charCodeAt(i);
    return d;
  }
  /* what the code uses: only those go into the app */
  function usedAssets() {
    if (!M) return { pictures: [], sounds: [] };
    M.ccall('sim_design_load', 'string', ['string', 'string'], [designText(), screen().name]);
    return JSON.parse(M.ccall('sim_design_used', 'string', [], []));
  }
  function usedFiles() {
    const u = usedAssets();
    return u.pictures.map(function (n) { return n + '.png'; }).concat(u.sounds.map(function (n) { return n + '.wav'; }));
  }

  /* ---------------------------------------------------------------- history, saving */

  const undo = [], redo = [];
  let last = '';
  function state() { return JSON.stringify({ app: P.app, screens: P.screens, code: P.code }); }
  function commit() {
    const s = state();
    if (s === last) return;
    undo.push(last);
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    last = s;
    keep();
    tools();
  }
  function keep() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) { /* the design stays in the page */ }
  }
  let assetSel = null;                 /* an asset shown in Attributes instead of a widget */
  function restore(s) {
    const o = JSON.parse(s), id = sel && sel !== 'app' ? sel.id : 0;
    P.app = o.app;
    P.screens = o.screens;
    P.code = o.code;
    last = s;
    cur = Math.min(cur, P.screens.length - 1);
    sel = byId(id) || root();
    multi = [];
    renumber();
    keep();
    all();
  }
  function tools() {
    $('#e-undo').disabled = !undo.length;
    $('#e-redo').disabled = !redo.length;
  }
  $('#e-undo').addEventListener('click', doUndo);
  $('#e-redo').addEventListener('click', doRedo);
  function doUndo() { if (undo.length) { redo.push(state()); restore(undo.pop()); tools(); } }
  function doRedo() { if (redo.length) { undo.push(state()); restore(redo.pop()); tools(); } }

  /* ---------------------------------------------------------------- the renderer */

  function board() { return BOARDS.find(function (b) { return b.id === P.board; }) || BOARDS[0]; }
  function size() {
    const b = board();
    return P.turned ? { w: b.h, h: b.w } : { w: b.w, h: b.h };
  }
  function designText() {
    const o = ['A ' + P.app.name.replace(/\n/g, ' ')];
    const esc = function (v) { return String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n'); };
    P.screens.forEach(function (s) {
      o.push('S ' + s.name);
      walk(s.root, function (n, par) {
        o.push('N ' + n.id + ' ' + (par ? par.id : 0) + ' ' + n.type + ' ' + n.name);
        for (const k in n.props) if (n.props[k] !== '' && n.props[k] != null) o.push('P ' + k + ' ' + esc(n.props[k]));
      }, null);
    });
    return o.join('\n') + '\n';
  }
  /* the design into the renderer: it answers with where everything is */
  function refresh() {
    if (!M) return;
    const r = JSON.parse(M.ccall('sim_design_load', 'string', ['string', 'string'], [designText(), screen().name]));
    if (r.rects) {
      L = { rects: new Map(), body: r.body };
      r.rects.forEach(function (a) { L.rects.set(a[0], { x: a[1], y: a[2], w: a[3], h: a[4] }); });
    }
    marks();
    codeSoon();
    lintSoon();
    thumbSoon();
  }
  const refreshSoon = (function () {
    let on = false;
    return function () {
      if (on) return;
      on = true;
      requestAnimationFrame(function () { on = false; refresh(); });
    };
  })();

  let img = null, ctx = null;
  function frame(ptr, w, h, depth) {
    const canvas = $('#screen'), mem = (M || cfg).HEAPU8;
    if (canvas.width !== w || canvas.height !== h || !img) {
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext('2d');
      img = ctx.createImageData(w, h);
    }
    const d = img.data, n = w * h;
    if (depth === 16) {
      for (let i = 0, s = ptr, o = 0; i < n; i++, s += 2, o += 4) {
        const v = mem[s] | mem[s + 1] << 8;
        d[o] = (v >> 8 & 0xF8) | v >> 13;
        d[o + 1] = (v >> 3 & 0xFC) | (v >> 9 & 3);
        d[o + 2] = (v << 3 & 0xF8) | (v >> 2 & 7);
        d[o + 3] = 255;
      }
    } else {
      for (let i = 0, s = ptr, o = 0; i < n; i++, s += 3, o += 4) {
        d[o] = mem[s + 2];
        d[o + 1] = mem[s + 1];
        d[o + 2] = mem[s];
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function fail(msg) {
    const b = $('#boot');
    b.textContent = msg;
    b.classList.add('err');
    b.hidden = false;
  }
  function boot() {
    if (typeof WebAssembly !== 'object') return fail('This browser cannot run WebAssembly.');
    /* the UI's tasks run on threads: SharedArrayBuffer, which a browser gives a cross-origin isolated page only */
    if (!window.crossOriginIsolated) return fail('Studio needs this page served with cross-origin isolation (website/serve.py, website/apache).');
    const s = size(), js = document.createElement('script');
    js.src = ENGINE + '.js';
    js.onerror = function () { fail('The renderer is not on this copy of the site (tools/sim/web.sh builds it).'); };
    js.onload = function () {
      cfg = {
        arguments: [s.w + 'x' + s.h, 'theme', P.light ? '1' : '0', 'free', '0', 'wifi', 'connected', 'designer'],
        locateFile: function (p) { return '../sim/' + p; },
        print: function () {},
        printErr: function (t) { if (window.console) console.log('[Reload OS] ' + t); },
        onAbort: function () { fail('The renderer stopped: reload the page. The design is kept.'); },
        simFrame: frame,
        simReady: function () { setTimeout(refresh, 0); },
        simOpen: function (name) {             /* Run: an "open a screen" action */
          if (!run) return;
          run.stack.push(name);
          setTimeout(function () { showInRun(name); }, 0);
        },
        simSound: function (name) { if (run) playAsset(name); },
        simGoBack: function () {
          if (!run || run.stack.length < 2) return 0;
          run.stack.pop();
          setTimeout(function () { showInRun(run.stack[run.stack.length - 1]); }, 0);
          return 1;
        }
      };
      window.RosSim(cfg).then(function (m) {
        M = m;
        Object.keys(DATA).forEach(toEngine);
        M.ccall('sim_design_app', null, ['string'], [P.app.name]);
        $('#boot').hidden = true;
        refresh();
      }, function () { fail('The renderer did not start.'); });
    };
    document.body.append(js);
  }
  function showInRun(name) {
    M.ccall('sim_design_load', 'string', ['string', 'string'], [designText(), name]);
  }
  /* another board, way round or theme: the shell is built again; simReady says when */
  function applyScreen() {
    const s = size();
    placeFrame();
    if (M) M._sim_design_screen(s.w, s.h, P.light ? 1 : 0);
    $('#size').textContent = s.w + ' × ' + s.h;
    $('#light').setAttribute('aria-pressed', P.light ? 'true' : 'false');
    keep();
  }

  /* ---------------------------------------------------------------- the surface: what the page draws over the screen */

  const overlay = $('#overlay'), stage = $('#stage'), frameEl = $('#frame');
  let hover = null, drag = null, outlines = false, editing = null;

  function placeFrame() {
    const s = size();
    if (autoFit) {
      const a = stage.clientWidth - 64, b = stage.clientHeight - 64;
      if (a > 0 && b > 0) zoom = Math.min(1, a / s.w, b / s.h);
    }
    frameEl.style.width = Math.round(s.w * zoom) + 'px';
    frameEl.style.height = Math.round(s.h * zoom) + 'px';
    frameEl.classList.toggle('zoomed', zoom > 1);
    $('#zoom-fit').textContent = Math.round(zoom * 100) + '%';
    marks();
  }
  new ResizeObserver(function () { if (autoFit) placeFrame(); }).observe(stage);
  function box(r, cls) {
    const m = el('div', { class: 'mark ' + cls });
    m.style.cssText = 'left:' + r.x * zoom + 'px;top:' + r.y * zoom + 'px;width:' + r.w * zoom + 'px;height:' + r.h * zoom + 'px';
    return m;
  }
  function marks() {
    const inline = editing;
    overlay.replaceChildren();
    if (inline) overlay.append(inline);
    if (run) return;
    if (outlines) walk(root(), function (n) {
      const r = L.rects.get(n.id);
      if (r && r.w && n.type !== 'root') overlay.append(box(r, 'ol'));
    });
    if (hover && hover !== sel) {
      const r = L.rects.get(hover.id);
      if (r) overlay.append(box(r, 'hover'));
    }
    if (multi.length > 1) multi.forEach(function (n) {
      const r = L.rects.get(n.id);
      if (r) overlay.append(box(r, 'sel multi'));
    });
    else if (sel && sel !== 'app') {
      const r = L.rects.get(sel.id);
      if (r) {
        const m = box(r, 'sel' + (r.y < 24 ? ' low' : ''));
        m.append(el('span', { class: 'tag' }, sel.type === 'root' ? screen().name : sel.name));
        if (sel.type !== 'root' && !(drag && drag.kind !== 'resize')) ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].forEach(function (h) {
          const px = { n: 50, s: 50, e: 100, w: 0, ne: 100, se: 100, nw: 0, sw: 0 }[h], py = { w: 50, e: 50, n: 0, s: 100, nw: 0, ne: 0, sw: 100, se: 100 }[h];
          const d = el('div', { class: 'handle', 'data-h': h });
          d.style.cssText = 'left:' + px + '%;top:' + py + '%;cursor:' + h + '-resize';
          m.append(d);
        });
        overlay.append(m);
      }
    }
    if (drag && drag.drop) dropMark(drag.drop);
    if (drag && drag.guides) drag.guides.forEach(function (g) {
      const m = el('div', { class: 'mark guide' });
      m.style.cssText = g.x != null ? 'left:' + g.x * zoom + 'px;top:' + g.a * zoom + 'px;width:1px;height:' + (g.b - g.a) * zoom + 'px'
        : 'top:' + g.y * zoom + 'px;left:' + g.a * zoom + 'px;height:1px;width:' + (g.b - g.a) * zoom + 'px';
      overlay.append(m);
    });
  }
  /* a widget moved in a free area lines up with the area's and its neighbours' edges and middles (Alt: not) */
  function snap(d, dx, dy) {
    const r0 = d.r0, par = d.par, pr = L.rects.get(par.id), t = 6 / zoom, ins = pad(par);
    if (!r0 || !pr) return { dx: 0, dy: 0, guides: null };
    const m = { x: r0.x + dx, y: r0.y + dy, w: r0.w, h: r0.h };
    const others = [{ x: pr.x + ins, y: pr.y + ins, w: pr.w - ins * 2, h: pr.h - ins * 2 }];
    par.kids.forEach(function (k) { const r = L.rects.get(k.id); if (k !== d.node && r && r.w) others.push(r); });
    let bx = null, by = null;
    others.forEach(function (o) {
      [o.x, o.x + o.w / 2, o.x + o.w].forEach(function (tx) {
        [m.x, m.x + m.w / 2, m.x + m.w].forEach(function (mx) {
          const diff = tx - mx;
          if (Math.abs(diff) <= t && (!bx || Math.abs(diff) < Math.abs(bx.d))) bx = { d: diff, x: tx, o: o };
        });
      });
      [o.y, o.y + o.h / 2, o.y + o.h].forEach(function (ty) {
        [m.y, m.y + m.h / 2, m.y + m.h].forEach(function (my) {
          const diff = ty - my;
          if (Math.abs(diff) <= t && (!by || Math.abs(diff) < Math.abs(by.d))) by = { d: diff, y: ty, o: o };
        });
      });
    });
    const sx = bx ? Math.round(bx.d) : 0, sy = by ? Math.round(by.d) : 0, guides = [];
    if (bx) guides.push({ x: bx.x, a: Math.min(m.y + sy, bx.o.y), b: Math.max(m.y + sy + m.h, bx.o.y + bx.o.h) });
    if (by) guides.push({ y: by.y, a: Math.min(m.x + sx, by.o.x), b: Math.max(m.x + sx + m.w, by.o.x + by.o.w) });
    return { dx: sx, dy: sy, guides: guides.length ? guides : null };
  }
  function dropMark(d) {
    const r = L.rects.get(d.box.id);
    if (!r) return;
    overlay.append(box(r, 'dropbox'));
    if (d.line) overlay.append(box(d.line, 'dropline'));
  }
  function toScreen(e) {
    const r = frameEl.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }
  const within = function (r, p) { return r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h; };
  function hit(p) {                    /* the deepest widget under the pointer; a locked one is passed over */
    let f = null;
    walk(root(), function (n) { const r = L.rects.get(n.id); if (r && r.w && within(r, p) && n.props.locked !== '1') f = n; });
    return f;
  }
  function pad(n) {
    if (n.props.pad != null && n.props.pad !== '') return +n.props.pad;
    return n.type === 'root' ? 20 : n.props.kind === 'card' ? 16 : 0;
  }
  /* where a drop lands: the deepest box under the pointer; in a flow, between which two; in a free area, the place */
  function dropAt(p, moving) {
    let b = root();
    walk(root(), function (n) {
      if (isBox(n) && !(moving && inside(moving, n)) && within(L.rects.get(n.id), p)) b = n;
    });
    const r = L.rects.get(b.id), lay = b.props.layout;
    if (lay !== 'row' && lay !== 'column') {
      const g = function (v) { return Math.round(v / 4) * 4; };
      return { box: b, index: b.kids.length, x: g(p.x - r.x - pad(b)), y: g(p.y - r.y - pad(b)) };
    }
    const col = lay === 'column', kids = b.kids.filter(function (k) { return k !== moving; });
    let i = kids.findIndex(function (k) {
      const q = L.rects.get(k.id);
      return q && (col ? p.y < q.y + q.h / 2 : p.x < q.x + q.w / 2);
    });
    if (i < 0) i = kids.length;
    const before = kids[i] && L.rects.get(kids[i].id), after = kids[i - 1] && L.rects.get(kids[i - 1].id), t = 3 / zoom, ins = pad(b);
    let line;
    if (col) {
      const y = after ? after.y + after.h + (before ? (before.y - after.y - after.h) / 2 : 2) : before ? before.y - 2 : r.y + ins;
      line = { x: r.x + ins, y: y - t / 2, w: Math.max(r.w - ins * 2, 8), h: t };
    } else {
      const x = after ? after.x + after.w + (before ? (before.x - after.x - after.w) / 2 : 2) : before ? before.x - 2 : r.x + ins;
      line = { x: x - t / 2, y: r.y + ins, w: t, h: Math.max(r.h - ins * 2, 8) };
    }
    return { box: b, index: i, line: line };
  }
  function place(n, d) {
    const par = parentOf(n);
    if (par) par.kids.splice(par.kids.indexOf(n), 1);
    d.box.kids.splice(d.index, 0, n);
    if (d.x != null) {
      n.props.align = 'tl';
      n.props.x = String(d.x);
      n.props.y = String(d.y);
    } else {
      delete n.props.x;
      delete n.props.y;
      delete n.props.align;
    }
  }
  function changed() {
    refreshSoon();
    tree();
    commit();
  }

  overlay.addEventListener('pointerdown', function (e) {
    if (!M || e.button) return;
    const p = toScreen(e);
    if (run) {
      overlay.setPointerCapture(e.pointerId);
      drag = { kind: 'run' };
      M._sim_pointer(Math.round(p.x), Math.round(p.y), 1);
      return;
    }
    if (e.target.classList.contains('inline')) return;
    endInline();
    const h = e.target.dataset.h;
    if (h) {
      const r = L.rects.get(sel.id);
      drag = { kind: 'resize', h: h, node: sel, from: p, w: r.w, h0: r.h, x: +(sel.props.x || 0), y: +(sel.props.y || 0) };
      overlay.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const n = hit(p) || root();
    if (e.shiftKey || e.metaKey || e.ctrlKey) { togglePick(n); return; }
    if (multi.length > 1 && multi.includes(n)) {          /* the ones picked go together (in free areas) */
      drag = { kind: 'press', node: n, from: p, group: multi.map(function (m) { return { n: m, x: +(m.props.x || 0), y: +(m.props.y || 0), par: parentOf(m) }; }) };
      overlay.setPointerCapture(e.pointerId);
      return;
    }
    select(n);
    if (n.type !== 'root') {
      const r = L.rects.get(n.id);
      drag = { kind: 'press', node: n, from: p, x: +(n.props.x || 0), y: +(n.props.y || 0), par: parentOf(n), r0: r ? Object.assign({}, r) : null };
      overlay.setPointerCapture(e.pointerId);
    }
  });
  overlay.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (run || !M) return;
    const n = hit(toScreen(e)) || root();
    if (!picked().includes(n)) select(n);
    widgetMenu(e);
  });
  overlay.addEventListener('pointermove', function (e) {
    const p = toScreen(e);
    $('#pos').textContent = run ? '' : Math.max(0, Math.round(p.x)) + ', ' + Math.max(0, Math.round(p.y));
    if (run) {
      if (drag && drag.kind === 'run') M._sim_pointer(Math.round(p.x), Math.round(p.y), 1);
      return;
    }
    if (!drag) {
      const n = hit(p);
      if (n !== hover) { hover = n; marks(); }
      return;
    }
    if (drag.kind === 'resize') return resize(drag, p, e);
    if (drag.kind === 'press' && Math.hypot(p.x - drag.from.x, p.y - drag.from.y) * zoom > 4) drag.kind = 'move';
    if (drag.kind !== 'move') return;
    const g = function (v) { return e.altKey ? Math.round(v) : Math.round(v / 4) * 4; };
    if (drag.group) {                                    /* several: each by as much, where its area is free */
      drag.group.forEach(function (m) {
        if (!(m.par && (m.par.props.layout === 'free' || !m.par.props.layout))) return;
        m.n.props.x = String(m.x + g(p.x - drag.from.x));
        m.n.props.y = String(m.y + g(p.y - drag.from.y));
      });
      refreshSoon();
      return;
    }
    const par = drag.par, free = par.props.layout === 'free' || !par.props.layout, d = dropAt(p, drag.node);
    if (free && d.box === par) {
      /* within a free area: the widget itself follows, in 4 px steps, and lines up with what is near */
      let dx = g(p.x - drag.from.x), dy = g(p.y - drag.from.y);
      drag.guides = null;
      if (!e.altKey) {
        const s2 = snap(drag, dx, dy);
        dx += s2.dx;
        dy += s2.dy;
        drag.guides = s2.guides;
      }
      drag.node.props.x = String(drag.x + dx);
      drag.node.props.y = String(drag.y + dy);
      drag.drop = null;
      refreshSoon();
    } else {
      drag.guides = null;
      drag.drop = d;
      marks();
    }
  });
  function resize(d, p, e) {
    const dx = p.x - d.from.x, dy = p.y - d.from.y, g = function (v) { return e.altKey ? Math.round(v) : Math.round(v / 4) * 4; };
    const n = d.node, h = d.h;
    if (/e/.test(h)) n.props.w = String(Math.max(4, g(d.w + dx)));
    if (/s/.test(h)) n.props.h = String(Math.max(4, g(d.h0 + dy)));
    const par = parentOf(n), free = par && (par.props.layout === 'free' || !par.props.layout) && (n.props.align || 'tl') === 'tl';
    if (/w/.test(h)) {
      n.props.w = String(Math.max(4, g(d.w - dx)));
      if (free) n.props.x = String(d.x + g(dx));
    }
    if (/n/.test(h)) {
      n.props.h = String(Math.max(4, g(d.h0 - dy)));
      if (free) n.props.y = String(d.y + g(dy));
    }
    refreshSoon();
  }
  overlay.addEventListener('pointerup', function (e) {
    const d = drag;
    drag = null;
    if (run) {
      const p = toScreen(e);
      M._sim_pointer(Math.round(p.x), Math.round(p.y), 0);
      return;
    }
    if (!d) return;
    if (d.kind === 'press' && d.group) { select(d.node); return; }      /* a click in the picked ones: that one */
    if (d.kind === 'move' && d.drop) place(d.node, d.drop);
    if (d.kind === 'move' || d.kind === 'resize') {
      changed();
      attrs();
    }
    marks();
  });
  overlay.addEventListener('pointerleave', function () { if (hover) { hover = null; marks(); } });
  overlay.addEventListener('dblclick', function (e) {
    if (run) return;
    const n = hit(toScreen(e));
    if (!n) return;
    const key = 'text' in n.props ? 'text' : 'hint' in n.props ? 'hint' : null;
    if (!key || n.type === 'qr') return;
    const r = L.rects.get(n.id);
    const inp = el('input', { class: 'inline', value: n.props[key], 'aria-label': 'Text' });
    inp.style.cssText = 'left:' + r.x * zoom + 'px;top:' + r.y * zoom + 'px;width:' + Math.max(r.w * zoom, 90) + 'px';
    editing = inp;
    inp.addEventListener('input', function () { n.props[key] = inp.value; refreshSoon(); });
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter' || ev.key === 'Escape') endInline();
    });
    inp.addEventListener('blur', endInline);
    marks();
    inp.select();
  });
  function endInline() {
    if (!editing) return;
    editing = null;
    marks();
    attrs();
    commit();
  }
  /* the wheel with Ctrl (a pinch on a trackpad) zooms */
  stage.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });
  function setZoom(z) {
    autoFit = false;
    zoom = Math.max(0.2, Math.min(3, z));
    placeFrame();
  }

  /* ---------------------------------------------------------------- selecting */

  function select(n) {
    if (n === sel && !assetSel && !multi.length) return;
    assetSel = null;
    multi = [];
    sel = n;
    marks();
    tree();
    project();
    attrs();
    markCode();
  }
  function all() {
    refresh();
    project();
    tree();
    attrs();
    code();
  }
  function setScreen(i) {
    cur = i;
    sel = root();
    multi = [];
    hover = null;
    all();
  }

  /* ---------------------------------------------------------------- the palette */

  function palette() {
    const q = $('#pal-search').value.trim().toLowerCase(), p = $('#palette');
    p.replaceChildren();
    PALETTE.forEach(function (g) {
      const items = g[1].filter(function (k) { return !q || W[k].title.toLowerCase().includes(q); });
      if (!items.length) return;
      p.append(el('div', { class: 'pal-group' }, g[0]));
      items.forEach(function (k) {
        const it = el('div', { class: 'pal-item', title: 'Drag it to the screen, or click to add it', role: 'button', tabindex: '0' }, icon(k), W[k].title);
        it.addEventListener('pointerdown', function (e) { paletteDrag(e, k); });
        it.addEventListener('keydown', function (e) { if (e.key === 'Enter') addTo(k); });
        p.append(it);
      });
    });
  }
  $('#pal-search').addEventListener('input', palette);
  function addTo(kind) {
    let b = sel && sel !== 'app' ? sel : root();
    if (!isBox(b)) b = parentOf(b) || root();
    reserved = {};
    const n = make(kind);
    b.kids.push(n);
    sel = n;
    all();
    commit();
  }
  function paletteDrag(e, kind) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null, drop = null;
    const move = function (ev) {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) {
        ghost = el('div', { class: 'ghost' }, W[kind].title);
        document.body.append(ghost);
      }
      if (!ghost) return;
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      const r = frameEl.getBoundingClientRect(), over = ev.clientX >= r.left && ev.clientX < r.right && ev.clientY >= r.top && ev.clientY < r.bottom && stage.offsetParent;
      drop = over && M && !run ? dropAt(toScreen(ev), null) : null;
      drag = drop ? { kind: 'new', drop: drop } : null;
      marks();
    };
    const up = function () {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      const moved = !!ghost;
      if (ghost) ghost.remove();
      drag = null;
      if (!moved) { if (!run) addTo(kind); return; }
      if (drop) {
        reserved = {};
        const n = make(kind);
        place(n, drop);
        sel = n;
        all();
        commit();
      } else marks();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  /* ---------------------------------------------------------------- the component tree */

  let dragRow = null;
  function tree() {
    const t = $('#tree'), top = t.scrollTop;
    t.replaceChildren();
    const rowOf = function (n, depth) {
      const eye = n.type === 'root' ? null : el('button', { class: 'act' + (n.props.hidden === '1' ? ' keep' : ''), title: n.props.hidden === '1' ? 'Hidden: show it' : 'Hide it',
        onclick: function (e) {
          e.stopPropagation();
          if (n.props.hidden === '1') delete n.props.hidden; else n.props.hidden = '1';
          changed();
        } }, n.props.hidden === '1' ? '◌' : '●');
      const locked = n.props.locked === '1';
      const lock = n.type === 'root' ? null : el('button', { class: 'act' + (locked ? ' keep' : ''), title: locked ? 'Locked: the screen does not pick it. Unlock it' :
        'Lock it: the screen does not pick it or move it', 'aria-label': locked ? 'Unlock it' : 'Lock it', onclick: function (e) {
          e.stopPropagation();
          if (locked) delete n.props.locked; else n.props.locked = '1';
          tree();
          commit();
        } }, icon(locked ? 'lock' : 'unlock'));
      const r = el('div', { class: 'row' + (n === sel || multi.includes(n) ? ' on' : ''), role: 'treeitem', draggable: n.type === 'root' ? null : 'true',
        onclick: function (e) { if (e.shiftKey || e.metaKey || e.ctrlKey) togglePick(n); else select(n); },
        oncontextmenu: function (e) {
          e.preventDefault();
          if (!picked().includes(n)) select(n);
          widgetMenu(e);
        },
        ondragstart: function (e) { dragRow = n; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.name); },
        ondragend: function () { dragRow = null; },
        ondragover: function (e) {
          if (!dragRow || inside(dragRow, n)) return;
          e.preventDefault();
          const b = r.getBoundingClientRect(), f = (e.clientY - b.top) / b.height, canIn = isBox(n);
          const where = n.type === 'root' ? 'in' : canIn ? (f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'in') : (f < 0.5 ? 'before' : 'after');
          r.dataset.where = where;
          r.classList.remove('drop-before', 'drop-after', 'drop-in');
          r.classList.add('drop-' + where);
        },
        ondragleave: function () { r.classList.remove('drop-before', 'drop-after', 'drop-in'); },
        ondrop: function (e) {
          e.preventDefault();
          if (!dragRow || inside(dragRow, n)) return;
          const where = r.dataset.where, m = dragRow, p = parentOf(n);
          if (where === 'in') place(m, { box: n, index: n.kids.length, x: n.props.layout === 'free' ? 0 : null, y: 0 });
          else {
            const list = p.kids.filter(function (k) { return k !== m; }), i = list.indexOf(n) + (where === 'after' ? 1 : 0);
            place(m, { box: p, index: i, x: p.props.layout === 'free' ? 0 : null, y: 0 });
          }
          dragRow = null;
          changed();
        } }, icon(nodeIcon(n)), el('span', { class: 'name' }, n.type === 'root' ? screen().name : n.name), n.type === 'root' ? null : el('span', { class: 'kind' }, kindName(n)), lock, eye);
      r.style.paddingLeft = 6 + depth * 14 + 'px';
      t.append(r);
      n.kids.forEach(function (k) { rowOf(k, depth + 1); });
    };
    rowOf(root(), 0);
    t.scrollTop = top;
  }

  /* ---------------------------------------------------------------- the project panel */

  const FILES = ['main/ui.c', 'main/ui.h', 'main/app.c', 'CMakeLists.txt', 'main/CMakeLists.txt', 'main/idf_component.yml', 'README.md'];
  let codeFile = 'main/ui.c', mode = 'design';
  function project() {
    const p = $('#project');
    p.replaceChildren();
    p.append(el('div', { class: 'row' + (sel === 'app' ? ' on' : ''), onclick: function () { select('app'); } }, icon('app'), el('span', { class: 'name' }, P.app.name)));
    p.append(el('div', { class: 'group' }, 'Screens', el('button', { title: 'New screen', 'aria-label': 'New screen', onclick: addScreen }, '+')));
    P.screens.forEach(function (s, i) {
      const pic = thumbs[s.name] ? el('img', { class: 'thumb', src: thumbs[s.name], alt: '', 'data-screen': s.name }) : icon('screen');
      p.append(el('div', { class: 'row' + (i === cur ? ' on' : ''), title: thumbs[s.name] ? null : 'Its picture comes when it has been shown', onclick: function () { setScreen(i); } }, pic, el('span', { class: 'name' }, s.name),
        i === 0 ? el('span', { class: 'kind' }, 'first') : null,
        P.screens.length > 1 ? el('button', { class: 'act', title: 'Delete the screen', onclick: function (e) { e.stopPropagation(); delScreen(i); } }, '×') : null));
    });
    p.append(el('div', { class: 'group' }, 'Assets', el('button', { title: 'Add pictures or sounds', 'aria-label': 'Add pictures or sounds',
      onclick: function () { assetFiles(); } }, '+')));
    (P.assets || []).forEach(function (a) {
      p.append(el('div', { class: 'row' + (assetSel === a.name ? ' on' : ''), title: a.kind === 'picture' ? 'A picture: a Picture widget shows it' :
        'A sound: a widget\'s action or a screen plays it', onclick: function () { assetSel = a.name; project(); attrs(); } },
        icon(a.kind === 'picture' ? 'image' : 'sound'), el('span', { class: 'name' }, a.name),
        el('span', { class: 'kind' }, a.kind === 'picture' ? a.w + '×' + a.h : (a.ms / 1000).toFixed(1) + ' s'),
        el('button', { class: 'act', title: 'Delete it', onclick: function (e) { e.stopPropagation(); assetDelete(a.name); } }, '×')));
    });
    if (!(P.assets || []).length) p.append(el('div', { class: 'note' }, 'Pictures and sounds of your own: +'));
    p.append(el('div', { class: 'group' }, 'Files'));
    FILES.forEach(function (f) {
      p.append(el('div', { class: 'row' + (mode !== 'design' && f === codeFile ? ' on' : ''), onclick: function () {
        codeFile = f;
        if (mode === 'design') setMode('split'); else { code(); project(); }
      } }, icon('file'), el('span', { class: 'name' }, f.replace('main/', ''))));
    });
    $('#app-title').textContent = P.app.name + ' - ' + screen().name;
  }
  function addScreen() {
    let i = P.screens.length + 1;
    while (P.screens.some(function (s) { return s.name === 'screen_' + i; })) i++;
    P.screens.push({ name: 'screen_' + i, root: makeRoot({}, []) });
    setScreen(P.screens.length - 1);
    commit();
  }
  function delScreen(i) {
    if (!confirm('Delete the screen "' + P.screens[i].name + '"?')) return;
    P.screens.splice(i, 1);
    setScreen(Math.min(cur, P.screens.length - 1));
    commit();
  }

  /* ---------------------------------------------------------------- attributes */

  function field(label, input, id) {
    return el('div', { class: 'field' }, el('label', { for: id }, label), input);
  }
  let fieldId = 0;
  /* a change on a panel: seen at once, one undo step when the field is left */
  function bind(input, get, set, rebuild) {
    const id = 'a' + ++fieldId;
    input.id = id;
    input.value = get();
    input.addEventListener('input', function () { set(input.value); refreshSoon(); });
    input.addEventListener('change', function () { tree(); project(); commit(); if (rebuild) attrs(); });
    return id;
  }
  function propField(n, name) {
    const a = A[name], key = KEYS[name] || name, t = a[1];
    const get = function () { return n.props[key] != null ? n.props[key] : ''; };
    const set = function (v) { if (v === '') delete n.props[key]; else n.props[key] = v; };
    if (t === YESNO) {
      const c = el('input', { type: 'checkbox', checked: n.props[key] === '1' });
      c.id = 'a' + ++fieldId;
      c.addEventListener('change', function () { set(c.checked ? '1' : ''); refreshSoon(); commit(); });
      return field(a[0], c, c.id);
    }
    if (t === 'color') return colorField(a[0], get, set);
    if (t === 'picture') return assetField(n, key, a[0], 'picture');
    let i;
    if (t === 'area') i = el('textarea', { rows: name === 'text' ? 2 : 4 });
    else if (t === 'select') i = el('select', {}, a[2].map(function (o) { return el('option', { value: o[0] }, o[1]); }));
    else i = el('input', { type: t === 'number' ? 'number' : 'text' });
    return field(a[0], i, bind(i, get, set));
  }
  function colorField(label, get, set) {
    const sel2 = el('select', {}, COLORS.map(function (c) { return el('option', { value: c[0] }, c[1]); }), el('option', { value: 'custom' }, 'Custom'));
    const pick = el('input', { type: 'color', class: 'swatch', title: 'Colour', 'aria-label': label });
    const show = function () {
      const v = get(), c = COLORS.find(function (x) { return x[0] === v; });
      sel2.value = c ? v : v ? 'custom' : COLORS[0][0];
      pick.value = c ? c[2] : v || COLORS[0][2];
    };
    show();
    sel2.id = 'a' + ++fieldId;
    sel2.addEventListener('change', function () {
      if (sel2.value === 'custom') { set(pick.value.toUpperCase()); } else set(sel2.value);
      show();
      refreshSoon();
      commit();
    });
    pick.addEventListener('input', function () { set(pick.value.toUpperCase()); show(); refreshSoon(); });
    pick.addEventListener('change', commit);
    return field(label, el('div', { class: 'pair' }, pick, sel2), sel2.id);
  }
  function sizeField(n, key, label, par) {
    const v = function () { return n.props[key] || ''; };
    const kindOf = function () { const x = v(); return !x ? '' : x === 'content' || x === 'fill' ? x : x.endsWith('%') ? 'pct' : 'px'; };
    const s = el('select', {}, [['', 'Default'], ['content', 'Fit content'], ['fill', 'Fill'], ['px', 'Pixels'], ['pct', 'Percent']].map(function (o) {
      return el('option', { value: o[0] }, o[1]);
    }));
    const num = el('input', { type: 'number', 'aria-label': label + ' value' });
    const show = function () {
      const k = kindOf();
      s.value = k;
      num.hidden = k !== 'px' && k !== 'pct';
      num.value = parseInt(v(), 10) || '';
    };
    show();
    s.id = 'a' + ++fieldId;
    s.addEventListener('change', function () {
      const k = s.value, cur2 = L.rects.get(n.id), now = cur2 ? (key === 'w' ? cur2.w : cur2.h) : 100;
      if (k === 'px') n.props[key] = String(now);
      else if (k === 'pct') n.props[key] = '50%';
      else if (k) n.props[key] = k;
      else delete n.props[key];
      show();
      refreshSoon();
      commit();
    });
    num.addEventListener('input', function () {
      if (num.value === '') return;
      n.props[key] = s.value === 'pct' ? num.value + '%' : num.value;
      refreshSoon();
    });
    num.addEventListener('change', commit);
    return field(label, el('div', { class: 'pair' }, s, num), s.id);
  }
  function selectField(n, key, label, opts, rebuild) {
    const i = el('select', {}, opts.map(function (o) { return el('option', { value: o[0] }, o[1]); }));
    return field(label, i, bind(i, function () { return n.props[key] || opts[0][0]; }, function (v) { n.props[key] = v; }, rebuild));
  }
  function numField(n, key, label, ph) {
    const i = el('input', { type: 'number', placeholder: ph == null ? '' : String(ph) });
    return field(label, i, bind(i, function () { return n.props[key] != null ? n.props[key] : ''; }, function (v) { if (v === '') delete n.props[key]; else n.props[key] = v; }));
  }
  function attrs() {
    const a = $('#attrs');
    a.replaceChildren();
    if (multi.length > 1) return multiAttrs(a);
    if (assetSel) return assetAttrs(a, (P.assets || []).find(function (x) { return x.name === assetSel; }));
    if (sel === 'app') return appAttrs(a);
    const n = sel, sec = function (t) { a.append(el('div', { class: 'asec' }, t)); };
    if (!n) return;
    sec(n.type === 'root' ? 'Screen' : kindName(n));
    if (n.type === 'root') {
      const s = screen(), i = el('input', { type: 'text', spellcheck: 'false' });
      a.append(field('Name', i, bind(i, function () { return s.name; }, function (v) {
        renameRefs('screen', s.name, v);
        s.name = v;
      })));
      a.append(selectField(n, 'anim', 'Comes in', [['', 'At once'], ['fade', 'Fading in'], ['left', 'Sliding in from the right'],
        ['right', 'Sliding in from the left'], ['up', 'Sliding up from below'], ['down', 'Sliding down from above']]));
      a.append(assetField(n, 'sound', 'Plays', 'sound'));
    } else {
      const i = el('input', { type: 'text', spellcheck: 'false', title: 'The widget in the C: ui.' + n.name });
      a.append(field('Id', i, bind(i, function () { return n.name; }, function (v) { renameRefs('widget', n.name, v); n.name = v; })));
    }
    const par = parentOf(n);
    if (n.type === 'box' || n.type === 'root') {
      if (n.type === 'box') a.append(selectField(n, 'kind', 'Style', [['', 'Plain'], ['card', 'Card']], true));
      sec('Layout of its contents');
      a.append(selectField(n, 'layout', 'Layout', [['column', 'Column'], ['row', 'Row'], ['free', 'Free']], true));
      if (n.props.layout !== 'free' && n.props.layout) {
        a.append(selectField(n, 'main', 'Along', FLEXMAIN));
        a.append(selectField(n, 'cross', 'Across', FLEXCROSS));
        const w = el('input', { type: 'checkbox', checked: n.props.wrap === '1' });
        w.id = 'a' + ++fieldId;
        w.addEventListener('change', function () { if (w.checked) n.props.wrap = '1'; else delete n.props.wrap; refreshSoon(); commit(); });
        a.append(field('Wrap', w, w.id));
        a.append(numField(n, 'gap', 'Gap', 0));
      }
      const sc = el('input', { type: 'checkbox', checked: n.props.scroll !== '0' });
      sc.id = 'a' + ++fieldId;
      sc.addEventListener('change', function () { if (sc.checked) delete n.props.scroll; else n.props.scroll = '0'; refreshSoon(); commit(); });
      a.append(field('Scrolls', sc, sc.id));
    }
    if (n.type !== 'root') {
      sec('Size and place');
      a.append(sizeField(n, 'w', 'Width', par));
      a.append(sizeField(n, 'h', 'Height', par));
      if (par && (par.props.layout === 'free' || !par.props.layout)) {
        const pad3 = el('div', { class: 'alignpad' });
        ['tl', 'tm', 'tr', 'lm', 'c', 'rm', 'bl', 'bm', 'br'].forEach(function (k) {
          pad3.append(el('button', { 'aria-pressed': (n.props.align || 'tl') === k ? 'true' : 'false', title: k, 'aria-label': 'Anchor ' + k, onclick: function () {
            n.props.align = k;
            n.props.x = '0';
            n.props.y = '0';
            refreshSoon();
            commit();
            attrs();
          } }));
        });
        a.append(field('Anchor', pad3));
        a.append(numField(n, 'x', 'X', 0));
        a.append(numField(n, 'y', 'Y', 0));
      }
      a.append(numField(n, 'margin', 'Margin', 0));
    }
    const list = CONTENT[n.type] || [];
    if (list.length) {
      sec('Content');
      list.forEach(function (k) { a.append(propField(n, k)); });
    }
    styleAttrs(a, n, sec);
    if (n.type !== 'root') {
      sec('State');
      ['hidden', 'disabled'].forEach(function (k) {
        const c = el('input', { type: 'checkbox', checked: n.props[k] === '1' });
        c.id = 'a' + ++fieldId;
        c.addEventListener('change', function () { if (c.checked) n.props[k] = '1'; else delete n.props[k]; refreshSoon(); tree(); commit(); });
        a.append(field(k === 'hidden' ? 'Hidden' : 'Disabled', c, c.id));
      });
    }
    if (n.type !== 'divider' && n.type !== 'spinner') eventsAttrs(a, n, sec);
    if (n.type !== 'root') animAttrs(a, n, sec);
  }

  /* ---------------------------------------------------------------- the Style panel: a widget's look, in each state
   * Keys "s<what>" for the normal look, "s<what>:p" pressed, ":c" checked, ":d" disabled (sim_design.c's style_apply).
   * The normal look of a box is its own bg / radius / border / pad, a button's background its colour, a label's text its
   * colour - the keys the design always had */
  const STATES = [['', 'Normal'], ['p', 'Pressed'], ['c', 'Checked'], ['d', 'Disabled']];
  const STYLE_KEYS = ['sbg', 'sbo', 'stc', 'sbw', 'sbc', 'srad', 'sshw', 'sshc', 'sshy', 'sopa', 'spad'];
  let styleState = '';
  function styleKey(n, what, st) {
    if (!st) {
      const box = { sbg: 'bg', srad: 'radius', sbw: 'border', sbc: 'borderc', spad: 'pad' };
      if (isBox(n) && box[what]) return box[what];
      if (n.type === 'button' && what === 'sbg') return 'color';
      if (n.type === 'label' && what === 'stc') return 'color';
      if ((n.type === 'check' || n.type === 'dropdown') && what === 'stc') return 'fg';
    }
    return st ? what + ':' + st : what;
  }
  function styled(n, st) {
    return STYLE_KEYS.some(function (w) { const v = n.props[styleKey(n, w, st)]; return v != null && v !== ''; });
  }
  function numFieldFn(label, get, set, ph, rebuild) {
    const i = el('input', { type: 'number', placeholder: ph == null ? '' : String(ph) });
    return field(label, i, bind(i, get, set, rebuild));
  }
  function styleAttrs(a, n, sec) {
    const root = n.type === 'root', checkable = n.type === 'check' || n.type === 'switch' || (n.type === 'button' && n.props.toggle === '1');
    const states = root ? [STATES[0]] : STATES.filter(function (s) { return s[0] !== 'c' || checkable; });
    if (!states.some(function (s) { return s[0] === styleState; })) styleState = '';
    sec('Style');
    if (states.length > 1) {
      const tabs = el('div', { class: 'stabs', role: 'tablist', 'aria-label': 'The look in each state' });
      states.forEach(function (s) {
        tabs.append(el('button', { role: 'tab', 'aria-selected': s[0] === styleState ? 'true' : 'false', class: styled(n, s[0]) ? 'has' : null,
          title: s[0] ? 'How it looks while ' + s[1].toLowerCase() : 'How it looks', onclick: function () { styleState = s[0]; attrs(); } }, s[1]));
      });
      a.append(tabs);
    }
    const st = styleState, key = function (w) { return styleKey(n, w, st); };
    const get = function (w) { return function () { return n.props[key(w)] != null ? n.props[key(w)] : ''; }; };
    const set = function (w) { return function (v) { if (v === '' || v == null) delete n.props[key(w)]; else n.props[key(w)] = v; }; };
    const card = n.props.kind === 'card' && !st;
    a.append(colorFieldOpt('Background', get('sbg'), set('sbg')));
    if (!root) a.append(numFieldFn('Bg opacity %', get('sbo'), set('sbo'), n.props[key('sbg')] ? 100 : ''));
    if (!root) a.append(colorFieldOpt('Text colour', get('stc'), set('stc')));
    if (!root) {
      a.append(numFieldFn('Border', get('sbw'), set('sbw'), card ? 1 : 0));
      a.append(colorFieldOpt('Border colour', get('sbc'), set('sbc')));
      a.append(numFieldFn('Corners', get('srad'), set('srad'), card ? 16 : n.type === 'button' && !st ? 12 : ''));
      a.append(numFieldFn('Shadow', get('sshw'), set('sshw'), 0, true));
      if (n.props[key('sshw')]) {
        a.append(colorFieldOpt('Shadow colour', get('sshc'), set('sshc')));
        a.append(numFieldFn('Shadow down', get('sshy'), set('sshy'), 0));
      }
      a.append(numFieldFn('Opacity %', get('sopa'), set('sopa'), 100));
    }
    a.append(numFieldFn('Padding', get('spad'), set('spad'), !st && isBox(n) ? pad(n) : ''));
    if (styled(n, st)) a.append(el('div', { class: 'note' }, el('button', { class: 'btn', onclick: function () {
      STYLE_KEYS.forEach(function (w) { delete n.props[key(w)]; });
      refreshSoon();
      commit();
      attrs();
    } }, st ? 'Clear the ' + STATES.find(function (s) { return s[0] === st; })[1].toLowerCase() + ' look' : 'Clear the look')));
  }

  /* ---------------------------------------------------------------- the Events panel: what a widget does
   * "ev1" ... "ev9", each "trigger|action|target|text" (sim_design.c's events_of); the older "on" / "onv" is read as one */
  const TRIGGERS = [['tap', 'It is tapped'], ['long', 'It is held'], ['change', 'Its value changes'], ['press', 'It is pressed'], ['release', 'It is let go']];
  const ACTIONS = [['toast', 'Show a message'], ['screen', 'Open a screen'], ['back', 'Go back'], ['sound', 'Play a sound'],
    ['call', 'Call a function (app.c)'], ['text', 'Set a text'], ['value', 'Set a value'], ['show', 'Show a widget'], ['hide', 'Hide a widget'],
    ['vis', 'Show / hide a widget'], ['enable', 'Enable a widget'], ['disable', 'Disable a widget'], ['check', 'Check a widget'],
    ['uncheck', 'Uncheck a widget'], ['checkt', 'Check / uncheck a widget'], ['anim', 'Play an animation']];
  const TEXT_TYPES = ['label', 'button', 'field', 'check'], NUMBER_TYPES = ['slider', 'bar', 'arc', 'spinbox', 'roller', 'dropdown'];
  const VALUE_SOURCES = ['slider', 'switch', 'check', 'roller', 'dropdown', 'field', 'keypad'], NUMBER_SOURCES = ['slider', 'switch', 'check', 'roller', 'dropdown'];
  function hasValue(n, num) {
    if (n.type === 'button') return n.props.toggle === '1';
    return (num ? NUMBER_SOURCES : VALUE_SOURCES).includes(n.type);
  }
  function events(n) {
    const list = [];
    if (n.props.on) {
      const on = n.props.on, v = n.props.onv || '', named = on === 'screen' || on === 'sound';
      list.push({ trig: n.type === 'root' ? 'open' : VALUE_TYPES.includes(n.type) ? 'change' : 'tap', act: on, target: named ? v : '', arg: named ? '' : v });
    }
    for (let i = 1; i <= 9; i++) {
      const v = n.props['ev' + i];
      if (!v) continue;
      const f = v.split('|');
      list.push({ trig: f[0] || 'tap', act: f[1] || 'toast', target: f[2] || '', arg: f.slice(3).join('|') });
    }
    return list;
  }
  function setEvents(n, list) {
    delete n.props.on;
    delete n.props.onv;
    for (let i = 1; i <= 9; i++) delete n.props['ev' + i];
    list.slice(0, 9).forEach(function (e, i) { n.props['ev' + (i + 1)] = [e.trig, e.act, e.target || '', e.arg || ''].join('|'); });
  }
  /* a screen, a sound or a widget renamed: the events that name it follow (a widget's: on its own screen) */
  function renameRefs(kind, old, v) {
    const each = kind === 'widget' ? function (f) { walk(root(), f); } : walkAll;
    each(function (n) {
      const list = events(n);
      let hit = false;
      list.forEach(function (e) {
        const named = e.act === 'screen' ? 'screen' : e.act === 'sound' ? 'sound' : ['toast', 'back', 'call'].includes(e.act) ? null : 'widget';
        if (named === kind && e.target === old) { e.target = v; hit = true; }
      });
      if (hit) setEvents(n, list);
    });
  }
  /* what an action can name: screens, sounds, or the widgets of this screen it can work on */
  function targets(n, act) {
    if (act === 'screen') return P.screens.map(function (s) { return [s.name, s.name]; });
    if (act === 'sound') return (P.assets || []).filter(function (x) { return x.kind === 'sound'; }).map(function (x) { return [x.name, x.name]; });
    if (['toast', 'back', 'call'].includes(act)) return null;
    const o = [];
    walk(root(), function (w) {
      if (w.type === 'root') return;
      const ok = act === 'text' ? TEXT_TYPES.includes(w.type) : act === 'value' ? NUMBER_TYPES.includes(w.type) :
        act === 'anim' ? !!w.props.an : ['check', 'uncheck', 'checkt'].includes(act) ? ['check', 'switch'].includes(w.type) || (w.type === 'button' && w.props.toggle === '1') : true;
      if (ok) o.push([w.name, w.name + (w === n ? ' (itself)' : '') + '  ·  ' + kindName(w)]);
    });
    return o;
  }
  function eventsAttrs(a, n, sec) {
    const list = events(n), root = n.type === 'root';
    sec(root ? 'When the screen opens' : 'Events');
    list.forEach(function (ev, i) { a.append(eventCard(n, list, i)); });
    if (list.length < 9) a.append(el('div', { class: 'note' }, el('button', { class: 'btn', onclick: function () {
      const first = targets(n, 'toast');
      list.push({ trig: root ? 'open' : VALUE_TYPES.includes(n.type) ? 'change' : 'tap', act: 'toast', target: first && first[0] ? first[0][0] : '', arg: 'Hello' });
      setEvents(n, list);
      refreshSoon();
      commit();
      attrs();
    } }, '+ Add an event')));
    if (!list.length) a.append(el('div', { class: 'note' }, root ? 'Do something each time this screen is shown: set a text, start an animation …'
      : 'Make it do something when it is tapped, held or changed: open a screen, show a message, set another widget\'s text …'));
  }
  function eventCard(n, list, i) {
    const ev = list[i], root = n.type === 'root';
    const save = function (rebuild) { setEvents(n, list); refreshSoon(); commit(); if (rebuild) attrs(); };
    const sel3 = function (opts, value, onchange, label) {
      const s = el('select', { 'aria-label': label }, opts.map(function (o) { return el('option', { value: o[0] }, o[1]); }));
      s.id = 'a' + ++fieldId;
      s.value = value;
      s.addEventListener('change', function () { onchange(s.value); });
      return s;
    };
    const head = el('div', { class: 'evhead' }, el('span', {}, 'Event ' + (i + 1)),
      i > 0 ? el('button', { class: 'act', title: 'Earlier', 'aria-label': 'Move it up', onclick: function () { list.splice(i - 1, 0, list.splice(i, 1)[0]); save(true); } }, '↑') : null,
      i < list.length - 1 ? el('button', { class: 'act', title: 'Later', 'aria-label': 'Move it down', onclick: function () { list.splice(i + 1, 0, list.splice(i, 1)[0]); save(true); } }, '↓') : null,
      el('button', { class: 'act', title: 'Remove this event', 'aria-label': 'Remove this event', onclick: function () { list.splice(i, 1); save(true); } }, '×'));
    const card = el('div', { class: 'evcard' }, head);
    const trigs = root ? [['open', 'The screen opens']] : TRIGGERS.filter(function (t) { return t[0] !== 'change' || VALUE_TYPES.includes(n.type) || n.type === 'button'; });
    const t = sel3(trigs, ev.trig, function (v) { ev.trig = v; save(false); }, 'When');
    card.append(field('When', t, t.id));
    const acts = root ? ACTIONS.filter(function (x) { return x[0] !== 'back'; }) : ACTIONS;
    const d = sel3(acts, ev.act, function (v) {
      ev.act = v;
      const opts = targets(n, v);
      if (opts && !opts.some(function (o) { return o[0] === ev.target; })) ev.target = opts[0] ? opts[0][0] : '';
      if (!opts) ev.target = '';
      ev.arg = v === 'toast' ? (ev.arg || 'Hello') : v === 'call' ? 'on_' + n.name : v === 'text' ? (hasValue(n) ? '{value}' : 'Text') : v === 'value' ? (hasValue(n, true) ? '{value}' : '0') : '';
      save(true);
    }, 'Do');
    card.append(field('Do', d, d.id));
    const opts = targets(n, ev.act);
    if (opts) {
      if (!opts.length) card.append(el('div', { class: 'note warn-text' }, ev.act === 'sound' ? 'No sounds yet: add one under Assets.' : ev.act === 'anim' ?
        'No widget on this screen has an animation yet.' : 'No widget on this screen can take this.'));
      else {
        const lab = ev.act === 'screen' ? 'Screen' : ev.act === 'sound' ? 'Sound' : 'Widget';
        const s = sel3(opts, ev.target, function (v) { ev.target = v; save(false); }, lab);
        if (!opts.some(function (o) { return o[0] === ev.target; })) { s.value = ''; }
        card.append(field(lab, s, s.id));
      }
    }
    if (['toast', 'call', 'text', 'value'].includes(ev.act)) {
      const lab = { toast: 'Message', call: 'Function', text: 'Text', value: 'Value' }[ev.act];
      const inp = el('input', { type: 'text', spellcheck: ev.act === 'call' ? 'false' : null });
      inp.id = 'a' + ++fieldId;
      inp.value = ev.arg || '';
      inp.addEventListener('input', function () { ev.arg = inp.value; setEvents(n, list); refreshSoon(); });
      inp.addEventListener('change', function () { commit(); tree(); });
      card.append(field(lab, inp, inp.id));
      const tip = ev.act === 'call' ? 'Write it in app.c: void ' + (ev.arg || 'name') + '(lv_event_t *e)' :
        ev.act === 'text' && hasValue(n) ? '{value} is this widget\'s value' + (n.type === 'switch' || n.type === 'check' || n.type === 'button' ? ' (On / Off)' : '') + '.' :
        ev.act === 'value' ? (hasValue(n, true) ? 'A number, or {value}: this widget\'s value.' : 'A number.') : '';
      if (tip) card.append(el('div', { class: 'note' }, tip));
    }
    return card;
  }

  /* ---------------------------------------------------------------- the Animation panel */
  const ANIMS = [['', 'None'], ['fade', 'Fade in'], ['left', 'Slide in from the left'], ['right', 'Slide in from the right'], ['up', 'Slide up from below'],
    ['down', 'Slide down from above'], ['blink', 'Blink'], ['float', 'Float up and down'], ['shake', 'Shake']];
  function animAttrs(a, n, sec) {
    sec('Animation');
    a.append(selectField(n, 'an', 'Plays', ANIMS, true));
    if (!n.props.an) return;
    a.append(numField(n, 'and', 'Time (ms)', 400));
    a.append(numField(n, 'andl', 'Wait (ms)', 0));
    a.append(selectField(n, 'anr', 'Repeats', [['', 'Once'], ['2', '2 times'], ['3', '3 times'], ['5', '5 times'], ['inf', 'For ever']]));
    a.append(selectField(n, 'anw', 'Starts', [['', 'When the screen opens'], ['ev', 'When an event plays it']], true));
    a.append(el('div', { class: 'note' }, el('button', { class: 'btn', title: 'Play it on the screen once (Run plays it as the app does)', onclick: function () {
      if (M) M.ccall('sim_design_play', null, ['number'], [n.id]);
    } }, '▶ Play'), n.props.anw === 'ev' ? el('span', { class: 'hint' }, '  An event\'s "Play an animation" starts it.') : null));
  }
  /* a picture or a sound of the assets, or one added from a file */
  function assetField(n, key, label, kind) {
    const list = (P.assets || []).filter(function (x) { return x.kind === kind; });
    const opts = [['', kind === 'picture' ? 'None' : 'Nothing']].concat(list.map(function (x) { return [x.name, x.name]; }), [['+', 'Add from a file…']]);
    const i = el('select', {}, opts.map(function (o) { return el('option', { value: o[0] }, o[1]); }));
    i.id = 'a' + ++fieldId;
    i.value = n.props[key] || '';
    i.addEventListener('change', function () {
      if (i.value === '+') {
        i.value = n.props[key] || '';
        assetFiles(kind).then(function (got) {
          const m = got.find(function (x) { return x.kind === kind; });
          if (m) { n.props[key] = m.name; refreshSoon(); commit(); attrs(); }
        });
        return;
      }
      if (i.value) n.props[key] = i.value; else delete n.props[key];
      refreshSoon();
      tree();
      commit();
    });
    const row = el('div', { class: 'pair' }, i);
    if (kind === 'sound') row.append(el('button', { class: 'icon', title: 'Play it', 'aria-label': 'Play it', onclick: function () { if (n.props[key]) playAsset(n.props[key]); } }, icon('sound')));
    return field(label, row, i.id);
  }
  function assetAttrs(a, x) {
    if (!x) { assetSel = null; return attrs(); }
    a.append(el('div', { class: 'asec' }, x.kind === 'picture' ? 'Picture' : 'Sound'));
    const i = el('input', { type: 'text', spellcheck: 'false', title: 'Its name in the C: UI_' + (x.kind === 'picture' ? 'PIC_' : 'SND_') + x.name.toUpperCase() });
    i.id = 'a' + ++fieldId;
    i.value = x.name;
    i.addEventListener('change', function () {
      if (!assetRename(x, i.value.trim())) { msg('A name is a-z, 0-9 and _, starting with a letter, and not one in use'); i.value = x.name; return; }
      keep();
      commit();
      all();
    });
    a.append(field('Name', i, i.id));
    const d = DATA[x.name];
    if (x.kind === 'picture') {
      a.append(field('Size', el('div', { class: 'note' }, x.w + ' × ' + x.h + ' px, ' + Math.ceil(x.bytes / 1024) + ' KB')));
      if (d) {
        const url = URL.createObjectURL(new Blob([d], { type: 'image/png' }));
        a.append(el('div', { class: 'preview' }, el('img', { src: url, alt: x.name, onload: function () { URL.revokeObjectURL(url); } })));
      }
    } else {
      a.append(field('Length', el('div', { class: 'note' }, (x.ms / 1000).toFixed(1) + ' s, ' + Math.ceil(x.bytes / 1024) + ' KB')));
      a.append(el('div', { class: 'note' }, el('button', { class: 'btn', onclick: function () { playAsset(x.name); } }, 'Play')));
    }
    a.append(el('div', { class: 'note' }, x.kind === 'picture' ? 'A Picture widget shows it. In the app: main/assets/' + x.name + '.png, inside the .elf.'
      : 'A widget\'s action (Play a sound) or a screen (Plays) plays it. In the app: main/assets/' + x.name + '.wav, inside the .elf.'));
    a.append(el('div', { class: 'note' }, el('button', { class: 'btn', onclick: function () { assetDelete(x.name); } }, 'Delete')));
  }
  function propFieldFor(n, key, label) {
    return colorFieldOpt(label, function () { return n.props[key] || ''; }, function (v) { if (v) n.props[key] = v; else delete n.props[key]; });
  }
  function colorFieldOpt(label, get, set) {
    const list = [['', 'None']].concat(COLORS.map(function (c) { return [c[0], c[1]]; }), [['custom', 'Custom']]);
    const s = el('select', {}, list.map(function (o) { return el('option', { value: o[0] }, o[1]); }));
    const pick = el('input', { type: 'color', class: 'swatch', title: 'Colour', 'aria-label': label });
    const show = function () {
      const v = get(), c = COLORS.find(function (x) { return x[0] === v; });
      s.value = !v ? '' : c ? v : 'custom';
      pick.value = c ? c[2] : v || '#141A28';
    };
    show();
    s.id = 'a' + ++fieldId;
    s.addEventListener('change', function () { set(s.value === 'custom' ? pick.value.toUpperCase() : s.value); show(); refreshSoon(); commit(); });
    pick.addEventListener('input', function () { set(pick.value.toUpperCase()); show(); refreshSoon(); });
    pick.addEventListener('change', commit);
    return field(label, el('div', { class: 'pair' }, pick, s), s.id);
  }
  function appAttrs(a) {
    a.append(el('div', { class: 'asec' }, 'App'));
    const name = el('input', { type: 'text' }), file = el('input', { type: 'text', spellcheck: 'false' });
    a.append(field('Name', name, bind(name, function () { return P.app.name; }, function (v) {
      P.app.name = v;
      if (M) M.ccall('sim_design_app', null, ['string'], [v]);
    })));
    a.append(field('File name', file, bind(file, function () { return P.app.file; }, function (v) { P.app.file = v; })));
    a.append(el('div', { class: 'note' }, 'On the device: apps/' + P.app.file + '.elf'));
    a.append(el('div', { class: 'asec' }, 'Launcher tile'));
    const s = el('select', {}, SYMBOLS.map(function (o) { return el('option', { value: o }, o); }));
    a.append(field('Symbol', s, bind(s, function () { return P.app.symbol; }, function (v) { P.app.symbol = v; })));
    const c = el('input', { type: 'color', class: 'swatch', 'aria-label': 'Tile colour', value: P.app.color });
    c.id = 'a' + ++fieldId;
    c.addEventListener('input', function () { P.app.color = c.value.toUpperCase(); codeSoon(); });
    c.addEventListener('change', commit);
    a.append(field('Colour', c, c.id));
  }

  /* ---------------------------------------------------------------- the code */

  function handlers() {
    const seen = {};
    walkAll(function (n) { events(n).forEach(function (e) { if (e.act === 'call' && e.arg) seen[e.arg] = 1; }); });
    return Object.keys(seen);
  }
  const cstr = function (s) { return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; };
  function appC() {
    if (P.code['main/app.c'] != null) return P.code['main/app.c'];
    const a = P.app, col = '0x' + a.color.slice(1).toUpperCase(), sym = 'LV_SYMBOL_' + a.symbol;
    const fns = handlers().map(function (h) {
      return 'void ' + h + '(lv_event_t *e)\n{\n    ros_audio_click();\n    ros_toast("Hello from ' + h + '");\n}\n\n';
    }).join('');
    return '/*\n * ' + a.name + ' - your code. The screens are in ui.c, which Reload OS Studio makes from the design; this file stays yours:\n' +
      ' * what the widgets call, and anything else the app does. ui.h has the widgets: ui.<id>.\n */\n#include "ui.h"\n\n' + fns +
      'static void create(lv_obj_t *body)\n{\n    ui_start(body);\n}\n\nstatic void destroy(void)\n{\n    ui_stop();\n}\n\n' +
      'ROS_ELFAPP_META(' + cstr(a.name) + ', ' + sym + ', ' + col + ');     /* the launcher\'s tile, read without loading the app */\n\n' +
      'static const ros_elfapp_t s_app = {\n    .abi = ROS_ELFAPP_ABI,\n    .app = { .name = ' + cstr(a.name) + ', .icon = ' + sym + ', .color = ' + col +
      ', .create = create, .destroy = destroy, .back = ui_back },\n' +
      '    .board = ROS_BOARD_SHORT,           /* the firmware refuses an app built for the other board */\n    .meta = &ros_elfapp_meta,\n};\n\n' +
      'int main(int argc, char *argv[])\n{\n    if (argc > 0 && argv[0]) *(const ros_elfapp_t **)argv[0] = &s_app;\n    return 0;\n}\n';
  }
  function fileText(f) {
    const n = P.app.file;
    if (!M && (f === 'main/ui.c' || f === 'main/ui.h')) return '';
    if (f === 'main/ui.c') return M.ccall('sim_design_code', 'string', ['number'], [0]);
    if (f === 'main/ui.h') return M.ccall('sim_design_code', 'string', ['number'], [1]);
    if (f === 'main/app.c') return appC();
    if (f === 'CMakeLists.txt') {
      return '# ' + P.app.name + ', a Reload OS app. Build it in the app kit\'s folder: ./build.sh ' + n + ' jc\ncmake_minimum_required(VERSION 3.16)\n' +
        'include(${CMAKE_CURRENT_LIST_DIR}/../reloados/elfapp.cmake)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(' + n + ')\ninclude(elf_loader)\nproject_elf(' + n + ')\n';
    }
    if (f === 'main/CMakeLists.txt') {
      const files = usedFiles();
      return '# ros.h comes from the firmware (the kit\'s reloados/main); it includes LVGL and the JPEG driver headers\n' +
        (files.length ? '# the pictures and sounds of the design are embedded in the app file (ui.c: _binary_<file>_start)\n' : '') +
        'idf_component_register(SRCS "app.c" "ui.c"\n                       INCLUDE_DIRS "." "../../reloados/main"\n                       REQUIRES lvgl__lvgl esp_driver_jpeg' +
        (files.length ? '\n                       EMBED_FILES ' + files.map(function (x) { return '"assets/' + x + '"'; }).join(' ') : '') + ')\n';
    }
    if (f === 'main/idf_component.yml') {
      return '# The same versions as the firmware: headers and settings must match\ndependencies:\n  idf: ">=5.5,<6.0"\n  lvgl/lvgl: "==9.2.2"\n' +
        '  espressif/elf_loader: "==1.3.3"\n  espressif/cmake_utilities: "==0.5.3"      # elf_loader asks for "0.*": pinned like the firmware\'s\n';
    }
    return '# ' + P.app.name + '\n\nMade with Reload OS Studio. `' + n + '.design` is the design: open it in Studio to change the screens, export again and\n' +
      'copy `main/ui.c` and `main/ui.h` over the old ones. `main/app.c` is yours.\n\n## Build\n\nPut this folder in the app kit\'s folder (next to `hello`), then\n\n' +
      '```\n./build.sh ' + n + ' ' + P.board + '\n```\n\nand copy the `.elf` into the `apps/` folder of the device\'s flash drive or SD card.\n';
  }
  function highlight(t, lang) {
    const e = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (lang !== 'c') return e;
    const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|\b(0x[0-9A-Fa-f]+|\d+)\b|\b(static|const|void|int|bool|char|if|else|return|struct|typedef|enum|extern|for|while|true|false|NULL|sizeof|uint32_t|size_t)\b|\b((?:lv|ros|ui)_[a-z0-9_]+)(?=\()|\b([A-Z][A-Z0-9_]{2,})\b|(#[a-z]+)/g;
    return e.replace(re, function (m, c, s, n, k, f, u, p) {
      const cls = c ? 'com' : s ? 'str' : n ? 'num' : k || p ? 'kw' : f ? 'fn' : u ? 'mac' : '';
      return '<span class="t-' + cls + '">' + m + '</span>';
    });
  }
  function code() {
    const tabs = $('#code-tabs'), v = $('#codeview');
    tabs.replaceChildren();
    FILES.forEach(function (f) {
      tabs.append(el('button', { role: 'tab', 'aria-selected': f === codeFile ? 'true' : 'false', onclick: function () { codeFile = f; code(); project(); } }, f.replace('main/', '')));
    });
    if (mode === 'design') return;
    const text = fileText(codeFile);
    if (codeFile === 'main/app.c') {
      /* the one file that is written by hand: kept with the design */
      if ($('textarea', v)) return;
      v.replaceChildren();
      const ta = el('textarea', { spellcheck: 'false', 'aria-label': 'app.c', value: text });
      ta.addEventListener('input', function () { P.code['main/app.c'] = ta.value; keep(); });
      ta.addEventListener('change', commit);
      v.append(ta);
      return;
    }
    const lines = highlight(text, /\.[ch]$/.test(codeFile) ? 'c' : 'txt').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const top = v.scrollTop;
    v.replaceChildren();
    const g = el('div', { class: 'gutter' }), pre = el('pre');
    g.textContent = lines.map(function (l, i) { return i + 1; }).join('\n');
    pre.innerHTML = lines.map(function (l) { return '<span class="ln">' + l + '</span>'; }).join('');
    v.append(g, pre);
    v.scrollTop = top;
    markCode();
  }
  const codeSoon = debounce(function () { if (mode !== 'design') code(); }, 120);
  /* in the code, the lines of the widget selected */
  function markCode() {
    if (mode === 'design' || codeFile !== 'main/ui.c' || !sel || sel === 'app') return;
    const lines = document.querySelectorAll('#codeview .ln'), want = sel.type === 'root' ? 'build_' + screen().name : 'ui.' + sel.name;
    let first = null;
    lines.forEach(function (l) {
      const t = l.textContent, on = t.includes(want + ' ') || t.includes(want + ',') || t.includes(want + '(') || t.includes(want + ')');
      l.classList.toggle('mark-line', on);
      if (on && !first) first = l;
    });
    if (first) first.scrollIntoView({ block: 'center' });
  }
  function setMode(m) {
    mode = m;
    $('#panes').dataset.mode = m;
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false');
    });
    project();
    code();
    if (autoFit) requestAnimationFrame(placeFrame);
  }
  document.querySelectorAll('.seg [data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  /* ---------------------------------------------------------------- problems */

  let problems = [], buildProblems = [];     /* the page's checks; the build server's compiler errors */
  function allSizes() {
    const seen = {}, o = [];
    BOARDS.forEach(function (b) {
      [[b.w, b.h], [b.h, b.w]].forEach(function (s) {
        const k = s[0] + 'x' + s[1];
        if (!seen[k]) { seen[k] = 1; o.push({ w: s[0], h: s[1] }); }
      });
    });
    return o;
  }
  function lint() {
    const list = [], names = {}, screens = {}, cid = /^[a-z_][a-z0-9_]{0,30}$/;
    const add = function (sev, text, node, screenI) { list.push({ sev: sev, text: text, node: node, screen: screenI }); };
    P.screens.forEach(function (s, i) {
      if (!/^[a-z][a-z0-9_]{0,22}$/.test(s.name)) add('error', 'Screen "' + s.name + '": a name is a-z, 0-9 and _', null, i);
      if (screens[s.name]) add('error', 'Two screens are called "' + s.name + '"', null, i);
      screens[s.name] = 1;
      if (s.root.props.sound && !(P.assets || []).some(function (x) { return x.name === s.root.props.sound && x.kind === 'sound' && DATA[x.name]; }))
        add('error', 'Screen "' + s.name + '" plays "' + s.root.props.sound + '", which is not in the assets', null, i);
      const has = function (name, kind) { return (P.assets || []).some(function (x) { return x.name === name && x.kind === kind && DATA[name]; }); };
      walk(s.root, function (n, par) {
        const nm = n.type === 'root' ? 'Screen "' + s.name + '"' : n.name;
        events(n).forEach(function (e) {
          if (e.act === 'call' && (!cid.test(e.arg || '') || C_WORDS.includes(e.arg))) add('error', nm + ': "' + (e.arg || '') + '" is not a function name', n, i);
          if (e.act === 'sound' && !has(e.target, 'sound')) add('error', nm + ': the sound "' + (e.target || '') + '" is not in the assets', n, i);
          if (e.act === 'screen' && !P.screens.some(function (x) { return x.name === e.target; })) add('error', nm + ' opens a screen that is not there: ' + (e.target || '(none)'), n, i);
          if (['toast', 'back', 'call', 'screen', 'sound'].includes(e.act)) return;
          let t = null;
          walk(s.root, function (w) { if (w.name === e.target && w.type !== 'root') t = w; });
          const what = (ACTIONS.find(function (x) { return x[0] === e.act; }) || [0, e.act])[1].toLowerCase();
          if (!t) add('error', nm + ': "' + what + '" names ' + (e.target ? '"' + e.target + '", which is not on this screen' : 'no widget'), n, i);
          else if (e.act === 'text' && !TEXT_TYPES.includes(t.type)) add('error', nm + ': ' + t.name + ' has no text to set', n, i);
          else if (e.act === 'value' && !NUMBER_TYPES.includes(t.type)) add('error', nm + ': ' + t.name + ' has no value to set', n, i);
          else if (e.act === 'anim' && !t.props.an) add('error', nm + ': ' + t.name + ' has no animation', n, i);
          if ((e.act === 'text' || e.act === 'value') && /\{value\}/.test(e.arg || '') && !hasValue(n, e.act === 'value'))
            add('warning', nm + ': {value} - ' + kindName(n).toLowerCase() + ' has no value to give, so it stays as it is', n, i);
        });
        if (n.type === 'root') return;
        if (!cid.test(n.name) || C_WORDS.includes(n.name)) add('error', 'Id "' + n.name + '": not a name C can use', n, i);
        else if (names[n.name]) add('error', 'Two widgets have the id "' + n.name + '"', n, i);
        names[n.name] = 1;
        const fills = (par.props.layout === 'column' && n.props.h === 'fill' && par.props.h === 'content') || (par.props.layout === 'row' && n.props.w === 'fill' && par.props.w === 'content');
        if (fills) add('warning', n.name + ': fills a parent that fits its content, so it has nothing to fill', n, i);
        if (n.type === 'keypad' && !(n.props.keys || '').trim()) add('warning', n.name + ': no keys', n, i);
        if (n.type === 'image' && !n.props.src) add('warning', n.name + ': no picture chosen', n, i);
        if (n.type === 'image' && n.props.src && !has(n.props.src, 'picture')) add('error', n.name + ': the picture "' + n.props.src + '" is not in the assets', n, i);
        if (n.type === 'image' && n.props.fit && !n.props.w && !n.props.h) add('info', n.name + ': a picture fitted to its size wants a width and a height', n, i);
        if (n.type === 'calendar' && n.props.date && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(n.props.date)) add('error', n.name + ': the date is YYYY-MM-DD', n, i);
      }, null);
    });
    if (!/^[a-z][a-z0-9_]{0,22}$/.test(P.app.file)) add('error', 'File name "' + P.app.file + '": a-z, 0-9 and _, starting with a letter', 'app', 0);
    if (P.app.file === 'hello') add('warning', 'File name "hello" is the app kit\'s example', 'app', 0);
    const big = (P.assets || []).reduce(function (t, x) { return t + (x.bytes || 0); }, 0);
    if (big > 6 * 1024 * 1024) add('error', 'The assets come to ' + (big / 1048576).toFixed(1) + ' MB: the build server takes 6 MB, and the app is loaded into memory whole', 'app', 0);
    else if (big > 2 * 1024 * 1024) add('warning', 'The assets come to ' + (big / 1048576).toFixed(1) + ' MB: the app file gets big, and it is loaded into memory whole', 'app', 0);
    /* every board's screen, both ways round: what the rule says for each screen of the system too */
    if (M) allSizes().forEach(function (s) {
      const r = JSON.parse(M.ccall('sim_design_measure', 'string', ['number', 'number'], [s.w, s.h]));
      if (!r.rects) return;
      const right = r.body[0] + r.body[2], tag = s.w + ' × ' + s.h;
      let worst = null;
      r.rects.forEach(function (a) { if (a[3] && (!worst || a[1] + a[3] > worst[1] + worst[3])) worst = a; });
      const n = worst && byId(worst[0]);
      if (n && n.type !== 'root' && worst[1] + worst[3] > right) add('warning', 'At ' + tag + ': ' + n.name + ' runs ' + (worst[1] + worst[3] - right) + ' px past the right edge', n, cur);
      if (r.body[4] > 0 && root().props.scroll !== '0') add('info', 'At ' + tag + ': the screen scrolls (' + r.body[4] + ' px more)', null, cur);
    });
    problems = list;
    showProblems();
  }
  const lintSoon = debounce(lint, 450);
  function showProblems() {
    const box2 = $('#prob-list'), c = $('#prob-count'), all = problems.concat(buildProblems);
    const errs = all.filter(function (p) { return p.sev === 'error'; }).length, warns = all.filter(function (p) { return p.sev === 'warning'; }).length;
    box2.replaceChildren();
    problems.concat(buildProblems).forEach(function (p) {
      box2.append(el('div', { class: 'problem ' + p.sev, onclick: function () {
        if (p.file) { codeFile = p.file; if (mode === 'design') setMode('split'); else { code(); project(); } return; }
        if (p.screen != null && p.screen !== cur) setScreen(p.screen);
        if (p.node) select(p.node);
      } }, el('span', { class: 'sev' }, p.sev), el('span', {}, p.text)));
    });
    if (!problems.length && !buildProblems.length) box2.append(el('div', { class: 'note' }, 'No problems, on every board\'s screen both ways round.'));
    c.textContent = errs + warns ? errs + ' error' + (errs === 1 ? '' : 's') + ', ' + warns + ' warning' + (warns === 1 ? '' : 's') : all.length ? 'No problems, ' + all.length + ' note' + (all.length === 1 ? '' : 's') : 'No problems';
    c.className = errs ? 'has-err' : warns ? 'has-warn' : '';
    const own = problems.some(function (p) { return p.sev === 'error'; });
    $('#f-export').title = own ? 'Fix the errors first: the code would not build' : 'The app\'s project for the app kit, or its ELF';
  }
  $('#prob-toggle').addEventListener('click', function () { toggleProblems(); });
  $('#prob-close').addEventListener('click', function () { toggleProblems(false); });
  function toggleProblems(on) {
    const p = $('#problems');
    p.hidden = on == null ? !p.hidden : !on;
    if (autoFit) requestAnimationFrame(placeFrame);
  }

  /* ---------------------------------------------------------------- files */

  function download(name, data, type) {
    const a = el('a', { href: URL.createObjectURL(new Blob([data], { type: type })), download: name });
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  /* the .design file: the project, with its assets' bytes */
  function designFile() {
    const data = {};
    (P.assets || []).forEach(function (x) { if (DATA[x.name]) data[x.name] = b64(DATA[x.name]); });
    return JSON.stringify(Object.assign({}, P, { assetData: data }), null, 1);
  }
  function saveDesign() {
    if (account) return cloudSave();
    saveDesignFile();
  }
  function saveDesignFile() {
    download(P.app.file + '.design', designFile(), 'application/json');
    msg('Saved ' + P.app.file + '.design');
  }
  /* a zip without compression: nothing here is big, and it needs no library */
  const CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ c >>> 8;
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    const u16 = function (v) { return [v & 255, v >> 8 & 255]; }, u32 = function (v) { return [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24]; };
    Object.keys(files).forEach(function (name) {
      const nm = enc.encode(name), data = typeof files[name] === 'string' ? enc.encode(files[name]) : files[name], crc = crc32(data);
      const head = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nm.length), u16(0));
      const local = new Uint8Array([0x50, 0x4B, 3, 4].concat(head));
      parts.push(local, nm, data);
      central.push(new Uint8Array([0x50, 0x4B, 1, 2].concat(u16(20), head, u16(0), u16(0), u16(0), u32(0), u32(off))), nm);
      off += local.length + nm.length + data.length;
    });
    const size2 = central.reduce(function (s, p) { return s + p.length; }, 0), n = Object.keys(files).length;
    const end = new Uint8Array([0x50, 0x4B, 5, 6].concat(u16(0), u16(0), u16(n), u16(n), u32(size2), u32(off), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }
  function exportProject() {
    const errs = problems.filter(function (p) { return p.sev === 'error'; });
    if (errs.length) {
      toggleProblems(true);
      msg('Fix the errors first: the code would not build');
      return;
    }
    const n = P.app.file, files = {};
    FILES.forEach(function (f) { files[n + '/' + f] = fileText(f); });
    usedFiles().forEach(function (x) { const d = DATA[x.replace(/\.[a-z]+$/, '')]; if (d) files[n + '/main/assets/' + x] = d; });
    files[n + '/' + n + '.design'] = designFile();
    const a = el('a', { href: URL.createObjectURL(zip(files)), download: n + '.zip' });
    a.click();
    msg('Exported ' + n + '.zip: put the folder in the app kit, then ./build.sh ' + n + ' ' + P.board);
  }
  function openDesign(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || o.format !== FORMAT || !o.screens || !o.screens.length) { msg('Not a Reload OS Studio design'); return; }
    const was = { board: P.board, turned: P.turned, light: P.light };
    const data = {};
    Object.keys(o.assetData || {}).forEach(function (k) { try { data[k] = unb64(o.assetData[k]); } catch (e) { /* left out: Problems says so */ } });
    delete o.assetData;
    P = o;
    P.code = P.code || {};
    P.assets = P.assets || [];
    assetsReplace(data);
    cur = 0;
    sel = root();
    renumber();
    undo.length = redo.length = 0;
    last = state();
    tools();
    deviceUi();
    if (was.board !== P.board || was.turned !== P.turned || was.light !== P.light) applyScreen();
    if (M) M.ccall('sim_design_app', null, ['string'], [P.app.name]);
    all();
    keep();
    msg('Opened ' + P.app.name);
  }
  $('#f-open').addEventListener('click', function () { if (account) openCloud(); else $('#open-file').click(); });
  $('#open-file').addEventListener('change', function (e) {
    const f = e.target.files[0];
    if (f) f.text().then(openDesign);
    e.target.value = '';
  });
  $('#f-save').addEventListener('click', saveDesign);
  /* Export: the project as a zip, or the ELF built by the website's build service (server/appbuild) */
  const pop = $('#export-pop');
  let buildInfo = null, building = false;
  fetch(BUILD_URL + '/boards', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (info) { buildInfo = info; exportMenu(); });
  function exportMenu() {
    const b = BOARDS.find(function (x) { return x.id === P.board; }), elf = $('#x-elf');
    elf.textContent = 'ELF for the ' + b.name + ' (' + P.app.file + '.elf)';
    const signIn = buildInfo && buildInfo.signin && !account;
    elf.disabled = !buildInfo || building || signIn;
    $('#x-note').textContent = !buildInfo ? 'No build server on this copy of the site: build the zip with the app kit.'
      : building ? 'Building…' : signIn ? 'Sign in (top right) to build the .elf on the server; the zip needs no account.'
      : 'Built on the server with the app kit for Reload OS ' + buildInfo.kit + '; nothing is kept there.';
  }
  $('#f-export').addEventListener('click', function (e) {
    e.stopPropagation();
    exportMenu();
    pop.hidden = !pop.hidden;
  });
  document.addEventListener('click', function (e) { if (!pop.contains(e.target)) pop.hidden = true; });
  $('#x-zip').addEventListener('click', function () { pop.hidden = true; exportProject(); });
  $('#x-elf').addEventListener('click', function () { pop.hidden = true; buildElf(); });
  $('#x-design').addEventListener('click', function () { pop.hidden = true; saveDesignFile(); });
  function buildElf() {
    const errs = problems.filter(function (p) { return p.sev === 'error'; });
    if (errs.length) { toggleProblems(true); msg('Fix the errors first: the code would not build'); return; }
    if (building) return;
    building = true;
    buildProblems = [];
    const name = P.app.file, board = P.board, t0 = Date.now();
    const files = {};
    ['main/app.c', 'main/ui.c', 'main/ui.h'].forEach(function (f) { files[f] = fileText(f); });
    const assets = {};
    usedFiles().forEach(function (x) { const d = DATA[x.replace(/\.[a-z]+$/, '')]; if (d) assets[x] = b64(d); });
    const tick = setInterval(function () {
      msg('Building ' + name + '.elf for the ' + board + ' on the build server… ' + Math.round((Date.now() - t0) / 1000) + ' s' +
          (Date.now() - t0 > 20000 ? ' (the first build of a board compiles ESP-IDF: minutes)' : ''));
    }, 1000);
    const done = function (text) { clearInterval(tick); building = false; msg(text); exportMenu(); };
    fetch(BUILD_URL, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, account ? { Authorization: 'Bearer ' + account.token } : {}),
                       body: JSON.stringify({ board: board, name: name, files: files, assets: assets }) })
      .then(function (r) {
        if (r.status === 401) { setAccount(null); done('Sign in again (top right): the session has ended'); return; }
        if (r.status === 200) return r.blob().then(function (b) {
          download(name + '.elf', b, 'application/octet-stream');
          done(name + '.elf built in ' + (r.headers.get('X-Build-Seconds') || '?') + ' s - copy it into apps/ on the device\'s flash drive or SD card, then restart the device');
        });
        return r.json().catch(function () {
          return { error: r.status === 502 || r.status === 504 ? 'The build server is still on the first build of this board (minutes): try again in a while'
                                                              : r.status + ' from the build server' };
        }).then(function (j) {
          if (j.log) {
            j.log.split('\n').forEach(function (l) {
              const m = /^(main\/[a-z_.]+):(\d+)(?::\d+)?:\s*(?:(error|warning|note):\s*)?(.*)$/.exec(l);
              if (m) buildProblems.push({ sev: m[3] === 'warning' ? 'warning' : m[3] === 'note' ? 'info' : 'error', text: m[1] + ':' + m[2] + ': ' + m[4], file: m[1] });
              else if (l.trim()) buildProblems.push({ sev: 'error', text: l.trim() });
            });
            showProblems();
            toggleProblems(true);
          }
          done((j.error || 'The build failed') + (j.log ? ': see Problems' : ''));
        });
      })
      .catch(function () { done('The build server did not answer'); });
  }
  $('#f-new').addEventListener('click', function () { $('#dlg-new').showModal(); });
  TEMPLATES.forEach(function (t) {
    $('#templates').append(el('button', { value: 'cancel', onclick: function () {
      const was = { board: P.board, turned: P.turned, light: P.light };
      newProject(t, was);
      undo.length = redo.length = 0;
      last = state();
      tools();
      if (M) M.ccall('sim_design_app', null, ['string'], [P.app.name]);
      all();
      keep();
    } }, el('b', {}, t.title), el('span', {}, t.note)));
  });
  function msg(t) {
    $('#msg').textContent = t;
  }

  /* ---------------------------------------------------------------- the account (server/studio)
   * Signed in, a design is kept on the server (Save, Open - its .design file, pictures and sounds included) and Export ›
   * ELF builds there; signed out, all of Studio works in this browser as before, and Export gives the zip. The session
   * is a token in this browser (localStorage), sent as Authorization: no cookies, so a page on another origin works. */
  const STUDIO_API = (document.querySelector('meta[name="studio-api"]') || {}).content || '../api/studio';
  const ACCT_KEY = 'ros-studio-account';
  let account = null, accounts = null, acctMode = 'in', resetToken = null;
  try { account = JSON.parse(localStorage.getItem(ACCT_KEY)); } catch (e) { account = null; }
  function api(method, p, body) {
    return fetch(STUDIO_API + p, { method: method, cache: 'no-store',
      headers: Object.assign({ 'Content-Type': 'application/json' }, account ? { Authorization: 'Bearer ' + account.token } : {}),
      body: body == null ? undefined : JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          if (r.status === 401 && account && p !== '/login') setAccount(null);
          const e = new Error(j.error || 'The server answered ' + r.status);
          e.status = r.status;
          e.body = j;
          throw e;
        });
      }, function () { throw new Error('The server does not answer'); });
  }
  function setAccount(a) {
    account = a;
    try { if (a) localStorage.setItem(ACCT_KEY, JSON.stringify(a)); else localStorage.removeItem(ACCT_KEY); } catch (e) { /* this page only */ }
    accountUi();
    exportMenu();
  }
  function accountUi() {
    const b = $('#account');
    b.hidden = !accounts;
    b.textContent = account ? (account.name || account.email) : 'Sign in';
    $('#f-save').title = account ? 'Save to your account (Ctrl+S)' : 'Save the .design file (Ctrl+S)';
    $('#f-open').title = account ? 'Open one of your projects' : 'Open a .design file';
  }
  fetch(STUDIO_API, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (info) {
    accounts = info;
    accountUi();
    if (account && accounts) api('GET', '/me').then(function (r) { account.name = r.user.name; setAccount(account); }, function () {});
    if (accounts) linkFromMail();
  });
  /* a link from one of our mails: ?verify=… confirms the address, ?reset=… sets a new password */
  function linkFromMail() {
    const q = new URLSearchParams(location.search), v = q.get('verify'), r = q.get('reset');
    if (!v && !r) return;
    history.replaceState(null, '', location.pathname);
    if (r) { resetToken = r; acctDialog('reset'); return; }
    api('POST', '/verify', { token: v }).then(function (j) { acctDialog('in', j.message); }, function (e) { acctDialog('in', e.message); });
  }
  const TITLES = { in: 'Sign in', up: 'Create an account', forgot: 'A new password', reset: 'Set your password' };
  function acctDialog(mode, note) {
    acctMode = mode;
    $('#acct-title').textContent = TITLES[mode];
    $('#f-name').hidden = mode !== 'up';
    $('#f-email').hidden = mode === 'reset';
    $('#f-pass').hidden = mode === 'forgot';
    $('#acct-pass').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    $('#acct-pass').value = '';
    $('#acct-go').textContent = { in: 'Sign in', up: 'Create the account', forgot: 'Send me a link', reset: 'Set the password' }[mode];
    const sw = mode === 'in' ? (accounts && accounts.signup ? 'Create an account' : '') : 'Sign in instead';
    $('#acct-switch').textContent = sw;
    $('#acct-switch').hidden = !sw;
    $('#acct-forgot').hidden = mode !== 'in';
    $('#acct-note').textContent = note || {
      in: accounts && accounts.signup ? 'Your projects on the server, from any computer, and Export › ELF.'
        : 'Your projects on the server, from any computer, and Export › ELF. Accounts are made by Reloader for now.',
      up: 'We send a mail to confirm the address. The password: 8 characters or more.',
      forgot: 'We send a mail with a link to set a new password.',
      reset: 'A new password: 8 characters or more.' }[mode];
    $('#acct-err').replaceChildren();
    const d = $('#dlg-account');
    if (!d.open) d.showModal();
    (mode === 'reset' ? $('#acct-pass') : mode === 'up' ? $('#acct-name') : $('#acct-email')).focus();
  }
  $('#acct-switch').addEventListener('click', function () { acctDialog(acctMode === 'in' ? 'up' : 'in'); });
  $('#acct-forgot').addEventListener('click', function () { acctDialog('forgot'); });
  $('#acct-form').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const email = $('#acct-email').value.trim(), pass = $('#acct-pass').value, name = $('#acct-name').value.trim(), go = $('#acct-go');
    const err = function (x) {
      $('#acct-err').replaceChildren(x.message);
      if (x.body && x.body.unverified) $('#acct-err').append(' ', el('button', { type: 'button', class: 'link', onclick: function () {
        api('POST', '/resend', { email: email }).then(function (j) { acctDialog('in', j.message); }, err);
      } }, 'Send the mail again'));
    };
    go.disabled = true;
    let p;
    if (acctMode === 'in') {
      p = api('POST', '/login', { email: email, password: pass }).then(function (r) {
        setAccount({ token: r.token, email: r.user.email, name: r.user.name });
        $('#dlg-account').close();
        msg('Signed in as ' + r.user.email + ': Save keeps the design in your account');
      });
    } else if (acctMode === 'up') {
      p = api('POST', '/signup', { email: email, password: pass, name: name }).then(function (j) { acctDialog('in', j.message); });
    } else if (acctMode === 'forgot') {
      p = api('POST', '/forgot', { email: email }).then(function (j) { acctDialog('in', j.message); });
    } else {
      p = api('POST', '/reset', { token: resetToken, password: pass }).then(function (j) { resetToken = null; acctDialog('in', j.message); });
    }
    p.catch(err).then(function () { go.disabled = false; });
  });
  const acctPop = $('#account-pop');
  $('#account').addEventListener('click', function (e) {
    e.stopPropagation();
    if (!account) return acctDialog('in');
    $('#acct-who').textContent = account.email;
    acctPop.hidden = !acctPop.hidden;
  });
  document.addEventListener('click', function (e) { if (!acctPop.contains(e.target)) acctPop.hidden = true; });
  $('#acct-out').addEventListener('click', function () {
    acctPop.hidden = true;
    api('POST', '/logout').catch(function () {}).then(function () { setAccount(null); msg('Signed out: the design stays in this browser'); });
  });
  $('#acct-projects').addEventListener('click', function () { acctPop.hidden = true; openCloud(); });
  $('#cloud-file').addEventListener('click', function () { $('#dlg-projects').close(); $('#open-file').click(); });
  function openCloud() {
    const list = $('#cloud-list');
    list.replaceChildren(el('div', { class: 'empty' }, 'Loading…'));
    if (!$('#dlg-projects').open) $('#dlg-projects').showModal();
    api('GET', '/projects').then(function (r) {
      list.replaceChildren();
      if (!r.projects.length) list.append(el('div', { class: 'empty' }, 'Nothing here yet: Save keeps the open design in your account.'));
      r.projects.forEach(function (p) {
        list.append(el('div', { class: 'row', title: 'Open it', onclick: function () { cloudOpen(p.id); } }, icon('app'),
          el('span', { class: 'name' }, p.name + (P.cloud === p.id ? ' (open)' : '')),
          el('span', { class: 'kind' }, new Date(p.updated * 1000).toLocaleString() + ' · ' + Math.ceil(p.size / 1024) + ' KB'),
          el('button', { type: 'button', class: 'act keep', title: 'Delete it', onclick: function (e) { e.stopPropagation(); cloudDelete(p); } }, '×')));
      });
    }, function (e) { list.replaceChildren(el('div', { class: 'empty' }, e.message)); });
  }
  function cloudOpen(id) {
    api('GET', '/projects/' + id).then(function (p) {
      $('#dlg-projects').close();
      openDesign(p.data);
      P.cloud = p.id;
      keep();
      msg('Opened ' + p.name + ' from your account');
    }, function (e) { msg(e.message); });
  }
  function cloudDelete(p) {
    if (!confirm('Delete "' + p.name + '" from your account? It cannot be brought back.')) return;
    api('DELETE', '/projects/' + p.id).then(function () {
      if (P.cloud === p.id) { delete P.cloud; keep(); }
      openCloud();
    }, function (e) { msg(e.message); });
  }
  function cloudSave() {
    const name = P.app.name, data = designFile();
    msg('Saving ' + name + ' to your account…');
    const create = function () { return api('POST', '/projects', { name: name, data: data }); };
    (P.cloud ? api('PUT', '/projects/' + P.cloud, { name: name, data: data }).catch(function (e) { if (e.status === 404) return create(); throw e; }) : create())
      .then(function (r) { P.cloud = r.id; keep(); msg('Saved ' + name + ' to your account'); }, function (e) { msg('Not saved: ' + e.message); });
  }

  /* ---------------------------------------------------------------- run */

  function toggleRun() {
    if (!M) return;
    if (run) {
      run = null;
      hover = null;
      overlay.classList.remove('running');
      $('#run').classList.remove('on');
      $('#run span').textContent = 'Run';
      M.ccall('sim_design_run', null, ['number'], [0]);
      msg('');
      if (!M._sim_design_active()) M.ccall('sim_design_app', null, ['string'], [P.app.name]);
      refresh();
      return;
    }
    if (mode === 'code') setMode('design');
    run = { stack: [screen().name] };
    M.ccall('sim_design_run', null, ['number'], [1]);
    setTimeout(function () { showInRun(screen().name); }, 0);     /* comes in as the design says, like the app opening */
    overlay.classList.add('running');
    $('#run').classList.add('on');
    $('#run span').textContent = 'Stop';
    msg('Running: the mouse is a finger, Esc is the back swipe. Messages stand in for your functions.');
    marks();
    $('#stage').focus();
  }
  $('#run').addEventListener('click', toggleRun);

  /* ---------------------------------------------------------------- several picked, and what can be done to them */

  function picked() { return multi.length > 1 ? multi : sel && sel !== 'app' && sel.type !== 'root' ? [sel] : []; }
  /* Shift / Cmd / Ctrl and a click: one more, or one less (never a widget and one inside it) */
  function togglePick(n) {
    if (!n || n.type === 'root') return;
    let list = picked().slice();
    const i = list.indexOf(n);
    if (i >= 0) list.splice(i, 1);
    else {
      list = list.filter(function (x) { return !inside(n, x) && !inside(x, n); });
      list.push(n);
    }
    assetSel = null;
    multi = list.length > 1 ? list : [];
    sel = list.length ? list[list.length - 1] : root();
    marks();
    tree();
    project();
    attrs();
    markCode();
  }
  function pickMany(list) {
    multi = list.length > 1 ? list.slice() : [];
    sel = list.length ? list[list.length - 1] : root();
    assetSel = null;
  }
  const sameParent = function (list) { return list.length > 0 && list.every(function (n) { return parentOf(n) === parentOf(list[0]); }); };
  const isFree = function (b) { return !!b && (b.props.layout === 'free' || !b.props.layout); };
  function inOrder(list) {                /* as they are in the tree */
    const o = [];
    walk(root(), function (n) { if (list.includes(n)) o.push(n); });
    return o;
  }
  function copyPicked() {
    const list = inOrder(picked());
    if (!list.length) return;
    clip = list.map(function (n) { return JSON.parse(JSON.stringify(n)); });
    msg('Copied ' + (list.length > 1 ? list.length + ' widgets' : list[0].name));
  }
  function removePicked() {
    const list = picked();
    if (!list.length) return;
    const p = parentOf(list[0]), i = p.kids.indexOf(list[0]);
    list.forEach(function (n) { const q = parentOf(n); if (q) q.kids.splice(q.kids.indexOf(n), 1); });
    multi = [];
    sel = list.length === 1 ? p.kids[Math.min(i, p.kids.length - 1)] || p : p;
    hover = null;
    all();
    commit();
  }
  function paste(src) {                  /* into the box selected, or the selected widget's box */
    reserved = {};
    let b = sel && sel !== 'app' ? sel : root();
    if (!isBox(b)) b = parentOf(b) || root();
    const made = [].concat(src).map(function (n) { const c = clone(n); b.kids.push(c); return c; });
    pickMany(made);
    all();
    commit();
  }
  function duplicatePicked() {           /* each beside itself; in a free area a little down and right */
    const list = inOrder(picked());
    if (!list.length) return;
    reserved = {};
    const made = list.map(function (n) {
      const p = parentOf(n), c = clone(n);
      p.kids.splice(p.kids.indexOf(n) + 1, 0, c);
      if (isFree(p)) { c.props.x = String(+(c.props.x || 0) + 16); c.props.y = String(+(c.props.y || 0) + 16); }
      return c;
    });
    pickMany(made);
    all();
    commit();
  }
  function moveIn(n, d) {
    const p = parentOf(n), i = p.kids.indexOf(n), j = i + d;
    if (j < 0 || j >= p.kids.length) return;
    p.kids.splice(i, 1);
    p.kids.splice(j, 0, n);
    changed();
  }
  /* the widgets picked into a new column, row or card, where the first of them was */
  function wrap(list, kind) {
    list = inOrder(list);
    if (!sameParent(list)) return;
    const p = parentOf(list[0]), at = p.kids.indexOf(list[0]);
    reserved = {};
    const b = make(kind);
    if (isFree(p)) {
      const R = list.map(function (n) { return L.rects.get(n.id); }).filter(Boolean), pr = L.rects.get(p.id);
      if (R.length && pr) {
        b.props.align = 'tl';
        b.props.x = String(Math.round(Math.min.apply(null, R.map(function (r) { return r.x; })) - pr.x - pad(p)));
        b.props.y = String(Math.round(Math.min.apply(null, R.map(function (r) { return r.y; })) - pr.y - pad(p)));
        b.props.w = 'content';
      }
    }
    list.forEach(function (n) { p.kids.splice(p.kids.indexOf(n), 1); });
    p.kids.splice(Math.min(at, p.kids.length), 0, b);
    list.forEach(function (n) { place(n, { box: b, index: b.kids.length, x: null }); });
    multi = [];
    sel = b;
    all();
    commit();
  }
  function unwrap(b) {                   /* a box's widgets into its place, the box gone */
    const p = parentOf(b);
    if (!p || !b.kids.length) return;
    const i = p.kids.indexOf(b), pr = L.rects.get(p.id), kids = b.kids.slice();
    p.kids.splice(i, 1);
    kids.forEach(function (k, j) {
      const r = L.rects.get(k.id);
      const at = isFree(p) && r && pr ? { x: Math.round(r.x - pr.x - pad(p)), y: Math.round(r.y - pr.y - pad(p)) } : { x: null, y: 0 };
      b.kids.splice(b.kids.indexOf(k), 1);
      p.kids.splice(i + j, 0, k);
      if (at.x != null) { k.props.align = 'tl'; k.props.x = String(at.x); k.props.y = String(at.y); }
      else { delete k.props.x; delete k.props.y; delete k.props.align; }
    });
    pickMany(kids);
    all();
    commit();
  }
  function flagPicked(key, on) {
    picked().forEach(function (n) { if (on) n.props[key] = '1'; else delete n.props[key]; });
    refreshSoon();
    tree();
    attrs();
    commit();
  }
  /* in a free area: lined up by an edge or the middle, or spread out evenly */
  function alignPicked(how) {
    const list = picked(), p = parentOf(list[0]), pr = L.rects.get(p.id);
    const R = list.map(function (n) { return L.rects.get(n.id); });
    if (!pr || R.some(function (r) { return !r; })) return;
    const ox = pr.x + pad(p), oy = pr.y + pad(p);
    const x0 = Math.min.apply(null, R.map(function (r) { return r.x; })), x1 = Math.max.apply(null, R.map(function (r) { return r.x + r.w; }));
    const y0 = Math.min.apply(null, R.map(function (r) { return r.y; })), y1 = Math.max.apply(null, R.map(function (r) { return r.y + r.h; }));
    const at = R.map(function (r) { return { x: r.x, y: r.y }; });
    if (how === 'left') R.forEach(function (r, i) { at[i].x = x0; });
    if (how === 'hmid') R.forEach(function (r, i) { at[i].x = (x0 + x1) / 2 - r.w / 2; });
    if (how === 'right') R.forEach(function (r, i) { at[i].x = x1 - r.w; });
    if (how === 'top') R.forEach(function (r, i) { at[i].y = y0; });
    if (how === 'vmid') R.forEach(function (r, i) { at[i].y = (y0 + y1) / 2 - r.h / 2; });
    if (how === 'bottom') R.forEach(function (r, i) { at[i].y = y1 - r.h; });
    if (how === 'hspread' || how === 'vspread') {
      const h = how === 'hspread', idx = R.map(function (r, i) { return i; }).sort(function (a, b) { return h ? R[a].x - R[b].x : R[a].y - R[b].y; });
      const used = R.reduce(function (t, r) { return t + (h ? r.w : r.h); }, 0), gap = ((h ? x1 - x0 : y1 - y0) - used) / (R.length - 1);
      let pos = h ? x0 : y0;
      idx.forEach(function (i) { if (h) at[i].x = pos; else at[i].y = pos; pos += (h ? R[i].w : R[i].h) + gap; });
    }
    const across = ['left', 'hmid', 'right', 'hspread'].includes(how);
    list.forEach(function (n, i) {             /* only the way it moves, unless its anchor changes to the top left */
      const anchored = (n.props.align || 'tl') !== 'tl';
      n.props.align = 'tl';
      if (across || anchored) n.props.x = String(Math.round(at[i].x - ox));
      if (!across || anchored) n.props.y = String(Math.round(at[i].y - oy));
    });
    changed();
  }
  function multiAttrs(a) {
    const list = multi, same = sameParent(list), free = same && isFree(parentOf(list[0]));
    const sec = function (t) { a.append(el('div', { class: 'asec' }, t)); };
    const btn = function (t, f, title, off) { return el('button', { class: 'btn', title: title || null, disabled: off ? true : null, onclick: f }, t); };
    sec(list.length + ' widgets');
    a.append(el('div', { class: 'note' }, inOrder(list).map(function (n) { return n.name; }).join(', ')));
    sec('Line them up');
    if (free) {
      const row = function (items) { return el('div', { class: 'note btns' }, items.map(function (x) { return btn(x[0], function () { alignPicked(x[1]); }, x[2], x[3]); })); };
      a.append(row([['⇤ Left', 'left', 'Their left edges in line'], ['Middle', 'hmid', 'Their middles in line, across'], ['Right ⇥', 'right', 'Their right edges in line']]));
      a.append(row([['⤒ Top', 'top', 'Their tops in line'], ['Middle', 'vmid', 'Their middles in line, down'], ['Bottom ⤓', 'bottom', 'Their bottoms in line']]));
      a.append(row([['↔ Spread', 'hspread', 'The same space between them, across', list.length < 3], ['↕ Spread', 'vspread', 'The same space between them, down', list.length < 3]]));
    } else a.append(el('div', { class: 'note' }, same ? 'They are laid out by their column or row: lining up by hand works in a free area.' :
      'They are in different boxes: lining up works for widgets of one free area.'));
    sec('Do');
    a.append(el('div', { class: 'note btns' }, btn('Duplicate', duplicatePicked), btn('Delete', removePicked)));
    a.append(el('div', { class: 'note btns' }, ['column', 'row', 'card'].map(function (k) {
      return btn('Into a ' + k, function () { wrap(list, k); }, same ? 'A new ' + k + ' holding them' : 'Only widgets of one box', !same);
    })));
    const hidden = list.every(function (n) { return n.props.hidden === '1'; });
    a.append(el('div', { class: 'note btns' }, btn(hidden ? 'Show them' : 'Hide them', function () { flagPicked('hidden', !hidden); }),
      btn('Lock them', function () { flagPicked('locked', true); })));
  }

  /* ---------------------------------------------------------------- the menu of a right click */
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(x, y, items) {
    closeMenu();
    menuEl = el('div', { class: 'ctx', role: 'menu' });
    items.forEach(function (it) {
      if (!it) { menuEl.append(el('div', { class: 'ctx-sep', role: 'separator' })); return; }
      menuEl.append(el('button', { role: 'menuitem', disabled: it.off ? true : null, onclick: function () { closeMenu(); it.run(); } },
        el('span', {}, it.t), it.k ? el('kbd', {}, it.k) : null));
    });
    document.body.append(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 6)) + 'px';
    menuEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 6)) + 'px';
    const first = menuEl.querySelector('button:not([disabled])');
    if (first) first.focus();
  }
  addEventListener('pointerdown', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  addEventListener('keydown', function (e) {
    if (!menuEl) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const b = Array.from(menuEl.querySelectorAll('button:not([disabled])')), i = b.indexOf(document.activeElement);
      b[(i + (e.key === 'ArrowDown' ? 1 : b.length - 1)) % b.length].focus();
    }
  }, true);
  addEventListener('blur', closeMenu);
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  function widgetMenu(e) {
    const list = picked(), one = list.length === 1 ? list[0] : null;
    if (!list.length) {
      openMenu(e.clientX, e.clientY, [
        { t: 'Paste', k: MOD + 'V', off: !clip, run: function () { paste(clip); } },
        { t: 'Select everything on the screen', k: MOD + 'A', off: !root().kids.length, run: function () { pickMany(root().kids.slice()); all(); } }]);
      return;
    }
    const p = one && parentOf(one), same = sameParent(list);
    const hidden = list.every(function (n) { return n.props.hidden === '1'; }), locked = list.every(function (n) { return n.props.locked === '1'; });
    openMenu(e.clientX, e.clientY, [
      { t: 'Cut', k: MOD + 'X', run: function () { copyPicked(); removePicked(); } },
      { t: 'Copy', k: MOD + 'C', run: copyPicked },
      { t: 'Paste', k: MOD + 'V', off: !clip, run: function () { paste(clip); } },
      { t: 'Duplicate', k: MOD + 'D', run: duplicatePicked },
      { t: 'Delete', k: '⌫', run: removePicked },
      null,
      { t: 'Move up', off: !one || p.kids.indexOf(one) === 0, run: function () { moveIn(one, -1); } },
      { t: 'Move down', off: !one || p.kids.indexOf(one) === p.kids.length - 1, run: function () { moveIn(one, 1); } },
      null,
      { t: 'Wrap in a column', off: !same, run: function () { wrap(list, 'column'); } },
      { t: 'Wrap in a row', off: !same, run: function () { wrap(list, 'row'); } },
      { t: 'Wrap in a card', off: !same, run: function () { wrap(list, 'card'); } },
      { t: 'Unwrap', off: !one || one.type !== 'box' || !one.kids.length, run: function () { unwrap(one); } },
      null,
      { t: hidden ? 'Show' : 'Hide', run: function () { flagPicked('hidden', !hidden); } },
      { t: locked ? 'Unlock' : 'Lock', run: function () { flagPicked('locked', !locked); } },
      { t: 'Select the box it is in', k: 'Esc', off: !one, run: function () { select(p || root()); } }]);
  }

  /* ---------------------------------------------------------------- the screens' pictures in the Project panel */
  const thumbs = {};
  const thumbSoon = debounce(function () {
    const c = $('#screen');
    if (run || !M || !c.width || !c.height) return;
    const t = document.createElement('canvas'), h = 26, w = Math.round(c.width * h / c.height);
    t.width = w * 2;
    t.height = h * 2;
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    const name = screen().name, had = !!thumbs[name];
    thumbs[name] = t.toDataURL('image/png');
    if (!had) project();
    else document.querySelectorAll('#project img.thumb').forEach(function (im) { if (im.dataset.screen === name) im.src = thumbs[name]; });
  }, 800);

  /* ---------------------------------------------------------------- the keys, on a card */
  function keysDialog() {
    const d = $('#dlg-keys'), t = $('#keys-list');
    if (!t.childElementCount) [
      ['Undo / redo', MOD + 'Z  /  ' + MOD + '⇧Z'], ['Save', MOD + 'S'], ['Run / stop', MOD + 'R'],
      ['Copy, cut, paste', MOD + 'C, ' + MOD + 'X, ' + MOD + 'V'], ['Duplicate', MOD + 'D'], ['Delete', '⌫ / Del'],
      ['Pick one more (or one less)', '⇧ or ' + MOD.replace('+', '') + ' + click'], ['Pick all in the same box', MOD + 'A'],
      ['The box it is in', 'Esc'], ['Move by 4 px (free area)', '← → ↑ ↓'], ['… by 16 px, by 1 px', '⇧ + arrow, ⌥ + arrow'],
      ['Drag without lining up, or by 1 px', '⌥ while dragging'], ['Edit a text on the screen', 'Double click'],
      ['A menu of what can be done', 'Right click'], ['Zoom', MOD + 'scroll'], ['These keys', '?']
    ].forEach(function (r) { t.append(el('tr', {}, el('td', {}, r[0]), el('td', {}, el('kbd', {}, r[1])))); });
    d.showModal();
  }
  $('#keys').addEventListener('click', keysDialog);

  /* ---------------------------------------------------------------- the toolbar and the keys */

  function deviceUi() {
    const d = $('#device');
    d.replaceChildren();
    BOARDS.forEach(function (b) { d.append(el('option', { value: b.id }, b.inch + ' ' + b.name)); });
    d.value = P.board;
    $('#size').textContent = size().w + ' × ' + size().h;
    $('#light').setAttribute('aria-pressed', P.light ? 'true' : 'false');
  }
  $('#device').addEventListener('change', function (e) {
    P.board = e.target.value;
    P.turned = false;
    autoFit = true;
    applyScreen();
    deviceTitle();
    exportMenu();
  });
  function deviceTitle() { $('#orient').title = 'Turn the screen'; }
  $('#orient').addEventListener('click', function () { P.turned = !P.turned; autoFit = true; applyScreen(); });
  $('#light').addEventListener('click', function () { P.light = !P.light; applyScreen(); });
  $('#outlines').addEventListener('click', function (e) {
    outlines = !outlines;
    e.currentTarget.setAttribute('aria-pressed', outlines ? 'true' : 'false');
    marks();
  });
  $('#zoom-in').addEventListener('click', function () { setZoom(zoom * 1.2); });
  $('#zoom-out').addEventListener('click', function () { setZoom(zoom / 1.2); });
  $('#zoom-fit').addEventListener('click', function () { autoFit = true; placeFrame(); });
  $('#theme').addEventListener('click', function () {
    const h = document.documentElement, dark = h.dataset.theme ? h.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
    h.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ros-theme', h.dataset.theme); } catch (e) { /* for this page */ }
  });

  let clip = null;
  document.addEventListener('keydown', function (e) {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (mod && k === 's') { e.preventDefault(); saveDesign(); return; }
    if (mod && k === 'r') { e.preventDefault(); toggleRun(); return; }
    if (run) {
      if (e.key === 'Escape') { e.preventDefault(); M._sim_key_back(); }
      return;
    }
    if (typing) return;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); doRedo(); return; }
    const node = sel && sel !== 'app' ? sel : null, list = picked();
    if (e.key === '?') { e.preventDefault(); keysDialog(); return; }
    if (mod && k === 'c' && list.length) { copyPicked(); return; }
    if (mod && k === 'x' && list.length) { copyPicked(); removePicked(); return; }
    if (mod && k === 'v' && clip) { e.preventDefault(); paste(clip); return; }
    if (mod && k === 'd' && list.length) { e.preventDefault(); duplicatePicked(); return; }
    if (mod && k === 'a') {                              /* every widget of the box the selected one is in */
      e.preventDefault();
      const b = node && node.type !== 'root' ? parentOf(node) : root();
      if (b && b.kids.length) { pickMany(b.kids.slice()); all(); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePicked(); return; }
    if (e.key === 'Escape' && multi.length) { select(sel); return; }
    if (e.key === 'Escape' && node) { select(parentOf(node) || root()); return; }
    if (e.key.startsWith('Arrow') && list.length) {
      const movable = list.filter(function (n) { return isFree(parentOf(n)); });
      if (!movable.length) return;
      e.preventDefault();
      const step = e.shiftKey ? 16 : e.altKey ? 1 : 4, a = e.key.slice(5);
      movable.forEach(function (n) {
        if (a === 'Left' || a === 'Right') n.props.x = String(+(n.props.x || 0) + (a === 'Left' ? -step : step));
        else n.props.y = String(+(n.props.y || 0) + (a === 'Up' ? -step : step));
      });
      refreshSoon();
      attrsSoon();
      commit();
    }
  });
  const attrsSoon = debounce(attrs, 100);

  /* ---------------------------------------------------------------- start */

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
  if (saved && saved.format === FORMAT && saved.screens && saved.screens.length) {
    P = saved;
    P.code = P.code || {};
    P.assets = P.assets || [];
    sel = root();
    renumber();
    idbAll().then(function (d) {
      Object.keys(d).forEach(function (k) { if (P.assets.some(function (x) { return x.name === k; })) { DATA[k] = d[k]; toEngine(k); } });
      all();
      lintSoon();
    });
  } else newProject(TEMPLATES[0]);
  last = state();
  deviceUi();
  palette();
  setMode('design');
  all();
  tools();
  placeFrame();
  boot();
  /* for tools/sim's checks and the console: the design as the renderer reads it, and the project's files */
  window.Studio = {
    design: designText,
    file: fileText,
    files: function () { const o = {}; FILES.forEach(function (f) { o[f] = fileText(f); }); return o; },
    assets: function () { return { list: P.assets, used: usedAssets() }; },
    addAsset: function (name, kind, bytes, meta) {        /* for checks: an asset without a file dialog */
      P.assets = (P.assets || []).filter(function (x) { return x.name !== name; }).concat([Object.assign({ name: name, kind: kind, bytes: bytes.length }, meta || {})]);
      DATA[name] = bytes;
      idbPut(name, bytes);
      toEngine(name);
      keep();
      all();
    },
    project: function () { return P; },
    load: openDesign,
    problems: function () { return problems; },
    lint: lint,
    press: function (x, y, down) { M._sim_pointer(x, y, down); },
    engine: function () { return M; }
  };
})();
