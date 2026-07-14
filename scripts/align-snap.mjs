/*
 * ALIGNER v1 (Rosedale, read-only). Snaps block corners onto the detected
 * satellite boundaries where one is within reach, with SHARED CORNERS WELDED
 * so neighbouring blocks move together (the tessellation never tears open a
 * gap). Corners with no nearby boundary stay put (no signal = don't guess).
 * Recomputes acreage from the fitted shapes. Renders old-vs-proposed.
 * Run: node --env-file=.env.local scripts/align-snap.mjs
 */
import postgres from 'postgres'
import sharp from 'sharp'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const SNAP_R = 22 // px: only snap a corner if a boundary is within this radius
const PULL = 0.85 // how far toward the boundary to move (1 = all the way)

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
const org = (await sql`select id from organizations where name ilike '%trosclair%'`)[0]
const pl = (await sql`select id from plantations where org_id=${org.id} and name='Rosedale'`)[0]
const rows = await sql`select name, acreage_cached, st_asgeojson(geometry)::json as g from fields where plantation_id=${pl.id}`
await sql.end()
const blocks = rows.map((r) => ({ name: r.name, acres: Number(r.acreage_cached), rings: r.g.coordinates }))

let minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity
for (const b of blocks) for (const r of b.rings) for (const [lng,lat] of r){if(lng<minLng)minLng=lng;if(lng>maxLng)maxLng=lng;if(lat<minLat)minLat=lat;if(lat>maxLat)maxLat=lat}
const pLo=(maxLng-minLng)*0.08,pLa=(maxLat-minLat)*0.08;minLng-=pLo;maxLng+=pLo;minLat-=pLa;maxLat+=pLa
const spanLng=maxLng-minLng,spanLat=maxLat-minLat,midLat=(minLat+maxLat)/2
const wM=spanLng*111320*Math.cos(midLat*Math.PI/180),hM=spanLat*111320,aspect=wM/hM
let W=1280,H=Math.round(W/aspect);if(H>1280){H=1280;W=Math.round(H*aspect)}
const url=`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${minLng},${minLat},${maxLng},${maxLat}]/${W}x${H}@2x?access_token=${TOKEN}&attribution=false&logo=false`
const satBuf=Buffer.from(await (await fetch(url)).arrayBuffer())
const {data,info}=await sharp(satBuf).raw().toBuffer({resolveWithObject:true})
const iw=info.width,ih=info.height,ch=info.channels,N=iw*ih
console.log(`Rosedale ${blocks.length} blocks · ${iw}x${ih}`)

// ── clean boundary map (Canny lum+colour, length-filtered) ─────────────────
const lum=new Float32Array(N),grn=new Float32Array(N),bright=new Uint8Array(N)
for(let i=0;i<N;i++){const r=data[i*ch],g=data[i*ch+1],b=data[i*ch+2];lum[i]=0.299*r+0.587*g+0.114*b;grn[i]=(2*g-r-b)+128;if(lum[i]>205)bright[i]=1}
function blur(s){const k=[1,4,6,4,1],ks=16,t=new Float32Array(N),o=new Float32Array(N)
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let a=0;for(let d=-2;d<=2;d++){a+=s[y*iw+Math.min(iw-1,Math.max(0,x+d))]*k[d+2]}t[y*iw+x]=a/ks}
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let a=0;for(let d=-2;d<=2;d++){a+=t[Math.min(ih-1,Math.max(0,y+d))*iw+x]*k[d+2]}o[y*iw+x]=a/ks}return o}
function canny(src,hiPct){const b=blur(src),mag=new Float32Array(N),dir=new Float32Array(N),vals=[]
  const at=(x,y)=>b[y*iw+x]
  for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const gx=-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1)+at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1);const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);const m=Math.hypot(gx,gy);mag[y*iw+x]=m;dir[y*iw+x]=Math.atan2(gy,gx);vals.push(m)}
  const nms=new Float32Array(N)
  for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=y*iw+x,m=mag[i];if(!m)continue;let a=dir[i]*180/Math.PI;if(a<0)a+=180;let n1,n2;if(a<22.5||a>=157.5){n1=mag[i-1];n2=mag[i+1]}else if(a<67.5){n1=mag[i-iw+1];n2=mag[i+iw-1]}else if(a<112.5){n1=mag[i-iw];n2=mag[i+iw]}else{n1=mag[i-iw-1];n2=mag[i+iw+1]}if(m>=n1&&m>=n2)nms[i]=m}
  vals.sort((a,b)=>a-b);const hi=vals[Math.floor(vals.length*hiPct)],lo=hi*0.4,edge=new Uint8Array(N),st=[]
  for(let i=0;i<N;i++)if(nms[i]>=hi&&!bright[i]){edge[i]=1;st.push(i)}
  while(st.length){const i=st.pop(),x=i%iw,y=(i/iw)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=iw||yy>=ih)continue;const j=yy*iw+xx;if(!edge[j]&&nms[j]>=lo&&!bright[j]){edge[j]=1;st.push(j)}}}
  return edge}
