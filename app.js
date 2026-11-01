(function(){
"use strict";
const C = window.APP_CONFIG;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const app = document.getElementById("app"), nav = document.getElementById("nav"), toastEl = document.getElementById("toast");
let me = null, prof = null, provider = null;

// ---- safe DOM helpers (no innerHTML anywhere => XSS-safe) ----
function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})){
    if (k==="class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v!==false && v!=null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k!=null && k!==false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function render(...n){ app.replaceChildren(...n.flat()); }
let tt; function toast(m){ toastEl.textContent = m; toastEl.classList.add("on"); clearTimeout(tt); tt=setTimeout(()=>toastEl.classList.remove("on"),3500); }
const fa = n => Number(n).toLocaleString("fa-IR");
const fdt = d => new Date(d).toLocaleString("fa-IR");
const ERR = {not_authenticated:"اول وارد شو",only_customers:"فقط مشتری‌ها می‌تونن سفارش بدن",invalid_service:"این خدمت درست نیست",invalid_district:"اسم محله رو درست بنویس",invalid_address:"آدرس کامل نیست",invalid_time:"این زمان درست نیست",online_not_available:"پرداخت آنلاین هنوز راه نیفتاده",too_many_open_requests:"هم‌زمان بیشتر از ۵ سفارش باز نمی‌شه داشت",rate_limited:"یه کم آروم‌تر، چند ثانیه صبر کن",not_approved_provider:"هنوز تأییدت نکردن",cannot_accept:"این سفارش دیگه آزاد نیست",invalid_transition:"الان نمی‌شه این کار رو کرد",forbidden:"اجازه‌ش رو نداری",payment_required:"اول باید پرداخت بشه",insufficient_balance:"موجودی کیف پولت کافی نیست",invalid_state:"وضعیت سفارش اجازه نمی‌ده"};
function err(e){ const m = (e && e.message) || ""; for (const k in ERR) if (m.includes(k)) return ERR[k]; return "یه مشکلی پیش اومد، دوباره امتحان کن"; }
async function run(fn, ok){ try{ const r = await fn(); if (r && r.error) throw r.error; if (ok) toast(ok); return r; }catch(e){ toast(err(e)); return null; } }

const STATUS = {open:"منتظر یکی که قبول کنه",accepted:"یکی قبول کرد",in_progress:"داره انجام می‌شه",completed:"تموم شد",cancelled:"لغو شد"};
const PAY = {cash:"نقد یا کارت دم در",online:"آنلاین",wallet:"کیف پول"};

// ---- auth with client-side login throttle (server also rate-limits) ----
let fails = 0, lockUntil = 0;
function authView(mode){
  const f = h("form",{class:"card v"});
  const em = h("input",{type:"email",required:"",autocomplete:"email",maxlength:"120"});
  const pw = h("input",{type:"password",required:"",minlength:"8",maxlength:"72",autocomplete: mode==="up"?"new-password":"current-password"});
  const nm = h("input",{maxlength:"80",minlength:"2"}), ph = h("input",{inputmode:"numeric",pattern:"09[0-9]{9}",maxlength:"11",placeholder:"09123456789"});
  const role = h("select",{},h("option",{value:"customer"},"خدمات می‌خوام"),h("option",{value:"provider"},"خودم خدمات می‌دم"));
  const bn = h("input",{maxlength:"80",placeholder:"مثلاً کارواش من"});
  f.append(h("h2",{},mode==="up"?"بریم یه حساب بسازیم":"خوش برگشتی 👋"));
  if (mode==="up") f.append(h("label",{},"اسمت چیه؟"),nm,h("label",{},"شماره موبایلت"),ph,h("label",{},"می‌خوای چیکار کنی؟"),role,h("label",{},"اسم کسب‌وکارت (اگه خدمات می‌دی)"),bn);
  f.append(h("label",{},"ایمیل"),em,h("label",{},"رمز (حداقل ۸ تا حرف)"),pw);
  const btn = h("button",{type:"submit"},mode==="up"?"ثبت‌نامم کن":"بزن بریم");
  f.append(h("div",{class:"row"},btn,h("button",{type:"button",class:"sec",onclick:()=>authView(mode==="up"?"in":"up")},mode==="up"?"قبلاً ثبت‌نام کردم":"حساب ندارم، می‌خوام بسازم")));
  if (mode==="in") f.append(h("div",{class:"row"},h("button",{type:"button",class:"sec",onclick:async()=>{ if(!em.value) return toast("اول ایمیلت رو بنویس"); await run(()=>sb.auth.resetPasswordForEmail(em.value),"اگه این ایمیل ثبت شده باشه، لینک بازیابی براش میره"); }},"رمزم یادم رفته")));
  f.addEventListener("submit", async ev=>{
    ev.preventDefault();
    if (Date.now()<lockUntil) return toast("چند ثانیه صبر کن بعد دوباره امتحان کن");
    btn.disabled = true;
    try{
      if (mode==="up"){
        const {error} = await sb.auth.signUp({email:em.value.trim(),password:pw.value,options:{data:{full_name:nm.value,phone:ph.value,role:role.value,business_name:bn.value}}});
        if (error) throw error; toast("ثبت‌نام شدی! اگه ایمیل تأیید اومد، تأییدش کن");
      } else {
        const {error} = await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value});
        if (error){ fails++; if (fails>=5){ lockUntil = Date.now()+30000*Math.min(fails-4,10); } throw error; }
        fails = 0;
      }
    }catch(e){ toast(mode==="in"?"ایمیل یا رمزت درست نیست":"ثبت‌نام نشد؛ اطلاعاتت رو یه بار دیگه چک کن"); }
    btn.disabled = false;
  });
  const hero = h("div",{class:"hero"},h("div",{class:"big"},"ماشینت رو بسپر، خودشون میان 🚗"),h("p",{},"کارواش سیار و تعویض روغن سیار؛ تو خونه یا پارکینگ شرکت. لازم نیست جایی بری."));
  render(hero,f);
}

