// Signed-out visitors stay on /. A session in localStorage continues into the app.
export function landingGateScript(cloudMode: boolean) {
  const cloud = cloudMode ? 'true' : 'false';
  return `<script>(function(){function read(key){try{var value=localStorage.getItem(key);if(value!=='undefined'&&value!==null)return JSON.parse(value);}catch(e){}return null;}var cloud=${cloud};var token=read('umami.auth');if(!cloud&&!token)return;var landing=null;try{landing=localStorage.getItem('stellog.landing');}catch(e){}if(landing==='/admin/projects'){location.replace(landing);return;}var team=read('umami.last-team');location.replace(team?'/teams/'+team+'/websites':'/overview');})();</script>`;
}
