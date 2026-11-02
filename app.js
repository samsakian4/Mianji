(function(){
"use strict";
const C = window.APP_CONFIG;
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const app = document.getElementById("app"), nav = document.getElementById("nav"), hdr = document.getElementById("hdr"), toastEl = document.getElementById("toast");
let me = null, prof = null, provider = null, uid = 0;

/* ---------- safe DOM helpers (no innerHTML anywhere => XSS-safe) ---------- */
function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})){
    if (k==="class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v!==false && v!=null) e.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k!=null && k!==false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const NS = "http://www.w3.org/2000/svg";
const PATHS = {
  home:"M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
  list:"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  wallet:"M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l2-3h12M16 14h2",
  user:"M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  percent:"M19 5L5 19M7 7h.01M17 17h.01",
  clock:"M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  drop:"M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  oil:"M7 9h9l2 3v8H7V9zM7 9V6h5M18 12h3M11 15h3",
  wrench:"M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.2-.5-.5-2.2z",
  car:"M3 17v-4l2-6h14l2 6v4M3 17h18M3 17v2h3v-2M18 17v2h3v-2M7 13h.01M17 13h.01",
  eye:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeoff:"M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  back:"M5 12h14M12 5l7 7-7 7",
  check:"M5 13l4 4L19 7",
  plus:"M12 5v14M5 12h14"
};
function icon(name, size){
  const s = document.createElementNS(NS,"svg");
  s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("width",size||22); s.setAttribute("height",size||22);
  s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2");
  s.setAttribute("stroke-linecap","round"); s.setAttribute("stroke-linejoin","round"); s.setAttribute("aria-hidden","true"); s.setAttribute("focusable","false");
  const p = document.createElementNS(NS,"path"); p.setAttribute("d", PATHS[name]||PATHS.wrench); s.append(p); return s;
}
const CAT_ICON = {"car-wash":"drop","oil-change":"oil"};

function render(...n){ app.replaceChildren(...n.flat(Infinity)); }
let tt; function toast(m){ toastEl.textContent = m; toastEl.classList.add("on"); clearTimeout(tt); tt=setTimeout(()=>toastEl.classList.remove("on"),4000); }
const fa = n => Number(n).toLocaleString("fa-IR");
const fdt = d => new Date(d).toLocaleString("fa-IR");
const money = n => h("span",{class:"num"}, fa(n)+" تومان");
const ERR = {not_authenticated:"اول وارد شو",only_customers:"فقط مشتری‌ها می‌تونن سفارش بدن",invalid_service:"این خدمت درست نیست",invalid_district:"اسم محله رو درست بنویس",invalid_address:"آدرس کامل نیست",invalid_time:"این زمان درست نیست",online_not_available:"پرداخت آنلاین هنوز راه نیفتاده",too_many_open_requests:"هم‌زمان بیشتر از ۵ سفارش باز نمی‌شه داشت",rate_limited:"یه کم آروم‌تر، چند ثانیه صبر کن",not_approved_provider:"هنوز تأییدت نکردن",cannot_accept:"این سفارش دیگه آزاد نیست",invalid_transition:"الان نمی‌شه این کار رو کرد",forbidden:"اجازه‌ش رو نداری",payment_required:"اول باید پرداخت بشه",insufficient_balance:"موجودی کیف پولت کافی نیست",invalid_state:"وضعیت سفارش اجازه نمی‌ده"};
function err(e){ const m = (e && e.message) || ""; for (const k in ERR) if (m.includes(k)) return ERR[k]; return "یه مشکلی پیش اومد، دوباره امتحان کن"; }
async function run(fn, ok){ try{ const r = await fn(); if (r && r.error) throw r.error; if (ok) toast(ok); return r; }catch(e){ toast(err(e)); return null; } }

const STATUS = {open:"منتظر یکی که قبول کنه",accepted:"یکی قبول کرد",in_progress:"داره انجام می‌شه",completed:"تموم شد",cancelled:"لغو شد"};
const PAY = {cash:"نقد یا کارت دم در",online:"آنلاین",wallet:"کیف پول"};

/* ---------- UX helpers ---------- */
const AR = "٠١٢٣٤٥٦٧٨٩", PE = "۰۱۲۳۴۵۶۷۸۹";
function normDigits(s){ return s.replace(/[۰-۹]/g,d=>PE.indexOf(d)).replace(/[٠-٩]/g,d=>AR.indexOf(d)); }
function digitsOnly(el){ el.addEventListener("input",()=>{ const v = normDigits(el.value); if (v!==el.value) el.value = v; }); }

// labelled field: visible <label for>, helper text, inline error linked by aria-describedby
function field(label, input, opts){
  opts = opts || {}; const id = "f"+(++uid); input.id = id;
  if (opts.required) input.required = true;
  const lab = h("label",{for:id}, label, opts.required ? h("span",{class:"req","aria-hidden":"true"}," *") : null);
  const help = opts.help ? h("div",{class:"help",id:id+"-h"},opts.help) : null;
  const er = h("div",{class:"err",id:id+"-e",role:"alert"});
  input.setAttribute("aria-describedby",[help?id+"-h":null,id+"-e"].filter(Boolean).join(" "));
  const box = h("div",{class:"field"},lab,opts.wrap?opts.wrap(input):input,help,er);
  input._setErr = m => { er.textContent = m||""; input.setAttribute("aria-invalid", m?"true":"false"); };
  return box;
}
function msgFor(el){
  const v = el.validity;
  if (v.customError) return el.validationMessage;
  if (v.valueMissing) return "این قسمت رو پر کن";
  if (v.typeMismatch) return el.type==="email" ? "ایمیل رو درست بنویس، مثلاً name@gmail.com" : "فرمتش درست نیست";
  if (v.tooShort) return "حداقل "+fa(el.minLength)+" تا حرف بنویس";
  if (v.patternMismatch) return el.dataset.msg || "فرمتش درست نیست";
  if (v.rangeUnderflow || v.rangeOverflow) return el.dataset.msg || "این عدد قابل قبول نیست";
  return "مقدار درست نیست";
}
function check(el){ if (!el._setErr) return true; const ok = el.checkValidity(); el._setErr(ok ? "" : msgFor(el)); return ok; }
function wire(form){
  form.noValidate = true;
  form.addEventListener("focusout", e=>{ const el = e.target; if (el._setErr && (el.value!=="" || el.getAttribute("aria-invalid")==="true")) check(el); });  // validate on blur, not on keystroke
  form.addEventListener("input", e=>{ const el = e.target; if (el._setErr && el.getAttribute("aria-invalid")==="true") check(el); });
}
function validateAll(form){
  let first = null;
  for (const el of form.querySelectorAll("input,select,textarea")) if (el._setErr && !check(el) && !first) first = el;
  if (first){ first.focus(); return false; } return true;
}
async function withBusy(btn, text, fn){
  const old = btn.textContent; btn.disabled = true; btn.setAttribute("aria-busy","true"); btn.textContent = text;
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = old; }
}
function confirmBox(msg, okText, danger){
  return new Promise(res=>{
    if (!window.HTMLDialogElement || !document.createElement("dialog").showModal) return res(window.confirm(msg));
    const d = h("dialog",{class:"dlg","aria-label":msg});
    const yes = h("button",{type:"button",class:danger?"danger":""},okText||"آره، مطمئنم"), no = h("button",{type:"button",class:"sec"},"نه، ولش کن");
    let v = false; yes.addEventListener("click",()=>{v=true;d.close();}); no.addEventListener("click",()=>d.close());
    d.addEventListener("click",e=>{ if (e.target===d) d.close(); });
    d.addEventListener("close",()=>{ d.remove(); res(v); });
    d.append(h("p",{class:"dlg-msg"},msg),h("div",{class:"row"},yes,no));
    document.body.append(d); d.showModal(); no.focus();
  });
}
function skeleton(n){ return Array.from({length:n||2},()=>h("div",{class:"card sk","aria-hidden":"true"},h("div",{class:"sk-l w60"}),h("div",{class:"sk-l w90"}),h("div",{class:"sk-l w40"}))); }
function empty(title, text, actionLabel, href){
  return h("div",{class:"card empty"},h("h2",{},title),h("p",{class:"mut"},text),actionLabel?h("div",{class:"row"},h("a",{class:"btn",href},actionLabel)):null);
}
function backLink(href, text){ return h("a",{class:"back",href},icon("back",18),text||"برگشت"); }
function pwWrap(input){
  const btn = h("button",{type:"button",class:"eye","aria-label":"نشون دادن رمز","aria-pressed":"false"},icon("eye",20));
  btn.addEventListener("click",()=>{ const show = input.type==="password"; input.type = show?"text":"password"; btn.setAttribute("aria-pressed",show); btn.setAttribute("aria-label",show?"پنهان کردن رمز":"نشون دادن رمز"); btn.replaceChildren(icon(show?"eyeoff":"eye",20)); });
  return h("div",{class:"pw"},input,btn);
}

/* ---------- auth: login + separate signup journeys for customers and providers ---------- */
let fails = 0, lockUntil = 0;
function heroBlock(big, p, ic){ return h("div",{class:"hero"},h("div",{class:"hero-ic"},icon(ic||"car",34)),h("div",{class:"big"},big),h("p",{},p)); }
function authView(mode){
  hideChrome();
  if (mode==="choose") return chooseView();
  if (mode==="customer" || mode==="provider") return signupView(mode);
  return loginView();
}
function chooseView(){
  setTitle("ثبت‌نام");
  render(heroBlock("می‌خوای چیکار کنی؟","یکی رو انتخاب کن؛ برای هر کدوم سؤال‌های متفاوتی داریم."),
    h("div",{class:"grid"},
      h("a",{class:"card cat g",href:"#/signup/customer"},h("span",{class:"ic"},icon("car",34)),h("b",{},"خدمات می‌خوام"),h("span",{class:"mut"},"ماشینم رو بشورن، روغنش رو عوض کنن؛ تو خونه یا محل کار")),
      h("a",{class:"card cat b",href:"#/signup/provider"},h("span",{class:"ic"},icon("wrench",34)),h("b",{},"خودم خدمات می‌دم"),h("span",{class:"mut"},"کارواش سیار، تعویض روغن سیار یا خدمت دیگه دارم و دنبال مشتری‌ام"))),
    h("div",{class:"row"},h("a",{class:"btn sec",href:"#/login"},"قبلاً ثبت‌نام کردم")));
}
function credFields(f, em, pw, isNew){
  f.append(field("ایمیل",em,{required:true,help:isNew?"برای ورود و بازیابی رمز":null}),field("رمز",pw,{required:true,help:isNew?"حداقل ۸ تا حرف":null,wrap:pwWrap}));
}
function mkCreds(isNew){
  return {
    em: h("input",{type:"email",autocomplete:"email",inputmode:"email",maxlength:"120",dir:"ltr"}),
    pw: h("input",{type:"password",minlength:"8",maxlength:"72",autocomplete:isNew?"new-password":"current-password",dir:"ltr"})
  };
}
function phoneInput(){ const ph = h("input",{type:"tel",inputmode:"numeric",pattern:"09[0-9]{9}",maxlength:"11",autocomplete:"tel",placeholder:"09123456789",dir:"ltr","data-msg":"شماره باید ۱۱ رقم باشه و با ۰۹ شروع بشه"}); digitsOnly(ph); return ph; }

function loginView(){
  setTitle("ورود");
  const f = h("form",{class:"card v"}); wire(f);
  const {em,pw} = mkCreds(false);
  const formErr = h("div",{class:"form-err",role:"alert"});
  const btn = h("button",{type:"submit",class:"primary"},"بزن بریم");
  f.append(h("h2",{},"خوش برگشتی")); credFields(f,em,pw,false);
  f.append(formErr,h("div",{class:"row"},btn),
    h("div",{class:"row"},h("a",{class:"btn sec",href:"#/signup"},"حساب ندارم، می‌خوام بسازم")),
    h("div",{class:"row"},h("button",{type:"button",class:"link",onclick:async()=>{
      if (!em.value || !check(em)){ em.focus(); return; }
      await run(()=>sb.auth.resetPasswordForEmail(em.value.trim()),"اگه این ایمیل ثبت شده باشه، لینک بازیابی براش میره");
    }},"رمزم یادم رفته")));
  f.addEventListener("submit", async ev=>{
    ev.preventDefault(); formErr.textContent = "";
    if (!validateAll(f)) return;
    if (Date.now()<lockUntil){ formErr.textContent = "چند ثانیه صبر کن بعد دوباره امتحان کن"; return; }
    await withBusy(btn,"دارم وارد می‌شم…",async()=>{
      const {error} = await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value});
      if (error){ fails++; if (fails>=5){ lockUntil = Date.now()+30000*Math.min(fails-4,10); } formErr.textContent = "ایمیل یا رمزت درست نیست. یه بار دیگه امتحان کن یا «رمزم یادم رفته» رو بزن."; }
      else fails = 0;
    });
  });
  render(heroBlock("ماشینت رو بسپر، خودشون میان","کارواش سیار و تعویض روغن سیار؛ تو خونه یا پارکینگ شرکت. لازم نیست جایی بری."),f);
}

