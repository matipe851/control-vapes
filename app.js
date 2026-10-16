
(() => {
const $app = document.getElementById('app');
const S = { db:null, auth:null, adminExists:null, authChecked:false, me:null, users:{}, prods:{}, clients:{}, ventas:{}, compras:{}, ready:{usuarios:false,productos:false,clientes:false,ventas:false,compras:false}, tab:'resumen', period:'mes', authErr:'', confirm:null, ventaClienteNuevo:false, vLines:null, vf:{}, bulkSel:null, bulk:null, cobroMedio:'Efectivo', pedSem:2, kf:{}, blue:null };
const newLine = () => ({prod:'', cant:'1', precio:''});
const MEDIOS = ['Efectivo','Transferencia','Mercado Pago','Fiado'];
const COBRO_MEDIOS = ['Efectivo','Transferencia','Mercado Pago'];
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
S.pedSem = Number(ssGet('cv_pedsem'))||2;
S.kf = {mon: ssGet('cv_kmon')||'USD'};

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

// ---------- WhatsApp ----------
const MSG_HEADER = 'ELF BAR ICE KING 40K PUFF';
// keyword → emoji (español e inglés). Se buscan en el nombre del sabor, en el orden en que aparecen.
const FRUTAS = [
  [/(water ?melon|sand[ií]a)/,'🍉'], [/(straw ?berr|\bstraw\b|frutilla|fresa)/,'🍓'], [/(blue ?berr|ar[aá]ndano|mixed berr|\bberr|cranberr|blue razz|\brazz)/,'🫐'],
  [/(grape|\buva)/,'🍇'], [/mango/,'🥭'], [/(banana|pl[aá]tano)/,'🍌'], [/(cherry|cereza)/,'🍒'], [/(peach|durazno|melocot)/,'🍑'],
  [/(pine ?apple|anan[aá]|pi[ñn]a\b)/,'🍍'], [/(\bapple|manzana)/,'🍏'], [/(lemon|lim[oó]n|\blime|\blima\b)/,'🍋'],
  [/(orange|naranja|mandarin)/,'🍊'], [/kiwi/,'🥝'], [/(coconut|\bcoco\b)/,'🥥'], [/(\bmelon|\bmel[oó]n)/,'🍈'], [/(\bpear|\bpera\b)/,'🍐'],
  [/(passion|maracuy)/,'🌺'], [/(dragon|pitaya|pitahaya)/,'🐉'], [/(mint|menta)/,'🌿'], [/\bcola\b/,'🥤'], [/(tobacco|tabaco)/,'🍂'],
  [/(coffee|caf[eé])/,'☕'], [/(vanilla|vainilla)/,'🍦'], [/(candy|\bgum\b|chicle|bubble)/,'🍬'], [/(energy|red bull)/,'⚡']
];
function frutaDe(sabor){
  const s=' '+String(sabor||'').toLowerCase()+' ';
  const hits=[];
  for(const [re,em] of FRUTAS){ const m=s.match(re); if(m && !hits.some(h=>h.em===em)) hits.push({i:m.index, em}); }
  return hits.sort((a,b)=>a.i-b.i).map(h=>h.em).join('');
}
const esIce = sabor => /\bice\b/i.test(String(sabor||''));
function mensajeStock(){
  const disp=Object.values(S.prods).filter(p=>stockOf(p.id)>0).sort((a,b)=>a.sabor.localeCompare(b.sabor));
  const lineas=disp.map(p=>`• ${p.sabor} ${frutaDe(p.sabor)}${esIce(p.sabor)?'❄️':''}`.trimEnd());
  const link = catalogoActivo() ? `\n\n🛒 Mirá precios y armá tu pedido acá:\n${catalogoURL()}` : '';
  return `*${MSG_HEADER}*\n\n` + (lineas.length? lineas.join('\n') : 'Por ahora no hay sabores en stock.') + link;
}
// ---------- Catálogo online ----------
const catalogoURL = () => location.origin + location.pathname.replace(/[^/]*$/,'') + 'catalogo.html';
const catalogoActivo = () => !!(S.catalogo && S.catalogo.activo!==false && S.catalogo.telefono && !S.catErr);
function catalogoItems(){
  return Object.values(S.prods).map(p=>{ const st=stockOf(p.id); if(st<=0) return null;
    const vg=variantsOf(p.id).filter(g=>g.restante>0); const precio=(vg[0]&&vg[0].precio)||Number(p.precio)||0;
    return {id:p.id, sabor:p.sabor, emoji:frutaDe(p.sabor)||'💨', ice:esIce(p.sabor), precio, pocas:st<=2, max:st};
  }).filter(Boolean).sort((a,b)=>a.sabor.localeCompare(b.sabor));
}
let catTimer=null;
function syncCatalogo(){
  if(S.users[S.me]?.rol!=='admin' || !S.catReady || S.catErr || !Object.values(S.ready).every(Boolean)) return;
  if(!S.catalogo || !S.catalogo.telefono) return;            // todavía no se configuró
  const items=catalogoItems();
  if(JSON.stringify(items)===JSON.stringify(S.catalogo.items||[])) return;
  clearTimeout(catTimer); catTimer=setTimeout(()=>{ S.db.doc('catalogo/actual').set({items, actualizado:Date.now()},{merge:true}).catch(err=>{ console.error(err); S.catErr=err.code||'error'; scheduleRender(); }); },1200);
}
function viewCatalogo(){
  const c=S.catalogo||{}; const url=catalogoURL(); const items=catalogoItems();
  if(S.catErr) return `<section class="panel"><h2>Catálogo online</h2><p class="note">El catálogo todavía no está habilitado en la base de datos (falta actualizar las reglas de Firebase). Avisale a Claude para que lo termine de configurar.</p></section>`;
  return `<section class="panel"><div class="panel-head"><div><h2>Catálogo online</h2><span class="sub">Página para tus clientes con los sabores en stock. Se actualiza sola con cada venta y reposición.</span></div>
      <span class="pill ${catalogoActivo()?'ok':'mid'}">${catalogoActivo()?'Publicado':c.telefono?'Pausado':'Sin configurar'}</span></div>
    <div class="split"><input id="cat-url" readonly value="${esc(url)}" style="flex:1;min-width:220px"><button class="btn ghost" data-cat-copy>Copiar link</button><a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none">Ver catálogo</a></div>
    <p class="sub">El link no aparece en Google y pide confirmar que es mayor de 18. Mandalo por WhatsApp o en tu lista de difusión; el mensaje de WhatsApp de la planilla ya lo incluye cuando el catálogo está publicado.</p>
  </section>
  <section class="panel"><h2>Configuración</h2>
    <form class="form" id="f-cat" autocomplete="off">
      <label>WhatsApp donde te llegan los pedidos<input id="cat-tel" required maxlength="30" placeholder="11 2345-6789" value="${esc(c.telefonoTxt||'')}"></label>
      <label>Título<input id="cat-tit" maxlength="60" value="${esc(c.titulo||MSG_HEADER)}"></label>
      <label style="grid-column:1/-1">Promo o aviso (opcional)<input id="cat-promo" maxlength="160" placeholder="2 por $54.000 · Envíos en CABA" value="${esc(c.promo||'')}"></label>
      <label style="flex-direction:row;display:flex;align-items:center;gap:8px;color:var(--fg)"><input type="checkbox" id="cat-act" style="width:auto" ${c.activo!==false?'checked':''}> Catálogo visible</label>
      <button class="btn" type="submit">Guardar y publicar</button>
    </form>
  </section>
  <section class="panel"><div class="panel-head"><h2>Lo que ven tus clientes</h2><span class="sub">${items.length} sabores con stock${c.actualizado?` · actualizado ${new Date(c.actualizado).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}`:''}</span></div>
    ${items.length?`<div class="split">${items.map(i=>`<span class="pill ${i.pocas?'warn':'mid'}">${esc(i.sabor)} ${i.emoji}${i.ice?'❄️':''} · ${i.precio?money(i.precio):'sin precio'}</span>`).join('')}</div>
    ${items.some(i=>!i.precio)?'<p class="note">Hay sabores sin precio: en el catálogo aparecen como "Consultar". Cargá el precio en Stock.</p>':''}`:'<p class="empty">No hay sabores con stock.</p>'}
    <p class="sub">El cliente ve "Últimas unidades" cuando quedan 2 o menos, y no puede pedir más de lo que hay.</p>
  </section>`;
}

// Normaliza un teléfono argentino al formato de WhatsApp: 549 + área (sin 0) + número (sin 15)
function waNumber(raw){
  let d=String(raw||'').replace(/\D/g,'');
  if(d.length<8) return null;
  if(d.startsWith('00')) d=d.slice(2);
  if(d.startsWith('54')){ d=d.slice(2); if(d.startsWith('9')) d=d.slice(1); }
  if(d.startsWith('0')) d=d.slice(1);
  if(d.length===8) d='11'+d;                                  // sin código de área → CABA/GBA
  else if(d.length===10 && d.startsWith('15')) d='11'+d.slice(2); // 15 xxxx-xxxx
  else if(d.length===12){                                     // área + 15 + número
    for(const a of [2,3,4]) if(d.slice(a,a+2)==='15'){ d=d.slice(0,a)+d.slice(a+2); break; }
  }
  if(d.length!==10) return null;
  return '549'+d;
}
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3Z"/></svg>';
const conTel = () => Object.values(S.clients).filter(c=>waNumber(c.contacto)).sort((a,b)=>a.nombre.localeCompare(b.nombre));
const freqTxt = o => o.freq==null ? '—' : `${Math.round(o.freq)} d${o.freqEstimada?' <span class="sub" title="Una sola compra: se usa la frecuencia típica de tus clientes">(est.)</span>':(o.tol?` <span class="sub">±${o.tol}</span>`:'')}`;
const faltanTxt = o => o.faltan==null ? '' : o.faltan>0 ? `en ${o.faltan} d` : o.faltan===0 ? 'hoy' : `hace ${-o.faltan} d`;
const paraContactarIds = () => Object.values(clientStats()).filter(o=>(o.estado[0]==='Contactar'||o.estado[0]==='Inactivo') && waNumber(o.c.contacto)).map(o=>o.c.id);
function waHref(c){ return `https://api.whatsapp.com/send?phone=${waNumber(c.contacto)}&text=${encodeURIComponent(mensajeStock())}`; }
function startBulk(ids){ const q=ids.filter(id=>S.clients[id] && waNumber(S.clients[id].contacto)); if(!q.length) return toast('No hay clientes con teléfono para enviar'); S.bulk={ids:q, i:0}; S.tab='clientes'; ssSet('cv_tab','clientes'); render(); document.getElementById('bulk')?.scrollIntoView({block:'start'}); }
function viewBulk(){
  const list=conTel();
  if(S.bulk){
    const {ids,i}=S.bulk; const done=i>=ids.length; const c=done?null:S.clients[ids[i]];
    return `<section class="panel" id="bulk"><div class="panel-head"><h2>Envío masivo</h2><span class="sub num">${Math.min(i,ids.length)} de ${ids.length} abiertos</span></div>
      <div class="bar"><i style="width:${(Math.min(i,ids.length)/ids.length*100).toFixed(1)}%"></i></div>
      ${done?`<p class="note">Listo, abriste los ${ids.length} chats.</p><div class="split"><button class="btn" data-bulk-end>Terminar</button></div>`
      :`<p class="sub">WhatsApp no deja mandar a varios de una sola vez desde una página: tocá el botón, mandá el mensaje en WhatsApp y volvé acá para el siguiente.</p>
      <div class="split"><a class="wa" style="padding:10px 16px;font-size:15px" href="${esc(waHref(c))}" target="_blank" rel="noopener" data-bulk-next>${WA_ICON}Abrir chat de ${esc(c.nombre)} (${i+1}/${ids.length})</a>
      <button class="btn ghost sm" data-bulk-skip>Saltear</button><button class="btn ghost sm" data-bulk-end>Cancelar</button></div>
      <p class="sub">Siguen: ${ids.slice(i+1).map(id=>esc(S.clients[id]?.nombre||'')).join(', ')||'—'}</p>`}
    </section>`;
  }
  const sel=S.bulkSel||new Set();
  return `<section class="panel" id="bulk"><div class="panel-head"><div><h2>Envío masivo</h2><span class="sub">Elegí a quiénes mandarles la lista de sabores en stock</span></div>
    <div class="split"><button class="btn ghost sm" data-bulk-all>Todos (${list.length})</button><button class="btn ghost sm" data-bulk-pc>Para contactar (${paraContactarIds().length})</button><button class="btn ghost sm" data-bulk-none>Ninguno</button></div></div>
    ${list.length?`<div class="split">${list.map(c=>`<label style="display:inline-flex;flex-direction:row;align-items:center;gap:6px;color:var(--fg);font-size:14px;background:var(--surface-2);padding:5px 10px;border-radius:8px;cursor:pointer"><input type="checkbox" style="width:auto" data-bulk-c="${c.id}" ${sel.has(c.id)?'checked':''}>${esc(c.nombre)}</label>`).join('')}</div>
    <div class="split"><button class="btn" data-bulk-go ${sel.size?'':'disabled'}>Empezar envío (${sel.size})</button><button class="btn ghost" data-bulk-copy>Copiar mensaje</button></div>
    <p class="sub">"Copiar mensaje" sirve para pegarlo en una lista de difusión o en un estado de WhatsApp.</p>`
    :`<p class="empty">Ningún cliente tiene teléfono cargado todavía. Cargalo con "Editar" en la tabla de abajo.</p>`}
  </section>`;
}
// ---------- Fiado ----------
const esFiado = v => v.medio==='Fiado';
function deudas(){
  const m={};
  for(const v of Object.values(S.ventas)){ if(!esFiado(v)) continue;
    const o=m[v.clienteId]=m[v.clienteId]||{cid:v.clienteId, total:0, ventas:[], desde:null};
    o.total+=ventaTotal(v); o.ventas.push(v); if(!o.desde || (v.fecha||'')<o.desde) o.desde=v.fecha; }
  return Object.values(m).map(o=>({...o, dias: o.desde? daysBetween(o.desde,today()) : 0, ventas:o.ventas.sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''))})).sort((a,b)=>b.total-a.total);
}
const totalDeuda = () => deudas().reduce((a,o)=>a+o.total,0);
function msgCobro(o){
  const c=S.clients[o.cid]; const nom=(c?.nombre||'').split(' ')[0];
  const det=o.ventas.map(v=>`• ${fmtDate(v.fecha)} — ${v.cantidad} × ${prodName(v.productoId)} (${money(ventaTotal(v))})`).join('\n');
  return `Hola ${nom}! 👋 Te paso el resumen de lo que quedó pendiente:\n\n${det}\n\n*Total: ${money(o.total)}*\n\nAvisame cuando puedas pagarlo. ¡Gracias! 🙌`;
}
function viewFiado(){
  const admin=S.users[S.me]?.rol==='admin';
  const ds=deudas(); const tot=ds.reduce((a,o)=>a+o.total,0);
  return `<section class="kpis">
    <div class="kpi"><span class="l">Te deben</span><span class="v num" style="color:${tot?'var(--bad)':'inherit'}">${money(tot)}</span><span class="h">${ds.length} cliente${ds.length===1?'':'s'}</span></div>
    <div class="kpi"><span class="l">Deuda más vieja</span><span class="v num">${ds.length?Math.max(...ds.map(o=>o.dias))+' días':'—'}</span><span class="h">desde la venta</span></div>
  </section>
  <section class="panel"><div class="panel-head"><div><h2>Fiado</h2><span class="sub">Ventas cargadas con medio de pago "Fiado". Cuando te pagan, tocá Cobrar.</span></div>
    ${admin&&ds.length?`<label style="flex-direction:row;display:flex;align-items:center;gap:8px">Cobrar como<select id="cobro-medio" style="width:auto">${COBRO_MEDIOS.map(m=>`<option ${S.cobroMedio===m?'selected':''}>${m}</option>`).join('')}</select></label>`:''}</div>
  ${ds.length?ds.map(o=>{const c=S.clients[o.cid]; const num=waNumber(c?.contacto);
    return `<div class="panel" style="padding:14px;gap:10px;background:var(--surface-2);border-color:transparent">
      <div class="panel-head"><div><b style="font-size:16px">${esc(clientName(o.cid))}</b> <span class="pill ${o.dias>14?'bad':o.dias>7?'warn':'mid'}">${o.dias} días</span></div>
        <div class="split"><b class="num" style="font-size:18px">${money(o.total)}</b>
        ${num?`<a class="wa" href="${esc(`https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msgCobro(o))}`)}" target="_blank" rel="noopener">${WA_ICON}Recordar</a>`:'<span class="sub">Sin teléfono</span>'}
        ${admin?(S.confirm==='cobrar/'+o.cid?`<span class="inline-confirm">¿Cobrar todo en ${esc(S.cobroMedio)}? <button class="btn sm" data-cobrar-yes="${o.cid}">Sí</button><button class="btn ghost sm" data-del-no>No</button></span>`:`<button class="btn sm" data-cobrar="${o.cid}">Cobrar todo</button>`):''}</div></div>
      <div class="tbl-wrap"><table><tbody>${o.ventas.map(v=>`<tr><td class="num">${fmtDate(v.fecha)}</td><td>${v.cantidad} × ${esc(prodName(v.productoId))}</td><td class="r num">${money(ventaTotal(v))}</td><td class="sub">${esc(userName(v.vendedor))}</td>${admin?`<td class="r"><button class="btn ghost sm" data-cobrar-v="${v.id}">Cobrar</button></td>`:''}</tr>`).join('')}</tbody></table></div>
    </div>`}).join('')
  :`<p class="empty">Nadie te debe nada. Para fiar, cargá la venta con medio de pago "Fiado".</p>`}
  ${admin?'':'<p class="note">Solo el administrador puede registrar los cobros.</p>'}
  </section>`;
}

