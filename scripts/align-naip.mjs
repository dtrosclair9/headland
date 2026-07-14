/*
 * NAIP TEST (Rosedale, read-only). Same boundary extraction (Canny lum+colour,
 * length-filtered) AND row-direction (structure tensor) as before, but on
 * high-res USGS NAIP aerial (0.6 m source, free/public-domain) instead of
 * Mapbox satellite. Question: does the sharper imagery reveal interior
 * same-crop boundaries the satellite missed?
 * Run: node --env-file=.env.local scripts/align-naip.mjs
 */
import postgres from 'postgres'
import sharp from 'sharp'

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
const org = (await sql`select id from organizations where name ilike '%trosclair%'`)[0]
const pl = (await sql`select id from plantations where org_id=${org.id} and name='Rosedale'`)[0]
const rows = await sql`select st_asgeojson(geometry)::json as g from fields where plantation_id=${pl.id}`
await sql.end()
const blocks = rows.map((r) => ({ rings: r.g.coordinates }))
let minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity
for (const b of blocks) for (const r of b.rings) for (const [lng,lat] of r){if(lng<minLng)minLng=lng;if(lng>maxLng)maxLng=lng;if(lat<minLat)minLat=lat;if(lat>maxLat)maxLat=lat}
const pLo=(maxLng-minLng)*0.06,pLa=(maxLat-minLat)*0.06;minLng-=pLo;maxLng+=pLo;minLat-=pLa;maxLat+=pLa
const spanLng=maxLng-minLng,spanLat=maxLat-minLat,midLat=(minLat+maxLat)/2
const wM=spanLng*111320*Math.cos(midLat*Math.PI/180),hM=spanLat*111320,aspect=wM/hM
let W=4000,H=Math.round(W/aspect);if(H>4000){H=4000;W=Math.round(H*aspect)}
// NAIP export (public-domain USGS ImageServer, no key), 4326 → linear bbox map
const url=`https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`
const res=await fetch(url)
if(!res.ok){console.error('NAIP',res.status,await res.text());process.exit(1)}
const imgBuf=Buffer.from(await res.arrayBuffer())
const {data,info}=await sharp(imgBuf).raw().toBuffer({resolveWithObject:true})
const iw=info.width,ih=info.height,ch=info.channels,N=iw*ih
console.log(`Rosedale ${blocks.length} blocks · NAIP ${iw}x${ih} (~${(wM/iw).toFixed(2)} m/px)`)

const lum=new Float32Array(N),grn=new Float32Array(N),bright=new Uint8Array(N)
for(let i=0;i<N;i++){const r=data[i*ch],g=data[i*ch+1],b=data[i*ch+2];lum[i]=0.299*r+0.587*g+0.114*b;grn[i]=(2*g-r-b)+128;if(lum[i]>205)bright[i]=1}
function blur(s,passes=1){let cur=s;for(let p=0;p<passes;p++){const k=[1,4,6,4,1],ks=16,t=new Float32Array(N),o=new Float32Array(N)
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let a=0;for(let d=-2;d<=2;d++)a+=cur[y*iw+Math.min(iw-1,Math.max(0,x+d))]*k[d+2];t[y*iw+x]=a/ks}
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let a=0;for(let d=-2;d<=2;d++)a+=t[Math.min(ih-1,Math.max(0,y+d))*iw+x]*k[d+2];o[y*iw+x]=a/ks}cur=o}return cur}
function canny(src,hiPct){const b=blur(src,1),mag=new Float32Array(N),dir=new Float32Array(N),vals=[]
  const at=(x,y)=>b[y*iw+x]
  for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const gx=-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1)+at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1);const gy=-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);const m=Math.hypot(gx,gy);mag[y*iw+x]=m;dir[y*iw+x]=Math.atan2(gy,gx);vals.push(m)}
  const nms=new Float32Array(N)
  for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=y*iw+x,m=mag[i];if(!m)continue;let a=dir[i]*180/Math.PI;if(a<0)a+=180;let n1,n2;if(a<22.5||a>=157.5){n1=mag[i-1];n2=mag[i+1]}else if(a<67.5){n1=mag[i-iw+1];n2=mag[i+iw-1]}else if(a<112.5){n1=mag[i-iw];n2=mag[i+iw]}else{n1=mag[i-iw-1];n2=mag[i+iw+1]}if(m>=n1&&m>=n2)nms[i]=m}
  vals.sort((a,b)=>a-b);const hi=vals[Math.floor(vals.length*hiPct)],lo=hi*0.4,edge=new Uint8Array(N),st=[]
  for(let i=0;i<N;i++)if(nms[i]>=hi&&!bright[i]){edge[i]=1;st.push(i)}
  while(st.length){const i=st.pop(),x=i%iw,y=(i/iw)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=iw||yy>=ih)continue;const j=yy*iw+xx;if(!edge[j]&&nms[j]>=lo&&!bright[j]){edge[j]=1;st.push(j)}}}
  return edge}
