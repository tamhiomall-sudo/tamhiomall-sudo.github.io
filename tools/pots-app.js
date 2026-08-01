const STORE_KEY = 'savingspots_v1';

// ---------- seed data (imported from the household budget spreadsheet, 2026-08-01) ----------
function seedPots(){
  const raw = [
    {"name":"Huis Fonds","group":"Spaar","target":null,"monthly":100,"due":null,"balance":111.67,"id":"p-huis-fonds"},
    {"name":"Ekstra","group":"Spaar","target":null,"monthly":250,"due":null,"balance":117.31,"id":"p-ekstra"},
    {"name":"G Skool Kos","group":"Spaar","target":null,"monthly":43,"due":null,"balance":65,"id":"p-g-skool-kos"},
    {"name":"DofE","group":"Klubs","target":null,"monthly":0,"due":"2027-05-27","balance":0,"id":"p-dofe"},
    {"name":"Maya - sport","group":"Klubs","target":null,"monthly":50,"due":null,"balance":107.5,"id":"p-maya-sport"},
    {"name":"Heidi - sport","group":"Klubs","target":null,"monthly":50,"due":null,"balance":150,"id":"p-heidi-sport"},
    {"name":"Geo - sport","group":"Klubs","target":null,"monthly":60,"due":null,"balance":-240,"id":"p-geo-sport"},
    {"name":"Apr week","group":"Vakansie","target":1000,"monthly":83.33,"due":"2026-04-01","balance":113,"id":"p-apr-week"},
    {"name":"Aug Vakansie","group":"Vakansie","target":3750,"monthly":312.5,"due":"2026-08-01","balance":4216.5,"id":"p-aug-vakansie"},
    {"name":"New Day","group":"Vakansie","target":450,"monthly":37.5,"due":"2027-01-01","balance":229.5,"id":"p-new-day"},
    {"name":"Verjaar/partytjies","group":"Vakansie","target":600,"monthly":50,"due":"2026-07-01","balance":185,"id":"p-verjaar-partytjies"},
    {"name":"Kersfees","group":"Vakansie","target":400,"monthly":33.33,"due":"2026-12-01","balance":241,"id":"p-kersfees"},
    {"name":"A MOT & Diens","group":"Motors","target":800,"monthly":66.67,"due":"2027-01-01","balance":791,"id":"p-a-mot-diens"},
    {"name":"A Insurance","group":"Motors","target":330,"monthly":27.5,"due":"2027-01-01","balance":291,"id":"p-a-insurance"},
    {"name":"A Tax","group":"Motors","target":35,"monthly":2.92,"due":"2027-01-01","balance":17.5,"id":"p-a-tax"},
    {"name":"L MOT & Diens","group":"Motors","target":480,"monthly":40,"due":"2027-02-01","balance":354,"id":"p-l-mot-diens"},
    {"name":"L Insurance","group":"Motors","target":250,"monthly":20.83,"due":"2027-02-01","balance":298,"id":"p-l-insurance"},
    {"name":"L Tax","group":"Motors","target":0,"monthly":0,"due":"2027-02-01","balance":0,"id":"p-l-tax"},
    {"name":"Armed Forces","group":"Motors","target":36,"monthly":3,"due":"2026-12-01","balance":18,"id":"p-armed-forces"},
    {"name":"TV Lisensie","group":"Motors","target":171,"monthly":14.25,"due":"2026-07-01","balance":3.75,"id":"p-tv-lisensie"},
    {"name":"AI Model","group":"Motors","target":200,"monthly":20,"due":"2027-05-27","balance":20,"id":"p-ai-model"},
    {"name":"Emergency Fund","group":"Motors","target":1000,"monthly":100,"due":null,"balance":100,"id":"p-emergency-fund"},
    {"name":"Visa","group":"Motors","target":null,"monthly":0,"due":null,"balance":150,"id":"p-visa"},
    {"name":"Maya - klere","group":"JOINT ACC:  Klere","target":null,"monthly":40,"due":null,"balance":65.5,"id":"p-maya-klere"},
    {"name":"Heidi - klere","group":"JOINT ACC:  Klere","target":null,"monthly":40,"due":null,"balance":207,"id":"p-heidi-klere"},
    {"name":"Geo - klere","group":"JOINT ACC:  Klere","target":null,"monthly":40,"due":null,"balance":173,"id":"p-geo-klere"}
  ];
  const today = todayStr();
  const pots = raw.map(r => ({ id:r.id, name:r.name, group:r.group, target:r.target, monthly:r.monthly, due:r.due }));
  const transactions = raw.filter(r => r.balance !== 0).map(r => ({
    id: uid(), potId: r.id, date: today, description: 'Opening balance (imported from budget spreadsheet)',
    amount: r.balance, auto: false
  }));
  return { pots, transactions };
}