// ---------- Pedido sugerido ----------
function pedido(){
  const sem=S.pedSem||2; const t=today();
  return Object.values(S.prods).map(p=>{
    const v30=Object.values(S.ventas).filter(v=>v.productoId===p.id && v.fecha && daysBetween(v.fecha,t)>=0 && daysBetween(v.fecha,t)<30).reduce((a,v)=>a+(Number(v.cantidad)||0),0);
    const vTot=Object.values(S.ventas).filter(v=>v.productoId===p.id).reduce((a,v)=>a+(Number(v.cantidad)||0),0);
    const porSem=v30/30*7; const st=Math.max(0,stockOf(p.id)); const min=Number(p.stockMin)||0;
    const dias = porSem>0 ? Math.floor(st/(porSem/7)) : null;
    let sug = Math.ceil(porSem*sem + min - st);
    if(porSem===0) sug = vTot>0 ? Math.max(0, min-st) : 0;
    sug=Math.max(0,sug);
    return {p, v30, porSem, st, dias, sug, costo:Number(p.costo)||0};
  }).sort((a,b)=>b.sug-a.sug || b.porSem-a.porSem);
}
function textoPedido(rows){
  const r=rows.filter(x=>x.sug>0);
  return `Pedido ELF BAR ICE KING 40K\n\n${r.map(x=>`• ${x.p.sabor} x ${x.sug}`).join('\n')}\n\nTotal: ${r.reduce((a,x)=>a+x.sug,0)} unidades`;
}
function viewPedido(){
  const rows=pedido(); const conSug=rows.filter(x=>x.sug>0);
  const uni=conSug.reduce((a,x)=>a+x.sug,0); const cst=conSug.reduce((a,x)=>a+x.sug*x.costo,0);
  return `<section class="panel"><div class="panel-head"><div><h2>Pedido sugerido</h2><span class="sub">Según lo que se vendió de cada sabor en los últimos 30 días</span></div>
    <label style="flex-direction:row;display:flex;align-items:center;gap:8px">Que alcance para<select id="ped-sem" style="width:auto">${[1,2,3,4].map(n=>`<option value="${n}" ${S.pedSem===n?'selected':''}>${n} semana${n>1?'s':''}</option>`).join('')}</select></label></div>
  ${rows.length?`<div class="tbl-wrap"><table><thead><tr><th>Sabor</th><th class="r">Vendidas 30 d</th><th class="r">Por semana</th><th class="r">Stock</th><th>Alcanza para</th><th class="r">Pedir</th></tr></thead><tbody>
  ${rows.map(x=>`<tr><td><b>${esc(x.p.sabor)}</b></td><td class="r num">${x.v30}</td><td class="r num">${x.porSem?x.porSem.toFixed(1):'—'}</td><td class="r num">${x.st}</td>
    <td>${x.st<=0?'<span class="pill bad">Sin stock</span>':x.dias==null?'<span class="sub">sin ventas recientes</span>':`<span class="pill ${x.dias<7?'bad':x.dias<14?'warn':'ok'}">${x.dias} días</span>`}</td>
    <td class="r num"><b style="font-size:16px;color:${x.sug?'var(--accent)':'var(--muted)'}">${x.sug||'—'}</b></td></tr>`).join('')}
  </tbody></table></div>
  <div class="panel-head"><span><b class="num">${uni}</b> unidades a pedir${cst?` · costo estimado <b class="num">${money(cst)}</b>`:''}</span>
    <button class="btn" data-ped-copy ${uni?'':'disabled'}>Copiar pedido</button></div>
  <p class="sub">"Pedir" = lo que se vende por semana × las semanas elegidas + el stock mínimo − el stock actual. "Copiar pedido" arma el texto para mandárselo al proveedor.</p>`
  :`<p class="empty">Todavía no hay sabores cargados.</p>`}
  </section>`;
}

