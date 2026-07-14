/*
 * BOUNDARY EXTRACTION (the crux). Turns Rosedale's satellite into a CLEAN
 * boundary map: Canny (blur -> gradient -> non-max suppression -> hysteresis)
 * on both brightness AND colour, OR'd together, then connected-component
 * length filtering so cane-row texture specks die and only long real
 * boundaries (ditch/road/headland/tree-line/field-colour edges) survive.
 * Bright rooftops masked as keep-outs. Overlays blocks so we can judge.
 * READ-ONLY. Run: node --env-file=.env.local scripts/align-boundaries.mjs
 */
import postgres from 'postgres'
import sharp from 'sharp'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
const org = (await sql`select id from organizations where name ilike '%trosclair%'`)[0]
const pl = (await sql`select id from plantations where org_id=${org.id} and name='Rosedale'`)[0]
const rows = await sql`select name, st_asgeojson(geometry)::json as g from fields where plantation_id=${pl.id}`
await sql.end()
const blocks = rows.map((r) => ({ rings: r.g.coordinates }))
let minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity
for (const b of blocks) for (const r of b.rings) for (const [lng,lat] of r){ if(lng<minLng)minLng=lng;if(lng>maxLng)maxLng=lng;if(lat<minLat)minLat=lat;if(lat>maxLat)maxLat=lat }
const pL=(maxLng-minLng)*0.08,pT=(maxLat-minLat)*0.08; minLng-=pL;maxLng+=pL;minLat-=pT;maxLat+=pT
const spanLng=maxLng-minLng,spanLat=maxLat-minLat,midLat=(minLat+maxLat)/2
const wM=spanLng*111320*Math.cos(midLat*Math.PI/180),hM=spanLat*111320,aspect=wM/hM
let W=1280,H=Math.round(W/aspect); if(H>1280){H=1280;W=Math.round(H*aspect)}
const url=`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng},${minLat},${maxLng},${maxLat}]/${W}x${H}@2x?access_token=${TOKEN}&attribution=false&logo=false`
const satBuf=Buffer.from(await (await fetch(url)).arrayBuffer())
const {data,info}=await sharp(satBuf).raw().toBuffer({resolveWithObject:true})
const iw=info.width,ih=info.height,ch=info.channels,N=iw*ih
console.log(`Rosedale ${blocks.length} blocks · ${iw}x${ih}`)

// channels
const lum=new Float32Array(N), grn=new Float32Array(N), bright=new Uint8Array(N)
for(let i=0;i<N;i++){const r=data[i*ch],g=data[i*ch+1],b=data[i*ch+2];lum[i]=0.299*r+0.587*g+0.114*b;grn[i]=(2*g-r-b)+128;if(lum[i]>205)bright[i]=1}

// separable 5-tap gaussian
function blur(src){const k=[1,4,6,4,1],ks=16,t=new Float32Array(N),o=new Float32Array(N)
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let s=0;for(let d=-2;d<=2;d++){const xx=Math.min(iw-1,Math.max(0,x+d));s+=src[y*iw+xx]*k[d+2]}t[y*iw+x]=s/ks}
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let s=0;for(let d=-2;d<=2;d++){const yy=Math.min(ih-1,Math.max(0,y+d));s+=t[yy*iw+x]*k[d+2]}o[y*iw+x]=s/ks}
  return o}

