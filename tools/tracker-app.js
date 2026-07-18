const STORE_KEY = 'worktracker_v1';
let state = loadState();
let editingId = null;
let currentType = 'project';
let dragId = null;
let dragType = null; // 'item' | 'note'
let calDate = new Date();

function loadState(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch(e){}
  if (!s || !s.items) s = { items: [] };
  s.routines = s.routines || { daily: [], weekly: [], monthly: [] };
  s.notes = s.notes || [];
  s.remember = s.remember || [];
  s.ui = s.ui || { doneCollapsed: true };
  s.pomo = s.pomo || { workMin:25, breakMin:5 };
  s.lastExport = s.lastExport || null;
  return s;
}
function saveState(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function todayStr(){ return new Date().toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

function autoColumn(item){
  const dateRef = item.type==='travel' ? item.start : item.due;
  if (!dateRef) return 'dolater';
  const d = daysBetween(todayStr(), dateRef);
  if (d <= 3) return 'todo';
  if (d <= 14) return 'donext';
  return 'dolater';
}
function effectiveColumn(item){ return item.override ? item.column : autoColumn(item); }

function badgeClass(type){ return type==='project' ? 'b-project' : (type==='travel' ? 'b-travel' : 'b-task'); }
function priorityDot(p){ return p==='high' ? 'd-bad' : (p==='low' ? 'd-good' : 'd-warn'); }

function matchesFilter(it){
  const q = (document.getElementById('boardFilter').value || '').trim().toLowerCase();
  if (!q) return true;
  return (it.title||'').toLowerCase().includes(q) || (it.client||'').toLowerCase().includes(q) || (it.code||'').toLowerCase().includes(q);
}
function quickAdd(){
  const input = document.getElementById('quickAddInput');
  const title = input.value.trim();
  if (!title) return;
  state.items.push({ id:'i'+Date.now()+Math.random().toString(36).slice(2,7), type:'task', title,
    client:'', code:'', standards:'', due:'', priority:'med', start:'', end:'', estimate:'', notes:'',
    override:true, column:'donext' });
  input.value = '';
  render();
}

function render(){
  const cols = { todo:[], donext:[], dolater:[], done:[] };
  state.items.filter(it=>it.type!=='project').forEach(it => cols[effectiveColumn(it)].push(it));
  Object.keys(cols).forEach(k=>{
    cols[k].sort((a,b)=>{
      const da = (a.type==='travel'?a.start:a.due) || '9999';
      const db = (b.type==='travel'?b.start:b.due) || '9999';
      return da.localeCompare(db);
    });
  });
  document.querySelectorAll('.cardslot').forEach(slot=>{
    const k = slot.dataset.col;
    slot.innerHTML = '';
    const visible = cols[k].filter(matchesFilter);
    if (visible.length===0){ slot.innerHTML = '<div class="emptycol">Nothing here.</div>'; }
    visible.forEach(it=>slot.appendChild(renderCard(it)));
    document.getElementById('cnt-'+k).textContent = cols[k].length;
  });
  document.querySelector('.col.done .cardslot').classList.toggle('collapsed', state.ui.doneCollapsed);
  document.getElementById('archiveToggleBtn').textContent = state.ui.doneCollapsed ? 'show' : 'hide';

  const overdue = state.items.filter(it=>{
    if (it.type==='project') return false;
    const ref = it.type==='travel'?it.start:it.due;
    return ref && daysBetween(todayStr(),ref) < 0 && effectiveColumn(it)!=='done';
  }).length;

  document.getElementById('subline').textContent = 'Updated ' + new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const stats = document.getElementById('stats');
  stats.innerHTML = '';
  addStat(stats, cols.todo.length, 'to do', 't-warn');
  addStat(stats, cols.donext.length, 'do next', 't-bad');
  addStat(stats, cols.dolater.length, 'do later', '');
  addStat(stats, overdue, 'overdue', overdue>0?'t-bad':'t-good');

  const total = state.items.length;
  const doneCount = cols.done.length;
  const outstanding = total - doneCount;
  const pct = total===0 ? 0 : Math.round((doneCount/total)*100);
  const circumference = 2 * Math.PI * 27;
  const ringval = document.getElementById('ringval');
  ringval.setAttribute('stroke-dasharray', circumference.toFixed(1));
  ringval.setAttribute('stroke-dashoffset', (circumference * (1 - pct/100)).toFixed(1));
  document.getElementById('ringpct').textContent = total===0 ? '-' : (outstanding + ' left');

  renderToday();
  renderWeek();
  renderNotes();
  renderRemember();
  renderRoutines();
  renderCalendar();
  renderProjects();
  renderBackupBanner();
  saveState();
}
function addStat(container, num, label, tone){
  const d = document.createElement('div'); d.className = 'stat ' + tone;
  d.innerHTML = '<div class="statnum">'+num+'</div><div class="statlabel">'+label+'</div>';
  container.appendChild(d);
}

function renderCard(it){
  const el = document.createElement('div');
  const ref = it.type==='travel' ? it.start : it.due;
  const isOverdue = ref && daysBetween(todayStr(),ref) < 0 && effectiveColumn(it)!=='done';
  el.className = 'itemcard' + (isOverdue ? ' overdue' : ''); el.draggable = true; el.dataset.id = it.id;
  el.addEventListener('dragstart', ()=>{ dragId = it.id; dragType = 'item'; el.classList.add('dragging'); });
  el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); });
  el.addEventListener('click', ()=>openModal(it.id));
  let dateLabel = '';
  if (ref){
    const d = daysBetween(todayStr(), ref);
    dateLabel = d<0 ? Math.abs(d)+'d overdue' : (d===0 ? 'today' : 'in '+d+'d');
  }
  const metaBits = [];
  if (it.type==='project' && it.client) metaBits.push(it.client);
  if (it.type==='project' && it.code) metaBits.push(it.code);
  if (dateLabel) metaBits.push(dateLabel);
  if (it.estimate) metaBits.push(it.estimate);
  const prjColor = it.projectId ? projectColorFor(it.projectId) : null;
  const prjTitle = it.projectId ? (state.items.find(p=>p.id===it.projectId)||{}).title : '';
  el.innerHTML =
    '<div class="itop"><span class="badge '+badgeClass(it.type)+'">'+it.type+'</span>'+
    (prjColor ? '<span class="prjdot" style="background:'+prjColor+'" title="'+escapeHtml(prjTitle)+'"></span>' : '')+
    (it.priority ? '<span class="dot '+priorityDot(it.priority)+'"></span>' : '')+
    '</div>'+
    '<div class="ititle">'+escapeHtml(it.title)+'</div>'+
    '<div class="imeta">'+metaBits.map(escapeHtml).join(' · ')+'</div>'+
    projectSelectHtml(it)+
    (it.override ? '<div style="margin-top:5px"><button class="overridebtn" onclick="clearOverride(event,\''+it.id+'\')">reset to auto</button></div>' : '');
  return el;
}
function projectSelectHtml(it){
  if (it.type !== 'task') return '';
  const projects = projectList();
  if (projects.length===0) return '';
  const opts = '<option value="">No project</option>' + projects.map(p=>
    '<option value="'+p.id+'"'+(it.projectId===p.id?' selected':'')+'>'+escapeHtml(p.title)+'</option>').join('');
  return '<select class="cardprojectselect" onclick="event.stopPropagation()" onchange="assignProject(event,\''+it.id+'\')">'+opts+'</select>';
}
function assignProject(e, itemId){
  e.stopPropagation();
  const it = state.items.find(x=>x.id===itemId);
  if (!it) return;
  it.projectId = e.target.value || null;
  render();
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function onDragOver(e){ e.preventDefault(); e.currentTarget.classList.add('dragover'); }
function onDragLeave(e){ e.currentTarget.classList.remove('dragover'); }
function onDrop(e, col){
  e.preventDefault(); e.currentTarget.classList.remove('dragover');
  if (dragType === 'note'){
    const note = state.notes.find(n=>n.id===dragId);
    if (!note) return;
    state.items.push({ id:'i'+Date.now()+Math.random().toString(36).slice(2,7), type:'task', title:note.text,
      client:'', code:'', standards:'', due:'', priority:'med', start:'', end:'', estimate:'', notes:'',
      override:true, column:col });
    state.notes = state.notes.filter(n=>n.id!==dragId);
    dragType = null; dragId = null;
    if (col==='done') state.ui.doneCollapsed = false;
    render();
    return;
  }
  const it = state.items.find(x=>x.id===dragId);
  if (!it) return;
  it.override = true; it.column = col;
  if (col==='done') state.ui.doneCollapsed = false;
  render();
}
function onNoteTrayDrop(e){
  e.preventDefault(); e.currentTarget.classList.remove('dragover');
}
function clearOverride(e, id){
  e.stopPropagation();
  const it = state.items.find(x=>x.id===id);
  if (it){ it.override = false; render(); }
}
function toggleArchive(){ state.ui.doneCollapsed = !state.ui.doneCollapsed; render(); }

function renderNotes(){
  const grid = document.getElementById('notegrid');
  grid.innerHTML = '';
  if (state.notes.length===0){ grid.innerHTML = '<div class="notetray-empty">No notes yet. Add one below.</div>'; return; }
  state.notes.forEach(n=>{
    const el = document.createElement('div');
    el.className = 'stickynote'; el.draggable = true; el.dataset.id = n.id;
    el.addEventListener('dragstart', ()=>{ dragId = n.id; dragType = 'note'; el.classList.add('dragging'); });
    el.addEventListener('dragend', ()=>{ el.classList.remove('dragging'); });
    el.innerHTML = '<button class="ndel" onclick="delNote(event,\''+n.id+'\')">×</button>' + escapeHtml(n.text);
    grid.appendChild(el);
  });
}
function addNote(){
  const input = document.getElementById('noteInput');
  const text = input.value.trim();
  if (!text) return;
  state.notes.push({ id:'n'+Date.now()+Math.random().toString(36).slice(2,7), text });
  input.value = '';
  render();
}
function delNote(e, id){
  e.stopPropagation();
  state.notes = state.notes.filter(n=>n.id!==id);
  render();
}

function renderRemember(){
  const list = document.getElementById('rememberlist');
  list.innerHTML = '';
  if (state.remember.length===0){ list.innerHTML = '<div class="notetray-empty">Nothing pinned yet.</div>'; return; }
  state.remember.forEach(n=>{
    const row = document.createElement('div'); row.className = 'rememberrow';
    row.innerHTML = '<span class="pin">📌</span><span class="rtxt">'+escapeHtml(n.text)+'</span>'+
      '<button class="rdelbtn" onclick="delRemember(\''+n.id+'\')">×</button>';
    list.appendChild(row);
  });
}
function addRemember(){
  const input = document.getElementById('rememberInput');
  const text = input.value.trim();
  if (!text) return;
  state.remember.push({ id:'m'+Date.now()+Math.random().toString(36).slice(2,7), text });
  input.value = '';
  render();
}
function delRemember(id){
  state.remember = state.remember.filter(n=>n.id!==id);
  render();
}

function setType(t){
  currentType = t;
  document.querySelectorAll('.typetab').forEach(el=>el.classList.toggle('active', el.dataset.type===t));
  document.querySelectorAll('.proj-only').forEach(el=>el.classList.toggle('hide', t!=='project'));
  document.querySelectorAll('.travel-only').forEach(el=>el.classList.toggle('hide', t!=='travel'));
  document.querySelectorAll('.nontravel-only').forEach(el=>el.classList.toggle('hide', t==='travel'));
  document.querySelectorAll('.task-only').forEach(el=>el.classList.toggle('hide', t!=='task'));
}

const PROJECT_COLORS = ['#d98e4a','#4ecb8d','#e6c05a','#7aa2f7','#e66a5a','#c792ea'];
function projectList(){ return state.items.filter(it=>it.type==='project'); }
function projectColorFor(projectId){
  const list = projectList();
  const idx = list.findIndex(p=>p.id===projectId);
  return idx>=0 ? PROJECT_COLORS[idx % PROJECT_COLORS.length] : null;
}
function populateProjectSelect(selectedId){
  const sel = document.getElementById('f-project');
  const list = projectList();
  sel.innerHTML = '<option value="">None</option>' +
    list.map(p=>'<option value="'+p.id+'">'+escapeHtml(p.title)+'</option>').join('');
  sel.value = selectedId || '';
}

function openModal(id, projectIdPreset){
  editingId = id || null;
  const it = id ? state.items.find(x=>x.id===id) : null;
  document.getElementById('modalTitle').textContent = it ? 'Edit item' : 'Add item';
  document.getElementById('deleteBtn').style.visibility = it ? 'visible' : 'hidden';
  setType(it ? it.type : (projectIdPreset ? 'task' : 'project'));
  document.getElementById('f-title').value = it ? it.title : '';
  document.getElementById('f-client').value = it ? (it.client||'') : '';
  document.getElementById('f-code').value = it ? (it.code||'') : '';
  document.getElementById('f-standards').value = it ? (it.standards||'') : '';
  document.getElementById('f-due').value = it ? (it.due||'') : '';
  document.getElementById('f-priority').value = it ? (it.priority||'med') : 'med';
  document.getElementById('f-start').value = it ? (it.start||'') : '';
  document.getElementById('f-end').value = it ? (it.end||'') : '';
  document.getElementById('f-estimate').value = it ? (it.estimate||'') : '';
  document.getElementById('f-notes').value = it ? (it.notes||'') : '';
  populateProjectSelect(it ? (it.projectId||'') : (projectIdPreset||''));
  document.getElementById('modalBg').classList.add('open');
}
function closeModal(){ document.getElementById('modalBg').classList.remove('open'); }

function saveItem(){
  const title = document.getElementById('f-title').value.trim();
  if (!title){ alert('Give it a title.'); return; }
  const data = {
    type: currentType,
    title,
    client: document.getElementById('f-client').value.trim(),
    code: document.getElementById('f-code').value.trim(),
    standards: document.getElementById('f-standards').value.trim(),
    due: document.getElementById('f-due').value,
    priority: document.getElementById('f-priority').value,
    start: document.getElementById('f-start').value,
    end: document.getElementById('f-end').value,
    estimate: document.getElementById('f-estimate').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
    projectId: currentType==='task' ? (document.getElementById('f-project').value || null) : null,
  };
  if (editingId){
    const it = state.items.find(x=>x.id===editingId);
    Object.assign(it, data);
  } else {
    state.items.push(Object.assign({ id: 'i'+Date.now()+Math.random().toString(36).slice(2,7), override:false, column:'dolater' }, data));
  }
  closeModal(); render();
}
function deleteItem(){
  if (!editingId) return;
  if (!confirm('Delete this item?')) return;
  state.items.forEach(it=>{ if (it.projectId===editingId) it.projectId = null; });
  state.items = state.items.filter(x=>x.id!==editingId);
  closeModal(); render();
}

function periodKey(freq){
  const d = new Date();
  if (freq==='daily') return todayStr();
  if (freq==='weekly'){ const day=(d.getDay()+6)%7; const mon=new Date(d); mon.setDate(d.getDate()-day); return mon.toISOString().slice(0,10); }
  if (freq==='monthly') return d.toISOString().slice(0,7);
}
function renderRoutines(){
  ['daily','weekly','monthly'].forEach(freq=>{
    const list = document.querySelector('#rcol-'+freq+' .rlist');
    list.innerHTML = '';
    const pk = periodKey(freq);
    (state.routines[freq]||[]).forEach(r=>{
      const done = r.lastDone===pk;
      const row = document.createElement('div'); row.className = 'rrow';
      row.innerHTML = '<input type="checkbox" '+(done?'checked':'')+' onchange="toggleRoutine(\''+freq+'\',\''+r.id+'\')">'+
        '<span class="rtext'+(done?' done':'')+'" style="flex:1">'+escapeHtml(r.text)+'</span>'+
        '<button class="rdel" onclick="delRoutine(\''+freq+'\',\''+r.id+'\')">×</button>';
      list.appendChild(row);
    });
  });
}
function addRoutine(freq, input){
  const text = input.value.trim();
  if (!text) return;
  state.routines[freq] = state.routines[freq] || [];
  state.routines[freq].push({ id:'r'+Date.now()+Math.random().toString(36).slice(2,7), text, lastDone:null });
  input.value = '';
  render();
}
function toggleRoutine(freq, id){
  const r = state.routines[freq].find(x=>x.id===id);
  const pk = periodKey(freq);
  r.lastDone = (r.lastDone===pk) ? null : pk;
  render();
}
function delRoutine(freq, id){
  state.routines[freq] = state.routines[freq].filter(x=>x.id!==id);
  render();
}

/* ---- Calendar ---- */
function calShift(n){ calDate.setMonth(calDate.getMonth()+n); render(); }
function renderCalendar(){
  const year = calDate.getFullYear(), month = calDate.getMonth();
  document.getElementById('calLabel').textContent = calDate.toLocaleString('en-GB',{month:'long', year:'numeric'});
  const byDate = {};
  state.items.filter(it=>it.type!=='project').forEach(it=>{
    const ref = it.type==='travel' ? it.start : it.due;
    if (!ref) return;
    (byDate[ref] = byDate[ref] || []).push(it);
  });
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{
    const el = document.createElement('div'); el.className='caldow'; el.textContent=d; grid.appendChild(el);
  });
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay()+6)%7; // Monday-first
  const gridStart = new Date(year, month, 1-startOffset);
  const today = todayStr();
  for (let i=0;i<42;i++){
    const d = new Date(gridStart); d.setDate(gridStart.getDate()+i);
    const dstr = d.toISOString().slice(0,10);
    const cell = document.createElement('div');
    cell.className = 'calcell' + (d.getMonth()!==month ? ' otherMonth' : '') + (dstr===today ? ' today' : '');
    let html = '<div class="caldaynum">'+d.getDate()+'</div>';
    const items = (byDate[dstr]||[]);
    items.slice(0,3).forEach(it=>{
      const pc = it.projectId ? projectColorFor(it.projectId) : null;
      const dotHtml = pc ? '<span class="prjdot" style="width:6px;height:6px;margin-right:3px;background:'+pc+'"></span>' : '';
      html += '<div class="calchip c-'+effectiveColumn(it)+'">'+dotHtml+escapeHtml(it.title)+'</div>';
    });
    if (items.length>3) html += '<div class="calmore">+'+(items.length-3)+' more</div>';
    cell.innerHTML = html;
    cell.addEventListener('dragover', onDragOver);
    cell.addEventListener('dragleave', onDragLeave);
    cell.addEventListener('drop', e=>onDateDrop(e, dstr));
    grid.appendChild(cell);
  }
}