function setNav(items){ nav.replaceChildren(...items.map(([t,fn])=>h("button",{class:"sec",onclick:fn},t)), h("button",{class:"sec",onclick:()=>sb.auth.signOut()},"خروج")); }

// ---- customer ----
async function customerHome(){
  setNav([["خانه",customerHome],["سفارش‌هام",myRequests],["کیف پول",walletView]]);
  const {data:cats} = await sb.from("categories").select("id,name_fa,description_fa,icon").order("sort");
  render(h("h2",{},"امروز چی لازم داری؟"), h("div",{class:"grid"}, (cats||[]).map((c,i)=>h("div",{class:"card cat "+["g","b","p","v"][i%4],tabindex:"0",role:"button",onclick:()=>requestForm(c),onkeydown:e=>{if(e.key==="Enter")requestForm(c)}},h("div",{class:"ic"},c.icon||"🛠️"),h("b",{},c.name_fa),h("div",{class:"mut"},c.description_fa||"")))));
}
async function requestForm(cat){
  const {data:svcs} = await sb.from("services").select("id,name_fa,price,duration_min").eq("category_id",cat.id).order("price");
  const sv = h("select",{required:""},(svcs||[]).map(s=>h("option",{value:s.id},`${s.name_fa} — ${fa(s.price)} تومان`)));
  const di = h("input",{required:"",minlength:"2",maxlength:"60"}), ad = h("textarea",{required:"",minlength:"5",maxlength:"300"});
  const dt = h("input",{type:"datetime-local",required:""}), ve = h("input",{maxlength:"100"}), no = h("textarea",{maxlength:"500"});
  const pm = h("select",{},h("option",{value:"cash"},PAY.cash),h("option",{value:"wallet"},PAY.wallet+" (همین الان پرداخت می‌شه)"));
  const btn = h("button",{type:"submit"},"درخواست بده");
  const f = h("form",{class:"card g"},h("h2",{},cat.name_fa),h("label",{},"کدوم خدمت؟"),sv,h("label",{},"تو کدوم محله‌ای؟"),di,h("label",{},"آدرس دقیق (فقط کسی که قبول کنه می‌بینه)"),ad,h("label",{},"کی بیاد؟"),dt,h("label",{},"ماشینت چیه؟ (مدل یا پلاک)"),ve,h("label",{},"حرف دیگه‌ای هست؟"),no,h("label",{},"چطوری حساب کنی؟"),pm,h("div",{class:"row"},btn));
  f.addEventListener("submit", async e=>{
    e.preventDefault(); btn.disabled=true;
    const r = await run(()=>sb.rpc("create_request",{p_service_id:sv.value,p_district:di.value,p_address:ad.value,p_lat:null,p_lng:null,p_scheduled_at:new Date(dt.value).toISOString(),p_vehicle:ve.value||null,p_notes:no.value||null,p_payment_method:pm.value}),"درخواستت ثبت شد ✅");
    btn.disabled=false; if (r) { if (pm.value==="wallet") await run(()=>sb.rpc("pay_request_wallet",{p_request_id:r.data}),"از کیف پولت کم شد"); myRequests(); }
  });
  render(f);
}
async function myRequests(){
  const col = prof.role==="provider" ? "provider_id" : "customer_id";
  const {data} = await sb.from("requests").select("id,status,price,district,address,scheduled_at,payment_method,pay_status,service_id,provider_id").eq(col,me.id).order("created_at",{ascending:false}).limit(50);
  const list = (data||[]).map(r=>{
    const acts = [];
    if (prof.role==="customer"){
      if (["open","accepted"].includes(r.status)) acts.push(h("button",{class:"danger",onclick:async()=>{ if(await run(()=>sb.rpc("set_request_status",{p_request_id:r.id,p_new:"cancelled"}),"لغو شد")) myRequests(); }},"لغو"));
      if (r.pay_status==="unpaid" && ["open","accepted","in_progress"].includes(r.status)) acts.push(h("button",{class:"sec",onclick:async()=>{ if(await run(()=>sb.rpc("pay_request_wallet",{p_request_id:r.id}),"پرداخت شد")) myRequests(); }},"پرداخت از کیف پول"));
      if (r.status==="completed") acts.push(h("button",{onclick:()=>reviewForm(r)},"امتیاز بده"));
    } else {
      if (r.status==="accepted") acts.push(h("button",{onclick:async()=>{ if(await run(()=>sb.rpc("set_request_status",{p_request_id:r.id,p_new:"in_progress"}),"شروع شد")) myRequests(); }},"رسیدم، شروع"), h("button",{class:"sec",onclick:async()=>{ if(await run(()=>sb.rpc("set_request_status",{p_request_id:r.id,p_new:"open"}),"رها شد")) myRequests(); }},"نمی‌تونم برم"));
      if (r.status==="in_progress") acts.push(h("button",{onclick:async()=>{ if(await run(()=>sb.rpc("set_request_status",{p_request_id:r.id,p_new:"completed"}),"تکمیل شد")) myRequests(); }},"کار تموم شد"));
    }
    return h("div",{class:"card b"},h("span",{class:"badge"},STATUS[r.status]),h("div",{},`${r.district} — ${fa(r.price)} تومان`),h("div",{class:"mut"},`${fdt(r.scheduled_at)} · ${PAY[r.payment_method]} · ${r.pay_status==="paid"?"پول رو دادی":"هنوز پرداخت نشده"}`),prof.role==="provider"?h("div",{class:"mut"},r.address):null,h("div",{class:"row"},acts));
  });
  render(h("h2",{},prof.role==="provider"?"کارهام":"سفارش‌هام"), list.length?list:h("p",{class:"mut"},"فعلاً چیزی نیست."));
}
function reviewForm(r){
  const st = h("select",{},[5,4,3,2,1].map(n=>h("option",{value:n},"★".repeat(n)))), cm = h("textarea",{maxlength:"500"});
  const f = h("form",{class:"card p"},h("h2",{},"کارش چطور بود؟"),st,h("label",{},"اگه خواستی یه چیزی بنویس"),cm,h("div",{class:"row"},h("button",{type:"submit"},"ثبت کن")));
  f.addEventListener("submit",async e=>{ e.preventDefault(); if (await run(()=>sb.rpc("submit_review",{p_request_id:r.id,p_rating:+st.value,p_comment:cm.value}),"مرسی از نظرت 🙏")) myRequests(); });
  render(f);
}
async function walletView(){
  const [{data:b},{data:t}] = await Promise.all([sb.from("wallet_balances").select("balance").eq("user_id",me.id).maybeSingle(), sb.from("wallet_transactions").select("amount,kind,note,created_at").eq("user_id",me.id).order("created_at",{ascending:false}).limit(30)]);
  render(h("div",{class:"card g"},h("h2",{},"کیف پولت"),h("b",{},fa(b?b.balance:0)+" تومان"),h("p",{class:"mut"},"فعلاً شارژ کیف پول رو پشتیبانی انجام می‌ده.")), (t||[]).map(x=>h("div",{class:"card"},`${fa(x.amount)} — ${x.note||x.kind}`,h("div",{class:"mut"},fdt(x.created_at)))));
}

