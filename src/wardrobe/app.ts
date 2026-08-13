// @ts-nocheck
/**
 * 衣橱页面逻辑：UI / 筛选保持不变
 * 衣物权威数据源 = dataStore（云端），禁止业务 localStorage / 手写衣物 fetch
 */
import {
  addCloth,
  fetchClothes,
  getClothes,
  getResourceDocument,
  getUserProfile,
  initDataStore,
  loadUserProfileFromApi as loadUserProfileFromApiCloud,
  removeCloth,
  saveCheckins,
  saveCustomScenes,
  saveFilterSetting,
  saveFilterSettingDebounced,
  saveLogs,
  saveOutfit,
  saveUserProfileToApi as saveUserProfileToApiCloud,
  stripSensitiveFields,
  subscribe,
  updateCloth,
  uploadClothImage,
} from '@/stores/dataStore';
import { api } from '@/utils/request';
import { callVisionAPI as callVisionAPIExternal, fetchRealWeather as fetchRealWeatherExternal } from '@/wardrobe/external';
import { checkForAppUpdate } from '@/wardrobe/pwa';

/* ============================================================
   个人智能穿搭衣橱 — 单文件 PWA
   衣物数据远端 API；画像/打卡等会话态内存保存
   ============================================================ */
/* ---------- 常量 ---------- */
var SCENE_TAGS = ['通勤','约会','居家','运动','度假','正式','休闲'];
var SEASONS = ['春','夏','秋','冬'];
var CATEGORIES = ['上衣','外套','裤装','裙装','连衣裙','鞋','包','配饰','内衣','其他'];
var COLORS = ['黑','白','灰','米','卡其','棕','藏蓝','军绿','酒红','粉','黄','绿','蓝','紫','花色','其他'];
var FABRICS = ['棉','麻','丝','羊毛','羊绒','牛仔','化纤','皮革','针织','混纺','其他'];
var STYLE_TAGS = ['简约','商务','休闲','运动','街头','复古','优雅','日系','韩系','法式','极简','学院','辣妹','中性','森系','工装'];
var MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];

var AI_PROMPT = '解析淘宝/闲鱼交易成功订单截图。\n【强制硬性规则】\n1. 只解析**订单成交商品模块**，该模块同时包含商品标题+实付价格；页面底部猜你喜欢、广告商品全部忽略，绝对不要解析广告。\n2. 优先读取【实付价】，不要取划线原价。\n3. 截图中不存在的信息，字段返回空字符串，禁止编造内容，不要脑补面料、材质。\n4. 如果截图只显示月日，无法确定准确年份，buyTime返回空字符串，禁止自动补年份。\n5. 严格输出JSON，禁止```json、```、注释、多余中文，只输出JSON对象。\n\n输出字段：\n{\n  "name":"商品完整标题",\n  "buyTime":"YYYY-MM-DD / 空字符串",\n  "price":"实付数字 / 空字符串",\n  "category":"只能【上衣,裤子,裙子,外套,配饰】五选一，识别不到返回空",\n  "color":"颜色/花纹，识别不到返回空",\n  "sceneTag":"【通勤,约会,居家,运动,度假,正式,休闲】选一项，识别不到返回空"\n}';

