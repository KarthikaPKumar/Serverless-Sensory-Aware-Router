export function distance(a,b){const rad=Math.PI/180,lat=(a.lat+b.lat)*rad/2;return Math.hypot((a.lat-b.lat)*111195,(a.lon-b.lon)*111195*Math.cos(lat));}
export function fresh(sensor,snapshot,now=Date.now()){
 const obs=Date.parse(sensor.observedAt),fetched=Date.parse(snapshot.fetchedAt);
 return Number.isFinite(sensor.count)&&sensor.count>=0&&Number.isFinite(obs)&&Number.isFinite(fetched)&&now-obs>=-300000&&now-obs<=1800000&&now-fetched>=-300000&&now-fetched<=5400000;
}
export function eligible(sensor,snapshot,now=Date.now()){return fresh(sensor,snapshot,now)&&Number.isInteger(sensor.reportingMinutes)&&sensor.reportingMinutes>=45&&sensor.reportingMinutes<=61;}
export function buildGraph(streets,pedestrians,now=Date.now()){
 const nodes=new Map(streets.nodes.map(n=>[n.id,n])),adj=new Map(streets.nodes.map(n=>[n.id,[]]));
 const sensors=pedestrians.sensors.filter(s=>eligible(s,pedestrians,now));
 for(const e of streets.edges){const a=nodes.get(e.a),b=nodes.get(e.b);if(!a||!b||!Number.isFinite(e.meters)||e.meters<=0)throw Error('Invalid street graph');
  const mid={lat:(a.lat+b.lat)/2,lon:(a.lon+b.lon)/2};let sensor=null,near=50;
  for(const s of sensors){const d=distance(mid,s);if(d<near){near=d;sensor=s;}}
  const edge={...e,sensor};
  if(e.oneway!=='-1')adj.get(e.a).push({to:e.b,edge});
  if(e.oneway!=='yes'&&e.oneway!=='1')adj.get(e.b).push({to:e.a,edge});
 }
 return {nodes,adj,sensors};
}
export function nearest(point,graph){let best=null,gap=Infinity;for(const n of graph.nodes.values()){const d=distance(point,n);if(d<gap){gap=d;best=n;}}if(!best||gap>80)throw Error('This address is more than 80 m from the available walking network. Choose another address.');return {node:best,gap};}
class Heap{
 constructor(){this.a=[];}
 push(x){const a=this.a;a.push(x);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=x[0])break;a[i]=a[p];i=p;}a[i]=x;}
 pop(){const a=this.a,root=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1][0]<a[child][0])child++;if(a[child][0]>=last[0])break;a[i]=a[child];i=child;}a[i]=last;}return root;}
}
export function route(graph,start,end,weight=0){
 if(!graph.nodes.has(start)||!graph.nodes.has(end))throw Error('Invalid walking-network location');
 if(start===end)throw Error('These addresses connect to the same map point. Choose a longer journey.');
 if(!Number.isFinite(weight)||weight<0||weight>5)throw Error('Invalid preference');
 const dist=new Map([[start,0]]),previous=new Map(),q=new Heap();q.push([0,start]);
 while(q.a.length){const [cost,id]=q.pop();if(cost!==dist.get(id))continue;if(id===end)break;
  for(const {to,edge} of graph.adj.get(id)){
   // Unknown has the maximum penalty, never zero. Counts are passages, not density.
   const exposure=edge.sensor?edge.sensor.count/(edge.sensor.count+200):1;
   const next=cost+edge.meters*(1+weight*exposure);
   if(next<(dist.get(to)??Infinity)){dist.set(to,next);previous.set(to,{id,edge});q.push([next,to]);}
  }
 }
 if(!previous.has(end))throw Error('No connected walking path was found within this extract.');
 const path=[end],edges=[];let cursor=end;while(cursor!==start){const p=previous.get(cursor);edges.unshift(p.edge);path.unshift(p.id);cursor=p.id;}
 const meters=edges.reduce((sum,e)=>sum+e.meters,0),covered=edges.reduce((sum,e)=>sum+(e.sensor?e.meters:0),0);
 const sensors=[...new Map(edges.filter(e=>e.sensor).map(e=>[e.sensor.id,e.sensor])).values()];
 return {path,edges,meters,covered,sensors,minutes:Math.max(1,Math.round(meters/80)),cost:dist.get(end)};
}
export function directions(r){const groups=[];for(const edge of r.edges){const last=groups.at(-1);if(last&&last.name===edge.name)last.meters+=edge.meters;else groups.push({name:edge.name,meters:edge.meters});}return groups;}