/* ---- Today box ---- */
function renderToday(){
  const box = document.getElementById('todaybox');
  const dateLbl = new Date().toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long'});
  const items = state.items.filter(it=>{
    if (it.type==='project') return false;
    if (effectiveColumn(it)==='done') return false;
    const ref = it.type==='travel' ? it.start : it.due;
    const dueTodayOrOverdue = ref && daysBetween(todayStr(),ref) <= 0;
    return dueTodayOrOverdue || effectiveColumn(it)==='donext';
  }).sort((a,b)=>{
    const da = (a.type==='travel'?a.start:a.due) || '9999';
    const db = (b.type==='travel'?b.start:b.due) || '9999';
    return da.localeCompare(db);
  });
  let rowsHtml = '';
  if (items.length===0){
    rowsHtml = '<div class="today-empty">Nothing urgent on the books. Pick something from Do Next.</div>';
  } else {
    items.forEach(it=>{
      const ref = it.type==='travel' ? it.start : it.due;
      let when = '';
      if (ref){ const d = daysBetween(todayStr(), ref); when = d<0 ? Math.abs(d)+'d overdue' : (d===0?'today':'in '+d+'d'); }
      else if (effectiveColumn(it)==='donext') when = 'priority';
      rowsHtml += '<div class="todayrow"><button class="tdone" onclick="markDoneFromToday(\''+it.id+'\')" title="Mark done">✓</button>'+
        '<div class="ttxt"><div class="ttitle">'+escapeHtml(it.title)+'</div><div class="tmeta">'+badgeClass(it.type).replace('b-','')+' · '+when+'</div></div></div>';
    });
  }
  box.innerHTML = '<div class="sub" style="margin-bottom:10px">'+dateLbl+' · due today, overdue, or in Do Next</div><div class="todaylist">'+rowsHtml+'</div>';
}
function markDoneFromToday(id){
  const it = state.items.find(x=>x.id===id);
  if (it){ it.override = true; it.column = 'done'; }
  render();
}

