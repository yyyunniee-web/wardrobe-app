/**
 * 订单截图解析离线实测（不依赖智谱 Key）
 * 用法: node scripts/test-order-parse.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SCENE_TAGS = ['通勤','约会','居家','运动','度假','正式','休闲'];
const SEASONS = ['春','夏','秋','冬'];
const FABRICS = ['棉','麻','丝','羊毛','羊绒','牛仔','化纤','皮革','针织','混纺','其他'];
const COLORS = ['黑','白','灰','米','棕','蓝','绿','红','粉','黄','橙','紫','花色'];

function simplifyOrderTitle(raw){
  var s = String(raw || '').trim();
  if(!s) return '';
  s = s.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '');
  s = s.replace(/(爆款|女神必备|必入|显瘦|遮肉|网红|直播间|旗舰店|专柜|包邮|现货|正品|特价|清仓|秒杀)/g, '');
  s = s.replace(/20\d{2}新款|新款|百搭|设计感|宽松|薄款|夏季|冬季|春季|秋季|女装|男装|女士|男款/g, '');
  s = s.replace(/\d+xl|\d+XL|[XSML]{1,3}码|均码/gi, '');
  s = s.replace(/[,，、|｜/\s]{2,}/g, '').trim();
  var typeRe = /(连衣裙|半身裙|半裙|阔腿裤|牛仔裤|防晒衣|防晒衫|针织衫|卫衣|罩衫|衬衫|T恤|羽绒服|大衣|风衣|外套|上衣|裤子|裤|裙|鞋|包)/;
  var m = s.match(typeRe);
  if(m && m.index != null){
    s = s.slice(0, m.index + m[1].length);
  } else if(s.length > 20){
    s = s.slice(0, 18);
  }
  s = s.replace(/[男女]$/, '');
  return s.trim();
}

function mapCategoryFromTitle(title, aiCategory){
  var t = String(title || '');
  var endRules = [
    [/连衣裙$/, '连衣裙'],
    [/(半身裙|半裙|短裙|百褶裙|裙)$/, '裙装'],
    [/(牛仔裤|阔腿裤|休闲裤|西裤|短裤|工装裤|裤)$/, '裤装'],
    [/(羽绒服|大衣|风衣|夹克|冲锋衣|外套)$/, '外套'],
    [/(运动鞋|板鞋|凉鞋|拖鞋|皮鞋|靴|鞋)$/, '鞋'],
    [/(双肩包|托特包|斜挎包|腋下包|手提包|腰包|包)$/, '包'],
    [/(项链|耳环|帽子|围巾|丝巾|腰带|手套|配饰)$/, '配饰'],
    [/(T恤|衬衫|针织衫|卫衣|罩衫|防晒衣|防晒衫|打底衫|背心|吊带|上衣)$/, '上衣']
  ];
  for(var i=0;i<endRules.length;i++){
    if(endRules[i][0].test(t)) return endRules[i][1];
  }
  var rules = [
    [/连衣裙/, '连衣裙'],
    [/半身裙|半裙|短裙|百褶裙/, '裙装'],
    [/牛仔裤|阔腿裤|休闲裤|西裤|短裤|工装裤|裤子/, '裤装'],
    [/羽绒服|大衣|风衣|夹克|冲锋衣|外套/, '外套'],
    [/运动鞋|板鞋|靴|凉鞋|拖鞋|皮鞋/, '鞋'],
    [/双肩包|托特包|斜挎|腋下包|手提包|腰包/, '包'],
    [/项链|耳环|帽子|围巾|丝巾|腰带|手套/, '配饰'],
    [/T恤|衬衫|针织衫|卫衣|罩衫|防晒[衣衫]|打底衫|背心|吊带|上衣/, '上衣']
  ];
  for(var j=0;j<rules.length;j++){
    if(rules[j][0].test(t)) return rules[j][1];
  }
  var catMap = {
    '上衣':'上衣','外套':'外套','裤装':'裤装','裤子':'裤装','裙装':'裙装','裙子':'裙装',
    '连衣裙':'连衣裙','鞋':'鞋','包':'包','配饰':'配饰','内衣':'内衣','其他':'其他'
  };
  if(aiCategory && catMap[String(aiCategory).trim()]) return catMap[String(aiCategory).trim()];
  return '';
}

function inferSeasonFromBuyDateAndTitle(buyDate, title, aiSeason){
  var seasons = [];
  var t = String(title || '');
  if(/冰丝|短袖|凉鞋|薄款|凉感|防晒/.test(t)) seasons.push('夏');
  if(/羽绒|毛衣|羊毛|羊绒|加绒|加厚/.test(t)) seasons.push('冬');
  var m = 0;
  if(buyDate && /^\d{4}-\d{1,2}-\d{1,2}$/.test(buyDate)){
    m = Number(String(buyDate).split('-')[1]);
  }
  if(m){
    var byMonth = (m===12||m<=2) ? '冬' : (m<=5 ? '春' : (m<=8 ? '夏' : '秋'));
    if(seasons.indexOf(byMonth)<0) seasons.unshift(byMonth);
  }
  if(aiSeason && SEASONS.indexOf(aiSeason)>=0 && seasons.indexOf(aiSeason)<0){
    seasons.unshift(aiSeason);
  }
  var out = [];
  SEASONS.forEach(function(s){ if(seasons.indexOf(s)>=0) out.push(s); });
  return out;
}

function normalizeBuyDateFromAI(parsed){
  var y = new Date().getFullYear();
  var raw = parsed.purchaseDate || parsed.buyTime || '';
  if(raw){
    var d = String(raw).trim()
      .replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
      .replace(/[./]/g, '-');
    var m1 = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m1){
      return m1[1]+'-'+String(Number(m1[2])).padStart(2,'0')+'-'+String(Number(m1[3])).padStart(2,'0');
    }
    var m2 = d.match(/^(\d{1,2})-(\d{1,2})$/);
    if(m2){
      return y+'-'+String(Number(m2[1])).padStart(2,'0')+'-'+String(Number(m2[2])).padStart(2,'0');
    }
    var m3 = String(raw).match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if(m3){
      return y+'-'+String(Number(m3[1])).padStart(2,'0')+'-'+String(Number(m3[2])).padStart(2,'0');
    }
  }
  return '';
}

function mapFabricFromKeywords(fabricField, tags, title){
  var blob = [fabricField].concat(Array.isArray(tags)?tags:[]).concat([title||'']).join(' ');
  var pairs = [
    [/羊绒/, '羊绒'], [/羊毛|呢|毛衣/, '羊毛'], [/牛仔/, '牛仔'], [/皮革|皮衣/, '皮革'],
    [/针织/, '针织'], [/亚麻|苎麻/, '麻'], [/真丝|丝绸/, '丝'],
    [/棉/, '棉'], [/冰丝|雪纺|聚酯|涤纶|化纤/, '化纤'], [/混纺/, '混纺']
  ];
  for(var i=0;i<pairs.length;i++){
    if(pairs[i][0].test(blob)) return pairs[i][1];
  }
  if(fabricField && FABRICS.indexOf(String(fabricField).trim())>=0) return String(fabricField).trim();
  return '';
}

function mapScenesFromAI(parsed, title){
  var out = [];
  function pushScene(s){
    if(!s) return;
    s = String(s).trim();
    if(s === '日常') s = '休闲';
    if(s === '旅行') s = '度假';
    if(SCENE_TAGS.indexOf(s)>=0 && out.indexOf(s)<0) out.push(s);
  }
  if(Array.isArray(parsed.scenes)) parsed.scenes.forEach(pushScene);
  if(Array.isArray(parsed.tags)){
    parsed.tags.forEach(function(tg){
      if(SCENE_TAGS.indexOf(tg)>=0 || tg==='旅行' || tg==='日常') pushScene(tg);
    });
  }
  var t = String(title||'');
  if(/通勤|上班|职场/.test(t)) pushScene('通勤');
  if(/度假|旅行/.test(t)) pushScene('旅行');
  if(/运动|跑步|健身/.test(t)) pushScene('运动');
  if(/约会/.test(t)) pushScene('约会');
  return out;
}

function extractStyleTags(parsed, title){
  var allow = ['简约','法式','休闲','优雅','通勤','复古','街头','日系','韩系'];
  var out = [];
  function push(s){
    s = String(s||'').trim();
    if(allow.indexOf(s)>=0 && out.indexOf(s)<0) out.push(s);
  }
  if(Array.isArray(parsed.tags)) parsed.tags.forEach(push);
  if(Array.isArray(parsed.styleTags)) parsed.styleTags.forEach(push);
  var t = String(title||'');
  allow.forEach(function(a){ if(t.indexOf(a)>=0) push(a); });
  return out.slice(0, 4);
}

function normalizeThumbBox(box){
  if(!box || typeof box !== 'object') return null;
  var x = Number(box.x);
  var y = Number(box.y);
  var w = Number(box.width != null ? box.width : box.w);
  var h = Number(box.height != null ? box.height : box.h);
  if(!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
  if(w > 1 || h > 1 || x > 1 || y > 1){
    x = x/100; y = y/100; w = w/100; h = h/100;
  }
  if(!(w>0.04 && h>0.04)) return null;
  x = Math.max(0, Math.min(0.9, x));
  y = Math.max(0, Math.min(0.9, y));
  w = Math.max(0.05, Math.min(0.6, w));
  h = Math.max(0.05, Math.min(0.6, h));
  if(x+w > 1) w = 1-x;
  if(y+h > 1) h = 1-y;
  return { x:x, y:y, w:w, h:h };
}

function parseAIResponse(text){
  var cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  var first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if(first>=0 && last>first) cleaned = cleaned.slice(first, last+1);
  var parsed = JSON.parse(cleaned);

  var nameRaw = String(parsed.nameRaw || parsed.name || '').trim();
  var nameShow = String(parsed.name || '').trim();
  if(nameShow) nameShow = simplifyOrderTitle(nameShow);
  else if(nameRaw) nameShow = simplifyOrderTitle(nameRaw);

  var buyDate = normalizeBuyDateFromAI(parsed);
  var titleForRules = nameRaw || nameShow;
  var category = mapCategoryFromTitle(titleForRules, parsed.category);
  var aiSeason = String(parsed.season || '').trim();
  var seasons = inferSeasonFromBuyDateAndTitle(buyDate, titleForRules, aiSeason);
  var scenes = mapScenesFromAI(parsed, titleForRules);
  var fabric = mapFabricFromKeywords(parsed.fabric, parsed.tags || parsed.fabricKeywords, titleForRules);
  var styleTags = extractStyleTags(parsed, titleForRules);
  var thumbBox = normalizeThumbBox(parsed.cropSuggestion || parsed.thumbBox);

  var result = {
    name: nameShow || nameRaw,
    nameRaw: nameRaw || nameShow,
    category: category,
    seasons: seasons,
    scenes: scenes,
    color: '',
    fabric: fabric,
    buyDate: buyDate,
    price: '',
    photo: '',
    status: 'active',
    confidence: String(parsed.confidence || '').trim(),
    isOrderScreenshot: !!(parsed.price || parsed.purchaseDate || parsed.buyTime || thumbBox || nameShow),
    styleTags: styleTags,
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).slice(0, 8) : [],
    thumbBox: thumbBox
  };

  if(parsed.color){
    var colorRaw = String(parsed.color).split(/[,，、\s]/)[0].trim();
    if(colorRaw && COLORS.indexOf(colorRaw)>=0) result.color = colorRaw;
  }
  if(parsed.price != null && parsed.price !== ''){
    var n = Number(String(parsed.price).replace(/[^\d.]/g, ''));
    if(n) result.price = Math.round(n * 100) / 100;
  }
  return result;
}

// —— 模拟视觉模型对用户提供截图的原始输出（含故意未简化的长标题）——
const modelRawJson = {
  name: '法式撞色百搭冰丝针织防晒罩衫女夏季简约设计感宽松薄款条纹上衣',
  category: '上衣',
  price: '76.4',
  purchaseDate: '6月18日',
  season: '夏',
  scenes: ['休闲', '通勤'],
  fabric: '冰丝',
  tags: ['法式', '简约', '针织', '条纹'],
  confidence: 'high',
  cropSuggestion: { x: '0.04', y: '0.03', width: '0.22', height: '0.24' }
};

const mapped = parseAIResponse(JSON.stringify(modelRawJson));

const expected = {
  name: '法式撞色冰丝针织防晒罩衫',
  category: '上衣',
  price: 76.4,
  buyDate: `${new Date().getFullYear()}-06-18`,
  seasons: ['夏'],
  fabric: '针织', // 标题含针织，优先于冰丝→化纤
};

const checks = [
  ['name', mapped.name === expected.name, mapped.name, expected.name],
  ['category', mapped.category === expected.category, mapped.category, expected.category],
  ['price', mapped.price === expected.price, mapped.price, expected.price],
  ['buyDate', mapped.buyDate === expected.buyDate, mapped.buyDate, expected.buyDate],
  ['seasons', JSON.stringify(mapped.seasons) === JSON.stringify(expected.seasons), mapped.seasons, expected.seasons],
  ['fabric', mapped.fabric === expected.fabric, mapped.fabric, expected.fabric],
  ['crop', !!mapped.thumbBox, mapped.thumbBox, 'non-null'],
];

console.log('=== 模型原始 JSON ===');
console.log(JSON.stringify(modelRawJson, null, 2));
console.log('\n=== 客户端映射后（入库前预览字段）===');
console.log(JSON.stringify({
  name: mapped.name,
  category: mapped.category,
  price: mapped.price,
  purchaseDate: mapped.buyDate,
  season: mapped.seasons[0] || '',
  seasons: mapped.seasons,
  scenes: mapped.scenes,
  fabric: mapped.fabric,
  tags: mapped.tags,
  styleTags: mapped.styleTags,
  confidence: mapped.confidence,
  cropSuggestion: mapped.thumbBox ? {
    x: String(mapped.thumbBox.x),
    y: String(mapped.thumbBox.y),
    width: String(mapped.thumbBox.w),
    height: String(mapped.thumbBox.h)
  } : { x:'', y:'', width:'', height:'' }
}, null, 2));

console.log('\n=== 校验 ===');
let fail = 0;
for (const [k, ok, got, exp] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${k}: got=${JSON.stringify(got)} expected=${JSON.stringify(exp)}`);
  if (!ok) fail++;
}

const thumbPath = path.join(root, 'tmp/product-thumb.jpg');
console.log('\n=== 裁剪文件 ===');
console.log(fs.existsSync(thumbPath) ? `OK ${thumbPath} (${fs.statSync(thumbPath).size} bytes)` : 'MISSING thumb');

process.exit(fail ? 1 : 0);
