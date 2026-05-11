"use client";
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.min.js";

function buildHtml(snippet: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style></head><body>
<script src="${THREE_CDN}"></script>
<script>(function(){
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(window.innerWidth,window.innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000),clock=new THREE.Clock();
  try{${snippet}
    if(typeof setup==='function')setup(scene,camera);
    (function loop(){requestAnimationFrame(loop);if(typeof animate==='function')animate(scene,camera,clock.getElapsedTime());renderer.render(scene,camera);})();
  }catch(e){document.body.innerHTML='<pre style="color:red;padding:16px">'+e+'</pre>';}
  window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
})();</script></body></html>`;
}

export function ThreeJSBlock({ content, height = 300 }: { content: string; height?: number }) {
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(content))}`;
  return <iframe src={src} className="w-full rounded border border-zinc-700" style={{ height }} title="3D visualization" sandbox="allow-scripts" />;
}
