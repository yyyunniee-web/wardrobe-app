/**
 * 真实 GLM-4V 端到端测试（仅读环境变量中的 Key，不写盘、不入库）
 * 后处理 / 裁剪逻辑与 src/wardrobe/app.ts 对齐。
 *
 *   export ZHIPU_API_KEY='...'   # 或 BIGMODEL_API_KEY / GLM_API_KEY
 *   node scripts/e2e-glm-order-test.mjs
 *
 * 结果写入 tmp/batch5/glm-real-report.json（不含 API Key）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'tmp/batch5');
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4v-flash';

const apiKey = process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY || process.env.GLM_API_KEY || '';
if (!apiKey) {
  console.error('ERROR: 未检测到环境变量 ZHIPU_API_KEY / BIGMODEL_API_KEY / GLM_API_KEY');
  console.error('请在当前终端先: export ZHIPU_API_KEY=\"你的key\"');
  process.exit(2);
}

/** 从 app.ts 抽取当前 AI_PROMPT，保持与线上一致 */
function loadAIPromptFromApp() {
  const src = fs.readFileSync(path.join(root, 'src/wardrobe/app.ts'), 'utf8');
  const m = src.match(/var AI_PROMPT = \[([\s\S]*?)\]\.join\('\\n'\);/);
  if (!m) throw new Error('无法从 app.ts 解析 AI_PROMPT');
  const parts = [];
  const re = /'((?:\\'|[^'])*)'/g;
  let mm;
  while ((mm = re.exec(m[1]))) {
    parts.push(mm[1].replace(/\\'/g, "'").replace(/\\n/g, '\n'));
  }
  if (parts.length < 5) throw new Error('AI_PROMPT 解析异常');
  return parts.join('\n');
}

// —— 与 app.ts 对齐的后处理（测试用副本；改规则时以 app.ts 为准）——
const SCENE_TAGS = ['通勤','约会','居家','运动','度假','正式','休闲'];
const SEASONS = ['春','夏','秋','冬'];
const COLORS = ['黑','白','灰','米','卡其','棕','藏蓝','军绿','酒红','粉','黄','绿','蓝','紫','花色','其他'];
const FABRICS = ['棉','麻','丝','羊毛','羊绒','牛仔','化纤','皮革','针织','冰丝','德绒','混纺','其他'];

function simplifyOrderTitle(raw){
  var s = String(raw || '').trim();
  if(!s) return '';
  s = s.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '');
  s = s.replace(/[「『][^」』]{0,6}[」』]/g, '');
  s = s.replace(/(爆款|女神必备|必入|显瘦|遮肉|网红|直播间|旗舰店|专柜|包邮|现货|正品|特价|清仓|秒杀|优惠价|高质量|小众|今年流行)/g, '');
  s = s.replace(/20\d{2}新款|新款|百搭|设计感|宽松|薄款|夏季|冬季|春季|秋季|女装|男装|女士|男款/g, '');
  s = s.replace(/\d+xl|\d+XL|[XSML]{1,3}码|均码/gi, '');
  s = s.replace(/(adidas|阿迪达斯)/gi, '');
  s = s.replace(/[,，、|｜/\s]{2,}/g, '').replace(/\s+/g, '').trim();
  s = s.replace(/[男女]+$/g, '');
  if(s.length > 22){
    var startMats = s.search(/冰丝|针织|德绒|法式|蕾丝|亚麻|美式|复古|MEGA|纯棉|羊毛|羊绒/);
    var head = s.slice(startMats >= 0 ? startMats : 0);
    var m = head.match(/^(.*?(连衣裙|半身裙|阔腿裤|牛仔裤|老爹鞋|运动鞋|瑜伽裤|连帽衫|针织衫|防晒衣|防晒衫|开衫|罩衫|衬衫|T恤|卫衣|外套|大衣|风衣|上衣|裤子))/);
    if(m && m[1]) s = m[1];
    else s = s.slice(0, 20);
    s = s.replace(/[男女]+$/g, '');
  }
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
    [/双肩包|托特包|斜挎|腋下包|手提包|腰包/, '包'],
    [/项链|耳环|帽子|围巾|丝巾|腰带|手套/, '配饰'],
    [/T恤|衬衫|针织衫|卫衣|连帽衫|罩衫|防晒[衣衫]|打底衫|背心|吊带|上衣/, '上衣'],
    [/鞋/, '鞋']
  ];
  for(var j=0;j<rules.length;j++){ if(rules[j][0].test(t)) return rules[j][1]; }
  var catMap = {'上衣':'上衣','外套':'外套','裤装':'裤装','裤子':'裤装','裙装':'裙装','裙子':'裙装','连衣裙':'连衣裙','鞋':'鞋','包':'包','配饰':'配饰'};
  if(aiCategory && catMap[String(aiCategory).trim()]) return catMap[String(aiCategory).trim()];
  return '';
}
function inferSeasonFromBuyDateAndTitle(buyDate, title, aiSeason){
  var seasons = [];
  var t = String(title || '');
  if(/冰丝|短袖|凉鞋|薄款|凉感|防晒/.test(t)) seasons.push('夏');
  if(/羽绒|毛衣|羊毛|羊绒|加绒|加厚|德绒/.test(t)) seasons.push('冬');
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
    if(!(day>=1 && day<=31) || !isFinite(day)) day = 1;
    return yNow+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }
  if(raw){
    var text = String(raw).trim();
    var mCN = text.match(/(\d{1,2})\s*月\s*(\d{1,2})?\s*日?/);
    if(mCN && mCN[1]) return pack(mCN[1], mCN[2] || 1);
    var mMdOnly = text.match(/^(\d{1,2})[-\/.](\d{1,2})$/);
    if(mMdOnly) return pack(mMdOnly[1], mMdOnly[2]);
    var mLoose = text.match(/(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/);
    if(mLoose){
      var dayPart = mLoose[3];
      var dayNum = (dayPart && /^\d{1,2}$/.test(dayPart)) ? Number(dayPart) : 1;
      return pack(mLoose[2], dayNum);
    }
    var d = text.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/[./]/g, '-');
    var mFull = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(mFull) return pack(mFull[2], mFull[3]);
    var mYm = d.match(/^(\d{4})-(\d{1,2})$/);
    if(mYm) return pack(mYm[2], 1);
    var mMd = d.match(/^(\d{1,2})-(\d{1,2})$/);
    if(mMd) return pack(mMd[1], mMd[2]);
  }
  var month = Number(parsed.buyMonth);
  var day = Number(parsed.buyDay);
  if(month>=1 && month<=12){
    return pack(month, (day>=1 && day<=31) ? day : 1);
  }
  return '';
}
function mapFabricsFromKeywords(fabricField, fabricList, tags, title){
  var parts = [];
  function pushFab(f){
    f = String(f || '').trim();
    if(!f) return;
    if(f.indexOf('+') >= 0){
      f.split('+').forEach(pushFab);
      return;
    }
    if(FABRICS.indexOf(f)>=0 && parts.indexOf(f)<0) parts.push(f);
  }
  if(Array.isArray(fabricList)) fabricList.forEach(pushFab);
  if(Array.isArray(fabricField)) fabricField.forEach(pushFab);
  else if(fabricField) String(fabricField).split(/[+、,，/]/).forEach(pushFab);
  if(Array.isArray(tags)) tags.forEach(pushFab);

  var blob = [fabricField].concat(Array.isArray(fabricList)?fabricList:[]).concat(Array.isArray(tags)?tags:[]).concat([title||'']).join(' ');
  var pairs = [
    [/德绒/, '德绒'], [/羊绒/, '羊绒'], [/羊毛|呢|毛衣/, '羊毛'], [/牛仔/, '牛仔'], [/皮革|皮衣/, '皮革'],
    [/冰丝/, '冰丝'], [/针织/, '针织'], [/亚麻|苎麻/, '麻'], [/真丝|丝绸/, '丝'],
    [/棉/, '棉'], [/雪纺|聚酯|涤纶|化纤/, '化纤'], [/混纺/, '混纺']
  ];
  for(var i=0;i<pairs.length;i++){
    if(pairs[i][0].test(blob)) pushFab(pairs[i][1]);
  }
  return parts.join('+');
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
  if(Array.isArray(parsed.sceneTags)) parsed.sceneTags.forEach(pushScene);
  if(parsed.sceneTag) pushScene(parsed.sceneTag);
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
function mapColorToBase(raw){
  var s = String(raw || '').trim();
  if(!s) return '';
  s = s.split(/[/／|｜,，、\s]/)[0].trim();
  if(!s) return '';
  if(COLORS.indexOf(s)>=0) return s;
  if(/条纹|格纹|印花|撞色|拼色|杂色|花色/.test(s)) return '花色';
  var alias = {
    '黑色':'黑','纯黑':'黑','炭黑':'黑','墨黑':'黑',
    '白色':'白','纯白':'白','米白':'米','乳白':'米','米白色':'米',
    '灰色':'灰','浅灰':'灰','深灰':'灰','烟灰':'灰','莫兰迪灰':'灰','雾霾灰':'灰','灰色系':'灰',
    '米色':'米','奶茶':'米','奶茶色':'米','燕麦':'米','燕麦色':'米','杏':'米','杏色':'米','奶油色':'米',
    '卡其色':'卡其',
    '棕色':'棕','咖啡色':'棕','咖色':'棕','咖':'棕','焦糖色':'棕','巧克力色':'棕','驼色':'棕',
    '藏青色':'藏蓝','藏青':'藏蓝','深蓝':'藏蓝',
    '军绿色':'军绿','墨绿':'军绿','橄榄绿':'军绿',
    '酒红色':'酒红','枣红':'酒红',
    '粉色':'粉','粉红色':'粉','藕粉':'粉','裸粉':'粉',
    '黄色':'黄','姜黄':'黄','芥末黄':'黄','柠檬黄':'黄',
    '绿色':'绿','青绿':'绿','黄绿':'绿','牛油果绿':'绿','浅绿':'绿',
    '蓝色':'蓝','雾霾蓝':'蓝','雾蓝':'蓝','天蓝':'蓝','浅蓝':'蓝','宝蓝':'蓝','牛仔蓝':'蓝',
    '紫色':'紫','香芋紫':'紫','芋紫':'紫','淡紫':'紫',
    '金属银':'灰','银色':'灰','银灰':'灰'
  };
  if(alias[s]) return alias[s];
  var noSe = s.replace(/色$/, '');
  if(COLORS.indexOf(noSe)>=0) return noSe;
  if(alias[noSe]) return alias[noSe];
  var rules = [
    [/雾霾蓝|雾蓝|天蓝|宝蓝|浅蓝|牛仔蓝/, '蓝'],
    [/奶茶|燕麦|米白|奶油|杏/, '米'],
    [/莫兰迪灰|雾霾灰|烟灰|深灰|浅灰/, '灰'],
    [/咖|咖啡|焦糖|驼|巧克力/, '棕'],
    [/藏青|藏蓝/, '藏蓝'],
    [/军绿|墨绿|橄榄/, '军绿'],
    [/酒红|枣红/, '酒红'],
    [/粉/, '粉'],
    [/黄绿|牛油果|青绿/, '绿'],
    [/紫|香芋/, '紫'],
    [/卡其/, '卡其'],
    [/黑/, '黑'],
    [/白/, '白'],
    [/灰/, '灰'],
    [/米/, '米'],
    [/棕|褐/, '棕'],
    [/黄/, '黄'],
    [/绿/, '绿'],
    [/蓝/, '蓝'],
    [/红/, '酒红']
  ];
  for(var i=0;i<rules.length;i++){
    if(rules[i][0].test(s)) return rules[i][1];
  }
  return '';
}
function normalizeColorFromAI(parsed, title){
  var raw = String(
    parsed.colorRaw || parsed.colorName || parsed.skuColor || parsed.specColor || ''
  ).trim();
  if(!raw && parsed.color) raw = String(parsed.color).trim();
  raw = raw.replace(/【[^】]*】/g, '');
  raw = raw.replace(/[:：]\s*[XSML]{1,3}\b.*$/i, '');
  raw = raw.replace(/[;；].*$/, '');
  raw = raw.replace(/\d+\s*\[[^\]]*\]/g, '');
  raw = raw.replace(/\b[XSML]{1,3}\b/gi, '');
  raw = raw.replace(/(连帽衫|裤子|外套|上衣|T恤|裙|鞋)$/g, '');
  raw = raw.replace(/\.\s*$/, '').trim();

  var segments = raw ? raw.split(/[/／|｜,，、]/).map(function(x){ return x.trim(); }).filter(Boolean) : [];
  var bases = [];
  segments.forEach(function(seg){
    var b = mapColorToBase(seg);
    if(b && bases.indexOf(b)<0) bases.push(b);
  });
  var baseFromModel = mapColorToBase(String(parsed.color || '').trim());
  if(baseFromModel && bases.indexOf(baseFromModel)<0) bases.push(baseFromModel);

  var base = '';
  if(bases.length >= 2) base = '花色';
  else if(bases.length === 1) base = bases[0];
  else if(/条纹|格纹|印花|撞色|拼色/.test(String(title || '') + raw)) base = '花色';

  return { color: base || '', colorRaw: raw || '' };
}
function parsePriceNumber(v){
  if(v == null || v === '') return '';
  var n = Number(String(v).replace(/[^\d.]/g, ''));
  if(!n) return '';
  return Math.round(n * 100) / 100;
}
function defaultOrderThumbBox(itemIndex){
  var i = Number(itemIndex) || 0;
  if(i < 0) i = 0;
  var y = 0.12 + i * 0.26;
  if(y > 0.62) y = 0.62;
  return { x: 0.04, y: y, w: 0.24, h: 0.20 };
}
/** 订单截图：始终本地左侧缩略图（忽略模型 cropSuggestion） */
function resolveOrderThumbBox(_aiBox, itemIndex){
  return defaultOrderThumbBox(itemIndex);
}
function mapParsedItemToCloth(parsed, shared){
  shared = shared || {};
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

  var aiSeason = String(parsed.season || shared.season || '').trim();
  var seasons = inferSeasonFromBuyDateAndTitle(buyDate, titleForRules, aiSeason);
  var scenes = mapScenesFromAI(Object.assign({}, shared, parsed), titleForRules);
  var fabric = mapFabricsFromKeywords(
    parsed.fabric || shared.fabric,
    parsed.fabricList || shared.fabricList,
    parsed.tags || shared.tags || parsed.fabricKeywords,
    titleForRules
  );
  var itemIndex = parsed.index != null ? parsed.index : (shared.itemIndex != null ? shared.itemIndex : 0);
  var thumbBox = resolveOrderThumbBox(null, itemIndex);
  var colorInfo = normalizeColorFromAI(Object.assign({}, shared, parsed), titleForRules);
  var price = parsePriceNumber(parsed.price != null && parsed.price !== '' ? parsed.price : shared.price);

  return {
    name: nameShow || nameRaw,
    nameRaw: nameRaw || nameShow,
    category: category,
    seasons: seasons,
    scenes: scenes,
    color: colorInfo.color,
    colorRaw: colorInfo.colorRaw,
    fabric: fabric,
    buyDate: buyDate,
    price: price,
    photo: '',
    status: 'active',
    confidence: String(parsed.confidence || shared.confidence || '').trim(),
    isOrderScreenshot: true,
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).slice(0, 8) : (Array.isArray(shared.tags) ? shared.tags.slice(0, 8) : []),
    thumbBox: thumbBox,
    itemIndex: itemIndex,
    skuLabel: String(parsed.skuLabel || '').trim(),
    pickLabel: String(parsed.pickLabel || '').trim()
  };
}
function refineOrderLineItem(it, idx){
  var sku = String(it.skuLabel || '').trim();
  var cr = String(it.colorRaw || '').trim();
  var nm = String(it.name || '').trim();
  var cat = String(it.category || '').trim();
  var blobSku = sku + ' ' + cr;
  var blobAll = blobSku + ' ' + nm + ' ' + cat;
  var isPants = /裤子|瑜伽裤|阔腿裤|牛仔裤/.test(blobSku) || ((/裤装|瑜伽裤|裤子/.test(cat + ' ' + nm)) && !/连帽衫|卫衣/.test(blobSku));
  var isTop = /连帽衫|卫衣/.test(blobSku) || (/上衣|外套/.test(cat) && /连帽|卫衣/.test(nm) && !/裤子/.test(blobSku));
  if(/连帽衫/.test(blobSku)){ isTop = true; isPants = false; }
  if(/裤子|瑜伽裤/.test(blobSku)){ isPants = true; isTop = false; }

  if(isPants){
    it.category = '裤装';
    it.pickLabel = '裤子';
    var pantsName = nm.replace(/高个子/g, '').replace(/春秋款.*$/g, '').replace(/收腰.*$/g, '');
    pantsName = simplifyOrderTitle(pantsName);
    if(!pantsName || /套装|外套|卫衣|连帽/.test(pantsName) || pantsName.length > 16){
      pantsName = /德绒/.test(nm + cr) ? '美式修身德绒瑜伽裤' : '美式修身瑜伽裤';
    }
    if(!/裤/.test(pantsName)) pantsName = pantsName + '裤';
    it.name = simplifyOrderTitle(pantsName);
  } else if(isTop){
    it.category = '上衣';
    it.pickLabel = '连帽衫';
    var topName = simplifyOrderTitle(nm);
    if(!topName || /套装|瑜伽裤|裤子/.test(nm)){
      topName = /德绒/.test(nm + cr) ? '美式修身德绒连帽衫' : '美式修身连帽衫';
    }
    it.name = simplifyOrderTitle(topName);
  } else {
    it.pickLabel = cat || ('商品'+(idx+1));
    it.name = simplifyOrderTitle(nm) || nm;
  }
  if(!it.fabric && /德绒/.test(blobAll)) it.fabric = '德绒';
  it.index = idx;
  return it;
}
function refineHoodiePantsSetRoles(items){
  if(!items || items.length !== 2) return items;
  var blob = items.map(function(it){
    return [it.name, it.nameRaw, it.skuLabel, it.category, it.colorRaw].join(' ');
  }).join(' | ');
  var hasPants = /裤子|瑜伽裤|阔腿裤|裤装/.test(blob);
  var hasTop = /连帽|卫衣|外套|上衣|套装/.test(blob);
  if(!(hasPants && hasTop)) return items;
  if(!/德绒|瑜伽|运动套装|套装|修身/.test(blob)) return items;

  var derong = /德绒/.test(blob);
  items.forEach(function(it, idx){
    if(idx === 0){
      it.category = '上衣';
      it.pickLabel = '连帽衫';
      it.name = derong ? '美式修身德绒连帽衫' : '美式修身连帽衫';
      it.nameRaw = it.nameRaw || it.name;
    } else {
      it.category = '裤装';
      it.pickLabel = '裤子';
      it.name = derong ? '美式修身德绒瑜伽裤' : '美式修身瑜伽裤';
      it.nameRaw = it.nameRaw || it.name;
    }
    if(!it.fabric && derong) it.fabric = '德绒';
    it.index = idx;
  });
  return items;
}
function normalizeAIItems(parsed){
  var items = [];
  if(Array.isArray(parsed.items)){
    parsed.items.forEach(function(it, idx){
      if(!it || typeof it !== 'object') return;
      var name = String(it.name || it.skuLabel || '').trim();
      var price = parsePriceNumber(it.price);
      if(!name && !price) return;
      var row = {
        index: idx,
        skuLabel: String(it.skuLabel || '').trim(),
        name: name,
        nameRaw: String(it.nameRaw || it.name || '').trim(),
        category: String(it.category || '').trim(),
        price: price,
        colorRaw: String(it.colorRaw || it.color || '').trim(),
        color: String(it.color || '').trim(),
        fabric: String(it.fabric || '').trim(),
        fabricList: Array.isArray(it.fabricList) ? it.fabricList : [],
        cropSuggestion: null,
        season: String(it.season || parsed.season || '').trim(),
        scenes: Array.isArray(it.scenes) ? it.scenes : parsed.scenes,
        tags: Array.isArray(it.tags) ? it.tags : parsed.tags,
        pickLabel: ''
      };
      items.push(refineOrderLineItem(row, idx));
    });
  }
  var count = Number(parsed.itemCount);
  if(!(count >= 1)) count = items.length || (parsed.name || parsed.price ? 1 : 0);
  if(items.length === 0 && (parsed.name || parsed.price || parsed.cropSuggestion)){
    items.push(refineOrderLineItem({
      index: 0,
      skuLabel: '',
      name: String(parsed.name || '').trim(),
      nameRaw: String(parsed.nameRaw || parsed.name || '').trim(),
      category: String(parsed.category || '').trim(),
      price: parsePriceNumber(parsed.price),
      colorRaw: String(parsed.colorRaw || '').trim(),
      color: String(parsed.color || '').trim(),
      fabric: String(parsed.fabric || '').trim(),
      fabricList: Array.isArray(parsed.fabricList) ? parsed.fabricList : [],
      cropSuggestion: null,
      season: String(parsed.season || '').trim(),
      scenes: parsed.scenes,
      tags: parsed.tags,
      pickLabel: ''
    }, 0));
    count = Math.max(count, 1);
  }
  if(items.length >= 2) count = Math.max(count, items.length);
  if(items.length >= 2) refineHoodiePantsSetRoles(items);
  return { itemCount: count, items: items };
}
function parseAIResponse(text){
  var cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  var first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if(first>=0 && last>first) cleaned = cleaned.slice(first, last+1);
  var parsed = JSON.parse(cleaned);
  var norm = normalizeAIItems(parsed);
  var shared = {
    purchaseDate: parsed.purchaseDate || parsed.buyTime || '',
    buyTime: parsed.buyTime,
    buyMonth: parsed.buyMonth,
    buyDay: parsed.buyDay,
    season: parsed.season,
    scenes: parsed.scenes,
    tags: parsed.tags,
    confidence: parsed.confidence,
    nameRaw: parsed.nameRaw,
    fabricList: parsed.fabricList,
    fabric: parsed.fabric
  };

  var needsItemPick = norm.itemCount >= 2 && norm.items.length >= 2;
  var source = parsed;
  var rootEmpty = !String(parsed.name || '').trim() && (parsed.price == null || parsed.price === '');
  if(!needsItemPick && rootEmpty && norm.items.length >= 1){
    source = Object.assign({}, parsed, norm.items[0], {
      nameRaw: parsed.nameRaw || norm.items[0].nameRaw || norm.items[0].name,
      purchaseDate: parsed.purchaseDate || parsed.buyTime || '',
      season: norm.items[0].season || parsed.season,
      fabricList: (norm.items[0].fabricList && norm.items[0].fabricList.length) ? norm.items[0].fabricList : parsed.fabricList,
      fabric: norm.items[0].fabric || parsed.fabric,
      index: 0
    });
  }

  var result = mapParsedItemToCloth(source, shared);
  result.thumbBox = resolveOrderThumbBox(null, result.itemIndex || 0);
  result.itemCount = norm.itemCount;
  result.items = norm.items;
  result.needsItemPick = needsItemPick;
  result.orderPurchaseDate = normalizeBuyDateFromAI(shared);
  result.rawModelJson = parsed;
  if(!result.buyDate && result.orderPurchaseDate) result.buyDate = result.orderPurchaseDate;
  if(result.needsItemPick){
    result.name = '';
    result.price = '';
    result.category = '';
    result.color = '';
    result.colorRaw = '';
    result.fabric = '';
    result.buyDate = result.orderPurchaseDate || '';
    result.thumbBox = null;
    result.photo = '';
  }
  return result;
}

