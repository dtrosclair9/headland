/*
 * ROW-DIRECTION EXPERIMENT (Rosedale, read-only). Breaks the data ceiling:
 * interior same-crop boundaries are invisible to colour/brightness, but
 * adjacent fields often have cane rows at DIFFERENT angles — an orientation
 * discontinuity that marks the boundary even when colour is identical.
 * Computes local texture orientation (structure tensor) and where it snaps
 * to a new angle. Outputs: orientation as hue, the discontinuity boundary
 * map, and both over the satellite with blocks. Judge: do interior lines
 * that colour missed now appear?
 * Run: node --env-file=.env.local scripts/align-rows.mjs
 */
import postgres from 'postgres'
import sharp from 'sharp'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 })
const org = (await sql`select id from organizations where name ilike '%trosclair%'`)[0]
const pl = (await sql`select id from plantations where org_id=${org.id} and name='Rosedale'`)[0]
const rows = await sql`select st_asgeojson(geometry)::json as g from fields where plantation_id=${pl.id}`
await sql.end()
const blocks = rows.map((r) => ({ rings: r.g.coordinates }))
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

const lum=new Float32Array(N)
for(let i=0;i<N;i++)lum[i]=0.299*data[i*ch]+0.587*data[i*ch+1]+0.114*data[i*ch+2]
// separable box-ish blur (repeatable for bigger sigma)
function blur(s,passes=1){let cur=s;for(let p=0;p<passes;p++){const k=[1,4,6,4,1],ks=16,t=new Float32Array(N),o=new Float32Array(N)
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let a=0;for(let d=-2;d<=2;d++)a+=cur[y*iw+Math.min(iw-1,Math.max(0,x+d))]*k[d+2];t[y*iw+x]=a/ks}
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){let a=0;for(let d=-2;d<=2;d++)a+=t[Math.min(ih-1,Math.max(0,y+d))*iw+x]*k[d+2];o[y*iw+x]=a/ks}cur=o}return cur}

// 1. gradients on lightly-blurred luma
const b=blur(lum,1),gx=new Float32Array(N),gy=new Float32Array(N)
const at=(x,y)=>b[y*iw+x]
for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){gx[y*iw+x]=(-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1)+at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1))/8;gy[y*iw+x]=(-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1)+at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1))/8}

// 2. structure tensor (double-angle rep), smoothed over the row texture window
let cA=new Float32Array(N),sA=new Float32Array(N),en=new Float32Array(N)
for(let i=0;i<N;i++){cA[i]=gx[i]*gx[i]-gy[i]*gy[i];sA[i]=2*gx[i]*gy[i];en[i]=gx[i]*gx[i]+gy[i]*gy[i]}
cA=blur(cA,4);sA=blur(sA,4);en=blur(en,4) // ~sigma large enough to average rows
const mag=new Float32Array(N),coh=new Float32Array(N),u=new Float32Array(N),v=new Float32Array(N)
for(let i=0;i<N;i++){const m=Math.hypot(cA[i],sA[i]);mag[i]=m;coh[i]=en[i]>1e-3?m/en[i]:0;u[i]=m>1e-3?cA[i]/m:0;v[i]=m>1e-3?sA[i]/m:0}

// 3. orientation-discontinuity boundary = spatial gradient of the unit (u,v)
//    field, gated by coherence (only where there IS a strong row texture).
const bnd=new Float32Array(N);let bmax=1e-6
for(let y=1;y<ih-1;y++)for(let x=1;x<iw-1;x++){const i=y*iw+x
  const dux=u[i+1]-u[i-1],duy=u[i+iw]-u[i-iw],dvx=v[i+1]-v[i-1],dvy=v[i+iw]-v[i-iw]
  const g=Math.sqrt(dux*dux+duy*duy+dvx*dvx+dvy*dvy)*Math.min(coh[i-1],coh[i+1],coh[i-iw],coh[i+iw])
  bnd[i]=g;if(g>bmax)bmax=g}

// visuals
const px=(lng)=>((lng-minLng)/spanLng)*iw, py=(lat)=>((maxLat-lat)/spanLat)*ih
const polys=blocks.map(bl=>bl.rings.map(r=>`<polyline points="${r.map(([lng,lat])=>`${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}" fill="none" stroke="#00E5FF" stroke-width="2"/>`).join('')).join('')
const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${polys}</svg>`)

// (a) orientation as hue where coherent (see the row directions)
const ori=Buffer.alloc(N*3)
for(let i=0;i<N;i++){const theta=0.5*Math.atan2(sA[i],cA[i]);const hue=((theta+Math.PI/2)/Math.PI)*360;const c=coh[i]>0.15?1:0.12;const [r,g,bb]=hsv(hue,0.9,c);ori[i*3]=r;ori[i*3+1]=g;ori[i*3+2]=bb}
await sharp(ori,{raw:{width:iw,height:ih,channels:3}}).png().composite([{input:overlay}]).toFile('.ui-check/rows-orientation.png')

// (b) discontinuity boundary map (bright = row-angle change) + blocks
const bmap=Buffer.alloc(N)
for(let i=0;i<N;i++)bmap[i]=Math.min(255,(bnd[i]/bmax)*255*3)
await sharp(bmap,{raw:{width:iw,height:ih,channels:1}}).png().composite([{input:overlay}]).toFile('.ui-check/rows-boundaries.png')

// (c) discontinuity burned green onto the satellite
const tint=Buffer.alloc(N*4)
for(let i=0;i<N;i++){const t=Math.min(1,(bnd[i]/bmax)*3);if(t>0.35){tint[i*4]=0;tint[i*4+1]=255;tint[i*4+2]=90;tint[i*4+3]=Math.round(t*255)}}
await sharp(satBuf).png().composite([{input:tint,raw:{width:iw,height:ih,channels:4}},{input:overlay}]).toFile('.ui-check/rows-on-satellite.png')
console.log('done — .ui-check/rows-orientation.png, rows-boundaries.png, rows-on-satellite.png')

function hsv(h,s,v){h=(h%360)/60;const c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c;let r,g,b;if(h<1)[r,g,b]=[c,x,0];else if(h<2)[r,g,b]=[x,c,0];else if(h<3)[r,g,b]=[0,c,x];else if(h<4)[r,g,b]=[0,x,c];else if(h<5)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)]}