async function signupView(kind){
  const isProv = kind==="provider";
  setTitle(isProv?"همکاری با میانجی":"ثبت‌نام");
  let cats = [];
  if (isProv){ render(backLink("#/signup"),skeleton(2)); const r = await sb.from("categories").select("slug,name_fa").order("sort"); cats = (r&&r.data)||[]; }
  const f = h("form",{class:"card "+(isProv?"b":"g")}); wire(f);
  const nm = h("input",{maxlength:"80",minlength:"2",autocomplete:"name"});
  const ph = phoneInput();
  const {em,pw} = mkCreds(true);
  const formErr = h("div",{class:"form-err",role:"alert"});
  const btn = h("button",{type:"submit",class:"primary"},isProv?"درخواست همکاری بده":"ثبت‌نامم کن");
  let bn, city, bio, ex, catBoxes = [], catErr;
  if (!isProv){
    f.append(h("h2",{},"ثبت‌نام سریع"),
      field("اسمت چیه؟",nm,{required:true}),
      field("شماره موبایلت",ph,{help:"اختیاریه؛ برای هماهنگی با کسی که میاد سراغت"}));
  } else {
    bn = h("input",{maxlength:"80",minlength:"2",placeholder:"مثلاً کارواش من"});
    city = h("input",{maxlength:"60",autocomplete:"address-level2"});
    bio = h("textarea",{maxlength:"500"});
    ex = h("select",{},[["","انتخاب کن"],["0","کمتر از یک سال"],["1","۱ تا ۳ سال"],["3","۳ تا ۵ سال"],["5","۵ تا ۱۰ سال"],["10","بیشتر از ۱۰ سال"]].map(([v,t])=>h("option",{value:v},t)));
    catBoxes = cats.map(c=>{ const cb = h("input",{type:"checkbox","data-slug":c.slug}); return h("label",{class:"chk"},cb,h("span",{},c.name_fa)); });
    catErr = h("div",{class:"err",role:"alert"});
    f.append(h("h2",{},"همکاری با میانجی"),h("p",{class:"mut lead"},"چند تا سؤال درباره‌ی خودت و کارت داریم. بعد از بررسی، حسابت فعال می‌شه."),
      h("fieldset",{class:"grp"},h("legend",{},"درباره‌ی خودت"),
        field("اسم و فامیلت",nm,{required:true}),
        field("شماره موبایل",ph,{required:true,help:"مشتری‌ها و تیم ما با این شماره هماهنگ می‌کنن"})),
      h("fieldset",{class:"grp"},h("legend",{},"درباره‌ی کارت"),
        field("اسم کسب‌وکارت",bn,{required:true}),
        field("تو کدوم شهر کار می‌کنی؟",city,{required:true}),
        h("div",{class:"field"},h("div",{class:"lbl"},"چه خدماتی می‌دی؟",h("span",{class:"req","aria-hidden":"true"}," *")),h("div",{class:"help"},"هر چندتا که می‌دی رو بزن"),h("div",{class:"chks"},catBoxes),catErr),
        field("چند سال سابقه داری؟",ex),
        field("یه کم از کارت بگو",bio,{help:"مثلاً با چه وسایلی کار می‌کنی؛ مشتری‌ها این متن رو می‌بینن"})),
      h("fieldset",{class:"grp"},h("legend",{},"حساب کاربری")));
  }
  const credBox = isProv ? f.lastElementChild : f; credFields(credBox,em,pw,true);
  f.append(formErr,h("div",{class:"row"},btn),h("div",{class:"row"},h("a",{class:"btn sec",href:"#/login"},"قبلاً ثبت‌نام کردم")));
  f.addEventListener("submit",async ev=>{
    ev.preventDefault(); formErr.textContent = "";
    let ok = validateAll(f);
    if (isProv){ const any = catBoxes.some(l=>l.querySelector("input").checked); catErr.textContent = any ? "" : "حداقل یه خدمت رو انتخاب کن"; if (!any){ ok = false; if (!document.activeElement || !f.contains(document.activeElement) || document.activeElement===btn) catBoxes[0] && catBoxes[0].querySelector("input").focus(); } }
    if (!ok) return;
    const meta = {full_name:nm.value,phone:ph.value,role:kind};
    if (isProv) Object.assign(meta,{business_name:bn.value,city:city.value,bio:bio.value,experience_years:ex.value,categories:catBoxes.map(l=>l.querySelector("input")).filter(c=>c.checked).map(c=>c.dataset.slug)});
    await withBusy(btn,"دارم ثبتش می‌کنم…",async()=>{
      const {error} = await sb.auth.signUp({email:em.value.trim(),password:pw.value,options:{data:meta}});
      if (error){ formErr.textContent = "ثبت‌نام نشد. اطلاعاتت رو چک کن؛ شاید با این ایمیل قبلاً ثبت‌نام کرده باشی."; return; }
      toast(isProv ? "درخواست همکاریت ثبت شد. اگه ایمیل تأیید اومد تأییدش کن؛ بعدش مدیر بررسیت می‌کنه." : "ثبت‌نام شدی! اگه ایمیل تأیید اومد، تأییدش کن");
    });
  });
  render(backLink("#/signup"),heroBlock(isProv?"مشتری بیارم، کارت رو بکن":"ماشینت رو بسپر، خودشون میان",isProv?"سفارش‌های دسته‌ی خودت رو می‌بینی و هر کدوم رو خواستی قبول می‌کنی.":"فقط چند تا سؤال کوتاه؛ بعدش اولین سفارشت رو بده.",isProv?"wrench":"car"),f);
}