/* ---- This Week strip ---- */
function renderWeek(){
  const strip = document.getElementById('weekstrip');
  strip.innerHTML = '';
  const byDate = {};
  state.items.filter(it=>it.type!=='project').forEach(it=>{
    const ref = it.type==='travel' ? it.start : it.due;
    if (!ref) return;
    (byDate[ref] = byDate[ref] || []).push(it);
  });
  const today = todayStr();
  for (let i=0;i<7;i++){
    const d = new Date(); d.setDate(d.getDate()+i);
    const dstr = d.toISOString().slice(0,10);
    const items = byDate[dstr] || [];
    const cell = document.createElement('div');
    cell.className = 'weekday' + (dstr===today?' today':'');
    let html = '<div class="weekdayname">'+d.toLocaleDateString('en-GB',{weekday:'short'})+'</div>'+
      '<div class="weekdatenum">'+d.getDate()+'</div>';
    items.slice(0,3).forEach(it=>{
      const pc = it.projectId ? projectColorFor(it.projectId) : null;
      const dotHtml = pc ? '<span class="prjdot" style="width:6px;height:6px;margin-right:3px;background:'+pc+'"></span>' : '';
      html += '<div class="weekchip c-'+effectiveColumn(it)+'">'+dotHtml+escapeHtml(it.title)+'</div>';
    });
    if (items.length>3) html += '<div class="weekmore">+'+(items.length-3)+' more</div>';
    cell.innerHTML = html;
    cell.addEventListener('dragover', onDragOver);
    cell.addEventListener('dragleave', onDragLeave);
    cell.addEventListener('drop', e=>onDateDrop(e, dstr));
    strip.appendChild(cell);
  }
}