const eL=canny(lum,0.90),eG=canny(grn,0.93),edge=new Uint8Array(N)
for(let i=0;i<N;i++)edge[i]=eL[i]||eG[i]?1:0
// length filter
const lab=new Int32Array(N),keep=new Uint8Array(N)
for(let i=0;i<N;i++){if(!edge[i]||lab[i])continue;const q=[i];lab[i]=1;const mem=[i];while(q.length){const p=q.pop(),x=p%iw,y=(p/iw)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=iw||yy>=ih)continue;const j=yy*iw+xx;if(edge[j]&&!lab[j]){lab[j]=1;q.push(j);mem.push(j)}}}let mnx=1e9,mny=1e9,mxx=-1,mxy=-1;for(const m of mem){const x=m%iw,y=(m/iw)|0;if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y}if(Math.hypot(mxx-mnx,mxy-mny)>=45)for(const m of mem)keep[m]=1}

// ── feature transform: nearest boundary point + distance (2-pass chamfer) ──
const BIG=1e6,D=new Float32Array(N),nx=new Int32Array(N),ny=new Int32Array(N)
for(let i=0;i<N;i++){if(keep[i]){D[i]=0;nx[i]=i%iw;ny[i]=(i/iw)|0}else{D[i]=BIG;nx[i]=-1;ny[i]=-1}}
const O=1,DG=1.4142
const relax=(i,j,c)=>{if(D[j]+c<D[i]){D[i]=D[j]+c;nx[i]=nx[j];ny[i]=ny[j]}}
for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){const i=y*iw+x;if(x>0)relax(i,i-1,O);if(y>0)relax(i,i-iw,O);if(x>0&&y>0)relax(i,i-iw-1,DG);if(x<iw-1&&y>0)relax(i,i-iw+1,DG)}
for(let y=ih-1;y>=0;y--)for(let x=iw-1;x>=0;x--){const i=y*iw+x;if(x<iw-1)relax(i,i+1,O);if(y<ih-1)relax(i,i+iw,O);if(x<iw-1&&y<ih-1)relax(i,i+iw+1,DG);if(x>0&&y<ih-1)relax(i,i+iw-1,DG)}

// ── project + weld shared corners ──────────────────────────────────────────
const px=(lng)=>((lng-minLng)/spanLng)*iw, py=(lat)=>((maxLat-lat)/spanLat)*ih
const toLng=(x)=>minLng+(x/iw)*spanLng, toLat=(y)=>maxLat-(y/ih)*spanLat
// unique nodes keyed by rounded pixel (2px grid) so shared corners weld
const nodeOf=new Map(), nodes=[] // {x,y}
const keyFor=(x,y)=>`${Math.round(x/2)},${Math.round(y/2)}`
const refs=[] // per block ring vertex -> node index
for(const b of blocks){b.nodeIdx=b.rings.map(r=>r.map(([lng,lat])=>{const x=px(lng),y=py(lat),k=keyFor(x,y);let id=nodeOf.get(k);if(id==null){id=nodes.length;nodes.push({x,y});nodeOf.set(k,id)}return id}))}
console.log(`${nodes.length} unique corners (welded from shared edges)`)

// ── snap each welded node toward nearest boundary within radius ────────────
let snapped=0
const moved=nodes.map(n=>{
  const xi=Math.min(iw-1,Math.max(0,Math.round(n.x))),yi=Math.min(ih-1,Math.max(0,Math.round(n.y))),i=yi*iw+xi
  const d=D[i]
  if(d<=SNAP_R&&nx[i]>=0){snapped++;return{x:n.x+(nx[i]-n.x)*PULL,y:n.y+(ny[i]-n.y)*PULL}}
  return{x:n.x,y:n.y}
})
console.log(`snapped ${snapped}/${nodes.length} corners to a boundary (within ${SNAP_R}px)`)

// ── rebuild geometry + recompute acreage (shoelace on planar meters) ───────
function acresOf(rings){let a=0;for(const ring of rings){for(let k=0;k<ring.length-1;k++){const [x1,y1]=ring[k],[x2,y2]=ring[k+1];const mx1=x1*111320*Math.cos(y1*Math.PI/180),my1=y1*111320,mx2=x2*111320*Math.cos(y2*Math.PI/180),my2=y2*111320;a+=mx1*my2-mx2*my1}}return Math.abs(a/2)/4046.86}
const proposals=blocks.map((b)=>{
  const prop=b.nodeIdx.map(ring=>ring.map(id=>[toLng(moved[id].x),toLat(moved[id].y)]))
  return{name:b.name,orig:b.rings,prop,oldAc:b.acres,newAc:acresOf(prop)}
})
const changed=proposals.filter(p=>Math.abs(p.newAc-p.oldAc)>0.05)
console.log(`acreage changed on ${changed.length} blocks; total ${proposals.reduce((s,p)=>s+p.oldAc,0).toFixed(1)} -> ${proposals.reduce((s,p)=>s+p.newAc,0).toFixed(1)} ac`)

// ── render old (red) vs proposed (green) over satellite ────────────────────
const poly=(rings,st,w)=>rings.map(r=>`<polyline points="${r.map(([lng,lat])=>`${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}" fill="none" stroke="${st}" stroke-width="${w}"/>`).join('')
const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${proposals.map(p=>poly(p.orig,'#FF3B30',2)+poly(p.prop,'#00E676',3)).join('')}</svg>`)
await sharp(satBuf).png().composite([{input:svg}]).toFile('.ui-check/snap-oldvsnew.png')
await sharp(satBuf).png().composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${proposals.map(p=>poly(p.prop,'#00E676',3)).join('')}</svg>`)}]).toFile('.ui-check/snap-proposed.png')
console.log('done — .ui-check/snap-oldvsnew.png, snap-proposed.png')
