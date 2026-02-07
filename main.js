import * as THREE from "three";
import { GPUComputationRenderer } from
"https://unpkg.com/three@0.160.0/examples/jsm/misc/GPUComputationRenderer.js";

/*
  ghvst programmer
*/

// ----------------------------------------------------
// SIMPLE TOGGLE ON EACH REFRESH
// ----------------------------------------------------

let flag = localStorage.getItem("ghvst-toggle");

if(flag === null) flag = "0";

// flip
flag = flag === "0" ? "1" : "0";
localStorage.setItem("ghvst-toggle", flag);

// green on first refresh, red on second, etc
const isGreen = flag === "0";

// ----------------------------------------------------

const baseColor = isGreen
  ? new THREE.Color(0.15, 1.0, 0.5)
  : new THREE.Color(1.0, 0.08, 0.08);

// ----------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias:false });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();

// ----------------------------------------------------
// GPU SIM
// ----------------------------------------------------

const SIZE = 160;
const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);

const pos0 = gpu.createTexture();
const vel0 = gpu.createTexture();

function fillPosition(tex){
  const a = tex.image.data;
  for(let i=0;i<a.length;i+=4){
    a[i]   = (Math.random()*2-1) * 0.8;
    a[i+1] = (Math.random()*2-1) * 0.8;
    a[i+2] = 0;
    a[i+3] = 1;
  }
}

function fillVelocity(tex){
  const a = tex.image.data;
  for(let i=0;i<a.length;i+=4){
    a[i]=a[i+1]=a[i+2]=0;
    a[i+3]=1;
  }
}

fillPosition(pos0);
fillVelocity(vel0);

// ----------------------------------------------------

const velocityShader = `
uniform vec2 mouse;
uniform vec2 remoteMouse;
uniform vec2 remoteWindow;

float soft(vec2 d){
  return 1.0 / (length(d) + 0.08);
}

void main(){

  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec2 p = texture2D(posTex, uv).xy;
  vec2 v = texture2D(velTex, uv).xy;

  vec2 d1 = mouse - p;
  vec2 d2 = remoteMouse - p;
  vec2 d3 = remoteWindow - p;

  v += normalize(d1) * soft(d1) * 0.0045;
  v += normalize(d2) * soft(d2) * 0.0040;
  v += normalize(d3) * soft(d3) * 0.0065;

  v += vec2(-p.y, p.x) * 0.00035;

  v *= 0.982;

  gl_FragColor = vec4(v,0.0,1.0);
}
`;

const positionShader = `
void main(){

  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec2 p = texture2D(posTex, uv).xy;
  vec2 v = texture2D(velTex, uv).xy;

  p += v;
  p *= 0.999;

  gl_FragColor = vec4(p,0.0,1.0);
}
`;

const velVar = gpu.addVariable("velTex", velocityShader, vel0);
const posVar = gpu.addVariable("posTex", positionShader, pos0);

gpu.setVariableDependencies(velVar,[velVar,posVar]);
gpu.setVariableDependencies(posVar,[velVar,posVar]);

velVar.material.uniforms.mouse        = { value:new THREE.Vector2() };
velVar.material.uniforms.remoteMouse  = { value:new THREE.Vector2() };
velVar.material.uniforms.remoteWindow = { value:new THREE.Vector2() };

gpu.init();

// ----------------------------------------------------
// render (fancy glow splats)
// ----------------------------------------------------

const count = SIZE * SIZE;

const posArr = new Float32Array(count * 3);
const refArr = new Float32Array(count * 2);

let pi=0, ri=0;
for(let y=0;y<SIZE;y++){
  for(let x=0;x<SIZE;x++){
    posArr[pi++] = 0;
    posArr[pi++] = 0;
    posArr[pi++] = 0;

    refArr[ri++] = x/(SIZE-1);
    refArr[ri++] = y/(SIZE-1);
  }
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(posArr,3));
geo.setAttribute("ref", new THREE.BufferAttribute(refArr,2));

const mat = new THREE.ShaderMaterial({

  transparent:true,
  depthWrite:false,
  blending:THREE.AdditiveBlending,

  uniforms:{
    posTex:{value:null},
    color:{value:baseColor}
  },

  vertexShader:`
    uniform sampler2D posTex;
    attribute vec2 ref;

    varying float vFade;

    void main(){

      vec2 p = texture2D(posTex, ref).xy;

      vFade = 1.0 - length(p)*0.4;

      gl_PointSize = 10.0;
      gl_Position = vec4(p,0.0,1.0);
    }
  `,

  fragmentShader:`
    uniform vec3 color;
    varying float vFade;

    void main(){

      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);

      float core = exp(-d*d*18.0);
      float glow = exp(-d*d*3.0);

      float a = core * 0.9 + glow * 0.35;

      gl_FragColor = vec4(color * (1.25 + glow), a * vFade);
    }
  `
});

scene.add(new THREE.Points(geo, mat));

// ----------------------------------------------------
// interaction (single window version kept simple)
// ----------------------------------------------------

const mouse = new THREE.Vector2();
const remoteMouse = new THREE.Vector2();
const remoteWindow = new THREE.Vector2(5,5);

window.addEventListener("pointermove", e=>{
  mouse.x =  (e.clientX/innerWidth)*2-1;
  mouse.y = -(e.clientY/innerHeight)*2+1;
});

// ----------------------------------------------------

function loop(){

  velVar.material.uniforms.mouse.value.copy(mouse);
  velVar.material.uniforms.remoteMouse.value.copy(remoteMouse);
  velVar.material.uniforms.remoteWindow.value.copy(remoteWindow);

  gpu.compute();

  mat.uniforms.posTex.value =
    gpu.getCurrentRenderTarget(posVar).texture;

  renderer.render(scene,camera);

  requestAnimationFrame(loop);
}

loop();

window.addEventListener("resize",()=>{
  renderer.setSize(innerWidth,innerHeight);
});