// ---- provider ----
async function providerHome(){
  setNav([["سفارش‌های باز",providerHome],["کارهام",myRequests],["پروفایل",providerProfile],["کیف پول",walletView]]);
  if (!provider || provider.status!=="approved") return render(h("div",{class:"card p"},h("h2",{},"منتظر تأیید باش"),h("p",{},"بعد از اینکه مدیر تأییدت کنه، کارت شروع می‌شه."),h("button",{onclick:providerProfile},"پروفایلت رو کامل کن")));
  const r = await run(()=>sb.rpc("list_open_requests"));
  const d = (r&&r.data)||[];
  render(h("h2",{},"سفارش‌های باز"), d.length?d.map(x=>h("div",{class:"card g"},h("b",{},x.category_name+" — "+x.service_name),h("div",{},`${x.district} · ${fa(x.price)} تومان`),h("div",{class:"mut"},`${fdt(x.scheduled_at)} ${x.vehicle?("· "+x.vehicle):""}`),h("div",{class:"row"},h("button",{onclick:async()=>{ if(await run(()=>sb.rpc("accept_request",{p_request_id:x.id}),"سفارش مال تو شد 💪")) myRequests(); }},"قبول می‌کنم")))):h("p",{class:"mut"},"الان سفارش بازی نیست. یه ذره بعد سر بزن."));
}
async function providerProfile(){
  const [{data:cats},{data:mine}] = await Promise.all([sb.from("categories").select("id,name_fa"), sb.from("provider_categories").select("category_id").eq("provider_id",me.id)]);
  const sel = new Set((mine||[]).map(x=>x.category_id));
  const bn = h("input",{value:provider.business_name,maxlength:"80",minlength:"2"}), bio = h("textarea",{maxlength:"500"}), city = h("input",{value:provider.city||"",maxlength:"60"});
  bio.value = provider.bio||"";
  const boxes = (cats||[]).map(c=>{ const cb = h("input",{type:"checkbox",style:"width:auto"}); cb.checked = sel.has(c.id); cb.dataset.id=c.id; return h("label",{},cb," "+c.name_fa); });
  const f = h("form",{class:"card v"},h("h2",{},"پروفایل کسب‌وکارت"),h("label",{},"اسم کسب‌وکارت"),bn,h("label",{},"تو کدوم شهری؟"),city,h("label",{},"یه کم از خودت بگو"),bio,h("h2",{},"چه خدماتی می‌دی؟"),boxes,h("div",{class:"row"},h("button",{type:"submit"},"ذخیره کن")));
  f.addEventListener("submit",async e=>{
    e.preventDefault();
    const r1 = await run(()=>sb.from("provider_profiles").update({business_name:bn.value,bio:bio.value,city:city.value}).eq("user_id",me.id));
    if (!r1) return;
    const want = new Set([...f.querySelectorAll("input[type=checkbox]")].filter(x=>x.checked).map(x=>x.dataset.id));
    for (const id of want) if (!sel.has(id)) await run(()=>sb.from("provider_categories").insert({provider_id:me.id,category_id:id}));
    for (const id of sel) if (!want.has(id)) await run(()=>sb.from("provider_categories").delete().eq("provider_id",me.id).eq("category_id",id));
    toast("ذخیره شد"); await load(); providerHome();
  });
  render(f);
}

