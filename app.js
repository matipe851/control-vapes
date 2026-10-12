
(() => {
const $app = document.getElementById('app');
const S = { db:null, auth:null, adminExists:null, authChecked:false, me:null, users:{}, prods:{}, clients:{}, ventas:{}, compras:{}, ready:{usuarios:false,productos:false,clientes:false,ventas:false,compras:false}, tab:'resumen', period:'mes', authErr:'', confirm:null, ventaClienteNuevo:false, vLines:null, vf:{} };
const newLine = () => ({prod:'', cant:'1', precio:''});
const MEDIOS = ['Efectivo','Transferencia','Mercado Pago'];
const ars = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const n0 = new Intl.NumberFormat('es-AR');
const money = v => ars.format(v||0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = x => String(x).padStart(2,'0');
const today = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const dParse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const daysBetween = (a,b) => Math.round((dParse(b)-dParse(a))/86400000);
const fmtDate = s => { if(!s) return '—'; const [y,m,d]=s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const ssGet = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
const ssSet = (k,v) => { try { v==null ? localStorage.removeItem(k) : localStorage.setItem(k,v); } catch(e){} };
S.tab = ssGet('cv_tab') || 'resumen';
S.period = ssGet('cv_period') || 'mes';

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }

// ---------- auth helpers ----------
const EMAIL_DOMAIN='controlvapes.app';
const toEmail = u => `${u}@${EMAIL_DOMAIN}`;
const normUser = u => String(u||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');

// ---------- derived data ----------
function stockOf(pid){
  const p=S.prods[pid]; if(!p) return 0;
  let s = Number(p.stockInicial)||0;
  for(const c of Object.values(S.compras)) if(c.productoId===pid) s += Number(c.cantidad)||0;
  for(const v of Object.values(S.ventas)) if(v.productoId===pid) s -= Number(v.cantidad)||0;
  return s;
}
// Lotes: el stock inicial del sabor + cada reposición. Cada lote tiene su costo y precio.
function lotsOf(pid){
  const p=S.prods[pid]; if(!p) return [];
  const lots=[{id:'ini:'+pid, ini:true, fecha:'', creado:0, cant:Number(p.stockInicial)||0, costo:Number(p.costo)||0, precio:Number(p.precio)||0}];
  for(const c of Object.values(S.compras)) if(c.productoId===pid) lots.push({id:c.id, fecha:c.fecha||'', creado:c.creado||0, cant:Number(c.cantidad)||0,
    costo:Number(c.costoUnit)||Number(p.costo)||0, precio:(c.precioUnit!=null&&c.precioUnit!=='')?(Number(c.precioUnit)||0):(Number(p.precio)||0)});
  lots.sort((a,b)=>(a.ini?-1:b.ini?1:0)||a.fecha.localeCompare(b.fecha)||a.creado-b.creado);
  lots.forEach(l=>l.restante=l.cant);
  const vs=Object.values(S.ventas).filter(v=>v.productoId===pid).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||(a.creado||0)-(b.creado||0));
  const fifo=q=>{ for(const l of lots){ if(q<=0) break; const t=Math.min(l.restante,q); if(t>0){ l.restante-=t; q-=t; } } if(q>0 && lots.length) lots[lots.length-1].restante-=q; };
  for(const v of vs.filter(v=>v.loteId)){ let q=Number(v.cantidad)||0; const l=lots.find(x=>x.id===v.loteId);
    if(l){ const t=Math.min(Math.max(l.restante,0),q); l.restante-=t; q-=t; } if(q>0) fifo(q); }
  for(const v of vs.filter(v=>!v.loteId)) fifo(Number(v.cantidad)||0);
  return lots;
}
// Agrupa los lotes de un sabor por costo+precio: cada grupo es una "variante" que se ve por separado
function variantsOf(pid){
  const m=new Map();
  for(const l of lotsOf(pid)){ const k=l.costo+'|'+l.precio; if(!m.has(k)) m.set(k,{key:k, costo:l.costo, precio:l.precio, restante:0, lots:[]}); const g=m.get(k); g.lots.push(l); g.restante+=l.restante; }
  return [...m.values()];
}
const prodName = pid => S.prods[pid]?.sabor || '(sabor borrado)';
const clientName = cid => S.clients[cid]?.nombre || '(cliente borrado)';
const userName = u => S.users[u]?.nombre || S.users[u]?.usuario || '(usuario borrado)';
function inPeriod(fecha){
  const t=today();
  if(S.period==='todo') return true;
  if(S.period==='mes') return fecha.slice(0,7)===t.slice(0,7);
  if(S.period==='anio') return fecha.slice(0,4)===t.slice(0,4);
  if(S.period==='30') return daysBetween(fecha,t) <= 30 && daysBetween(fecha,t) >= 0;
  if(S.period==='hoy') return fecha===t;
  return true;
}
const lineTotal = l => (parseInt(l.cant,10)||0)*(Number(l.precio)||0);
const ventaTotal = v => (Number(v.cantidad)||0)*(Number(v.precioUnit)||0);
const ventaGanancia = v => (Number(v.cantidad)||0)*((Number(v.precioUnit)||0)-(Number(v.costoUnit)||0));
const sortedVentas = () => Object.values(S.ventas).sort((a,b)=> (b.fecha||'').localeCompare(a.fecha||'') || (b.creado||0)-(a.creado||0));

function clientStats(){
  const t=today();
  const out={};
  for(const c of Object.values(S.clients)) out[c.id]={c, compras:0, unidades:0, gasto:0, fechas:new Set(), sabores:{}};
  for(const v of Object.values(S.ventas)){
    const o=out[v.clienteId]; if(!o) continue;
    o.unidades+=Number(v.cantidad)||0; o.gasto+=ventaTotal(v); o.fechas.add(v.fecha);
    o.sabores[v.productoId]=(o.sabores[v.productoId]||0)+(Number(v.cantidad)||0);
  }
  for(const o of Object.values(out)){
    const f=[...o.fechas].sort(); o.compras=f.length;
    o.ultima=f[f.length-1]||null;
    o.freq = f.length>1 ? daysBetween(f[0],f[f.length-1])/(f.length-1) : null;
    o.desde = o.ultima ? daysBetween(o.ultima,t) : null;
    const fav=Object.entries(o.sabores).sort((a,b)=>b[1]-a[1])[0]; o.fav = fav? prodName(fav[0]) : '—';
    if(!o.ultima) o.estado=['Sin compras','mid'];
    else if(o.freq==null) o.estado = o.desde>30 ? ['Contactar','warn'] : ['Nuevo','mid'];
    else if(o.desde > o.freq*2) o.estado=['Inactivo','bad'];
    else if(o.desde > o.freq) o.estado=['Contactar','warn'];
    else o.estado=['Al día','ok'];
    o.proxima = (o.ultima && o.freq!=null) ? (()=>{const d=dParse(o.ultima); d.setDate(d.getDate()+Math.round(o.freq)); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;})() : null;
  }
  return out;
}

// ---------- render ----------
function render(){
  if(!S.db) return;
  if(!S.authChecked || S.adminExists===null) return;
  if(!S.me){ $app.innerHTML = S.adminExists ? viewLogin() : viewSetup(); bindAuth(); return; }
  if(!S.ready.usuarios) { $app.innerHTML = screen('Cargando…'); return; }
  if(!S.users[S.me]){ $app.innerHTML = screen('Tu usuario fue dado de baja o todavía no tiene acceso. Hablá con el administrador.', true); bindLogout(); return; }
  const allReady = Object.values(S.ready).every(Boolean);
  const active = document.activeElement?.id;
  $app.innerHTML = viewShell(allReady);
  bindApp();
  if(active){ const el=document.getElementById(active); if(el && el.tagName!=='BUTTON') el.focus(); }
}
function screen(msg, logout){
  return `<div class="auth"><div class="auth-card"><div class="brand"><div class="brand-mark">CV</div><h1>Control Vapes</h1></div><p>${msg}</p>${logout?'<button class="btn ghost" id="logout">Salir</button>':''}</div></div>`;
}
function bindLogout(){ const b=document.getElementById('logout'); if(b) b.onclick=()=>S.auth.signOut(); }

function viewSetup(){
  return `<div class="auth"><form class="auth-card" id="f-setup" autocomplete="off">
    <div class="brand"><div class="brand-mark">CV</div><h1>Control Vapes</h1></div>
    <p>Primera vez: creá la cuenta de administrador. Después vas a poder dar de alta a cada vendedor desde la pestaña Usuarios.</p>
    <label>Tu nombre<input id="s-nombre" required maxlength="40" placeholder="Matías"></label>
    <label>Usuario<input id="s-user" required maxlength="24" placeholder="matias" autocapitalize="none"></label>
    <label>Contraseña<input id="s-pass" type="password" required minlength="4"></label>
    <div class="err" id="auth-err">${esc(S.authErr)}</div>
    <button class="btn" type="submit">Crear administrador</button>
  </form></div>`;
}
function viewLogin(){
  return `<div class="auth"><form class="auth-card" id="f-login">
    <div class="brand"><div class="brand-mark">CV</div><h1>Control Vapes</h1></div>
    <p>Iniciá sesión para cargar ventas y ver las métricas.</p>
    <label>Usuario<input id="l-user" required autocapitalize="none" autocomplete="username"></label>
    <label>Contraseña<input id="l-pass" type="password" required autocomplete="current-password"></label>
    <div class="err" id="auth-err">${esc(S.authErr)}</div>
    <button class="btn" type="submit">Entrar</button>
    <p class="sub">¿No tenés usuario? Pedíselo al administrador.</p>
  </form></div>`;
}

function viewShell(allReady){
  const me=S.users[S.me]; const admin=me?.rol==='admin';
  const tabs=[['resumen','Resumen'],['ventas','Ventas'],['stock','Stock'],['clientes','Clientes'],['compras','Compras'],['sabores','Clientes × sabor']];
  if(admin) tabs.push(['usuarios','Usuarios']);
  tabs.push(['cuenta','Mi cuenta']);
  if(!tabs.some(t=>t[0]===S.tab)) S.tab='resumen';
  const body = !allReady ? `<div class="panel"><p class="empty">Cargando datos…</p></div>` :
    ({resumen:viewResumen, ventas:viewVentas, stock:viewStock, clientes:viewClientes, compras:viewCompras, sabores:viewMatrix, usuarios:viewUsuarios, cuenta:viewCuenta})[S.tab]();
  return `<header class="top"><div class="top-in">
      <div class="top-row"><div class="brand"><div class="brand-mark">CV</div><h1>Control Vapes</h1></div>
        <div class="who"><span><b>${esc(me?.nombre||me?.usuario||'')}</b> · ${admin?'Administrador':'Vendedor'}</span><button class="btn ghost sm" id="logout">Salir</button></div></div>
      <nav class="tabs" role="tablist">${tabs.map(([k,l])=>`<button class="tab" role="tab" data-tab="${k}" aria-selected="${S.tab===k}">${l}</button>`).join('')}</nav>
    </div></header><main>${body}</main>`;
}

function periodSelect(){
  const opts=[['hoy','Hoy'],['mes','Este mes'],['30','Últimos 30 días'],['anio','Este año'],['todo','Todo']];
  return `<select id="period" style="width:auto">${opts.map(([k,l])=>`<option value="${k}" ${S.period===k?'selected':''}>${l}</option>`).join('')}</select>`;
}

function barList(rows, fmt, cls=''){
  if(!rows.length) return `<p class="empty">Todavía no hay ventas en este período.</p>`;
  const max=Math.max(...rows.map(r=>r[1]))||1;
  return `<div class="bars">${rows.map(([n,v,extra])=>`<div class="bar-row"><span class="n" title="${esc(n)}">${esc(n)}</span><div class="bar ${cls}"><i style="width:${(v/max*100).toFixed(1)}%"></i></div><span class="num">${fmt(v)}${extra?` <span class="sub">${extra}</span>`:''}</span></div>`).join('')}</div>`;
}

function viewResumen(){
  const vs=Object.values(S.ventas).filter(v=>inPeriod(v.fecha));
  const total=vs.reduce((a,v)=>a+ventaTotal(v),0);
  const unid=vs.reduce((a,v)=>a+(Number(v.cantidad)||0),0);
  const gan=vs.reduce((a,v)=>a+ventaGanancia(v),0);
  const sinCosto=vs.some(v=>!Number(v.costoUnit));
  const ops=vs.length;
  const stockTot=Object.keys(S.prods).reduce((a,id)=>a+Math.max(0,stockOf(id)),0);
  const valorStock=Object.keys(S.prods).reduce((a,id)=>a+variantsOf(id).reduce((b,g)=>b+Math.max(0,g.restante)*g.precio,0),0);
  const reponer=Object.values(S.prods).filter(p=>stockOf(p.id)<=(Number(p.stockMin)||0)).length;
  const clientesPer=new Set(vs.map(v=>v.clienteId)).size;

  const bySabor={}; vs.forEach(v=>bySabor[v.productoId]=(bySabor[v.productoId]||0)+(Number(v.cantidad)||0));
  const rankSabor=Object.entries(bySabor).map(([id,q])=>[prodName(id),q]).sort((a,b)=>b[1]-a[1]);
  const byVend={}; vs.forEach(v=>{const k=v.vendedor; byVend[k]=byVend[k]||{t:0,u:0}; byVend[k].t+=ventaTotal(v); byVend[k].u+=Number(v.cantidad)||0;});
  const rankVend=Object.entries(byVend).map(([k,o])=>[userName(k),o.t,`${o.u} u.`]).sort((a,b)=>b[1]-a[1]);
  const byMedio={}; vs.forEach(v=>byMedio[v.medio||'—']=(byMedio[v.medio||'—']||0)+ventaTotal(v));
  const rankMedio=Object.entries(byMedio).sort((a,b)=>b[1]-a[1]);
  const byCli={}; vs.forEach(v=>{byCli[v.clienteId]=byCli[v.clienteId]||{t:0,u:0}; byCli[v.clienteId].t+=ventaTotal(v); byCli[v.clienteId].u+=Number(v.cantidad)||0;});
  const topCli=Object.entries(byCli).map(([id,o])=>[clientName(id),o.u,money(o.t)]).sort((a,b)=>b[1]-a[1]).slice(0,10);

  // last 6 months
  const now=new Date(); const months=[];
  for(let i=5;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({k:`${d.getFullYear()}-${pad(d.getMonth()+1)}`, l:MES[d.getMonth()], t:0, u:0}); }
  Object.values(S.ventas).forEach(v=>{ const m=months.find(m=>m.k===v.fecha?.slice(0,7)); if(m){ m.t+=ventaTotal(v); m.u+=Number(v.cantidad)||0; } });
  const mmax=Math.max(...months.map(m=>m.t), ...months.map(m=>m.u))||1;
  const useUnits = months.every(m=>m.t===0);
  const mval = m => useUnits? m.u : m.t;
  const mmax2=Math.max(...months.map(mval))||1;

  const cs=Object.values(clientStats()).filter(o=>o.estado[0]==='Contactar'||o.estado[0]==='Inactivo').sort((a,b)=>(b.desde||0)-(a.desde||0)).slice(0,8);
  const low=Object.values(S.prods).map(p=>({p,s:stockOf(p.id)})).filter(o=>o.s<=(Number(o.p.stockMin)||0)).sort((a,b)=>a.s-b.s);

  return `
  <div class="panel-head"><div><h2 style="font-size:22px;font-weight:800">Resumen</h2><span class="sub">Se actualiza solo con cada venta que carga cualquier usuario.</span></div>${periodSelect()}</div>
  <section class="kpis">
    <div class="kpi"><span class="l">Facturación</span><span class="v num">${money(total)}</span><span class="h">${ops} venta${ops===1?'':'s'}</span></div>
    <div class="kpi"><span class="l">Unidades vendidas</span><span class="v num">${n0.format(unid)}</span><span class="h">Ticket prom. ${money(ops?total/ops:0)}</span></div>
    <div class="kpi"><span class="l">Ganancia</span><span class="v num">${money(gan)}</span><span class="h">${sinCosto?'Faltan costos en algunos sabores':(total?`Margen ${Math.round(gan/total*100)}%`:'—')}</span></div>
    <div class="kpi"><span class="l">Clientes que compraron</span><span class="v num">${clientesPer}</span><span class="h">${Object.keys(S.clients).length} en total</span></div>
    <div class="kpi"><span class="l">Stock disponible</span><span class="v num">${n0.format(stockTot)}</span><span class="h">${valorStock?`Vale ${money(valorStock)} a precio de venta`:'Cargá precios en Stock'}</span></div>
    <div class="kpi"><span class="l">Sabores a reponer</span><span class="v num" style="color:${reponer?'var(--warn)':'inherit'}">${reponer}</span><span class="h">Stock en el mínimo o debajo</span></div>
  </section>
  <div class="grid2">
    <section class="panel"><div class="panel-head"><h2>Sabores más vendidos</h2><span class="sub">unidades</span></div>${barList(rankSabor, n0.format)}</section>
    <section class="panel"><div class="panel-head"><h2>${useUnits?'Unidades':'Facturación'} por mes</h2><span class="sub">últimos 6 meses</span></div>
      <div class="months">${months.map((m,i)=>`<div class="mcol ${i===5?'cur':''}"><span class="val num">${mval(m)? (useUnits? n0.format(mval(m)) : (mval(m)>=1000? '$'+Math.round(mval(m)/1000)+'k' : money(mval(m)))) : ''}</span><div class="stick"><i style="height:${(mval(m)/mmax2*100).toFixed(1)}%"></i></div><span>${m.l}</span></div>`).join('')}</div></section>
    <section class="panel"><div class="panel-head"><h2>Ventas por vendedor</h2><span class="sub">facturación</span></div>${barList(rankVend, money, 'ice')}</section>
    <section class="panel"><div class="panel-head"><h2>Medio de pago</h2><span class="sub">facturación</span></div>${barList(rankMedio, money, 'ice')}</section>
    <section class="panel"><div class="panel-head"><h2>Top 10 clientes</h2><span class="sub">unidades en el período</span></div>${barList(topCli, n0.format)}</section>
    <section class="panel"><div class="panel-head"><h2>Para contactar</h2><span class="sub">pasaron su frecuencia habitual</span></div>
      ${cs.length?`<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Última</th><th class="r">Días</th><th>Estado</th></tr></thead><tbody>${cs.map(o=>`<tr><td>${esc(o.c.nombre)}</td><td class="num">${fmtDate(o.ultima)}</td><td class="r num">${o.desde}</td><td><span class="pill ${o.estado[1]}">${o.estado[0]}</span></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">Nadie atrasado por ahora.</p>`}</section>
  </div>
  ${low.length?`<section class="panel"><div class="panel-head"><h2>Reponer</h2></div><div class="split">${low.map(o=>`<span class="pill ${o.s<=0?'bad':'warn'}">${esc(o.p.sabor)} · ${o.s}</span>`).join('')}</div></section>`:''}`;
}

function viewVentas(){
  const me=S.users[S.me]; const admin=me?.rol==='admin';
  const prods=Object.values(S.prods).sort((a,b)=>a.sabor.localeCompare(b.sabor));
  const clients=Object.values(S.clients).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const list=sortedVentas().filter(v=>inPeriod(v.fecha));
  const tot=list.reduce((a,v)=>a+ventaTotal(v),0);
  if(!S.vLines || !S.vLines.length) S.vLines=[newLine()];
  const lines=S.vLines;
  const prodOpts = sel => prods.map(p=>{const vs=variantsOf(p.id).filter(g=>g.restante>0||(p.id+'::'+g.key)===sel);
      if(!vs.length) return `<option disabled>${esc(p.sabor)} (0 en stock)</option>`;
      return vs.map(g=>{const val=p.id+'::'+g.key; return `<option value="${val}" ${val===sel?'selected':''}>${esc(p.sabor)}${vs.length>1||g.precio?` — ${money(g.precio)}`:''} (${g.restante} en stock)</option>`}).join('')}).join('');
  return `
  <section class="panel"><div class="panel-head"><h2>Cargar venta</h2><span class="sub">Podés cargar varios sabores para el mismo cliente. El stock se descuenta solo</span></div>
  ${prods.length?'':'<p class="note">Primero hay que cargar sabores en la pestaña Stock.</p>'}
  <form id="f-venta" autocomplete="off">
    <div class="form">
    <label>Fecha<input type="date" id="v-fecha" value="${esc(S.vf.fecha||today())}" required></label>
    <label>Cliente ${S.ventaClienteNuevo
      ? `<input id="v-cli-nuevo" placeholder="Nombre del cliente nuevo" required maxlength="50" value="${esc(S.vf.cliNuevo||'')}">`
      : `<select id="v-cli" required><option value="">Elegí…</option>${clients.map(c=>`<option value="${c.id}" ${S.vf.cli===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('')}<option value="__new">+ Cliente nuevo</option></select>`}</label>
    <label>Medio de pago<select id="v-medio">${MEDIOS.map(m=>`<option ${S.vf.medio===m?'selected':''}>${m}</option>`).join('')}</select></label>
    </div>
    <div class="vlines">
      <div class="vline vhead"><span>Sabor</span><span>Cant.</span><span>Precio u.</span><span class="r">Subtotal</span><span></span></div>
      ${lines.map((l,i)=>`<div class="vline">
        <select id="vl-prod-${i}" data-vl="${i}" data-vf="prod" aria-label="Sabor ${i+1}" required><option value="">Elegí sabor…</option>${prodOpts(l.prod)}</select>
        <input id="vl-cant-${i}" data-vl="${i}" data-vf="cant" type="number" min="1" step="1" value="${esc(l.cant)}" aria-label="Cantidad ${i+1}" required>
        <input id="vl-precio-${i}" data-vl="${i}" data-vf="precio" type="number" min="0" step="1" value="${esc(l.precio)}" placeholder="$" aria-label="Precio unitario ${i+1}">
        <span class="r num" id="vl-sub-${i}">${money(lineTotal(l))}</span>
        ${lines.length>1?`<button type="button" class="btn ghost sm" data-vl-del="${i}" aria-label="Quitar sabor ${i+1}">Quitar</button>`:'<span></span>'}
      </div>`).join('')}
    </div>
    <div class="vfoot">
      <button type="button" class="btn ghost" id="vl-add" ${prods.length?'':'disabled'}>+ Agregar otro sabor</button>
      <span class="vtotal">Total <b class="num" id="vl-total">${money(lines.reduce((a,l)=>a+lineTotal(l),0))}</b> <span class="sub" id="vl-units">${lines.reduce((a,l)=>a+(parseInt(l.cant,10)||0),0)} u.</span></span>
      <button class="btn" type="submit" ${prods.length?'':'disabled'}>Guardar venta</button>
    </div>
  </form></section>
  <section class="panel"><div class="panel-head"><div><h2>Ventas</h2><span class="sub num">${list.length} ventas · ${money(tot)}</span></div>${periodSelect()}</div>
  ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Sabor</th><th class="r">Cant.</th><th class="r">Precio u.</th><th class="r">Total</th><th>Pago</th><th>Vendedor</th><th></th></tr></thead><tbody>
  ${list.map(v=>`<tr><td class="num">${fmtDate(v.fecha)}</td><td>${esc(clientName(v.clienteId))}</td><td>${esc(prodName(v.productoId))}</td><td class="r num">${v.cantidad}</td><td class="r num">${money(v.precioUnit)}</td><td class="r num">${money(ventaTotal(v))}</td><td>${esc(v.medio||'')}</td><td>${esc(userName(v.vendedor))}</td>
  <td class="r">${(admin||v.vendedor===S.me)? delBtn('ventas',v.id) : ''}</td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">No hay ventas en este período. Cargá la primera arriba.</p>`}
  </section>`;
}

function delBtn(col,id){
  if(S.confirm===`${col}/${id}`) return `<span class="inline-confirm">¿Borrar? <button class="btn danger sm" data-del-yes="${col}/${id}">Sí</button><button class="btn ghost sm" data-del-no>No</button></span>`;
  return `<button class="btn ghost sm" data-del="${col}/${id}" aria-label="Borrar">Borrar</button>`;
}

function viewStock(){
  const admin=S.users[S.me]?.rol==='admin';
  const prods=Object.values(S.prods).sort((a,b)=>stockOf(b.id)-stockOf(a.id));
  const sold={}; Object.values(S.ventas).forEach(v=>sold[v.productoId]=(sold[v.productoId]||0)+(Number(v.cantidad)||0));
  return `
  ${admin?`<section class="panel"><div class="panel-head"><h2>Agregar sabor</h2><span class="sub">Aparece al toque en Ventas y Compras</span></div>
  <form class="form" id="f-prod" autocomplete="off">
    <label>Sabor<input id="p-sabor" required maxlength="50" placeholder="Grape Ice"></label>
    <label>Modelo<input id="p-modelo" maxlength="40" value="Elf Bar Ice King"></label>
    <label>Puffs<input id="p-puffs" type="number" min="0" value="40000"></label>
    <label>Costo unitario<input id="p-costo" type="number" min="0" placeholder="$"></label>
    <label>Precio de venta<input id="p-precio" type="number" min="0" placeholder="$"></label>
    <label>Stock inicial<input id="p-stock" type="number" min="0" value="0"></label>
    <label>Stock mínimo<input id="p-min" type="number" min="0" value="2"></label>
    <button class="btn" type="submit">Agregar</button>
  </form></section>`:''}
  <section class="panel"><div class="panel-head"><h2>Stock por sabor</h2><span class="sub">Stock actual = inicial + compras − ventas</span></div>
  ${prods.length?`<div class="tbl-wrap"><table><thead><tr><th>Sabor</th><th>Modelo</th><th class="r">Costo</th><th class="r">Precio</th><th class="r">Vendidas</th><th class="r">Stock</th><th>Por precio</th><th>Estado</th>${admin?'<th></th>':''}</tr></thead><tbody>
  ${prods.map(p=>{const s=stockOf(p.id); const st= s<=0?['Sin stock','bad']: s<=(Number(p.stockMin)||0)?['Reponer','warn']:['OK','ok'];
    return `<tr><td><b>${esc(p.sabor)}</b></td><td class="sub">${esc(p.modelo||'')} ${p.puffs?`· ${n0.format(p.puffs)} puffs`:''}</td>
    <td class="r">${admin?`<input class="num" style="width:96px;text-align:right" type="number" min="0" data-edit="${p.id}" data-f="costo" value="${Number(p.costo)||''}" placeholder="$" aria-label="Costo de ${esc(p.sabor)}">`:money(p.costo)}</td>
    <td class="r">${admin?`<input class="num" style="width:96px;text-align:right" type="number" min="0" data-edit="${p.id}" data-f="precio" value="${Number(p.precio)||''}" placeholder="$" aria-label="Precio de ${esc(p.sabor)}">`:money(p.precio)}</td>
    <td class="r num">${sold[p.id]||0}</td><td class="r num"><b>${s}</b></td><td class="sub">${(()=>{const vs=variantsOf(p.id).filter(g=>g.restante>0); return vs.length>1? vs.map(g=>`<span style="white-space:nowrap">${g.restante} a ${money(g.precio)} <span title="costo">(c. ${money(g.costo)})</span></span>`).join('<br>') : '—';})()}</td><td><span class="pill ${st[1]}">${st[0]}</span></td>${admin?`<td class="r">${delBtn('productos',p.id)}</td>`:''}</tr>`}).join('')}
  </tbody></table></div>${admin?'<p class="sub">Costo y precio de acá son los del stock inicial (y se usan de base para nuevas reposiciones). Cada reposición tiene su propio costo y precio, que se editan en Compras. Si un sabor tiene unidades a precios distintos, se ven separadas en "Por precio" y en Ventas.</p>':''}`:`<p class="empty">Todavía no hay sabores cargados.</p>`}
  </section>`;
}

function viewClientes(){
  const cs=Object.values(clientStats()).sort((a,b)=>b.unidades-a.unidades);
  const admin=S.users[S.me]?.rol==='admin';
  return `
  <section class="panel"><div class="panel-head"><h2>Nuevo cliente</h2></div>
  <form class="form" id="f-cli" autocomplete="off">
    <label>Nombre<input id="c-nombre" required maxlength="50"></label>
    <label>Teléfono / Instagram<input id="c-contacto" maxlength="60"></label>
    <button class="btn" type="submit">Agregar cliente</button>
  </form></section>
  <section class="panel"><div class="panel-head"><h2>Clientes</h2><span class="sub">Frecuencia = promedio de días entre compras</span></div>
  ${cs.length?`<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th class="r">Compras</th><th class="r">Unid.</th><th class="r">Gastó</th><th>Sabor favorito</th><th>Última</th><th class="r">Cada</th><th>Próxima</th><th>Estado</th>${admin?'<th></th>':''}</tr></thead><tbody>
  ${cs.map(o=>`<tr><td><b>${esc(o.c.nombre)}</b></td><td class="sub">${esc(o.c.contacto||'')}</td><td class="r num">${o.compras}</td><td class="r num">${o.unidades}</td><td class="r num">${money(o.gasto)}</td><td>${esc(o.fav)}</td><td class="num">${fmtDate(o.ultima)}</td><td class="r num">${o.freq!=null?Math.round(o.freq)+' d':'—'}</td><td class="num">${fmtDate(o.proxima)}</td><td><span class="pill ${o.estado[1]}">${o.estado[0]}</span></td>${admin?`<td class="r">${delBtn('clientes',o.c.id)}</td>`:''}</tr>`).join('')}
  </tbody></table></div>`:`<p class="empty">Sin clientes todavía. También se crean solos al cargar una venta con "+ Cliente nuevo".</p>`}
  </section>`;
}

function viewCompras(){
  const admin=S.users[S.me]?.rol==='admin';
  const prods=Object.values(S.prods).sort((a,b)=>a.sabor.localeCompare(b.sabor));
  const list=Object.values(S.compras).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||(b.creado||0)-(a.creado||0));
  const inv=list.reduce((a,c)=>a+(Number(c.cantidad)||0)*(Number(c.costoUnit)||0),0);
  return `
  <section class="panel"><div class="panel-head"><h2>Registrar reposición</h2><span class="sub">Suma al stock del sabor. Si el costo o precio es distinto, queda separado</span></div>
  ${admin?`<form class="form" id="f-compra" autocomplete="off">
    <label>Fecha<input type="date" id="k-fecha" value="${today()}" required></label>
    <label>Sabor<select id="k-prod" required><option value="">Elegí…</option>${prods.map(p=>`<option value="${p.id}">${esc(p.sabor)}</option>`).join('')}</select></label>
    <label>Cantidad<input type="number" id="k-cant" min="1" value="1" required></label>
    <label>Costo unitario<input type="number" id="k-costo" min="0" placeholder="$"></label>
    <label>Precio de venta<input type="number" id="k-precio" min="0" placeholder="$"></label>
    <button class="btn" type="submit">Guardar compra</button>
  </form>`:`<p class="note">Solo el administrador registra compras de mercadería.</p>`}</section>
  <section class="panel"><div class="panel-head"><div><h2>Compras</h2><span class="sub num">Invertido: ${money(inv)}</span></div></div>
  ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Sabor</th><th class="r">Cant.</th><th class="r">Costo u.</th><th class="r">Precio u.</th><th class="r">Total</th><th>Cargó</th>${admin?'<th></th>':''}</tr></thead><tbody>
  ${list.map(c=>`<tr><td class="num">${fmtDate(c.fecha)}</td><td>${esc(prodName(c.productoId))}</td><td class="r num">${c.cantidad}</td><td class="r">${admin?cInput(c,'costoUnit'):money(c.costoUnit)}</td><td class="r">${admin?cInput(c,'precioUnit'):money(c.precioUnit!=null?c.precioUnit:S.prods[c.productoId]?.precio)}</td><td class="r num">${money((c.cantidad||0)*(c.costoUnit||0))}</td><td>${esc(userName(c.vendedor))}</td>${admin?`<td class="r">${delBtn('compras',c.id)}</td>`:''}</tr>`).join('')}
  </tbody></table></div>`:`<p class="empty">Sin reposiciones registradas.</p>`}</section>`;
}

function cInput(c,f){ const v=c[f]!=null?c[f]:(f==='precioUnit'?S.prods[c.productoId]?.precio:''); return `<input class="num" style="width:96px;text-align:right" type="number" min="0" data-cedit="${c.id}" data-f="${f}" value="${Number(v)||''}" placeholder="$" aria-label="${f==='costoUnit'?'Costo':'Precio'}">`; }
function viewMatrix(){
  const prods=Object.values(S.prods).sort((a,b)=>a.sabor.localeCompare(b.sabor));
  const m={}; Object.values(S.ventas).forEach(v=>{ m[v.clienteId]=m[v.clienteId]||{}; m[v.clienteId][v.productoId]=(m[v.clienteId][v.productoId]||0)+(Number(v.cantidad)||0); });
  const cids=Object.keys(m).filter(id=>S.clients[id]).sort((a,b)=>clientName(a).localeCompare(clientName(b)));
  return `<section class="panel"><div class="panel-head"><h2>Clientes × sabor</h2><span class="sub">Unidades compradas de cada sabor, histórico</span></div>
  ${cids.length?`<div class="tbl-wrap"><table class="matrix"><thead><tr><th>Cliente</th>${prods.map(p=>`<th title="${esc(p.sabor)}">${esc(p.sabor)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
  ${cids.map(cid=>{const row=m[cid]; const t=Object.values(row).reduce((a,b)=>a+b,0); const mx=Math.max(...Object.values(row));
    return `<tr><td><b>${esc(clientName(cid))}</b></td>${prods.map(p=>{const q=row[p.id]||0; return q?`<td class="num" style="background:color-mix(in srgb, var(--accent) ${Math.round(12+q/mx*40)}%, transparent);font-weight:${q===mx?700:500}">${q}</td>`:`<td class="z">·</td>`}).join('')}<td class="num"><b>${t}</b></td></tr>`}).join('')}
  </tbody></table></div>`:`<p class="empty">Aparece cuando haya ventas cargadas.</p>`}</section>`;
}

function viewUsuarios(){
  const us=Object.values(S.users).sort((a,b)=>(a.rol==='admin'?0:1)-(b.rol==='admin'?0:1)||(a.nombre||'').localeCompare(b.nombre||''));
  const cnt={}; Object.values(S.ventas).forEach(v=>cnt[v.vendedor]=(cnt[v.vendedor]||0)+1);
  return `<section class="panel"><div class="panel-head"><h2>Nuevo usuario</h2><span class="sub">Cada vendedor entra con su usuario y sus ventas quedan a su nombre</span></div>
  <form class="form" id="f-user" autocomplete="off">
    <label>Nombre<input id="u-nombre" required maxlength="40"></label>
    <label>Usuario<input id="u-user" required maxlength="24" autocapitalize="none"></label>
    <label>Contraseña<input id="u-pass" type="text" required minlength="6" placeholder="mínimo 6"></label>
    <label>Rol<select id="u-rol"><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select></label>
    <button class="btn" type="submit">Crear usuario</button>
  </form>
  <p class="note">Pasale al vendedor el link de la página, su usuario y su contraseña. Después la puede cambiar desde "Mi cuenta". Si das de baja a alguien, pierde el acceso al instante.</p></section>
  <section class="panel"><div class="panel-head"><h2>Usuarios</h2></div><div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th class="r">Ventas cargadas</th><th></th></tr></thead><tbody>
  ${us.map(u=>`<tr><td><b>${esc(u.nombre)}</b></td><td class="num">${esc(u.usuario)}</td><td><span class="pill ${u.rol==='admin'?'mid':'ok'}">${u.rol==='admin'?'Administrador':'Vendedor'}</span></td><td class="r num">${cnt[u.id]||0}</td>
  <td class="r">${u.id===S.me?'<span class="sub">vos</span>':delBtn('usuarios',u.id)}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}

function viewCuenta(){
  const me=S.users[S.me];
  return `<section class="panel" style="max-width:520px"><div class="panel-head"><h2>Mi cuenta</h2><span class="sub">Usuario: <b>${esc(me?.usuario)}</b></span></div>
  <form class="form" id="f-pass" autocomplete="off" style="grid-template-columns:1fr">
    <label>Contraseña actual<input id="pw-old" type="password" required autocomplete="current-password"></label>
    <label>Contraseña nueva<input id="pw-new" type="password" required minlength="6" autocomplete="new-password"></label>
    <button class="btn" type="submit">Cambiar contraseña</button>
  </form></section>`;
}

// ---------- events ----------
const SEED=[['Grape Ice',19,3],['Blue Razz Ice',7,2],['Straw Watermelon',7,2],['Watermelon Ice',5,2],['Strawberry Ice',5,2],['Mango Magic',3,2],['Peach',2,2],['Cranberry Pineapple Juice',1,2],['Miami Mint',1,2],['Sour Dragon Fruit',1,2]];
function authErrMsg(err){
  const c=err?.code||'';
  if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found')||c.includes('invalid-login')) return 'Usuario o contraseña incorrectos.';
  if(c.includes('too-many-requests')) return 'Demasiados intentos. Esperá unos minutos.';
  if(c.includes('weak-password')) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if(c.includes('email-already-in-use')) return 'Ese usuario ya existe.';
  if(c.includes('network')) return 'Sin conexión. Revisá internet.';
  console.error(err); return 'No se pudo completar. Probá de nuevo.';
}
function bindAuth(){
  const fs=document.getElementById('f-setup');
  if(fs) fs.onsubmit=async e=>{ e.preventDefault();
    const nombre=document.getElementById('s-nombre').value.trim(); const u=normUser(document.getElementById('s-user').value); const p=document.getElementById('s-pass').value;
    if(!u){ S.authErr='Usuario inválido: usá letras y números.'; return render(); }
    const btn=fs.querySelector('button'); btn.disabled=true;
    try{
      S.settingUp=true;
      const cred=await S.auth.createUserWithEmailAndPassword(toEmail(u), p);
      const uid=cred.user.uid; const b=S.db.batch();
      b.set(S.db.doc('usuarios/'+uid), {usuario:u, nombre, rol:'admin', creado:Date.now()});
      b.set(S.db.doc('config/admin'), {uid, creado:Date.now()});
      await b.commit();
      const pb=S.db.batch(); const now=Date.now();
      SEED.forEach(([sabor,stock,min])=>pb.set(S.db.collection('productos').doc(), {sabor, modelo:'Elf Bar Ice King', puffs:40000, costo:0, precio:0, stockInicial:stock, stockMin:min, creado:now}));
      await pb.commit();
      S.adminExists=true; S.settingUp=false; S.authErr=''; startData(uid); toast('Cuenta creada');
    } catch(err){ S.settingUp=false; S.authErr = err?.code==='permission-denied' ? 'Ya existe un administrador. Iniciá sesión.' : authErrMsg(err); if(S.auth.currentUser && err?.code==='permission-denied') S.auth.signOut(); render(); }
  };
  const fl=document.getElementById('f-login');
  if(fl) fl.onsubmit=async e=>{ e.preventDefault();
    const u=normUser(document.getElementById('l-user').value); const p=document.getElementById('l-pass').value;
    const btn=fl.querySelector('button'); btn.disabled=true;
    try{ await S.auth.signInWithEmailAndPassword(toEmail(u), p); S.authErr=''; }
    catch(err){ S.authErr=authErrMsg(err); render(); const el=document.getElementById('l-user'); if(el) el.value=u; }
  };
}
function writeErr(err){
  const c=err?.code||'';
  if(c==='permission-denied') return 'No tenés permiso para hacer eso.';
  if(c==='unavailable') return 'Sin conexión: se va a guardar cuando vuelva internet.';
  return 'No se pudo guardar. Probá de nuevo.';
}
async function save(fn, ok){ try{ await fn(); if(ok) toast(ok); } catch(err){ console.error(err); toast(writeErr(err)); } }

function bindApp(){
  bindLogout();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ S.tab=b.dataset.tab; S.confirm=null; ssSet('cv_tab',S.tab); render(); window.scrollTo(0,0); });
  const per=document.getElementById('period'); if(per) per.onchange=()=>{ S.period=per.value; ssSet('cv_period',S.period); render(); };
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ S.confirm=b.dataset.del; render(); });
  document.querySelectorAll('[data-del-no]').forEach(b=>b.onclick=()=>{ S.confirm=null; render(); });
  document.querySelectorAll('[data-del-yes]').forEach(b=>b.onclick=()=>{ const path=b.dataset.delYes; S.confirm=null; save(()=>S.db.doc(path).delete(),'Borrado'); });

  const vcli=document.getElementById('v-cli');
  if(vcli) vcli.onchange=()=>{ if(vcli.value==='__new'){ S.ventaClienteNuevo=true; S.vf.cli=''; render(); document.getElementById('v-cli-nuevo')?.focus(); } else S.vf.cli=vcli.value; };
  const vcn=document.getElementById('v-cli-nuevo'); if(vcn) vcn.oninput=()=>S.vf.cliNuevo=vcn.value;
  const vfe=document.getElementById('v-fecha'); if(vfe) vfe.onchange=()=>S.vf.fecha=vfe.value;
  const vme=document.getElementById('v-medio'); if(vme) vme.onchange=()=>S.vf.medio=vme.value;
  const refreshTotals=()=>{ S.vLines.forEach((l,i)=>{ const el=document.getElementById('vl-sub-'+i); if(el) el.textContent=money(lineTotal(l)); });
    const t=document.getElementById('vl-total'); if(t) t.textContent=money(S.vLines.reduce((a,l)=>a+lineTotal(l),0));
    const u=document.getElementById('vl-units'); if(u) u.textContent=S.vLines.reduce((a,l)=>a+(parseInt(l.cant,10)||0),0)+' u.'; };
  document.querySelectorAll('[data-vl]').forEach(el=>{ const i=+el.dataset.vl, f=el.dataset.vf;
    if(f==='prod') el.onchange=()=>{ const l=S.vLines[i]; l.prod=el.value; const [pid,key]=el.value.split('::'); const g=variantsOf(pid).find(x=>x.key===key);
      l.precio = g&&g.precio ? String(g.precio) : ''; const pr=document.querySelector(`[data-vl="${i}"][data-vf="precio"]`); if(pr) pr.value=l.precio; refreshTotals(); };
    else el.oninput=()=>{ S.vLines[i][f]=el.value; refreshTotals(); };
  });
  document.querySelectorAll('[data-vl-del]').forEach(b=>b.onclick=()=>{ S.vLines.splice(+b.dataset.vlDel,1); render(); });
  const vadd=document.getElementById('vl-add');
  if(vadd) vadd.onclick=()=>{ S.vLines.push(newLine()); render(); const ss=document.querySelectorAll('[data-vf="prod"]'); ss[ss.length-1]?.focus(); };
  const fv=document.getElementById('f-venta');
  if(fv) fv.onsubmit=async e=>{ e.preventDefault();
    const fecha=document.getElementById('v-fecha').value; const medio=document.getElementById('v-medio').value;
    const items=[]; const need={};
    for(const l of S.vLines){ if(!l.prod) continue;
      const [pid,vkey]=l.prod.split('::'); const vg=variantsOf(pid).find(x=>x.key===vkey); const cant=parseInt(l.cant,10);
      if(!vg) return toast(`Elegí de nuevo ${prodName(pid)}`);
      if(!(cant>0)) return toast(`Poné la cantidad de ${prodName(pid)}`);
      need[l.prod]=(need[l.prod]||0)+cant;
      if(need[l.prod]>vg.restante) return toast(`Solo hay ${vg.restante} de ${prodName(pid)} a ${money(vg.precio)}`);
      items.push({pid, vg, cant, precio:l.precio!==''?(Number(l.precio)||0):(vg.precio||0)});
    }
    if(!items.length) return toast('Elegí al menos un sabor');
    let cid;
    if(S.ventaClienteNuevo){ const nombre=document.getElementById('v-cli-nuevo').value.trim(); if(!nombre) return toast('Escribí el nombre del cliente');
      const ex=Object.values(S.clients).find(c=>c.nombre.toLowerCase()===nombre.toLowerCase());
      if(ex) cid=ex.id; else { try{ const ref=await S.db.collection('clientes').add({nombre, contacto:'', creado:Date.now(), creadoPor:S.me}); cid=ref.id; }catch(err){ return toast(writeErr(err)); } }
    } else { cid=document.getElementById('v-cli').value; if(!cid||cid==='__new') return toast('Elegí un cliente'); }
    const btn=fv.querySelector('button[type=submit]'); btn.disabled=true;
    const now=Date.now(); const pedidoId = items.length>1 ? S.db.collection('ventas').doc().id : null;
    const units=items.reduce((a,x)=>a+x.cant,0);
    let ok=false;
    await save(async()=>{ const b=S.db.batch();
      items.forEach((x,k)=>{ const lote=x.vg.lots.find(l=>l.restante>0)||x.vg.lots[0];
        const d={fecha, clienteId:cid, productoId:x.pid, cantidad:x.cant, precioUnit:x.precio, costoUnit:x.vg.costo, loteId:lote.id, medio, vendedor:S.me, creado:now+k};
        if(pedidoId) d.pedidoId=pedidoId; b.set(S.db.collection('ventas').doc(), d); });
      await b.commit(); ok=true; },
      items.length>1 ? `Venta guardada: ${items.length} sabores, ${units} u. para ${clientName(cid)}` : `Venta guardada: ${items[0].cant} × ${prodName(items[0].pid)}`);
    if(ok){ S.ventaClienteNuevo=false; S.vLines=[newLine()]; S.vf={fecha, medio}; }
    render();
  };

  const fp=document.getElementById('f-prod');
  if(fp) fp.onsubmit=e=>{ e.preventDefault(); const v=id=>document.getElementById(id).value;
    const sabor=v('p-sabor').trim(); if(!sabor) return;
    if(Object.values(S.prods).some(p=>p.sabor.toLowerCase()===sabor.toLowerCase())) return toast('Ese sabor ya existe');
    save(()=>S.db.collection('productos').add({sabor, modelo:v('p-modelo').trim(), puffs:Number(v('p-puffs'))||0, costo:Number(v('p-costo'))||0, precio:Number(v('p-precio'))||0, stockInicial:Number(v('p-stock'))||0, stockMin:Number(v('p-min'))||0, creado:Date.now()}), 'Sabor agregado'); };
  document.querySelectorAll('[data-edit]').forEach(inp=>inp.onchange=()=>{ const id=inp.dataset.edit, f=inp.dataset.f; const val=Number(inp.value)||0;
    if((Number(S.prods[id]?.[f])||0)===val) return; save(()=>S.db.doc('productos/'+id).update({[f]:val}), f==='costo'?'Costo actualizado':'Precio actualizado'); });

  const fc=document.getElementById('f-cli');
  if(fc) fc.onsubmit=e=>{ e.preventDefault(); const nombre=document.getElementById('c-nombre').value.trim(); if(!nombre) return;
    if(Object.values(S.clients).some(c=>c.nombre.toLowerCase()===nombre.toLowerCase())) return toast('Ya existe un cliente con ese nombre');
    save(()=>S.db.collection('clientes').add({nombre, contacto:document.getElementById('c-contacto').value.trim(), creado:Date.now(), creadoPor:S.me}), 'Cliente agregado'); };

  const fk=document.getElementById('f-compra');
  if(fk) fk.onsubmit=e=>{ e.preventDefault(); const pid=document.getElementById('k-prod').value; const cant=parseInt(document.getElementById('k-cant').value,10);
    if(!pid||!(cant>0)) return toast('Elegí sabor y cantidad');
    const p=S.prods[pid]; const kc=document.getElementById('k-costo').value, kp=document.getElementById('k-precio').value;
    const costo=kc!==''?Number(kc)||0:Number(p?.costo)||0, precio=kp!==''?Number(kp)||0:Number(p?.precio)||0;
    const otros=variantsOf(pid).filter(g=>g.restante>0&&(g.costo!==costo||g.precio!==precio));
    save(()=>S.db.collection('compras').add({fecha:document.getElementById('k-fecha').value, productoId:pid, cantidad:cant, costoUnit:costo, precioUnit:precio, vendedor:S.me, creado:Date.now()}),
      `Sumadas ${cant} de ${prodName(pid)}`+(otros.length?' · quedan separadas por tener otro costo/precio':'')); };
  const kprod=document.getElementById('k-prod');
  if(kprod) kprod.onchange=()=>{ const ls=lotsOf(kprod.value); const last=ls[ls.length-1]; if(!last) return;
    const kc=document.getElementById('k-costo'), kp=document.getElementById('k-precio'); if(last.costo) kc.value=last.costo; if(last.precio) kp.value=last.precio; };
  document.querySelectorAll('[data-cedit]').forEach(inp=>inp.onchange=()=>{ const id=inp.dataset.cedit, f=inp.dataset.f; const val=Number(inp.value)||0;
    if(S.compras[id] && S.compras[id][f]!=null && (Number(S.compras[id][f])||0)===val) return;
    save(()=>S.db.doc('compras/'+id).update({[f]:val}), f==='costoUnit'?'Costo actualizado':'Precio actualizado'); });

  const fu=document.getElementById('f-user');
  if(fu) fu.onsubmit=async e=>{ e.preventDefault(); const u=normUser(document.getElementById('u-user').value);
    if(!u) return toast('Usuario inválido: usá letras y números');
    if(Object.values(S.users).some(x=>x.usuario===u)) return toast('Ese usuario ya existe');
    const btn=fu.querySelector('button'); btn.disabled=true;
    try{
      const sec = firebase.apps.find(a=>a.name==='secundaria') || firebase.initializeApp(window.FIREBASE_CONFIG,'secundaria');
      const cred = await sec.auth().createUserWithEmailAndPassword(toEmail(u), document.getElementById('u-pass').value);
      const uid=cred.user.uid; await sec.auth().signOut();
      await S.db.doc('usuarios/'+uid).set({usuario:u, nombre:document.getElementById('u-nombre').value.trim(), rol:document.getElementById('u-rol').value, creado:Date.now()});
      toast(`Usuario ${u} creado`); fu.reset();
    } catch(err){ toast(err?.code?.startsWith('auth/')?authErrMsg(err):writeErr(err)); }
    btn.disabled=false;
  };
  const fpw=document.getElementById('f-pass');
  if(fpw) fpw.onsubmit=async e=>{ e.preventDefault();
    const user=S.auth.currentUser; const oldp=document.getElementById('pw-old').value, newp=document.getElementById('pw-new').value;
    try{ const cred=firebase.auth.EmailAuthProvider.credential(user.email, oldp); await user.reauthenticateWithCredential(cred); await user.updatePassword(newp); fpw.reset(); toast('Contraseña cambiada'); }
    catch(err){ toast(authErrMsg(err)); }
  };
}
// ---------- boot ----------
let rTimer=null; const scheduleRender=()=>{ if(rTimer) return; rTimer=requestAnimationFrame(()=>{ rTimer=null;
  // don't wipe a form someone is typing in
  const a=document.activeElement; if(S.me && a && (a.tagName==='INPUT'||a.tagName==='SELECT') && a.value && a.type!=='date'){ pending=true; return; }
  render(); }); };
let pending=false;
document.addEventListener('focusout',()=>{ if(pending){ pending=false; setTimeout(()=>{ const a=document.activeElement; if(!(a && (a.tagName==='INPUT'||a.tagName==='SELECT'))) render(); else pending=true; },0);} });

let unsubs=[];
function sub(col, key){
  unsubs.push(S.db.collection(col).onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{ m[d.id]={id:d.id, ...d.data()}; });
    S[key]=m; S.ready[col]=true; scheduleRender();
  }, err=>{ console.error(col, err); S.ready[col]=true; if(err.code==='permission-denied'){ scheduleRender(); } else toast('Se cortó la conexión. Recargá la página.'); }));
}
function stopData(){ unsubs.forEach(u=>u()); unsubs=[]; Object.keys(S.ready).forEach(k=>S.ready[k]=false); S.users={};S.prods={};S.clients={};S.ventas={};S.compras={}; }
function startData(uid){
  stopData(); S.me=uid;
  // usuarios first: the other reads only work once this person has a user record
  unsubs.push(S.db.collection('usuarios').onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{ m[d.id]={id:d.id, ...d.data()}; }); S.users=m;
    const first=!S.ready.usuarios; S.ready.usuarios=true;
    if(first && m[uid]){ sub('productos','prods'); sub('clientes','clients'); sub('ventas','ventas'); sub('compras','compras'); }
    scheduleRender();
  }, err=>{ S.ready.usuarios=true; S.users={}; scheduleRender(); }));
  render();
}

(async()=>{
  const cfg=window.FIREBASE_CONFIG;
  if(!window.firebase || !cfg || !cfg.apiKey || String(cfg.apiKey).includes('PEGAR')){
    $app.innerHTML=screen('Falta configurar Firebase: pegá tu configuración en el archivo <b>config.js</b> (ver README).'); return;
  }
  firebase.initializeApp(cfg);
  S.auth=firebase.auth(); S.db=firebase.firestore();
  try{ S.db.enablePersistence({synchronizeTabs:true}).catch(()=>{}); }catch(e){}
  try{ const d=await S.db.doc('config/admin').get(); S.adminExists=d.exists; }
  catch(err){ console.error(err); $app.innerHTML=screen('No se pudo conectar con la base de datos. Revisá config.js y las reglas de Firestore.'); return; }
  S.auth.onAuthStateChanged(user=>{
    S.authChecked=true;
    if(S.settingUp) return;
    if(user){ if(S.me!==user.uid) startData(user.uid); else render(); }
    else { stopData(); S.me=null; render(); }
  });
})();
})();