/* ---------- 存储结构 ---------- */
var DEFAULT_STORE = {
  version: 1,
  // aiConfig 含 apiKey：仅会话内存，禁止同步到 D1
  aiConfig: { cloudEnabled: false, apiKey: '', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', modelName: 'glm-4v-flash' },
  profile: { avatar:'', name:'', age:'', mbti:'', city:'北京', prefStyles:[], tempPrefs:[], tempPref:'', concerns:'', idealStyles:[], idealText:'', analysisStartDate:'', cloudSyncEnabled:false },
  customScenes: [],
  weather: { city:'北京', today:{temp:null,cond:'加载中…',desc:''}, tomorrow:{temp:null,cond:'加载中…',desc:''}, manual:false, error:false, loading:true },
  clothes: [],
  logs: [],
  checkins: [],
  outfit: [],
  fortuneCache: {}
};

/* ---------- 工具 ---------- */
function uid(){ return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
/** 分析页筛选：同步至 filter_setting；默认值仅作空库回填 */
var analysisFilter = {
  buyStart:'2000-01-01',
  buyEnd: todayStr(),
  includeRetired:false,
  seasons:[],
  scenes:[],
  categories:[]
};
function tomorrowStr(){ var d=new Date(); d.setDate(d.getDate()+1); return dateStr(d); }
function dateStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtMoney(n){ if(n==null||n==='') return '—'; n=Number(n); if(!n) return '—'; return '¥'+n.toLocaleString('zh-CN',{maximumFractionDigits:0}); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
function daysSince(d){ if(!d) return null; return daysBetween(d, todayStr()); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function $(s,el){ return (el||document).querySelector(s); }
function $all(s,el){ return Array.prototype.slice.call((el||document).querySelectorAll(s)); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- Loading / dataStore 衣物桥接 ---------- */
function showLoading(msg){
  var el = $('#global-loading');
  var t = $('#global-loading-text');
  if(t) t.textContent = msg || '加载中…';
  if(el) el.classList.remove('hidden');
}
function hideLoading(){
  var el = $('#global-loading');
  if(el) el.classList.add('hidden');
}

/* UI 衣物 ↔ dataStore ClothItem（权威字段在 notes JSON；tags 仅辅助索引） */
function clothToApiItem(cloth){
  var tags = [];
  function pushTag(t){ if(t!=null && t!=='' && tags.indexOf(t)<0) tags.push(String(t)); }
  pushTag(cloth.category);
  (cloth.seasons || []).forEach(pushTag);
  (cloth.scenes || []).forEach(pushTag);
  pushTag(cloth.color);
  pushTag(cloth.fabric);
  pushTag(cloth.status || 'active');
  var meta = {
    category: cloth.category || '',
    seasons: Array.isArray(cloth.seasons) ? cloth.seasons.slice() : [],
    scenes: Array.isArray(cloth.scenes) ? cloth.scenes.slice() : [],
    color: cloth.color || '',
    fabric: cloth.fabric || '',
    buyDate: cloth.buyDate || '',
    price: cloth.price,
    status: cloth.status || 'active',
    createdAt: cloth.createdAt || null,
    retiredAt: cloth.retiredAt || null
  };
  return {
    id: cloth.id,
    name: cloth.name || '',
    tags: tags,
    photo_url: cloth.photo || '',
    notes: JSON.stringify(meta)
  };
}
/** @deprecated 使用 clothToApiItem */
function clothToStoreItem(cloth){ return clothToApiItem(cloth); }

function apiItemToCloth(item){
  item = item || {};
  var meta = {};
  var notesRaw = item.notes;
  var notesParsed = false;
  if(typeof notesRaw === 'string'){
    var trimmed = notesRaw.trim();
    if(trimmed.charAt(0) === '{'){
      try{
        meta = JSON.parse(trimmed);
        notesParsed = !!(meta && typeof meta === 'object');
      }catch(e){
        console.error('[衣物] notes JSON 解析失败', item.id, e, String(notesRaw).slice(0, 120));
        meta = {};
      }
    } else if(trimmed){
      console.error('[衣物] notes 非 JSON 对象字符串', item.id, trimmed.slice(0, 120));
    }
  } else if(notesRaw && typeof notesRaw === 'object'){
    meta = notesRaw;
    notesParsed = true;
  }

  // D1 常把 tags 存成 JSON 字符串："[\"上衣\",\"夏\"]"
  var tags = [];
  if(Array.isArray(item.tags)){
    tags = item.tags.filter(function(t){ return typeof t === 'string'; });
  } else if(typeof item.tags === 'string' && item.tags.trim()){
    try{
      var parsedTags = JSON.parse(item.tags);
      if(Array.isArray(parsedTags)) tags = parsedTags.filter(function(t){ return typeof t === 'string'; });
      else if(typeof parsedTags === 'string') tags = [parsedTags];
    }catch(e){
      console.error('[衣物] tags JSON 解析失败', item.id, e, String(item.tags).slice(0, 120));
      tags = item.tags ? [item.tags] : [];
    }
  }

  function pickFrom(list){
    for(var i=0;i<tags.length;i++){ if(list.indexOf(tags[i])>=0) return tags[i]; }
    return '';
  }
  function filterFrom(list){
    return tags.filter(function(t){ return list.indexOf(t)>=0; });
  }
  var custom = (store && store.customScenes) ? store.customScenes : [];
  var category = (meta.category != null && meta.category !== '') ? String(meta.category) : pickFrom(CATEGORIES);
  if(!notesParsed && !category){
    console.error('[衣物] 映射失败：notes 无效且 tags 无品类', item.id, item.name);
  }
  return {
    id: item.id,
    name: item.name || '',
    category: category || '',
    seasons: Array.isArray(meta.seasons) ? meta.seasons : filterFrom(SEASONS),
    scenes: Array.isArray(meta.scenes) ? meta.scenes : filterFrom(SCENE_TAGS.concat(custom)),
    color: (meta.color != null && meta.color !== '') ? String(meta.color) : (pickFrom(COLORS) || ''),
    fabric: (meta.fabric != null && meta.fabric !== '') ? String(meta.fabric) : (pickFrom(FABRICS) || ''),
    buyDate: meta.buyDate || '',
    price: (meta.price != null && meta.price !== '') ? meta.price : '',
    photo: item.photo_url || item.photo || '',
    status: meta.status || (tags.indexOf('retired')>=0 ? 'retired' : 'active'),
    createdAt: meta.createdAt || null,
    retiredAt: meta.retiredAt || null
  };
}
/** @deprecated 使用 apiItemToCloth */
function storeItemToCloth(item){ return apiItemToCloth(item); }

/** 用 dataStore 权威列表刷新页面内存衣物（不写 localStorage） */
function syncClothesFromDataStore(){
  store.clothes = getClothes().map(apiItemToCloth);
}

/** 云端用户资料 → 页面会话 profile：以 DEFAULT 为底，保留后端尚未存的新字段 */
function applyCloudProfileToStore(remote){
  if(!store) return;
  var base = clone(DEFAULT_STORE.profile);
  var src = remote && typeof remote === 'object' ? remote : {};
  store.profile = Object.assign(base, src);
  // 兼容 nickname / avatar_url 字段名
  if(!store.profile.name && src.nickname) store.profile.name = String(src.nickname);
  if(!store.profile.avatar && src.avatar_url) store.profile.avatar = String(src.avatar_url);
}

function syncProfileFromDataStore(){
  applyCloudProfileToStore(getUserProfile());
}

/** 将 dataStore 中的 document 资源映射回页面 store（不覆盖未加载成功的远端） */
function applyCloudDocumentsToStore(){
  if(!store) return;
  var checkins = getResourceDocument('checkins');
  if(Array.isArray(checkins)) store.checkins = checkins;
  var logs = getResourceDocument('logs');
  if(Array.isArray(logs)) store.logs = logs;
  var scenes = getResourceDocument('custom_scenes');
  if(Array.isArray(scenes)) store.customScenes = scenes.map(String);
  var outfit = getResourceDocument('outfit');
  if(Array.isArray(outfit)) store.outfit = outfit;
  var filter = getResourceDocument('filter_setting');
  if(filter && typeof filter === 'object'){
    if(typeof filter.buyStart === 'string' && filter.buyStart) analysisFilter.buyStart = filter.buyStart;
    if(typeof filter.buyEnd === 'string' && filter.buyEnd) analysisFilter.buyEnd = filter.buyEnd;
    if(typeof filter.includeRetired === 'boolean') analysisFilter.includeRetired = filter.includeRetired;
    if(Array.isArray(filter.seasons)) analysisFilter.seasons = filter.seasons.slice();
    if(Array.isArray(filter.scenes)) analysisFilter.scenes = filter.scenes.slice();
    if(Array.isArray(filter.categories)) analysisFilter.categories = filter.categories.slice();
  }
}

function analysisFilterPayload(){
  return {
    buyStart: analysisFilter.buyStart,
    buyEnd: analysisFilter.buyEnd,
    includeRetired: !!analysisFilter.includeRetired,
    seasons: (analysisFilter.seasons || []).slice(),
    scenes: (analysisFilter.scenes || []).slice(),
    categories: (analysisFilter.categories || []).slice()
  };
}

function rejectStoreResult(res, fallback){
  if(res && res.ok) return res.data;
  throw new Error((res && res.error) || fallback || '保存失败');
}

/** GET /user_profile → 合并进 store.profile */
function loadUserProfileFromApi(){
  return loadUserProfileFromApiCloud().then(function(res){
    if(!res.ok) throw new Error(res.error || '用户资料加载失败');
    applyCloudProfileToStore(res.data || {});
    return store.profile;
  });
}

/** PUT /user_profile，提交完整 store.profile（剔除敏感字段） */
function saveUserProfileToApi(){
  var payload = stripSensitiveFields(clone(store.profile));
  return saveUserProfileToApiCloud(payload).then(function(res){
    if(!res.ok) throw new Error(res.error || '用户资料保存失败');
    if(res.data) applyCloudProfileToStore(res.data);
    return store.profile;
  });
}

function persistCheckins(){
  return saveCheckins(store.checkins).then(function(res){ return rejectStoreResult(res, '打卡保存失败'); });
}
function persistLogs(){
  return saveLogs(store.logs).then(function(res){ return rejectStoreResult(res, '穿着记录保存失败'); });
}
function persistCustomScenes(){
  return saveCustomScenes(store.customScenes).then(function(res){ return rejectStoreResult(res, '自定义场景保存失败'); });
}
function persistOutfit(){
  return saveOutfit(store.outfit || []).then(function(res){ return rejectStoreResult(res, '穿搭数据保存失败'); });
}
function persistFilterSetting(immediate){
  var payload = analysisFilterPayload();
  var p = immediate ? saveFilterSetting(payload) : saveFilterSettingDebounced(payload, 600);
  return p.then(function(res){ return rejectStoreResult(res, '筛选设置保存失败'); });
}
function persistCheckinsAndLogs(){
  return Promise.all([persistCheckins(), persistLogs()]);
}

function bindDataStoreView(){
  subscribe(function(){
    if(!store) return;
    syncClothesFromDataStore();
    // 资料以页面 store.profile 为准；仅在主动 load 后合并，避免订阅冲掉未保存编辑
    if(typeof render === 'function') render();
  });
}

/* ---------- 图片展示工具 ---------- */
function normalizePublicUrl(url){
  if(url == null || url === '') return '';
  return String(url).trim();
}
function photoAttrSrc(url){
  return normalizePublicUrl(url)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
function photoImgHtml(url, className, extraAttrs){
  var src = normalizePublicUrl(url);
  if(!src) return '';
  var cls = className ? ' class="'+className+'"' : '';
  var extra = extraAttrs ? ' '+extraAttrs : '';
  return '<img src="'+photoAttrSrc(src)+'"'+cls+' alt="穿搭照片" data-remote-photo="1"'+extra+' style="max-width:100%;" onerror="console.log(\'图片加载失败的地址：\', this.src);window.__onPhotoError&&window.__onPhotoError(this)" />';
}
window.__onPhotoError = function(img){
  if(!img || img.getAttribute('data-photo-failed') === '1') return;
  img.setAttribute('data-photo-failed', '1');
  var link = img.currentSrc || img.src || img.getAttribute('src') || '';
  console.warn('[衣橱] 图片加载失败:', link);
  img.classList.add('photo-load-failed');
  img.alt = '图片加载失败';
  var tip = document.createElement('div');
  tip.className = 'photo-fallback-tip';
  tip.textContent = '图片加载失败';
  if(img.parentNode){
    if(img.parentNode.className && String(img.parentNode.className).indexOf('img-wrap-') === 0){
      img.style.display = 'none';
      img.parentNode.appendChild(tip);
    } else {
      img.insertAdjacentElement('afterend', tip);
    }
  }
};
function bindPhotoFallbacks(root){
  $all('img[data-remote-photo], img.form-cloth-photo, img.detail-cloth-photo', root || document).forEach(function(img){
    if(img._photoErrBound) return;
    img._photoErrBound = true;
    img.addEventListener('error', function(){ window.__onPhotoError(img); });
  });
}
function uploadImage(file){
  return uploadClothImage(file).then(function(res){
    if(!res.ok || !res.data) throw new Error(res.error || '图片上传失败');
    console.log('最终得到publicUrl =', res.data);
    return res.data;
  });
}
function setFormPhotoPreview(url){
  url = normalizePublicUrl(url);
  var el = $('#f-photo');
  if(!el) return;
  if(el.tagName === 'IMG'){
    el.removeAttribute('data-photo-failed');
    el.classList.remove('photo-load-failed');
    el.src = url;
    el.setAttribute('data-remote-photo', '1');
    el._photoErrBound = false;
    bindPhotoFallbacks(el.parentNode || document);
  } else {
    el.outerHTML = photoImgHtml(url, 'form-cloth-photo', 'id="f-photo"');
    bindPhotoFallbacks($('#cloth-form-wrap') || document);
  }
}
/** 上传成功后写入预览；已有衣物则经 dataStore 更新云端 */
function commitClothPhoto(clothId, publicUrl){
  publicUrl = normalizePublicUrl(publicUrl);
  if(!publicUrl) return Promise.resolve(publicUrl);
  window._formPhoto = publicUrl;
  setFormPhotoPreview(publicUrl);
  if(!clothId){
    if(typeof render === 'function') render();
    return Promise.resolve(publicUrl);
  }
  var cloth = findCloth(clothId);
  if(!cloth){
    if(typeof render === 'function') render();
    return Promise.resolve(publicUrl);
  }
  cloth.photo = publicUrl;
  return persistCloth(cloth, false).then(function(){
    return publicUrl;
  });
}
function commitCheckinPhoto(publicUrl){
  publicUrl = normalizePublicUrl(publicUrl);
  checkinPhoto = publicUrl;
  checkinTempPhoto = publicUrl;
  var todayCk = findCheckin(todayStr());
  if(todayCk){
    todayCk.photo = publicUrl;
    if(typeof render === 'function') render();
  }
  var area = $('#ck-photo-area');
  if(area){
    var img = area.querySelector('img');
    if(img){
      img.removeAttribute('data-photo-failed');
      img.classList.remove('photo-load-failed');
      img.src = publicUrl;
      img.setAttribute('data-remote-photo', '1');
      img._photoErrBound = false;
      bindPhotoFallbacks(area);
    }
  }
  $all('#sheet img.form-cloth-photo').forEach(function(img){
    if(img.id === 'f-photo') return;
    img.removeAttribute('data-photo-failed');
    img.classList.remove('photo-load-failed');
    img.src = publicUrl;
    img.setAttribute('data-remote-photo', '1');
    img._photoErrBound = false;
  });
  bindPhotoFallbacks($('#sheet') || document);
  return publicUrl;
}

/* ---------- 云端 AI 视觉识别（V2：订单截图解析、AI属性预填；V1打卡流程不调用外部接口） ---------- */
function callVisionAPI(imageDataUrl, prompt, cfg){
  return callVisionAPIExternal(imageDataUrl, prompt, cfg);
}
function parseAIResponse(text){
  var cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  var first = cleaned.indexOf('{'), last = cleaned.lastIndexOf('}');
  if(first>=0 && last>first) cleaned = cleaned.slice(first, last+1);
  var parsed = JSON.parse(cleaned);
  // 只回填模型返回不为空的字段；空字符串保持空，绝不加载组件默认值
  var catMap = { '上衣':'上衣', '裤子':'裤装', '裙子':'裙装', '外套':'外套', '配饰':'配饰' };
  var result = { name:'', category:'', seasons:[], scenes:[], color:'', fabric:'', buyDate:'', price:'', photo:'', status:'active' };
  if(parsed.name && String(parsed.name).trim()) result.name = String(parsed.name).trim();
  if(parsed.category && catMap[parsed.category]) result.category = catMap[parsed.category];
  if(parsed.sceneTag && SCENE_TAGS.indexOf(parsed.sceneTag)>=0) result.scenes = [parsed.sceneTag];
  if(parsed.color){
    var colorRaw = String(parsed.color).split(/[,，]/)[0].trim();
    if(colorRaw && COLORS.indexOf(colorRaw)>=0) result.color = colorRaw;
  }
  if(parsed.buyTime){
    var d = String(parsed.buyTime).trim();
    if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) result.buyDate = d;
  }
  if(parsed.price){
    var n = Number(String(parsed.price).replace(/[^\d.]/g, ''));
    if(n) result.price = n;
  }
  return result;
}

/* ---------- 会话态 store（衣物权威数据在 dataStore / 云端） ---------- */
var store = null;
function initStore(){
  store = clone(DEFAULT_STORE);
}
function mergeDefaults(t, d){
  for(var k in d){ if(!(k in t)){ t[k] = clone(d[k]); } else if(typeof d[k]==='object' && !Array.isArray(d[k]) && d[k]!=null){ mergeDefaults(t[k], d[k]); } }
}
/** 已废弃：业务数据必须走 dataStore → 云端；禁止 localStorage 伪保存 */
function saveStore(){ /* no-op：勿再依赖 */ }

function persistCloth(cloth, isNew){
  var payload = clothToStoreItem(cloth);
  var req = isNew ? addCloth(payload) : updateCloth(payload);
  return req.then(function(res){
    if(!res.ok) throw new Error(res.error || (isNew ? '新增失败' : '更新失败'));
    syncClothesFromDataStore();
    return cloth;
  });
}
function deleteClothRemote(id){
  return removeCloth(id).then(function(res){
    if(!res.ok) throw new Error(res.error || '删除失败');
    removeClothById(id);
    syncClothesFromDataStore();
    return persistLogs();
  });
}
function loadClothesFromApi(){
  return fetchClothes().then(function(res){
    if(!res.ok) throw new Error(res.error || '加载衣物失败');
    syncClothesFromDataStore();
    return store.clothes;
  });
}

/* ---------- 数据安全：禁止整体覆盖数组，仅单条更新或追加 ---------- */
function upsertCloth(data){
  var idx = store.clothes.findIndex(function(x){ return x.id === data.id; });
  if(idx >= 0) store.clothes[idx] = data;
  else store.clothes.push(data);
}
function upsertCheckinByDate(checkin){
  var existing = findCheckin(checkin.date);
  if(existing){
    checkin.id = existing.id;
    var idx = store.checkins.findIndex(function(c){ return c.id === existing.id; });
    if(idx >= 0) store.checkins[idx] = checkin;
  } else {
    store.checkins.push(checkin);
  }
}
function appendWearLog(clothId, date, source){
  store.logs.push({ id:uid(), clothId:clothId, date:date, source:source });
}
function removeWearLogById(logId){
  var idx = store.logs.findIndex(function(l){ return l.id === logId; });
  if(idx >= 0) store.logs.splice(idx, 1);
}
function removeClothById(id){
  var ci = store.clothes.findIndex(function(x){ return x.id === id; });
  if(ci >= 0) store.clothes.splice(ci, 1);
  for(var i = store.logs.length - 1; i >= 0; i--){
    if(store.logs[i].clothId === id) store.logs.splice(i, 1);
  }
}
function normStr(s){ return String(s||'').toLowerCase().replace(/\s+/g,'').trim(); }
function clothSimilarity(item, cloth){
  var score = 0;
  var inName = normStr(item.name);
  var cnName = normStr(cloth.name);
  if(inName && cnName){
    if(inName === cnName) score += 50;
    else if(cnName.indexOf(inName) >= 0 || inName.indexOf(cnName) >= 0) score += 35;
    else {
      var common = 0, len = Math.min(inName.length, cnName.length);
      for(var i = 0; i < len; i++){ if(inName[i] === cnName[i]) common++; }
      score += Math.round(20 * common / Math.max(inName.length, cnName.length, 1));
    }
  }
  if(item.category && cloth.category && item.category === cloth.category) score += 25;
  if(item.color && cloth.color && item.color === cloth.color) score += 15;
  return score;
}
function resolveClothInWardrobe(item){
  if(item.id){
    var byId = findCloth(item.id);
    if(byId) return byId;
  }
  var best = null, bestScore = 0;
  store.clothes.forEach(function(c){
    var s = clothSimilarity(item, c);
    if(s > bestScore){ bestScore = s; best = c; }
  });
  if(bestScore >= 35) return best; // 相似度阈值，打卡校验复用
  return null;
}
function validateCheckinItems(items){
  // 对勾选衣物逐条做衣橱相似度匹配（id 精确 + 属性相似 ≥35）
  var resolved = [], missing = [];
  items.forEach(function(m){
    var cloth = resolveClothInWardrobe(m);
    if(cloth) resolved.push({ id:cloth.id, name:cloth.name });
    else missing.push(m.name || '未命名衣物');
  });
  return { resolved:resolved, missing:missing };
}
function imgBox(photo, category, variant, letterSlice){
  var letter = esc((category||'').slice(0, letterSlice == null ? 2 : letterSlice));
  var src = normalizePublicUrl(photo);
  if(src) return '<div class="img-wrap-'+variant+'">'+photoImgHtml(src)+'</div>';
  return '<div class="img-wrap-'+variant+' img-placeholder"><span>'+letter+'</span></div>';
}

/* ---------- 全局状态 ---------- */
var currentTab = 'today';
var sheetOpen = false;
var toastTimer = null;

/* ---------- 渲染入口 ---------- */
function render(){
  highlightTab();
  var app = $('#app');
  if(currentTab==='today') app.innerHTML = viewToday();
  else if(currentTab==='closet') app.innerHTML = viewCloset();
  else if(currentTab==='analysis') app.innerHTML = viewAnalysis();
  else if(currentTab==='settings') app.innerHTML = viewSettings();
  bindTabEvents();
  bindPhotoFallbacks(app);
  window.scrollTo(0,0);
}

function highlightTab(){
  $all('.tab-btn').forEach(function(b){ b.classList.toggle('tab-active', b.dataset.tab===currentTab); });
}
function bindTabEvents(){ /* 子视图各自绑定 */ }

/* ---------- Toast ---------- */
function toast(msg){
  var t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.add('hidden'); }, 1800);
}

/* ---------- Sheet ---------- */
var sheetCloseTimer = null;
function openSheet(html){
  if(sheetCloseTimer){ clearTimeout(sheetCloseTimer); sheetCloseTimer = null; }
  var sheet = $('#sheet'), mask = $('#sheet-mask');
  sheet.innerHTML = html;
  mask.classList.remove('hidden');
  sheetOpen = true;
  bindPhotoFallbacks(sheet);
  requestAnimationFrame(function(){ sheet.classList.add('show'); mask.classList.add('show'); });
}
function closeSheet(skipReturnCheck){
  if(checkinPendingReturn && !skipReturnCheck){
    returnToCheckinModal(false);
    return;
  }
  window._closetPrefillCat = '';
  // 任意阶段关闭弹窗：清除打卡临时图片与勾选缓存（跳转添加衣物时保留）
  if(!checkinPendingReturn){
    if(typeof closeCheckinPickOverlay === 'function') closeCheckinPickOverlay();
    resetCheckinTempState();
  }
  var sheet = $('#sheet'), mask = $('#sheet-mask');
  sheet.classList.remove('show'); mask.classList.remove('show');
  sheetOpen = false;
  if(sheetCloseTimer) clearTimeout(sheetCloseTimer);
  sheetCloseTimer = setTimeout(function(){
    sheet.innerHTML = ''; mask.classList.add('hidden');
    sheetCloseTimer = null;
  }, 280);
}
$('#sheet-mask').addEventListener('click', closeSheet);

var WARM_SENTENCES = ["把普通的日子过得浪漫些，你的生活自有光芒。","慢慢来，所有美好都会在合适的时候奔赴你。","好好善待自己，才是终身浪漫的开始。","不必追赶星光，你本身就在发光。","允许一切发生，也允许自己慢慢变好。","平凡日常，也藏着细碎的温柔与欢喜。","生活的温柔，总会兜兜转转落到你身上。","不必焦虑，你走的每一步都有意义。","照顾好自己，就是最重要的事。","不慌不忙，自在舒展，做舒服的自己。","接纳当下，与生活温柔和解。","每一天，都有属于自己的小美好。","好好生活，慢慢相遇。","日子慢慢走，不必强迫自己闪闪发光。","生活是旷野，不是轨道，尽情感受就好。","愿你在琐碎日常里，寻得属于自己的松弛。","不必事事完美，舒服自在便是上上签。","你已经很棒了，请多给自己一点宽容。","风遇山止，船到岸停，一切自有归处。","保持热爱，奔赴属于你的山海。","小小的努力，终会拼凑成大大的光亮。","把情绪安放妥当，生活自会缓缓开花。","世间万般，平安喜乐便是难得。","愿你眼里有光，心中有爱，一路坦荡。","生活偶尔有风雨，但也处处藏暖意。","放过纠结，向内安顿，日子自会晴朗。","不用活成别人期待，忠于自己就足够。","时光会善待每一个认真生活的人。","心怀温柔，日子也会变得柔软。","生活的答案，藏在每一个当下。","轻装上阵，感受生活馈赠的每一份小欢喜。","不必急着抵达，沿途风景同样珍贵。","给自己多一点耐心，成长本就是慢过程。","哪怕日子平淡，也可以活得热气腾腾。","心向暖阳，万物皆有回甘。","所有的沉淀，都是为了更好的出发。","允许偶尔疲惫，休息也是一种力量。","把烦恼轻轻放下，好好拥抱此刻。","你值得世间所有的温柔与偏爱。","好好吃饭，好好睡觉，好好爱自己。","生活没有标准答案，开心就是最优解。","内心安稳，便是最好的状态。","微光点点，聚起来便是满目星河。","与生活握手言和，与自己温柔相处。","不必羡慕别人，你也有独一份的精彩。","时光浅浅，愿你平安且从容。","凡是过往，皆为序章，好好奔赴往后。","守住内心的平静，万事自有回响。","生活细碎，万物成诗。","愿你历经世事，依旧保有心底温柔。","每一个平凡的今天，都值得被认真对待。","松弛一点，人生不需要时刻紧绷。","慢慢来，会有属于你的春暖花开。","心怀暖意，无惧世事寒凉。","所有的坚持，终有一天会开花结果。","向内生长，慢慢成为更喜欢的自己。","日子有苦有甜，坦然接纳就很好。","不辜负生活，不迷失方向。","愿生活，一半烟火，一半清欢。","把期待降低，把热爱留给自己。","风来听风，雨来赏雨，安然度日。","平凡也很好，平安即是圆满。","你的感受最重要，不必勉强迎合谁。","在自己的节奏里，安静热闹都随你。","生活的美好，往往藏在不起眼瞬间。","放下内耗，把精力留给值得的人和事。","慢慢来，谁都有属于自己的时区。","心里装着温柔，所见皆是温柔。","不必光芒万丈，但始终温暖有光。","接纳不完美，也是一种强大。","生活偶尔失意，但永远不要失去期许。","善待当下，就是善待往后的自己。","愿你被世界温柔以待，也温柔待自己。","小小的欢喜，足以抵御人间万般疲惫。","步履不停，奔赴属于你的人间烟火。","心若晴朗，人生便没有雨天。","沉淀自己，静待花开。","不必慌张，一切最好的安排都在路上。","把生活调成自己喜欢的频道。","人间朝暮，叶落惊秋，岁岁安然。","好好生活，其余交给时间。","内心丰盈，不惧世事喧嚣。","生活的浪漫，来自于好好爱自己。","允许偶尔摆烂，重启依旧闪闪发光。","愿所有奔赴，都有温柔回响。","岁月缓缓，愿你自在安然。","认真生活的人，终会被生活眷顾。","不纠结过往，不忧虑未来，活在当下。","烟火寻常，亦是人间理想。","保持心底热忱，奔赴每一场日月星光。","把烦恼交给晚风，把温柔留给自己。","每个人花期不同，不必焦虑别人提前绽放。","简单的日子，也可以过得闪闪发光。","心怀善意，日子自会温柔以待。","累了就歇一歇，不必强迫自己一直向前。","生活本就普通，是热爱让它闪闪发光。","愿你，所得皆所愿，所行皆坦途。","守住心中微光，不惧前路漫长。","与自己和解，才是一生的必修课。","时光不言，却回答所有问题。","且停且忘且随风，且行且看且从容。","把琐碎日子，酿成属于自己的风景。","不必追逐月亮，你我皆是星光。","万事尽心尽力，而后顺其自然。","愿日子清透，世事皆温柔。","好好感受当下，就是最好的生活。","接纳所有际遇，好坏都是馈赠。","生活有起落，保持内心的平和就好。","给自己一份松弛，和世界温柔相处。","平凡的日子，也值得满心欢喜。","心有山海，静而无边。","所有不期而遇，都是生活的温柔惊喜。","慢慢来，一切都来得及。","做自己，就是最珍贵的模样。","生活的底气，来源于好好爱自己。","愿风雨过后，皆是温柔晴空。","在烟火人间，守一份内心安然。","少一点内耗，多一点自在。","眼里存星光，心中存善良。","日子缓缓，生活散散，平安喜乐。","每一次沉淀，都是蜕变的铺垫。","不必被世俗定义，活出你的模样。","温柔对待生活，生活也会温柔待你。","纵使生活普通，也可以拥有小浪漫。","一切经历，都是成长的礼物。","愿你，平安无忧，喜乐如常。","放下执念，万事皆可释怀。","保持一份热爱，对抗世间万般平淡。","风有归期，人有归途，万事皆有回响。","认真善待每一个普通的朝夕。","内心有力量，生活便不会慌张。","生活没有那么多标准答案，自在就好。","愿你遍历山河，仍觉人间值得。","把烦恼慢慢释怀，把温柔慢慢积攒。","慢慢来，属于你的终会向你奔赴。","人间一趟，积极向上，不念过往。","简单一点，快乐就会多一点。","给自己时间，慢慢治愈所有疲惫。","生活的美好，在于不慌不忙。","心怀希望，就永远会有光亮。","不慌不忙，静候属于自己的风景。","烟火漫漫，岁岁平安。","愿你，忠于自己，活得尽兴。","不必强求圆满，知足即是心安。","好好照顾情绪，也是好好生活。","世间万物，各有节奏，不必攀比。","把平凡日常，过成喜欢的模样。","心宽一寸，路宽一丈。","所有的煎熬，终会化作照亮前路的光。","允许生活偶尔不遂人愿。","向阳而生，逐光而行。","生活，一半是回忆，一半是继续。","愿所有努力，都不被辜负。","感受人间烟火，珍惜寻常幸福。","向内安顿自己，向外从容生活。","日子温柔，万事可期。","不必追求万众瞩目，自在即是幸福。","风雨会过去，美好终会相遇。","愿你，所得皆所期，所失亦无碍。","以温柔之心，渡烟火日常。","保持松弛感，好好过完每一天。","每一份微小的美好，都值得被看见。","时间会筛选身边所有的人和事。","守住内心的一份安宁，胜过万千繁华。","人生海海，先顾好自己。","不必焦虑未来，过好眼前即是上策。","生活的浪漫藏在每一个细碎瞬间。","愿你，冷暖自知，悲喜自渡，万般从容。","慢慢来，时间会给你最好的答复。","心怀暖意，不惧人间风霜。","接纳生活的不完美，才是真正成熟。","认真生活，就可以找到生活藏起来的糖。","风有约，花不误，岁岁如此永不相负。","愿你的生活，既有烟火，也有星光。","放下纠结，才会拥抱更多美好。","做一个温暖的人，浅浅笑，轻轻爱。","平凡的朝暮，也藏着无尽温柔。","凡是经历，皆有馈赠。","心若安然，处处皆是风景。","不必行色匆匆，按自己步调前行。","愿世间所有美好，都与你撞个满怀。","把所有的不愉快，留给昨天。","好好爱自己，是终身的必修课。","人间值得，未来可期。","日子慢慢，欢喜满满。","在自己的世界里独善其身。","生活虽平淡，热爱可抵岁月漫长。","愿你，无灾无难，岁岁欢愉。","所有星光，都来自不懈的努力。","与生活和解，与自己握手言欢。","时光温柔，静待花开。","生活最好的状态，是冷冷清清的风风火火。","允许一切发生，然后勇敢向前。","愿你眼里的星星，永远不会坠落。","把日子过成自己喜欢的节奏。","山河辽阔，人间烟火，无一不是你。","不必羡慕别人的光芒，你自有你的璀璨。","生活是慢慢感受，不是拼命追赶。","岁岁年年，万喜万般宜。","愿你，平安顺遂，万事胜意。","把疲惫慢慢卸下，拥抱温柔的当下。","心怀一份美好，静待岁月馈赠。","不困过往，不忧将来，安于当下。","生活万般模样，心安即是归处。","温柔半两，从容一生。","所有的低谷，都是向上的铺垫。","好好感受生活赠予的每一份小确幸。","愿风带给你，世间所有的温柔。","人生不用太圆满，心安就是圆满。","在纷繁世界，守住内心的简单。","每一个今天，都是独一无二的礼物。","愿你，多喜乐，长安宁。","慢慢沉淀，慢慢发光。","生活有风雨，也会有不期而遇的暖阳。","放下精神内耗，活得轻松自在。","保持心底的那份纯粹与热忱。","凡是过往，皆为经历，皆为成长。","愿日子，温温柔柔，安安稳稳。","不必事事要强，示弱也没关系。","人间朝暮，叶落花开，皆是风景。","以欢喜之心，慢度日常。","愿你，历经千帆，归来依旧温柔。","把普通的时光，过得有温度。","心向明媚，何惧世事浮沉。","每一步小小的前行，都值得被肯定。","生活不只有奔赴，也有停下欣赏。","愿所有的等待，都迎来美好的结果。","简单生活，自在欢喜。","接纳自己所有情绪，不必强迫乐观。","岁月无言，善待每一个努力的你。","烟火人间，各有遗憾，也各有圆满。","保持热爱，生活自有万千风景。","愿你，心中有梦，眼底有光。","把烦恼释怀，把温柔留给朝夕。","人生没有标准答案，活成自己就好。","时光缓缓而行，愿你岁岁无忧。","生活的甜，需要用心慢慢发现。","允许自己普通，也允许自己发光。","风雨人生路，温柔渡自己。","愿世间温柔，如约而至。","守一份从容，度岁岁流年。","好好生活，慢慢自愈。","万物皆有裂痕，那是光照进来的地方。","心有暖阳，何惧风霜。","平凡烟火，也可以熠熠生辉。","愿你，不慌不忙，向阳生长。","生活起起落落，守住内心平和。","把每一天，过得温柔且有力量。","不必渴求所有人理解，懂自己就够。","岁月流转，愿你始终温暖明亮。","所有美好，都值得耐心等待。","人间一趟，要热烈，也要自在。","放下焦虑，享受当下的时光。","愿你，平安喜乐，万事无忧。","于烟火日常，寻一份内心晴朗。","慢慢来，一切美好都在赶来路上。","内心丰盈，便不惧世间荒凉。","生活的浪漫，源于内心的热爱。","愿所有的坎坷，都化作往后坦途。","与岁月温柔相处，与自己好好相处。","普通的日子，也可以闪闪发光。","心放宽，事看淡，人自安。","每一份坚持，都不会被时光辜负。","愿你，所见皆美好，所遇皆温柔。","生活，贵在知足，贵在心安。","允许短暂低落，之后继续向前走。","以温柔姿态，对抗世间万般匆忙。","岁岁常欢愉，年年皆胜意。","把细碎的快乐，拼凑成生活的光。","不必仰望别人，你亦是风景。","日子有光，抬头就有希望。","好好善待每一个阶段的自己。","人间烟火，最抚凡人心。","愿你，所求皆如愿，所行皆光明。","生活本是旅途，不必执着终点。","守住心中的温柔，不惧世事沉浮。","时光会把最好的留给愿意等待的人。","简单知足，便是莫大幸福。","心怀热爱，平凡日子也会泛光。","愿你，一生温暖纯良，不舍爱与自由。","放下外界的声音，忠于内心感受。","生活有苦有甜，坦然接受全部。","慢下来，感受生活本身的力量。","万物向阳，人亦向好。","愿往后余生，平安自在，随心随性。","所有经历的苦难，终将变成礼物。","在喧嚣世界，留一份属于自己的安静。","好好生活，就是最好的状态。","心若向暖，岁月不寒。","愿你，不卑不亢，清澈坦荡。","平凡的人生，也拥有独一份的璀璨。","把期待降低，把热爱抬高。","人间值得，你更值得。","岁月温柔，善待每一个普通人。","不慌不忙，静享人间朝暮。","生活的解药，永远是好好爱自己。","愿所有的美好，如期而至。","接纳世事无常，依旧心向光亮。","于平淡之中，打捞生活的浪漫。","每一个平凡个体，都值得被好好对待。"];
var todayWarmQuote = '';
function warmQuoteForDate(dateStr){
  var hash = 0;
  for(var i = 0; i < dateStr.length; i++){
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  return WARM_SENTENCES[Math.abs(hash) % WARM_SENTENCES.length];
}
function pickWarmQuote(){
  todayWarmQuote = warmQuoteForDate(selectedDate);
}
var MOOD_EMOJIS = ['😊','😌','😴','💪','🥺','🥰','😐','😢','🤩'];

function saveTodayMoodDraft(){
  if(todayViewDay !== 0) return;
  var date = todayStr();
  var existing = findCheckin(date);
  var w = store.weather;
  var dayW = w.today;
  var noteVal = todayMoodNote;
  var moodEl = $('#today-mood-note');
  if(moodEl) noteVal = moodEl.value;
  todayMoodNote = noteVal;
  var checkin = {
    id: existing ? existing.id : uid(),
    date: date,
    photo: existing ? (existing.photo || '') : '',
    weather: existing ? existing.weather : { city:w.city, temp:dayW.temp, cond:dayW.cond, desc:dayW.desc || '' },
    moodEmoji: todayEmoji,
    moodNote: noteVal,
    mood: todayEmoji || (existing ? existing.mood : ''),
    note: noteVal || (existing ? existing.note : ''),
    profileSnapshot: existing ? existing.profileSnapshot : clone(store.profile),
    items: existing ? (existing.items || []) : []
  };
  if(existing && existing.moodIntensity != null) checkin.moodIntensity = existing.moodIntensity;
  upsertCheckinByDate(checkin);
  persistCheckins().catch(function(err){ toast('打卡草稿同步失败：'+(err.message||err)); });
}
function checkinMoodLabel(c){
  if(c.moodEmoji) return c.moodEmoji;
  return c.mood || '';
}
function insertEmojiToMoodNote(emoji){
  var el = $('#today-mood-note');
  todayEmoji = emoji;
  if(el) clearMoodDefaultIfNeeded(el);
  if(!el){
    todayMoodNote = (todayMoodNote || '') + emoji;
    return;
  }
  var start = el.selectionStart != null ? el.selectionStart : el.value.length;
  var end = el.selectionEnd != null ? el.selectionEnd : start;
  el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
  todayMoodNote = el.value;
  var pos = start + emoji.length;
  el.focus();
  try{ el.setSelectionRange(pos, pos); }catch(e){}
  $all('.emoji-btn').forEach(function(btn){ btn.classList.toggle('selected', btn.dataset.emoji === emoji); });
}
function trimMoodSentence(s){
  return String(s || '').replace(/[。．.!！?？…]+$/g, '').trim();
}
function pickMoodDefaultSentence(){
  moodDefaultSentence = WARM_SENTENCES[Math.floor(Math.random() * WARM_SENTENCES.length)];
}
function getMoodDefaultText(){
  if(!moodDefaultSentence) pickMoodDefaultSentence();
  return '今日心情：' + trimMoodSentence(moodDefaultSentence) + '…';
}
function isMoodDefaultNote(note){
  if(!note) return false;
  return note === getMoodDefaultText();
}
function clearMoodDefaultIfNeeded(el){
  if(!moodInputActivated){
    moodInputActivated = true;
    if(el && isMoodDefaultNote(el.value)){
      el.value = '';
      todayMoodNote = '';
      el.classList.remove('mood-input-default');
    }
  }
}
function getMoodInputDisplayValue(){
  if(!moodInputActivated && !todayEmoji) return getMoodDefaultText();
  return todayMoodNote;
}
function checkinSourceLabel(c){
  if(c.source === 'mood') return '心情';
  return '穿搭';
}
function submitMoodDiary(){
  if(todayViewDay !== 0) return;
  var moodEl = $('#today-mood-note');
  var note = ((moodEl && moodEl.value) || todayMoodNote || '').trim();
  if(isMoodDefaultNote(note)) note = '';
  if(!todayEmoji && !note){
    toast('请选择 emoji 或填写心情');
    return;
  }
  var date = todayStr();
  var w = store.weather;
  var dayW = w.today;
  store.checkins.push({
    id: uid(),
    date: date,
    source: 'mood',
    moodEmoji: todayEmoji,
    moodNote: note,
    mood: todayEmoji,
    note: note,
    createdAt: new Date().toISOString(),
    weather: { city: w.city, temp: dayW.temp, cond: dayW.cond, desc: dayW.desc || '' },
    items: []
  });
  showLoading('同步打卡…');
  persistCheckins().then(function(){
    hideLoading();
    todayEmoji = '';
    todayMoodNote = '';
    moodInputActivated = false;
    moodDefaultSentence = '';
    toast('心情已记录');
    render();
  }).catch(function(err){
    hideLoading();
    store.checkins.pop();
    toast('心情保存失败：'+(err.message||err));
  });
}
function getRecentCheckins(limit){
  return store.checkins.slice().sort(function(a,b){
    if(a.date !== b.date) return a.date < b.date ? 1 : -1;
    var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  }).slice(0, limit || 7);
}
var WUXING_LUCKY = {
  '金': { colors:['白色','金色','银色','米白'], vibe:'利落简洁、线条清晰' },
  '木': { colors:['绿色','青色','森系色','橄榄绿'], vibe:'自然舒展、清新层次' },
  '水': { colors:['黑色','藏蓝','深灰','灰蓝'], vibe:'沉静内敛、流动感搭配' },
  '火': { colors:['红色','酒红','粉色','暖橘'], vibe:'明亮热情、视觉焦点' },
  '土': { colors:['黄色','棕色','卡其','米色'], vibe:'稳重大地、质感优先' }
};
function extractWuXing(raw){
  if(raw == null || raw === '') return '';
  var s = String(raw);
  var keys = ['金','木','水','火','土'];
  for(var i = 0; i < keys.length; i++){
    if(s.indexOf(keys[i]) >= 0) return keys[i];
  }
  return '';
}
function genOutfitInspire(inspireDate){
  console.log('[穿搭灵感] 函数入参日期:', inspireDate, '| 页面 selectedDate:', selectedDate, '| 一致:', inspireDate === selectedDate);
  if(!inspireDate || typeof Solar === 'undefined'){
    var fb = WUXING_LUCKY['土'];
    return { luckyColors: fb.colors.slice(), vibe: fb.vibe };
  }
  var parts = inspireDate.split('-');
  var solar = Solar.fromYmd(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  var lunar = solar.getLunar();
  var ec = lunar.getEightChar();
  var dayWx = extractWuXing(ec.getDayWuXing());
  if(!dayWx && lunar.getDayNaYin) dayWx = extractWuXing(lunar.getDayNaYin());
  if(!dayWx) dayWx = '土';
  var wx = WUXING_LUCKY[dayWx] || WUXING_LUCKY['土'];
  console.log('[穿搭灵感] 计算结果 日期:', inspireDate, '| 五行:', dayWx, '| 幸运色:', wx.colors.join('、'), '| 氛围:', wx.vibe);
  return { luckyColors: wx.colors.slice(), vibe: wx.vibe };
}
function getLunarAlmanac(dateStr){
  if(typeof Solar === 'undefined') return null;
  var parts = dateStr.split('-');
  var solar = Solar.fromYmd(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  var lunar = solar.getLunar();
  var yiArr = lunar.getDayYi() || [];
  var jiArr = lunar.getDayJi() || [];
  return {
    solarText: solar.getYear()+'年'+solar.getMonth()+'月'+solar.getDay()+'日 '+solar.getWeekInChinese(),
    lunarText: '农历'+lunar.getMonthInChinese()+'月'+lunar.getDayInChinese(),
    yi: yiArr.slice(0, 4).join('、'),
    ji: jiArr.slice(0, 4).join('、'),
    inspire: genOutfitInspire(dateStr)
  };
}
/** 今日卡片顶栏日期展示：月日 + 周X（不改 almanac 数据结构） */
function formatWeatherCardDateShort(dateStr){
  var parts = String(dateStr || '').split('-');
  if(parts.length < 3) return '';
  var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if(!y || !m || !d) return '';
  var weekNames = ['日','一','二','三','四','五','六'];
  var dt = new Date(y, m - 1, d);
  if(isNaN(dt.getTime())) return m+'月'+d+'日';
  return m+'月'+d+'日 周'+weekNames[dt.getDay()];
}
function renderWeatherAlmanacEmbed(almanac){
  if(!almanac || (!almanac.yi && !almanac.ji)) return '';
  var html = '<div class="weather-yiji-grid">';
  html += '<div class="weather-yiji-card weather-yiji-yi"><div class="weather-yiji-label">宜</div><div class="weather-yiji-val">'+(almanac.yi ? esc(almanac.yi) : '—')+'</div></div>';
  html += '<div class="weather-yiji-card weather-yiji-ji"><div class="weather-yiji-label">忌</div><div class="weather-yiji-val">'+(almanac.ji ? esc(almanac.ji) : '—')+'</div></div>';
  html += '</div>';
  return html;
}
function renderAlmanacCard(almanac){
  if(!almanac){
    return '<div class="almanac-card bg-white border border-line section-gap mb-2.5"><div class="text-sm text-mute text-center py-8">黄历库加载中，请刷新后重试</div></div>';
  }
  var html = '<div class="almanac-card bg-white border border-line section-gap mb-2.5">';
  html += '<div class="text-sm font-semibold mb-3.5">黄历</div>';
  html += '<div class="space-y-2">';
  html += '<div class="almanac-row flex gap-2"><span class="almanac-label">宜</span><span class="text-good">'+esc(almanac.yi)+'</span></div>';
  html += '<div class="almanac-row flex gap-2"><span class="almanac-label">忌</span><span class="text-bad">'+esc(almanac.ji)+'</span></div>';
  html += '</div>';
  html += '<div class="border-t border-line/70 mt-4 pt-4">';
  html += '<div class="text-sm font-semibold mb-2.5">黄历穿搭灵感</div>';
  html += '<div class="almanac-inspire space-y-2.5">';
  html += '<div class="text-[13px]"><span class="text-mute">幸运色 · </span>'+esc(almanac.inspire.luckyColors.join('、'))+'</div>';
  html += '<div class="text-[13px]"><span class="text-mute">穿搭氛围 · </span>'+esc(almanac.inspire.vibe)+'</div>';
  html += '</div></div></div>';
  return html;
}
function diaryMiniCard(c){
  var mood = checkinMoodLabel(c);
  var src = checkinSourceLabel(c);
  var html = '<button type="button" class="diary-card" data-checkin-id="'+esc(c.id)+'">';
  html += '<div class="diary-card-thumb">';
  if(c.photo) html += photoImgHtml(c.photo);
  else html += '<div class="w-full h-full flex items-center justify-center text-mute text-lg">'+(mood ? mood.slice(0,2) : (src === '心情' ? '💭' : '👗'))+'</div>';
  html += '</div><div class="diary-card-body">';
  html += '<div class="text-[10px] font-medium truncate">'+esc(c.date.slice(5))+'<span class="diary-src-tag">'+esc(src)+'</span></div>';
  html += '<div class="text-[10px] text-mute truncate">'+(c.moodNote || c.note || mood || '无记录')+'</div>';
  html += '</div></button>';
  return html;
}
function checkinDetailHtml(c){
  var w = (c && c.weather) || {};
  var html = '<div class="px-5 space-y-3 pb-2">';
  html += '<div class="flex items-center justify-between text-sm"><span class="font-medium">'+esc(c.date)+' <span class="diary-src-tag">'+esc(checkinSourceLabel(c))+'</span></span>';
  html += '<span class="text-xs text-mute">'+esc(w.city || '')+(w.temp != null && w.temp !== '' ? (' '+w.temp+'°') : '')+(w.cond ? (' '+esc(w.cond)) : '')+'</span></div>';
  // 穿搭衣物缩略图：有勾选衣物才渲染，无则不占位
  if(c.items && c.items.length){
    html += '<div class="flex gap-2 overflow-x-auto no-scrollbar">';
    c.items.forEach(function(it){
      var cloth = findCloth(it.id);
      var photo = cloth && cloth.photo ? cloth.photo : '';
      var category = (cloth && cloth.category) || it.category || '';
      html += '<div class="flex-shrink-0">';
      html += imgBox(photo, category, 'list', 2);
      html += '</div>';
    });
    html += '</div>';
  }
  if(c.photo) html += '<div>'+imgBox(c.photo, '', 'portrait-lg', 0)+'</div>';
  html += '<div class="flex flex-wrap gap-1.5">';
  var moodTxt = checkinMoodLabel(c);
  if(moodTxt) html += '<span class="text-[11px] bg-brand-soft rounded-full px-2 py-0.5">'+esc(moodTxt)+'</span>';
  (c.items||[]).forEach(function(it){ html += '<span class="text-[11px] bg-line/50 rounded-full px-2 py-0.5">'+esc(it.name)+'</span>'; });
  html += '</div>';
  if(c.moodNote || c.note) html += '<div class="text-sm text-ink/80 leading-relaxed bg-paper rounded-xl p-3">'+esc(c.moodNote || c.note)+'</div>';
  if(!c.photo && !(c.items&&c.items.length) && !moodTxt && !(c.moodNote||c.note)) html += '<div class="text-center text-mute text-sm py-6">暂无更多详情</div>';
  html += '</div>';
  return html;
}
function openCheckinDetail(id){
  var c = store.checkins.filter(function(x){ return x.id === id; })[0];
  if(!c) return;
  openSheet(sheetHeader('打卡详情 · '+c.date) + checkinDetailHtml(c));
}

/* ---------- 真实天气（经 external 模块，页面不直接 fetch） ---------- */
function fetchRealWeather(city){
  return fetchRealWeatherExternal(city);
}

function refreshWeather(city, done){
  var targetCity = (city || store.weather.city || store.profile.city || '北京').trim() || '北京';
  store.weather.loading = true;
  store.weather.error = false;
  store.weather.city = targetCity;
  if(currentTab === 'today') render();
  fetchRealWeather(targetCity).then(function(weather){
    store.weather = weather;
    // weather 为临时展示态，不同步 D1
    render();
    if(done) done(!weather.error, weather);
  });
}
function isWeatherUnavailable(day){
  if(store.weather.loading) return true;
  if(store.weather.error) return true;
  if(!day || day.temp == null || day.cond === '天气获取失败') return true;
  return false;
}
function weatherTempText(day){
  if(store.weather.loading) return '—';
  if(isWeatherUnavailable(day)) return '—';
  return String(day.temp);
}
function weatherCondText(day){
  if(store.weather.loading) return '加载中…';
  if(isWeatherUnavailable(day)) return '天气获取失败';
  return day.cond || '';
}

/* ============================================================
   视图：今日
   ============================================================ */
var todayViewDay = 0; // 0=今日 1=明日
var selectedDate = '';
var todayEmoji = '';
var todayMoodNote = '';
var moodInputActivated = false;
var moodDefaultSentence = '';

function syncSelectedDate(){
  selectedDate = todayViewDay === 0 ? todayStr() : tomorrowStr();
}

function viewToday(){
  var w = store.weather;
  var p = store.profile;
  syncSelectedDate();
  pickWarmQuote();
  var day = todayViewDay===0 ? w.today : w.tomorrow;
  var almanac = getLunarAlmanac(selectedDate);
  var recentCheckins = getRecentCheckins(10);

  if(todayEmoji && MOOD_EMOJIS.indexOf(todayEmoji) < 0) todayEmoji = '';
  if(todayViewDay===0 && !moodInputActivated && !todayEmoji){
    if(!moodDefaultSentence) pickMoodDefaultSentence();
    todayMoodNote = getMoodDefaultText();
  }

  var html = '';
  html += '<div class="today-compact page-shell px-4 pt-4" style="padding-top:var(--today-pad-top)">';

  // 板块1：今日综合信息（天气即景）
  // 第一行：头像+完整昵称 | 月日星期；下方左右栏保持城市天气 / 切换与标签
  html += '<div class="weather-card-compact section-gap">';
  html += '<div class="weather-card-head">';
  html += '<div class="weather-profile-name-row">';
  if(p.avatar){
    html += '<div class="avatar-circle" style="width:3.375rem;height:3.375rem;border:2px solid rgba(255,251,245,0.9)"><img src="'+p.avatar+'" alt="" /></div>';
  } else {
    html += '<div class="avatar-circle avatar-placeholder" style="width:3.375rem;height:3.375rem;border:2px solid rgba(255,251,245,0.9)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>';
  }
  html += '<div class="weather-profile-name">'+(p.name ? esc(p.name) : '你好，穿搭达人')+'</div>';
  html += '</div>';
  html += '<div class="weather-card-date">'+esc(formatWeatherCardDateShort(selectedDate))+'</div>';
  html += '</div>';
  html += '<div class="weather-card-top">';
  html += '<div class="weather-card-left">';
  html += '<div class="weather-city-row">';
  html += '<div class="weather-city-label text-[11px] text-mute/90 flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'+esc(w.city)+'</div>';
  html += '<button class="weather-edit text-[10px] text-brand-dark border border-brand/25 rounded-full px-2 py-0.5 flex-shrink-0 bg-white/60">修改</button>';
  html += '</div>';
  html += '<div class="weather-brief mt-1.5"><span class="text-xl font-light whitespace-nowrap">'+weatherTempText(day)+'°</span><span class="weather-brief-cond text-[11px] text-mute/85">'+esc(weatherCondText(day))+(day.desc?(' · '+esc(day.desc)):'')+'</span></div>';
  html += '</div>';
  html += '<div class="weather-card-right">';
  html += '<div class="flex weather-day-switch rounded-full p-0.5 text-[10px] flex-shrink-0">';
  html += '<button class="day-swt px-2.5 py-0.5 rounded-full '+(todayViewDay===0?'bg-white shadow-sm text-ink':'text-mute')+'" data-day="0">今日</button>';
  html += '<button class="day-swt px-2.5 py-0.5 rounded-full '+(todayViewDay===1?'bg-white shadow-sm text-ink':'text-mute')+'" data-day="1">明日</button>';
  html += '</div>';
  html += '<div class="weather-profile-tags">';
  if(p.age) html += '<span class="weather-tag-pill text-[10px] rounded-full px-2 py-0.5 text-mute">'+esc(p.age)+'岁</span>';
  if(p.mbti) html += '<span class="weather-tag-pill text-[10px] rounded-full px-2 py-0.5 text-mute">'+esc(p.mbti)+'</span>';
  if(p.prefStyles&&p.prefStyles.length) html += '<span class="weather-tag-pill text-[10px] rounded-full px-2 py-0.5 text-mute">'+esc(p.prefStyles.slice(0,2).join(''))+'</span>';
  if(!p.age&&!p.mbti&&!(p.prefStyles&&p.prefStyles.length)) html += '<span class="text-[10px] text-mute/80 whitespace-nowrap">未填写画像</span>';
  html += '</div></div></div>';
  html += '<div class="weather-copy-block">';
  html += '<div class="weather-tip-text leading-relaxed">'+esc(genAlmanac(day, p))+'</div>';
  html += '</div>';
  html += renderWeatherAlmanacEmbed(almanac);
  html += '</div>';

  // 板块2+3：今日心情 + 打卡日记（合并卡片）
  html += '<div class="mood-diary-card section-gap">';
  html += '<div class="mood-diary-card-title"><span class="title-diary">打卡日记</span></div>';
  if(todayViewDay===0){
    html += '<div class="mood-diary-mood space-y-2">';
    html += '<div class="mood-emoji-scroll no-scrollbar">';
    MOOD_EMOJIS.forEach(function(em){
      html += '<button type="button" class="emoji-btn sm '+(todayEmoji===em?'selected':'')+'" data-emoji="'+em+'">'+em+'</button>';
    });
    html += '</div>';
    html += '<div class="flex gap-1.5 items-center">';
    var moodInputDefault = !moodInputActivated && !todayEmoji;
    html += '<input id="today-mood-note" type="text" class="flex-1 min-w-0 bg-paper rounded-lg border border-line px-2.5 py-1.5 text-xs'+(moodInputDefault?' mood-input-default':'')+'" value="'+esc(getMoodInputDisplayValue())+'" />';
    html += '<button type="button" id="btn-mood-submit" class="mood-plane-btn" title="提交心情" aria-label="提交心情">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
    html += '</button></div>';
    html += '</div>';
  }

  // renderAlmanacCard(almanac) 保留函数与计算链路，独立黄历卡片不再输出到页面

  if(recentCheckins.length){
    html += '<div class="mood-diary-diary">';
    html += '<div class="flex items-center justify-between mb-1.5">';
    html += '<div class="diary-history-label">我的穿搭记录</div>';
    html += '<button id="open-history" type="button" class="text-[10px] text-brand-dark">全部 ›</button></div>';
    html += '<div class="diary-row">';
    html += '<div class="diary-scroll no-scrollbar">';
    recentCheckins.forEach(function(c){ html += diaryMiniCard(c); });
    html += '</div>';
    html += '<button id="btn-diary-recommend" type="button" class="diary-recommend-btn">';
    html += '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    html += '<span>今日<br/>穿搭推荐</span></button>';
    html += '</div></div>';
  }
  html += '</div>';

  html += '<div class="h-2"></div></div>';
  return html;
}

function findCheckin(date){
  var list = store.checkins.filter(function(c){ return c.date === date; });
  for(var i = 0; i < list.length; i++){
    if(list[i].source !== 'mood') return list[i];
  }
  return undefined;
}

function genAlmanac(day, p){
  if(store.weather.loading) return '正在获取天气…';
  if(isWeatherUnavailable(day)) return '天气获取失败';
  var t = day.temp;
  var cond = day.cond || '';
  var parts = [];
  if(t<=5) parts.push('今天挺冷的，厚外套配保暖内搭会更舒服');
  else if(t<=12) parts.push('有点凉，套件外套或叠穿刚刚好');
  else if(t<=20) parts.push('温度正好，轻薄长袖或薄外套就够用');
  else if(t<=28) parts.push('今天暖和，短袖或轻薄单品会很自在');
  else parts.push('天气偏热，选透气清凉的穿搭更舒服');

  if(cond.indexOf('雨')>=0) parts.push('外面有雨，记得带伞，耐水面料更省心');
  else if(cond.indexOf('雪')>=0) parts.push('有雪出门，保暖和防滑都要顾上');
  else if(cond.indexOf('雾')>=0) parts.push('有雾，路上慢一些更安全');
  else if(cond.indexOf('晴')>=0 && t>=22) parts.push('阳光不错，出门可以备下防晒');

  return parts.join('，') + '。';
}

function checkinCard(c){
  var w = (c && c.weather) || {};
  var html = '<div class="bg-white rounded-2xl border border-line p-4">';
  html += '<div class="flex items-center justify-between mb-2"><div class="text-sm font-medium">'+esc(c.date)+' <span class="diary-src-tag">'+esc(checkinSourceLabel(c))+'</span></div>';
  html += '<div class="text-xs text-mute">'+esc(w.city || '')+(w.temp != null && w.temp !== '' ? (' '+w.temp+'°') : '')+(w.cond ? (' '+esc(w.cond)) : '')+'</div></div>';
  if(c.photo) html += '<div class="mb-2">'+imgBox(c.photo, '', 'portrait', 0)+'</div>';
  html += '<div class="flex flex-wrap gap-1.5 mb-2">';
  var moodTxt = checkinMoodLabel(c);
  if(moodTxt) html += '<span class="text-[11px] bg-brand-soft rounded-full px-2 py-0.5">'+esc(moodTxt)+'</span>';
  (c.items||[]).forEach(function(it){ html += '<span class="text-[11px] bg-line/50 rounded-full px-2 py-0.5">'+esc(it.name)+'</span>'; });
  html += '</div>';
  if(c.moodNote || c.note) html += '<div class="text-xs text-mute">'+esc(c.moodNote || c.note)+'</div>';
  html += '</div>';
  return html;
}

/* ---------- 今日：事件绑定 ---------- */
function bindToday(){
  $all('.day-swt').forEach(function(b){ b.addEventListener('click', function(){
    todayViewDay = Number(b.dataset.day);
    syncSelectedDate();
    pickWarmQuote();
    console.log('[今日/明日切换] selectedDate:', selectedDate, '| todayViewDay:', todayViewDay);
    render();
  }); });
  $all('.emoji-btn').forEach(function(b){
    b.addEventListener('click', function(){ insertEmojiToMoodNote(b.dataset.emoji); });
  });
  var moodNoteEl = $('#today-mood-note');
  if(moodNoteEl){
    moodNoteEl.addEventListener('focus', function(){ clearMoodDefaultIfNeeded(this); });
    moodNoteEl.addEventListener('input', function(){ todayMoodNote = this.value; });
  }
  var moodSubmitBtn = $('#btn-mood-submit');
  if(moodSubmitBtn) moodSubmitBtn.addEventListener('click', submitMoodDiary);

  var we = $('.weather-edit'); if(we) we.addEventListener('click', openWeatherEdit);
  var br = $('#btn-diary-recommend'); if(br) br.addEventListener('click', openRecommend);
  var oh = $('#open-history'); if(oh) oh.addEventListener('click', openHistory);
  $all('.diary-card').forEach(function(card){
    card.addEventListener('click', function(){ openCheckinDetail(card.dataset.checkinId); });
  });
}

function openWeatherEdit(){
  var html = sheetHeader('修改城市');
  html += '<div class="px-5 space-y-3">';
  html += '<div><div class="text-xs text-mute mb-1">城市</div><input id="w-city" class="w-full bg-white rounded-xl border border-line p-3 text-sm" value="'+esc(store.weather.city)+'" placeholder="如 上海、北京" /></div>';
  html += '<div class="text-[11px] text-mute leading-relaxed">保存后将自动获取该城市的真实实时天气。</div>';
  html += '<button id="w-save" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium mt-2">保存并更新天气</button>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $('#w-save').addEventListener('click', function(){
    var city = ($('#w-city').value || '').trim() || '北京';
    store.profile.city = city;
    store.weather.city = city;
    closeSheet();
    showLoading('保存城市…');
    saveUserProfileToApi().then(function(){
      hideLoading();
      refreshWeather(city, function(ok){
        toast(ok ? '城市与天气已更新' : '城市已保存，天气获取失败');
      });
    }).catch(function(err){
      hideLoading();
      toast('城市保存失败：'+(err.message||err));
      refreshWeather(city);
    });
  });
}

/* ---------- 今日：拍照打卡（分步向导） ---------- */
var checkinPhoto = '';
var checkinTempPhoto = '';
var checkinMatches = [];
var checkinManualSelected = {};
var checkinManualFilter = { search:'', category:'', color:'', season:'', scene:'', sort:'wear30' };
var checkinReturnSession = null;
var checkinPendingReturn = false;
var checkinStep = 1; // 1=上传照片 2=勾选确认
var checkinWizardMode = 'photo'; // photo=分支A(有图/AI) | manual=分支B(无图)

function resetCheckinTempState(){
  checkinStep = 1;
  checkinWizardMode = 'photo';
  checkinPhoto = '';
  checkinTempPhoto = '';
  checkinMatches = [];
  checkinManualSelected = {};
  checkinManualFilter = { search:'', category:'', color:'', season:'', scene:'', sort:'wear30' };
}
function saveCheckinSession(){
  return {
    photo: checkinTempPhoto || checkinPhoto,
    matches: clone(checkinMatches),
    manualSelected: clone(checkinManualSelected),
    manualFilter: clone(checkinManualFilter),
    step: checkinStep,
    wizardMode: checkinWizardMode
  };
}
function restoreCheckinSession(snap){
  if(!snap) return;
  checkinPhoto = snap.photo || '';
  checkinTempPhoto = snap.photo || '';
  checkinMatches = snap.matches || [];
  checkinManualSelected = snap.manualSelected || {};
  checkinManualFilter = snap.manualFilter || { search:'', category:'', color:'', season:'', scene:'', sort:'wear30' };
  checkinStep = snap.step || 2;
  checkinWizardMode = snap.wizardMode || (checkinPhoto ? 'photo' : 'manual');
}
function navigateCheckinToAddCloth(){
  checkinTempPhoto = checkinTempPhoto || checkinPhoto || '';
  checkinReturnSession = saveCheckinSession();
  // 分支A携带穿搭图；分支B不带入图片
  var photoForForm = (checkinWizardMode === 'photo') ? checkinTempPhoto : '';
  checkinReturnSession.photo = photoForForm;
  checkinPendingReturn = true;
  closeSheet(true);
  currentTab = 'closet';
  render();
  requestAnimationFrame(function(){ openAddClothFromCheckin(photoForForm); });
}
function openAddClothFromCheckin(photo){
  var html = sheetHeader('添加衣物');
  html += '<div class="px-5 space-y-3">';
  html += '<div class="text-xs text-mute bg-paper rounded-lg p-2.5 leading-relaxed">来自打卡跳转 · V1 无 AI 预填，请手动填写全部字段（AI 自动预填为 V2 迭代）</div>';
  html += '<div id="add-area"></div>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  window._formPhoto = photo || '';
  var blankFromCheckin = { name:'', category:'', seasons:[], scenes:[], color:'', fabric:'', buyDate:'', price:'', photo:photo||'', status:'active' };
  renderClothForm(blankFromCheckin, false);
}
function isCheckinDirectManualPick(){
  // 分支B：手动挑选，不进入中间过渡页（step2 仅服务上传照片 AI 路径）
  return checkinWizardMode === 'manual' && checkinStep !== 2;
}
function returnToCheckinModal(didSave){
  checkinPendingReturn = false;
  if(checkinReturnSession) restoreCheckinSession(checkinReturnSession);
  checkinReturnSession = null;
  window._formPhoto = '';
  currentTab = 'today';
  render();
  if(checkinWizardMode === 'manual'){
    // 分支B：回落到衣橱挑选，不进入中间过渡页
    checkinStep = 1;
    renderCheckinSheet();
    openCheckinPickOverlay();
  } else {
    checkinStep = 2;
    renderCheckinSheet();
  }
  if(didSave) toast('衣物已入库，请继续打卡');
}

function wearCountLast30(clothId){
  var d = new Date(); d.setDate(d.getDate() - 30);
  var start = dateStr(d);
  return store.logs.filter(function(l){ return l.clothId === clothId && l.date >= start; }).length;
}
function lastWearDate(clothId){
  var logs = store.logs.filter(function(l){ return l.clothId === clothId; }).sort(function(a,b){ return a.date < b.date ? 1 : -1; });
  return logs.length ? logs[0].date : '';
}
function clothMatchesSearch(c, q){
  if(!q) return true;
  q = q.toLowerCase();
  var parts = [c.name, c.color, c.fabric, c.category].concat(c.seasons || [], c.scenes || []);
  return parts.join(' ').toLowerCase().indexOf(q) >= 0;
}
function getManualPickClothes(){
  var f = checkinManualFilter;
  var list = store.clothes.filter(function(c){
    if(c.status !== 'active') return false;
    if(f.category && c.category !== f.category) return false;
    if(f.color && c.color !== f.color) return false;
    if(f.season && (!c.seasons || c.seasons.indexOf(f.season) < 0)) return false;
    if(f.scene && (!c.scenes || c.scenes.indexOf(f.scene) < 0)) return false;
    if(!clothMatchesSearch(c, f.search)) return false;
    return true;
  });
  if(f.sort === 'lastWear'){
    list.sort(function(a,b){
      var da = lastWearDate(a.id), db = lastWearDate(b.id);
      if(!da && !db) return (b.createdAt || 0) - (a.createdAt || 0);
      if(!da) return 1;
      if(!db) return -1;
      return db < da ? -1 : (db > da ? 1 : 0);
    });
  } else if(f.sort === 'created'){
    list.sort(function(a,b){ return (b.createdAt || 0) - (a.createdAt || 0); });
  } else {
    list.sort(function(a,b){ return wearCountLast30(b.id) - wearCountLast30(a.id); });
  }
  return list;
}
function getCheckinChosenItems(){
  var chosen = [];
  checkinMatches.forEach(function(m){
    if(m.checked) chosen.push({ id:m.id, name:m.name, category:m.category, color:m.color, checked:true, source:'ai' });
  });
  Object.keys(checkinManualSelected).forEach(function(id){
    if(chosen.some(function(c){ return c.id === id; })) return;
    var m = checkinManualSelected[id];
    chosen.push({ id:m.id, name:m.name, category:m.category, color:m.color, checked:true, source:'manual' });
  });
  return chosen;
}
function isCheckinAiId(id){
  return checkinMatches.some(function(m){ return m.id === id && m.checked; });
}
function isCheckinPickedId(id){
  return isCheckinAiId(id) || !!checkinManualSelected[id];
}
function updateCheckinConfirmBtn(){
  var btn = $('#ck-confirm');
  if(!btn) return;
  var n = getCheckinChosenItems().length;
  btn.disabled = n < 1;
  btn.textContent = n < 1 ? '确认打卡（请至少勾选一件）' : '确认打卡';
}
function removeCheckinSelection(id){
  delete checkinManualSelected[id];
  checkinMatches.forEach(function(m){ if(m.id === id) m.checked = false; });
}
function renderCheckinChosenList(){
  var area = $('#ck-chosen-list');
  if(!area) return;
  var count = getCheckinChosenItems().length;
  var html = '<div class="text-sm text-ink/80 mb-3">当前已选择：<span class="font-semibold text-brand-dark">'+count+'</span> 件</div>';
  html += '<div class="space-y-2">';

  // 统一列表：AI 匹配（含未勾选，便于重选）+ 手动追加
  var aiItems = checkinWizardMode === 'photo' ? checkinMatches : [];
  aiItems.forEach(function(m, i){
    var c = findCloth(m.id);
    var rowBg = m.checked ? 'bg-brand-soft border-brand' : 'bg-white border-line';
    html += '<label class="flex items-center gap-3 rounded-xl border '+rowBg+' p-2.5 cursor-pointer">';
    html += '<input type="checkbox" class="ck-ai-pick w-5 h-5 accent-brand flex-shrink-0" data-i="'+i+'" '+(m.checked?'checked':'')+'/>';
    if(c&&c.photo) html += imgBox(c.photo, m.category, 'thumb', 1);
    else html += imgBox('', m.category, 'thumb', 1);
    html += '<div class="flex-1 min-w-0"><div class="text-sm truncate">'+esc(m.name)+'</div>';
    html += '<div class="text-xs text-mute truncate">'+esc(m.category||'')+' · '+esc(m.color||'')+'</div></div>';
    html += '<span class="ck-source-tag ck-source-ai">AI识别单品</span></label>';
  });

  var manualIds = Object.keys(checkinManualSelected).filter(function(id){
    return !checkinMatches.some(function(m){ return m.id === id && m.checked; });
  });
  manualIds.forEach(function(id){
    var m = checkinManualSelected[id];
    var c = findCloth(id);
    html += '<label class="flex items-center gap-3 rounded-xl border bg-brand-soft/70 border-brand p-2.5 cursor-pointer">';
    html += '<input type="checkbox" class="ck-manual-chosen w-5 h-5 accent-brand flex-shrink-0" data-id="'+esc(id)+'" checked/>';
    if(c&&c.photo) html += imgBox(c.photo, m.category, 'thumb', 1);
    else html += imgBox('', m.category, 'thumb', 1);
    html += '<div class="flex-1 min-w-0"><div class="text-sm truncate">'+esc(m.name)+'</div>';
    html += '<div class="text-xs text-mute truncate">'+esc(m.category||'')+' · '+esc(m.color||'')+'</div></div>';
    html += '<span class="ck-source-tag ck-source-manual">手动追加</span></label>';
  });

  html += '</div>';
  area.innerHTML = html;

  $all('.ck-ai-pick').forEach(function(cb){
    cb.addEventListener('change', function(){
      var m = checkinMatches[Number(cb.dataset.i)];
      if(!m) return;
      m.checked = cb.checked;
      if(cb.checked) delete checkinManualSelected[m.id];
      renderCheckinChosenList();
    });
  });
  $all('.ck-manual-chosen').forEach(function(cb){
    cb.addEventListener('change', function(){
      if(!cb.checked) removeCheckinSelection(cb.dataset.id);
      renderCheckinChosenList();
    });
  });
  updateCheckinConfirmBtn();
}
function refreshCheckinStep2Lists(){
  renderCheckinChosenList();
  var pickSheet = $('#ck-pick-sheet');
  if(pickSheet && !pickSheet.classList.contains('hidden')) renderCheckinManualList();
}

function renderCheckinManualList(){
  var listEl = $('#ck-manual-list');
  if(!listEl) return;
  var list = getManualPickClothes();
  if(!list.length){
    listEl.innerHTML = '<div class="text-center text-mute text-sm py-6">没有符合条件的在用衣物</div>';
    return;
  }
  var html = '<div class="space-y-2 ck-manual-list-scroll no-scrollbar">';
  list.forEach(function(c){
    var aiHit = isCheckinAiId(c.id);
    var sel = isCheckinPickedId(c.id);
    var wear30 = wearCountLast30(c.id);
    var last = lastWearDate(c.id);
    var rowBg = sel ? (aiHit ? 'bg-brand-soft border-brand' : 'bg-brand-soft/70 border-brand') : 'bg-white border-line';
    html += '<label class="flex items-center gap-3 rounded-xl border '+rowBg+' p-2.5 cursor-pointer">';
    html += '<input type="checkbox" class="ck-manual-pick w-5 h-5 accent-brand flex-shrink-0" data-id="'+c.id+'" '+(sel?'checked':'')+'/>';
    html += imgBox(c.photo, c.category, 'thumb', 1);
    html += '<div class="flex-1 min-w-0"><div class="flex items-center gap-1.5 min-w-0"><span class="text-sm truncate">'+esc(c.name)+'</span>';
    if(aiHit) html += '<span class="ck-source-tag ck-source-ai">AI</span>';
    else if(sel) html += '<span class="ck-source-tag ck-source-manual">手动</span>';
    html += '</div>';
    html += '<div class="text-xs text-mute truncate">'+esc(c.category||'')+' · '+esc(c.color||'')+' · 近30天 '+wear30+' 次';
    if(last) html += ' · 上次 '+esc(last);
    html += '</div></div></label>';
  });
  html += '</div>';
  listEl.innerHTML = html;
  $all('.ck-manual-pick').forEach(function(cb){
    cb.addEventListener('change', function(){
      var id = cb.dataset.id;
      var c = findCloth(id);
      if(!c) return;
      var inAi = checkinMatches.some(function(m){ return m.id === id; });
      if(cb.checked){
        if(inAi){
          checkinMatches.forEach(function(m){ if(m.id === id) m.checked = true; });
          delete checkinManualSelected[id];
        } else {
          checkinManualSelected[id] = { id:c.id, name:c.name, category:c.category, color:c.color, checked:true };
        }
      } else {
        removeCheckinSelection(id);
      }
      renderCheckinManualList();
    });
  });
}
function bindCheckinManualControls(){
  var searchEl = $('#ck-manual-search');
  if(searchEl){
    searchEl.value = checkinManualFilter.search;
    searchEl.addEventListener('input', function(){
      checkinManualFilter.search = this.value.trim();
      renderCheckinManualList();
    });
  }
  var bindSel = function(id, key){
    var el = $('#'+id);
    if(!el) return;
    el.value = checkinManualFilter[key];
    el.addEventListener('change', function(){
      checkinManualFilter[key] = this.value;
      renderCheckinManualList();
    });
  };
  bindSel('ck-filter-cat', 'category');
  bindSel('ck-filter-color', 'color');
  bindSel('ck-filter-season', 'season');
  bindSel('ck-filter-scene', 'scene');
  $all('.ck-sort-btn').forEach(function(b){
    b.addEventListener('click', function(){
      checkinManualFilter.sort = b.dataset.sort;
      $all('.ck-sort-btn').forEach(function(x){
        var on = x.dataset.sort === checkinManualFilter.sort;
        x.classList.toggle('bg-brand', on); x.classList.toggle('text-white', on); x.classList.toggle('border-brand', on);
        x.classList.toggle('bg-white', !on); x.classList.toggle('border-line', !on); x.classList.toggle('text-ink', !on);
      });
      renderCheckinManualList();
    });
  });
}

function closeCheckinPickOverlay(){
  var mask = $('#ck-pick-mask'), sheet = $('#ck-pick-sheet');
  if(mask) mask.classList.add('hidden');
  if(sheet){ sheet.classList.add('hidden'); sheet.innerHTML = ''; }
  renderCheckinChosenList();
}
function onCheckinPickDone(){
  // 分支B：完成即打卡；分支A：同步回中间过渡页
  if(isCheckinDirectManualPick()){
    confirmCheckin();
    return;
  }
  closeCheckinPickOverlay();
}
function openCheckinPickOverlay(){
  var mask = $('#ck-pick-mask'), sheet = $('#ck-pick-sheet');
  if(!mask || !sheet) return;
  var directManual = isCheckinDirectManualPick();
  var html = '<div class="sticky top-0 bg-paper pt-4 pb-2 px-5 flex items-center justify-between z-10 border-b border-line">';
  html += '<div class="text-base font-semibold">从衣橱挑选</div>';
  html += '<button type="button" id="ck-pick-done" class="text-sm text-brand-dark font-medium px-2 py-1">完成</button></div>';
  html += '<div class="px-5 py-3 space-y-3">';
  html += checkinFiltersSortHtml();
  html += '<div id="ck-manual-list"></div>';
  html += '<div class="text-xs text-mute text-center pt-1">'+(directManual?'勾选后点「完成」直接打卡':'勾选后点「完成」同步到打卡页')+'</div>';
  html += '</div>';
  sheet.innerHTML = html;
  mask.classList.remove('hidden');
  sheet.classList.remove('hidden');
  bindCheckinManualControls();
  renderCheckinManualList();
  var done = $('#ck-pick-done');
  if(done) done.addEventListener('click', onCheckinPickDone);
  mask.onclick = function(){ closeCheckinPickOverlay(); };
}

function checkinStep2Header(title){
  return '<div class="sticky top-0 bg-paper pt-4 pb-2 px-5 flex items-center gap-2 z-10 border-b border-line">'
    + '<button type="button" id="ck-step-back" class="text-mute p-1 flex-shrink-0" aria-label="返回上一步">'
    + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>'
    + '<div class="text-base font-semibold flex-1 text-center pr-7">'+esc(title)+'</div>'
    + '<button type="button" class="close-sheet text-mute p-1 flex-shrink-0" aria-label="关闭">'
    + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
}

function checkinFiltersSortHtml(){
  var html = '';
  html += '<input id="ck-manual-search" type="search" class="w-full bg-white rounded-xl border border-line px-3 py-2.5 text-sm" placeholder="搜索名称、标签、面料、颜色…" value="'+esc(checkinManualFilter.search)+'" />';
  html += '<div class="grid grid-cols-2 gap-2">';
  html += '<select id="ck-filter-cat" class="bg-white rounded-xl border border-line px-2.5 py-2 text-sm"><option value="">全部品类</option>';
  CATEGORIES.forEach(function(c){ html += '<option value="'+c+'" '+(checkinManualFilter.category===c?'selected':'')+'>'+c+'</option>'; });
  html += '</select>';
  html += '<select id="ck-filter-color" class="bg-white rounded-xl border border-line px-2.5 py-2 text-sm"><option value="">全部颜色</option>';
  COLORS.forEach(function(c){ html += '<option value="'+c+'" '+(checkinManualFilter.color===c?'selected':'')+'>'+c+'</option>'; });
  html += '</select>';
  html += '<select id="ck-filter-season" class="bg-white rounded-xl border border-line px-2.5 py-2 text-sm"><option value="">全部季节</option>';
  SEASONS.forEach(function(s){ html += '<option value="'+s+'" '+(checkinManualFilter.season===s?'selected':'')+'>'+s+'</option>'; });
  html += '</select>';
  var sceneOpts = SCENE_TAGS.concat(store.customScenes);
  html += '<select id="ck-filter-scene" class="bg-white rounded-xl border border-line px-2.5 py-2 text-sm"><option value="">全部标签</option>';
  sceneOpts.forEach(function(s){ html += '<option value="'+esc(s)+'" '+(checkinManualFilter.scene===s?'selected':'')+'>'+esc(s)+'</option>'; });
  html += '</select></div>';
  html += '<div><div class="text-xs text-mute mb-1.5">排序</div><div class="flex flex-wrap gap-2">';
  [['wear30','近30天穿着↓'],['lastWear','上次穿着↓'],['created','录入时间↓']].forEach(function(o){
    var on = checkinManualFilter.sort === o[0];
    html += '<button type="button" class="ck-sort-btn text-xs px-3 py-1.5 rounded-full border '+(on?'bg-brand text-white border-brand':'bg-white border-line text-ink')+'" data-sort="'+o[0]+'">'+o[1]+'</button>';
  });
  html += '</div></div>';
  return html;
}

function applyAiMatchToSelection(){
  // V1：穿搭图已上传 R2；此处仅模拟匹配并自动勾选（不写入手动集合，便于区分来源）
  checkinMatches = simulateMatch();
  checkinMatches.forEach(function(m){
    m.checked = true;
    delete checkinManualSelected[m.id];
  });
}

function renderCheckinStep1(){
  var hasPhoto = !!(checkinTempPhoto || checkinPhoto);
  var html = sheetHeader('打卡今日穿搭');
  html += '<div class="px-5 space-y-4">';
  html += '<div id="ck-photo-area">';
  if(hasPhoto){
    html += photoImgHtml(checkinTempPhoto || checkinPhoto, 'form-cloth-photo');
    html += '<label class="block mt-3 text-center"><input id="ck-file" type="file" accept="image/*" class="hidden" />';
    html += '<span class="text-xs text-brand-dark">重新选择照片</span></label>';
  } else {
    html += '<label class="block"><input id="ck-file" type="file" accept="image/*" class="hidden" />';
    html += '<div class="ck-upload-zone">';
    html += '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="mx-auto mb-2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    html += '<div class="font-medium text-ink/80 mb-1">拍摄或从相册选择穿搭照片</div>';
    html += '<div class="text-xs">支持相机拍摄 / 相册选择</div></div></label>';
  }
  html += '</div>';
  html += '<button id="ck-upload-next" type="button" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium ck-confirm-btn" '+(hasPhoto?'':'disabled')+'>上传照片</button>';
  html += '<button id="ck-skip-photo" type="button" class="ck-step-link">暂时不上传照片，直接手动选择衣物</button>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  var fileInput = $('#ck-file');
  if(fileInput) fileInput.addEventListener('change', onCheckinStep1Photo);
  var nextBtn = $('#ck-upload-next');
  if(nextBtn) nextBtn.addEventListener('click', function(){
    if(window._checkinPhotoUploading){ toast('图片仍在上传，请稍候'); return; }
    if(!(checkinTempPhoto || checkinPhoto)){ toast('请先选择照片'); return; }
    checkinWizardMode = 'photo';
    checkinManualSelected = {};
    checkinMatches = [];
    applyAiMatchToSelection();
    checkinStep = 2;
    renderCheckinSheet();
  });
  var skipBtn = $('#ck-skip-photo');
  if(skipBtn) skipBtn.addEventListener('click', function(){
    checkinWizardMode = 'manual';
    checkinPhoto = '';
    checkinTempPhoto = '';
    checkinMatches = [];
    checkinManualSelected = {};
    checkinStep = 1; // 分支B不进入 step2 过渡页
    openCheckinPickOverlay();
  });
}

function onCheckinStep1Photo(e){
  var file = e.target.files[0]; if(!file) return;
  var localUrl = URL.createObjectURL(file);
  checkinPhoto = localUrl;
  checkinTempPhoto = localUrl;
  window._checkinPhotoUploading = true;
  renderCheckinStep1();
  toast('图片上传中…');
  uploadImage(file).then(function(publicUrl){
    commitCheckinPhoto(publicUrl);
    window._checkinPhotoUploading = false;
    toast('图片已上传');
    renderCheckinStep1();
  }).catch(function(err){
    window._checkinPhotoUploading = false;
    checkinPhoto = '';
    checkinTempPhoto = '';
    toast('图片上传失败：'+(err.message||err));
    renderCheckinStep1();
  });
}

function renderCheckinStep2(){
  var isPhoto = checkinWizardMode === 'photo';
  var photo = checkinTempPhoto || checkinPhoto;
  var html = checkinStep2Header('打卡今日穿搭');
  html += '<div class="px-5 space-y-4">';

  // 顶部穿搭照片预览
  if(isPhoto && photo){
    html += '<div class="space-y-2">';
    html += photoImgHtml(photo, 'form-cloth-photo');
    html += '<label class="block text-center"><input id="ck-change-photo" type="file" accept="image/*" class="hidden" />';
    html += '<span class="text-xs text-brand-dark">更换照片</span></label>';
    html += '</div>';
  } else {
    html += '<div class="text-sm text-ink/80 bg-brand-soft/50 rounded-xl px-3 py-2.5">手动选择今日穿着衣物</div>';
  }

  // 统一勾选列表
  html += '<div id="ck-chosen-list"></div>';

  // 横向等宽并排：从衣橱挑选 / 去添加
  html += '<div class="grid grid-cols-2 gap-2">';
  html += '<button id="ck-open-pick" type="button" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium text-brand-dark leading-snug">从衣橱挑选更多衣物</button>';
  html += '<button id="ck-go-add" type="button" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium text-brand-dark leading-snug">没有这件衣服，去添加</button>';
  html += '</div>';
  html += '<button id="ck-confirm" type="button" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium ck-confirm-btn" disabled>确认打卡（请至少勾选一件）</button>';
  html += '<div class="text-xs text-mute text-center">确认后将写入每件衣物穿着日志 · 穿搭图已上传云端</div>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  closeCheckinPickOverlay();

  var backBtn = $('#ck-step-back');
  if(backBtn) backBtn.addEventListener('click', function(){
    closeCheckinPickOverlay();
    checkinMatches = [];
    checkinManualSelected = {};
    if(checkinWizardMode === 'manual'){
      checkinPhoto = '';
      checkinTempPhoto = '';
    }
    checkinWizardMode = 'photo';
    checkinStep = 1;
    renderCheckinSheet();
  });

  var changePhoto = $('#ck-change-photo');
  if(changePhoto) changePhoto.addEventListener('change', onCheckinStep2ChangePhoto);

  renderCheckinChosenList();

  var openPick = $('#ck-open-pick');
  if(openPick) openPick.addEventListener('click', openCheckinPickOverlay);
  var confirmBtn = $('#ck-confirm');
  if(confirmBtn) confirmBtn.addEventListener('click', confirmCheckin);
  var goAddBtn = $('#ck-go-add');
  if(goAddBtn) goAddBtn.addEventListener('click', function(){
    closeCheckinPickOverlay();
    navigateCheckinToAddCloth();
  });
}

function onCheckinStep2ChangePhoto(e){
  var file = e.target.files[0]; if(!file) return;
  var localUrl = URL.createObjectURL(file);
  checkinPhoto = localUrl;
  checkinTempPhoto = localUrl;
  checkinWizardMode = 'photo';
  window._checkinPhotoUploading = true;
  renderCheckinSheet();
  toast('图片上传中…');
  uploadImage(file).then(function(publicUrl){
    commitCheckinPhoto(publicUrl);
    window._checkinPhotoUploading = false;
    applyAiMatchToSelection();
    toast('图片已上传');
    renderCheckinSheet();
  }).catch(function(err){
    window._checkinPhotoUploading = false;
    toast('图片上传失败：'+(err.message||err));
    renderCheckinSheet();
  });
}

function renderCheckinSheet(){
  if(checkinStep === 2) renderCheckinStep2();
  else renderCheckinStep1();
}
function openCheckin(){
  checkinPendingReturn = false;
  checkinReturnSession = null;
  resetCheckinTempState();
  renderCheckinSheet();
}
function simulateMatch(){
  var active = store.clothes.filter(function(c){return c.status==='active';});
  if(!active.length) return [];
  // V1仅UI占位，真实AI识图为V2迭代功能
  var n = Math.min(active.length, 2 + Math.floor(Math.random()*3));
  var pool = active.slice().sort(function(){return Math.random()-0.5;}).slice(0,n);
  return pool.map(function(c){ return { id:c.id, name:c.name, category:c.category, color:c.color, checked:false }; });
}

function showClothNotRegisteredPrompt(missingNames){
  var html = sheetHeader('该衣物尚未录入衣橱');
  html += '<div class="px-5 space-y-4">';
  html += '<p class="text-sm leading-relaxed text-mute">当前选中的衣物在你的衣橱中没有找到，是否前往衣橱新建页面？</p>';
  if(missingNames && missingNames.length){
    html += '<div class="bg-warn/10 rounded-xl p-3 text-xs text-mute space-y-1">';
    missingNames.forEach(function(n){ html += '<div>· '+esc(n)+'</div>'; });
    html += '</div>';
  }
  html += '<button id="go-add-cloth" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium">去新建衣物</button>';
  html += '<button id="stay-checkin-edit" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium">返回修改</button>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $('#stay-checkin-edit').addEventListener('click', function(){
    if(checkinWizardMode === 'manual'){
      checkinStep = 1;
      renderCheckinSheet();
      openCheckinPickOverlay();
    } else {
      checkinStep = 2;
      renderCheckinSheet();
    }
  });
  $('#go-add-cloth').addEventListener('click', navigateCheckinToAddCloth);
}

function submitCheckin(resolvedItems, photo){
  photo = normalizePublicUrl(photo);
  var date = todayStr();
  var w = store.weather;
  var dayW = todayViewDay === 0 ? w.today : w.tomorrow;
  var prevCheckins = clone(store.checkins);
  var prevLogs = clone(store.logs);
  resolvedItems.forEach(function(m){ appendWearLog(m.id, date, 'checkin'); });
  var existing = findCheckin(date);
  var checkin = {
    id: existing ? existing.id : uid(),
    date: date,
    photo: photo || '',
    weather: { city:w.city, temp:dayW.temp, cond:dayW.cond, desc:dayW.desc },
    moodEmoji: todayEmoji,
    moodNote: todayMoodNote,
    mood: todayEmoji || (existing ? existing.mood : ''),
    note: todayMoodNote || (existing ? existing.note : ''),
    profileSnapshot: clone(store.profile),
    items: resolvedItems.slice()
  };
  if(existing && existing.moodIntensity != null) checkin.moodIntensity = existing.moodIntensity;
  upsertCheckinByDate(checkin);
  showLoading('同步打卡…');
  persistCheckinsAndLogs().then(function(){
    hideLoading();
    closeSheet();
    render();
    toast('打卡成功');
  }).catch(function(err){
    store.checkins = prevCheckins;
    store.logs = prevLogs;
    hideLoading();
    toast('打卡保存失败：'+(err.message||err));
  });
}

function confirmCheckin(){
  if(window._checkinPhotoUploading){ toast('图片仍在上传，请稍候'); return; }
  var chosen = getCheckinChosenItems();
  if(!chosen.length){ toast('请勾选至少一件衣物'); return; }
  // 复用 resolveClothInWardrobe / clothSimilarity（阈值 ≥35）校验勾选衣物是否在衣橱中
  var validation = validateCheckinItems(chosen);
  if(validation.missing.length){
    closeCheckinPickOverlay();
    showClothNotRegisteredPrompt(validation.missing);
    return;
  }
  var photoToSave = (checkinWizardMode === 'photo') ? normalizePublicUrl(checkinTempPhoto || checkinPhoto) : '';
  if(photoToSave && photoToSave.indexOf('blob:') === 0){
    toast('图片仍在上传，请稍候');
    return;
  }
  submitCheckin(validation.resolved, photoToSave);
}

/* ---------- 今日：穿搭推荐 ---------- */
function openRecommend(){
  var day = todayViewDay===0 ? store.weather.today : store.weather.tomorrow;
  var p = store.profile;
  var active = store.clothes.filter(function(c){return c.status==='active';});
  var html = sheetHeader('今日穿搭推荐');
  html += '<div class="px-5 space-y-4">';
  if(active.length < 2){
    html += '<div class="text-center text-mute text-sm py-8">衣橱里衣物太少，先去添加几件再来推荐</div>';
    html += '<div class="h-2"></div></div>';
    openSheet(html); return;
  }
  var suits = genRecommend(day, p, active, 3);
  suits.forEach(function(s, i){
    html += '<div class="bg-white rounded-2xl border border-line p-4 space-y-3">';
    html += '<div class="flex items-center justify-between"><div class="text-sm font-medium">方案 '+(i+1)+' · '+esc(s.title)+'</div>';
    html += '<button class="wear-this text-xs bg-brand text-white rounded-full px-3 py-1" data-i="'+i+'">今日就穿这套</button></div>';
    html += '<div class="text-xs text-mute leading-relaxed">'+esc(s.reason)+'</div>';
    html += '<div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">';
    s.items.forEach(function(it){
      html += '<div class="flex-shrink-0 w-20 text-center">';
      if(it.photo) html += imgBox(it.photo, it.category, 'rec', 2);
      else html += imgBox('', it.category, 'rec', 2);
      html += '<div class="text-[11px] mt-1 truncate">'+esc(it.name)+'</div></div>';
    });
    html += '</div></div>';
  });
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $all('.wear-this').forEach(function(b){ b.addEventListener('click', function(){
    var s = suits[Number(b.dataset.i)];
    var validation = validateCheckinItems(s.items.map(function(it){ return { id:it.id, name:it.name, category:it.category, color:it.color }; }));
    if(validation.missing.length){
      showClothNotRegisteredPrompt(validation.missing);
      return;
    }
    var date = todayStr();
    var w = store.weather; var dayW = todayViewDay===0?w.today:w.tomorrow;
    validation.resolved.forEach(function(it){ appendWearLog(it.id, date, 'recommend'); });
    var existing = findCheckin(date);
    var checkin = {
      id: existing?existing.id:uid(), date:date, photo:'',
      weather:{ city:w.city, temp:dayW.temp, cond:dayW.cond, desc:dayW.desc },
      moodEmoji: todayEmoji,
      moodNote: todayMoodNote,
      mood: todayEmoji||(existing?existing.mood:''),
      note: todayMoodNote||(existing?existing.note:''),
      profileSnapshot: clone(p),
      items: validation.resolved.slice()
    };
    if(existing && existing.moodIntensity != null) checkin.moodIntensity = existing.moodIntensity;
    upsertCheckinByDate(checkin);
    showLoading('同步打卡…');
    persistCheckinsAndLogs().then(function(){
      hideLoading();
      closeSheet();
      render();
      toast('已生成今日打卡');
    }).catch(function(err){
      hideLoading();
      toast('打卡保存失败：'+(err.message||err));
    });
  }); });
}

function genRecommend(day, p, active, n){
  var suits = [];
  // 按季节/温度粗筛
  var season = day.temp<=10?'冬':(day.temp<=18?'秋':(day.temp<=26?'春':'夏'));
  var pool = active.filter(function(c){ return !c.seasons || c.seasons.length===0 || c.seasons.indexOf(season)>=0; });
  if(pool.length<2) pool = active;

  var byCat = {};
  pool.forEach(function(c){ (byCat[c.category]=byCat[c.category]||[]).push(c); });

  var titles = ['清爽通勤','随性休闲','精致出门'];
  for(var i=0;i<n;i++){
    var top = pickByCat(byCat, ['上衣','外套','连衣裙','衬衫']);
    var bottom = pickByCat(byCat, ['裤装','裙装','连衣裙']);
    var shoe = pickByCat(byCat, ['鞋']);
    var acc = pickByCat(byCat, ['包','配饰']);
    var items = [];
    if(top) items.push(top);
    if(bottom && bottom.category!==top.category) items.push(bottom);
    if(shoe) items.push(shoe);
    if(acc) items.push(acc);
    if(items.length<2) continue;
    var reason = '根据今日 '+day.temp+'°'+day.cond+'，搭配以'+(season==='夏'?'清凉透气':(season==='冬'?'保暖实穿':'舒适叠穿'))+'为主';
    if(p.idealStyles&&p.idealStyles.length) reason += '，融入你向往的「'+p.idealStyles.join('、')+'」风格';
    else if(p.prefStyles&&p.prefStyles.length) reason += '，贴合你偏好的「'+p.prefStyles.join('、')+'」';
    if(p.mbti) reason += '。'+p.mbti+' 型的你，这套兼顾得体与自在';
    suits.push({ title:titles[i]||('方案 '+(i+1)), reason:reason, items:items });
  }
  return suits;
}
function pickByCat(byCat, cats){
  for(var i=0;i<cats.length;i++){ var arr=byCat[cats[i]]; if(arr&&arr.length){ var idx=Math.floor(Math.random()*arr.length); return arr[idx]; } }
  return null;
}

/* ---------- 今日：历史回溯 ---------- */
var historyDateFilter = '';
var historyShowAll = false;

function sortedCheckins(){
  return store.checkins.slice().sort(function(a,b){
    if(a.date !== b.date) return a.date < b.date ? 1 : -1;
    var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

function filteredHistoryCheckins(){
  var list = sortedCheckins();
  if(historyShowAll || !historyDateFilter) return list;
  return list.filter(function(c){ return c.date === historyDateFilter; });
}

function historyListHtml(){
  var list = filteredHistoryCheckins();
  var html = '';
  if(!store.checkins.length){
    html += '<div class="text-center text-mute text-sm py-8">还没有历史打卡记录</div>';
  } else if(!list.length){
    html += '<div class="text-center text-mute text-sm py-8">该日期暂无穿搭记录</div>';
  } else {
    list.forEach(function(c){
      html += '<div class="history-swipe-row" data-checkin-id="'+esc(c.id)+'">';
      html += '<div class="history-swipe-actions"><button type="button" class="history-swipe-delete" data-checkin-id="'+esc(c.id)+'">删除</button></div>';
      html += '<button type="button" class="history-swipe-content checkin-history-item" data-checkin-id="'+esc(c.id)+'" data-checkin-date="'+esc(c.date)+'">'+checkinCard(c)+'</button>';
      html += '</div>';
    });
  }
  return html;
}

function refreshHistoryList(){
  var wrap = $('#history-list-wrap');
  var hint = $('#history-date-hint');
  var allBtn = $('#history-show-all');
  if(wrap) wrap.innerHTML = historyListHtml();
  if(hint){
    var emptyDay = !historyShowAll && historyDateFilter && filteredHistoryCheckins().length === 0 && store.checkins.length > 0;
    hint.classList.toggle('hidden', !emptyDay);
  }
  if(allBtn) allBtn.classList.toggle('on', !!historyShowAll);
  bindHistoryListInteractions();
}

function closeAllHistorySwipes(exceptRow){
  $all('.history-swipe-content').forEach(function(el){
    if(exceptRow && exceptRow.contains(el)) return;
    el.style.transform = '';
    el.classList.remove('open');
  });
}

function bindHistorySwipe(row){
  var content = row.querySelector('.history-swipe-content');
  if(!content) return;
  var startX = 0, startY = 0, dx = 0, tracking = false, horizontal = null;
  var opened = false;
  var threshold = 56;
  var maxSlide = 72;

  function setOpen(on){
    opened = on;
    content.classList.toggle('open', on);
    content.style.transform = on ? 'translateX(-'+maxSlide+'px)' : '';
  }

  content.addEventListener('touchstart', function(e){
    if(!e.touches || !e.touches[0]) return;
    closeAllHistorySwipes(row);
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    tracking = true;
    horizontal = null;
    content.style.transition = 'none';
  }, { passive:true });

  content.addEventListener('touchmove', function(e){
    if(!tracking || !e.touches || !e.touches[0]) return;
    var x = e.touches[0].clientX;
    var y = e.touches[0].clientY;
    var adx = Math.abs(x - startX);
    var ady = Math.abs(y - startY);
    if(horizontal == null && (adx > 6 || ady > 6)){
      horizontal = adx > ady;
    }
    if(!horizontal) return;
    dx = x - startX;
    var tx = opened ? -maxSlide + dx : dx;
    if(tx > 0) tx = 0;
    if(tx < -maxSlide) tx = -maxSlide;
    content.style.transform = 'translateX('+tx+'px)';
  }, { passive:true });

  content.addEventListener('touchend', function(){
    if(!tracking) return;
    tracking = false;
    content.style.transition = '';
    if(!horizontal){ dx = 0; return; }
    var current = opened ? -maxSlide + dx : dx;
    setOpen(current < -threshold);
    dx = 0;
    horizontal = null;
  });

  content.addEventListener('click', function(e){
    if(opened){
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    openCheckinDetail(content.dataset.checkinId);
  });
}

function bindHistoryListInteractions(){
  $all('.history-swipe-row').forEach(function(row){ bindHistorySwipe(row); });
  $all('.history-swipe-delete').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      deleteCheckinById(btn.dataset.checkinId);
    });
  });
}

function deleteCheckinById(id){
  if(!id) return;
  var target = store.checkins.filter(function(c){ return c.id === id; })[0];
  if(!target) return;
  if(!confirm('确定删除这条穿搭日记吗？删除后将同步到云端。')) return;
  var prevCheckins = clone(store.checkins);
  var prevLogs = clone(store.logs);
  store.checkins = store.checkins.filter(function(c){ return c.id !== id; });
  // 同步移除同日、同衣物、来自打卡/推荐的穿着日志，避免穿着次数虚高
  if(target.items && target.items.length){
    var ids = {};
    target.items.forEach(function(it){ if(it && it.id) ids[it.id] = true; });
    store.logs = store.logs.filter(function(l){
      if(l.date !== target.date) return true;
      if(!ids[l.clothId]) return true;
      if(l.source === 'checkin' || l.source === 'recommend') return false;
      return true;
    });
  }
  showLoading('删除中…');
  Promise.all([persistCheckins(), persistLogs()]).then(function(){
    hideLoading();
    toast('已删除');
    refreshHistoryList();
    if(typeof render === 'function' && currentTab === 'today') render();
  }).catch(function(err){
    store.checkins = prevCheckins;
    store.logs = prevLogs;
    hideLoading();
    toast('删除失败：'+(err.message||err));
    refreshHistoryList();
  });
}

function openHistory(){
  historyShowAll = false;
  historyDateFilter = todayStr();
  var html = '<div class="sticky top-0 bg-paper pt-4 pb-2 px-5 z-10 border-b border-line">';
  html += '<div class="flex items-center gap-2 min-w-0">';
  html += '<div class="text-base font-semibold shrink-0 whitespace-nowrap">穿搭日记回溯</div>';
  html += '<input type="date" id="history-date-picker" class="flex-1 min-w-0 max-w-[9.5rem] text-xs border border-line rounded-lg px-2 py-1 bg-white text-ink" value="'+esc(historyDateFilter)+'" aria-label="选择日期">';
  html += '<button type="button" id="history-show-all" class="history-all-btn">全部</button>';
  html += '<button type="button" class="close-sheet text-mute p-1 shrink-0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
  html += '</div>';
  html += '<div id="history-date-hint" class="hidden text-xs text-mute text-center pt-2 pb-0.5 opacity-80">该日期暂无穿搭记录</div>';
  html += '</div>';
  html += '<div id="history-list-wrap" class="px-5 space-y-3">'+historyListHtml()+'</div>';
  html += '<div class="h-2"></div>';
  openSheet(html);
  bindHistoryListInteractions();
  refreshHistoryList();

  var picker = $('#history-date-picker');
  var allBtn = $('#history-show-all');
  if(picker) picker.addEventListener('change', function(){
    historyDateFilter = picker.value || todayStr();
    historyShowAll = false;
    refreshHistoryList();
  });
  if(allBtn) allBtn.addEventListener('click', function(){
    historyShowAll = true;
    historyDateFilter = '';
    if(picker) picker.value = '';
    refreshHistoryList();
  });
}

/* ============================================================
   视图：衣橱
   ============================================================ */
var closetMode = 'active'; // active | retired
var closetSearch = '';
var closetFilterCat = '';
var closetSort = 'buyDateDesc'; // 保留兼容，首页概览不再使用精细排序
var closetListCat = ''; // 非空 = 处于品类独立列表页
var closetListSort = 'buyDateDesc'; // 列表页独立排序，与首页互不干扰

var CLOSET_SORT_GROUPS = [
  ['购买时间','buyDateDesc','buyDateAsc'],
  ['价格','priceDesc','priceAsc'],
  ['穿着次数','wearDesc','wearAsc'],
  ['单次穿着成本','costDesc','costAsc']
];

function closetSortUnitHtml(label, descKey, ascKey, activeSort){
  var cur = activeSort == null ? closetSort : activeSort;
  var html = '<div class="closet-sort-unit">';
  html += '<span class="closet-sort-label">'+esc(label)+'</span>';
  html += '<button type="button" class="closet-sort-arrow'+(cur===descKey?' closet-sort-arrow-active':'')+'" data-sort="'+descKey+'" aria-label="'+esc(label)+'降序">↑</button>';
  html += '<button type="button" class="closet-sort-arrow'+(cur===ascKey?' closet-sort-arrow-active':'')+'" data-sort="'+ascKey+'" aria-label="'+esc(label)+'升序">↓</button>';
  html += '</div>';
  return html;
}

function closetPerWearCost(c){
  var w = wearCountOf(c.id);
  if(!w || c.price == null || c.price === '') return null;
  return Number(c.price) / w;
}
function sortClosetClothes(list, sortKey){
  var sort = sortKey || closetSort;
  var noWear = [], rest = [];
  list.forEach(function(c){
    if(wearCountOf(c.id) === 0) noWear.push(c);
    else rest.push(c);
  });
  function cmpBuyDate(a, b, asc){
    var da = a.buyDate || '', db = b.buyDate || '';
    if(!da && !db) return 0;
    if(!da) return 1;
    if(!db) return -1;
    return asc ? (da < db ? -1 : da > db ? 1 : 0) : (da > db ? -1 : da < db ? 1 : 0);
  }
  function cmpPrice(a, b, asc){
    var pa = (a.price != null && a.price !== '') ? Number(a.price) : null;
    var pb = (b.price != null && b.price !== '') ? Number(b.price) : null;
    if(pa == null && pb == null) return 0;
    if(pa == null) return 1;
    if(pb == null) return -1;
    return asc ? pa - pb : pb - pa;
  }
  function cmpWear(a, b, asc){
    return asc ? wearCountOf(a.id) - wearCountOf(b.id) : wearCountOf(b.id) - wearCountOf(a.id);
  }
  function cmpCost(a, b, asc){
    var ca = closetPerWearCost(a), cb = closetPerWearCost(b);
    if(ca == null && cb == null) return 0;
    if(ca == null) return 1;
    if(cb == null) return -1;
    return asc ? ca - cb : cb - ca;
  }
  if(sort === 'buyDateDesc' || sort === 'buyDateAsc'){
    var asc = sort === 'buyDateAsc';
    return list.slice().sort(function(a,b){ return cmpBuyDate(a,b,asc); });
  }
  if(sort === 'priceDesc' || sort === 'priceAsc'){
    var ascP = sort === 'priceAsc';
    return list.slice().sort(function(a,b){ return cmpPrice(a,b,ascP); });
  }
  if(sort === 'wearDesc' || sort === 'wearAsc'){
    rest.sort(function(a,b){ return cmpWear(a,b, sort === 'wearAsc'); });
    return rest.concat(noWear);
  }
  if(sort === 'costDesc' || sort === 'costAsc'){
    // V1：单次穿着成本；AI 图片识别为 V2 迭代
    rest.sort(function(a,b){ return cmpCost(a,b, sort === 'costAsc'); });
    return rest.concat(noWear);
  }
  return list;
}

function closetPageTitle(){
  var name = (store.profile && store.profile.name) ? String(store.profile.name).trim() : '';
  return name ? (esc(name) + '的衣橱') : '我的衣橱';
}

/* 固定品类顺序卡片：受在用/淘汰、搜索、首页品类下拉影响；不做精细排序 */
function clothCategoryBucket(c){
  var cat = c.category || '其他';
  return CATEGORIES.indexOf(cat) >= 0 ? cat : '其他';
}

function clothesInCategory(cat, opts){
  opts = opts || {};
  var applySearch = opts.applySearch !== false;
  var q = applySearch ? (closetSearch || '').toLowerCase() : '';
  var list = store.clothes.filter(function(c){
    if(closetMode==='active' && c.status!=='active') return false;
    if(closetMode==='retired' && c.status!=='retired') return false;
    if(q && String(c.name||'').toLowerCase().indexOf(q)<0) return false;
    if(clothCategoryBucket(c) !== cat) return false;
    return true;
  });
  if(opts.sortKey) return sortClosetClothes(list, opts.sortKey);
  return list;
}

function closetCategoryCardsToRender(){
  if(closetFilterCat) return [closetFilterCat];
  return CATEGORIES.slice();
}

function closetCategoryCardHtml(cat){
  var items = clothesInCategory(cat); // 首页概览：不套用精细排序
  var html = '<div class="closet-cat-card" data-cat="'+esc(cat)+'">';
  html += '<div class="closet-cat-head">';
  html += '<div class="closet-cat-title">'+esc(cat)+' · '+items.length+'个</div>';
  html += '<button type="button" class="closet-cat-action cat-card-action" data-cat="'+esc(cat)+'" aria-label="查看'+esc(cat)+'列表">';
  html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
  html += '</button></div>';
  html += '<div class="closet-cat-scroller">';
  if(!items.length){
    html += '<button type="button" class="closet-cat-empty cat-add-placeholder" data-cat="'+esc(cat)+'" aria-label="添加'+esc(cat)+'">';
    html += '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
    html += '</button>';
  } else {
    items.forEach(function(c){
      html += '<div class="closet-cat-thumb cloth-row" data-id="'+c.id+'">';
      if(c.photo) html += imgBox(c.photo, c.category, 'cat', 2);
      else html += imgBox('', c.category, 'cat', 2);
      html += '</div>';
    });
  }
  html += '</div></div>';
  return html;
}

function clothListRowHtml(c){
  var wearCount = wearCountOf(c.id);
  var html = '<div class="cloth-row bg-white rounded-2xl border border-line p-3 flex items-center gap-3" data-id="'+c.id+'">';
  if(c.photo) html += imgBox(c.photo, c.category, 'list', 2);
  else html += imgBox('', c.category, 'list', 2);
  html += '<div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">'+esc(c.name)+'</div>';
  html += '<div class="text-xs text-mute truncate">'+esc(c.color||'')+' · '+(wearCount===0?'未穿着':('穿过 '+wearCount+' 次'));
  if(c.price != null && c.price !== '') html += ' · '+fmtMoney(c.price);
  html += '</div></div>';
  if(c.status==='retired') html += '<span class="text-[10px] text-bad bg-bad/10 rounded-full px-2 py-0.5">已淘汰</span>';
  html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-mute"><path d="M9 18l6-6-6-6"/></svg>';
  html += '</div>';
  return html;
}

/* 品类独立列表页：精细排序仅在此页生效 */
function viewClosetCategoryList(cat){
  var list = clothesInCategory(cat, { applySearch:false, sortKey:closetListSort });
  var html = '';
  html += '<div class="page-shell px-5 pt-6" style="padding-top:var(--page-pad-top)">';
  html += '<div class="flex items-center justify-between mb-4 gap-2">';
  html += '<button type="button" id="closet-list-back" class="closet-list-back" aria-label="返回衣橱首页">';
  html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>返回</button>';
  html += '<div class="page-heading text-lg font-semibold flex-1 text-center truncate">'+esc(cat)+'</div>';
  html += '<button id="add-cloth" class="bg-brand text-white rounded-full px-3 py-2 text-sm flex items-center gap-1 flex-shrink-0">';
  html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>添加</button></div>';

  html += '<div class="text-xs text-mute mb-2">共 '+list.length+' 件</div>';

  // 列表页独立排序控件
  html += '<div class="closet-sort-bar" id="closet-list-sort-bar">';
  CLOSET_SORT_GROUPS.forEach(function(g){ html += closetSortUnitHtml(g[0], g[1], g[2], closetListSort); });
  html += '</div>';

  if(!list.length){
    html += '<div class="text-center text-mute text-sm py-12 bg-white rounded-2xl border border-line">暂无「'+esc(cat)+'」衣物</div>';
    html += '<button type="button" class="mt-3 w-full cat-add-placeholder bg-white border border-dashed border-brand/40 rounded-xl py-3 text-sm text-brand-dark" data-cat="'+esc(cat)+'">添加'+esc(cat)+'</button>';
  } else {
    html += '<div class="space-y-2">';
    list.forEach(function(c){ html += clothListRowHtml(c); });
    html += '</div>';
  }

  html += '<div class="h-6"></div></div>';
  return html;
}

function viewClosetHome(){
  var html = '';
  html += '<div class="page-shell px-5 pt-6" style="padding-top:var(--page-pad-top)">';
  html += '<div class="closet-home-header flex items-center justify-between gap-2 mb-4">';
  html += '<div class="page-heading closet-home-title text-lg font-semibold">'+closetPageTitle()+'</div>';
  html += '<button id="add-cloth" class="closet-home-add bg-brand text-white rounded-full px-4 py-2 text-sm flex items-center gap-1">';
  html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>添加</button></div>';

  // 搜索 + 筛选（仅作用于首页卡片视图）
  html += '<div class="flex gap-2 mb-3">';
  html += '<input id="closet-search" class="flex-1 bg-white rounded-full border border-line px-4 py-2 text-sm" placeholder="搜索衣物名称" value="'+esc(closetSearch)+'" />';
  html += '<select id="closet-cat" class="bg-white rounded-full border border-line px-3 py-2 text-sm">';
  html += '<option value="">全品类</option>';
  CATEGORIES.forEach(function(c){ html += '<option '+(closetFilterCat===c?'selected':'')+'>'+c+'</option>'; });
  html += '</select></div>';

  // 模式切换
  html += '<div class="flex bg-brand-soft rounded-full p-0.5 text-xs mb-3">';
  html += '<button class="cmode flex-1 py-1.5 rounded-full '+(closetMode==='active'?'bg-white shadow text-ink':'text-mute')+'" data-m="active">在用</button>';
  html += '<button class="cmode flex-1 py-1.5 rounded-full '+(closetMode==='retired'?'bg-white shadow text-ink':'text-mute')+'" data-m="retired">已淘汰</button>';
  html += '</div>';

  // 导出入口：默认浏览模式，不展示批量勾选
  html += '<div class="flex justify-end mb-3">';
  html += '<button type="button" id="closet-export-all" class="text-xs text-brand-dark">导出全部衣橱数据</button>';
  html += '</div>';

  // 分类卡片：固定顺序；全品类渲染全部，单选仅渲染对应卡片
  html += '<div class="space-y-3">';
  closetCategoryCardsToRender().forEach(function(cat){
    html += closetCategoryCardHtml(cat);
  });
  html += '</div>';

  html += '<div class="h-6"></div></div>';
  return html;
}

function viewCloset(){
  if(closetListCat) return viewClosetCategoryList(closetListCat);
  return viewClosetHome();
}

function filteredClothes(){
  var list = store.clothes.filter(function(c){
    if(closetMode==='active' && c.status!=='active') return false;
    if(closetMode==='retired' && c.status!=='retired') return false;
    if(closetSearch && c.name.toLowerCase().indexOf(closetSearch.toLowerCase())<0) return false;
    if(closetFilterCat && clothCategoryBucket(c)!==closetFilterCat) return false;
    return true;
  });
  return list;
}

function filteredClothesForListPage(){
  if(!closetListCat) return [];
  return clothesInCategory(closetListCat, { applySearch:false, sortKey:closetListSort });
}

function bindCloset(){
  var addBtn = $('#add-cloth');
  if(addBtn) addBtn.addEventListener('click', function(){
    window._closetPrefillCat = closetListCat || '';
    openAddCloth();
  });

  var backBtn = $('#closet-list-back');
  if(backBtn) backBtn.addEventListener('click', function(){
    closetListCat = '';
    render();
  });

  var searchEl = $('#closet-search');
  if(searchEl) searchEl.addEventListener('input', function(){ closetSearch=this.value; render(); });
  var catEl = $('#closet-cat');
  if(catEl) catEl.addEventListener('change', function(){ closetFilterCat=this.value; render(); });

  // 列表页独立排序（仅绑定列表页排序条，不写回首页状态）
  var listSortBar = $('#closet-list-sort-bar');
  if(listSortBar){
    $all('.closet-sort-arrow', listSortBar).forEach(function(b){
      b.addEventListener('click', function(){ closetListSort = b.dataset.sort; render(); });
    });
  }

  $all('.cmode').forEach(function(b){ b.addEventListener('click', function(){ closetMode=b.dataset.m; render(); }); });
  $all('.cloth-row').forEach(function(r){ r.addEventListener('click', function(){
    openClothDetail(r.dataset.id);
  }); });
  var exportAllBtn = $('#closet-export-all');
  if(exportAllBtn) exportAllBtn.addEventListener('click', openClosetExportSheet);
  $all('.cat-add-placeholder').forEach(function(b){
    b.addEventListener('click', function(){
      window._closetPrefillCat = b.dataset.cat || '';
      openAddCloth();
    });
  });
  $all('.cat-card-action').forEach(function(b){
    b.addEventListener('click', function(e){
      e.stopPropagation();
      var cat = b.dataset.cat || '';
      if(!cat) return;
      closetListCat = cat;
      // 进入列表页时不改动首页全局筛选 closetFilterCat
      render();
    });
  });
}

function wearCountOf(id){ return store.logs.filter(function(l){return l.clothId===id;}).length; }

/* ---------- 衣物添加 ---------- */
function openAddCloth(){
  var html = sheetHeader('添加衣物');
  html += '<div class="px-5 space-y-3">';
  html += '<div class="flex gap-2">';
  html += '<button id="add-ai" class="flex-1 bg-brand-soft text-brand-dark rounded-xl py-2.5 text-sm font-medium">AI 图片录入</button>';
  html += '<button id="add-manual" class="flex-1 bg-white border border-line rounded-xl py-2.5 text-sm font-medium">手动录入</button>';
  html += '</div>';
  html += '<div id="add-area"></div>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $('#add-ai').addEventListener('click', openAddAI);
  $('#add-manual').addEventListener('click', function(){ renderClothForm(null); });
}

function openAddAI(){
  var cloudOn = store.aiConfig.cloudEnabled;
  var html = '<div class="space-y-3">';
  html += '<label class="block"><input id="ai-file" type="file" accept="image/*" class="hidden" />';
  html += '<div class="border-2 border-dashed border-line rounded-2xl py-6 text-center text-mute text-sm">';
  html += '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="mx-auto mb-2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  html += '上传订单截图或实拍图<br/><span class="text-xs">'+(cloudOn?'云端 AI 将识别衣物信息':'仅存档图片，手动填写信息')+'</span></div></label>';
  html += '<div class="text-xs text-mute bg-paper rounded-lg p-2.5 leading-relaxed">💡小提示：上传订单截图建议裁剪掉底部广告区域，识别准确率更高；一张截图只保留一件待录入的衣物，多件商品请分开截图上传。</div>';
  html += '<div id="ai-result" class="hidden"></div></div>';
  $('#add-area').innerHTML = html;
  $('#ai-file').addEventListener('change', onAIFile);
}

function onAIFile(e){
  // V2：订单截图解析、AI属性预填；图片先上传 R2，photo 存 publicUrl
  var file = e.target.files[0]; if(!file) return;
  var resultArea = $('#ai-result');
  resultArea.classList.remove('hidden');
  var localPreview = URL.createObjectURL(file);
  resultArea.innerHTML = '<div class="flex items-center gap-2 text-sm text-brand-dark py-3"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>图片上传中…</div><img src="'+localPreview+'" class="form-cloth-photo" />';
  uploadImage(file).then(function(publicUrl){
    publicUrl = normalizePublicUrl(publicUrl);
    window._formPhoto = publicUrl;
    if(store.aiConfig.cloudEnabled){
      resultArea.innerHTML = '<div class="flex items-center gap-2 text-sm text-brand-dark py-3"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>云端 AI 识别中…</div>'+photoImgHtml(publicUrl, 'form-cloth-photo');
      bindPhotoFallbacks(resultArea);
      callVisionAPI(publicUrl, AI_PROMPT, store.aiConfig).then(function(text){
        console.log('[AI衣橱] 模型返回原始response:', text);
        var parsed = parseAIResponse(text);
        parsed.photo = publicUrl;
        resultArea.innerHTML = '<div class="text-xs text-mute mb-2">云端 AI 识别完成，请核对后确认入库</div>'+photoImgHtml(publicUrl, 'form-cloth-photo mb-3');
        bindPhotoFallbacks(resultArea);
        renderClothForm(parsed, true);
      }).catch(function(err){
        toast('AI 解析失败：'+err.message+'，请手动录入');
        var blank = { name:'', category:CATEGORIES[0], seasons:[], scenes:[], color:COLORS[0], fabric:FABRICS[0], buyDate:todayStr(), price:'', photo:publicUrl, status:'active' };
        resultArea.innerHTML = '<div class="text-xs text-bad mb-2">AI 解析失败，请手动填写</div>'+photoImgHtml(publicUrl, 'form-cloth-photo mb-3');
        bindPhotoFallbacks(resultArea);
        renderClothForm(blank, false);
      });
    } else {
      var blank = { name:'', category:CATEGORIES[0], seasons:[], scenes:[], color:COLORS[0], fabric:FABRICS[0], buyDate:todayStr(), price:'', photo:publicUrl, status:'active' };
      resultArea.innerHTML = '<div class="text-xs text-mute mb-2">图片已上传，请手动填写信息</div>'+photoImgHtml(publicUrl, 'form-cloth-photo mb-3');
      bindPhotoFallbacks(resultArea);
      renderClothForm(blank, false);
    }
  }).catch(function(err){
    toast('图片上传失败：'+(err.message||err));
    resultArea.innerHTML = '<div class="text-xs text-bad py-2">图片上传失败，请重试</div>';
  });
}

/* 渲染衣物表单（新增/编辑） */
function renderClothForm(existing, isAI, opts){
  opts = opts || {};
  var prefillCat = window._closetPrefillCat || '';
  window._closetPrefillCat = '';
  var defaultCat = (prefillCat && CATEGORIES.indexOf(prefillCat)>=0) ? prefillCat : CATEGORIES[0];
  var c = existing || { name:'', category:defaultCat, seasons:[], scenes:[], color:COLORS[0], fabric:FABRICS[0], buyDate:todayStr(), price:'', photo:'', status:'active' };
  if(existing && !existing.id && prefillCat && CATEGORIES.indexOf(prefillCat)>=0){
    if(!isAI || !c.category) c.category = prefillCat;
  }
  var scenes = SCENE_TAGS.concat(store.customScenes);
  var html = '<div class="space-y-3" id="cloth-form-wrap">';
  if(isAI){
    var aiLabel = store.aiConfig.cloudEnabled ? '云端 AI 识别结果' : 'AI 识别结果';
    html += '<div class="text-xs text-warn bg-warn/10 rounded-lg p-2.5 space-y-1">';
    html += '<div>以下为'+aiLabel+'，全部字段可修改，确认后才入库</div>';
    html += '<div class="font-medium">⚠️订单截图会附带页面广告，AI 有可能认错商品，请务必核对全部字段。</div>';
    html += '<div class="font-medium">⚠️部分字段识别失败会留空，请全部核对后再确认保存</div>';
    html += '</div>';
  }
  // 图片
  html += '<div><div class="text-xs text-mute mb-1">图片</div>';
  html += '<label><input id="f-file" type="file" accept="image/*" class="hidden" />';
  if(c.photo) html += photoImgHtml(c.photo, 'form-cloth-photo', 'id="f-photo"');
  else html += '<div id="f-photo" class="form-cloth-photo-empty">点击上传图片（可选）</div>';
  html += '</label></div>';
  html += textInput('f-name','名称',c.name);
  html += selectInputEmpty('f-category','品类',CATEGORIES,c.category);
  // 季节多选
  html += '<div><div class="text-xs text-mute mb-1">季节标签</div><div class="flex flex-wrap gap-2">';
  SEASONS.forEach(function(s){
    var on = c.seasons&&c.seasons.indexOf(s)>=0;
    html += '<button class="season-btn text-sm px-3 py-1.5 rounded-full border '+(on?'bg-brand text-white border-brand':'bg-white border-line')+'" data-v="'+s+'">'+s+'</button>';
  });
  html += '</div></div>';
  // 场景多选
  html += '<div><div class="text-xs text-mute mb-1">场景标签</div><div class="flex flex-wrap gap-2" id="scene-wrap">';
  scenes.forEach(function(s){
    var on = c.scenes&&c.scenes.indexOf(s)>=0;
    html += '<button class="scene-btn text-sm px-3 py-1.5 rounded-full border '+(on?'bg-brand text-white border-brand':'bg-white border-line')+'" data-v="'+esc(s)+'">'+esc(s)+'</button>';
  });
  html += '<button class="scene-add text-sm px-3 py-1.5 rounded-full border border-dashed border-line text-mute">+ 自定义</button>';
  html += '</div></div>';
  html += selectInputEmpty('f-color','颜色',COLORS,c.color);
  html += selectInputEmpty('f-fabric','面料',FABRICS,c.fabric);
  var buyDateVal = c.buyDate || '';
  html += '<div><div class="text-xs text-mute mb-1">购买时间'+(isAI?' <span class="text-warn">⚠️淘宝截图常缺年份，请核对</span>':'')+'</div><input id="f-buyDate" type="date" class="w-full bg-white rounded-xl border border-line p-3 text-sm '+(buyDateVal?'':'text-mute')+'" value="'+esc(buyDateVal)+'" placeholder="选填" /></div>';
  var priceVal = (c.price!=null && c.price!=='') ? c.price : '';
  html += '<div><div class="text-xs text-mute mb-1">购买价格</div><input id="f-price" type="number" class="w-full bg-white rounded-xl border border-line p-3 text-sm '+(priceVal!==''?'':'text-mute')+'" value="'+esc(priceVal)+'" placeholder="选填" /></div>';
  // 状态（仅编辑时显示）
  if(existing && existing.id){
    html += '<div><div class="text-xs text-mute mb-1">状态</div><select id="f-status" class="w-full bg-white rounded-xl border border-line p-3 text-sm">';
    html += '<option value="active" '+(c.status==='active'?'selected':'')+'>在用</option>';
    html += '<option value="retired" '+(c.status==='retired'?'selected':'')+'>已淘汰</option>';
    html += '</select></div>';
  }
  html += '<button id="f-save" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium">'+(existing&&existing.id?'保存修改':'确认入库')+'</button>';
  if(opts.fromDetail) html += '<button id="f-cancel-detail" type="button" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium mt-2">取消</button>';
  if(checkinPendingReturn) html += '<button id="f-cancel" type="button" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium mt-2">取消</button>';
  if(existing && existing.id) html += '<button id="f-delete" class="w-full text-bad text-sm py-2 mt-1">删除该衣物</button>';
  html += '</div>';
  var host = $('#add-area');
  if(!host && opts.fromDetail){
    openSheet(sheetHeader('编辑衣物') + '<div class="px-5 pb-2"><div id="cloth-form-host"></div></div>');
    host = $('#cloth-form-host');
  }
  if(!host) return;
  host.innerHTML = html;
  bindPhotoFallbacks(host);
  if(checkinPendingReturn && (window._formPhoto || c.photo)){
    window._formPhoto = window._formPhoto || c.photo;
  }

  var seasons = c.seasons||[];
  var scenesSel = c.scenes||[];
  $all('.season-btn').forEach(function(b){ b.addEventListener('click', function(){
    var v=b.dataset.v; var i=seasons.indexOf(v);
    if(i>=0) seasons.splice(i,1); else seasons.push(v);
    b.classList.toggle('bg-brand'); b.classList.toggle('text-white'); b.classList.toggle('border-brand');
    b.classList.toggle('bg-white'); b.classList.toggle('border-line');
  }); });
  $all('.scene-btn').forEach(function(b){ b.addEventListener('click', function(){
    var v=b.dataset.v; var i=scenesSel.indexOf(v);
    if(i>=0) scenesSel.splice(i,1); else scenesSel.push(v);
    b.classList.toggle('bg-brand'); b.classList.toggle('text-white'); b.classList.toggle('border-brand');
    b.classList.toggle('bg-white'); b.classList.toggle('border-line');
  }); });
  $('.scene-add').addEventListener('click', function(){
    var name = prompt('输入自定义场景名称');
    if(name && name.trim()){
      name=name.trim();
      if(store.customScenes.indexOf(name)<0){
        store.customScenes.push(name);
        showLoading('同步场景…');
        persistCustomScenes().then(function(){
          hideLoading();
          var next = collectForm(c, seasons, scenesSel);
          if(existing && existing.id){ next.id = existing.id; next.createdAt = existing.createdAt; next.retiredAt = existing.retiredAt; }
          renderClothForm(next, isAI, opts);
          toast('自定义场景已保存');
        }).catch(function(err){
          hideLoading();
          store.customScenes = store.customScenes.filter(function(s){ return s !== name; });
          toast('场景保存失败：'+(err.message||err));
        });
      } else {
        var next = collectForm(c, seasons, scenesSel);
        if(existing && existing.id){ next.id = existing.id; next.createdAt = existing.createdAt; next.retiredAt = existing.retiredAt; }
        renderClothForm(next, isAI, opts);
      }
    }
  });
  window._formPhotoUploading = false;
  $('#f-file').addEventListener('change', function(e){
    var file=e.target.files[0]; if(!file) return;
    var localUrl = URL.createObjectURL(file);
    setFormPhotoPreview(localUrl);
    window._formPhotoUploading = true;
    toast('图片上传中…');
    uploadImage(file).then(function(publicUrl){
      var clothId = (existing && existing.id) ? existing.id : null;
      return commitClothPhoto(clothId, publicUrl).then(function(){
        window._formPhotoUploading = false;
        if(existing) existing.photo = normalizePublicUrl(publicUrl);
        c.photo = normalizePublicUrl(publicUrl);
        toast('图片已上传');
      });
    }).catch(function(err){
      window._formPhotoUploading = false;
      toast('图片上传失败：'+(err.message||err));
    });
  });
  $('#f-save').addEventListener('click', function(){
    if(window._formPhotoUploading){ toast('图片仍在上传，请稍候'); return; }
    var data = collectForm(c, seasons, scenesSel);
    if(!data.name.trim()){ toast('请填写名称'); return; }
    var isNew = !(existing && existing.id);
    if(!isNew){
      data.id = existing.id;
      data.createdAt = existing.createdAt || Date.now();
      data.retiredAt = existing.retiredAt || null;
    } else {
      data.id = uid(); data.createdAt = Date.now(); data.retiredAt = null;
    }
    showLoading(isNew ? '入库中…' : '保存中…');
    persistCloth(data, isNew).then(function(){
      hideLoading();
      if(checkinPendingReturn){
        returnToCheckinModal(true);
      } else if(opts.fromDetail && existing && existing.id){
        render();
        openClothDetail(existing.id);
        toast('已保存');
      } else {
        closeSheet(true); render(); toast(isNew ? '已入库' : '已保存');
      }
    }).catch(function(err){
      hideLoading();
      toast('保存失败：'+(err.message||err));
    });
  });
  var fcd = $('#f-cancel-detail');
  if(fcd) fcd.addEventListener('click', function(){ openClothDetail(opts.clothId || existing.id); });
  var fc = $('#f-cancel');
  if(fc) fc.addEventListener('click', function(){ returnToCheckinModal(false); });
  var fd = $('#f-delete'); if(fd) fd.addEventListener('click', function(){
    if(confirm('确定删除该衣物？此操作不可恢复（建议改用淘汰标记）。')){
      showLoading('删除中…');
      deleteClothRemote(existing.id).then(function(){
        hideLoading(); closeSheet(); render(); toast('已删除');
      }).catch(function(err){
        hideLoading(); toast('删除失败：'+(err.message||err));
      });
    }
  });
}

function collectForm(c, seasons, scenesSel){
  return {
    name: $('#f-name').value.trim(),
    category: $('#f-category').value,
    seasons: seasons.slice(),
    scenes: scenesSel.slice(),
    color: $('#f-color').value,
    fabric: $('#f-fabric').value,
    buyDate: $('#f-buyDate').value,
    price: $('#f-price').value ? Number($('#f-price').value) : '',
    photo: normalizePublicUrl(window._formPhoto || c.photo || ''),
    status: ($('#f-status')?$('#f-status').value:'active')
  };
}

function textInput(id,label,val){
  return '<div><div class="text-xs text-mute mb-1">'+label+'</div><input id="'+id+'" class="w-full bg-white rounded-xl border border-line p-3 text-sm" value="'+esc(val==null?'':val)+'" /></div>';
}
function selectInput(id,label,opts,val){
  var h='<div><div class="text-xs text-mute mb-1">'+label+'</div><select id="'+id+'" class="w-full bg-white rounded-xl border border-line p-3 text-sm">';
  opts.forEach(function(o){ h+='<option '+(o===val?'selected':'')+'>'+o+'</option>'; });
  h+='</select></div>'; return h;
}
function selectInputEmpty(id,label,opts,val){
  var h='<div><div class="text-xs text-mute mb-1">'+label+'</div><select id="'+id+'" class="w-full bg-white rounded-xl border border-line p-3 text-sm '+(val?'':'text-mute')+'">';
  h+='<option value="" '+(val?'':'selected')+' disabled>请选择</option>';
  opts.forEach(function(o){ h+='<option value="'+o+'" '+(o===val?'selected':'')+'>'+o+'</option>'; });
  h+='</select></div>'; return h;
}

/* ---------- 衣物详情 ---------- */
function findCloth(id){ return store.clothes.filter(function(c){return c.id===id;})[0]; }

function openClothDetail(id){
  var c = findCloth(id); if(!c) return;
  var wearCount = wearCountOf(id);
  var perCost = (c.price && wearCount) ? (c.price/wearCount) : null;
  var html = sheetHeader('衣物详情');
  html += '<div class="px-5 space-y-3">';
  if(c.photo) html += photoImgHtml(c.photo, 'detail-cloth-photo');
  html += '<div class="flex items-center justify-between"><div><div class="text-base font-semibold">'+esc(c.name)+'</div>';
  html += '<div class="text-xs text-mute">'+esc(c.category)+' · '+esc(c.color)+' · '+esc(c.fabric)+'</div></div>';
  if(c.status==='retired') html += '<span class="text-xs text-bad bg-bad/10 rounded-full px-2.5 py-1">已淘汰</span></div>';
  else html += '</div>';
  // 信息
  html += '<div class="bg-white rounded-2xl border border-line p-4 text-sm space-y-2">';
  html += row('季节', (c.seasons||[]).join('、')||'—');
  html += row('场景', (c.scenes||[]).join('、')||'—');
  html += row('购买时间', c.buyDate||'—');
  html += row('购买价格', fmtMoney(c.price));
  html += row('穿着次数', wearCount+' 次');
  html += row('单次穿着成本', perCost!=null?('¥'+perCost.toFixed(1)):'—');
  html += row('状态', c.status==='active'?'在用':'已淘汰');
  if(c.status==='retired'&&c.retiredAt) html += row('淘汰时间', c.retiredAt);
  html += '</div>';
  // 穿着日志
  html += '<div class="text-sm font-medium mt-1">穿着日志</div>';
  var logs = store.logs.filter(function(l){return l.clothId===id;}).sort(function(a,b){return a.date<b.date?1:-1;});
  if(!logs.length){ html += '<div class="text-center text-mute text-sm py-4 bg-white rounded-2xl border border-line">暂无穿着记录</div>'; }
  else {
    html += '<div class="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">';
    logs.forEach(function(l){
      var srcLabel = l.source==='recommend'?'推荐打卡':(l.source==='checkin'?'拍照打卡':'打卡');
      html += '<div class="flex items-center justify-between bg-white rounded-lg border border-line px-3 py-2 text-xs gap-2">';
      html += '<span class="flex-shrink-0">'+esc(l.date)+'</span>';
      html += '<div class="flex items-center gap-2 min-w-0">';
      html += '<span class="text-mute truncate">'+esc(srcLabel)+'</span>';
      html += '<button type="button" class="log-del-btn flex-shrink-0 text-bad text-[11px] px-1.5 py-0.5 rounded border border-bad/30" data-log-id="'+esc(l.id)+'">删除</button>';
      html += '</div></div>';
    });
    html += '</div>';
  }
  // 操作
  html += '<div class="grid grid-cols-2 gap-3 pt-1">';
  html += '<button id="detail-edit" class="bg-white border border-line rounded-xl py-3 text-sm font-medium">编辑</button>';
  if(c.status==='active') html += '<button id="detail-retire" class="bg-white border border-bad text-bad rounded-xl py-3 text-sm font-medium">淘汰</button>';
  else html += '<button id="detail-restore" class="bg-good text-white rounded-xl py-3 text-sm font-medium">恢复</button>';
  html += '</div>';
  html += '<button id="detail-export" class="w-full text-brand-dark text-sm py-2">导出本条数据</button>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $('#detail-edit').addEventListener('click', function(){ window._formPhoto=c.photo; renderClothForm(c, false, { fromDetail:true, clothId:id }); });
  $all('.log-del-btn').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if(!confirm('确定删除这条穿着记录？')) return;
      var logId = btn.dataset.logId;
      var removed = store.logs.filter(function(l){ return l.id === logId; })[0];
      removeWearLogById(logId);
      showLoading('同步记录…');
      persistLogs().then(function(){
        hideLoading();
        render();
        openClothDetail(id);
        toast('已删除穿着记录');
      }).catch(function(err){
        hideLoading();
        if(removed) store.logs.push(removed);
        toast('删除失败：'+(err.message||err));
      });
    });
  });
  $('#detail-retire').addEventListener('click', function(){
    if(confirm('确认淘汰「'+c.name+'」？淘汰后不会删除，可随时恢复。')){
      c.status='retired'; c.retiredAt=todayStr();
      showLoading('更新中…');
      persistCloth(c, false).then(function(){
        hideLoading(); closeSheet(); render(); toast('已标记淘汰');
      }).catch(function(err){
        hideLoading(); toast('更新失败：'+(err.message||err));
      });
    }
  });
  var dr=$('#detail-restore'); if(dr) dr.addEventListener('click', function(){
    c.status='active'; c.retiredAt=null;
    showLoading('更新中…');
    persistCloth(c, false).then(function(){
      hideLoading(); closeSheet(); render(); toast('已恢复');
    }).catch(function(err){
      hideLoading(); toast('更新失败：'+(err.message||err));
    });
  });
  $('#detail-export').addEventListener('click', function(){ exportCleanJSON([c], '衣物_'+c.name); });
}