/* ---------- shell: nav, title, focus ---------- */
const NAV = {
  customer:[["home","خانه","home"],["orders","سفارش‌هام","list"],["wallet","کیف پول","wallet"]],
  provider:[["home","سفارش‌های باز","home"],["orders","کارهام","list"],["profile","پروفایل","user"],["wallet","کیف پول","wallet"]],
  admin:[["home","خدمات‌دهنده‌ها","user"],["credit","کیف پول","wallet"],["commission","کمیسیون","percent"],["audit","گزارش","clock"]]
};
function hideChrome(){ nav.hidden = true; nav.replaceChildren(); hdr.replaceChildren(); document.body.classList.remove("has-nav"); }
function setNav(active){
  document.body.classList.add("has-nav"); nav.hidden = false;
  nav.replaceChildren(...NAV[prof.role].map(([k,t,ic])=>{ const a = h("a",{href:"#/"+k,class:"tab"},icon(ic),h("span",{},t)); if (k===active) a.setAttribute("aria-current","page"); return a; }));
  hdr.replaceChildren(h("button",{type:"button",class:"sec logout","aria-label":"خروج از حساب",onclick:async()=>{ if (await confirmBox("از حسابت خارج بشی؟","آره، خارج شو",false)) sb.auth.signOut(); }},icon("logout",18),h("span",{},"خروج")));
}
function setTitle(t){ document.title = t+" | میانجی"; }
function loading(){ render(skeleton(2)); }