async function callVisionAPI(imageDataUrl, prompt){
  const body = {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ]
    }]
  };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error('HTTP '+res.status+' '+(data.error?.message || JSON.stringify(data).slice(0,200)));
  }
  let text = data?.choices?.[0]?.message?.content;
  if (Array.isArray(text)) text = text.map(p => p.text || '').join('');
  if (!text) throw new Error('返回内容为空');
  return String(text);
}

function fileToDataUrl(filePath){
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString('base64');
  const isPng = buf[0]===0x89 && buf[1]===0x50;
  const mime = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

/** 与 App cropOrderProductThumbBlob 同规则：本地左侧框 + 方形输出 */
function crop(file, box, out, itemIndex){
  const resolved = resolveOrderThumbBox(box, itemIndex);
  const meta = execSync(`sips -g pixelWidth -g pixelHeight "${file}"`).toString();
  const W = Number(meta.match(/pixelWidth:\s*(\d+)/)[1]);
  const H = Number(meta.match(/pixelHeight:\s*(\d+)/)[1]);
  const sx = Math.max(0, Math.round(resolved.x * W));
  const sy = Math.max(0, Math.round(resolved.y * H));
  const sw = Math.max(48, Math.round(Math.min(resolved.w * W, W - sx)));
  const sh = Math.max(48, Math.round(Math.min(resolved.h * H, H - sy)));
  const side = Math.max(sw, sh);
  // sips 不能直接 pad 成方形；先裁再 pad 到 side（与 canvas 行为一致）
  const tmp = out + '.tmp.jpg';
  execSync(`sips --cropToHeightWidth ${sh} ${sw} --cropOffset ${sy} ${sx} "${file}" --out "${tmp}" >/dev/null`);
  execSync(`sips -z ${side} ${side} "${tmp}" --out "${out}" >/dev/null`);
  try { fs.unlinkSync(tmp); } catch {}
  return { ok:true, W, H, sx, sy, sw, sh, side, box: resolved, out };
}

function pickPantsItem(items){
  return items.find(it => it.pickLabel === '裤子')
    || items.find(it => it.category === '裤装' && it.pickLabel !== '连帽衫')
    || items.find(it => /裤/.test(String(it.skuLabel||'') + String(it.name||'') + String(it.colorRaw||'')) && !/连帽|卫衣/.test(String(it.pickLabel||'')+String(it.name||'')))
    || items[1]
    || items[0];
}

const cases = [
  { id:1, label:'上衣', file:'1-top.jpg', round2:{ name:'法式复古蕾丝印花短袖T恤', category:'上衣', price:65.9, buyDate:'2026-05-21', colorRaw:'白色', color:'白', fabric:'' } },
  { id:2, label:'裙子', file:'2-dress.jpg', round2:{ name:'法式V领无袖亚麻连衣裙', category:'连衣裙', price:97, buyDate:'2026-04-23', colorRaw:'白色', color:'白', fabric:'麻' } },
  { id:3, label:'裤子(多件)', file:'3-pants.jpg', round2:{ needsPick:true, pickPrice:89, category:'裤装', fabric:'德绒', color:'黑' } },
  { id:4, label:'鞋子', file:'4-shoes.jpg', round2:{ name:'MEGASTRIDE厚底休闲老爹鞋', category:'鞋', price:310.22, buyDate:'2026-05-15', colorRaw:'灰色/金属银', color:'灰' } },
  { id:5, label:'外套', file:'5-outer.jpg', round2:{ name:'冰丝针织短款开衫外套', category:'外套', price:55.94, buyDate:'2026-03-26', colorRaw:'黑色', color:'黑', fabric:'冰丝+针织' } }
];

const prompt = loadAIPromptFromApp();
console.log('AI_PROMPT loaded, chars=', prompt.length);
console.log('API key present, len=', apiKey.length, '(value not printed)');
console.log('Model=', MODEL);
console.log('Year force=', new Date().getFullYear());

const report = { ranAt: new Date().toISOString(), model: MODEL, round: 4, results: [] };

for (const c of cases) {
  const imgPath = path.join(outDir, c.file);
  console.log('\n======== 【图片'+c.id+'】'+c.label+' ========');
  if (!fs.existsSync(imgPath)) {
    console.log('MISSING', imgPath);
    report.results.push({ id:c.id, error:'missing file' });
    continue;
  }
  const dataUrl = fileToDataUrl(imgPath);
  let rawText = '';
  let parsed = null;
  let err = null;
  try {
    rawText = await callVisionAPI(dataUrl, prompt);
    console.log('--- RAW MODEL ---');
    console.log(rawText);
    parsed = parseAIResponse(rawText);
  } catch (e) {
    err = String(e.message || e);
    console.log('API/PARSE ERROR:', err);
  }

  const entry = {
    id: c.id,
    label: c.label,
    error: err,
    rawText,
    mapped: parsed ? {
      needsItemPick: parsed.needsItemPick,
      itemCount: parsed.itemCount,
      items: parsed.items,
      name: parsed.name,
      category: parsed.category,
      colorRaw: parsed.colorRaw,
      color: parsed.color,
      price: parsed.price,
      buyDate: parsed.buyDate,
      orderPurchaseDate: parsed.orderPurchaseDate,
      seasons: parsed.seasons,
      fabric: parsed.fabric,
      thumbBox: parsed.thumbBox,
      itemIndex: parsed.itemIndex
    } : null,
    round2: c.round2,
    crop: null,
    afterPick: null
  };

  if (parsed && parsed.needsItemPick) {
    console.log('多件: 需用户选择, items=', parsed.items.length);
    parsed.items.forEach((it,i) => console.log('  #'+(i+1), it.pickLabel, it.skuLabel||it.name, it.price, it.category));
    const chosen = pickPantsItem(parsed.items);
    const idx = chosen.index != null ? chosen.index : parsed.items.indexOf(chosen);
    const orderDate = parsed.orderPurchaseDate || parsed.buyDate || '';
    const cloth = mapParsedItemToCloth(Object.assign({}, chosen, {
      index: idx,
      name: chosen.name,
      nameRaw: chosen.nameRaw || chosen.name,
      category: chosen.category,
      price: chosen.price,
      colorRaw: chosen.colorRaw,
      fabric: chosen.fabric,
      fabricList: chosen.fabricList
    }), {
      purchaseDate: orderDate,
      buyTime: orderDate,
      season: chosen.season || (parsed.seasons && parsed.seasons[0]) || '',
      scenes: chosen.scenes || parsed.scenes,
      tags: chosen.tags || parsed.tags,
      nameRaw: chosen.nameRaw || chosen.name,
      itemIndex: idx,
      fabricList: chosen.fabricList,
      fabric: chosen.fabric
    });
    cloth.price = chosen.price;
    if(chosen.category) cloth.category = chosen.category;
    if(chosen.name) cloth.name = chosen.name;
    cloth.itemIndex = idx;
    cloth.thumbBox = resolveOrderThumbBox(null, idx);
    if(!cloth.buyDate) cloth.buyDate = orderDate;
    entry.afterPick = {
      name: cloth.name,
      category: cloth.category,
      price: cloth.price,
      colorRaw: cloth.colorRaw,
      color: cloth.color,
      fabric: cloth.fabric,
      buyDate: cloth.buyDate,
      seasons: cloth.seasons,
      itemIndex: cloth.itemIndex,
      pickLabel: chosen.pickLabel,
      thumbBox: cloth.thumbBox
    };
    const thumb = path.join(outDir, 'glm-thumb-'+c.id+'.jpg');
    try { entry.crop = crop(imgPath, null, thumb, idx); } catch (e) { entry.crop = { ok:false, reason:String(e) }; }
    console.log('选件后:', cloth.name, cloth.category, cloth.price, cloth.colorRaw, cloth.fabric, cloth.buyDate, cloth.seasons, 'idx='+idx);
    console.log('crop:', entry.crop);
  } else if (parsed) {
    const thumb = path.join(outDir, 'glm-thumb-'+c.id+'.jpg');
    try { entry.crop = crop(imgPath, null, thumb, parsed.itemIndex || 0); } catch (e) { entry.crop = { ok:false, reason:String(e) }; }
    console.log('mapped:', parsed.name, '|', parsed.category, '|', parsed.colorRaw, '→', parsed.color, '|', parsed.price, '|', parsed.buyDate, '|', parsed.fabric, '|', (parsed.seasons||[]).join(','));
    console.log('crop:', entry.crop);
  }

  report.results.push(entry);
  await new Promise(r => setTimeout(r, 800));
}

fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, 'glm-real-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('\n报告已写:', reportPath);
console.log('未写入任何 API Key。');
