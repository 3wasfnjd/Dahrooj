"""Select and optimise the user's free Quaternius packs; leave source archives intact."""
import json,shutil,sys
from pathlib import Path
from PIL import Image
source=Path(sys.argv[1]);target=Path(__file__).resolve().parents[1]/'assets'
selected={'nature':['CommonTree_1','CommonTree_5','Pine_2','Rock_Medium_1','Rock_Medium_3','Bush_Common','Fern_1','Flower_3_Group','Grass_Common_Short','Mushroom_Common'], 'props':['Crate_Wooden','Barrel','Chest_Wood','Book_Stack_1','Key_Gold']}
report=[]
for pack,names in selected.items():
 out=target/'models'/pack;out.mkdir(parents=True,exist_ok=True)
 for name in names:
  p=next((source/pack).rglob(name+'.gltf'));d=json.loads(p.read_text())
  for m in d.get('materials',[]):
   m.pop('normalTexture',None);m.pop('occlusionTexture',None)
   pb=m.setdefault('pbrMetallicRoughness',{});pb.pop('metallicRoughnessTexture',None)
   pb['roughnessFactor']=.86;pb['metallicFactor']=.08
  indices=sorted({m['pbrMetallicRoughness']['baseColorTexture']['index'] for m in d['materials'] if 'baseColorTexture' in m['pbrMetallicRoughness']})
  textures=[d['textures'][i] for i in indices];images=[]
  for i,tx in enumerate(textures):
   old=d['images'][tx['source']];origin=p.parent/old['uri'];im=Image.open(origin);im.thumbnail((512,512),Image.Resampling.LANCZOS)
   alpha=im.mode=='RGBA' and im.getextrema()[3][0]<255
   ext='.png' if alpha else '.jpg';fn=origin.stem+ext
   if not (out/fn).exists():
    if alpha:im.save(out/fn,optimize=True)
    else:im.convert('RGB').save(out/fn,quality=85,optimize=True)
   images.append({'uri':fn,'mimeType':'image/png' if alpha else 'image/jpeg'});tx['source']=i
  for m in d['materials']:
   tx=m['pbrMetallicRoughness'].get('baseColorTexture')
   if tx:tx['index']=indices.index(tx['index'])
  d['images']=images;d['textures']=textures
  for b in d['buffers']:shutil.copy2(p.parent/b['uri'],out/b['uri'])
  (out/(name+'.gltf')).write_text(json.dumps(d,separators=(',',':')))
  tris=sum(d['accessors'][pr['indices']]['count']//3 for m in d.get('meshes',[]) for pr in m['primitives'] if 'indices' in pr)
  report.append({'id':name,'pack':pack,'triangles':tris,'path':'assets/models/'+pack+'/'+name+'.gltf'})
 shutil.copy2(source/pack/'License_Standard.txt',target/'licenses'/('Quaternius-'+pack+'-CC0.txt'))
(target/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'models':len(report),'bytes':sum(p.stat().st_size for p in target.rglob('*') if p.is_file()),'trianglesPerUniqueModel':report},indent=2))