/* ---- Projects / sprints ---- */
function renderProjects(){
  const wrap = document.getElementById('projectsWrap');
  const projects = projectList();
  if (projects.length===0){
    wrap.innerHTML = '<div class="project-empty">No projects yet. Add one with "+ Add item" and pick Project.</div>';
    return;
  }
  wrap.innerHTML = '';
  projects.forEach((p,idx)=>{
    const color = PROJECT_COLORS[idx % PROJECT_COLORS.length];
    const tasks = state.items.filter(it=>it.projectId===p.id).sort((a,b)=>{
      const da = a.due || '9999', db = b.due || '9999';
      return da.localeCompare(db);
    });
    const doneCount = tasks.filter(t=>effectiveColumn(t)==='done').length;
    const pct = tasks.length===0 ? 0 : Math.round((doneCount/tasks.length)*100);
    const metaBits = [];
    if (p.client) metaBits.push(p.client);
    if (p.code) metaBits.push(p.code);
    if (p.standards) metaBits.push(p.standards);

    const card = document.createElement('div');
    card.className = 'projectcard';
    card.style.borderTopColor = color;
    let tasksHtml = '';
    if (tasks.length===0){
      tasksHtml = '<div class="project-empty">No tasks linked yet.</div>';
    } else {
      tasksHtml = tasks.map(t=>{
        const isDone = effectiveColumn(t)==='done';
        return '<div class="ptrow'+(isDone?' is-done':'')+'" onclick="openModal(\''+t.id+'\')">'+
          '<button class="ptdone" onclick="event.stopPropagation();toggleProjectTaskDone(\''+t.id+'\')" title="Toggle done">'+(isDone?'✓':'')+'</button>'+
          '<span class="pttitle">'+escapeHtml(t.title)+'</span>'+
          '</div>';
      }).join('');
    }
    card.innerHTML =
      '<div class="projecthead"><span class="prjdot" style="background:'+color+'"></span><h3>'+escapeHtml(p.title)+'</h3>'+
      '<button class="projicon" onclick="openModal(\''+p.id+'\')" title="Edit project">✎</button>'+
      '<button class="projicon" onclick="deleteProject(\''+p.id+'\')" title="Delete project">🗑</button></div>'+
      (metaBits.length ? '<div class="projectmeta">'+metaBits.map(escapeHtml).join(' · ')+'</div>' : '')+
      '<div class="probar"><span style="width:'+pct+'%;background:'+color+'"></span></div>'+
      '<div class="probarlabel">'+doneCount+' of '+tasks.length+' done · '+pct+'%</div>'+
      '<div class="projecttasks">'+tasksHtml+'</div>'+
      '<div class="projectaddrow"><input placeholder="Add task to this project…" data-project="'+p.id+'" onkeydown="if(event.key===\'Enter\')addProjectTask(\''+p.id+'\',this)">'+
      '<button class="ghost small" onclick="addProjectTask(\''+p.id+'\', this.previousElementSibling)">Add</button></div>';
    wrap.appendChild(card);
  });
}
function addProjectTask(projectId, input){
  const title = input.value.trim();
  if (!title) return;
  state.items.push({ id:'i'+Date.now()+Math.random().toString(36).slice(2,7), type:'task', title,
    client:'', code:'', standards:'', due:'', priority:'med', start:'', end:'', estimate:'', notes:'',
    projectId, override:true, column:'dolater' });
  input.value = '';
  render();
}
function deleteProject(id){
  const proj = state.items.find(x=>x.id===id);
  if (!proj) return;
  const linkedCount = state.items.filter(it=>it.projectId===id).length;
  const msg = linkedCount>0
    ? 'Delete "'+proj.title+'"? Its '+linkedCount+' linked task'+(linkedCount===1?'':'s')+' will stay on the board, just unlinked from this project.'
    : 'Delete "'+proj.title+'"?';
  if (!confirm(msg)) return;
  state.items.forEach(it=>{ if (it.projectId===id) it.projectId = null; });
  state.items = state.items.filter(x=>x.id!==id);
  render();
}
function toggleProjectTaskDone(id){
  const it = state.items.find(x=>x.id===id);
  if (!it) return;
  const isDone = effectiveColumn(it)==='done';
  it.override = true;
  it.column = isDone ? 'dolater' : 'done';
  render();
}