// Canny → binary edge map for one channel
function canny(src,hiPct,loMul){
  const b=blur(src),mag=new Float32Array(N),dir=new Float32Array(N),vals=[]
  const at=(x,y)=>b[y*iw+x]
  for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){
    const gx=-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1)+at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)
    const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)
    const m=Math.hypot(gx,gy);mag[y*iw+x]=m;dir[y*iw+x]=Math.atan2(gy,gx);vals.push(m)}
  // non-max suppression
  const nms=new Float32Array(N)
  for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){
    const i=y*iw+x,m=mag[i];if(m===0)continue
    let a=dir[i]*180/Math.PI;if(a<0)a+=180;let n1,n2
    if(a<22.5||a>=157.5){n1=mag[i-1];n2=mag[i+1]}
    else if(a<67.5){n1=mag[i-iw+1];n2=mag[i+iw-1]}
    else if(a<112.5){n1=mag[i-iw];n2=mag[i+iw]}
    else{n1=mag[i-iw-1];n2=mag[i+iw+1]}
    if(m>=n1&&m>=n2)nms[i]=m}
  // hysteresis (strong seeds + weak connected)
  vals.sort((a,b)=>a-b);const hi=vals[Math.floor(vals.length*hiPct)],lo=hi*loMul
  const edge=new Uint8Array(N),stack=[]
  for(let i=0;i<N;i++)if(nms[i]>=hi&&!bright[i]){edge[i]=1;stack.push(i)}
  while(stack.length){const i=stack.pop(),x=i%iw,y=(i/iw)|0
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=iw||yy>=ih)continue
      const j=yy*iw+xx;if(!edge[j]&&nms[j]>=lo&&!bright[j]){edge[j]=1;stack.push(j)}}}
  return edge
}

// union of brightness + colour boundaries
const eL=canny(lum,0.90,0.4), eG=canny(grn,0.93,0.4)
const edge=new Uint8Array(N);for(let i=0;i<N;i++)edge[i]=eL[i]||eG[i]?1:0

// connected-component LENGTH filter: keep long boundary runs, drop specks
const lab=new Int32Array(N).fill(0);let comp=0;const keep=new Uint8Array(N)
for(let i=0;i<N;i++){
  if(!edge[i]||lab[i])continue;comp++;const q=[i];lab[i]=comp;const members=[i]
  while(q.length){const p=q.pop(),x=p%iw,y=(p/iw)|0
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=iw||yy>=ih)continue
      const j=yy*iw+xx;if(edge[j]&&!lab[j]){lab[j]=comp;q.push(j);members.push(j)}}}
  // bounding-box diagonal ~ line length; keep long, thin runs
  let mnx=1e9,mny=1e9,mxx=-1,mxy=-1;for(const m of members){const x=m%iw,y=(m/iw)|0;if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y}
  const diag=Math.hypot(mxx-mnx,mxy-mny)
  if(diag>=45)for(const m of members)keep[m]=1   // ≥45px ≈ a real field-length boundary
}
const kept=keep.reduce((a,b)=>a+b,0)
console.log(`edges: raw ${edge.reduce((a,b)=>a+b,0)} px → kept ${kept} px after length filter (${comp} components)`)

// render: clean boundaries (white) with blocks (cyan) over black, + over satellite
const px=(lng)=>((lng-minLng)/spanLng)*iw, py=(lat)=>((maxLat-lat)/spanLat)*ih
const polys=blocks.map(b=>b.rings.map(r=>`<polyline points="${r.map(([lng,lat])=>`${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}" fill="none" stroke="#00E5FF" stroke-width="2"/>`).join('')).join('')
const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${polys}</svg>`)
const boundPng=await sharp(Buffer.from(keep.map(v=>v?255:0)),{raw:{width:iw,height:ih,channels:1}}).png().toBuffer()
await sharp(boundPng).composite([{input:overlay}]).png().toFile('.ui-check/b-boundaries.png')
// green boundaries burned onto satellite for the real read
const green=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${
  '' }</svg>`)
const tint=await sharp(Buffer.from((()=>{const rgba=new Uint8Array(N*4);for(let i=0;i<N;i++){if(keep[i]){rgba[i*4]=0;rgba[i*4+1]=255;rgba[i*4+2]=100;rgba[i*4+3]=255}else rgba[i*4+3]=0}return rgba})()),{raw:{width:iw,height:ih,channels:4}}).png().toBuffer()
await sharp(satBuf).png().composite([{input:tint},{input:overlay}]).toFile('.ui-check/b-on-satellite.png')
console.log('done — .ui-check/b-boundaries.png, b-on-satellite.png')