function waBtn(c){
  const num=waNumber(c?.contacto); if(!num) return '';
  const href=`https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(mensajeStock())}`;
  return `<a class="wa" href="${esc(href)}" target="_blank" rel="noopener" title="Abrir chat con ${esc(c.nombre)} con la lista de sabores">${WA_ICON}WhatsApp</a>`;
}

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
const ventaBruto = v => (Number(v.cantidad)||0)*(Number(v.precioUnit)||0);
const ventaTotal = v => Math.max(0, ventaBruto(v) - (Number(v.descuento)||0));
const ventaGanancia = v => ventaTotal(v) - (Number(v.cantidad)||0)*(Number(v.costoUnit)||0);
// descuento del formulario de venta: monto fijo ($) o porcentaje (%) sobre el subtotal
const descDe = sub => { const n=Number(S.vf.desc)||0; if(n<=0||sub<=0) return 0; return Math.min(sub, Math.round(S.vf.descTipo==='%'? sub*Math.min(n,100)/100 : n)); };
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
  const addDays=(f,n)=>{const d=dParse(f); d.setDate(d.getDate()+Math.round(n)); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const median=a=>{ if(!a.length) return null; const x=[...a].sort((p,q)=>p-q); const m=Math.floor(x.length/2); return x.length%2?x[m]:(x[m-1]+x[m])/2; };
  // 1) intervalos entre compras de cada cliente (las compras del mismo día cuentan como una)
  for(const o of Object.values(out)){
    const f=[...o.fechas].filter(Boolean).sort(); o.compras=f.length; o.fechasOrd=f;
    o.ultima=f[f.length-1]||null; o.desde=o.ultima? daysBetween(o.ultima,t) : null;
    o.intervalos=[]; for(let i=1;i<f.length;i++){ const d=daysBetween(f[i-1],f[i]); if(d>0) o.intervalos.push(d); }
    const fav=Object.entries(o.sabores).sort((a,b)=>b[1]-a[1])[0]; o.fav = fav? prodName(fav[0]) : '—'; o.favId = fav?fav[0]:null;
  }
  // 2) frecuencia típica del negocio, para clientes con una sola compra
  const freqs=Object.values(out).filter(o=>o.intervalos.length).map(o=>median(o.intervalos));
  const freqGlobal = freqs.length ? Math.max(3, Math.round(median(freqs))) : 30;
  // 3) frecuencia de cada cliente: promedio ponderado (las compras recientes pesan más), recortando valores raros
  for(const o of Object.values(out)){
    const iv=o.intervalos;
    if(iv.length){
      const med=median(iv); const capped = iv.length>=3 ? iv.map(d=>Math.min(d, med*2)) : iv;
      let sw=0, sx=0; capped.forEach((d,i)=>{ const w=i+1; sw+=w; sx+=w*d; });
      o.freq=sx/sw; o.freqEstimada=false;
      const mean=capped.reduce((a,b)=>a+b,0)/capped.length;
      o.desvio = capped.length>=2 ? Math.sqrt(capped.reduce((a,d)=>a+(d-mean)**2,0)/capped.length) : null;
      o.confianza = iv.length>=4?'alta':iv.length>=2?'media':'baja';
    } else { o.freq = o.ultima? freqGlobal : null; o.freqEstimada=true; o.desvio=null; o.confianza='baja'; }
    // margen de tolerancia: según qué tan regular es el cliente
    o.tol = o.freq==null? 0 : Math.max(2, Math.round(Math.max(o.desvio||0, o.freq*0.25)));
    o.proxima = (o.ultima && o.freq!=null) ? addDays(o.ultima, o.freq) : null;
    o.faltan = o.proxima ? daysBetween(t, o.proxima) : null;   // >0: faltan días · <0: atrasado
    if(!o.ultima) o.estado=['Sin compras','mid'];
    else if(o.faltan < -(o.freq + o.tol)) o.estado=['Inactivo','bad'];
    else if(o.faltan < -o.tol) o.estado=['Contactar','warn'];
    else if(o.faltan <= Math.min(3,o.tol)) o.estado=['Le toca ahora','warn'];
    else if(o.faltan <= 7) o.estado=['Pide pronto','mid'];
    else o.estado = o.freqEstimada ? ['Nuevo','mid'] : ['Al día','ok'];
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
  const openDetails = !!document.getElementById('msg-det')?.open;
  $app.innerHTML = viewShell(allReady);
  bindApp();
  if(openDetails){ const d=document.getElementById('msg-det'); if(d) d.open=true; }
  if(active){ const el=document.getElementById(active); if(el && el.tagName!=='BUTTON' && el.tagName!=='A') el.focus(); }
  syncCatalogo();
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
  const tabs=[['resumen','Resumen'],['ventas','Ventas'],['stock','Stock'],['clientes','Clientes'],['compras','Compras'],['fiado','Fiado'],['sabores','Clientes × sabor']];
  if(admin) tabs.push(['asesor','Asesor'],['catalogo','Catálogo'],['usuarios','Usuarios']);
  tabs.push(['cuenta','Mi cuenta']);
  if(!tabs.some(t=>t[0]===S.tab)) S.tab='resumen';
  const body = !allReady ? `<div class="panel"><p class="empty">Cargando datos…</p></div>` :
    ({resumen:viewResumen, ventas:viewVentas, stock:viewStock, clientes:viewClientes, compras:viewCompras, fiado:viewFiado, sabores:viewMatrix, usuarios:viewUsuarios, catalogo:viewCatalogo, asesor:viewAsesor, cuenta:viewCuenta})[S.tab]();
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
    <div class="kpi"><span class="l">Facturación</span><span class="v num">${money(total)}</span><span class="h">${ops} venta${ops===1?'':'s'}${(()=>{const d=vs.reduce((a,v)=>a+(Number(v.descuento)||0),0); return d?` · ${money(d)} en descuentos`:'';})()}</span></div>
    <div class="kpi"><span class="l">Unidades vendidas</span><span class="v num">${n0.format(unid)}</span><span class="h">Ticket prom. ${money(ops?total/ops:0)}</span></div>
    <div class="kpi"><span class="l">Ganancia</span><span class="v num">${money(gan)}</span><span class="h">${sinCosto?'Faltan costos en algunos sabores':(total?`Margen ${Math.round(gan/total*100)}%`:'—')}</span></div>
    <div class="kpi"><span class="l">Clientes que compraron</span><span class="v num">${clientesPer}</span><span class="h">${Object.keys(S.clients).length} en total</span></div>
    <div class="kpi"><span class="l">Stock disponible</span><span class="v num">${n0.format(stockTot)}</span><span class="h">${valorStock?`Vale ${money(valorStock)} a precio de venta`:'Cargá precios en Stock'}</span></div>
    <div class="kpi"><span class="l">Te deben (fiado)</span><span class="v num" style="color:${totalDeuda()?'var(--bad)':'inherit'}">${money(totalDeuda())}</span><span class="h">${deudas().length} cliente${deudas().length===1?'':'s'} · ver pestaña Fiado</span></div>
    <div class="kpi"><span class="l">Sabores a reponer</span><span class="v num" style="color:${reponer?'var(--warn)':'inherit'}">${reponer}</span><span class="h">Stock en el mínimo o debajo</span></div>
  </section>
  <div class="grid2">
    <section class="panel"><div class="panel-head"><h2>Sabores más vendidos</h2><span class="sub">unidades</span></div>${barList(rankSabor, n0.format)}</section>
    <section class="panel"><div class="panel-head"><h2>${useUnits?'Unidades':'Facturación'} por mes</h2><span class="sub">últimos 6 meses</span></div>
      <div class="months">${months.map((m,i)=>`<div class="mcol ${i===5?'cur':''}"><span class="val num">${mval(m)? (useUnits? n0.format(mval(m)) : (mval(m)>=1000? '$'+Math.round(mval(m)/1000)+'k' : money(mval(m)))) : ''}</span><div class="stick"><i style="height:${(mval(m)/mmax2*100).toFixed(1)}%"></i></div><span>${m.l}</span></div>`).join('')}</div></section>
    <section class="panel"><div class="panel-head"><h2>Ventas por vendedor</h2><span class="sub">facturación</span></div>${barList(rankVend, money, 'ice')}</section>
    <section class="panel"><div class="panel-head"><h2>Medio de pago</h2><span class="sub">facturación</span></div>${barList(rankMedio, money, 'ice')}</section>
    <section class="panel"><div class="panel-head"><h2>Top 10 clientes</h2><span class="sub">unidades en el período</span></div>${barList(topCli, n0.format)}</section>
    <section class="panel"><div class="panel-head"><div><h2>Para contactar</h2><span class="sub">pasaron su frecuencia habitual</span></div>${paraContactarIds().length?`<button class="btn sm" data-bulk-pc-go>${WA_ICON.replace('<svg','<svg style="width:14px;height:14px;fill:currentColor;vertical-align:-2px"')} Enviar a todos (${paraContactarIds().length})</button>`:''}</div>
      ${cs.length?`<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Última</th><th class="r">Días</th><th>Estado</th><th></th></tr></thead><tbody>${cs.map(o=>`<tr><td>${esc(o.c.nombre)}</td><td class="num">${fmtDate(o.ultima)}</td><td class="r num">${o.desde}</td><td><span class="pill ${o.estado[1]}">${o.estado[0]}</span></td><td class="r">${waBtn(o.c)||(S.users[S.me]?.rol==='admin'?`<button class="btn ghost sm" data-cli-goedit="${o.c.id}">Cargar teléfono</button>`:'<span class="sub">Sin teléfono</span>')}</td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">Nadie atrasado por ahora.</p>`}</section>
    <section class="panel"><div class="panel-head"><div><h2>Próximos pedidos</h2><span class="sub">les toca comprar en los próximos 7 días, según su frecuencia</span></div></div>
      ${(()=>{ const ps=Object.values(clientStats()).filter(o=>o.faltan!=null && o.faltan>=-o.tol && o.faltan<=7).sort((a,b)=>a.faltan-b.faltan);
        return ps.length?`<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Cuándo</th><th class="r">Cada</th><th>Suele llevar</th><th></th></tr></thead><tbody>${ps.map(o=>`<tr><td>${esc(o.c.nombre)}</td><td class="num"><span class="pill ${o.faltan<=0?'warn':'mid'}">${faltanTxt(o)}</span></td><td class="r num" style="white-space:nowrap">${freqTxt(o)}</td><td>${esc(o.fav)}</td><td class="r">${waBtn(o.c)}</td></tr>`).join('')}</tbody></table></div>`:`<p class="empty">Nadie tiene previsto comprar esta semana.</p>`; })()}
    </section>
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
    <label>Descuento <span style="display:flex;gap:6px"><input id="v-desc" type="number" min="0" step="1" placeholder="0" value="${esc(S.vf.desc||'')}" aria-label="Descuento"><select id="v-desc-tipo" style="width:auto" aria-label="Tipo de descuento"><option value="$" ${S.vf.descTipo!=='%'?'selected':''}>$</option><option value="%" ${S.vf.descTipo==='%'?'selected':''}>%</option></select></span></label>
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
      ${(()=>{const sub=lines.reduce((a,l)=>a+lineTotal(l),0); const d=descDe(sub); return `<span class="sub" id="vl-desc-txt">${d?`Subtotal ${money(sub)} · Descuento −${money(d)}`:''}</span>`;})()}
      <span class="vtotal">Total <b class="num" id="vl-total">${money((()=>{const sub=lines.reduce((a,l)=>a+lineTotal(l),0); return sub-descDe(sub);})())}</b> <span class="sub" id="vl-units">${lines.reduce((a,l)=>a+(parseInt(l.cant,10)||0),0)} u.</span></span>
      <button class="btn" type="submit" ${prods.length?'':'disabled'}>Guardar venta</button>
    </div>
  </form></section>
  <section class="panel"><div class="panel-head"><div><h2>Ventas</h2><span class="sub num">${list.length} ventas · ${money(tot)}</span></div>${periodSelect()}</div>
  ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Sabor</th><th class="r">Cant.</th><th class="r">Precio u.</th><th class="r">Total</th><th>Pago</th><th>Vendedor</th><th></th></tr></thead><tbody>
  ${list.map(v=>`<tr><td class="num">${fmtDate(v.fecha)}</td><td>${esc(clientName(v.clienteId))}</td><td>${esc(prodName(v.productoId))}</td><td class="r num">${v.cantidad}</td><td class="r num">${money(v.precioUnit)}</td><td class="r num">${money(ventaTotal(v))}${Number(v.descuento)?`<br><span class="sub" title="Precio de lista ${money(ventaBruto(v))}">−${money(v.descuento)} desc.</span>`:''}</td><td>${esFiado(v)?'<span class="pill bad">Debe</span>':esc(v.medio||'')+(v.cobrado?' <span class="sub">(fiado, cobrado '+fmtDate(v.cobrado)+')</span>':'')}</td><td>${esc(userName(v.vendedor))}</td>
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
    <label>Costo unitario en US$<input id="p-usd" type="number" min="0" step="0.01" placeholder="US$"></label>
    <label>o costo en pesos<input id="p-costo" type="number" min="0" placeholder="$"></label>
    <label>Precio de venta<input id="p-precio" type="number" min="0" placeholder="$"></label>
    <label>Stock inicial<input id="p-stock" type="number" min="0" value="0"></label>
    <label>Stock mínimo<input id="p-min" type="number" min="0" value="2"></label>
    <button class="btn" type="submit">Agregar</button>
  </form></section>`:''}
  ${viewPedido()}
  <section class="panel"><div class="panel-head"><h2>Stock por sabor</h2><span class="sub">Stock actual = inicial + compras − ventas</span></div>
  ${admin&&prods.length?`<div class="split note" style="color:var(--fg)"><span>Costo en US$ para <b>todos</b> los sabores</span><input id="usd-all" type="number" min="0" step="0.01" placeholder="US$" style="width:110px"><button class="btn sm" data-usd-all>Aplicar</button>
    <span class="sub">${S.blue?`Se pasa a pesos con el blue promedio de hoy (${money(S.blue.prom)})`:(S.blueErr||'Buscando cotización del dólar…')}</span></div>`:''}
  ${prods.length?`<div class="tbl-wrap"><table><thead><tr><th>Sabor</th><th>Modelo</th><th class="r">Costo US$</th><th class="r">Costo $</th><th class="r">Precio</th><th class="r">Vendidas</th><th class="r">Stock</th><th>Por precio</th><th>Estado</th>${admin?'<th></th>':''}</tr></thead><tbody>
  ${prods.map(p=>{const s=stockOf(p.id); const st= s<=0?['Sin stock','bad']: s<=(Number(p.stockMin)||0)?['Reponer','warn']:['OK','ok'];
    return `<tr><td>${admin&&S.renProd===p.id?`<span class="split" style="flex-wrap:nowrap"><input id="ren-in" maxlength="50" value="${esc(p.sabor)}" style="width:160px" aria-label="Nuevo nombre"><button class="btn sm" data-ren-save="${p.id}">Guardar</button><button class="btn ghost sm" data-ren-cancel>Cancelar</button></span>`
      :`<b>${esc(p.sabor)}</b>${admin?` <button class="btn ghost sm" data-ren="${p.id}" aria-label="Cambiar nombre de ${esc(p.sabor)}" title="Cambiar nombre">✏️</button>`:''}`}</td><td class="sub">${esc(p.modelo||'')} ${p.puffs?`· ${n0.format(p.puffs)} puffs`:''}</td>
    <td class="r">${admin?`<input class="num" style="width:84px;text-align:right" type="number" min="0" step="0.01" data-usd="${p.id}" value="${Number(p.costoUSD)||''}" placeholder="US$" aria-label="Costo en dólares de ${esc(p.sabor)}">`:(p.costoUSD?usd(p.costoUSD):'—')}</td>
    <td class="r">${admin?`<input class="num" style="width:96px;text-align:right" type="number" min="0" data-edit="${p.id}" data-f="costo" value="${Number(p.costo)||''}" placeholder="$" aria-label="Costo de ${esc(p.sabor)}">`:money(p.costo)}${p.costoUSD&&p.tc?`<br><span class="sub num" style="white-space:nowrap">× ${money(p.tc)}</span>`:''}</td>
    <td class="r">${admin?`<input class="num" style="width:96px;text-align:right" type="number" min="0" data-edit="${p.id}" data-f="precio" value="${Number(p.precio)||''}" placeholder="$" aria-label="Precio de ${esc(p.sabor)}">`:money(p.precio)}</td>
    <td class="r num">${sold[p.id]||0}</td><td class="r num"><b>${s}</b></td><td class="sub">${(()=>{const vs=variantsOf(p.id).filter(g=>g.restante>0); return vs.length>1? vs.map(g=>`<span style="white-space:nowrap">${g.restante} a ${money(g.precio)} <span title="costo">(c. ${money(g.costo)})</span></span>`).join('<br>') : '—';})()}</td><td><span class="pill ${st[1]}">${st[0]}</span></td>${admin?`<td class="r">${delBtn('productos',p.id)}</td>`:''}</tr>`}).join('')}
  </tbody></table></div>${admin?'<p class="sub">Si ponés el costo en US$, el costo en pesos se calcula solo con el blue promedio del día y queda guardada la cotización. Costo y precio de acá son los del stock inicial (y se usan de base para nuevas reposiciones). Cada reposición tiene su propio costo y precio, que se editan en Compras. Si un sabor tiene unidades a precios distintos, se ven separadas en "Por precio" y en Ventas.</p>':''}`:`<p class="empty">Todavía no hay sabores cargados.</p>`}
  </section>`;
}

function viewClientes(){
  const cs=Object.values(clientStats()).sort((a,b)=>b.unidades-a.unidades);
  const admin=S.users[S.me]?.rol==='admin';
  return `
  <section class="panel"><div class="panel-head"><h2>Nuevo cliente</h2></div>
  <form class="form" id="f-cli" autocomplete="off">
    <label>Nombre<input id="c-nombre" required maxlength="50"></label>
    <label>Teléfono (WhatsApp) / Instagram<input id="c-contacto" maxlength="60" placeholder="11 2345-6789"></label>
    <button class="btn" type="submit">Agregar cliente</button>
  </form></section>
  ${viewBulk()}
  <section class="panel">
    <details id="msg-det"><summary>Mensaje de WhatsApp que se envía</summary>
      <p class="sub" style="margin:8px 0">Se arma solo con los sabores que tienen stock en este momento.</p>
      <pre class="msg-preview">${esc(mensajeStock())}</pre>
    </details>
  </section>
  <section class="panel"><div class="panel-head"><h2>Clientes</h2><span class="sub">"Cada" = cada cuántos días compra (promedio que le da más peso a las últimas compras; ± es cuánto suele variar). Tocá WhatsApp para abrir el chat con la lista de sabores</span></div>
  ${cs.length?`<div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th class="r">Compras</th><th class="r">Unid.</th><th class="r">Gastó</th><th>Sabor favorito</th><th>Última</th><th class="r">Cada</th><th>Próxima</th><th>Estado</th>${admin?'<th></th>':''}</tr></thead><tbody>
  ${cs.map(o=>{const ed=admin&&S.editCli===o.c.id; return `<tr><td>${ed?`<input id="ec-nombre" maxlength="50" value="${esc(o.c.nombre)}" style="width:140px" aria-label="Nombre">`:`<b>${esc(o.c.nombre)}</b>`}</td><td class="sub">${ed?`<input id="ec-contacto" maxlength="60" value="${esc(o.c.contacto||'')}" style="width:140px" placeholder="Teléfono / Instagram" aria-label="Contacto">`:`<span class="contact-cell">${esc(o.c.contacto||'')}${waBtn(o.c)}</span>`}</td><td class="r num">${o.compras}</td><td class="r num">${o.unidades}</td><td class="r num">${money(o.gasto)}</td><td>${esc(o.fav)}</td><td class="num">${fmtDate(o.ultima)}</td><td class="r num" style="white-space:nowrap">${freqTxt(o)}</td><td class="num" style="white-space:nowrap">${fmtDate(o.proxima)} <span class="sub">${faltanTxt(o)}</span></td><td><span class="pill ${o.estado[1]}">${o.estado[0]}</span></td>${admin?`<td class="r"><span class="split" style="justify-content:flex-end;flex-wrap:nowrap">${ed?`<button class="btn sm" data-cli-save="${o.c.id}">Guardar</button><button class="btn ghost sm" data-cli-cancel>Cancelar</button>`:`<button class="btn ghost sm" data-cli-edit="${o.c.id}">Editar</button>${delBtn('clientes',o.c.id)}`}</span></td>`:''}</tr>`}).join('')}
  </tbody></table></div>`:`<p class="empty">Sin clientes todavía. También se crean solos al cargar una venta con "+ Cliente nuevo".</p>`}
  </section>`;
}

// ---------- Dólar blue (misma cotización que DolarHoy, vía dolarapi.com) ----------
const usd = v => 'US$ ' + new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(v||0);
async function cargarBlue(force){
  if(S.bluePend || (!force && (S.blueErr || (S.blue && Date.now()-S.blue.cargado < 10*60*1000)))) return;
  S.blueErr=null; S.bluePend=true;
  try{ const r=await fetch('https://dolarapi.com/v1/dolares/blue',{cache:'no-store'}); if(!r.ok) throw new Error(r.status);
    const d=await r.json(); const compra=Number(d.compra), venta=Number(d.venta);
    if(!(compra>0&&venta>0)) throw new Error('sin datos');
    S.blue={compra, venta, prom:Math.round((compra+venta)/2), fecha:d.fechaActualizacion, cargado:Date.now()};
  }catch(e){ console.error(e); S.blueErr='No se pudo traer la cotización. Escribila a mano.'; }
  S.bluePend=false; scheduleRender();
}

// ---------- Asesor financiero ----------
const ASE_DEF={margen:35, ref:29900, redondeo:500, refModo:'min'};
const MERCADO_URL='https://raw.githubusercontent.com/matipe851/control-vapes/main/precios-mercado.json';
const MERCADO_RUN='https://github.com/matipe851/control-vapes/actions/workflows/precios-mercado.yml';
async function cargarMercado(force){
  if(S.mercPend || (!force && S.mercado!==undefined)) return; S.mercPend=true;
  try{ const r=await fetch(MERCADO_URL+'?t='+Date.now(),{cache:'no-store'}); if(!r.ok) throw new Error(r.status); S.mercado=await r.json(); S.mercErr=null; }
  catch(e){ console.error(e); S.mercado=S.mercado||null; S.mercErr='No se pudieron leer los precios de mercado.'; }
  S.mercPend=false; scheduleRender();
}
function aseCfg(){ let c={}; try{ c=JSON.parse(ssGet('cv_asesor')||'{}')||{}; }catch(e){} const cfg={...ASE_DEF, ...c};
  cfg.refManual=cfg.ref;
  if(cfg.refModo!=='manual' && S.mercado && S.mercado.minimo) cfg.ref = cfg.refModo==='prom' ? S.mercado.promedio : S.mercado.minimo;
  return cfg; }
const redondear=(v,r)=> r>0 ? Math.round(v/r)*r : Math.round(v);
const pct = v => (v>=0?'':'−')+Math.abs(Math.round(v*100))+'%';
function asesor(){
  const cfg=aseCfg(); const t=today(); const blue=S.blue?.prom||0;
  const compras=Object.values(S.compras);
  const usdCompras=compras.filter(c=>Number(c.costoUSD)>0).sort((a,b)=>(b.creado||0)-(a.creado||0));
  const usdProds=Object.values(S.prods).map(p=>Number(p.costoUSD)).filter(x=>x>0);
  const usdProm = usdProds.length ? usdProds.reduce((a,b)=>a+b,0)/usdProds.length : usdCompras.length ? usdCompras.slice(0,10).reduce((a,c)=>a+Number(c.costoUSD),0)/Math.min(10,usdCompras.length) : 0;
  const ultTc = usdCompras[0]?.tc || 0;
  const vs30=Object.values(S.ventas).filter(v=>v.fecha && daysBetween(v.fecha,t)>=0 && daysBetween(v.fecha,t)<30);
  const rows=Object.values(S.prods).map(p=>{
    const st=Math.max(0,stockOf(p.id));
    const v30=vs30.filter(v=>v.productoId===p.id).reduce((a,v)=>a+(Number(v.cantidad)||0),0);
    const porDia=v30/30; const dias= porDia>0 ? Math.round(st/porDia) : null;
    const vg=variantsOf(p.id).filter(g=>g.restante>0);
    const precio=(vg[0]&&vg[0].precio)||Number(p.precio)||0;
    const lots=lotsOf(p.id).filter(l=>l.restante>0);
    const costoHist = lots.length ? lots.reduce((a,l)=>a+l.costo*l.restante,0)/lots.reduce((a,l)=>a+l.restante,0) : (Number(p.costo)||0);
    const ultUsd = Number(p.costoUSD) || compras.filter(c=>c.productoId===p.id && Number(c.costoUSD)>0).sort((a,b)=>(b.creado||0)-(a.creado||0))[0]?.costoUSD || usdProm;
    const costoRepo = (ultUsd && blue) ? Math.round(ultUsd*blue) : (costoHist||Number(p.costo)||0);
    const margenHoy = precio ? (precio-costoRepo)/precio : null;
    // precio sugerido: costo de reposición + margen objetivo, ajustado por demanda
    let base = costoRepo ? costoRepo/(1-cfg.margen/100) : 0;
    let accion, motivo;
    const lento = st>0 && (v30===0 || (dias!=null && dias>60));
    const fuerte = v30>=2 && dias!=null && dias<21;
    if(!costoRepo){ accion='Falta costo'; motivo='Cargá el costo (en Compras) para poder calcular el precio.'; base=precio; }
    else if(lento){ base=Math.max(costoRepo*1.12, Math.min(precio||base, base)*0.9); accion='Promo'; motivo = v30===0 ? `No se vendió en 30 días y tenés ${st}. Bajalo para recuperar la plata.` : `Tenés stock para ~${dias} días. Una promo lo mueve más rápido.`; }
    else if(fuerte){ base=base*1.03; accion='Demanda alta'; motivo=`Se vende rápido (${v30} en 30 días). Aguanta un precio un poco más alto.`; }
    else { accion='Normal'; motivo=v30?`Rotación normal (${v30} en 30 días).`:'Sin stock ni ventas recientes.'; }
    if(cfg.ref && !lento && base>cfg.ref*1.08 && costoRepo/(cfg.ref*1.08) < 0.85) base=cfg.ref*1.08; // no irse muy arriba del mercado si igual deja margen
    const sug = base ? redondear(base, cfg.redondeo) : 0;
    const dif = precio && sug ? (sug-precio)/precio : 0;
    const veredicto = !precio ? ['Sin precio','bad'] : !costoRepo ? ['Falta costo','mid'] : margenHoy<0.15 ? ['Margen muy bajo','bad'] : Math.abs(dif)<0.03 ? ['Bien','ok'] : dif>0 ? ['Subir','warn'] : ['Bajar','mid'];
    return {p, st, v30, dias, precio, costoHist, costoRepo, ultUsd, margenHoy, sug, dif, accion, motivo, veredicto, margenSug: sug? (sug-costoRepo)/sug : null};
  }).sort((a,b)=>Math.abs(b.dif)-Math.abs(a.dif) || b.v30-a.v30);

  // precio único (todos los sabores valen lo mismo)
  const conStock=rows.filter(r=>r.st>0);
  const precios=conStock.map(r=>r.precio).filter(Boolean); const cnt={}; precios.forEach(x=>cnt[x]=(cnt[x]||0)+1);
  const precioActual = Number(Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]?.[0]) || Number(Object.values(S.prods)[0]?.precio)||0;
  const costoGlobal = (usdProm && blue) ? Math.round(usdProm*blue) : (conStock.length ? Math.round(conStock.reduce((a,r)=>a+(r.costoHist||0)*r.st,0)/Math.max(1,conStock.reduce((a,r)=>a+r.st,0))) : 0);
  const precioObjetivo = costoGlobal ? costoGlobal/(1-cfg.margen/100) : 0;
  let precioSug = precioObjetivo ? redondear(precioObjetivo, cfg.redondeo) : 0;
  const margenActual = precioActual&&costoGlobal ? (precioActual-costoGlobal)/precioActual : null;
  const margenSug = precioSug&&costoGlobal ? (precioSug-costoGlobal)/precioSug : null;
  const margenRef = cfg.ref&&costoGlobal ? (cfg.ref-costoGlobal)/cfg.ref : null;
  const difPrecio = precioActual&&precioSug ? (precioSug-precioActual)/precioActual : 0;
  const unid30 = rows.reduce((a,r)=>a+r.v30,0);
  const lentos = rows.filter(r=>r.accion==='Promo');
  const combo = precioActual ? redondear(precioActual*2*0.92, cfg.redondeo) : 0;
  const comboMargen = combo&&costoGlobal ? (combo-2*costoGlobal)/combo : null;
  // números del mes
  const fact=vs30.reduce((a,v)=>a+ventaTotal(v),0), gan=vs30.reduce((a,v)=>a+ventaGanancia(v),0);
  const desc=vs30.reduce((a,v)=>a+(Number(v.descuento)||0),0);
  const sinCosto=vs30.filter(v=>!Number(v.costoUnit)).length;
  const capital=rows.reduce((a,r)=>a+r.st*(r.costoHist||0),0), capitalRepo=rows.reduce((a,r)=>a+r.st*(r.costoRepo||0),0);
  const valorVenta=rows.reduce((a,r)=>a+r.st*(r.precio||0),0);
  const parado=rows.filter(r=>r.accion==='Promo').reduce((a,r)=>a+r.st*(r.costoHist||0),0);
  const deuda=totalDeuda(); const ds=deudas(); const deudaVieja=ds.filter(o=>o.dias>14).reduce((a,o)=>a+o.total,0);

  // consejos
  const tips=[];
  if(blue && ultTc && blue>ultTc*1.01){ const sub=(blue-ultTc)/ultTc; tips.push(['bad',`El dólar blue subió ${pct(sub)} desde tu última compra (${money(ultTc)} → ${money(blue)}). Reponer te sale más caro: revisá el precio de venta.`]); }
  if(blue && ultTc && blue<ultTc*0.99) tips.push(['ok',`El dólar bajó desde tu última compra (${money(ultTc)} → ${money(blue)}). Buen momento para reponer.`]);
  if(margenActual!=null && margenActual<0.15) tips.push(['bad',`Con el costo de reponer hoy (${money(costoGlobal)}) y tu precio de ${money(precioActual)}, ganás solo ${pct(margenActual)} por vape. Tenés que subir el precio.`]);
  else if(difPrecio>0.03) tips.push(['warn',`Para llegar a tu margen del ${cfg.margen}% el precio debería ser ${money(precioSug)} (hoy ${money(precioActual)}). Con tus ventas del mes (${unid30} u.) serían ≈${money((precioSug-precioActual)*unid30)} más de ganancia por mes.`]);
  else if(difPrecio<-0.03) tips.push(['ok',`Tu precio (${money(precioActual)}) deja más margen que tu objetivo. Si querés vender más, podrías bajar a ${money(precioSug)} y seguir en ${cfg.margen}%.`]);
  if(cfg.ref && precioSug>cfg.ref*1.03) tips.push(['warn',`El precio que necesitás (${money(precioSug)}) queda arriba de las tiendas online (${money(cfg.ref)}). Conviene negociar el costo con tu proveedor o aceptar un margen menor.`]);
  if(parado>0 && lentos.length) tips.push(['warn',`Tenés ${money(parado)} (a costo) parados en ${lentos.map(r=>r.p.sabor).join(', ')}. Como no podés bajar el precio de un sabor solo, ofrecé un combo: 2 vapes por ${money(combo)} (uno tiene que ser de estos)${comboMargen!=null?`, sigue dejando ${pct(comboMargen)}`:''}. Y no compres más de esos hasta liquidarlos.`]);
  if(fact && desc/ (fact+desc) > 0.05) tips.push(['warn',`En 30 días diste ${money(desc)} en descuentos (${pct(desc/(fact+desc))} de lo que hubieras facturado). Ojo que se come el margen.`]);
  if(deudaVieja>0) tips.push(['bad',`Te deben ${money(deudaVieja)} hace más de 2 semanas. Cobrá antes de seguir fiando.`]); else if(deuda>0) tips.push(['mid',`Tenés ${money(deuda)} en fiado. Mandá recordatorio desde la pestaña Fiado.`]);
  if(sinCosto) tips.push(['mid',`${sinCosto} venta${sinCosto>1?'s':''} del mes no tienen costo cargado: la ganancia real puede ser menor a la que ves.`]);
  if(fact && gan/fact>0 && gan/fact < cfg.margen/100 - 0.05) tips.push(['warn',`Tu margen real del mes es ${pct(gan/fact)}, por debajo de tu objetivo de ${cfg.margen}%.`]);
  if(!tips.length) tips.push(['ok','Todo en orden: precios alineados con tu costo y tu margen objetivo.']);
  return {cfg, blue, ultTc, usdProm, rows, precioActual, costoGlobal, precioSug, margenActual, margenSug, margenRef, difPrecio, unid30, combo, comboMargen, lentos, fact, gan, desc, capital, capitalRepo, valorVenta, parado, deuda, tips};
}
function textoAsesor(a){
  const L=[`Sos mi asesor financiero para un pequeño negocio de reventa de Elf Bar Ice King 40K en Buenos Aires. Pago la mercadería en dólares (blue). Analizá estos datos y decime qué precio único poner, qué sabores comprar, cuáles liquidar (con combos, no bajando el precio de un sabor) y cómo mejorar la ganancia. Sé concreto y con números.`,
  ``,`Dólar blue promedio hoy: ${a.blue?money(a.blue):'s/d'} · última compra a: ${a.ultTc?money(a.ultTc):'s/d'} · costo promedio US$ ${a.usdProm?a.usdProm.toFixed(2):'s/d'}`,
  `Precio de referencia del mercado online: ${money(a.cfg.ref)} · margen objetivo ${a.cfg.margen}%`,
  `Últimos 30 días: facturación ${money(a.fact)}, ganancia ${money(a.gan)}, descuentos ${money(a.desc)}, fiado pendiente ${money(a.deuda)}`,
  `Stock: ${money(a.capital)} a costo, ${money(a.valorVenta)} a precio de venta`,``,
  `Todos los sabores se venden al mismo precio: ${money(a.precioActual)}. Costo de reponer hoy: ${money(a.costoGlobal)}. No puedo poner precios distintos por sabor.`,``,
  `Sabor | stock | vendidas 30d`,
  ...a.rows.map(r=>`${r.p.sabor} | ${r.st} | ${r.v30}`)];
  return L.join('\n');
}
function viewAsesor(){
  const a=asesor(); const c=a.cfg;
  return `<section class="panel"><div class="panel-head"><div><h2>Asesor financiero</h2><span class="sub">Analiza tus costos en dólares, el blue de hoy, la rotación de cada sabor y tu margen objetivo.</span></div>
    <span class="sub">${a.blue?`Blue promedio hoy <b>${money(a.blue)}</b>`:(S.blueErr||'Buscando cotización…')}</span></div>
    <section class="kpis">
      <div class="kpi"><span class="l">Ganancia 30 días</span><span class="v num">${money(a.gan)}</span><span class="h">${a.fact?`margen real ${pct(a.gan/a.fact)} · objetivo ${c.margen}%`:'sin ventas'}</span></div>
      <div class="kpi"><span class="l">Capital en stock</span><span class="v num">${money(a.capital)}</span><span class="h">${a.capitalRepo&&a.capitalRepo!==a.capital?`reponerlo hoy cuesta ${money(a.capitalRepo)}`:'a costo de compra'}</span></div>
      <div class="kpi"><span class="l">Si vendés todo</span><span class="v num">${money(a.valorVenta)}</span><span class="h">ganancia potencial ${money(a.valorVenta-a.capital)}</span></div>
      <div class="kpi"><span class="l">Plata parada</span><span class="v num" style="color:${a.parado?'var(--warn)':'inherit'}">${money(a.parado)}</span><span class="h">en sabores que no rotan</span></div>
    </section>
  </section>
  <section class="panel"><h2>Lo que te recomiendo</h2>
    <div style="display:grid;gap:8px">${a.tips.map(([k,txt])=>`<div class="note" style="border-left:3px solid var(--${k==='mid'?'accent':k});color:var(--fg)">${esc(txt)}</div>`).join('')}</div>
  </section>
  <section class="panel"><div class="panel-head"><div><h2>Precio de venta</h2><span class="sub">Un solo precio para todos los sabores, calculado con el costo de reponer hoy (US$ × blue) + tu margen objetivo</span></div></div>
    <section class="kpis">
      <div class="kpi"><span class="l">Precio actual</span><span class="v num">${a.precioActual?money(a.precioActual):'—'}</span><span class="h">${a.margenActual!=null?`margen hoy ${pct(a.margenActual)}`:'cargá costos'}</span></div>
      <div class="kpi"><span class="l">Costo de reponer hoy</span><span class="v num">${a.costoGlobal?money(a.costoGlobal):'—'}</span><span class="h">${a.usdProm&&a.blue?`US$ ${a.usdProm.toFixed(2)} × ${money(a.blue)}`:'según costos en pesos'}</span></div>
      <div class="kpi"><span class="l">Precio sugerido</span><span class="v num" style="color:var(--accent)">${a.precioSug?money(a.precioSug):'—'}</span><span class="h">${a.margenSug!=null?`margen ${pct(a.margenSug)}${a.difPrecio?` · ${a.difPrecio>0?'+':''}${pct(a.difPrecio)} vs hoy`:''}`:''}</span></div>
      <div class="kpi"><span class="l">Tiendas online${a.cfg.refModo!=='manual'&&S.mercado?(a.cfg.refModo==='prom'?' (promedio)':' (más barato)'):''}</span><span class="v num">${money(a.cfg.ref)}</span><span class="h">${a.margenRef!=null?`con ese precio ganarías ${pct(a.margenRef)}`:''}</span></div>
    </section>
    ${a.precioSug && a.precioSug!==a.precioActual?`<div class="split"><button class="btn" data-ase-all data-v="${a.precioSug}">Poner ${money(a.precioSug)} a todos los sabores</button>${a.cfg.ref&&a.cfg.ref!==a.precioSug?`<button class="btn ghost" data-ase-all data-v="${a.cfg.ref}">Usar precio de mercado (${money(a.cfg.ref)})</button>`:''}</div>
    <p class="sub">Cambia el precio de todo el stock y de las próximas reposiciones. El catálogo y el mensaje de WhatsApp se actualizan solos.</p>`:'<p class="note">Tu precio ya está en el sugerido.</p>'}
  </section>
  <section class="panel"><div class="panel-head"><div><h2>Análisis por sabor</h2><span class="sub">Qué hacer con cada uno (el precio es el mismo para todos)</span></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Sabor</th><th class="r">Stock</th><th class="r">Vend. 30d</th><th class="r">Alcanza</th><th>Qué hacer</th></tr></thead><tbody>
    ${a.rows.slice().sort((x,y)=>y.v30-x.v30||y.st-x.st).map(r=>{ const k = r.accion==='Promo'?['Liquidar con combo','warn']: r.accion==='Demanda alta'?['Se vende rápido','ok']: r.st===0&&r.v30?['Reponer','bad']: r.st===0?['Sin stock','mid']:['Normal','mid'];
      const txt = r.accion==='Promo'? r.motivo.replace(/ Bajalo para recuperar la plata\.| Una promo lo mueve más rápido\./,' Metelo en un combo y no compres más por ahora.') : r.accion==='Demanda alta'? 'Es de los que más salen: que no te falte.' : r.st===0&&r.v30? 'Se vendió y no te queda: reponelo.' : r.motivo;
      return `<tr><td><b>${esc(r.p.sabor)}</b></td><td class="r num">${r.st}</td><td class="r num">${r.v30}</td><td class="r num">${r.dias!=null?r.dias+' d':'—'}</td><td><span class="pill ${k[1]}">${k[0]}</span> <span class="sub">${esc(txt)}</span></td></tr>`; }).join('')}
    </tbody></table></div>
  </section>
  <section class="panel"><h2>Ajustes del asesor</h2>
    <form class="form" id="f-ase">
      <label>Margen objetivo (%)<input type="number" id="ase-m" min="5" max="80" value="${c.margen}"></label>
      <label>Precio de mercado<select id="ase-modo"><option value="min" ${c.refModo==='min'?'selected':''}>Automático: el más barato</option><option value="prom" ${c.refModo==='prom'?'selected':''}>Automático: promedio de tiendas</option><option value="manual" ${c.refModo==='manual'?'selected':''}>Lo pongo yo</option></select></label>
      <label>Precio manual ($)<input type="number" id="ase-r" min="0" step="100" value="${c.refManual}" ${c.refModo!=='manual'?'disabled':''}></label>
      <label>Redondear a<select id="ase-red">${[100,500,1000].map(n=>`<option value="${n}" ${c.redondeo===n?'selected':''}>$${n}</option>`).join('')}</select></label>
      <button class="btn ghost" type="submit">Guardar ajustes</button>
    </form>
    <p class="sub">Margen = lo que te queda de cada venta sobre el precio.</p>
    <div class="note" style="color:var(--fg);display:grid;gap:8px">
      <div class="panel-head"><b>Precios de mercado</b><span class="sub">${S.mercado?.actualizado?`actualizado ${new Date(S.mercado.actualizado).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}`:(S.mercErr||'cargando…')}</span></div>
      ${S.mercado?.tiendas?.length?`<div class="split">${S.mercado.tiendas.map(t=>`<a class="pill mid" style="text-decoration:none" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.tienda)} · ${money(t.precio)}</a>`).join('')}</div>
      <span class="sub">Más barato ${money(S.mercado.minimo)} · promedio ${money(S.mercado.promedio)}${(S.mercado.historial||[]).length>1?(()=>{const h=S.mercado.historial; const a=h[h.length-2].minimo, b=h[h.length-1].minimo; return a&&b&&a!==b?` · ${b>a?'subió':'bajó'} ${pct(Math.abs(b-a)/a)} desde el ${h[h.length-2].fecha.slice(8,10)}/${h[h.length-2].fecha.slice(5,7)}`:'';})():''}</span>`:''}
      <span class="sub">Se buscan solos todos los días a las 8:47. Para buscarlos ya: tocá "Buscar ahora", en GitHub tocá <b>Run workflow</b> → <b>Run workflow</b>, esperá ~1 minuto y volvé a tocar "Recargar".</span>
      <div class="split"><a class="btn ghost sm" href="${MERCADO_RUN}" target="_blank" rel="noopener" style="text-decoration:none">Buscar ahora</a><button type="button" class="btn ghost sm" data-merc-reload>Recargar</button></div>
    </div>
  </section>
  <section class="panel"><div class="panel-head"><div><h2>Análisis con Claude</h2><span class="sub">Copia un resumen de tus números para pegarlo en Claude y pedirle un análisis más profundo.</span></div>
    <div class="split"><button class="btn ghost" data-ase-copy>Copiar datos</button><a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener" style="text-decoration:none">Abrir Claude</a></div></div>
  </section>`;
}
async function aplicarPrecio(pid, precio){
  const b=S.db.batch(); b.update(S.db.doc('productos/'+pid),{precio});
  const vivos=new Set(lotsOf(pid).filter(l=>l.restante>0 && !l.ini).map(l=>l.id));
  Object.values(S.compras).filter(c=>c.productoId===pid && vivos.has(c.id)).forEach(c=>b.update(S.db.doc('compras/'+c.id),{precioUnit:precio}));
  await b.commit();
}

const tcUsado = () => Number(S.kf.tc)||S.blue?.prom||0;

function viewCompras(){
  const admin=S.users[S.me]?.rol==='admin';
  const prods=Object.values(S.prods).sort((a,b)=>a.sabor.localeCompare(b.sabor));
  const list=Object.values(S.compras).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||(b.creado||0)-(a.creado||0));
  const inv=list.reduce((a,c)=>a+(Number(c.cantidad)||0)*(Number(c.costoUnit)||0),0);
  const invUsd=list.reduce((a,c)=>a+(Number(c.cantidad)||0)*(Number(c.costoUSD)||0),0);
  if(admin && S.kf.mon!=='ARS') cargarBlue();
  return `
  <section class="panel"><div class="panel-head"><h2>Registrar reposición</h2><span class="sub">Suma al stock del sabor. Si el costo o precio es distinto, queda separado</span></div>
  ${admin?`<form class="form" id="f-compra" autocomplete="off">
    <label>Fecha<input type="date" id="k-fecha" value="${esc(S.kf.fecha||today())}" required></label>
    <label>Sabor<select id="k-prod" required><option value="">Elegí…</option>${prods.map(p=>`<option value="${p.id}" ${S.kf.prod===p.id?'selected':''}>${esc(p.sabor)}</option>`).join('')}</select></label>
    <label>Cantidad<input type="number" id="k-cant" min="1" value="${esc(S.kf.cant||'1')}" required></label>
    <label>Pagado en<select id="k-mon"><option value="USD" ${S.kf.mon!=='ARS'?'selected':''}>Dólares (US$)</option><option value="ARS" ${S.kf.mon==='ARS'?'selected':''}>Pesos ($)</option></select></label>
    ${S.kf.mon!=='ARS'
      ? `<label>Costo unitario en US$<input type="number" id="k-usd" min="0" step="0.01" placeholder="US$" value="${esc(S.kf.usd||'')}"></label>
         <label>Dólar blue (promedio)<input type="number" id="k-tc" min="0" step="1" placeholder="${S.blue?S.blue.prom:'$'}" value="${esc(S.kf.tc||'')}"></label>`
      : `<label>Costo unitario<input type="number" id="k-costo" min="0" placeholder="$" value="${esc(S.kf.costo||'')}"></label>`}
    <label>Precio de venta<input type="number" id="k-precio" min="0" placeholder="$" value="${esc(S.kf.precio||'')}"></label>
    <button class="btn" type="submit">Guardar compra</button>
  </form>
  ${S.kf.mon!=='ARS'?`<div class="note" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
    <span>${S.blue?`Dólar blue hoy: compra <b>${money(S.blue.compra)}</b> · venta <b>${money(S.blue.venta)}</b> → promedio <b>${money(S.blue.prom)}</b>${S.blue.fecha?` <span class="sub">(act. ${new Date(S.blue.fecha).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})})</span>`:''}`:(S.blueErr||'Buscando cotización del dólar blue…')}
      ${Number(S.kf.usd)>0&&tcUsado()?`<br>Costo en pesos: <b class="num">${usd(Number(S.kf.usd))} × ${money(tcUsado())} = ${money(Math.round(Number(S.kf.usd)*tcUsado()))}</b> por unidad${Number(S.kf.cant)>1?` · total <b class="num">${money(Math.round(Number(S.kf.usd)*tcUsado()*Number(S.kf.cant)))}</b>`:''}`:''}</span>
    <button type="button" class="btn ghost sm" data-blue-refresh>Actualizar cotización</button></div>
    <p class="sub">La cotización es el promedio entre compra y venta del blue (la misma que muestra DolarHoy). Si pagaste a otro valor, escribilo en "Dólar blue". Queda guardada en cada compra.</p>`:''}`:`<p class="note">Solo el administrador registra compras de mercadería.</p>`}</section>
  <section class="panel"><div class="panel-head"><div><h2>Compras</h2><span class="sub num">Invertido: ${money(inv)}${invUsd?` · ${usd(invUsd)} en compras en dólares`:''}</span></div></div>
  ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Sabor</th><th class="r">Cant.</th><th class="r">Costo u.</th><th class="r">Precio u.</th><th class="r">Total</th><th>Cargó</th>${admin?'<th></th>':''}</tr></thead><tbody>
  ${list.map(c=>`<tr><td class="num">${fmtDate(c.fecha)}</td><td>${esc(prodName(c.productoId))}</td><td class="r num">${c.cantidad}</td><td class="r">${admin?cInput(c,'costoUnit'):money(c.costoUnit)}${c.costoUSD?`<br><span class="sub num" style="white-space:nowrap">${usd(c.costoUSD)} × ${money(c.tc)}</span>`:''}</td><td class="r">${admin?cInput(c,'precioUnit'):money(c.precioUnit!=null?c.precioUnit:S.prods[c.productoId]?.precio)}</td><td class="r num">${money((c.cantidad||0)*(c.costoUnit||0))}</td><td>${esc(userName(c.vendedor))}</td>${admin?`<td class="r">${delBtn('compras',c.id)}</td>`:''}</tr>`).join('')}
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
  if(c==='sin-blue') return 'Falta la cotización del dólar. Probá en unos segundos.';
  if(c==='unavailable') return 'Sin conexión: se va a guardar cuando vuelva internet.';
  return 'No se pudo guardar. Probá de nuevo.';
}
async function save(fn, ok){ try{ await fn(); if(ok) toast(ok); } catch(err){ console.error(err); toast(writeErr(err)); } }