/* ---- Dropping notes or cards onto a date (calendar / week strip) ---- */
function onDateDrop(e, dateStr){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  if (dragType === 'note'){
    const note = state.notes.find(n=>n.id===dragId);
    if (!note) return;
    state.items.push({ id:'i'+Date.now()+Math.random().toString(36).slice(2,7), type:'task', title:note.text,
      client:'', code:'', standards:'', due:dateStr, priority:'med', start:'', end:'', estimate:'', notes:'',
      override:false, column:'dolater' });
    state.notes = state.notes.filter(n=>n.id!==dragId);
    dragType = null; dragId = null;
    render();
    return;
  }
  if (dragType === 'item'){
    const it = state.items.find(x=>x.id===dragId);
    if (!it) return;
    if (it.type==='travel') it.start = dateStr; else it.due = dateStr;
    it.override = false;
    dragType = null; dragId = null;
    render();
  }
}

/* ---- Pomodoro ---- */
let pomoRemaining = (state.pomo.workMin||25)*60;
let pomoMode = 'focus';
let pomoRunning = false;
let pomoTimerId = null;
function pomoFormat(){
  const m = Math.floor(pomoRemaining/60), s = pomoRemaining%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function pomoUpdateDisplay(){
  document.getElementById('pomotime').textContent = pomoFormat();
  document.getElementById('pomomode').textContent = pomoMode==='focus' ? 'Focus' : 'Break';
  document.getElementById('pomo').className = 'pomocard mode-' + pomoMode;
  document.getElementById('pomoStartBtn').textContent = pomoRunning ? 'Pause' : 'Start';
}
function pomoToggle(){ pomoRunning ? pomoPause() : pomoStart(); }
function pomoStart(){
  pomoRunning = true;
  pomoTimerId = setInterval(()=>{
    pomoRemaining--;
    if (pomoRemaining <= 0){
      pomoBeep();
      pomoMode = pomoMode==='focus' ? 'break' : 'focus';
      pomoRemaining = (pomoMode==='focus' ? (state.pomo.workMin||25) : (state.pomo.breakMin||5)) * 60;
    }
    pomoUpdateDisplay();
  }, 1000);
  pomoUpdateDisplay();
}
function pomoPause(){ pomoRunning = false; clearInterval(pomoTimerId); pomoUpdateDisplay(); }
function pomoReset(){
  pomoPause(); pomoMode = 'focus';
  pomoRemaining = (state.pomo.workMin||25)*60;
  pomoUpdateDisplay();
}
function pomoBeep(){
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.6);
    o.start(); o.stop(ctx.currentTime+0.6);
  } catch(e){}
}

