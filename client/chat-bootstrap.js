(async function () {
 try {
  let response = await fetch('/api/users/profile');
  if (response.status === 401) response = await fetch('/api/users/guest', { method: 'POST' });
  const user = await response.json();
  if (!response.ok) throw new Error(user.message || 'Unable to load your session');
  let previous;
  try { previous = JSON.parse(sessionStorage.getItem('chat_user_session') || 'null'); } catch {}
  sessionStorage.setItem('chat_user_session', JSON.stringify({ username: user.username, room: previous?.username === user.username ? previous.room : 'General', loginTimestamp: Date.now() }));
  localStorage.setItem('user', JSON.stringify(user));
  const script = document.createElement('script');
  script.src = '/chat-script.js';
  document.body.appendChild(script);
 } catch (error) { document.getElementById('chat-box').textContent = error.message; }
})();