function bindApp(){
  bindLogout();
  const q=(sel,fn)=>document.querySelectorAll(sel).forEach(fn);
  q('[data-bulk-c]',cb=>cb.onchange=()=>{ S.bulkSel=S.bulkSel||new Set(); cb.checked?S.bulkSel.add(cb.dataset.bulkC):S.bulkSel.delete(cb.dataset.bulkC); render(); });
  q('[data-bulk-all]',b=>b.onclick=()=>{ S.bulkSel=new Set(conTel().map(c=>c.id)); render(); });
  q('[data-bulk-pc]',b=>b.onclick=()=>{ S.bulkSel=new Set(paraContactarIds()); render(); });
  q('[data-bulk-none]',b=>b.onclick=()=>{ S.bulkSel=new Set(); render(); });
  q('[data-bulk-go]',b=>b.onclick=()=>startBulk([...(S.bulkSel||[])]));
  q('[data-bulk-pc-go]',b=>b.onclick=()=>startBulk(paraContactarIds()));
  q('[data-bulk-next]',a=>a.onclick=()=>{ setTimeout(()=>{ if(S.bulk){ S.bulk.i++; render(); } },400); });
  q('[data-bulk-skip]',b=>b.onclick=()=>{ S.bulk.i++; render(); });
  q('[data-bulk-end]',b=>b.onclick=()=>{ S.bulk=null; S.bulkSel=null; render(); });
  q('[data-bulk-copy]',b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(mensajeStock()); toast('Mensaje copiado'); }catch(e){ toast('No se pudo copiar'); } });
  const cm=document.getElementById('cobro-medio'); if(cm) cm.onchange=()=>{ S.cobroMedio=cm.value; };
  q('[data-cobrar]',b=>b.onclick=()=>{ S.confirm='cobrar/'+b.dataset.cobrar; render(); });
  q('[data-cobrar-yes]',b=>b.onclick=async()=>{ const cid=b.dataset.cobrarYes; S.confirm=null; const vs=Object.values(S.ventas).filter(v=>v.clienteId===cid&&esFiado(v));
    await save(async()=>{ const bt=S.db.batch(); vs.forEach(v=>bt.update(S.db.doc('ventas/'+v.id),{medio:S.cobroMedio, fiado:true, cobrado:today(), cobradoPor:S.me})); await bt.commit(); }, `Cobrado: ${money(vs.reduce((a,v)=>a+ventaTotal(v),0))} de ${clientName(cid)}`); render(); });
  q('[data-cobrar-v]',b=>b.onclick=()=>{ const v=S.ventas[b.dataset.cobrarV]; save(()=>S.db.doc('ventas/'+v.id).update({medio:S.cobroMedio, fiado:true, cobrado:today(), cobradoPor:S.me}), `Cobrado ${money(ventaTotal(v))} en ${S.cobroMedio}`); });
  const ps=document.getElementById('ped-sem'); if(ps) ps.onchange=()=>{ S.pedSem=Number(ps.value)||2; ssSet('cv_pedsem',String(S.pedSem)); render(); };
  q('[data-ped-copy]',b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(textoPedido(pedido())); toast('Pedido copiado'); }catch(e){ toast('No se pudo copiar'); } });
  q('[data-cat-copy]',b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(catalogoURL()); toast('Link copiado'); }catch(e){ toast('No se pudo copiar'); } });
  const fcat=document.getElementById('f-cat');
  if(fcat) fcat.onsubmit=e=>{ e.preventDefault(); const txt=document.getElementById('cat-tel').value.trim(); const num=waNumber(txt);
    if(!num) return toast('Ese número no parece un celular válido');
    save(()=>S.db.doc('catalogo/actual').set({telefono:num, telefonoTxt:txt, titulo:document.getElementById('cat-tit').value.trim()||MSG_HEADER, promo:document.getElementById('cat-promo').value.trim(), activo:document.getElementById('cat-act').checked, items:catalogoItems(), actualizado:Date.now()},{merge:true}), 'Catálogo publicado'); };
  if(S.tab==='asesor'){ cargarBlue(); cargarMercado(); }
  q('[data-ase-all]',b=>b.onclick=async()=>{ const v=Number(b.dataset.v); if(!(v>0)) return; const ids=Object.keys(S.prods);
    await save(async()=>{ for(const id of ids) await aplicarPrecio(id, v); }, `Precio ${money(v)} aplicado a los ${ids.length} sabores`); });
  q('[data-ase-copy]',b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(textoAsesor(asesor())); toast('Datos copiados: pegalos en Claude'); }catch(e){ toast('No se pudo copiar'); } });
  const fase=document.getElementById('f-ase'); if(fase) fase.onsubmit=e=>{ e.preventDefault();
    ssSet('cv_asesor', JSON.stringify({margen:Math.min(80,Math.max(5,Number(document.getElementById('ase-m').value)||35)), ref:Number(document.getElementById('ase-r').value)||aseCfg().refManual||0, refModo:document.getElementById('ase-modo').value, redondeo:Number(document.getElementById('ase-red').value)||500})); toast('Ajustes guardados'); render(); };
  const amod=document.getElementById('ase-modo'); if(amod) amod.onchange=()=>{ const r=document.getElementById('ase-r'); if(r) r.disabled = amod.value!=='manual'; };
  q('[data-merc-reload]',b=>b.onclick=()=>{ toast('Buscando precios guardados…'); cargarMercado(true); });
  q('[data-cli-goedit]',b=>b.onclick=()=>{ S.tab='clientes'; ssSet('cv_tab','clientes'); S.editCli=b.dataset.cliGoedit; render(); document.getElementById('ec-contacto')?.focus(); });
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ S.tab=b.dataset.tab; S.confirm=null; S.editCli=null; ssSet('cv_tab',S.tab); render(); window.scrollTo(0,0); });
  const per=document.getElementById('period'); if(per) per.onchange=()=>{ S.period=per.value; ssSet('cv_period',S.period); render(); };
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ S.confirm=b.dataset.del; render(); });
  document.querySelectorAll('[data-del-no]').forEach(b=>b.onclick=()=>{ S.confirm=null; render(); });
  document.querySelectorAll('[data-del-yes]').forEach(b=>b.onclick=()=>{ const path=b.dataset.delYes; S.confirm=null; save(()=>S.db.doc(path).delete(),'Borrado'); });

  const vcli=document.getElementById('v-cli');
  if(vcli) vcli.onchange=()=>{ if(vcli.value==='__new'){ S.ventaClienteNuevo=true; S.vf.cli=''; render(); document.getElementById('v-cli-nuevo')?.focus(); } else S.vf.cli=vcli.value; };
  const vcn=document.getElementById('v-cli-nuevo'); if(vcn) vcn.oninput=()=>S.vf.cliNuevo=vcn.value;
  const vfe=document.getElementById('v-fecha'); if(vfe) vfe.onchange=()=>S.vf.fecha=vfe.value;
  const vme=document.getElementById('v-medio'); if(vme) vme.onchange=()=>S.vf.medio=vme.value;
  const vde=document.getElementById('v-desc'); if(vde) vde.oninput=()=>{ S.vf.desc=vde.value; refreshTotals(); };
  const vdt=document.getElementById('v-desc-tipo'); if(vdt) vdt.onchange=()=>{ S.vf.descTipo=vdt.value; refreshTotals(); };
  const refreshTotals=()=>{ S.vLines.forEach((l,i)=>{ const el=document.getElementById('vl-sub-'+i); if(el) el.textContent=money(lineTotal(l)); });
    const sub=S.vLines.reduce((a,l)=>a+lineTotal(l),0); const dd=descDe(sub);
    const t=document.getElementById('vl-total'); if(t) t.textContent=money(sub-dd);
    const dt=document.getElementById('vl-desc-txt'); if(dt) dt.textContent = dd?`Subtotal ${money(sub)} · Descuento −${money(dd)}`:'';
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
    const subT=items.reduce((a,x)=>a+x.cant*x.precio,0); const descT=descDe(subT);
    // reparte el descuento entre los sabores, proporcional a cada subtotal
    let resto=descT; items.forEach((x,k)=>{ const part = k===items.length-1 ? resto : Math.round(descT*(x.cant*x.precio)/(subT||1)); x.desc=Math.min(part, x.cant*x.precio); resto-=x.desc; });
    let ok=false;
    await save(async()=>{ const b=S.db.batch();
      items.forEach((x,k)=>{ const lote=x.vg.lots.find(l=>l.restante>0)||x.vg.lots[0];
        const d={fecha, clienteId:cid, productoId:x.pid, cantidad:x.cant, precioUnit:x.precio, costoUnit:x.vg.costo, loteId:lote.id, medio, vendedor:S.me, creado:now+k};
        if(x.desc>0) d.descuento=x.desc;
        if(pedidoId) d.pedidoId=pedidoId; b.set(S.db.collection('ventas').doc(), d); });
      await b.commit(); ok=true; },
      (items.length>1 ? `Venta guardada: ${items.length} sabores, ${units} u. para ${clientName(cid)}` : `Venta guardada: ${items[0].cant} × ${prodName(items[0].pid)}`) + (descT?` (descuento ${money(descT)})`:''));
    if(ok){ S.ventaClienteNuevo=false; S.vLines=[newLine()]; S.vf={fecha, medio}; }
    render();
  };

  const fp=document.getElementById('f-prod');
  if(fp) fp.onsubmit=e=>{ e.preventDefault(); const v=id=>document.getElementById(id).value;
    const sabor=v('p-sabor').trim(); if(!sabor) return;
    if(Object.values(S.prods).some(p=>p.sabor.toLowerCase()===sabor.toLowerCase())) return toast('Ese sabor ya existe');
    const pu=Number(v('p-usd'))||0; const bl=S.blue?.prom||0;
    if(pu && !bl) return toast('Todavía no cargó la cotización del dólar. Probá en unos segundos');
    const extraU = pu ? {costoUSD:pu, tc:bl} : {};
    save(()=>S.db.collection('productos').add({sabor, modelo:v('p-modelo').trim(), puffs:Number(v('p-puffs'))||0, costo: pu? Math.round(pu*bl) : (Number(v('p-costo'))||0), ...extraU, precio:Number(v('p-precio'))||0, stockInicial:Number(v('p-stock'))||0, stockMin:Number(v('p-min'))||0, creado:Date.now()}), 'Sabor agregado'); };
  if(S.tab==='stock') cargarBlue();
  q('[data-ren]',b=>b.onclick=()=>{ S.renProd=b.dataset.ren; render(); const i=document.getElementById('ren-in'); if(i){ i.focus(); i.select(); } });
  q('[data-ren-cancel]',b=>b.onclick=()=>{ S.renProd=null; render(); });
  const renSave=id=>{ const nuevo=(document.getElementById('ren-in')?.value||'').trim(); const viejo=S.prods[id]?.sabor;
    if(!nuevo) return toast('Escribí un nombre'); if(nuevo===viejo){ S.renProd=null; return render(); }
    if(Object.values(S.prods).some(p=>p.id!==id && p.sabor.toLowerCase()===nuevo.toLowerCase())) return toast('Ya hay un sabor con ese nombre');
    S.renProd=null; document.activeElement?.blur(); save(()=>S.db.doc('productos/'+id).update({sabor:nuevo}), `"${viejo}" ahora es "${nuevo}" en toda la planilla`); render(); };
  q('[data-ren-save]',b=>b.onclick=()=>renSave(b.dataset.renSave));
  const rin=document.getElementById('ren-in'); if(rin) rin.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); renSave(S.renProd); } else if(e.key==='Escape'){ S.renProd=null; render(); } };
  const setUsd=async(ids,u)=>{ const bl=S.blue?.prom||0; if(!bl) throw Object.assign(new Error('sin cotización'),{code:'sin-blue'});
    const b=S.db.batch(); ids.forEach(id=>b.update(S.db.doc('productos/'+id),{costoUSD:u, costo:Math.round(u*bl), tc:bl})); await b.commit(); };
  q('[data-usd]',inp=>inp.onchange=()=>{ const id=inp.dataset.usd, u=Number(inp.value)||0; if(!(u>0)) return; if(Number(S.prods[id]?.costoUSD)===u) return;
    if(!S.blue) return toast('Todavía no cargó la cotización del dólar');
    save(()=>setUsd([id],u), `${prodName(id)}: ${usd(u)} = ${money(Math.round(u*S.blue.prom))}`); });
  q('[data-usd-all]',b=>b.onclick=()=>{ const u=Number(document.getElementById('usd-all').value)||0; if(!(u>0)) return toast('Poné el costo en dólares');
    if(!S.blue) return toast('Todavía no cargó la cotización del dólar'); const ids=Object.keys(S.prods);
    save(()=>setUsd(ids,u), `Costo ${usd(u)} (${money(Math.round(u*S.blue.prom))}) en los ${ids.length} sabores`); });
  document.querySelectorAll('[data-edit]').forEach(inp=>inp.onchange=()=>{ const id=inp.dataset.edit, f=inp.dataset.f; const val=Number(inp.value)||0;
    if((Number(S.prods[id]?.[f])||0)===val) return; save(()=>S.db.doc('productos/'+id).update({[f]:val}), f==='costo'?'Costo actualizado':'Precio actualizado'); });

  document.querySelectorAll('[data-cli-edit]').forEach(b=>b.onclick=()=>{ S.editCli=b.dataset.cliEdit; S.confirm=null; render(); document.getElementById('ec-nombre')?.focus(); });
  document.querySelectorAll('[data-cli-cancel]').forEach(b=>b.onclick=()=>{ S.editCli=null; render(); });
  const saveCli=async id=>{ const nombre=document.getElementById('ec-nombre').value.trim(); const contacto=document.getElementById('ec-contacto').value.trim();
    if(!nombre) return toast('El nombre no puede quedar vacío');
    if(Object.values(S.clients).some(c=>c.id!==id && c.nombre.toLowerCase()===nombre.toLowerCase())) return toast('Ya existe un cliente con ese nombre');
    const c=S.clients[id]; if(c && c.nombre===nombre && (c.contacto||'')===contacto){ S.editCli=null; return render(); }
    S.editCli=null; document.activeElement?.blur(); await save(()=>S.db.doc('clientes/'+id).update({nombre, contacto, editado:Date.now(), editadoPor:S.me}), 'Cliente actualizado'); render(); };
  document.querySelectorAll('[data-cli-save]').forEach(b=>b.onclick=()=>saveCli(b.dataset.cliSave));
  ['ec-nombre','ec-contacto'].forEach(id=>{ const el=document.getElementById(id); if(el) el.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); saveCli(S.editCli); } else if(e.key==='Escape'){ S.editCli=null; render(); } }; });

  const fc=document.getElementById('f-cli');
  if(fc) fc.onsubmit=e=>{ e.preventDefault(); const nombre=document.getElementById('c-nombre').value.trim(); if(!nombre) return;
    if(Object.values(S.clients).some(c=>c.nombre.toLowerCase()===nombre.toLowerCase())) return toast('Ya existe un cliente con ese nombre');
    save(()=>S.db.collection('clientes').add({nombre, contacto:document.getElementById('c-contacto').value.trim(), creado:Date.now(), creadoPor:S.me}), 'Cliente agregado'); };

  const fk=document.getElementById('f-compra');
  if(fk) fk.onsubmit=e=>{ e.preventDefault(); const pid=document.getElementById('k-prod').value; const cant=parseInt(document.getElementById('k-cant').value,10);
    if(!pid||!(cant>0)) return toast('Elegí sabor y cantidad');
    const p=S.prods[pid]; const kp=document.getElementById('k-precio').value; const enUsd=S.kf.mon!=='ARS';
    const kc=enUsd?'':document.getElementById('k-costo').value;
    let costo=kc!==''?Number(kc)||0:Number(p?.costo)||0; const precio=kp!==''?Number(kp)||0:Number(p?.precio)||0;
    const extra={};
    if(enUsd){ const u=Number(document.getElementById('k-usd').value)||0; const tc=tcUsado();
      if(!(u>0)) return toast('Poné el costo en dólares'); if(!(tc>0)) return toast('Falta la cotización del dólar');
      costo=Math.round(u*tc); Object.assign(extra,{moneda:'USD', costoUSD:u, tc, tcFuente: Number(S.kf.tc)?'manual':'blue promedio (DolarHoy)'}); }
    const otros=variantsOf(pid).filter(g=>g.restante>0&&(g.costo!==costo||g.precio!==precio));
    save(()=>S.db.collection('compras').add({fecha:document.getElementById('k-fecha').value, productoId:pid, cantidad:cant, costoUnit:costo, precioUnit:precio, ...extra, vendedor:S.me, creado:Date.now()}).then(()=>{ S.kf={mon:S.kf.mon, tc:S.kf.tc, fecha:S.kf.fecha}; render(); }),
      `Sumadas ${cant} de ${prodName(pid)}`+(otros.length?' · quedan separadas por tener otro costo/precio':'')); };
  const kprod=document.getElementById('k-prod');
  if(kprod) kprod.onchange=()=>{ S.kf.prod=kprod.value; const ls=lotsOf(kprod.value); const last=ls[ls.length-1]; if(!last) return;
    const lastC=Object.values(S.compras).filter(c=>c.productoId===kprod.value&&c.costoUSD).sort((a,b)=>(b.creado||0)-(a.creado||0))[0];
    if(last.precio) S.kf.precio=String(last.precio);
    if(S.kf.mon==='ARS'){ if(last.costo) S.kf.costo=String(last.costo); } else if(Number(S.prods[kprod.value]?.costoUSD)) S.kf.usd=String(S.prods[kprod.value].costoUSD); else if(lastC) S.kf.usd=String(lastC.costoUSD);
    render(); };
  [['k-fecha','fecha'],['k-cant','cant'],['k-usd','usd'],['k-tc','tc'],['k-costo','costo'],['k-precio','precio']].forEach(([id,k])=>{ const el=document.getElementById(id); if(el) el.oninput=()=>{ S.kf[k]=el.value;
    if(k==='usd'||k==='tc'||k==='cant'){ clearTimeout(S._kt); S._kt=setTimeout(()=>{ const a=document.activeElement?.id, pos=document.activeElement?.selectionStart; render(); const e2=document.getElementById(a); if(e2){ e2.focus(); } },500); } }; });
  const kmon=document.getElementById('k-mon'); if(kmon) kmon.onchange=()=>{ S.kf.mon=kmon.value; ssSet('cv_kmon',kmon.value); render(); };
  q('[data-blue-refresh]',b=>b.onclick=()=>{ S.kf.tc=''; cargarBlue(true); toast('Actualizando cotización…'); });
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
    if(first && m[uid]){ sub('productos','prods'); sub('clientes','clients'); sub('ventas','ventas'); sub('compras','compras');
      unsubs.push(S.db.doc('catalogo/actual').onSnapshot(d=>{ S.catalogo=d.exists?d.data():null; S.catReady=true; S.catErr=null; scheduleRender(); }, err=>{ S.catErr=err.code||'error'; S.catReady=true; scheduleRender(); })); }
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