// ---- admin ----
async function adminHome(){
  setNav([["خدمات‌دهنده‌ها",adminHome],["شارژ کیف پول",adminWallet],["کمیسیون",adminCommission],["گزارش فعالیت",adminAudit]]);
  const {data} = await sb.from("provider_profiles").select("user_id,business_name,city,status").order("created_at",{ascending:false});
  render(h("h2",{},"خدمات‌دهنده‌ها"), (data||[]).map(p=>h("div",{class:"card b"},h("b",{},p.business_name)," ",h("span",{class:"badge"},p.status),h("div",{class:"mut"},p.city||""),h("div",{class:"row"},
    ["approved","suspended","pending"].filter(s=>s!==p.status).map(s=>h("button",{class:s==="approved"?"":"sec",onclick:async()=>{ if(await run(()=>sb.rpc("admin_set_provider_status",{p_user:p.user_id,p_status:s}),"انجام شد")) adminHome(); }},{approved:"تأیید",suspended:"تعلیق",pending:"در انتظار"}[s]))))));
}
async function adminWallet(){
  const {data} = await sb.from("profiles").select("id,full_name,role").order("created_at",{ascending:false}).limit(200);
  const u = h("select",{},(data||[]).map(p=>h("option",{value:p.id},`${p.full_name} (${p.role})`))), a = h("input",{type:"number",required:"",min:"-100000000",max:"100000000",step:"1000"}), n = h("input",{maxlength:"200"});
  const f = h("form",{class:"card g"},h("h2",{},"شارژ/اصلاح کیف پول"),h("label",{},"کاربر"),u,h("label",{},"مبلغ (تومان)"),a,h("label",{},"توضیح"),n,h("div",{class:"row"},h("button",{type:"submit"},"ثبت کن")));
  f.addEventListener("submit",async e=>{ e.preventDefault(); await run(()=>sb.rpc("admin_credit_wallet",{p_user:u.value,p_amount:+a.value,p_note:n.value}),"ثبت شد"); });
  render(f);
}
async function adminCommission(){
  const {data} = await sb.from("settings").select("value").eq("key","commission_percent").maybeSingle();
  const p = h("input",{type:"number",min:"0",max:"40",value:data?data.value:"10"});
  const f = h("form",{class:"card v"},h("h2",{},"درصد کمیسیون"),p,h("div",{class:"row"},h("button",{type:"submit"},"ذخیره کن")));
  f.addEventListener("submit",async e=>{ e.preventDefault(); await run(()=>sb.rpc("admin_set_commission",{p_percent:+p.value}),"ذخیره شد"); });
  render(f);
}
async function adminAudit(){
  const {data} = await sb.from("audit_log").select("id,action,entity,created_at").order("id",{ascending:false}).limit(100);
  render(h("h2",{},"گزارش فعالیت"),(data||[]).map(x=>h("div",{class:"card"},x.action," ",h("span",{class:"mut"},fdt(x.created_at)))));
}

