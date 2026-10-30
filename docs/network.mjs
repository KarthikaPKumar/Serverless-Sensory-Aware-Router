// Synthetic, undirected network for a reproducible routing demonstration.
// Coordinates are schematic, not geographic. Signals are illustrative, not measurements.
export const nodes = [
  {id:'station',name:'Station',x:95,y:400},
  {id:'market',name:'Market',x:265,y:400},
  {id:'library',name:'Library',x:455,y:400,refuge:true},
  {id:'gallery',name:'Gallery',x:670,y:400},
  {id:'garden',name:'Garden',x:95,y:220,refuge:true},
  {id:'square',name:'Civic square',x:265,y:220},
  {id:'museum',name:'Museum',x:455,y:220},
  {id:'park',name:'Riverside park',x:670,y:220,refuge:true},
  {id:'walk',name:'Garden walk',x:265,y:80},
  {id:'river',name:'River walk',x:455,y:80}
];
export const edges = [
  {a:'station',b:'market',minutes:3,crowd:85,noise:80,light:75},
  {a:'market',b:'library',minutes:3,crowd:80,noise:70,light:85},
  {a:'library',b:'gallery',minutes:3,crowd:65,noise:75,light:70},
  {a:'station',b:'garden',minutes:4,crowd:15,noise:20,light:30},
  {a:'garden',b:'square',minutes:4,crowd:25,noise:30,light:40},
  {a:'square',b:'museum',minutes:4,crowd:35,noise:30,light:45},
  {a:'museum',b:'park',minutes:4,crowd:20,noise:25,light:35},
  {a:'park',b:'gallery',minutes:3,crowd:20,noise:20,light:40},
  {a:'garden',b:'walk',minutes:4,crowd:10,noise:10,light:55},
  {a:'walk',b:'river',minutes:4,crowd:10,noise:15,light:60},
  {a:'river',b:'park',minutes:4,crowd:15,noise:15,light:50},
  {a:'market',b:'square',minutes:3,crowd:70,noise:65,light:65},
  {a:'library',b:'museum',minutes:3,crowd:35,noise:40,light:20},
  {a:'museum',b:'river',minutes:3,crowd:20,noise:25,light:35}
];
export const signals = ['crowd','noise','light'];
export function validateNetwork(ns, es) {
  const ids = new Set(ns.map(n=>n.id));
  if (ids.size !== ns.length) throw new Error('Duplicate locations');
  for (const e of es) {
    if (!ids.has(e.a)||!ids.has(e.b)||e.a===e.b) throw new Error('Invalid connection');
    if (!Number.isFinite(e.minutes)||e.minutes<=0) throw new Error('Invalid duration');
    for (const key of signals) if (!Number.isFinite(e[key])||e[key]<0||e[key]>100) throw new Error('Invalid sensory signal');
  }
}
validateNetwork(nodes,edges);
export function findRoute(start, end, weights, ns=nodes, es=edges) {
  validateNetwork(ns, es);
  if (!ns.some(n=>n.id===start)||!ns.some(n=>n.id===end)) throw new Error('Choose a valid location');
  if (start===end) throw new Error('Choose different start and destination locations.');
  for (const key of signals) if (!Number.isFinite(weights[key])||weights[key]<0||weights[key]>5) throw new Error('Preferences must be between 0 and 5');
  const distance = new Map(ns.map(n=>[n.id,Infinity]));
  const previous = new Map(); const pending = new Set(distance.keys());
  distance.set(start,0);
  while (pending.size) {
    const current=[...pending].sort((a,b)=>distance.get(a)-distance.get(b))[0];
    if (!Number.isFinite(distance.get(current))) break;
    pending.delete(current);
    if (current===end) break;
    for (const edge of es.filter(e=>e.a===current||e.b===current)) {
      const next=edge.a===current?edge.b:edge.a;
      if (!pending.has(next)) continue;
      const cost=edge.minutes*(1+signals.reduce((sum,key)=>sum+weights[key]*edge[key]/100,0));
      const candidate=distance.get(current)+cost;
      if(candidate<distance.get(next)) {distance.set(next,candidate);previous.set(next,{node:current,edge});}
    }
  }
  if(!previous.has(end)) throw new Error('No connected route exists for this journey.');
  const path=[end], segments=[]; let cursor=end;
  while(cursor!==start) {const step=previous.get(cursor);segments.unshift(step.edge);path.unshift(step.node);cursor=step.node;}
  const minutes=segments.reduce((sum,e)=>sum+e.minutes,0);
  return {path,segments,minutes,cost:distance.get(end),scores:Object.fromEntries(signals.map(key=>[key,Math.round(segments.reduce((sum,e)=>sum+e.minutes*e[key],0)/minutes)]))};
}
