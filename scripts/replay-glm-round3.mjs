/**
 * 用已保存的真实 GLM rawText + 第三轮后处理复测（不调 API，不写 Key）
 * node scripts/replay-glm-round3.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'tmp/batch5');
const reportIn = path.join(outDir, 'glm-real-report.json');

const SEASONS = ['春','夏','秋','冬'];
const COLORS = ['黑','白','灰','米','卡其','棕','藏蓝','军绿','酒红','粉','黄','绿','蓝','紫','花色','其他'];
const FABRICS = ['棉','麻','丝','羊毛','羊绒','牛仔','化纤','皮革','针织','冰丝','德绒','混纺','其他'];

function simplifyOrderTitle(raw){
  var s = String(raw || '').trim();
  if(!s) return '';
  s = s.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '');
  s = s.replace(/[「『][^」』]{0,6}[」』]/g, '');
  s = s.replace(/(爆款|女神必备|必入|显瘦|遮肉|网红|直播间|旗舰店|专柜|包邮|现货|正品|特价|清仓|秒杀|优惠价|高质量|小众|今年流行|婴儿肌|柔软|气质|辣妹|潮款|开衩|设计感|设计)/g, '');
  s = s.replace(/20\d{2}新款|新款|百搭|宽松|薄款|透气|夏季|冬季|春季|秋季|女装|男装|女士|男款/g, '');
  s = s.replace(/吊带裙外搭|外搭/g, '');
  s = s.replace(/女/g, '').replace(/男/g, '');
  s = s.replace(/潮(?![流])|^潮|潮$/g, '');
  s = s.replace(/[春夏秋冬](?![季款装])/g, '');
  s = s.replace(/连衣裙长裙/g, '连衣裙');
  s = s.replace(/\d+xl|\d+XL|[XSML]{1,3}码|均码/gi, '');
  s = s.replace(/(adidas|阿迪达斯)/gi, '');
  s = s.replace(/[,，、|｜/\s]{2,}/g, '').replace(/\s+/g, '').trim();
  if(s.length > 20){
    var startMats = s.search(/冰丝|针织|德绒|法式|蕾丝|亚麻|美式|复古|MEGA|纯棉|羊毛|羊绒|撞色/);
    var head = s.slice(startMats >= 0 ? startMats : 0);
    var m = head.match(/^(.*?(连衣裙|半身裙|阔腿裤|牛仔裤|老爹鞋|运动鞋|瑜伽裤|连帽衫|针织衫|防晒衣|防晒衫|开衫|罩衫|衬衫|T恤|卫衣|外套|大衣|风衣|上衣|裤子))/);
    if(m && m[1]) s = m[1];
    else s = head.slice(0, 20);
  }
  if(s.length > 22) s = s.slice(0, 22);
  return s.trim();
}
function mapCategoryFromTitle(title, aiCategory){
  var t = String(title || '');
  if(/连衣裙/.test(t)) return '连衣裙';
  if(/老爹鞋|运动鞋|板鞋|凉鞋|拖鞋|皮鞋|靴|鞋子/.test(t) || (/鞋/.test(t) && /adidas|阿迪|慢跑|休闲鞋|厚底|老爹/.test(t))) return '鞋';
  var rules = [
    [/半身裙|半裙|短裙|百褶裙|裙装/, '裙装'],
    [/牛仔裤|阔腿裤|休闲裤|西裤|短裤|工装裤|瑜伽裤|裤子|裤装/, '裤装'],
    [/羽绒服|大衣|风衣|夹克|冲锋衣|开衫|披肩|外套/, '外套'],
    [/T恤|衬衫|针织衫|卫衣|连帽衫|罩衫|防晒[衣衫]|打底衫|背心|吊带|上衣/, '上衣'],
    [/鞋/, '鞋']
  ];
  for(var j=0;j<rules.length;j++){ if(rules[j][0].test(t)) return rules[j][1]; }
  var catMap = {'上衣':'上衣','外套':'外套','裤装':'裤装','裙装':'裙装','连衣裙':'连衣裙','鞋':'鞋'};
  if(aiCategory && catMap[String(aiCategory).trim()]) return catMap[String(aiCategory).trim()];
  return '';
}
function inferSeasonFromBuyDateAndTitle(buyDate, title, aiSeason){
  var seasons = [];
  var t = String(title || '');
  if(/冰丝|短袖|凉鞋|薄款|凉感|防晒/.test(t)) seasons.push('夏');
  if(/羽绒|毛衣|羊毛|羊绒|加绒|加厚|德绒/.test(t)) seasons.push('冬');
  if(aiSeason === '春秋'){ aiSeason = ''; if(seasons.indexOf('春')<0) seasons.push('春'); if(seasons.indexOf('秋')<0) seasons.push('秋'); }
  var m = 0;
  if(buyDate && /^\d{4}-\d{1,2}-\d{1,2}$/.test(buyDate)) m = Number(String(buyDate).split('-')[1]);
  if(m){
    var byMonth = (m===12||m<=2) ? '冬' : (m<=5 ? '春' : (m<=8 ? '夏' : '秋'));
    if(seasons.indexOf(byMonth)<0) seasons.unshift(byMonth);
  }
  if(aiSeason && SEASONS.indexOf(aiSeason)>=0 && seasons.indexOf(aiSeason)<0) seasons.unshift(aiSeason);
  var out = []; SEASONS.forEach(function(s){ if(seasons.indexOf(s)>=0) out.push(s); });
  return out;
}
function normalizeBuyDateFromAI(parsed){
  var yNow = new Date().getFullYear();
  var raw = parsed.purchaseDate || parsed.buyTime || '';
  function pack(month, day){
    month = Number(month); day = Number(day);
    if(!(month>=1 && month<=12)) return '';
    if(!(day>=1 && day<=31)) day = 1;
    return yNow+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }
  if(raw){
    var text = String(raw).trim();
    var mCN = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if(mCN) return pack(mCN[1], mCN[2]);
    var d = text.replace(/年/g,'-').replace(/月/g,'-').replace(/日/g,'').replace(/[./]/g,'-');
    var mFull = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(mFull) return pack(mFull[2], mFull[3]);
    var mYm = d.match(/^(\d{4})-(\d{1,2})$/);
    if(mYm) return pack(mYm[2], 1);
    var mMd = d.match(/^(\d{1,2})-(\d{1,2})$/);
    if(mMd) return pack(mMd[1], mMd[2]);
  }
  return '';
}
function mapFabricsFromKeywords(fabricField, fabricList, tags, title){
  var parts = [];
  function pushFab(f){
    f = String(f || '').trim();
    if(!f) return;
    if(f.indexOf('+') >= 0){ f.split('+').forEach(pushFab); return; }
    if(FABRICS.indexOf(f)>=0 && parts.indexOf(f)<0) parts.push(f);
  }
  if(Array.isArray(fabricList)) fabricList.forEach(pushFab);
  if(fabricField) String(fabricField).split(/[+、,，/]/).forEach(pushFab);
  var blob = [fabricField].concat(fabricList||[]).concat(tags||[]).concat([title||'']).join(' ');
  [[/德绒/,'德绒'],[/冰丝/,'冰丝'],[/针织/,'针织'],[/亚麻|苎麻/,'麻'],[/棉/,'棉']].forEach(function(p){ if(p[0].test(blob)) pushFab(p[1]); });
  return parts.join('+');
}
function mapColorToBase(raw){
  var s = String(raw || '').trim();
  if(!s) return '';
  s = s.split(/[/／|｜,，、\s]/)[0].trim();
  if(COLORS.indexOf(s)>=0) return s;
  if(/条纹|格纹|印花|撞色|拼色|杂色|花色/.test(s)) return '花色';
  var alias = {'黑色':'黑','白色':'白','灰色':'灰','金属银':'灰','银色':'灰'};
  if(alias[s]) return alias[s];
  var noSe = s.replace(/色$/,'');
  if(COLORS.indexOf(noSe)>=0) return noSe;
  if(alias[noSe]) return alias[noSe];
  if(/灰|银/.test(s)) return '灰';
  if(/黑/.test(s)) return '黑';
  if(/白/.test(s)) return '白';
  return '';
}
function normalizeColorFromAI(parsed){
  var raw = String(parsed.colorRaw || parsed.color || '').trim();
  raw = raw.replace(/【[^】]*】/g, '');
  raw = raw.replace(/[:：]\s*[XSML]{1,3}\b.*$/i, '');
  raw = raw.replace(/[;；].*$/, '');
  raw = raw.replace(/\d+\s*\[[^\]]*\]/g, '');
  raw = raw.replace(/\b[XSML]{1,3}\b/gi, '');
  raw = raw.replace(/(连帽衫|裤子|外套|上衣|T恤|裙|鞋)$/g, '');
  raw = raw.replace(/\.\s*$/, '').trim();
  var segments = raw ? raw.split(/[/／|｜,，、]/).map(function(x){return x.trim();}).filter(Boolean) : [];
  var bases = [];
  segments.forEach(function(seg){ var b=mapColorToBase(seg); if(b&&bases.indexOf(b)<0) bases.push(b); });
  var base = bases.length>=2 ? '花色' : (bases[0]||'');
  return { color: base, colorRaw: raw };
}
function parsePriceNumber(v){ if(v==null||v==='') return ''; var n=Number(String(v).replace(/[^\d.]/g,'')); return n?Math.round(n*100)/100:''; }
function normalizeThumbBox(box){
  if(!box || typeof box !== 'object') return null;
  var x = Number(box.x), y = Number(box.y);
  var w = Number(box.width != null ? box.width : box.w);
  var h = Number(box.height != null ? box.height : box.h);
  if(!isFinite(x)||!isFinite(y)||!isFinite(w)||!isFinite(h)) return null;
  if(w>1||h>1||x>1||y>1){ x/=100; y/=100; w/=100; h/=100; }
  if(!(w>0.04 && h>0.04)) return null;
  if(w > 0.5 || h > 0.5) return null;
  return { x, y, w, h };
}
function defaultOrderThumbBox(itemIndex){
  var i = Number(itemIndex)||0;
  var y = 0.12 + i * 0.26;
  if(y > 0.62) y = 0.62;
  return { x: 0.04, y: y, w: 0.24, h: 0.20 };
}
function resolveOrderThumbBox(aiBox, itemIndex){
  return normalizeThumbBox(aiBox) || defaultOrderThumbBox(itemIndex);
}
function mapParsedItemToCloth(parsed, shared){
  shared = shared||{};
  var nameRaw = String(parsed.nameRaw || parsed.name || shared.nameRaw || '').trim();
  var nameShow = String(parsed.name || '').trim();
  if(nameShow) nameShow = simplifyOrderTitle(nameShow);
  else if(nameRaw) nameShow = simplifyOrderTitle(nameRaw);
  var buyDate = normalizeBuyDateFromAI(Object.assign({}, shared, parsed));
  var titleForRules = nameRaw || nameShow;
  var category = mapCategoryFromTitle(titleForRules, parsed.category || shared.category);
  var sku = String(parsed.skuLabel || parsed.colorRaw || '').trim();
  if(/裤子|瑜伽裤|阔腿裤/.test(sku)) category = '裤装';
  else if(/连帽衫|卫衣|T恤|上衣/.test(sku)) category = '上衣';
  var seasons = inferSeasonFromBuyDateAndTitle(buyDate, titleForRules, String(parsed.season||shared.season||'').trim());
  var fabric = mapFabricsFromKeywords(parsed.fabric||shared.fabric, parsed.fabricList||shared.fabricList, parsed.tags||shared.tags, titleForRules);
  var colorInfo = normalizeColorFromAI(Object.assign({}, shared, parsed));
  var itemIndex = parsed.index != null ? parsed.index : (shared.itemIndex||0);
  return {
    name: nameShow||nameRaw, nameRaw, category, seasons,
    color: colorInfo.color, colorRaw: colorInfo.colorRaw, fabric, buyDate,
    price: parsePriceNumber(parsed.price),
    thumbBox: resolveOrderThumbBox(parsed.cropSuggestion||parsed.thumbBox, itemIndex),
    itemIndex,
    scenes: Array.isArray(parsed.scenes)?parsed.scenes:[]
  };
}
function parseAIResponse(text){
  var cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  var first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if(first>=0 && last>first) cleaned = cleaned.slice(first, last+1);
  var parsed = JSON.parse(cleaned);
  var items = Array.isArray(parsed.items) ? parsed.items.filter(Boolean) : [];
  var count = Number(parsed.itemCount) || items.length || 1;
  if(items.length>=2) count = Math.max(count, items.length);
  var result = mapParsedItemToCloth(parsed, { purchaseDate: parsed.purchaseDate, season: parsed.season });
  result.itemCount = count;
  result.items = items.map(function(it, idx){
    return Object.assign({}, it, { index: idx, price: parsePriceNumber(it.price) });
  });
  result.needsItemPick = count>=2 && items.length>=2;
  result.rawModelJson = parsed;
  if(result.needsItemPick){ result.name=''; result.price=''; }
  return result;
}
function crop(file, box, out){
  const meta = execSync(`sips -g pixelWidth -g pixelHeight "${file}"`).toString();
  const W = Number(meta.match(/pixelWidth:\s*(\d+)/)[1]);
  const H = Number(meta.match(/pixelHeight:\s*(\d+)/)[1]);
  const sx=Math.round(box.x*W), sy=Math.round(box.y*H), sw=Math.round(box.w*W), sh=Math.round(box.h*H);
  execSync(`sips --cropToHeightWidth ${sh} ${sw} --cropOffset ${sy} ${sx} "${file}" --out "${out}" >/dev/null`);
  return { ok:true, sx,sy,sw,sh };
}

const prev = JSON.parse(fs.readFileSync(reportIn, 'utf8'));
const files = {1:'1-top.jpg',2:'2-dress.jpg',3:'3-pants.jpg',4:'4-shoes.jpg',5:'5-outer.jpg'};
const out = { ranAt: new Date().toISOString(), mode: 'replay-round3-on-saved-glm-raw', results: [] };

for (const r of prev.results) {
  console.log('\n======== 【图片'+r.id+'】'+r.label+' ========');
  const parsed = parseAIResponse(r.rawText);
  let final = parsed;
  if (parsed.needsItemPick) {
    console.log('多件选件: YES');
    const chosen = parsed.items.find(it => it.price===89 || /裤/.test(String(it.colorRaw)+it.name+it.category)) || parsed.items[1];
    const idx = parsed.items.indexOf(chosen);
    final = mapParsedItemToCloth(Object.assign({}, chosen, { index: idx }), {
      purchaseDate: parsed.rawModelJson.purchaseDate,
      season: chosen.season,
      itemIndex: idx
    });
    if (!final.buyDate) final.buyDate = normalizeBuyDateFromAI({ purchaseDate: parsed.rawModelJson.purchaseDate });
  }
  const thumb = path.join(outDir, 'r3-thumb-'+r.id+'.jpg');
  let cropInfo = null;
  try { cropInfo = crop(path.join(outDir, files[r.id]), final.thumbBox, thumb); } catch(e){ cropInfo={ok:false,reason:String(e)}; }
  console.log('name:', final.name, '(len='+final.name.length+')');
  console.log('cat:', final.category);
  console.log('colorRaw/color:', final.colorRaw, '/', final.color);
  console.log('price:', final.price);
  console.log('date:', final.buyDate);
  console.log('seasons:', (final.seasons||[]).join(','));
  console.log('fabric:', final.fabric);
  console.log('crop:', cropInfo, 'box=', final.thumbBox);
  out.results.push({ id:r.id, label:r.label, mapped: final, crop: cropInfo, needsItemPick: parsed.needsItemPick });
}
fs.writeFileSync(path.join(outDir, 'glm-round3-replay.json'), JSON.stringify(out, null, 2));
console.log('\n写入 tmp/batch5/glm-round3-replay.json');