function row(k,v){ return '<div class="flex justify-between"><span class="text-mute">'+k+'</span><span>'+esc(v)+'</span></div>'; }

/* ---------- 衣橱导出（全部云端衣物，无批量勾选） ---------- */
function photoExtFromUrl(url){
  if(!url) return 'jpg';
  var clean = String(url).split('?')[0];
  var m = clean.match(/\.([a-zA-Z0-9]+)$/);
  if(!m) return 'jpg';
  var ext = m[1].toLowerCase();
  if(['jpg','jpeg','png','webp','gif','heic'].indexOf(ext) < 0) return 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
}

function clothToExportRecord(c, forCsv){
  var seasons = Array.isArray(c.seasons) ? c.seasons.slice() : [];
  var scenes = Array.isArray(c.scenes) ? c.scenes.slice() : [];
  var tags = seasons.concat(scenes);
  var photo = c.photo || '';
  var photoFile = photo ? ('photos/' + c.id + '.' + photoExtFromUrl(photo)) : '';
  var base = {
    id: c.id,
    name: c.name || '',
    category: c.category || '',
    brand: c.brand || '',
    price: (c.price != null && c.price !== '') ? c.price : '',
    buyDate: c.buyDate || '',
    seasons: forCsv ? seasons.join('|') : seasons,
    scenes: forCsv ? scenes.join('|') : scenes,
    tags: forCsv ? tags.join('|') : tags,
    color: c.color || '',
    fabric: c.fabric || '',
    status: c.status || 'active',
    photo: photo,
    photoFile: photoFile,
    wearCount: wearCountOf(c.id),
    createdAt: c.createdAt || null,
    retiredAt: c.retiredAt || null
  };
  return base;
}