// ---- boot ----
async function load(){
  const {data:{session}} = await sb.auth.getSession();
  me = session ? session.user : null; prof = null; provider = null;
  if (!me){ nav.replaceChildren(); return false; }
  const {data:p} = await sb.from("profiles").select("id,full_name,role").eq("id",me.id).maybeSingle();
  prof = p;
  if (p && p.role==="provider"){ const {data:pp} = await sb.from("provider_profiles").select("business_name,bio,city,status").eq("user_id",me.id).maybeSingle(); provider = pp; }
  return !!prof;
}
async function route(){
  if (!(await load())) return authView("in");
  if (prof.role==="admin") adminHome(); else if (prof.role==="provider") providerHome(); else customerHome();
}
sb.auth.onAuthStateChange((ev)=>{ if (ev==="SIGNED_IN"||ev==="SIGNED_OUT"||ev==="PASSWORD_RECOVERY"){ if (ev==="PASSWORD_RECOVERY") return recovery(); setTimeout(route,0); } });
function recovery(){
  const pw = h("input",{type:"password",minlength:"8",maxlength:"72",required:"",autocomplete:"new-password"});
  const f = h("form",{class:"card v"},h("h2",{},"رمز جدید"),pw,h("div",{class:"row"},h("button",{type:"submit"},"تغییر رمز")));
  f.addEventListener("submit",async e=>{ e.preventDefault(); if (await run(()=>sb.auth.updateUser({password:pw.value}),"رمز تغییر کرد")) route(); });
  render(f);
}
route();
})();
