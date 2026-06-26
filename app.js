// Jari 2.0 front-end prototype
// 目标：先把产品逻辑重构清楚。后续可把 store 层替换为 Firebase/Cloud Functions。

const $app = document.querySelector("#app");
const CODE_PERIOD = 15;

const seedData = {
  courses: {
    "PIPL26": {
      id: "PIPL26",
      name: "개인정보보호법",
      professor: "정 교수님",
      ta: "장진호",
      semester: "2026-1",
      createdAt: Date.now() - 86400000,
      roster: {
        "20260001": { id:"20260001", name:"조예한" },
        "20260002": { id:"20260002", name:"왕니니" },
        "20260003": { id:"20260003", name:"이오화" },
        "20260004": { id:"20260004", name:"송연호" }
      },
      enrolled: ["20260001","20260002","20260003","20260004"],
      seatOpen: true,
      seats: {
        "0-0": { studentId:"20260001" },
        "0-1": { studentId:"20260002" },
        "1-0": { studentId:"20260003" }
      },
      meetings: {
        "m1": {
          id:"m1",
          title:"1주차",
          date:"2026-03-02",
          preOpen:false,
          postOpen:false,
          preStartedAt:null,
          postStartedAt:null,
          secret:"demo-pre-secret",
          checkins: {
            "20260001": { pre:{at:Date.now()-500000, method:"auto", device:"demo"}, post:{at:Date.now()-200000, method:"auto", device:"demo"} },
            "20260002": { pre:{at:Date.now()-400000, method:"auto", device:"demo"} }
          }
        }
      },
      notices: [
        { id:"n1", important:true, title:"8주차는 시험주간입니다", body:"8주차와 15주차는 시험주간입니다. 출석 처리 기준은 별도 안내합니다.", createdAt:Date.now()-3600000, reads:{} }
      ],
      qas: [
        { id:"q1", studentId:"20260002", text:"좌석 변경이 가능한가요?", createdAt:Date.now()-7200000, status:"open", answer:"좌석 변경은 TA 승인 후 가능합니다." }
      ],
      makeupRequests: [
        { id:"r1", meetingId:"m1", studentId:"20260004", phase:"pre", reason:"네트워크 문제로 출석 실패", status:"pending", createdAt:Date.now()-1800000 }
      ]
    }
  },
  users: {
    "20260001": { id:"20260001", name:"조예한", courseIds:["PIPL26"] },
    "20260002": { id:"20260002", name:"왕니니", courseIds:["PIPL26"] },
    "20260003": { id:"20260003", name:"이오화", courseIds:["PIPL26"] },
    "20260004": { id:"20260004", name:"송연호", courseIds:["PIPL26"] }
  },
  admins: {
    "ta": { id:"ta", name:"张津浩 / 장진호", courseIds:["PIPL26"] }
  }
};

const store = {
  key: "jari2_state_v1",
  load(){
    const raw = localStorage.getItem(this.key);
    if(raw) return JSON.parse(raw);
    const cloned = JSON.parse(JSON.stringify(seedData));
    localStorage.setItem(this.key, JSON.stringify(cloned));
    return cloned;
  },
  save(data){ localStorage.setItem(this.key, JSON.stringify(data)); },
  reset(){ localStorage.removeItem(this.key); }
};

let db = store.load();
let session = JSON.parse(localStorage.getItem("jari2_session") || "null") || {
  role: null, userId: null, adminId: null, activeCourseId: null, view: "welcome", tab: "checkin"
};