function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'work-tracker-backup-'+todayStr()+'.json';
  a.click();
  state.lastExport = todayStr();
  saveState();
  renderBackupBanner();
}
function renderBackupBanner(){
  const banner = document.getElementById('backupBanner');
  const text = document.getElementById('backupBannerText');
  const daysSince = state.lastExport ? daysBetween(state.lastExport, todayStr()) : null;
  if (daysSince === null){
    text.textContent = "You haven't backed up yet. Export keeps a copy safe if the browser data ever gets cleared.";
    banner.classList.add('show');
  } else if (daysSince >= 7){
    text.textContent = 'Last backup was ' + daysSince + ' days ago. Worth exporting a fresh copy.';
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}
function importData(evt){
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.items) throw new Error('bad file');
      if (!confirm('Import will replace all current data. Continue?')) return;
      state = data;
      state.routines = state.routines || { daily:[], weekly:[], monthly:[] };
      state.notes = state.notes || [];
      state.remember = state.remember || [];
      state.ui = state.ui || { doneCollapsed: true };
      state.pomo = state.pomo || { workMin:25, breakMin:5 };
      state.lastExport = state.lastExport || null;
      render();
    } catch(e){ alert('Could not read that file.'); }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

document.getElementById('modalBg').addEventListener('click', e=>{ if (e.target.id==='modalBg') closeModal(); });

pomoUpdateDisplay();
render();
