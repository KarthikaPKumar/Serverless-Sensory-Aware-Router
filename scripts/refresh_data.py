"""Download attributed public JSON snapshots. No credentials or private data."""
import argparse, collections, datetime as dt, json, math, pathlib, urllib.parse, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]; OUT=ROOT/'docs/data'; OUT.mkdir(exist_ok=True)
BASE='https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/'
BBOX=[-37.827,144.948,-37.802,144.980]
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Kathy-Senseway/2.0 (public portfolio data snapshot)'})
 with urllib.request.urlopen(req,timeout=150) as r:return json.load(r)
def api(ds,kind='exports/json',**params):return fetch(BASE+ds+'/'+kind+'?'+urllib.parse.urlencode(params))
def save(name,data):
 p=OUT/(name+'.json');tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':')));tmp.replace(p)
def now():return dt.datetime.now(dt.timezone.utc)
def stamp(d):return d.isoformat()
def inside(lat,lon):return BBOX[0]<=lat<=BBOX[2] and BBOX[1]<=lon<=BBOX[3]
def meters(a,b):
 lat1,lon1=map(math.radians,a);lat2,lon2=map(math.radians,b)
 return 6371000*2*math.asin(min(1,math.sqrt(math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2)))
def pedestrian():
 end=now();start=end-dt.timedelta(hours=1)
 locations=api('pedestrian-counting-system-sensor-locations')
 rows=api('pedestrian-counting-system-past-hour-counts-per-minute',where=f'sensing_datetime >= "{stamp(start)}" AND sensing_datetime <= "{stamp(end)}"',select='location_id,sensing_datetime,total_of_directions')
 buckets={};duplicates=conflicts=rejected=0
 for r in rows:
  try:
   when=dt.datetime.fromisoformat(r['sensing_datetime'].replace('Z','+00:00'));n=r['total_of_directions'];key=(str(r['location_id']),stamp(when))
   if not start<=when<=end or not isinstance(n,(int,float)) or not math.isfinite(n) or n<0 or n!=int(n):raise ValueError()
   if key in buckets:
    duplicates+=1
    if buckets[key]!=n:buckets[key]=None;conflicts+=1
   else:buckets[key]=n
  except (KeyError,ValueError,TypeError):rejected+=1
 sensors=[]
 for r in locations:
  try:
   lat=float(r['latitude']);lon=float(r['longitude']);sid=str(r['location_id'])
   if not inside(lat,lon) or r.get('status')!='A':continue
   vals=[(t,c) for (k,t),c in buckets.items() if k==sid and c is not None]
   sensors.append({'id':sid,'name':r['sensor_description'],'lat':lat,'lon':lon,'count':sum(c for _,c in vals) if vals else None,'observedAt':max(t for t,_ in vals) if vals else None,'reportingMinutes':len(vals)})
  except (ValueError,KeyError,TypeError):rejected+=1
 if not sensors:raise RuntimeError('No valid sensor locations; retaining previous snapshot')
 if not any(s['count'] is not None for s in sensors):raise RuntimeError('Source has no observations in the requested hour; retaining previous snapshot')
 data={'fetchedAt':stamp(end),'windowStart':stamp(start),'windowEnd':stamp(end),'source':'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-past-hour-counts-per-minute/','license':'CC BY','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','attribution':'City of Melbourne','duplicatesRemoved':duplicates,'conflictsExcluded':conflicts,'rejected':rejected,'sensors':sensors,'noise':None,'light':None}
 save('pedestrians',data);print('Pedestrians:',len(sensors),'locations;',sum(s['count'] is not None for s in sensors),'with observations; duplicate rows:',duplicates)
def addresses():
 rows=api('street-addresses',select='address_pnt,geo_point_2d',where='suburb="Melbourne"')
 found={}
 for r in rows:
  p=r.get('geo_point_2d') or {};lat=p.get('lat');lon=p.get('lon');name=r.get('address_pnt')
  if lat is not None and lon is not None and name and inside(lat,lon):found[(name,lat,lon)]={'name':' '.join(name.split()),'lat':lat,'lon':lon}
 if not found:raise RuntimeError('Empty address extract')
 save('addresses',{'fetchedAt':stamp(now()),'source':'https://data.melbourne.vic.gov.au/explore/dataset/street-addresses/','license':'CC BY','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','attribution':'City of Melbourne','addresses':sorted(found.values(),key=lambda r:r['name'])});print('Addresses:',len(found))
def network(raw=None):
 query='[out:json][timeout:120];way["highway"]["area"!="yes"]('+','.join(map(str,BBOX))+');out body;>;out body qt;'
 data=json.loads(pathlib.Path(raw).read_text()) if raw else fetch('https://overpass-api.de/api/interpreter?'+urllib.parse.urlencode({'data':query}))
 nodes={str(e['id']):e for e in data['elements'] if e['type']=='node'};edges=[]
 allowed={'footway','pedestrian','path','steps','living_street','residential','service','unclassified'}
 for w in data['elements']:
  if w['type']!='way':continue
  t=w.get('tags',{});h=t.get('highway');foot=t.get('foot')
  if h not in allowed or foot in {'no','private','use_sidepath'} or (t.get('access') in {'no','private','customers','delivery','permit'} and foot not in {'yes','designated','permissive'}):continue
  if any(k in t for k in ['access:conditional','foot:conditional','opening_hours']) or t.get('indoor')=='yes' or t.get('level','0') not in {'0',''}:continue
  if h=='service' and t.get('service') in {'driveway','parking_aisle','drive-through'}:continue
  for a,b in zip(w['nodes'],w['nodes'][1:]):
   a=str(a);b=str(b)
   if a not in nodes or b not in nodes:continue
   na,nb=nodes[a],nodes[b]
   if not all(inside(n['lat'],n['lon']) for n in [na,nb]):continue
   blocked=False
   for n in [na,nb]:
    tags=n.get('tags',{})
    if tags.get('barrier') in {'wall','fence','retaining_wall','block'} or tags.get('access') in {'no','private'} or tags.get('foot')=='no':blocked=True
   if blocked:continue
   length=round(meters([na['lat'],na['lon']],[nb['lat'],nb['lon']]),2)
   if length<.1:continue
   direction=t.get('oneway:foot','no')
   edges.append({'a':a,'b':b,'meters':length,'name':t.get('name', 'Steps' if h=='steps' else 'Unnamed footpath'),'kind':h,'oneway':direction})
 adjacency=collections.defaultdict(set)
 for e in edges:adjacency[e['a']].add(e['b']);adjacency[e['b']].add(e['a'])
 unseen=set(adjacency);largest=set()
 while unseen:
  start=unseen.pop();component={start};pending=[start]
  while pending:
   for v in adjacency[pending.pop()]:
    if v in unseen:unseen.remove(v);component.add(v);pending.append(v)
  if len(component)>len(largest):largest=component
 filtered=[e for e in edges if e['a'] in largest and e['b'] in largest]
 if len(filtered)<100:raise RuntimeError('Walking graph is unexpectedly small')
 save('streets',{'fetchedAt':stamp(now()),'osmTimestamp':data.get('osm3s',{}).get('timestamp_osm_base'),'bounds':BBOX,'source':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','attribution':'© OpenStreetMap contributors','nodes':[{ 'id':k,'lat':nodes[k]['lat'],'lon':nodes[k]['lon']} for k in sorted(largest)],'edges':filtered});print('Walking graph:',len(largest),'nodes,',len(filtered),'edges')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--all',action='store_true');p.add_argument('--osm-file');args=p.parse_args()
 pedestrian()
 if args.all:addresses();network(args.osm_file)