function saveSession(){ localStorage.setItem("jari2_session", JSON.stringify(session)); }
function saveDB(){ store.save(db); }
function now(){ return Date.now(); }
function fmt(ts){ if(!ts) return "-"; const d = new Date(ts); return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function pad(n){ return String(n).padStart(2,"0"); }
function uid(prefix="id"){ return prefix + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function deviceId(){
  let id = localStorage.getItem("jari2_device");
  if(!id){ id = "dev_" + uid(""); localStorage.setItem("jari2_device", id); }
  return id;
}
function toast(msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 1900);
}
function route(view, extra={}){
  Object.assign(session, extra, { view });
  saveSession();
  render();
}
function currentUser(){
  if(session.role === "student") return db.users[session.userId] || null;
  if(session.role === "ta") return db.admins[session.adminId] || null;
  return null;
}
function activeCourse(){ return session.activeCourseId ? db.courses[session.activeCourseId] : null; }
function courseStudents(course){
  return (course.enrolled || []).map(id => course.roster[id] || db.users[id] || {id, name:id});
}
function latestMeeting(course){
  const list = Object.values(course.meetings || {}).sort((a,b)=>(b.createdAt || 0) - (a.createdAt || 0));
  return list[0] || null;
}
function codeFor(courseId, meetingId, phase){
  const course = db.courses[courseId];
  const m = course?.meetings?.[meetingId];
  if(!m) return "------";
  const startedAt = phase === "pre" ? m.preStartedAt : m.postStartedAt;
  if(!startedAt) return "------";
  const win = Math.floor((now() - startedAt) / (CODE_PERIOD * 1000));
  const secret = m.secret || "demo";
  let seed = 2166136261;
  const s = `${courseId}|${meetingId}|${phase}|${secret}|${win}`;
  for(let i=0;i<s.length;i++){ seed ^= s.charCodeAt(i); seed = Math.imul(seed, 16777619) >>> 0; }
  return String(seed % 1000000).padStart(6, "0");
}
function secondsLeft(courseId, meetingId, phase){
  const c = db.courses[courseId], m = c?.meetings?.[meetingId];
  const startedAt = phase === "pre" ? m?.preStartedAt : m?.postStartedAt;
  if(!startedAt) return 0;
  return CODE_PERIOD - Math.floor(((now() - startedAt)/1000) % CODE_PERIOD);
}
setInterval(()=>{
  if(document.querySelector("[data-live-code]")) {
    document.querySelectorAll("[data-live-code]").forEach(el=>{
      const [cid, mid, phase] = el.dataset.liveCode.split("|");
      el.textContent = codeFor(cid, mid, phase);
    });
    document.querySelectorAll("[data-left]").forEach(el=>{
      const [cid, mid, phase] = el.dataset.left.split("|");
      const left = secondsLeft(cid, mid, phase);
      el.textContent = left + "s";
    });
    document.querySelectorAll("[data-bar]").forEach(el=>{
      const [cid, mid, phase] = el.dataset.bar.split("|");
      const left = secondsLeft(cid, mid, phase);
      el.style.width = `${left / CODE_PERIOD * 100}%`;
    });
  }
}, 1000);

function shell(content){
  const user = currentUser();
  return `
  <div class="app-shell">
    <div class="topbar">
      <div class="logo">J</div>
      <div class="brand">Jari 2.0<small>Classroom Operations Workspace</small></div>
      <div class="spacer"></div>
      ${user ? `<span class="badge gray">${session.role === "ta" ? "TA" : "학생"} · ${esc(user.name)}</span>` : ""}
      ${user ? `<button class="btn gray" onclick="logout()">退出</button>` : ""}
    </div>
    <main class="wrap">${content}</main>
  </div>`;
}

window.logout = function(){
  session = { role:null, userId:null, adminId:null, activeCourseId:null, view:"welcome", tab:"checkin" };
  saveSession(); render();
};

function welcomeView(){
  return shell(`
    <section class="hero">
      <div class="eyebrow">JARI 2.0</div>
      <h1>给 TA 用的课堂运行管理工作台</h1>
      <p>核心不是“聊天”或“LMS”，而是把出勤、座位、公告、补签、提问和导出变成可追溯的课堂管理流程。</p>
      <div class="row" style="margin-top:18px">
        <button class="btn" onclick="route('studentLogin')">学生端进入</button>
        <button class="btn ghost" onclick="route('taLogin')">TA 端进入</button>
      </div>
    </section>

    <div class="grid3" style="margin-top:14px">
      <div class="card"><h3>减少纠纷</h3><p>动态验证码、座位锁定、补签留痕，减少“我来了”“座位不公平”等争议。</p></div>
      <div class="card"><h3>降低工作量</h3><p>TA 不再靠微信群、Excel、纸质名单拼流程，期末可直接导出。</p></div>
      <div class="card"><h3>不替代 iClass</h3><p>iClass 管教学内容，Jari 管课堂运行和事务流程。</p></div>
    </div>
  `);
}

function studentLoginView(){
  const last = JSON.parse(localStorage.getItem("jari2_last_student") || "null");
  return shell(`
    <div class="card">
      <h2>学生身份</h2>
      <p>2.0 改动：不会直接默认进入上次账号，而是先确认身份，避免公共设备或测试时误用。</p>
      ${last ? `
        <div class="notice">
          <div class="title">上次身份：${esc(last.name)} · ${esc(last.id)}</div>
          <div class="meta">继续使用，或切换学号</div>
          <button class="btn" onclick="studentContinue('${esc(last.id)}')">继续使用</button>
        </div>
      ` : ""}
      <div class="field"><label>学号</label><input id="sid" placeholder="20260001" /></div>
      <div class="field"><label>姓名</label><input id="sname" placeholder="张三 / 홍길동" /></div>
      <button class="btn full" onclick="studentLogin()">进入学生端</button>
      <button class="btn ghost full" onclick="route('welcome')">返回</button>
    </div>
  `);
}
window.studentContinue = function(id){
  const u = db.users[id];
  if(!u) return toast("找不到该学生");
  session.role = "student"; session.userId = id; session.view = "studentHome";
  saveSession(); render();
};
window.studentLogin = function(){
  const id = document.querySelector("#sid").value.trim();
  const name = document.querySelector("#sname").value.trim();
  if(!id || !name) return toast("请输入学号和姓名");
  if(!db.users[id]) db.users[id] = { id, name, courseIds: [] };
  db.users[id].name = name;
  saveDB();
  localStorage.setItem("jari2_last_student", JSON.stringify({id, name}));
  session.role = "student"; session.userId = id; session.view = "studentHome";
  saveSession(); render();
};

function studentHomeView(){
  const user = currentUser();
  const ids = user.courseIds || [];
  const cards = ids.map(id => {
    const c = db.courses[id];
    if(!c) return "";
    const m = latestMeeting(c);
    const ci = m?.checkins?.[user.id] || {};
    const status = ci.pre && ci.post ? "完整出勤" : ci.pre || ci.post ? "部分签到" : "待签到";
    return `
    <div class="course-card">
      <div>
        <div class="course-title">${esc(c.name)}</div>
        <p>${esc(c.professor || "")} · ${esc(c.semester || "")}</p>
        <div class="row tight" style="margin-top:8px">
          <span class="badge">${esc(c.id)}</span>
          <span class="badge ${status === "完整出勤" ? "green" : status === "部分签到" ? "orange" : "gray"}">${status}</span>
        </div>
      </div>
      <button class="btn" onclick="openCourse('${c.id}')">进入课程</button>
    </div>`;
  }).join("");
  return shell(`
    <section class="hero">
      <div class="eyebrow">STUDENT HOME</div>
      <h1>我的课程</h1>
      <p>2.0 把“账号状态”和“课程状态”分开。首页只管课程列表，进入课程后再处理签到、座位、公告、提问和记录。</p>
    </section>
    <div class="card">
      <div class="row">
        <h2 style="margin:0">课程列表</h2>
        <div class="spacer"></div>
        <button class="btn ghost" onclick="openJoinModal()">+ 加入课程</button>
      </div>
      <div style="margin-top:14px">${cards || `<p>暂无课程。请点击“加入课程”，输入课程码，例如 PIPL26。</p>`}</div>
    </div>
  `);
}
window.openCourse = function(id){ session.activeCourseId = id; session.view = "studentCourse"; session.tab = "checkin"; saveSession(); render(); };
window.openJoinModal = function(){
  modal(`
    <h2>加入课程</h2>
    <p>QR 只是一次性加入课程。后续签到在课程内通过动态验证码完成。</p>
    <div class="field"><label>课程码</label><input id="joinCode" placeholder="PIPL26" /></div>
    <button class="btn full" onclick="joinCourse()">加入</button>
    <button class="btn gray full" onclick="closeModal()">取消</button>
  `);
};
window.joinCourse = function(){
  const code = document.querySelector("#joinCode").value.trim().toUpperCase();
  const user = currentUser();
  const c = db.courses[code];
  if(!c) return toast("课程不存在");
  user.courseIds ||= [];
  if(!user.courseIds.includes(code)) user.courseIds.push(code);
  c.enrolled ||= [];
  if(!c.enrolled.includes(user.id)) c.enrolled.push(user.id);
  c.roster ||= {};
  c.roster[user.id] = {id:user.id, name:user.name};
  saveDB(); closeModal(); openCourse(code);
};

function studentCourseView(){
  const c = activeCourse();
  if(!c) return studentHomeView();
  const tabs = [
    ["checkin","签到"],
    ["seat","座位"],
    ["notices","公告"],
    ["qa","提问"],
    ["records","记录"]
  ];
  return shell(`
    <div class="row">
      <button class="btn gray" onclick="route('studentHome',{activeCourseId:null})">← 我的课程</button>
      <div>
        <h1 style="margin:0">${esc(c.name)}</h1>
        <p>${esc(c.id)} · ${esc(c.professor || "")}</p>
      </div>
    </div>
    <div class="tabs">${tabs.map(([id,name])=>`<button class="tab ${session.tab===id?'on':''}" onclick="setTab('${id}')">${name}</button>`).join("")}</div>
    ${studentTab(c)}
  `);
}
window.setTab = function(tab){ session.tab = tab; saveSession(); render(); };

function studentTab(c){
  if(session.tab === "checkin") return studentCheckin(c);
  if(session.tab === "seat") return studentSeat(c);
  if(session.tab === "notices") return noticesView(c, false);
  if(session.tab === "qa") return qaView(c, false);
  if(session.tab === "records") return studentRecords(c);
  return "";
}
function studentCheckin(c){
  const m = latestMeeting(c);
  if(!m) return `<div class="card"><h2>暂无课堂</h2><p>TA 还没有开始本课程的课堂。</p></div>`;
  const ci = m.checkins?.[session.userId] || {};
  const preOpen = !!m.preOpen, postOpen = !!m.postOpen;
  return `
  <div class="grid3">
    <div class="stat"><div class="n">${ci.pre ? "✓" : "-"}</div><div class="t">课前</div></div>
    <div class="stat"><div class="n">${ci.post ? "✓" : "-"}</div><div class="t">课后</div></div>
    <div class="stat"><div class="n">${preOpen || postOpen ? "进行中" : "未开放"}</div><div class="t">签到状态</div></div>
  </div>
  <div class="card">
    <h2>${esc(m.title)} · 签到</h2>
    <p>输入 TA 投屏上的 6 位动态验证码。验证码每 15 秒刷新。当前原型仍为前端验证，正式版建议迁移到后端验证。</p>
    <div class="row" style="margin-top:12px">
      <button class="btn ${preOpen?'green':'gray'}" ${preOpen?'':'disabled'} onclick="openCheckinModal('pre')">课前签到</button>
      <button class="btn ${postOpen?'orange':'gray'}" ${postOpen?'':'disabled'} onclick="openCheckinModal('post')">课后签到</button>
    </div>
    <div class="divider"></div>
    <h3>补签</h3>
    <p>忘记签到或网络问题时，提交补签申请，由 TA 审批并留痕。</p>
    <button class="btn ghost" onclick="openMakeupModal()">申请补签</button>
  </div>`;
}
window.openCheckinModal = function(phase){
  modal(`
    <h2>${phase === "pre" ? "课前" : "课后"}签到</h2>
    <p>请输入投屏动态验证码。</p>
    <div class="field"><label>6位验证码</label><input id="checkCode" placeholder="000000" inputmode="numeric" maxlength="6" /></div>
    <button class="btn full" onclick="submitCheckin('${phase}')">签到</button>
    <button class="btn gray full" onclick="closeModal()">取消</button>
  `);
};
window.submitCheckin = function(phase){
  const code = document.querySelector("#checkCode").value.trim();
  const c = activeCourse(), m = latestMeeting(c);
  const correct = codeFor(c.id, m.id, phase);
  if(code !== correct) return toast("验证码错误");
  m.checkins ||= {};
  m.checkins[session.userId] ||= {};
  m.checkins[session.userId][phase] = { at: now(), method:"code", device:deviceId(), userAgent:navigator.userAgent.slice(0,80) };
  saveDB(); closeModal(); toast("签到成功"); render();
};
window.openMakeupModal = function(){
  const c = activeCourse(), m = latestMeeting(c);
  modal(`
    <h2>补签申请</h2>
    <div class="field"><label>阶段</label><select id="mkPhase"><option value="pre">课前</option><option value="post">课后</option></select></div>
    <div class="field"><label>原因</label><textarea id="mkReason" rows="4" placeholder="例如：网络问题，已在教室但未能及时输入验证码。"></textarea></div>
    <button class="btn full" onclick="submitMakeup('${c.id}','${m.id}')">提交申请</button>
    <button class="btn gray full" onclick="closeModal()">取消</button>
  `);
};
window.submitMakeup = function(cid, mid){
  const c = db.courses[cid];
  c.makeupRequests ||= [];
  c.makeupRequests.push({
    id:uid("req_"), meetingId:mid, studentId:session.userId,
    phase:document.querySelector("#mkPhase").value,
    reason:document.querySelector("#mkReason").value.trim(),
    status:"pending", createdAt:now()
  });
  saveDB(); closeModal(); toast("已提交补签申请"); render();
};

function studentSeat(c){
  const me = session.userId;
  let rows = "";
  for(let r=0;r<6;r++){
    let cells = "";
    for(let col=0;col<8;col++){
      const key = `${r}-${col}`;
      const s = c.seats?.[key];
      const cls = s?.studentId === me ? "mine" : s?.studentId ? "taken" : "";
      const text = s?.studentId === me ? "我" : s?.studentId ? "占" : `${String.fromCharCode(65+col)}${r+1}`;
      cells += `<button class="seat ${cls}" onclick="pickSeat('${key}')" ${s?.studentId && s.studentId !== me ? "disabled" : ""}>${text}</button>`;
    }
    rows += `<div class="seat-row">${cells}</div>`;
  }
  return `
  <div class="card">
    <h2>座位管理</h2>
    <p>学生自主选座，TA 可以锁定座位。核心价值是减少“为什么我坐那里”的纠纷。</p>
    <div class="seat-stage">
      <div class="board">SCREEN</div>
      <div class="seat-grid">${rows}</div>
    </div>
  </div>`;
}
window.pickSeat = function(key){
  const c = activeCourse();
  if(!c.seatOpen) return toast("选座尚未开放");
  c.seats ||= {};
  const occupied = c.seats[key]?.studentId;
  if(occupied && occupied !== session.userId) return toast("该座位已被占用");
  Object.keys(c.seats).forEach(k=>{ if(c.seats[k]?.studentId === session.userId) delete c.seats[k]; });
  c.seats[key] = { studentId:session.userId, at:now() };
  saveDB(); toast("已选座"); render();
};

function noticesView(c, isTA){
  const list = (c.notices || []).slice().sort((a,b)=>b.createdAt-a.createdAt).map(n=>{
    const read = !!n.reads?.[session.userId];
    return `<div class="notice">
      <div class="row">
        <div class="title">${n.important ? "📌 " : ""}${esc(n.title)}</div>
        <div class="spacer"></div>
        ${!isTA ? `<span class="badge ${read?'green':'orange'}">${read?'已读':'未确认'}</span>` : `<span class="badge gray">已读 ${Object.keys(n.reads || {}).length}</span>`}
      </div>
      <div class="meta">${fmt(n.createdAt)}</div>
      <p>${esc(n.body)}</p>
      ${!isTA && !read ? `<button class="btn ghost" style="margin-top:10px" onclick="markNoticeRead('${n.id}')">确认已读</button>` : ""}
    </div>`;
  }).join("");
  return `
    ${isTA ? `<div class="card">
      <h2>发布公告</h2>
      <div class="field"><label>标题</label><input id="ntTitle" placeholder="例如：下周休讲通知" /></div>
      <div class="field"><label>内容</label><textarea id="ntBody" rows="3"></textarea></div>
      <label class="row" style="margin-top:10px"><input id="ntImportant" type="checkbox" style="width:auto"> 重要公告</label>
      <button class="btn full" onclick="createNotice()">发布公告</button>
    </div>` : ""}
    <div class="card"><h2>课程公告</h2>${list || "<p>暂无公告。</p>"}</div>`;
}
window.markNoticeRead = function(id){
  const c = activeCourse();
  const n = c.notices.find(x=>x.id===id);
  n.reads ||= {}; n.reads[session.userId] = now();
  saveDB(); toast("已确认"); render();
};
window.createNotice = function(){
  const c = activeCourse();
  c.notices ||= [];
  c.notices.push({
    id:uid("nt_"),
    title:document.querySelector("#ntTitle").value.trim() || "未命名公告",
    body:document.querySelector("#ntBody").value.trim(),
    important:document.querySelector("#ntImportant").checked,
    createdAt:now(),
    reads:{}
  });
  saveDB(); toast("已发布"); render();
};

function qaView(c, isTA){
  const items = (c.qas || []).slice().sort((a,b)=>b.createdAt-a.createdAt).map(q=>{
    const stu = c.roster?.[q.studentId] || db.users[q.studentId] || {name:q.studentId};
    return `<div class="qa-item">
      <div class="row"><b>${esc(stu.name)}</b><span class="badge ${q.status==='closed'?'green':'orange'}">${q.status==='closed'?'已处理':'待处理'}</span></div>
      <p style="margin-top:8px">${esc(q.text)}</p>
      ${q.answer ? `<div class="warn" style="margin-top:10px">TA 回复：${esc(q.answer)}</div>` : ""}
      ${isTA ? `<button class="btn ghost" style="margin-top:10px" onclick="openAnswerModal('${q.id}')">回复/处理</button>` : ""}
    </div>`;
  }).join("");
  return `
  ${!isTA ? `<div class="card">
    <h2>向 TA 提问</h2>
    <p>这不是群聊，而是课程事务提问箱：问题归档、可处理、可追溯。</p>
    <div class="field"><textarea id="qText" rows="3" placeholder="请输入问题，例如：我可以申请换座吗？"></textarea></div>
    <button class="btn full" onclick="submitQuestion()">提交问题</button>
  </div>` : ""}
  <div class="card"><h2>${isTA ? "学生提问" : "我的课程问答"}</h2>${items || "<p>暂无问题。</p>"}</div>`;
}
window.submitQuestion = function(){
  const c = activeCourse();
  const text = document.querySelector("#qText").value.trim();
  if(!text) return toast("请输入问题");
  c.qas ||= [];
  c.qas.push({ id:uid("q_"), studentId:session.userId, text, createdAt:now(), status:"open", answer:"" });
  saveDB(); toast("已提交"); render();
};
window.openAnswerModal = function(qid){
  modal(`
    <h2>回复问题</h2>
    <div class="field"><label>回复内容</label><textarea id="answerText" rows="4"></textarea></div>
    <button class="btn full" onclick="answerQuestion('${qid}')">保存并标记已处理</button>
    <button class="btn gray full" onclick="closeModal()">取消</button>
  `);
};
window.answerQuestion = function(qid){
  const c = activeCourse();
  const q = c.qas.find(x=>x.id===qid);
  q.answer = document.querySelector("#answerText").value.trim();
  q.status = "closed";
  q.answeredAt = now();
  saveDB(); closeModal(); toast("已处理"); render();
};

function studentRecords(c){
  const rows = Object.values(c.meetings || {}).map(m=>{
    const ci = m.checkins?.[session.userId] || {};
    return `<tr><td>${esc(m.title)}</td><td>${ci.pre ? fmt(ci.pre.at) : "-"}</td><td>${ci.post ? fmt(ci.post.at) : "-"}</td><td>${ci.pre && ci.post ? "完整" : ci.pre || ci.post ? "部分" : "缺席"}</td></tr>`;
  }).join("");
  return `<div class="card"><h2>我的出勤记录</h2><div class="table-wrap"><table><thead><tr><th>课次</th><th>课前</th><th>课后</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function taLoginView(){
  return shell(`
    <div class="card">
      <h2>TA 端</h2>
      <p>演示账号直接进入。正式版应使用后端权限，不要把邀请码写在前端。</p>
      <button class="btn full" onclick="taLogin()">以 TA 身份进入</button>
      <button class="btn ghost full" onclick="route('welcome')">返回</button>
    </div>
  `);
}
window.taLogin = function(){
  session.role = "ta"; session.adminId = "ta"; session.view = "taHome"; saveSession(); render();
};

function taHomeView(){
  const admin = currentUser();
  const cards = (admin.courseIds || []).map(id=>{
    const c = db.courses[id]; if(!c) return "";
    return `<div class="course-card">
      <div>
        <div class="course-title">${esc(c.name)}</div>
        <p>${esc(c.id)} · ${courseStudents(c).length}명 · ${esc(c.semester)}</p>
      </div>
      <button class="btn" onclick="openTACourse('${c.id}')">管理</button>
    </div>`;
  }).join("");
  return shell(`
    <section class="hero">
      <div class="eyebrow">TA WORKSPACE</div>
      <h1>课程运行管理</h1>
      <p>TA 端按工作流设计：今日课堂、出勤、座位、公告、提问、补签、导出。</p>
    </section>
    <div class="card">
      <div class="row"><h2 style="margin:0">我的课程</h2><div class="spacer"></div><button class="btn ghost" onclick="openCreateCourse()">+ 新建课程</button></div>
      <div style="margin-top:14px">${cards}</div>
    </div>
  `);
}
window.openTACourse = function(id){ session.activeCourseId = id; session.view = "taCourse"; session.tab = "today"; saveSession(); render(); };
window.openCreateCourse = function(){
  modal(`
    <h2>新建课程</h2>
    <div class="field"><label>课程码</label><input id="ccode" placeholder="CORP26" /></div>
    <div class="field"><label>课程名</label><input id="cname" placeholder="회사법" /></div>
    <div class="field"><label>教授</label><input id="cprof" placeholder="정 교수님" /></div>
    <button class="btn full" onclick="createCourse()">创建</button>
    <button class="btn gray full" onclick="closeModal()">取消</button>
  `);
};
window.createCourse = function(){
  const code = document.querySelector("#ccode").value.trim().toUpperCase();
  const name = document.querySelector("#cname").value.trim();
  if(!code || !name) return toast("请输入课程码和课程名");
  db.courses[code] = { id:code, name, professor:document.querySelector("#cprof").value.trim(), ta:currentUser().name, semester:"2026-1", createdAt:now(), roster:{}, enrolled:[], seats:{}, meetings:{}, notices:[], qas:[], makeupRequests:[], seatOpen:false };
  currentUser().courseIds ||= [];
  currentUser().courseIds.push(code);
  saveDB(); closeModal(); openTACourse(code);
};

function taCourseView(){
  const c = activeCourse();
  const tabs = [
    ["today","今日课堂"],
    ["attendance","出勤管理"],
    ["seatAdmin","座位管理"],
    ["notices","公告"],
    ["qa","提问"],
    ["makeup","补签"],
    ["export","导出"]
  ];
  return shell(`
    <div class="row">
      <button class="btn gray" onclick="route('taHome',{activeCourseId:null})">← 课程列表</button>
      <div><h1 style="margin:0">${esc(c.name)}</h1><p>${esc(c.id)} · ${esc(c.professor || "")}</p></div>
    </div>
    <div class="tabs">${tabs.map(([id,name])=>`<button class="tab ${session.tab===id?'on':''}" onclick="setTab('${id}')">${name}</button>`).join("")}</div>
    ${taTab(c)}
  `);
}
function taTab(c){
  if(session.tab === "today") return taToday(c);
  if(session.tab === "attendance") return taAttendance(c);
  if(session.tab === "seatAdmin") return taSeatAdmin(c);
  if(session.tab === "notices") return noticesView(c, true);
  if(session.tab === "qa") return qaView(c, true);
  if(session.tab === "makeup") return taMakeup(c);
  if(session.tab === "export") return taExport(c);
  return "";
}
function taToday(c){
  const m = latestMeeting(c);
  return `
  <div class="grid3">
    <div class="stat"><div class="n">${courseStudents(c).length}</div><div class="t">学生</div></div>
    <div class="stat"><div class="n">${Object.keys(c.meetings || {}).length}</div><div class="t">课次</div></div>
    <div class="stat"><div class="n">${(c.makeupRequests || []).filter(r=>r.status==="pending").length}</div><div class="t">待处理补签</div></div>
  </div>
  <div class="card">
    <h2>今日课堂</h2>
    ${m ? `<p>当前课次：${esc(m.title)}</p>` : `<p>还没有课次。</p>`}
    <div class="row" style="margin-top:12px">
      <button class="btn" onclick="createMeeting()">新建课次</button>
      ${m ? `<button class="btn green" onclick="toggleSign('${m.id}','pre')">${m.preOpen?'关闭课前':'开始课前'}</button>
      <button class="btn orange" onclick="toggleSign('${m.id}','post')">${m.postOpen?'关闭课后':'开始课后'}</button>` : ""}
    </div>
  </div>
  ${m && (m.preOpen || m.postOpen) ? `<div class="card"><h2>投屏验证码</h2>${m.preOpen ? codeBox(c,m,"pre") : ""}${m.postOpen ? codeBox(c,m,"post") : ""}</div>` : ""}`;
}
function codeBox(c,m,phase){
  return `<div class="codebox" style="margin-top:12px">
    <div class="small">${phase==="pre" ? "课前签到" : "课后签到"}</div>
    <div class="bigcode" data-live-code="${c.id}|${m.id}|${phase}">${codeFor(c.id,m.id,phase)}</div>
    <div class="progress"><i data-bar="${c.id}|${m.id}|${phase}"></i></div>
    <div class="small">刷新倒计时：<b data-left="${c.id}|${m.id}|${phase}">${secondsLeft(c.id,m.id,phase)}s</b></div>
  </div>`;
}
window.createMeeting = function(){
  const c = activeCourse();
  const idx = Object.keys(c.meetings || {}).length + 1;
  const id = uid("m_");
  c.meetings ||= {};
  c.meetings[id] = { id, title:`${idx}주차`, date:new Date().toISOString().slice(0,10), createdAt:now(), preOpen:false, postOpen:false, preStartedAt:null, postStartedAt:null, secret:uid("sec_"), checkins:{} };
  saveDB(); toast("已新建课次"); render();
};
window.toggleSign = function(mid, phase){
  const c = activeCourse(), m = c.meetings[mid];
  const keyOpen = phase === "pre" ? "preOpen" : "postOpen";
  const keyStarted = phase === "pre" ? "preStartedAt" : "postStartedAt";
  m[keyOpen] = !m[keyOpen];
  if(m[keyOpen]) m[keyStarted] = now();
  saveDB(); render();
};

function taAttendance(c){
  const m = latestMeeting(c);
  if(!m) return `<div class="card"><h2>暂无课次</h2></div>`;
  const rows = courseStudents(c).map(s=>{
    const ci = m.checkins?.[s.id] || {};
    return `<tr><td>${esc(s.name)}</td><td>${esc(s.id)}</td><td>${ci.pre ? fmt(ci.pre.at) : "-"}</td><td>${ci.post ? fmt(ci.post.at) : "-"}</td><td>${ci.pre&&ci.post ? "完整" : ci.pre||ci.post ? "部分" : "缺席"}</td><td><button class="btn ghost" onclick="manualCheckin('${s.id}')">补签</button></td></tr>`;
  }).join("");
  return `<div class="card"><h2>出勤管理 · ${esc(m.title)}</h2><div class="table-wrap"><table><thead><tr><th>姓名</th><th>学号</th><th>课前</th><th>课后</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
window.manualCheckin = function(studentId){
  const c = activeCourse(), m = latestMeeting(c);
  modal(`
    <h2>TA 手动补签</h2>
    <div class="field"><label>阶段</label><select id="manualPhase"><option value="pre">课前</option><option value="post">课后</option></select></div>
    <div class="field"><label>原因</label><textarea id="manualReason" rows="3" placeholder="例如：学生现场说明，TA确认在教室。"></textarea></div>
    <button class="btn full" onclick="saveManualCheckin('${studentId}','${m.id}')">保存补签</button>
    <button class="btn gray full" onclick="closeModal()">取消</button>
  `);
};
window.saveManualCheckin = function(studentId, mid){
  const c = activeCourse(), m = c.meetings[mid];
  const phase = document.querySelector("#manualPhase").value;
  m.checkins ||= {}; m.checkins[studentId] ||= {};
  m.checkins[studentId][phase] = { at:now(), method:"manual", by:session.adminId, reason:document.querySelector("#manualReason").value.trim() };
  saveDB(); closeModal(); toast("已补签"); render();
};

function taSeatAdmin(c){
  return `<div class="card">
    <h2>座位管理</h2>
    <p>TA 可以开放/关闭选座。正式版可增加锁定座位、换座申请、座位导出。</p>
    <div class="row" style="margin-top:12px">
      <button class="btn ${c.seatOpen?'danger':'green'}" onclick="toggleSeatOpen()">${c.seatOpen?'关闭选座':'开放选座'}</button>
      <button class="btn ghost" onclick="clearSeats()">清空座位</button>
    </div>
  </div>${studentSeat(c)}`;
}
window.toggleSeatOpen = function(){ const c=activeCourse(); c.seatOpen=!c.seatOpen; saveDB(); render(); };
window.clearSeats = function(){ if(!confirm("确定清空座位？")) return; activeCourse().seats = {}; saveDB(); render(); };

function taMakeup(c){
  const list = (c.makeupRequests || []).slice().sort((a,b)=>b.createdAt-a.createdAt).map(r=>{
    const s = c.roster?.[r.studentId] || db.users[r.studentId] || {name:r.studentId};
    return `<div class="notice">
      <div class="row"><b>${esc(s.name)} · ${esc(r.phase)}</b><span class="badge ${r.status==='pending'?'orange':r.status==='approved'?'green':'red'}">${esc(r.status)}</span></div>
      <div class="meta">${fmt(r.createdAt)}</div>
      <p>${esc(r.reason)}</p>
      ${r.status==="pending" ? `<div class="row" style="margin-top:10px"><button class="btn green" onclick="approveMakeup('${r.id}')">通过</button><button class="btn danger" onclick="rejectMakeup('${r.id}')">拒绝</button></div>` : ""}
    </div>`;
  }).join("");
  return `<div class="card"><h2>补签审批</h2>${list || "<p>暂无补签申请。</p>"}</div>`;
}
window.approveMakeup = function(rid){
  const c = activeCourse(), r = c.makeupRequests.find(x=>x.id===rid), m = c.meetings[r.meetingId];
  r.status = "approved"; r.reviewedAt = now(); r.reviewedBy = session.adminId;
  m.checkins ||= {}; m.checkins[r.studentId] ||= {};
  m.checkins[r.studentId][r.phase] = { at:now(), method:"makeup", by:session.adminId, requestId:rid, reason:r.reason };
  saveDB(); toast("已通过"); render();
};
window.rejectMakeup = function(rid){
  const c = activeCourse(), r = c.makeupRequests.find(x=>x.id===rid);
  r.status = "rejected"; r.reviewedAt = now(); r.reviewedBy = session.adminId;
  saveDB(); toast("已拒绝"); render();
};

function taExport(c){
  return `<div class="card">
    <h2>导出</h2>
    <p>2.0 的导出不只是导原始数据，而是导“结果”：课前、课后、状态、补签方式、设备信息等。</p>
    <div class="row" style="margin-top:12px">
      <button class="btn" onclick="exportAttendance()">导出出勤 CSV</button>
      <button class="btn ghost" onclick="exportSeats()">导出座位 CSV</button>
    </div>
  </div>`;
}
window.exportAttendance = function(){
  const c = activeCourse();
  let csv = "\ufeff课程,课次,学号,姓名,课前,课后,状态\n";
  Object.values(c.meetings || {}).forEach(m=>{
    courseStudents(c).forEach(s=>{
      const ci = m.checkins?.[s.id] || {};
      const status = ci.pre&&ci.post ? "完整" : ci.pre||ci.post ? "部分" : "缺席";
      csv += [c.name,m.title,s.id,s.name,ci.pre?fmt(ci.pre.at):"",ci.post?fmt(ci.post.at):"",status].map(x=>`"${String(x).replaceAll('"','""')}"`).join(",") + "\n";
    });
  });
  download(`${c.id}_attendance.csv`, csv);
};
window.exportSeats = function(){
  const c = activeCourse();
  let csv = "\ufeff座位,学号,姓名\n";
  Object.entries(c.seats || {}).forEach(([seat, v])=>{
    const s = c.roster?.[v.studentId] || db.users[v.studentId] || {id:v.studentId,name:""};
    csv += `"${seat}","${s.id}","${s.name}"\n`;
  });
  download(`${c.id}_seats.csv`, csv);
};
function download(name, text){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type:"text/csv;charset=utf-8"}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function modal(html){
  const div = document.createElement("div");
  div.className = "modal-backdrop";
  div.id = "modalRoot";
  div.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(div);
}
window.closeModal = function(){ document.querySelector("#modalRoot")?.remove(); };

function render(){
  if(!session.role) {
    if(session.view === "studentLogin") $app.innerHTML = studentLoginView();
    else if(session.view === "taLogin") $app.innerHTML = taLoginView();
    else $app.innerHTML = welcomeView();
    return;
  }
  if(session.role === "student"){
    if(session.view === "studentCourse") $app.innerHTML = studentCourseView();
    else $app.innerHTML = studentHomeView();
    return;
  }
  if(session.role === "ta"){
    if(session.view === "taCourse") $app.innerHTML = taCourseView();
    else $app.innerHTML = taHomeView();
  }
}
render();

// 暴露 route 给 onclick
window.route = route;

// 调试工具
window.jari2 = { db, session, reset(){ store.reset(); localStorage.removeItem("jari2_session"); location.reload(); } };