// ---------- state ----------
function uid(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function monthStr(dateStr){ return (dateStr || '').slice(0,7); }
function fmt(n){ return (n<0?'-£':'£') + Math.abs(n).toFixed(2); }

function loadState(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch(e){}
  if (!s || !s.pots || !s.pots.length){
    const seeded = seedPots();
    s = { pots: seeded.pots, transactions: seeded.transactions };
  }
  s.pots = s.pots || [];
  s.transactions = s.transactions || [];
  return s;
}
function saveState(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

let state = loadState();
let openPotId = null;
let txType = 'spend';

// ---------- automatic monthly top-up ----------
function runAutoTopups(){
  const thisMonth = monthStr(todayStr());
  let added = false;
  state.pots.forEach(p => {
    if (!p.monthly || p.monthly <= 0) return;
    const already = state.transactions.some(t => t.potId === p.id && t.auto && monthStr(t.date) === thisMonth);
    if (!already){
      state.transactions.push({
        id: uid(), potId: p.id, date: thisMonth + '-01',
        description: 'Monthly top-up', amount: p.monthly, auto: true
      });
      added = true;
    }
  });
  if (added) saveState();
}

// ---------- derived ----------
function potBalance(potId){
  return state.transactions.filter(t => t.potId === potId).reduce((s,t) => s + t.amount, 0);
}
function potTransactions(potId){
  return state.transactions.filter(t => t.potId === potId).sort((a,b) => b.date.localeCompare(a.date) || 0);
}
function groupsInUse(){
  const seen = [];
  state.pots.forEach(p => { const g = p.group || 'Other'; if (!seen.includes(g)) seen.push(g); });
  return seen;
}

// ---------- rendering ----------
const el = (id) => document.getElementById(id);

function renderHero(){
  const totalBalance = state.pots.reduce((s,p) => s + potBalance(p.id), 0);
  const totalMonthly = state.pots.reduce((s,p) => s + (p.monthly||0), 0);
  const overdrawn = state.pots.filter(p => potBalance(p.id) < 0).length;
  el('heroStats').innerHTML = `
    <div class="stat ${totalBalance<0?'t-bad':''}"><div class="statnum">${fmt(totalBalance)}</div><div class="statlabel">total across all pots</div></div>
    <div class="stat"><div class="statnum">${fmt(totalMonthly)}</div><div class="statlabel">committed each month</div></div>
    <div class="stat"><div class="statnum">${state.pots.length}</div><div class="statlabel">pots</div></div>
    <div class="stat ${overdrawn?'t-bad':'t-good'}"><div class="statnum">${overdrawn}</div><div class="statlabel">running negative</div></div>
  `;
}

function renderPots(){
  const q = (el('search').value || '').trim().toLowerCase();
  const groups = groupsInUse();
  let html = '';
  groups.forEach(g => {
    const pots = state.pots.filter(p => (p.group || 'Other') === g && p.name.toLowerCase().includes(q));
    if (!pots.length) return;
    html += `<h2 class="section">${esc(g)}</h2><div class="potgrid">`;
    pots.forEach(p => {
      const bal = potBalance(p.id);
      const pct = p.target ? Math.max(0, Math.min(100, Math.round(100*bal/p.target))) : null;
      html += `<div class="potcard" data-id="${p.id}">
        <div class="potname">${esc(p.name)}</div>
        <div class="potbal ${bal<0?'neg':''}">${fmt(bal)}</div>
        ${p.target ? `<div class="bar"><span style="width:${pct}%"></span></div><div class="potmeta"><span>target ${fmt(p.target)}</span></div>` : ''}
        <div class="potmeta">
          <span>${p.monthly ? fmt(p.monthly)+'/mo' : 'no monthly top-up'}</span>
          ${p.due ? `<span>due ${p.due}</span>` : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  });
  if (!html) html = '<div class="empty">No pots match. Try a different search, or add one.</div>';
  el('potGroups').innerHTML = html;
  el('potGroups').querySelectorAll('.potcard').forEach(c => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

function render(){ renderHero(); renderPots(); }

function esc(s){ const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

// ---------- pot detail modal ----------
function openDetail(potId){
  openPotId = potId;
  const p = state.pots.find(x => x.id === potId);
  if (!p) return;
  el('detailTitle').textContent = p.name;
  el('detailSub').textContent = (p.group || '') + ' · ' + fmt(potBalance(p.id)) + ' available';
  el('txDate').value = todayStr();
  el('txAmount').value = '';
  el('txDesc').value = '';
  setTxType('spend');
  el('editName').value = p.name;
  el('editGroup').value = p.group || '';
  el('editMonthly').value = p.monthly || 0;
  el('editTarget').value = p.target || '';
  el('editDue').value = p.due || '';
  renderTxTable(potId);
  el('detailModal').classList.add('open');
}
function closeDetail(){ el('detailModal').classList.remove('open'); openPotId = null; }

function renderTxTable(potId){
  const rows = potTransactions(potId);
  const body = rows.map(t => `<tr>
    <td>${t.date}${t.auto ? '<div class="txauto">automatic</div>' : ''}</td>
    <td>${esc(t.description)}</td>
    <td class="amt ${t.amount<0?'neg':'pos'}">${fmt(t.amount)}</td>
    <td><button class="link" data-txid="${t.id}">remove</button></td>
  </tr>`).join('');
  el('txTable').querySelector('tbody').innerHTML = body || '<tr><td colspan="4" class="empty">No history yet.</td></tr>';
  el('txTable').querySelectorAll('button.link').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Remove this entry?')) return;
    state.transactions = state.transactions.filter(t => t.id !== b.dataset.txid);
    saveState(); renderTxTable(potId); render();
    el('detailSub').textContent = (state.pots.find(x=>x.id===potId).group||'') + ' · ' + fmt(potBalance(potId)) + ' available';
  }));
}

function setTxType(t){
  txType = t;
  el('segSpend').classList.toggle('active', t==='spend');
  el('segAdd').classList.toggle('active', t==='add');
}

function addTransaction(){
  const amt = parseFloat(el('txAmount').value);
  if (!amt || amt <= 0){ alert('Enter an amount.'); return; }
  const date = el('txDate').value || todayStr();
  const desc = el('txDesc').value.trim() || (txType === 'spend' ? 'Spend' : 'Added');
  state.transactions.push({
    id: uid(), potId: openPotId, date, description: desc,
    amount: txType === 'spend' ? -Math.abs(amt) : Math.abs(amt), auto: false
  });
  saveState();
  el('txAmount').value = ''; el('txDesc').value = '';
  renderTxTable(openPotId); render();
  const p = state.pots.find(x=>x.id===openPotId);
  el('detailSub').textContent = (p.group||'') + ' · ' + fmt(potBalance(openPotId)) + ' available';
}

function savePotSettings(){
  const p = state.pots.find(x => x.id === openPotId);
  if (!p) return;
  p.name = el('editName').value.trim() || p.name;
  p.group = el('editGroup').value.trim() || 'Other';
  p.monthly = parseFloat(el('editMonthly').value) || 0;
  p.target = el('editTarget').value ? parseFloat(el('editTarget').value) : null;
  p.due = el('editDue').value || null;
  saveState(); render();
  el('detailTitle').textContent = p.name;
}

function deletePot(){
  if (!confirm('Delete this pot and its whole history? This cannot be undone.')) return;
  state.pots = state.pots.filter(p => p.id !== openPotId);
  state.transactions = state.transactions.filter(t => t.potId !== openPotId);
  saveState(); render(); closeDetail();
}

// ---------- add pot modal ----------
function openAddModal(){
  el('newName').value = ''; el('newGroup').value = ''; el('newMonthly').value = 0;
  el('newTarget').value = ''; el('newDue').value = ''; el('newOpening').value = 0;
  el('groupList').innerHTML = groupsInUse().map(g => `<option value="${esc(g)}">`).join('');
  el('addModal').classList.add('open');
}
function closeAddModal(){ el('addModal').classList.remove('open'); }

function createPot(){
  const name = el('newName').value.trim();
  if (!name){ alert('Give the pot a name.'); return; }
  const id = 'p-' + Date.now().toString(36);
  const p = {
    id, name, group: el('newGroup').value.trim() || 'Other',
    monthly: parseFloat(el('newMonthly').value) || 0,
    target: el('newTarget').value ? parseFloat(el('newTarget').value) : null,
    due: el('newDue').value || null,
  };
  state.pots.push(p);
  const opening = parseFloat(el('newOpening').value) || 0;
  if (opening) state.transactions.push({ id: uid(), potId: id, date: todayStr(), description: 'Starting balance', amount: opening, auto: false });
  saveState(); render(); closeAddModal();
}

// ---------- export to Excel ----------
function exportExcel(){
  const potsRows = state.pots.map(p => ({
    Name: p.name, Group: p.group || '', Balance: potBalance(p.id),
    'Monthly top-up': p.monthly || 0, 'Annual target': p.target || '', 'Due date': p.due || ''
  }));
  const txRows = state.transactions
    .slice().sort((a,b) => a.date.localeCompare(b.date))
    .map(t => {
      const p = state.pots.find(x => x.id === t.potId);
      return { Date: t.date, Pot: p ? p.name : '(deleted pot)', Description: t.description, Amount: t.amount, Automatic: t.auto ? 'yes' : '' };
    });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(potsRows), 'Pots');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transactions');
  XLSX.writeFile(wb, 'savings-pots-' + todayStr() + '.xlsx');
}

// ---------- wire up ----------
runAutoTopups();
render();
el('search').addEventListener('input', renderPots);
el('addPotBtn').addEventListener('click', openAddModal);
el('cancelAddBtn').addEventListener('click', closeAddModal);
el('saveNewBtn').addEventListener('click', createPot);
el('closeDetailBtn').addEventListener('click', closeDetail);
el('deletePotBtn').addEventListener('click', deletePot);
el('saveSettingsBtn').addEventListener('click', savePotSettings);
el('addTxBtn').addEventListener('click', addTransaction);
el('segSpend').addEventListener('click', () => setTxType('spend'));
el('segAdd').addEventListener('click', () => setTxType('add'));
el('exportBtn').addEventListener('click', exportExcel);