const eL=canny(lum,0.82),eG=canny(grn,0.88),edge=new Uint8Array(N)
for(let i=0;i<N;i++)edge[i]=eL[i]||eG[i]?1:0
const lab=new Int32Array(N),keep=new Uint8Array(N),MINLEN=Math.round(iw/85)
for(let i=0;i<N;i++){if(!edge[i]||lab[i])continue;const q=[i];lab[i]=1;const mem=[i];while(q.length){const p=q.pop(),x=p%iw,y=(p/iw)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=iw||yy>=ih)continue;const j=yy*iw+xx;if(edge[j]&&!lab[j]){lab[j]=1;q.push(j);mem.push(j)}}}let mnx=1e9,mny=1e9,mxx=-1,mxy=-1;for(const m of mem){const x=m%iw,y=(m/iw)|0;if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y}if(Math.hypot(mxx-mnx,mxy-mny)>=MINLEN)for(const m of mem)keep[m]=1}
const px=(lng)=>((lng-minLng)/spanLng)*iw, py=(lat)=>((maxLat-lat)/spanLat)*ih
// restrict boundaries to NEAR the farm blocks — the surrounding trees/woods
// are high-texture noise we don't care about. Rasterize block interiors,
// dilate ~40px, keep only boundary pixels inside that footprint.
const inFarm=new Uint8Array(N)
function fillPoly(ring){
  const pts=ring.map(([lng,lat])=>[px(lng),py(lat)])
  let mny=1e9,mxy=-1
  for(const p of pts){if(p[1]<mny)mny=p[1];if(p[1]>mxy)mxy=p[1]}
  for(let y=Math.max(0,Math.floor(mny));y<=Math.min(ih-1,Math.ceil(mxy));y++){
    const xs=[]
    for(let k=0;k<pts.length-1;k++){const[x1,y1]=pts[k],[x2,y2]=pts[k+1];if((y1<=y&&y2>y)||(y2<=y&&y1>y))xs.push(x1+(y-y1)/(y2-y1)*(x2-x1))}
    xs.sort((a,b)=>a-b)
    for(let k=0;k+1<xs.length;k+=2)for(let x=Math.max(0,Math.floor(xs[k]));x<=Math.min(iw-1,Math.ceil(xs[k+1]));x++)inFarm[y*iw+x]=1
  }
}
for(const bl of blocks)for(const ring of bl.rings)fillPoly(ring)
// dilate by R via distance-ish: simple multi-pass expand
const R=Math.round(iw/100);let cur=inFarm
for(let pass=0;pass<R;pass++){const nx=new Uint8Array(cur);for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=y*iw+x;if(cur[i-1]||cur[i+1]||cur[i-iw]||cur[i+iw])nx[i]=1}cur=nx}
for(let i=0;i<N;i++)if(!cur[i])keep[i]=0
console.log(`boundary map: ${keep.reduce((a,b)=>a+b,0)} px kept (farm-masked)`)

// row-direction discontinuity (structure tensor)
const bb=blur(lum,1),gx=new Float32Array(N),gy=new Float32Array(N),at2=(x,y)=>bb[y*iw+x]
for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){gx[y*iw+x]=(-at2(x-1,y-1)-2*at2(x-1,y)-at2(x-1,y+1)+at2(x+1,y-1)+2*at2(x+1,y)+at2(x+1,y+1))/8;gy[y*iw+x]=(-at2(x-1,y-1)-2*at2(x,y-1)-at2(x+1,y-1)+at2(x-1,y+1)+2*at2(x,y+1)+at2(x+1,y+1))/8}
let cA=new Float32Array(N),sA=new Float32Array(N),en=new Float32Array(N)
for(let i=0;i<N;i++){cA[i]=gx[i]*gx[i]-gy[i]*gy[i];sA[i]=2*gx[i]*gy[i];en[i]=gx[i]*gx[i]+gy[i]*gy[i]}
cA=blur(cA,5);sA=blur(sA,5);en=blur(en,5)
const coh=new Float32Array(N),u=new Float32Array(N),v=new Float32Array(N)
for(let i=0;i<N;i++){const m=Math.hypot(cA[i],sA[i]);coh[i]=en[i]>1e-3?m/en[i]:0;u[i]=m>1e-3?cA[i]/m:0;v[i]=m>1e-3?sA[i]/m:0}
const bnd=new Float32Array(N);let bmax=1e-6
for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=y*iw+x;const dux=u[i+1]-u[i-1],duy=u[i+iw]-u[i-iw],dvx=v[i+1]-v[i-1],dvy=v[i+iw]-v[i-iw];const g=Math.sqrt(dux*dux+duy*duy+dvx*dvx+dvy*dvy)*Math.min(coh[i-1],coh[i+1],coh[i-iw],coh[i+iw]);bnd[i]=g;if(g>bmax)bmax=g}

const polys=blocks.map(bl=>bl.rings.map(r=>`<polyline points="${r.map(([lng,lat])=>`${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}" fill="none" stroke="#00E5FF" stroke-width="2"/>`).join('')).join('')
const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${polys}</svg>`)
await sharp(imgBuf).png().composite([{input:overlay}]).toFile('.ui-check/naip-0-satellite.png')
// colour boundaries green on NAIP
const tintC=Buffer.alloc(N*4);for(let i=0;i<N;i++)if(keep[i]){tintC[i*4+1]=255;tintC[i*4+2]=90;tintC[i*4+3]=255}
await sharp(imgBuf).png().composite([{input:tintC,raw:{width:iw,height:ih,channels:4}},{input:overlay}]).toFile('.ui-check/naip-1-colour-boundaries.png')
// row discontinuity green on NAIP
const tintR=Buffer.alloc(N*4);for(let i=0;i<N;i++){const t=Math.min(1,(bnd[i]/bmax)*3);if(t>0.4){tintR[i*4+1]=255;tintR[i*4+2]=90;tintR[i*4+3]=Math.round(t*255)}}
await sharp(imgBuf).png().composite([{input:tintR,raw:{width:iw,height:ih,channels:4}},{input:overlay}]).toFile('.ui-check/naip-2-row-boundaries.png')
console.log('done — .ui-check/naip-0-satellite.png, naip-1-colour-boundaries.png, naip-2-row-boundaries.png')
