(function(){
'use strict';
function initialMode(saved){return saved==='dark'||saved==='light'?saved:'light';}
function apply(){
 let saved;try{saved=localStorage.getItem('fayna_theme');}catch(e){saved=null;}
 if(saved==='dark'||saved==='light')return;
 if(typeof window._applyTheme==='function')window._applyTheme(initialMode(saved));
}
if(typeof window!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();}
if(typeof module!=='undefined')module.exports={initialMode};
})();