function allClothesForExport(){
  return (store.clothes || []).slice().sort(function(a, b){
    var da = a.buyDate || '';
    var db = b.buyDate || '';
    if(da !== db) return da < db ? 1 : -1;
    return String(a.name||'').localeCompare(String(b.name||''), 'zh');
  });
}

function downloadTextFile(text, filename, mime){
  var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function csvEscape(v){
  var s = v == null ? '' : String(v);
  if(/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportWardrobeCSV(items, filename){
  var rows = items.map(function(c){ return clothToExportRecord(c, true); });
  var cols = ['id','name','category','brand','price','buyDate','seasons','scenes','tags','color','fabric','status','photo','photoFile','wearCount','createdAt','retiredAt'];
  var lines = [cols.join(',')];
  rows.forEach(function(r){
    lines.push(cols.map(function(k){ return csvEscape(r[k]); }).join(','));
  });
  downloadTextFile('\uFEFF' + lines.join('\n'), filename + '.csv', 'text/csv;charset=utf-8');
}

function exportWardrobeJSON(items, filename){
  var payload = {
    exportedAt: new Date().toISOString(),
    count: items.length,
    note: 'photo 为云端图片 URL；photoFile 为建议本地关联文件名（photos/{id}.{ext}），便于与图片清单对照。',
    items: items.map(function(c){ return clothToExportRecord(c, false); })
  };
  downloadJSON(payload, filename + '.json');
}

function openClosetExportSheet(){
  var items = allClothesForExport();
  var withPhoto = items.filter(function(c){ return !!(c.photo); }).length;
  var html = sheetHeader('导出全部衣橱数据');
  html += '<div class="px-5 space-y-3">';
  html += '<div class="text-sm text-ink leading-relaxed">将导出当前已同步的全部衣物（含在用与已淘汰），共 <span class="font-semibold text-brand-dark">'+items.length+'</span> 件；其中含图片链接 <span class="font-semibold">'+withPhoto+'</span> 件。</div>';
  html += '<div class="text-xs text-mute bg-paper rounded-xl p-3 leading-relaxed">JSON 适合给 AI 分析；CSV 适合表格查看。图片以 photo URL 与 photoFile 字段关联，不改动云端数据。</div>';
  if(!items.length){
    html += '<div class="text-sm text-mute text-center py-6">暂无衣物可导出</div>';
  } else {
    html += '<button type="button" id="export-json" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium">导出 JSON</button>';
    html += '<button type="button" id="export-csv" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium text-brand-dark">导出 CSV</button>';
    html += '<button type="button" id="export-both" class="w-full bg-white border border-line rounded-xl py-3 text-sm font-medium">同时导出 JSON + CSV</button>';
  }
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  var stamp = '衣橱全部导出_' + todayStr();
  var ej = $('#export-json');
  if(ej) ej.addEventListener('click', function(){
    exportWardrobeJSON(items, stamp);
    toast('已导出 JSON');
  });
  var ec = $('#export-csv');
  if(ec) ec.addEventListener('click', function(){
    exportWardrobeCSV(items, stamp);
    toast('已导出 CSV');
  });
  var eb = $('#export-both');
  if(eb) eb.addEventListener('click', function(){
    exportWardrobeJSON(items, stamp);
    setTimeout(function(){
      exportWardrobeCSV(items, stamp);
      toast('已导出 JSON 与 CSV');
    }, 200);
  });
}

function exportCleanJSON(items, filename){
  var clean = items.map(function(c){
    return {
      name:c.name, category:c.category, brand:c.brand||'', seasons:c.seasons||[], scenes:c.scenes||[],
      color:c.color, fabric:c.fabric, buyDate:c.buyDate, price:c.price, photo:c.photo||'',
      wearCount: wearCountOf(c.id), status:c.status
    };
  });
  downloadJSON(clean, filename+'.json');
  toast('已导出干净业务 JSON');
}

function downloadJSON(obj, filename){
  var blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/* ============================================================
   视图：分析
   ============================================================ */
// 穿着 TOP10：默认按穿着次数降序
var analysisTopSort = { field:'wear', dir:'desc' };

function hasAnalysisDimFilters(){
  return !!(analysisFilter.seasons.length || analysisFilter.scenes.length || analysisFilter.categories.length);
}
function clearAnalysisDimFilters(){
  analysisFilter.seasons = [];
  analysisFilter.scenes = [];
  analysisFilter.categories = [];
}
function clothMatchesAnalysisDims(c){
  var f = analysisFilter;
  if(f.seasons.length){
    var ss = c.seasons || [];
    if(!f.seasons.some(function(s){ return ss.indexOf(s) >= 0; })) return false;
  }
  if(f.scenes.length){
    var sc = c.scenes || [];
    if(!f.scenes.some(function(s){ return sc.indexOf(s) >= 0; })) return false;
  }
  if(f.categories.length){
    if(f.categories.indexOf(c.category) < 0) return false;
  }
  return true;
}
function analysisMoney(n){
  n = Number(n) || 0;
  if(!n) return '¥0';
  return '¥'+n.toLocaleString('zh-CN',{maximumFractionDigits:0});
}
// 分析页异步加载状态（本地统计，先出骨架再算数据）
var analysisDataCache = null;
var analysisLoadError = null;
var analysisLoading = false;
var analysisComputeTimer = null;
var analysisCacheKey = '';
function analysisFilterKey(){
  return JSON.stringify({
    buyStart: analysisFilter.buyStart,
    buyEnd: analysisFilter.buyEnd,
    includeRetired: analysisFilter.includeRetired,
    seasons: analysisFilter.seasons,
    scenes: analysisFilter.scenes,
    categories: analysisFilter.categories,
    topSort: analysisTopSort
  });
}
function invalidateAnalysisCache(){
  analysisDataCache = null;
  analysisLoadError = null;
  analysisCacheKey = '';
}
function scheduleAnalysisCompute(){
  if(analysisComputeTimer){ clearTimeout(analysisComputeTimer); analysisComputeTimer = null; }
  analysisLoading = true;
  analysisLoadError = null;
  var keepScrollY = window.scrollY || window.pageYOffset || 0;
  analysisComputeTimer = setTimeout(function(){
    analysisComputeTimer = null;
    var key = analysisFilterKey();
    try{
      analysisDataCache = computeAnalysis();
      analysisCacheKey = key;
      analysisLoadError = null;
    }catch(err){
      analysisDataCache = null;
      analysisCacheKey = '';
      analysisLoadError = '数据加载失败';
      console.warn('[分析] 统计计算失败', err);
    }
    analysisLoading = false;
    // 仅刷新分析页内容，禁止回跳衣橱；并恢复滚动位置
    if(currentTab === 'analysis'){
      try{
        var app = $('#app');
        if(app) app.innerHTML = viewAnalysis();
        bindAnalysis();
        window.scrollTo(0, keepScrollY);
      }catch(e2){
        console.warn('[分析] 二次渲染失败', e2);
        analysisLoadError = '数据加载失败';
        var app2 = $('#app');
        if(app2) app2.innerHTML = viewAnalysis();
        try{ bindAnalysis(); }catch(e3){}
        window.scrollTo(0, keepScrollY);
      }
    }
  }, 0);
}
function bindAnalysisTopSortHandlers(){
  $all('.an-top-sort').forEach(function(b){
    b.addEventListener('click', function(e){
      if(e && e.preventDefault) e.preventDefault();
      var field = b.dataset.field;
      if(analysisTopSort.field === field){
        analysisTopSort.dir = analysisTopSort.dir === 'desc' ? 'asc' : 'desc';
      } else {
        analysisTopSort.field = field;
        analysisTopSort.dir = 'desc';
      }
      refreshAnalysisTopListLocal();
    });
  });
}
function refreshAnalysisTopListLocal(){
  // 仅更新 TOP10 列表 DOM，不走全局 render / scrollTo(0,0)
  var y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  try{
    var data = computeAnalysis();
    if(analysisDataCache){
      analysisDataCache.top = data.top;
      // 同步池规模相关字段，保持缓存一致
      analysisDataCache.count = data.count;
    } else {
      analysisDataCache = data;
    }
    analysisCacheKey = analysisFilterKey();
    analysisLoadError = null;
  }catch(err){
    console.warn('[分析] TOP10 局部排序失败', err);
    return;
  }
  var wrap = $('#an-top10-wrap');
  if(!wrap) return;
  if(!analysisDataCache || analysisDataCache.count === 0){
    wrap.innerHTML = '<div class="text-center text-mute text-sm py-6 bg-white rounded-2xl border border-line mb-4">当前筛选条件下暂无匹配衣物</div>';
  } else {
    wrap.innerHTML = analysisTopListHtml(analysisDataCache.top);
    bindAnalysisTopSortHandlers();
  }
  // 防御性恢复视口（避免个别环境重排导致跳顶）
  requestAnimationFrame(function(){ window.scrollTo(0, y); });
}
function analysisStatsSkeletonHtml(){
  var html = '<div class="grid grid-cols-2 gap-3 mb-4">';
  for(var i=0;i<4;i++){
    html += '<div class="bg-white rounded-2xl border border-line p-4 animate-pulse"><div class="h-3 w-16 bg-line rounded mb-3"></div><div class="h-6 w-20 bg-line/70 rounded"></div></div>';
  }
  html += '</div>';
  html += '<div class="text-center text-mute text-sm py-8 bg-white rounded-2xl border border-line mb-4">统计数据加载中…</div>';
  return html;
}
function analysisLoadErrorHtml(){
  return '<div class="bg-white rounded-2xl border border-line p-6 mb-4 text-center space-y-3">'
    + '<div class="text-sm text-bad">数据加载失败</div>'
    + '<div class="text-xs text-mute">请检查筛选条件后重试，页面不会自动离开</div>'
    + '<button type="button" id="an-retry-load" class="px-4 py-2 rounded-full bg-brand text-white text-sm">重新加载</button>'
    + '</div>';
}
function analysisTopSortHeaderHtml(){
  var fields = [
    ['buyDate','购买时间'],
    ['price','价格'],
    ['wear','穿着次数'],
    ['perCost','单次穿着成本']
  ];
  var html = '<div class="grid grid-cols-4 gap-0.5 px-1.5 py-2 border-b border-line bg-paper/80">';
  fields.forEach(function(f){
    var on = analysisTopSort.field === f[0];
    var dir = analysisTopSort.dir;
    var cls = on ? 'text-brand-dark font-semibold' : 'text-mute';
    var up = on && dir === 'asc' ? 'text-brand-dark' : 'opacity-30';
    var down = on && dir === 'desc' ? 'text-brand-dark' : 'opacity-30';
    html += '<button type="button" class="an-top-sort '+cls+' text-[10px] leading-tight px-0.5 py-1 text-center" data-field="'+f[0]+'">';
    html += '<span class="block truncate">'+f[1]+'</span>';
    html += '<span class="inline-flex items-center justify-center gap-0 text-[9px] mt-0.5"><span class="'+up+'">↑</span><span class="'+down+'">↓</span></span>';
    html += '</button>';
  });
  html += '</div>';
  return html;
}
function percentileSorted(sortedAsc, p){
  // p: 0–100；sortedAsc 已升序
  if(!sortedAsc || !sortedAsc.length) return 0;
  if(sortedAsc.length === 1) return sortedAsc[0];
  var idx = (p / 100) * (sortedAsc.length - 1);
  var lo = Math.floor(idx);
  var hi = Math.ceil(idx);
  if(lo === hi) return sortedAsc[lo];
  var w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}
function buildValueCrossGroups(pool, wearMap){
  var rows = pool.map(function(c){
    var wear = wearMap[c.id] || 0;
    var priceNum = (c.price != null && c.price !== '') ? Number(c.price) : NaN;
    var hasPrice = !isNaN(priceNum) && priceNum > 0;
    var price = hasPrice ? priceNum : null;
    var perCost = (wear > 0 && hasPrice) ? (price / wear) : null;
    return {
      id: c.id,
      name: c.name,
      photo: c.photo,
      category: c.category,
      buyDate: c.buyDate || '',
      price: price,
      wear: wear,
      perCost: perCost,
      hasPrice: hasPrice
    };
  });
  if(!rows.length) return { expensiveRare:[], cheapFrequent:[] };

  // 样本 <20：放宽为 P25/P75；≥20：严格 P10/P90
  var loose = rows.length < 20;
  var lowP = loose ? 25 : 10;
  var highP = loose ? 75 : 90;

  var prices = rows.filter(function(r){ return r.hasPrice; }).map(function(r){ return r.price; }).sort(function(a,b){ return a - b; });
  var wears = rows.map(function(r){ return r.wear; }).sort(function(a,b){ return a - b; });
  if(!prices.length) return { expensiveRare:[], cheapFrequent:[] };

  var priceLow = percentileSorted(prices, lowP);
  var priceHigh = percentileSorted(prices, highP);
  var wearLow = percentileSorted(wears, lowP);
  var wearHigh = percentileSorted(wears, highP);

  // 贵但穿得少：价格≥高分位 且 穿着≤低分位；价格降序
  var expensiveRare = rows.filter(function(r){
    return r.hasPrice && r.price >= priceHigh && r.wear <= wearLow;
  }).sort(function(a, b){ return b.price - a.price; }).slice(0, 10);

  // 便宜高频刚需：价格≤低分位 且 穿着≥高分位；单次成本升序
  var cheapFrequent = rows.filter(function(r){
    return r.hasPrice && r.price <= priceLow && r.wear >= wearHigh;
  }).sort(function(a, b){
    var pa = a.perCost, pb = b.perCost;
    if(pa == null && pb == null) return (a.name || '').localeCompare(b.name || '', 'zh');
    if(pa == null) return 1;
    if(pb == null) return -1;
    if(pa === pb) return (a.name || '').localeCompare(b.name || '', 'zh');
    return pa - pb;
  }).slice(0, 10);

  return { expensiveRare: expensiveRare, cheapFrequent: cheapFrequent };
}
function analysisValueCrossPreviewCardHtml(kind, title, titleCls, items){
  var html = '<button type="button" class="an-vc-card text-left bg-white rounded-2xl border border-line p-3 w-full active:bg-paper/60" data-kind="'+kind+'">';
  html += '<div class="text-sm font-medium '+titleCls+' mb-2">'+esc(title)+'</div>';
  if(!items.length){
    html += '<div class="text-xs text-mute py-5 text-center">暂无</div>';
  } else {
    html += '<div class="flex gap-2">';
    items.slice(0, 2).forEach(function(t){
      html += '<div class="flex-1 min-w-0 text-center">';
      if(t.photo) html += photoImgHtml(t.photo, 'w-full aspect-square max-h-20 rounded-lg object-cover mb-1');
      else html += '<div class="w-full aspect-square max-h-20 rounded-lg bg-line flex items-center justify-center text-mute text-[10px] mb-1">'+esc((t.category||'').slice(0,2))+'</div>';
      html += '<div class="text-[10px] text-ink truncate">'+analysisMoney(t.price)+'</div>';
      html += '<div class="text-[10px] text-mute truncate">穿 '+t.wear+' 次</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</button>';
  return html;
}
function analysisValueCrossHtml(expensiveRare, cheapFrequent){
  var html = '<div class="grid grid-cols-2 gap-2 mb-4" id="an-value-cross">';
  html += analysisValueCrossPreviewCardHtml('expensive', '贵但穿得少', 'text-bad', expensiveRare || []);
  html += analysisValueCrossPreviewCardHtml('cheap', '便宜高频刚需', 'text-good', cheapFrequent || []);
  html += '</div>';
  return html;
}
function openAnalysisValueCrossSheet(kind){
  var data = analysisDataCache;
  if(!data) return;
  var items = kind === 'expensive' ? (data.expensiveRare || []) : (data.cheapFrequent || []);
  var title = kind === 'expensive' ? '贵但穿得少' : '便宜高频刚需';
  var html = sheetHeader(title);
  html += '<div class="px-5 py-3 space-y-2">';
  if(!items.length){
    html += '<div class="text-center text-mute text-sm py-8">暂无</div>';
  } else {
    html += '<div class="grid grid-cols-4 gap-0.5 px-1 text-[10px] text-mute text-center mb-1">';
    html += '<div>购买时间</div><div>价格</div><div>穿着次数</div><div>单次穿着成本</div></div>';
    items.slice(0, 10).forEach(function(t){
      html += '<button type="button" class="an-vc-item w-full text-left bg-white rounded-xl border border-line p-3 flex items-start gap-2.5" data-id="'+esc(t.id)+'">';
      if(t.photo) html += photoImgHtml(t.photo, 'w-11 h-11 rounded-lg object-cover flex-shrink-0');
      else html += '<div class="w-11 h-11 rounded-lg bg-line flex items-center justify-center text-mute text-[10px] flex-shrink-0">'+esc((t.category||'').slice(0,2))+'</div>';
      html += '<div class="flex-1 min-w-0">';
      html += '<div class="text-sm truncate mb-1.5">'+esc(t.name)+'</div>';
      html += '<div class="grid grid-cols-4 gap-0.5 text-[10px] text-mute text-center">';
      html += '<div class="truncate">'+(t.buyDate ? esc(t.buyDate) : '—')+'</div>';
      html += '<div class="truncate">'+analysisMoney(t.price)+'</div>';
      html += '<div class="truncate">'+t.wear+' 次</div>';
      if(t.perCost != null) html += '<div class="truncate">'+analysisMoney(t.perCost)+'</div>';
      else html += '<div class="truncate text-warn">暂无穿着记录</div>';
      html += '</div></div></button>';
    });
  }
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $all('.an-vc-item').forEach(function(b){
    b.addEventListener('click', function(){
      var id = b.dataset.id;
      if(id) openClothDetail(id);
    });
  });
}
function bindAnalysisValueCrossHandlers(){
  $all('.an-vc-card').forEach(function(card){
    card.addEventListener('click', function(){
      openAnalysisValueCrossSheet(card.dataset.kind);
    });
  });
}
function currentNaturalSeason(){
  var m = new Date().getMonth() + 1; // 1–12
  if(m >= 3 && m <= 5) return '春';
  if(m >= 6 && m <= 8) return '夏';
  if(m >= 9 && m <= 11) return '秋';
  return '冬';
}
function isAllSeasonCloth(seasons){
  if(!seasons || !seasons.length) return false;
  return SEASONS.every(function(s){ return seasons.indexOf(s) >= 0; });
}
function isCurrentSeasonCloth(seasons, curSeason){
  if(isAllSeasonCloth(seasons)) return true; // 四季通用
  return !!(seasons && seasons.indexOf(curSeason) >= 0);
}
function clothIdleDays(c){
  // 有穿着记录：距上次穿着；从未穿过：距购买日期
  var logs = store.logs.filter(function(l){ return l.clothId === c.id; })
    .sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  var baseDate = '';
  if(logs.length) baseDate = logs[0].date;
  else baseDate = c.buyDate || '';
  if(!baseDate) return 0;
  var d = daysSince(baseDate);
  return d == null ? 0 : Math.max(0, d);
}
function buildIdleAnalysisList(pool){
  var curSeason = currentNaturalSeason();
  var rows = pool.map(function(c){
    var seasons = c.seasons || [];
    return {
      id: c.id,
      name: c.name,
      photo: c.photo,
      category: c.category,
      buyDate: c.buyDate || '',
      seasons: seasons,
      idleDays: clothIdleDays(c),
      seasonMatch: isCurrentSeasonCloth(seasons, curSeason)
    };
  }).filter(function(r){
    // 闲置天数为 0（近期穿过）不进入闲置分析
    return r.idleDays > 0;
  });

  function byIdleDesc(a, b){
    if(b.idleDays !== a.idleDays) return b.idleDays - a.idleDays;
    return (a.name || '').localeCompare(b.name || '', 'zh');
  }

  // 当季优先靠前（含四季通用），组内按闲置天数降序；非当季排后，不剔除
  var matched = rows.filter(function(r){ return r.seasonMatch; }).sort(byIdleDesc);
  var others = rows.filter(function(r){ return !r.seasonMatch; }).sort(byIdleDesc);
  return matched.concat(others).slice(0, 10);
}
function analysisIdleHtml(idle){
  if(!idle || !idle.length){
    return '<div class="text-center text-mute text-sm py-6 bg-white rounded-2xl border border-line mb-4">暂无闲置衣物</div>';
  }
  // 统一大色块容器 + 横向单行滚动
  var html = '<div class="mb-4 rounded-2xl border border-line bg-brand-soft/50 px-3 py-3" id="an-idle-wrap">';
  html += '<div class="overflow-x-auto no-scrollbar">';
  html += '<div class="flex gap-2.5" style="width:max-content">';
  idle.forEach(function(t){
    html += '<button type="button" class="an-idle-card flex-shrink-0 w-[4.75rem] text-left bg-white rounded-xl border border-line/80 p-2 shadow-sm active:opacity-80" data-id="'+esc(t.id)+'">';
    if(t.photo) html += photoImgHtml(t.photo, 'w-full aspect-square rounded-lg object-cover mb-1.5');
    else html += '<div class="w-full aspect-square rounded-lg bg-line flex items-center justify-center text-mute text-[10px] mb-1.5">'+esc((t.category||'').slice(0,2))+'</div>';
    html += '<div class="text-[10px] text-warn text-center leading-snug">已闲置 '+t.idleDays+' 天</div>';
    html += '</button>';
  });
  html += '</div></div></div>';
  return html;
}
function bindAnalysisIdleHandlers(){
  $all('.an-idle-card').forEach(function(card){
    card.addEventListener('click', function(){
      var id = card.dataset.id;
      if(id) openClothDetail(id);
    });
  });
}
function buildAnalysisTopList(pool, wearMap){
  var rows = pool.map(function(c){
    var wear = wearMap[c.id] || 0;
    var price = (c.price != null && c.price !== '') ? Number(c.price) : 0;
    var perCost = (wear > 0 && price) ? (price / wear) : null;
    return {
      id: c.id,
      name: c.name,
      photo: c.photo,
      category: c.category,
      buyDate: c.buyDate || '',
      price: price,
      wear: wear,
      perCost: perCost,
      hasWear: wear > 0
    };
  });
  var withWear = rows.filter(function(r){ return r.hasWear; });
  var noWear = rows.filter(function(r){ return !r.hasWear; });
  var field = analysisTopSort.field;
  var asc = analysisTopSort.dir === 'asc';
  withWear.sort(function(a, b){
    var cmp = 0;
    if(field === 'buyDate'){
      var da = a.buyDate || '', db = b.buyDate || '';
      cmp = da < db ? -1 : (da > db ? 1 : 0);
    } else if(field === 'price'){
      cmp = a.price - b.price;
    } else if(field === 'wear'){
      cmp = a.wear - b.wear;
    } else {
      cmp = (a.perCost || 0) - (b.perCost || 0);
    }
    if(cmp === 0) return (a.name || '').localeCompare(b.name || '', 'zh');
    return asc ? cmp : -cmp;
  });
  // 无穿着记录：永久置底，不受升降序控制
  noWear.sort(function(a, b){ return (a.name || '').localeCompare(b.name || '', 'zh'); });
  return withWear.concat(noWear).slice(0, 10);
}
function analysisTopListHtml(top){
  if(!top.length){
    return '<div class="text-center text-mute text-sm py-6 bg-white rounded-2xl border border-line mb-4">当前筛选条件下暂无匹配衣物</div>';
  }
  var html = '<div class="bg-white rounded-2xl border border-line overflow-hidden mb-4">';
  html += analysisTopSortHeaderHtml();
  html += '<div class="divide-y divide-line">';
  top.forEach(function(t, i){
    html += '<div class="p-3 flex items-start gap-2.5">';
    html += '<div class="w-5 text-center text-xs font-semibold text-brand-dark pt-3 flex-shrink-0">'+(i+1)+'</div>';
    if(t.photo) html += photoImgHtml(t.photo, 'w-11 h-11 rounded-lg object-cover flex-shrink-0');
    else html += '<div class="w-11 h-11 rounded-lg bg-line flex items-center justify-center text-mute text-[10px] flex-shrink-0">'+esc((t.category||'').slice(0,2))+'</div>';
    html += '<div class="flex-1 min-w-0">';
    html += '<div class="text-sm truncate mb-1.5">'+esc(t.name)+'</div>';
    html += '<div class="grid grid-cols-4 gap-0.5 text-[10px] text-mute text-center">';
    html += '<div class="truncate">'+(t.buyDate ? esc(t.buyDate) : '—')+'</div>';
    html += '<div class="truncate">'+analysisMoney(t.price)+'</div>';
    html += '<div class="truncate">'+t.wear+' 次</div>';
    if(t.hasWear && t.perCost != null){
      html += '<div class="truncate">'+analysisMoney(t.perCost)+'</div>';
    } else {
      html += '<div class="truncate text-warn">暂无穿着记录</div>';
    }
    html += '</div></div></div>';
  });
  html += '</div></div>';
  return html;
}
function analysisActiveFilterTagsHtml(){
  var tags = [];
  analysisFilter.seasons.forEach(function(s){ tags.push({ kind:'season', value:s, label:'季节：'+s }); });
  analysisFilter.scenes.forEach(function(s){ tags.push({ kind:'scene', value:s, label:'场景：'+s }); });
  analysisFilter.categories.forEach(function(s){ tags.push({ kind:'category', value:s, label:'品类：'+s }); });
  if(!tags.length) return '';
  var html = '<div class="flex flex-wrap gap-2 mb-4">';
  tags.forEach(function(t){
    html += '<span class="inline-flex items-center gap-1 text-xs bg-brand-soft text-brand-dark rounded-full pl-2.5 pr-1 py-1 border border-line">';
    html += esc(t.label);
    html += '<button type="button" class="an-tag-remove ml-0.5 w-4 h-4 rounded-full flex items-center justify-center text-mute leading-none" data-kind="'+t.kind+'" data-v="'+esc(t.value)+'" aria-label="移除">×</button>';
    html += '</span>';
  });
  html += '</div>';
  return html;
}
function openAnalysisDimSheet(kind){
  var meta = {
    season: { title:'选择季节', opts: SEASONS.slice(), key:'seasons' },
    scene: { title:'选择场景', opts: SCENE_TAGS.concat(store.customScenes || []), key:'scenes' },
    category: { title:'选择品类', opts: CATEGORIES.slice(), key:'categories' }
  }[kind];
  if(!meta) return;
  var selected = (analysisFilter[meta.key] || []).slice();
  var html = sheetHeader(meta.title);
  html += '<div class="px-5 py-4 space-y-4">';
  html += '<div class="text-xs text-mute">可多选，确认后立即生效</div>';
  html += '<div class="flex flex-wrap gap-2">';
  meta.opts.forEach(function(o){
    var on = selected.indexOf(o) >= 0;
    html += '<button type="button" class="an-dim-opt text-sm px-3 py-1.5 rounded-full border '+(on?'bg-brand text-white border-brand':'bg-white border-line')+'" data-v="'+esc(o)+'">'+esc(o)+'</button>';
  });
  html += '</div>';
  html += '<button id="an-dim-confirm" type="button" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium">确认</button>';
  html += '<div class="h-2"></div></div>';
  openSheet(html);
  $all('.an-dim-opt').forEach(function(b){
    b.addEventListener('click', function(){
      var v = b.dataset.v;
      var i = selected.indexOf(v);
      if(i >= 0) selected.splice(i, 1);
      else selected.push(v);
      b.classList.toggle('bg-brand');
      b.classList.toggle('text-white');
      b.classList.toggle('border-brand');
      b.classList.toggle('bg-white');
      b.classList.toggle('border-line');
    });
  });
  $('#an-dim-confirm').addEventListener('click', function(){
    analysisFilter[meta.key] = selected.slice();
    closeSheet();
    persistFilterSetting(true).catch(function(err){ toast('筛选保存失败：'+(err.message||err)); });
    render();
  });
}

function viewAnalysis(){
  var html = '';
  html += '<div class="page-shell px-5 pt-6" style="padding-top:var(--page-pad-top)">';
  html += '<div class="page-heading text-lg font-semibold mb-3">数据分析</div>';

  // 衣物购入时间范围（紧凑卡片）— 骨架优先，始终先渲染
  html += '<div class="bg-white rounded-2xl border border-line px-3 py-2.5 space-y-1.5 mb-3">';
  html += '<div class="text-xs text-mute">衣物购入时间范围</div>';
  html += '<div class="grid grid-cols-2 gap-2 min-w-0"><div class="min-w-0"><div class="text-[10px] text-mute mb-0.5">购入起始日期</div><input id="an-buyStart" type="date" class="w-full min-w-0 max-w-full bg-paper rounded-xl border border-line px-2 py-1.5 text-sm" value="'+esc(analysisFilter.buyStart)+'" /></div>';
  html += '<div class="min-w-0"><div class="text-[10px] text-mute mb-0.5">购入结束日期</div><input id="an-buyEnd" type="date" class="w-full min-w-0 max-w-full bg-paper rounded-xl border border-line px-2 py-1.5 text-sm" value="'+esc(analysisFilter.buyEnd)+'" /></div></div>';
  html += '</div>';

  // 其余筛选：已淘汰开关 + 维度
  var dimAllOn = !hasAnalysisDimFilters();
  html += '<div class="bg-white rounded-2xl border border-line p-4 space-y-3 mb-3">';
  html += '<div class="flex items-center justify-between"><span class="text-sm">包含已淘汰衣物</span>';
  html += '<label class="relative inline-flex items-center"><input id="an-include" type="checkbox" class="sr-only peer" '+(analysisFilter.includeRetired?'checked':'')+'/>';
  html += '<div class="w-11 h-6 bg-line rounded-full peer-checked:bg-brand peer-checked:after:translate-x-5 after:content-[\'\'] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div></label></div>';
  html += '<div><div class="text-xs text-mute mb-1">维度</div><div class="flex gap-2 flex-wrap">';
  var dims = [
    ['all','全部', dimAllOn],
    ['season','季节', analysisFilter.seasons.length > 0],
    ['scene','场景', analysisFilter.scenes.length > 0],
    ['category','品类', analysisFilter.categories.length > 0]
  ];
  dims.forEach(function(d){
    html += '<button type="button" class="dim-btn text-sm px-3 py-1.5 rounded-full border '+(d[2]?'bg-brand text-white border-brand':'bg-white border-line')+'" data-d="'+d[0]+'">'+d[1]+'</button>';
  });
  html += '</div></div></div>';

  // 二级筛选状态标签
  html += analysisActiveFilterTagsHtml();

  // 统计区：优先骨架 / 错误兜底 / 缓存数据（禁止同步阻塞与回跳）
  var key = analysisFilterKey();
  var dataReady = analysisDataCache && analysisCacheKey === key && !analysisLoadError;
  if(analysisLoadError){
    html += analysisLoadErrorHtml();
  } else if(!dataReady){
    html += analysisStatsSkeletonHtml();
  } else {
    var data = analysisDataCache;
    var emptyPool = data.count === 0;

    html += '<div id="an-section-stats" class="grid grid-cols-2 gap-3 mb-4">';
    html += statCard('衣物件数', data.count+' 件');
    html += statCard('总购入金额', analysisMoney(data.totalCost));
    html += statCard('平均单价', analysisMoney(data.avgPrice));
    html += statCard('周期穿着总次数', data.totalWear+' 次');
    html += '</div>';

    var emptyTip = emptyPool
      ? '<div class="text-center text-mute text-sm py-6 bg-white rounded-2xl border border-line mb-4">当前筛选条件下暂无匹配衣物</div>'
      : '';

    html += '<div id="an-section-top10" class="text-sm font-semibold mb-2">穿着 TOP10</div>';
    html += '<div id="an-top10-wrap">';
    if(emptyPool){ html += emptyTip; }
    else { html += analysisTopListHtml(data.top); }
    html += '</div>';

    html += '<div id="an-section-value" class="text-sm font-semibold mb-2">价值交叉分析</div>';
    if(emptyPool){ html += emptyTip; }
    else { html += analysisValueCrossHtml(data.expensiveRare, data.cheapFrequent); }

    html += '<div id="an-section-idle" class="text-sm font-semibold mb-2">闲置分析</div>';
    if(emptyPool){ html += emptyTip; }
    else { html += analysisIdleHtml(data.idle); }

    html += '<div id="an-section-advice" class="text-sm font-semibold mb-2">衣橱管家建议</div>';
    html += analysisAdviceHtml(data.advice, emptyPool);
  }

  html += '<div class="h-6"></div></div>';
  return html;
}

function computeAnalysis(){
  var f = analysisFilter;
  var pool = store.clothes.filter(function(c){
    if(!f.includeRetired && c.status==='retired') return false;
    // 仅购入时间落在起止区间内的衣物参与金额、件数等运算
    if(!c.buyDate) return false;
    if(f.buyStart && c.buyDate < f.buyStart) return false;
    if(f.buyEnd && c.buyDate > f.buyEnd) return false;
    if(!clothMatchesAnalysisDims(c)) return false;
    return true;
  });
  var count = pool.length;
  var totalCost = 0; pool.forEach(function(c){ if(c.price) totalCost += Number(c.price); });
  var avgPrice = count ? totalCost/count : 0;
  // 穿着次数（基于购入时间 + 维度筛选后的衣物池）
  var totalWear = 0;
  var wearMap = {};
  pool.forEach(function(c){
    var n = store.logs.filter(function(l){return l.clothId===c.id;}).length;
    wearMap[c.id]=n; totalWear+=n;
  });
  // TOP10：表头排序；无穿着记录永久置底
  var top = buildAnalysisTopList(pool, wearMap);
  // 价值交叉：分位数规则（样本<20 用 P25/P75，否则 P10/P90）
  var cross = buildValueCrossGroups(pool, wearMap);
  var expensiveRare = cross.expensiveRare;
  var cheapFrequent = cross.cheapFrequent;
  // 闲置分析：闲置天数降序 + 当季优先，最多 10 件
  var idle = buildIdleAnalysisList(pool);
  var advice = genAdvice(pool, wearMap, avgPrice);

  return { count:count, totalCost:totalCost, avgPrice:avgPrice, totalWear:totalWear, top:top, expensiveRare:expensiveRare, cheapFrequent:cheapFrequent, idle:idle, advice:advice };
}

function analysisAdviceHtml(advice, emptyPool){
  var html = '<div class="bg-gradient-to-br from-brand-soft to-white rounded-2xl border border-line p-4 space-y-2 mb-1">';
  if(emptyPool){
    html += '<div class="text-xs text-mute">当前筛选条件下暂无匹配衣物</div>';
  } else if(!advice || !advice.length){
    html += '<div class="text-xs text-mute">暂无建议，继续记录穿搭吧</div>';
  } else {
    advice.forEach(function(a){
      var text = typeof a === 'string' ? a : (a.text || '');
      var anchor = typeof a === 'string' ? '' : (a.anchor || '');
      html += '<button type="button" class="an-advice-item w-full text-left text-xs leading-relaxed text-ink/80 flex gap-2 rounded-lg px-1 py-1.5 -mx-1 hover:bg-white/70 active:bg-white/90" data-anchor="'+esc(anchor)+'">';
      html += '<span class="text-brand-dark flex-shrink-0">•</span><span class="flex-1">'+esc(text)+'</span>';
      html += '</button>';
    });
  }
  html += '</div>';
  return html;
}
function bindAnalysisAdviceHandlers(){
  $all('.an-advice-item').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.dataset.anchor;
      if(!id) return;
      var el = document.getElementById(id);
      if(el && el.scrollIntoView){
        el.scrollIntoView({ behavior:'smooth', block:'start' });
      }
    });
  });
}
function genAdvice(pool, wearMap, avgPrice){
  var advice = [];
  if(!pool || !pool.length) return advice;
  var yearAgoDate = (function(){
    var d = new Date(); d.setDate(d.getDate() - 365); return dateStr(d);
  })();

  // 1. 年度衣橱概况 → 统计卡片
  var newBuys = pool.filter(function(c){ return c.buyDate && c.buyDate >= yearAgoDate; });
  var newCount = newBuys.length;
  var pace = newCount <= 6 ? '收敛' : (newCount <= 18 ? '平稳' : '偏快');
  var wearYear = 0;
  pool.forEach(function(c){
    wearYear += store.logs.filter(function(l){ return l.clothId === c.id && l.date >= yearAgoDate; }).length;
  });
  var avgFreq = wearYear / pool.length;
  var freqLabel = avgFreq >= 2 ? '提升' : '偏低';
  var wornN = pool.filter(function(c){ return (wearMap[c.id] || 0) > 0; }).length;
  var utilLabel = (wornN / pool.length) >= 0.65 ? '状态良好' : '有待优化';
  advice.push({
    text: '近一年新增购入'+newCount+'件衣物，购衣节奏'+pace+'；单品平均穿着频次'+freqLabel+'，衣橱利用率'+utilLabel+'。',
    anchor: 'an-section-stats'
  });

  // 2. 长期闲置统计（≥365 天）→ 闲置分析
  var longIdleN = 0;
  pool.forEach(function(c){ if(clothIdleDays(c) >= 365) longIdleN++; });
  if(longIdleN > 0){
    var ratio = Math.round(longIdleN / pool.length * 100);
    var idleText = '衣橱共有'+pool.length+'件有效衣物，'+longIdleN+'件单品超过1年未上身；'+ratio+'%衣物长期闲置';
    if(ratio < 15) idleText += '，闲置占比较低，衣橱流转效率不错。';
    else if(ratio >= 30) idleText += '，闲置比例偏高，建议优先梳理盘活。';
    else idleText += '，可尝试重新搭配或酌情清理。';
    advice.push({ text: idleText, anchor: 'an-section-idle' });
  }

  // 3. 品类消费&穿着洞察（最多各 1 条）→ TOP10
  var catStats = {};
  pool.forEach(function(c){
    var cat = c.category || '其他';
    if(!catStats[cat]) catStats[cat] = { count:0, wear:0, priceSum:0, priceN:0 };
    catStats[cat].count++;
    catStats[cat].wear += (wearMap[c.id] || 0);
    if(c.price != null && c.price !== '' && Number(c.price) > 0){
      catStats[cat].priceSum += Number(c.price);
      catStats[cat].priceN++;
    }
  });
  var hfCat = null, hfScore = -1;
  var luCat = null, luScore = Infinity;
  Object.keys(catStats).forEach(function(cat){
    var s = catStats[cat];
    var avgW = s.wear / s.count;
    var avgP = s.priceN ? (s.priceSum / s.priceN) : null;
    if(avgP != null && avgW >= 2 && avgP <= avgPrice && avgW > hfScore){
      hfScore = avgW;
      hfCat = cat;
    }
    var lowCount = s.count <= Math.max(1, Math.floor(pool.length * 0.12));
    if(lowCount && avgW < 1){
      var score = s.count * 10 + avgW;
      if(score < luScore){ luScore = score; luCat = cat; }
    }
  });
  if(hfCat){
    advice.push({
      text: hfCat+'是你高频穿着品类，现有单品均价偏低；后续选购可适度提升单品单价，选择质感更好的款式。',
      anchor: 'an-section-top10'
    });
  }
  if(luCat && luCat !== hfCat){
    advice.push({
      text: luCat+'购入量、上身频次均偏低，实用性有限；后续建议减少该品类的新增采购。',
      anchor: 'an-section-top10'
    });
  }

  return advice;
}

function statCard(label,val){
  return '<div class="bg-white rounded-2xl border border-line p-4"><div class="text-xs text-mute mb-1">'+label+'</div><div class="text-xl font-semibold">'+esc(val)+'</div></div>';
}

function bindAnalysis(){
  function refreshAnalysis(){
    invalidateAnalysisCache();
    render(); // 先出骨架，再异步算数；不离开分析页
  }
  function syncFilter(immediate){
    persistFilterSetting(!!immediate).catch(function(err){
      toast('筛选保存失败：'+(err.message||err));
    });
  }
  var buyStart = $('#an-buyStart');
  var buyEnd = $('#an-buyEnd');
  var includeEl = $('#an-include');
  if(buyStart) buyStart.addEventListener('change', function(){ analysisFilter.buyStart=this.value; syncFilter(false); refreshAnalysis(); });
  if(buyEnd) buyEnd.addEventListener('change', function(){ analysisFilter.buyEnd=this.value; syncFilter(false); refreshAnalysis(); });
  if(includeEl) includeEl.addEventListener('change', function(){ analysisFilter.includeRetired=this.checked; syncFilter(true); refreshAnalysis(); });
  $all('.dim-btn').forEach(function(b){
    b.addEventListener('click', function(){
      var d = b.dataset.d;
      if(d === 'all'){
        clearAnalysisDimFilters();
        syncFilter(true);
        refreshAnalysis();
        return;
      }
      openAnalysisDimSheet(d);
    });
  });
  $all('.an-tag-remove').forEach(function(b){
    b.addEventListener('click', function(){
      var kind = b.dataset.kind;
      var v = b.dataset.v;
      var key = kind === 'season' ? 'seasons' : (kind === 'scene' ? 'scenes' : 'categories');
      analysisFilter[key] = (analysisFilter[key] || []).filter(function(x){ return x !== v; });
      syncFilter(true);
      refreshAnalysis();
    });
  });
  // TOP10 表头排序：局部刷新，避免全局 render 触发 scrollTo(0,0)
  bindAnalysisTopSortHandlers();
  // 价值交叉：点击卡片展开面板
  bindAnalysisValueCrossHandlers();
  // 闲置分析：点击卡片进详情
  bindAnalysisIdleHandlers();
  // 衣橱管家建议：点击锚点滚动
  bindAnalysisAdviceHandlers();
  var retry = $('#an-retry-load');
  if(retry) retry.addEventListener('click', function(){
    invalidateAnalysisCache();
    scheduleAnalysisCompute();
    render();
  });
}

/* ============================================================
   视图：设置与画像
   ============================================================ */
function viewSettings(){
  var p = store.profile;
  var pref = p.prefStyles || [];
  var html = '';
  html += '<div class="page-shell px-5 pt-6 space-y-4" style="padding-top:var(--page-pad-top)">';
  html += '<div class="page-heading text-lg font-semibold">个人穿搭画像</div>';

  // 基础信息 + 穿搭偏好（同一卡片）
  html += '<div class="bg-white rounded-2xl border border-line p-4 space-y-4">';
  html += '<div class="flex items-center gap-4">';
  html += '<label class="cursor-pointer flex-shrink-0">';
  html += '<input id="p-avatar-file" type="file" accept="image/*" class="hidden" />';
  if(p.avatar){
    html += '<div class="avatar-circle" style="width:4.5rem;height:4.5rem"><img id="p-avatar-preview" src="'+p.avatar+'" alt="" /></div>';
  } else {
    html += '<div class="avatar-circle avatar-placeholder" style="width:4.5rem;height:4.5rem" id="p-avatar-preview"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>';
  }
  html += '</label>';
  html += '<div class="text-xs text-mute whitespace-nowrap">点击头像上传</div></div>';

  html += '<div><div class="text-xs text-mute mb-1">姓名</div><input id="p-name" class="w-full bg-paper rounded-xl border border-line p-2.5 text-sm" value="'+esc(p.name||'')+'" placeholder="你的称呼" /></div>';
  html += '<div class="grid grid-cols-2 gap-3">';
  html += '<div><div class="text-xs text-mute mb-1">年龄</div><input id="p-age" type="number" class="w-full bg-paper rounded-xl border border-line p-2.5 text-sm" value="'+esc(p.age)+'" placeholder="选填" /></div>';
  html += '<div><div class="text-xs text-mute mb-1">MBTI</div><input id="p-mbti" class="w-full bg-paper rounded-xl border border-line p-2.5 text-sm" value="'+esc(p.mbti||'')+'" placeholder="如 INFP" /></div>';
  html += '</div>';
  html += '<div><div class="text-xs text-mute mb-1">城市</div><input id="p-city" class="w-full bg-paper rounded-xl border border-line p-2.5 text-sm" value="'+esc(p.city)+'" placeholder="默认城市" /></div>';

  html += '<div>';
  html += '<div class="text-xs text-mute mb-2">穿搭偏好</div>';
  html += '<div class="profile-style-tags" id="p-pref-tags">';
  STYLE_TAGS.forEach(function(s){
    var on = pref.indexOf(s) >= 0;
    html += '<button type="button" class="profile-style-chip'+(on?' on':'')+'" data-style="'+esc(s)+'">'+esc(s)+'</button>';
  });
  html += '</div></div>';

  html += '<button id="p-save" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium">保存画像</button>';
  html += '</div>';

  // 数据备份（精简）
  html += '<div class="bg-white rounded-2xl border border-line p-4 space-y-3">';
  html += '<div class="text-sm font-semibold">数据备份</div>';
  html += '<div class="grid grid-cols-2 gap-2.5">';
  html += '<button id="b-export" type="button" class="bg-paper border border-line rounded-xl py-2.5 text-sm font-medium">导出备份</button>';
  html += '<label class="block"><input id="b-file" type="file" accept="application/json,.json" class="hidden" />';
  html += '<div class="bg-paper border border-line rounded-xl py-2.5 text-sm font-medium text-center">导入恢复</div></label>';
  html += '</div>';
  html += '<div class="text-xs text-mute leading-relaxed">导入会同步到云端衣橱（先清空远端衣物再写入备份中的衣物）。请先导出备份。</div>';
  html += '</div>';

  // PWA：手动同步云端 + 检查应用更新（主屏幕无浏览器刷新时使用）
  html += '<div class="bg-white rounded-2xl border border-line p-4 space-y-3">';
  html += '<div class="text-sm font-semibold">同步与更新</div>';
  html += '<button id="btn-sync-cloud" type="button" class="w-full bg-brand text-white rounded-xl py-3 text-sm font-medium">同步云端数据</button>';
  html += '<button id="btn-check-update" type="button" class="w-full bg-paper border border-line rounded-xl py-2.5 text-sm font-medium">检查应用更新</button>';
  html += '<div class="text-xs text-mute leading-relaxed">主屏幕打开时可用「同步云端数据」拉取最新衣物与打卡；「检查应用更新」用于获取 Vercel 新版本。</div>';
  html += '</div>';

  html += '<div class="text-center text-xs text-mute py-2">衣物数据保存在云端 API</div>';
  html += '<div class="h-6"></div></div>';
  return html;
}

var _profileSaving = false;
var _avatarUploading = false;

function bindSettings(){
  var p = store.profile;
  var pref = (p.prefStyles || []).slice();

  var avatarFile = $('#p-avatar-file');
  if(avatarFile) avatarFile.addEventListener('change', function(e){
    var file = e.target.files[0]; if(!file) return;
    if(_avatarUploading){ toast('头像仍在上传，请稍候'); return; }
    _avatarUploading = true;
    toast('头像上传中…');
    // 上传 R2：POST /upload-image，禁止 Base64 写入 D1
    api.uploadImage(file).then(function(res){
      _avatarUploading = false;
      if(!res.ok || !res.data || !res.data.url){
        toast('头像上传失败：'+(res.error || '未返回 url'));
        return;
      }
      var url = String(res.data.url).trim();
      store.profile.avatar = url;
      var prev = $('#p-avatar-preview');
      if(prev){
        if(prev.tagName === 'IMG') prev.src = url;
        else prev.outerHTML = '<div class="avatar-circle" style="width:4.5rem;height:4.5rem"><img id="p-avatar-preview" src="'+esc(url)+'" alt="" /></div>';
      }
      toast('头像已上传，请点击「保存画像」同步到云端');
    }).catch(function(err){
      _avatarUploading = false;
      toast('头像上传失败：'+(err.message||err));
    });
  });

  $all('#p-pref-tags .profile-style-chip').forEach(function(btn){
    btn.addEventListener('click', function(){
      var s = btn.dataset.style;
      var i = pref.indexOf(s);
      if(i >= 0){ pref.splice(i, 1); btn.classList.remove('on'); }
      else { pref.push(s); btn.classList.add('on'); }
    });
  });

  $('#p-save').addEventListener('click', function(){
    if(_profileSaving){ toast('正在保存，请稍候'); return; }
    if(_avatarUploading){ toast('头像仍在上传，请稍候'); return; }
    var name = ($('#p-name').value || '').trim();
    var age = ($('#p-age').value || '').trim();
    var mbti = ($('#p-mbti').value || '').trim();
    var city = ($('#p-city').value || '').trim() || '北京';
    store.profile.name = name;
    store.profile.age = age;
    store.profile.mbti = mbti;
    store.profile.city = city;
    store.profile.prefStyles = pref.slice();
    store.weather.city = city;
    _profileSaving = true;
    showLoading('保存画像中…');
    // PUT /user_profile，完整资料进 D1（无 localStorage）
    saveUserProfileToApi().then(function(){
      _profileSaving = false;
      hideLoading();
      refreshWeather(city, function(ok){
        toast(ok ? '画像已保存' : '画像已保存，天气获取失败');
      });
    }).catch(function(err){
      _profileSaving = false;
      hideLoading();
      toast('画像保存失败：'+(err.message||err));
    });
  });
  $('#b-export').addEventListener('click', exportFullBackup);
  $('#b-file').addEventListener('change', importBackup);

  var syncBtn = $('#btn-sync-cloud');
  if(syncBtn) syncBtn.addEventListener('click', reloadCloudData);
  var updateBtn = $('#btn-check-update');
  if(updateBtn) updateBtn.addEventListener('click', function(){
    toast('正在检查更新…');
    checkForAppUpdate().then(function(status){
      if(status === 'latest') toast('已是最新版本');
      else if(status === 'unsupported') toast('当前环境不支持应用更新检查');
      else if(status === 'error') toast('检查更新失败，请稍后重试');
      // 'updated' 会弹出确认框并由 SW 刷新页面
    });
  });
}

/** 手动同步：重新拉取云端资源并刷新当前页（不改 dataStore 内部实现） */
function reloadCloudData(){
  showLoading('同步云端数据…');
  initDataStore().then(function(res){
    if(!res.ok) throw new Error(res.error || '云端数据加载失败');
    syncClothesFromDataStore();
    applyCloudProfileToStore(getUserProfile());
    applyCloudDocumentsToStore();
    if(store.profile.city) store.weather.city = store.profile.city;
    hideLoading();
    if(typeof render === 'function') render();
    refreshWeather(store.weather.city || store.profile.city || '北京');
    toast('云端数据已同步');
  }).catch(function(err){
    hideLoading();
    console.error('[衣橱] 手动同步失败', err);
    toast('同步失败：'+(err.message||err));
  });
}

function exportFullBackup(){
  var backup = clone(store);
  backup.exportedAt = new Date().toISOString();
  downloadJSON(backup, '穿搭衣橱_完整备份_'+todayStr()+'.json');
  toast('已导出完整备份');
}

function importBackup(e){
  var file = e.target.files[0]; if(!file) return;
  e.target.value = '';
  var reader = new FileReader();
  reader.onload = function(ev){
    try{
      var data = JSON.parse(ev.target.result);
      if(!data || typeof data !== 'object' || !('clothes' in data) || !('profile' in data)) throw new Error('格式不符');
      if(!confirm('导入会替换云端衣橱中的全部衣物，确认继续？')) return;
      if(!confirm('再次确认：此操作不可撤销，当前云端衣物将被备份文件中的衣物覆盖。确定导入？')) return;
      mergeDefaults(data, DEFAULT_STORE);
      var clothes = Array.isArray(data.clothes) ? data.clothes : [];
      var profile = data.profile;
      var rest = data;
      showLoading('导入同步中…');
      var existing = getClothes().slice();
      var chain = Promise.resolve();
      existing.forEach(function(it){
        if(it && it.id) chain = chain.then(function(){
          return removeCloth(it.id).then(function(res){
            if(!res.ok) throw new Error(res.error || '删除失败');
          });
        });
      });
      chain.then(function(){
        var cchain = Promise.resolve();
        clothes.forEach(function(c){
          if(!c.id) c.id = uid();
          cchain = cchain.then(function(){
            return addCloth(clothToStoreItem(c)).then(function(res){
              if(!res.ok) throw new Error(res.error || '新增失败');
            });
          });
        });
        return cchain;
      }).then(function(){
        store = clone(DEFAULT_STORE);
        if(profile) store.profile = Object.assign(store.profile, stripSensitiveFields(profile));
        if(rest.customScenes) store.customScenes = rest.customScenes;
        // aiConfig.apiKey 绝不上传；仅合并非敏感会话配置
        if(rest.aiConfig){
          store.aiConfig = Object.assign(store.aiConfig, {
            cloudEnabled: !!rest.aiConfig.cloudEnabled,
            apiUrl: rest.aiConfig.apiUrl || store.aiConfig.apiUrl,
            modelName: rest.aiConfig.modelName || store.aiConfig.modelName
          });
        }
        if(rest.checkins) store.checkins = rest.checkins;
        if(rest.logs) store.logs = rest.logs;
        if(rest.outfit) store.outfit = rest.outfit;
        return Promise.all([
          fetchClothes(),
          saveUserProfileToApi(),
          persistCheckins(),
          persistLogs(),
          persistCustomScenes(),
          persistOutfit(),
          persistFilterSetting(true)
        ]);
      }).then(function(results){
        var clothesRes = results[0];
        if(clothesRes && clothesRes.ok === false) throw new Error(clothesRes.error || '刷新失败');
        syncClothesFromDataStore();
        hideLoading();
        render();
        toast('导入成功');
      }).catch(function(err){
        hideLoading();
        toast('导入失败：'+(err.message||err));
      });
    }catch(err){ toast('导入失败：'+err.message); }
  };
  reader.readAsText(file);
}

/* ============================================================
   Sheet 通用
   ============================================================ */
function sheetHeader(title){
  return '<div class="sticky top-0 bg-paper pt-4 pb-2 px-5 flex items-center justify-between z-10 border-b border-line">'
    + '<div class="text-base font-semibold">'+esc(title)+'</div>'
    + '<button class="close-sheet text-mute p-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
}

/* 事件委托：关闭按钮 */
document.addEventListener('click', function(e){
  if(e.target.closest('.close-sheet')) closeSheet();
});

/* ============================================================
   Tab 切换
   ============================================================ */
$all('.tab-btn').forEach(function(b){
  b.addEventListener('click', function(){
    currentTab = b.dataset.tab;
    render();
  });
});
var tabCheckinFab = $('#tab-checkin-fab');
if(tabCheckinFab) tabCheckinFab.addEventListener('click', function(){
  openCheckin();
});

/* ---------- 主渲染分发 ---------- */
var _origRender = render;
render = function(){
  try{
    _origRender();
  }catch(err){
    console.warn('[render] 失败', err);
    // 分析页渲染异常：留在分析页展示错误，禁止回跳衣橱
    if(currentTab === 'analysis'){
      analysisLoadError = '数据加载失败';
      analysisDataCache = null;
      try{
        var app = $('#app');
        if(app) app.innerHTML = viewAnalysis();
      }catch(e2){
        var app2 = $('#app');
        if(app2) app2.innerHTML = '<div class="px-5 pt-10 text-center text-sm text-bad">数据加载失败</div>';
      }
      try{ bindAnalysis(); }catch(e3){}
      return;
    }
    throw err;
  }
  if(currentTab==='today') bindToday();
  else if(currentTab==='closet') bindCloset();
  else if(currentTab==='analysis'){
    bindAnalysis();
    // 进入分析页：先骨架，再异步统计；筛选变化时 cache key 不匹配也会重算
    var needCompute = !analysisLoading && (
      !!analysisLoadError ||
      !analysisDataCache ||
      analysisCacheKey !== analysisFilterKey()
    );
    if(needCompute) scheduleAnalysisCompute();
  }
  else if(currentTab==='settings') bindSettings();
};

/* ============================================================
   启动
   ============================================================ */
export function mountWardrobeApp(){
  initStore();
  bindDataStoreView();
  showLoading('加载云端数据…');
  // 并行拉取全部已注册资源；全部成功后再映射到 store 并渲染
  initDataStore().then(function(res){
    if(!res.ok) throw new Error(res.error || '云端数据加载失败');
    syncClothesFromDataStore();
    applyCloudProfileToStore(getUserProfile());
    applyCloudDocumentsToStore();
    if(store.profile.city) store.weather.city = store.profile.city;
    hideLoading();
    if(typeof render === 'function') render();
    refreshWeather(store.weather.city || store.profile.city || '北京');
  }).catch(function(err){
    hideLoading();
    console.error('[衣橱] 云端数据加载失败', err);
    toast('云端数据加载失败：'+(err.message||err));
    // 失败时展示明确错误态，不用本地默认值冒充远端数据
    var app = $('#app');
    if(app){
      app.innerHTML = '<div class="px-5 pt-16 text-center space-y-3">'
        + '<div class="text-base font-semibold text-ink">云端数据加载失败</div>'
        + '<div class="text-sm text-mute leading-relaxed">'+(esc(err.message||err))+'</div>'
        + '<button id="retry-cloud-load" class="bg-brand text-white rounded-xl px-5 py-2.5 text-sm">重试</button>'
        + '</div>';
      var btn = $('#retry-cloud-load');
      if(btn) btn.addEventListener('click', function(){ mountWardrobeApp(); });
    }
  });
}