const R = {
  customer:{home:customerHome,orders:myRequests,wallet:walletView},
  provider:{home:providerHome,orders:myRequests,profile:providerProfile,wallet:walletView},
  admin:{home:adminHome,credit:adminWallet,commission:adminCommission,audit:adminAudit}
};
async function route(){
  if (!prof){ const hs = location.hash; return authView(hs==="#/signup"?"choose":hs==="#/signup/customer"?"customer":hs==="#/signup/provider"?"provider":"in"); }
  const [name,arg] = (location.hash.replace(/^#\/?/,"")||"home").split("/");
  let active = name, fn = R[prof.role][name];
  if (prof.role==="customer" && name==="new" && arg){ active="home"; fn = ()=>requestForm(decodeURIComponent(arg)); }
  else if (prof.role==="customer" && name==="review" && arg){ active="orders"; fn = ()=>reviewForm(decodeURIComponent(arg)); }
  else if (!fn){ active="home"; fn = R[prof.role].home; }
  setNav(active); loading();
  await fn();
  window.scrollTo(0,0); app.focus({preventScroll:true});   // move focus to the new content for keyboard / screen-reader users
}
function go(hash){ if (location.hash===hash) route(); else location.hash = hash; }

/* ---------- customer ---------- */
async function customerHome(){
  setTitle("خانه");
  const {data:cats} = await sb.from("categories").select("id,slug,name_fa,description_fa").order("sort");
  const tone = ["g","b","p","v"];
  render(h("h2",{},"امروز چی لازم داری؟"),
    cats&&cats.length ? h("div",{class:"grid"},cats.map((c,i)=>h("a",{class:"card cat "+tone[i%4],href:"#/new/"+encodeURIComponent(c.slug)},h("span",{class:"ic"},icon(CAT_ICON[c.slug]||"wrench",34)),h("b",{},c.name_fa),h("span",{class:"mut"},c.description_fa||"")))) : empty("فعلاً خدمتی نیست","چند لحظه دیگه دوباره سر بزن."));
}
async function requestForm(slug){
  const {data:cat} = await sb.from("categories").select("id,name_fa").eq("slug",slug).maybeSingle();
  if (!cat) return render(backLink("#/home"),empty("این خدمت پیدا نشد","شاید حذف شده باشه.","برگرد به خانه","#/home"));
  setTitle(cat.name_fa);
  const {data:svcs} = await sb.from("services").select("id,name_fa,price").eq("category_id",cat.id).order("price");
  const sv = h("select",{},(svcs||[]).map(s=>h("option",{value:s.id},s.name_fa+" — "+fa(s.price)+" تومان")));
  const di = h("input",{minlength:"2",maxlength:"60",autocomplete:"address-level2"});
  const ad = h("textarea",{minlength:"5",maxlength:"300",autocomplete:"street-address"});
  const now = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  const dt = h("input",{type:"datetime-local",min:now,dir:"ltr"});
  dt.addEventListener("change",()=>{ dt.setCustomValidity(dt.value && new Date(dt.value)<new Date() ? "این زمان گذشته؛ یه زمان بعدتر انتخاب کن" : ""); });
  const ve = h("input",{maxlength:"100"}), no = h("textarea",{maxlength:"500"});
  const pm = h("select",{},h("option",{value:"cash"},PAY.cash),h("option",{value:"wallet"},PAY.wallet));
  const formErr = h("div",{class:"form-err",role:"alert"});
  const btn = h("button",{type:"submit",class:"primary"},"درخواست بده");
  const f = h("form",{class:"card g"}); wire(f);
  f.append(h("h2",{},cat.name_fa),
    field("کدوم خدمت؟",sv,{required:true}),
    field("تو کدوم محله‌ای؟",di,{required:true,help:"مثلاً ونک یا سعادت‌آباد"}),
    field("آدرس دقیق",ad,{required:true,help:"فقط کسی که سفارش رو قبول کنه این آدرس رو می‌بینه"}),
    field("کی بیاد؟",dt,{required:true}),
    field("ماشینت چیه؟",ve,{help:"مدل یا پلاک؛ اختیاریه"}),
    field("حرف دیگه‌ای هست؟",no),
    field("چطوری حساب کنی؟",pm,{help:"کیف پول همین الان پرداخت می‌شه؛ نقد رو بعد از کار می‌دی"}),
    formErr, h("div",{class:"row"},btn));
  f.addEventListener("submit",async e=>{
    e.preventDefault(); formErr.textContent = ""; dt.dispatchEvent(new Event("change"));
    if (!validateAll(f)) return;
    await withBusy(btn,"دارم ثبتش می‌کنم…",async()=>{
      try{
        const r = await sb.rpc("create_request",{p_service_id:sv.value,p_district:di.value,p_address:ad.value,p_lat:null,p_lng:null,p_scheduled_at:new Date(dt.value).toISOString(),p_vehicle:ve.value||null,p_notes:no.value||null,p_payment_method:pm.value});
        if (r.error) throw r.error;
        if (pm.value==="wallet"){ const p = await sb.rpc("pay_request_wallet",{p_request_id:r.data}); if (p.error) toast("درخواستت ثبت شد ولی پرداخت از کیف پول انجام نشد: "+err(p.error)); else toast("درخواستت ثبت شد و از کیف پولت کم شد"); }
        else toast("درخواستت ثبت شد");
        go("#/orders");
      }catch(x){ formErr.textContent = err(x); }
    });
  });
  render(backLink("#/home"),f);
}
async function myRequests(){
  setTitle(prof.role==="provider"?"کارهام":"سفارش‌هام");
  const col = prof.role==="provider" ? "provider_id" : "customer_id";
  const {data} = await sb.from("requests").select("id,status,price,district,address,scheduled_at,payment_method,pay_status,vehicle").eq(col,me.id).order("created_at",{ascending:false}).limit(50);
  const title = h("h2",{},prof.role==="provider"?"کارهام":"سفارش‌هام");
  if (!data || !data.length) return render(title, prof.role==="provider" ? empty("هنوز کاری نداری","از «سفارش‌های باز» یکی رو قبول کن.","برو سفارش‌های باز","#/home") : empty("هنوز سفارشی نداری","اولین سفارشت رو بده؛ دو دقیقه بیشتر طول نمی‌کشه.","سفارش بده","#/home"));
  const act = (b,ok,rpcName,args,msg)=>b; // (kept small; see helpers below)
  async function rpcDo(btn, busyText, name, args, okMsg, confirmMsg, danger){
    if (confirmMsg && !(await confirmBox(confirmMsg,null,danger))) return;
    await withBusy(btn,busyText,async()=>{ if (await run(()=>sb.rpc(name,args),okMsg)) myRequests(); });
  }
  render(title, data.map(r=>{
    const acts = [];
    if (prof.role==="customer"){
      if (r.pay_status==="unpaid" && ["open","accepted","in_progress"].includes(r.status)) { const b = h("button",{type:"button",class:"sec"},"پرداخت از کیف پول"); b.onclick=()=>rpcDo(b,"صبر کن…","pay_request_wallet",{p_request_id:r.id},"از کیف پولت کم شد"); acts.push(b); }
      if (r.status==="completed") acts.push(h("a",{class:"btn",href:"#/review/"+r.id},"امتیاز بده"));
      if (["open","accepted"].includes(r.status)) { const b = h("button",{type:"button",class:"danger"},"لغو سفارش"); b.onclick=()=>rpcDo(b,"صبر کن…","set_request_status",{p_request_id:r.id,p_new:"cancelled"},"سفارش لغو شد","سفارش رو لغو کنم؟",true); acts.push(b); }
    } else {
      if (r.status==="accepted"){
        const s = h("button",{type:"button",class:"primary"},"رسیدم، شروع"); s.onclick=()=>rpcDo(s,"صبر کن…","set_request_status",{p_request_id:r.id,p_new:"in_progress"},"شروع شد");
        const x = h("button",{type:"button",class:"sec"},"نمی‌تونم برم"); x.onclick=()=>rpcDo(x,"صبر کن…","set_request_status",{p_request_id:r.id,p_new:"open"},"سفارش آزاد شد","سفارش رو رها کنم تا یکی دیگه قبولش کنه؟",true);
        acts.push(s,x);
      }
      if (r.status==="in_progress"){ const b = h("button",{type:"button",class:"primary"},"کار تموم شد"); b.onclick=()=>rpcDo(b,"صبر کن…","set_request_status",{p_request_id:r.id,p_new:"completed"},"کار ثبت شد","مطمئنی کار کامل تموم شده؟",false); acts.push(b); }
    }
    return h("div",{class:"card b"},
      h("span",{class:"badge st-"+r.status},STATUS[r.status]),
      h("div",{class:"line"},r.district," — ",money(r.price)),
      h("div",{class:"mut"},fdt(r.scheduled_at)," · ",PAY[r.payment_method]," · ",r.pay_status==="paid"?"پرداخت شده":"هنوز پرداخت نشده"),
      prof.role==="provider" ? h("div",{class:"wrap"},r.address,r.vehicle?(" · "+r.vehicle):"") : null,
      acts.length ? h("div",{class:"row"},acts) : null);
  }));
}
function reviewForm(reqId){
  setTitle("امتیاز");
  const st = h("select",{},[5,4,3,2,1].map(n=>h("option",{value:n},fa(n)+" از "+fa(5)+" — "+["خیلی بد","بد","معمولی","خوب","عالی"][n-1])));
  const cm = h("textarea",{maxlength:"500"}), formErr = h("div",{class:"form-err",role:"alert"});
  const btn = h("button",{type:"submit",class:"primary"},"ثبت کن");
  const f = h("form",{class:"card p"}); wire(f);
  f.append(h("h2",{},"کارش چطور بود؟"),field("امتیازت",st,{required:true}),field("اگه خواستی یه چیزی بنویس",cm),formErr,h("div",{class:"row"},btn));
  f.addEventListener("submit",async e=>{ e.preventDefault(); formErr.textContent="";
    await withBusy(btn,"دارم ثبت می‌کنم…",async()=>{ try{ const r = await sb.rpc("submit_review",{p_request_id:reqId,p_rating:+st.value,p_comment:cm.value}); if (r.error) throw r.error; toast("مرسی از نظرت"); go("#/orders"); }catch(x){ formErr.textContent = (x&&x.message||"").includes("duplicate")||(x&&x.code==="23505") ? "قبلاً برای این سفارش امتیاز دادی" : err(x); } });
  });
  render(backLink("#/orders"),f);
}
async function walletView(){
  setTitle("کیف پول");
  const [{data:b},{data:t}] = await Promise.all([sb.from("wallet_balances").select("balance").eq("user_id",me.id).maybeSingle(), sb.from("wallet_transactions").select("amount,kind,note,created_at").eq("user_id",me.id).order("created_at",{ascending:false}).limit(30)]);
  render(h("div",{class:"card g"},h("h2",{},"کیف پولت"),h("div",{class:"balance"},money(b?b.balance:0)),h("p",{class:"mut"},"فعلاً شارژ کیف پول رو پشتیبانی انجام می‌ده.")),
    (t&&t.length) ? t.map(x=>h("div",{class:"card tx"},h("span",{class:"num "+(x.amount<0?"neg":"pos")},(x.amount<0?"−":"+")+fa(Math.abs(x.amount))+" تومان"),h("span",{},x.note||x.kind),h("span",{class:"mut"},fdt(x.created_at)))) : empty("هنوز تراکنشی نداری","هر پرداخت یا شارژی اینجا نشون داده می‌شه."));
}

/* ---------- provider ---------- */
async function providerHome(){
  setTitle("سفارش‌های باز");
  if (!provider || provider.status!=="approved"){
    return render(h("div",{class:"card p"},h("h2",{},provider&&provider.status==="suspended"?"حسابت فعلاً معلقه":"منتظر تأیید باش"),h("p",{},provider&&provider.status==="suspended"?"برای اطلاعات بیشتر با پشتیبانی تماس بگیر.":"بعد از اینکه مدیر تأییدت کنه، کارت شروع می‌شه. تا اون موقع پروفایلت رو کامل کن و خدماتی که می‌دی رو انتخاب کن."),h("div",{class:"row"},h("a",{class:"btn primary",href:"#/profile"},"پروفایلت رو کامل کن"))));
  }
  const r = await run(()=>sb.rpc("list_open_requests"));
  const d = (r&&r.data)||[];
  render(h("h2",{},"سفارش‌های باز"), d.length ? d.map(x=>{
    const b = h("button",{type:"button",class:"primary"},"قبول می‌کنم");
    b.onclick = ()=>withBusy(b,"صبر کن…",async()=>{ if (await run(()=>sb.rpc("accept_request",{p_request_id:x.id}),"سفارش مال تو شد")) go("#/orders"); else providerHome(); });
    return h("div",{class:"card g"},h("b",{},x.category_name+" — "+x.service_name),h("div",{class:"line"},x.district," · ",money(x.price)),h("div",{class:"mut"},fdt(x.scheduled_at),x.vehicle?(" · "+x.vehicle):""),h("div",{class:"row"},b));
  }) : empty("الان سفارش بازی نیست","یه ذره بعد دوباره سر بزن. فقط سفارش‌های دسته‌هایی که انتخاب کردی نشون داده می‌شه.","خدماتم رو ببینم","#/profile"));
}
async function providerProfile(){
  setTitle("پروفایل");
  const [{data:cats},{data:mine}] = await Promise.all([sb.from("categories").select("id,name_fa"), sb.from("provider_categories").select("category_id").eq("provider_id",me.id)]);
  const sel = new Set((mine||[]).map(x=>x.category_id));
  const bn = h("input",{value:provider.business_name,maxlength:"80",minlength:"2"}), bio = h("textarea",{maxlength:"500"}), city = h("input",{value:provider.city||"",maxlength:"60"});
  bio.value = provider.bio||"";
  const boxes = (cats||[]).map(c=>{ const cb = h("input",{type:"checkbox","data-id":c.id}); cb.checked = sel.has(c.id); return h("label",{class:"chk"},cb,h("span",{},c.name_fa)); });
  const ex = h("select",{},[["","انتخاب کن"],["0","کمتر از یک سال"],["1","۱ تا ۳ سال"],["3","۳ تا ۵ سال"],["5","۵ تا ۱۰ سال"],["10","بیشتر از ۱۰ سال"]].map(([v,t])=>h("option",{value:v},t))); ex.value = provider.experience_years==null?"":String(provider.experience_years);
  const btn = h("button",{type:"submit",class:"primary"},"ذخیره کن");
  const f = h("form",{class:"card v"}); wire(f);
  f.append(h("h2",{},"پروفایل کسب‌وکارت"),field("اسم کسب‌وکارت",bn,{required:true}),field("تو کدوم شهری؟",city),field("چند سال سابقه داری؟",ex),field("یه کم از خودت بگو",bio,{help:"مشتری‌ها این متن رو می‌بینن"}),
    h("fieldset",{class:"grp"},h("legend",{},"چه خدماتی می‌دی؟"),boxes),h("div",{class:"row"},btn));
  f.addEventListener("submit",async e=>{
    e.preventDefault(); if (!validateAll(f)) return;
    await withBusy(btn,"دارم ذخیره می‌کنم…",async()=>{
      const r1 = await run(()=>sb.from("provider_profiles").update({business_name:bn.value,bio:bio.value,city:city.value,experience_years:ex.value===""?null:+ex.value}).eq("user_id",me.id)); if (!r1) return;
      const want = new Set([...f.querySelectorAll("input[type=checkbox]")].filter(x=>x.checked).map(x=>x.dataset.id));
      for (const id of want) if (!sel.has(id)) await run(()=>sb.from("provider_categories").insert({provider_id:me.id,category_id:id}));
      for (const id of sel) if (!want.has(id)) await run(()=>sb.from("provider_categories").delete().eq("provider_id",me.id).eq("category_id",id));
      toast("ذخیره شد"); await load(); go("#/home");
    });
  });
  render(f);
}

/* ---------- admin ---------- */
const PSTAT = {approved:"تأیید شده",suspended:"معلق",pending:"منتظر تأیید"};
async function adminHome(){
  setTitle("خدمات‌دهنده‌ها");
  const {data} = await sb.from("provider_profiles").select("user_id,business_name,city,status").order("created_at",{ascending:false});
  render(h("h2",{},"خدمات‌دهنده‌ها"), (data&&data.length) ? data.map(p=>h("div",{class:"card b"},h("b",{},p.business_name)," ",h("span",{class:"badge ps-"+p.status},PSTAT[p.status]),h("div",{class:"mut"},p.city||""),
    h("div",{class:"row"},["approved","suspended","pending"].filter(s=>s!==p.status).map(s=>{
      const b = h("button",{type:"button",class:s==="approved"?"primary":(s==="suspended"?"danger":"sec")},{approved:"تأیید",suspended:"تعلیق",pending:"برگردون به منتظر"}[s]);
      b.onclick = async()=>{ if (s==="suspended" && !(await confirmBox("«"+p.business_name+"» رو معلق کنم؟ دیگه نمی‌تونه سفارش قبول کنه.","آره، معلق کن",true))) return;
        await withBusy(b,"صبر کن…",async()=>{ if (await run(()=>sb.rpc("admin_set_provider_status",{p_user:p.user_id,p_status:s}),"انجام شد")) adminHome(); }); };
      return b; })))) : empty("هنوز کسی ثبت‌نام نکرده","وقتی خدمات‌دهنده‌ای ثبت‌نام کنه اینجا می‌بینیش."));
}
async function adminWallet(){
  setTitle("شارژ کیف پول");
  const {data} = await sb.from("profiles").select("id,full_name,role").order("created_at",{ascending:false}).limit(200);
  const u = h("select",{},(data||[]).map(p=>h("option",{value:p.id},p.full_name+" ("+({customer:"مشتری",provider:"خدمات‌دهنده",admin:"مدیر"}[p.role]||p.role)+")")));
  const a = h("input",{type:"text",inputmode:"numeric",dir:"ltr",pattern:"-?[0-9]{1,9}","data-msg":"فقط عدد بنویس؛ برای کم کردن اول عدد منفی بذار"}); digitsOnly(a);
  const n = h("input",{maxlength:"200"}), btn = h("button",{type:"submit",class:"primary"},"ثبت کن");
  const f = h("form",{class:"card g"}); wire(f);
  f.append(h("h2",{},"شارژ یا اصلاح کیف پول"),field("کاربر",u,{required:true}),field("مبلغ (تومان)",a,{required:true,help:"عدد منفی یعنی کم کردن از موجودی"}),field("توضیح",n),h("div",{class:"row"},btn));
  f.addEventListener("submit",async e=>{ e.preventDefault(); if (!validateAll(f)) return;
    if (!(await confirmBox("مبلغ "+fa(+a.value)+" تومان برای «"+u.options[u.selectedIndex].text+"» ثبت بشه؟","آره، ثبت کن",+a.value<0))) return;
    await withBusy(btn,"صبر کن…",async()=>{ if (await run(()=>sb.rpc("admin_credit_wallet",{p_user:u.value,p_amount:+a.value,p_note:n.value}),"ثبت شد")){ a.value=""; n.value=""; } }); });
  render(f);
}
async function adminCommission(){
  setTitle("کمیسیون");
  const {data} = await sb.from("settings").select("value").eq("key","commission_percent").maybeSingle();
  const p = h("input",{type:"text",inputmode:"numeric",dir:"ltr",pattern:"[0-9]{1,2}","data-msg":"یه عدد بین ۰ تا ۴۰ بنویس",value:data?data.value:"10"}); digitsOnly(p);
  p.addEventListener("input",()=>p.setCustomValidity(+p.value>40?"حداکثر ۴۰ درصد مجازه":""));
  const btn = h("button",{type:"submit",class:"primary"},"ذخیره کن");
  const f = h("form",{class:"card v"}); wire(f);
  f.append(h("h2",{},"درصد کمیسیون"),field("درصد از هر سفارش",p,{required:true,help:"بین ۰ تا ۴۰؛ روی سفارش‌های بعدی اعمال می‌شه"}),h("div",{class:"row"},btn));
  f.addEventListener("submit",async e=>{ e.preventDefault(); p.dispatchEvent(new Event("input")); if (!validateAll(f)) return; await withBusy(btn,"صبر کن…",()=>run(()=>sb.rpc("admin_set_commission",{p_percent:+p.value}),"ذخیره شد")); });
  render(f);
}
async function adminAudit(){
  setTitle("گزارش فعالیت");
  const {data} = await sb.from("audit_log").select("id,action,entity,created_at").order("id",{ascending:false}).limit(100);
  render(h("h2",{},"گزارش فعالیت"),(data&&data.length)?data.map(x=>h("div",{class:"card tx"},h("span",{dir:"ltr",class:"code"},x.action),h("span",{class:"mut"},fdt(x.created_at)))):empty("هنوز فعالیتی ثبت نشده","هر کار مهمی که اتفاق بیفته اینجا می‌آد."));
}

/* ---------- boot ---------- */
async function load(){
  const {data:{session}} = await sb.auth.getSession();
  me = session ? session.user : null; prof = null; provider = null;
  if (!me) return false;
  const {data:p} = await sb.from("profiles").select("id,full_name,role").eq("id",me.id).maybeSingle();
  prof = p;
  if (p && p.role==="provider"){ const {data:pp} = await sb.from("provider_profiles").select("business_name,bio,city,status,experience_years").eq("user_id",me.id).maybeSingle(); provider = pp; }
  return !!prof;
}
async function boot(){ await load(); route(); }
function recovery(){
  hideChrome();
  const pw = h("input",{type:"password",minlength:"8",maxlength:"72",autocomplete:"new-password",dir:"ltr"});
  const btn = h("button",{type:"submit",class:"primary"},"رمز رو عوض کن"), formErr = h("div",{class:"form-err",role:"alert"});
  const f = h("form",{class:"card v"}); wire(f);
  f.append(h("h2",{},"رمز جدید بذار"),field("رمز جدید",pw,{required:true,help:"حداقل ۸ تا حرف",wrap:pwWrap}),formErr,h("div",{class:"row"},btn));
  f.addEventListener("submit",async e=>{ e.preventDefault(); if (!validateAll(f)) return;
    await withBusy(btn,"صبر کن…",async()=>{ const r = await sb.auth.updateUser({password:pw.value}); if (r.error) formErr.textContent = "رمز عوض نشد؛ یه رمز قوی‌تر امتحان کن"; else { toast("رمزت عوض شد"); boot(); } }); });
  render(f); setTitle("رمز جدید");
}
document.getElementById("skip").addEventListener("click",e=>{ e.preventDefault(); app.focus(); });
window.addEventListener("hashchange",route);
sb.auth.onAuthStateChange((ev,session)=>{
  if (ev==="PASSWORD_RECOVERY") return recovery();
  if (ev==="SIGNED_OUT"){ me = null; prof = null; provider = null; setTimeout(()=>{ location.hash = "#/login"; route(); },0); return; }
  // supabase re-emits SIGNED_IN when the tab regains focus; ignore it for the same user so open forms aren't wiped
  if (ev==="SIGNED_IN" && session && me && session.user.id===me.id) return;
  if (ev==="SIGNED_IN") setTimeout(()=>{ location.hash = "#/home"; boot(); },0);
});
loading(); boot();
})();
