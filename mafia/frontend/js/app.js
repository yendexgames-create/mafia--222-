(function(){
  // utilities
  const toastEl = document.getElementById('toast');
  function showToast(msg, timeout=2200){
    if(!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastEl.setAttribute('aria-hidden','false');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>{ toastEl.classList.remove('show'); toastEl.setAttribute('aria-hidden','true'); }, timeout);
  }

  // set year
  const year = document.getElementById('year');
  if(year) year.textContent = new Date().getFullYear();

  // theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if(themeToggle){
    themeToggle.addEventListener('click', ()=>{ document.body.classList.toggle('dark'); });
  }

  // Register form
  const reg = document.getElementById('registerForm');
  if(reg){
    reg.addEventListener('submit', (e)=>{
      e.preventDefault();
      const data = new FormData(reg);
      const email = data.get('email')||'';
      const pwd = data.get('password')||'';
      const confirm = data.get('confirm')||'';
      if(!String(email).includes('@')) return showToast('Invalid email');
      if(String(pwd).length < 6) return showToast('Password too short');
      if(pwd !== confirm) return showToast('Passwords do not match');
      // simulate register
      const btn = reg.querySelector('button[type="submit"]');
      const prev = btn.textContent;
      btn.textContent = 'Creating...';
      btn.disabled = true;
      setTimeout(()=>{
        btn.textContent = prev; btn.disabled = false;
        showToast('Welcome to Mafia!');
        window.location.href = 'play.html';
      }, 900);
    });
  }

  // Login form
  const login = document.getElementById('loginForm');
  if(login){
    login.addEventListener('submit', (e)=>{
      e.preventDefault();
      showToast('Logged in — redirecting');
      setTimeout(()=> window.location.href = 'play.html', 700);
    });

    const tg = document.getElementById('tgLogin');
    const verify = document.getElementById('verifyTelegram');
    if(tg) tg.addEventListener('click', ()=> showToast('Redirecting to Telegram...'));
    if(verify) verify.addEventListener('click', ()=> showToast('Verification link sent to your Telegram'));
  }

  // Quick Play
  const findBtn = document.getElementById('findMatch');
  const searchBar = document.getElementById('searchBar');
  const cancelBtn = document.getElementById('cancelSearch');
  let searchTimer = null;
  if(findBtn && searchBar){
    findBtn.addEventListener('click', ()=>{
      searchBar.hidden = false;
      findBtn.disabled = true;
      searchTimer = setTimeout(()=> {
        showToast('Match found! Redirecting...');
        searchBar.hidden = true;
        findBtn.disabled = false;
        // navigate to play room demo (not implemented)
      }, 3000 + Math.random()*2500);
    });
    if(cancelBtn) cancelBtn.addEventListener('click', ()=>{
      clearTimeout(searchTimer);
      searchBar.hidden = true;
      findBtn.disabled = false;
      showToast('Search cancelled');
    });
  }

  // Connection status stub
  const conn = document.getElementById('connStatus');
  if(conn){
    let states = ['connected','reconnecting','disconnected'];
    let i=2;
    setInterval(()=>{ i=(i+1)%3; conn.className='conn '+states[i]; conn.textContent = i===0?'Connected to server':i===1?'Reconnecting...':'Disconnected'; }, 8000);
  }

  // Chat send
  const send = document.getElementById('sendMsg');
  if(send){
    send.addEventListener('click', ()=>{
      const input = document.getElementById('chatMsg');
      const val = input.value.trim();
      if(!val) return;
      const log = document.getElementById('chatLog');
      const el = document.createElement('div');
      el.textContent = 'You: ' + val;
      el.className = 'msg';
      log.appendChild(el);
      input.value = '';
      log.scrollTop = log.scrollHeight;
    });
  }

  // How-to slides
  const slides = [
    {title:'Game starts → roles assigned', text:'Each player receives a role. The game alternates between Night and Day phases.'},
    {title:'Night phase → mafia acts', text:'Mafia secretly choose a victim. Special roles perform their actions.'},
    {title:'Day phase → discussion & voting', text:'All players discuss and vote to eliminate a suspect.'},
    {title:'Elimination → next round', text:'If eliminated, a player is removed and revealed.'}
  ];
  let si = 0;
  const slideTitle = document.getElementById('slideTitle');
  const slideText = document.getElementById('slideText');
  const next = document.getElementById('nextSlide');
  const prev = document.getElementById('prevSlide');
  const tryDemo = document.getElementById('tryDemo');
  function renderSlide(){
    if(!slideTitle) return;
    slideTitle.textContent = slides[si].title;
    slideText.textContent = slides[si].text;
  }
  if(next) next.addEventListener('click', ()=>{ si = Math.min(si+1, slides.length-1); renderSlide(); });
  if(prev) prev.addEventListener('click', ()=>{ si = Math.max(si-1, 0); renderSlide(); });
  if(tryDemo) tryDemo.addEventListener('click', ()=> showToast('Starting mini demo...'));
  renderSlide();

})();