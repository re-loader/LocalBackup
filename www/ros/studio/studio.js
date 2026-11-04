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
    divider: '<path d="M1 7h14v2H1z"/>',
    column: '<path fill-rule="evenodd" d="M2 2h12v12H2zm1.500 1.500v3.700h9V3.500zm0 5.300v3.700h9V8.800z"/>',
    row: '<path fill-rule="evenodd" d="M2 2h12v12H2zm1.500 1.500v9h3.700v-9zm5.300 0v9h3.700v-9z"/>',
    card: '<rect x="1.500" y="3" width="13" height="10" rx="3"/>',
    free: '<path fill-rule="evenodd" d="M2 2h12v12H2zm1.500 1.500v9h9v-9z"/><path d="M5 5h3v3H5zm4 4h2v2H9z"/>',
    spacer: '<path d="M8 1 5 4h2v8H5l3 3 3-3H9V4h2z"/>',
    screen: '<path fill-rule="evenodd" d="M4 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm.5 2v10h7V3z"/>',
    file: '<path d="M4 1h5l4 4v10H4zm5 1.500V6h3.500z"/>',
    app: '<path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/>'
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
    column: { title: 'Column', type: 'box', base: 'column', props: { layout: 'column', gap: '8', w: 'fill', h: 'content' } },
    row: { title: 'Row', type: 'box', base: 'row', props: { layout: 'row', cross: 'center', gap: '8', w: 'fill', h: 'content' } },
    card: { title: 'Card', type: 'box', base: 'card', props: { kind: 'card', layout: 'column', gap: '8', w: 'fill', h: 'content' } },
    free: { title: 'Free area', type: 'box', base: 'area', props: { layout: 'free', w: 'fill', h: '200' } },
    spacer: { title: 'Spacer', type: 'box', base: 'spacer', props: { layout: 'free', w: 'fill', h: 'fill' } },
    divider: { title: 'Divider', type: 'divider', props: { color: 'border', w: 'fill', h: '1' } }
  };
  const PALETTE = [['Text', ['label', 'field']], ['Buttons', ['button', 'check', 'switch']],
    ['Widgets', ['icon', 'slider', 'bar', 'arc', 'spinner', 'dropdown', 'roller', 'qr']], ['Data', ['list', 'table', 'chart']],
    ['Layouts', ['column', 'row', 'card', 'free', 'spacer', 'divider']]];
  const ROWICON = { label: 'label', field: 'field', button: 'button', check: 'check', switch: 'switch', icon: 'icon', slider: 'slider', bar: 'bar',
    arc: 'arc', spinner: 'spinner', dropdown: 'dropdown', roller: 'roller', qr: 'qr', list: 'list', table: 'table', chart: 'chart', divider: 'divider' };
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
    iconname: ['Icon', 'select', DRAWN.map(function (s) { return [s, s]; })]
  };
  const KEYS = { max2: 'max', kind2: 'kind', iconname: 'icon' };   /* one key in the design, two meanings on the panel */
  const CONTENT = {
    label: ['text', 'symbol', 'font', 'color', 'talign', 'long'], field: ['hint', 'text', 'font', 'oneline', 'password', 'max', 'accept', 'kb'],
    button: ['text', 'symbol', 'color', 'font'], icon: ['iconname', 'color'], check: ['text', 'symbol', 'font', 'checked', 'fg'],
    switch: ['checked', 'color'], slider: ['min', 'max2', 'value', 'color'], bar: ['min', 'max2', 'value', 'color'], arc: ['min', 'max2', 'value', 'color'],
    spinner: ['color'], dropdown: ['options', 'selected', 'font', 'fg'], roller: ['options', 'selected', 'rows', 'font'], qr: ['text', 'size'],
    list: ['items', 'font'], table: ['cells', 'colw', 'font'], chart: ['kind2', 'values', 'min', 'max2', 'color'], divider: ['color'], box: [], root: []
  };
  const VALUE_TYPES = ['switch', 'check', 'slider', 'dropdown', 'roller', 'field', 'arc'];
  const C_WORDS = 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while body ui e'.split(' ');

  /* ---------------------------------------------------------------- the project */

  let P = null;                      /* { app: { name, file, symbol, color }, screens: [{ name, root }], code: { 'app.c': text }, board, turned, light } */
  let cur = 0;                       /* the screen being edited */
  let sel = null;                    /* the widget selected, or 'app' */
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
    return { id: nextId++, type: d.type, name: freshName(d.base || kind), props: Object.assign({}, d.props, props), kids: kids || [] };
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
      return [{ name: 'main', root: makeRoot({ cross: 'center', main: 'center', gap: '16' }, [
        make('label', { text: 'Hello', font: '32' }),
        make('label', { text: 'Made with Reload OS Studio', color: 'muted' }),
        make('card', { w: '70%' }, [
          make('row', { main: 'between' }, [make('label', { text: 'Brightness' }), make('switch', { checked: '1' })]),
          make('slider', { value: '70' })]),
        make('button', { text: 'More', symbol: 'RIGHT', on: 'screen', onv: 'details' })]) },
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
          board: keep ? keep.board : 'jc', turned: keep ? keep.turned : false, light: keep ? keep.light : false };
    cur = 0;
    sel = root();
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
  function restore(s) {
    const o = JSON.parse(s), id = sel && sel !== 'app' ? sel.id : 0;
    P.app = o.app;
    P.screens = o.screens;
    P.code = o.code;
    last = s;
    cur = Math.min(cur, P.screens.length - 1);
    sel = byId(id) || root();
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
        simGoBack: function () {
          if (!run || run.stack.length < 2) return 0;
          run.stack.pop();
          setTimeout(function () { showInRun(run.stack[run.stack.length - 1]); }, 0);
          return 1;
        }
      };
      window.RosSim(cfg).then(function (m) {
        M = m;
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
    if (sel && sel !== 'app') {
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
  function hit(p) {
    let f = null;
    walk(root(), function (n) { const r = L.rects.get(n.id); if (r && r.w && within(r, p)) f = n; });
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
    select(n);
    if (n.type !== 'root') {
      drag = { kind: 'press', node: n, from: p, x: +(n.props.x || 0), y: +(n.props.y || 0), par: parentOf(n) };
      overlay.setPointerCapture(e.pointerId);
    }
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
    const par = drag.par, free = par.props.layout === 'free' || !par.props.layout, d = dropAt(p, drag.node);
    if (free && d.box === par) {
      /* within a free area: the widget itself follows, in 4 px steps */
      const g = function (v) { return e.altKey ? Math.round(v) : Math.round(v / 4) * 4; };
      drag.node.props.x = String(drag.x + g(p.x - drag.from.x));
      drag.node.props.y = String(drag.y + g(p.y - drag.from.y));
      drag.drop = null;
      refreshSoon();
    } else {
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
    if (n === sel) return;
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
      const r = el('div', { class: 'row' + (n === sel ? ' on' : ''), role: 'treeitem', draggable: n.type === 'root' ? null : 'true',
        onclick: function () { select(n); },
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
        } }, icon(nodeIcon(n)), el('span', { class: 'name' }, n.type === 'root' ? screen().name : n.name), n.type === 'root' ? null : el('span', { class: 'kind' }, kindName(n)), eye);
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
      p.append(el('div', { class: 'row' + (i === cur ? ' on' : ''), onclick: function () { setScreen(i); } }, icon('screen'), el('span', { class: 'name' }, s.name),
        i === 0 ? el('span', { class: 'kind' }, 'first') : null,
        P.screens.length > 1 ? el('button', { class: 'act', title: 'Delete the screen', onclick: function (e) { e.stopPropagation(); delScreen(i); } }, '×') : null));
    });
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
    if (sel === 'app') return appAttrs(a);
    const n = sel, sec = function (t) { a.append(el('div', { class: 'asec' }, t)); };
    if (!n) return;
    sec(n.type === 'root' ? 'Screen' : kindName(n));
    if (n.type === 'root') {
      const s = screen(), i = el('input', { type: 'text', spellcheck: 'false' });
      a.append(field('Name', i, bind(i, function () { return s.name; }, function (v) {
        walkAll(function (x) { if (x.props.on === 'screen' && x.props.onv === s.name) x.props.onv = v; });
        s.name = v;
      })));
    } else {
      const i = el('input', { type: 'text', spellcheck: 'false', title: 'The widget in the C: ui.' + n.name });
      a.append(field('Id', i, bind(i, function () { return n.name; }, function (v) { n.name = v; })));
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
      a.append(numField(n, 'pad', 'Padding', pad(n)));
      a.append(propFieldFor(n, 'bg', 'Background'));
      a.append(numField(n, 'radius', 'Corners', n.props.kind === 'card' ? 16 : 0));
      a.append(numField(n, 'border', 'Border', n.props.kind === 'card' ? 1 : 0));
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
    if (n.type !== 'root') {
      sec('State');
      ['hidden', 'disabled'].forEach(function (k) {
        const c = el('input', { type: 'checkbox', checked: n.props[k] === '1' });
        c.id = 'a' + ++fieldId;
        c.addEventListener('change', function () { if (c.checked) n.props[k] = '1'; else delete n.props[k]; refreshSoon(); tree(); commit(); });
        a.append(field(k === 'hidden' ? 'Hidden' : 'Disabled', c, c.id));
      });
    }
    if (n.type !== 'root' && n.type !== 'divider' && n.type !== 'spinner') eventAttrs(a, n, sec);
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
  function eventAttrs(a, n, sec) {
    const value = VALUE_TYPES.includes(n.type);
    sec(value ? 'When it changes' : 'When it is tapped');
    a.append(selectField(n, 'on', 'Do', [['', 'Nothing'], ['toast', 'Show a message'], ['screen', 'Open a screen'], ['back', 'Go back'], ['call', 'Call a function']], true));
    const on = n.props.on;
    if (on === 'toast') {
      const i = el('input', { type: 'text' });
      a.append(field('Message', i, bind(i, function () { return n.props.onv || ''; }, function (v) { n.props.onv = v; })));
    } else if (on === 'screen') {
      const names = P.screens.map(function (s) { return [s.name, s.name]; });
      if (!n.props.onv) n.props.onv = (P.screens.find(function (s) { return s !== screen(); }) || P.screens[0]).name;
      a.append(selectField(n, 'onv', 'Screen', names));
    } else if (on === 'call') {
      if (!n.props.onv) n.props.onv = 'on_' + n.name;
      const i = el('input', { type: 'text', spellcheck: 'false' });
      a.append(field('Function', i, bind(i, function () { return n.props.onv; }, function (v) { n.props.onv = v; })));
      a.append(el('div', { class: 'note' }, 'Write it in app.c: void ' + n.props.onv + '(lv_event_t *e)'));
      refreshSoon();
    }
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
    walkAll(function (n) { if (n.props.on === 'call' && n.props.onv) seen[n.props.onv] = 1; });
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
      return '# ros.h comes from the firmware (the kit\'s reloados/main); it includes LVGL and the JPEG driver headers\n' +
        'idf_component_register(SRCS "app.c" "ui.c"\n                       INCLUDE_DIRS "." "../../reloados/main"\n                       REQUIRES lvgl__lvgl esp_driver_jpeg)\n';
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
      walk(s.root, function (n, par) {
        if (n.type === 'root') return;
        if (!cid.test(n.name) || C_WORDS.includes(n.name)) add('error', 'Id "' + n.name + '": not a name C can use', n, i);
        else if (names[n.name]) add('error', 'Two widgets have the id "' + n.name + '"', n, i);
        names[n.name] = 1;
        if (n.props.on === 'call' && (!cid.test(n.props.onv || '') || C_WORDS.includes(n.props.onv))) add('error', n.name + ': "' + (n.props.onv || '') + '" is not a function name', n, i);
        const fills = (par.props.layout === 'column' && n.props.h === 'fill' && par.props.h === 'content') || (par.props.layout === 'row' && n.props.w === 'fill' && par.props.w === 'content');
        if (fills) add('warning', n.name + ': fills a parent that fits its content, so it has nothing to fill', n, i);
      }, null);
    });
    if (!/^[a-z][a-z0-9_]{0,22}$/.test(P.app.file)) add('error', 'File name "' + P.app.file + '": a-z, 0-9 and _, starting with a letter', 'app', 0);
    if (P.app.file === 'hello') add('warning', 'File name "hello" is the app kit\'s example', 'app', 0);
    walkAll(function (n) {
      if (n.props.on === 'screen' && !screens[n.props.onv]) add('error', n.name + ' opens a screen that is not there: ' + n.props.onv, n, null);
    });
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
  function saveDesign() {
    download(P.app.file + '.design', JSON.stringify(P, null, 1), 'application/json');
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
      const nm = enc.encode(name), data = enc.encode(files[name]), crc = crc32(data);
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
    files[n + '/' + n + '.design'] = JSON.stringify(P, null, 1);
    const a = el('a', { href: URL.createObjectURL(zip(files)), download: n + '.zip' });
    a.click();
    msg('Exported ' + n + '.zip: put the folder in the app kit, then ./build.sh ' + n + ' ' + P.board);
  }
  function openDesign(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || o.format !== FORMAT || !o.screens || !o.screens.length) { msg('Not a Reload OS Studio design'); return; }
    const was = { board: P.board, turned: P.turned, light: P.light };
    P = o;
    P.code = P.code || {};
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
  $('#f-open').addEventListener('click', function () { $('#open-file').click(); });
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
    elf.disabled = !buildInfo || building;
    $('#x-note').textContent = !buildInfo ? 'No build server on this copy of the site: build the zip with the app kit.'
      : building ? 'Building…' : 'Built on os.re-loader.com with the app kit for Reload OS ' + buildInfo.kit + '; nothing is kept there.';
  }
  $('#f-export').addEventListener('click', function (e) {
    e.stopPropagation();
    exportMenu();
    pop.hidden = !pop.hidden;
  });
  document.addEventListener('click', function (e) { if (!pop.contains(e.target)) pop.hidden = true; });
  $('#x-zip').addEventListener('click', function () { pop.hidden = true; exportProject(); });
  $('#x-elf').addEventListener('click', function () { pop.hidden = true; buildElf(); });
  function buildElf() {
    const errs = problems.filter(function (p) { return p.sev === 'error'; });
    if (errs.length) { toggleProblems(true); msg('Fix the errors first: the code would not build'); return; }
    if (building) return;
    building = true;
    buildProblems = [];
    const name = P.app.file, board = P.board, t0 = Date.now();
    const files = {};
    ['main/app.c', 'main/ui.c', 'main/ui.h'].forEach(function (f) { files[f] = fileText(f); });
    const tick = setInterval(function () {
      msg('Building ' + name + '.elf for the ' + board + ' on the build server… ' + Math.round((Date.now() - t0) / 1000) + ' s' +
          (Date.now() - t0 > 20000 ? ' (the first build of a board compiles ESP-IDF: minutes)' : ''));
    }, 1000);
    const done = function (text) { clearInterval(tick); building = false; msg(text); exportMenu(); };
    fetch(BUILD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: board, name: name, files: files }) })
      .then(function (r) {
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

  /* ---------------------------------------------------------------- run */

  function toggleRun() {
    if (!M) return;
    if (run) {
      run = null;
      hover = null;
      overlay.classList.remove('running');
      $('#run').classList.remove('on');
      $('#run span').textContent = 'Run';
      msg('');
      if (!M._sim_design_active()) M.ccall('sim_design_app', null, ['string'], [P.app.name]);
      refresh();
      return;
    }
    if (mode === 'code') setMode('design');
    run = { stack: [screen().name] };
    overlay.classList.add('running');
    $('#run').classList.add('on');
    $('#run span').textContent = 'Stop';
    msg('Running: the mouse is a finger, Esc is the back swipe. Messages stand in for your functions.');
    marks();
    $('#stage').focus();
  }
  $('#run').addEventListener('click', toggleRun);

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
  function removeSel() {
    if (!sel || sel === 'app' || sel.type === 'root') return;
    const p = parentOf(sel), i = p.kids.indexOf(sel);
    p.kids.splice(i, 1);
    sel = p.kids[Math.min(i, p.kids.length - 1)] || p;
    hover = null;
    all();
    commit();
  }
  function paste(n) {
    reserved = {};
    const c = clone(n);
    let b = sel && sel !== 'app' ? sel : root();
    if (!isBox(b)) b = parentOf(b) || root();
    b.kids.push(c);
    sel = c;
    all();
    commit();
  }
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
    const node = sel && sel !== 'app' ? sel : null;
    if (mod && k === 'c' && node && node.type !== 'root') { clip = JSON.parse(JSON.stringify(node)); msg('Copied ' + node.name); return; }
    if (mod && k === 'x' && node && node.type !== 'root') { clip = JSON.parse(JSON.stringify(node)); removeSel(); return; }
    if (mod && k === 'v' && clip) { e.preventDefault(); paste(clip); return; }
    if (mod && k === 'd' && node && node.type !== 'root') { e.preventDefault(); paste(node); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
    if (e.key === 'Escape' && node) { select(parentOf(node) || root()); return; }
    if (e.key.startsWith('Arrow') && node) {
      const par = parentOf(node);
      if (!par || !(par.props.layout === 'free' || !par.props.layout)) return;
      e.preventDefault();
      const step = e.shiftKey ? 16 : e.altKey ? 1 : 4, a = e.key.slice(5);
      if (a === 'Left' || a === 'Right') node.props.x = String(+(node.props.x || 0) + (a === 'Left' ? -step : step));
      else node.props.y = String(+(node.props.y || 0) + (a === 'Up' ? -step : step));
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
    sel = root();
    renumber();
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
    project: function () { return P; },
    load: openDesign,
    problems: function () { return problems; },
    lint: lint,
    press: function (x, y, down) { M._sim_pointer(x, y, down); },
    engine: function () { return M; }
  };
})();
