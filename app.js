const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "outside-redmond-guide-v1";
const THEMES = new Set(["editorial", "atlas", "night"]);
const SEASON_NAMES = { spring: "春", summer: "夏", fall: "秋", winter: "冬" };
const ACCESS_NAMES = { road: "陸路", ferry: "含渡輪", optional: "可走陸路", border: "需過境" };
const RAIN_NAMES = { good: "室內替代充足", mixed: "小雨可調整", outdoor: "好天氣更值得" };
const SCENES = new Set(["mountain", "village", "city", "harbor", "lake", "farm", "garden", "coast"]);
const INTEREST_ICONS = { town: "town", coffee: "coffee", music: "music", walk: "walk", scenery: "view", hike: "mountain" };
const PLACE_KINDS = { coffee: "咖啡", food: "餐飲", music: "音樂", sight: "風景", walk: "步道", indoor: "室內內容", shopping: "逛店", culture: "文化", town: "小鎮街區" };
const PLACE_FILTERS = { all: "全部地點", coffee: "咖啡", food: "吃飯", indoor: "有室內", outdoors: "步道風景", music: "音樂" };
const DIFFICULTY_NAMES = { easy: "輕鬆", "easy-moderate": "輕鬆～中等", moderate: "中等", "moderate-hard": "中等～困難", hard: "困難" };
const DAY_MS = 86400000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const TRIP_LENGTHS = { 1: "一日遊", 2: "兩日遊", 3: "三日遊" };
const REDMOND = { id: "redmond", name: "Redmond", query: "Redmond, WA" };
const BUSINESS_KINDS = new Set(["coffee", "food", "music", "shopping", "culture", "indoor"]);

const state = {
  data: null,
  cities: new Map(),
  regions: new Map(),
  guideData: null,
  guides: new Map(),
  trailData: null,
  trails: new Map(),
  interestCatalog: new Map(),
  interestFilters: new Set(),
  filtered: [],
  region: "all",
  query: "",
  maxDrive: 240,
  season: "all",
  trip: "all",
  country: "all",
  picks: false,
  rain: false,
  easy: false,
  favoritesOnly: false,
  favorites: new Set(),
  style: "atlas",
  sort: "far",
  view: "cards",
  limit: 12,
  activeCity: null,
  placeCategory: "all",
  activePlan: null,
  tripData: null,
  trips: new Map(),
  tripLength: 1,
  activeTrip: null,
  planDate: null,
};
const cityDialog = $("#city-dialog");
const methodDialog = $("#method-dialog");
const tripDialog = $("#trip-dialog");
const mapSvg = $("#destination-map");
let coast;
let camera = { x: 0, y: 0, width: 1200, height: 1000 };
let toastTimer;
let inputTimer;
let mapDrag = null;
let lastDialogTrigger = null;
let lastTripTrigger = null;
const preferenceWarnings = [];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function artwork(scene, className = "") {
  return `<svg class="${className}" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#scene-${scene}"/></svg>`;
}

function sourceURL(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`來源必須使用 HTTPS：${raw}`);
  return escapeHTML(url.href);
}

function timePart(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest ? String(rest).padStart(2, "0") : ""}`;
}

function driveLabel(city) {
  return `${timePart(city.drive[0])}–${timePart(city.drive[1])}`;
}

function driveAccessibleLabel(city) {
  const part = (minutes) => `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;
  return `${part(city.drive[0])}至${part(city.drive[1])}`;
}

function minutesFromClock(raw) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw new Error(`無效時段：${raw}`);
  const [hours, minutes] = raw.split(":").map(Number);
  return hours * 60 + minutes;
}

function clockLabel(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function stayLabel(minutes) {
  if (minutes < 60) return `${minutes} 分鐘`;
  return `${Math.floor(minutes / 60)} 小時${minutes % 60 ? ` ${minutes % 60} 分` : ""}`;
}

function mapsURL(query) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  return escapeHTML(url.href);
}

function navigationURL(destination, origin = null, mode = "drive") {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", destination);
  if (origin) url.searchParams.set("origin", origin);
  url.searchParams.set("travelmode", mode === "walk" ? "walking" : "driving");
  return escapeHTML(url.href);
}

function localToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseISODate(raw) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）`;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function validMonths(months) {
  return Array.isArray(months) && months.length > 0 && new Set(months).size === months.length
    && months.every((month) => Number.isInteger(month) && month >= 1 && month <= 12);
}

function monthsLabel(months) {
  if (months.length === 12) return "全年";
  const included = new Set(months);
  let start = 1;
  while (included.has(start)) start += 1;
  const runs = [];
  let run = null;
  for (let offset = 0; offset < 12; offset++) {
    const month = (start - 1 + offset) % 12 + 1;
    if (included.has(month)) {
      if (run) run[1] = month;
      else run = [month, month];
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs.map(([first, last]) => (first === last ? `${first} 月` : `${first}–${last} 月`)).join("、");
}

// A closure's end is the expected reopening day, so the trail is closed on [start, end). A null start means already in effect.
function closureActive(closure, date) {
  return (closure.start === null || parseISODate(closure.start) <= date) && (closure.end === null || date < parseISODate(closure.end));
}

function trailStatus(trail, date = state.planDate) {
  const active = trail.closures.filter((closure) => closureActive(closure, date));
  const full = active.find((closure) => closure.scope === "full");
  if (full) {
    return { tone: "closed", label: full.end ? `封閉中・預計 ${dateLabel(parseISODate(full.end))}重開` : "封閉中・重開日未公告", detail: full.note };
  }
  const month = date.getMonth() + 1;
  if (!trail.months.includes(month)) return { tone: "off", label: `${month} 月不在建議月份`, detail: trail.winter };
  const upcoming = trail.closures.find((item) => {
    if (item.scope !== "full" || item.start === null) return false;
    const start = parseISODate(item.start);
    return start > date && (start - date) / DAY_MS <= 21;
  });
  if (upcoming) return { tone: "soon", label: `${dateLabel(parseISODate(upcoming.start))}起封閉`, detail: upcoming.note };
  const partial = active.filter((closure) => closure.scope === "partial");
  if (partial.length) return { tone: "notice", label: "可走・有局部封閉公告", detail: partial.map((closure) => closure.note).join(" ") };
  return { tone: "ok", label: `${month} 月在建議月份內`, detail: null };
}

function planDateControl() {
  return `<label class="plan-date">出發日<input type="date" data-plan-date value="${isoDate(state.planDate)}"></label>`;
}

function validateData(data) {
  if (data.version !== 1 || !Array.isArray(data.cities) || !data.cities.length || !Array.isArray(data.regions)) {
    throw new Error("城市資料格式不符，請重新整理或檢查 cities.json。");
  }
  const ids = new Set();
  const regions = new Set(data.regions.map((region) => region.id));
  for (const region of data.regions) {
    if (!/^[a-z-]+$/.test(region.id) || !/^#[\da-f]{6}$/i.test(region.color)) throw new Error("地區設定格式錯誤。");
  }
  for (const city of data.cities) {
    if (!/^[a-z-]+$/.test(city.id) || ids.has(city.id)) throw new Error(`城市 ID 重複或格式不符：${city.id}`);
    ids.add(city.id);
    if (!regions.has(city.region) || !SCENES.has(city.scene)) throw new Error(`城市分類不符：${city.id}`);
    for (const field of ["name", "subtitle", "stay", "line", "why", "food", "seasonNote", "rainNote", "stroller", "watch"]) {
      if (typeof city[field] !== "string" || !city[field].trim()) throw new Error(`${city.id} 缺少 ${field}`);
    }
    if (!Array.isArray(city.drive) || city.drive.length !== 2 || !city.drive.every(Number.isInteger)
      || city.drive[0] <= 0 || city.drive[0] > city.drive[1] || city.drive[1] > 240) {
      throw new Error(`${city.id} 的車程必須是四小時內的有效區間。`);
    }
    if (!Number.isFinite(city.lat) || !Number.isFinite(city.lon)
      || city.lat < 45 || city.lat > 50 || city.lon < -126 || city.lon > -119) {
      throw new Error(`${city.id} 的座標不在指南範圍內。`);
    }
    if (!(city.access in ACCESS_NAMES) || !(city.rain in RAIN_NAMES)
      || typeof city.easy !== "boolean" || typeof city.pick !== "boolean"
      || !["WA", "OR", "BC"].includes(city.area)) throw new Error(`${city.id} 的實用資訊格式不符。`);
    if (!Array.isArray(city.seasons) || !city.seasons.length || city.seasons.some((season) => !(season in SEASON_NAMES))) {
      throw new Error(`${city.id} 的季節資料格式不符。`);
    }
    if (!Array.isArray(city.trip) || !city.trip.length || city.trip.some((trip) => !["half", "day", "overnight"].includes(trip))) {
      throw new Error(`${city.id} 的行程長度格式不符。`);
    }
    if (!Array.isArray(city.tags) || !city.tags.length || city.tags.some((tag) => typeof tag !== "string")) {
      throw new Error(`${city.id} 缺少玩法標籤。`);
    }
    if (!Array.isArray(city.stops) || city.stops.length < 3
      || city.stops.some((stop) => !Array.isArray(stop) || stop.length !== 2 || stop.some((text) => typeof text !== "string" || !text))) {
      throw new Error(`${city.id} 需要至少三個具體看點。`);
    }
    if (!Array.isArray(city.route) || city.route.length < 3 || city.route.some((step) => typeof step !== "string" || !step)) {
      throw new Error(`${city.id} 缺少完整玩法。`);
    }
    if (!Array.isArray(city.sources) || !city.sources.length) throw new Error(`${city.id} 缺少來源。`);
    for (const source of city.sources) {
      if (!Array.isArray(source) || source.length !== 2 || typeof source[0] !== "string") throw new Error(`${city.id} 來源格式錯誤。`);
      sourceURL(source[1]);
    }
  }
  for (const city of data.cities) {
    if (!Array.isArray(city.pairWith) || city.pairWith.some((id) => !ids.has(id) || id === city.id)) {
      throw new Error(`${city.id} 的搭配城市不存在。`);
    }
  }
}

function validateTrailSeason(trail) {
  if (typeof trail.winter !== "string" || !trail.winter.trim()) throw new Error(`${trail.id} 缺少冬季說明。`);
  if (!validMonths(trail.months)) throw new Error(`${trail.id} 的可走月份不符。`);
  if (trail.roadAccess !== null && (typeof trail.roadAccess !== "string" || !trail.roadAccess.trim())) throw new Error(`${trail.id} 的道路季節說明不符。`);
  if (!Array.isArray(trail.status) || !trail.status.length
    || trail.status.some((item) => !Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || !item[0].trim())) throw new Error(`${trail.id} 缺少即時狀態連結。`);
  for (const [, url] of trail.status) sourceURL(url);
  if (!Array.isArray(trail.closures)) throw new Error(`${trail.id} 的封閉資料不符。`);
  for (const closure of trail.closures) {
    const start = closure.start === null ? null : parseISODate(closure.start);
    const end = closure.end === null ? null : parseISODate(closure.end);
    if (!["full", "partial"].includes(closure.scope) || (closure.start !== null && !start) || (closure.end !== null && !end)
      || (start && end && end <= start) || typeof closure.note !== "string" || !closure.note.trim()) throw new Error(`${trail.id} 的封閉資料不符。`);
    sourceURL(closure.source);
  }
}

function validateDetailedData(data, details, trailData) {
  if (details.version !== 1 || trailData.version !== 2 || !details.guides
    || !Array.isArray(details.interests) || !Array.isArray(trailData.items)) throw new Error("詳細指南資料格式不符。");
  const interestIds = new Set(details.interests.map((interest) => interest.id));
  if (interestIds.size !== 6 || [...interestIds].some((id) => !(id in INTEREST_ICONS))) throw new Error("探索興趣設定不符。");
  const trailMap = new Map();
  for (const trail of trailData.items) {
    if (!/^[a-z0-9-]+$/.test(trail.id) || trailMap.has(trail.id)) throw new Error(`步道 ID 重複／格式錯誤：${trail.id}`);
    const metric = Number.isFinite(trail.km) && trail.km > 0 && Number.isFinite(trail.gainM) && trail.gainM >= 0;
    const imperial = Number.isFinite(trail.miles) && trail.miles > 0 && Number.isFinite(trail.gainFt) && trail.gainFt >= 0;
    if (Number(metric) + Number(imperial) !== 1 || !(trail.difficulty in DIFFICULTY_NAMES)
      || typeof trail.climb !== "boolean") throw new Error(`${trail.id} 的距離／爬升／難度不符。`);
    if (!Array.isArray(trail.duration) || trail.duration.length !== 2
      || !trail.duration.every(Number.isInteger) || trail.duration[0] <= 0 || trail.duration[1] < trail.duration[0]) throw new Error(`${trail.id} 的規劃耗時不符。`);
    if (trail.trailhead !== undefined && (!Array.isArray(trail.trailhead) || trail.trailhead.length !== 2
      || !trail.trailhead.every(Number.isFinite))) throw new Error(`${trail.id} 登山口座標無效。`);
    if (trail.trailhead === undefined && (typeof trail.query !== "string" || !trail.query.trim())) throw new Error(`${trail.id} 缺少可定位登山口。`);
    for (const field of ["name", "pass", "note", "access"]) if (typeof trail[field] !== "string" || !trail[field].trim()) throw new Error(`${trail.id} 缺少 ${field}`);
    sourceURL(trail.source);
    validateTrailSeason(trail);
    trailMap.set(trail.id, trail);
  }
  if (Object.keys(details.guides).length !== data.cities.length) throw new Error("每個目的地都必須有詳細指南，不使用舊的簡略資料回退。");
  for (const city of data.cities) {
    const guide = details.guides[city.id];
    if (!guide || typeof guide.intro !== "string" || !guide.intro.trim() || !Array.isArray(guide.places) || guide.places.length < 6) {
      throw new Error(`${city.id} 缺少至少六個實際地點。`);
    }
    if (!Array.isArray(guide.interests) || !guide.interests.length || guide.interests.some((id) => !interestIds.has(id))) throw new Error(`${city.id} 的興趣分類不符。`);
    const places = new Map();
    for (const place of guide.places) {
      if (!/^[a-z0-9-]+$/.test(place.id) || places.has(place.id)) throw new Error(`${city.id} 地點 ID 重複／不符：${place.id}`);
      for (const field of ["name", "note", "query"]) if (typeof place[field] !== "string" || !place[field].trim()) throw new Error(`${city.id}/${place.id} 缺少 ${field}`);
      if (!Number.isInteger(place.minutes) || place.minutes <= 0 || typeof place.indoor !== "boolean"
        || !Array.isArray(place.kinds) || !place.kinds.length || place.kinds.some((kind) => !(kind in PLACE_KINDS))) throw new Error(`${city.id}/${place.id} 實用資料不符。`);
      if (place.program !== undefined && typeof place.program !== "boolean") throw new Error(`${city.id}/${place.id} 節目型別不符。`);
      if (place.program && !place.url) throw new Error(`${city.id}/${place.id} 節目需要可查日期與場地的來源。`);
      if (place.verified !== undefined && !parseISODate(place.verified)) throw new Error(`${city.id}/${place.id} 查證日期不符。`);
      for (const field of ["hours", "liveMusic"]) if (place[field] !== undefined && (typeof place[field] !== "string" || !place[field].trim())) throw new Error(`${city.id}/${place.id} 的 ${field} 不符。`);
      if (place.query.trim().length < 8 || normalize(place.query) === normalize(city.name)) throw new Error(`${city.id}/${place.id} 不能只以城市名稱代替地點定位。`);
      if (place.url !== undefined) sourceURL(place.url);
      places.set(place.id, place);
    }
    if (!Array.isArray(guide.plans) || !guide.plans.length) throw new Error(`${city.id} 缺少時間路線。`);
    const planIds = new Set();
    for (const plan of guide.plans) {
      if (!/^[a-z0-9-]+$/.test(plan.id) || planIds.has(plan.id) || !plan.title || !plan.note
        || !Array.isArray(plan.steps) || plan.steps.length < 3) throw new Error(`${city.id} 的路線格式不符。`);
      planIds.add(plan.id);
      let previousEnd = 0;
      for (const step of plan.steps) {
        if (!Array.isArray(step) || step.length !== 6) throw new Error(`${city.id}/${plan.id} 步驟不符。`);
        const [at, placeId, minutes, transfer, note, mode] = step;
        const start = minutesFromClock(at);
        if (!places.has(placeId) || !Number.isInteger(minutes) || minutes <= 0 || !Number.isInteger(transfer)
          || transfer < 0 || typeof note !== "string" || !note.trim() || !["walk", "drive"].includes(mode)) throw new Error(`${city.id}/${plan.id} 步驟地點／時間不符。`);
        if (places.get(placeId).program) throw new Error(`${city.id}/${plan.id} 不能把未確認場地的節目當固定行程。`);
        if (start < previousEnd + transfer || start + minutes >= 1440) throw new Error(`${city.id}/${plan.id} 時段重疊或未留轉場。`);
        previousEnd = start + minutes;
      }
    }
    for (const key of ["rainPlaces", "musicPlaces"]) {
      if (!Array.isArray(guide[key]) || guide[key].some((id) => !places.has(id))) throw new Error(`${city.id}/${key} 含不存在地點。`);
    }
    if (guide.rainPlaces.some((id) => !places.get(id).indoor)) throw new Error(`${city.id} 雨天室內清單含戶外地點。`);
    if (guide.musicPlaces.some((id) => !places.get(id).kinds.includes("music"))) throw new Error(`${city.id} 音樂清單含非音樂地點。`);
    if (!Array.isArray(guide.hikes) || guide.hikes.some((hike) => !trailMap.has(hike.trail)
      || !Array.isArray(hike.drive) || hike.drive.length !== 2 || !hike.drive.every(Number.isInteger)
      || hike.drive[0] < 0 || hike.drive[1] < hike.drive[0] || !hike.note)) throw new Error(`${city.id} 步道參照不符。`);
    const hasClimb = guide.hikes.some((hike) => trailMap.get(hike.trail).climb);
    if (hasClimb !== guide.interests.includes("hike")) throw new Error(`${city.id} 的爬山分類必須對應真正的指定路線。`);
    for (const field of ["rainNote", "musicNote"]) if (typeof guide[field] !== "string" || !guide[field].trim()) throw new Error(`${city.id} 缺少 ${field}`);
  }
}

function readPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const preferences = JSON.parse(raw);
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) throw new SyntaxError("偏好不是物件。");
    return preferences;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException) {
      console.warn("OUTSIDE：無法讀取瀏覽器偏好。", error);
      preferenceWarnings.push("無法讀取先前的瀏覽器偏好；這次仍可瀏覽，收藏需重新確認。");
      return {};
    }
    throw error;
  }
}

function persistPreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ style: state.style, favorites: [...state.favorites] }));
    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      console.warn("OUTSIDE：瀏覽器不允許儲存偏好。", error);
      return false;
    }
    throw error;
  }
}

function updateURL(cityId = state.activeCity, tripId = state.activeTrip) {
  const url = new URL(window.location.href);
  url.searchParams.set("style", state.style);
  if (tripId) url.searchParams.set("trip", tripId);
  else url.searchParams.delete("trip");
  if (cityId) url.searchParams.set("city", cityId);
  else url.searchParams.delete("city");
  if (state.planDate && isoDate(state.planDate) !== isoDate(localToday())) url.searchParams.set("date", isoDate(state.planDate));
  else url.searchParams.delete("date");
  history.replaceState(null, "", url);
}

function applyStyle(style) {
  if (!THEMES.has(style)) throw new Error(`未知的網站風格：${style}`);
  state.style = style;
  document.body.dataset.theme = style;
  $('meta[name="theme-color"]').content = { editorial: "#f5f2e9", atlas: "#f4f7f5", night: "#111e25" }[style];
  state.view = style === "atlas" ? "map" : "cards";
  updateView();
}

function showToast(message) {
  clearTimeout(toastTimer);
  for (const element of [...$$(".dialog-feedback"), $("#toast")]) element.hidden = true;
  const dialog = [cityDialog, tripDialog].find((item) => item.open && $(".dialog-feedback", item));
  const target = dialog ? $(".dialog-feedback", dialog) : $("#toast");
  target.textContent = message;
  target.hidden = false;
  toastTimer = setTimeout(() => { target.hidden = true; }, 4300);
}

async function fetchJSON(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path} 讀取失敗（HTTP ${response.status}）。`);
  return response.json();
}

function normalize(text) {
  return text.normalize("NFKC").toLocaleLowerCase();
}

function searchableCity(city) {
  const guide = state.guides.get(city.id);
  return normalize([
    city.name, city.subtitle, city.area, city.area === "BC" ? "加拿大 Canada" : "美國 USA",
    state.regions.get(city.region).name, city.line, guide.intro, ...city.tags,
    ...guide.places.flatMap((place) => [place.name, place.note, place.query]),
    ...guide.interests.map((id) => state.interestCatalog.get(id).name),
    ...guide.hikes.map((hike) => state.trails.get(hike.trail).name),
  ].join(" "));
}

function filterCities() {
  const words = normalize(state.query.trim()).split(/\s+/).filter(Boolean);
  const filtered = state.data.cities.filter((city) => {
    const guide = state.guides.get(city.id);
    if (city.drive[1] > state.maxDrive) return false;
    if (state.region !== "all" && city.region !== state.region) return false;
    if (state.country !== "all" && (city.area === "BC" ? "CA" : "US") !== state.country) return false;
    if (state.season !== "all" && !city.seasons.includes(state.season)) return false;
    if (state.trip !== "all" && !city.trip.includes(state.trip)) return false;
    if (state.picks && !city.pick) return false;
    if (state.rain && city.rain !== "good") return false;
    if (state.easy && !city.easy) return false;
    if (state.favoritesOnly && !state.favorites.has(city.id)) return false;
    if (state.interestFilters.size && ![...state.interestFilters].every((id) => guide.interests.includes(id))) return false;
    if (words.length && !words.every((word) => city.searchText.includes(word))) return false;
    return true;
  });
  const far = (a, b) => b.drive[1] - a.drive[1] || b.drive[0] - a.drive[0] || a.name.localeCompare(b.name, "en");
  const compare = {
    far,
    near: (a, b) => a.drive[1] - b.drive[1] || a.drive[0] - b.drive[0] || a.name.localeCompare(b.name, "en"),
    picks: (a, b) => Number(b.pick) - Number(a.pick) || far(a, b),
    name: (a, b) => a.name.localeCompare(b.name, "en"),
  }[state.sort];
  return filtered.sort(compare);
}

function cardHTML(city) {
  const region = state.regions.get(city.region);
  const guide = state.guides.get(city.id);
  const coffeeCount = guide.places.filter((place) => place.kinds.includes("coffee")).length;
  const tags = guide.interests.includes("hike") ? [...guide.interests.filter((id) => id !== "hike").slice(0, 3), "hike"] : guide.interests.slice(0, 4);
  const saved = state.favorites.has(city.id);
  const country = city.area === "BC" ? "BC / CANADA" : `${city.area} / UNITED STATES`;
  return `<article class="city-card" data-city="${city.id}" style="--region-color:${region.color}">
    <div class="card-art">
      <button class="art-open" type="button" data-open="${city.id}" aria-label="查看 ${escapeHTML(city.name)} 的詳細指南">${artwork(city.scene)}</button>
      <span class="card-region">${escapeHTML(region.name)}</span>
      <button class="save-button" type="button" data-save="${city.id}" aria-label="${saved ? "取消收藏" : "收藏"} ${escapeHTML(city.name)}" aria-pressed="${saved}">${icon("heart")}</button>
      <span class="art-coordinate" aria-hidden="true">${city.lat.toFixed(3)}° N / FIELD NOTES</span>
    </div>
    <div class="card-copy">
      <div class="card-meta"><span class="card-area">${country}</span>${city.pick ? `<span class="card-pick">${icon("spark")}首次優先</span>` : ""}</div>
      <div class="card-title-row"><h3><button class="city-open" type="button" data-open="${city.id}">${escapeHTML(city.name)}</button></h3><span class="card-time" aria-label="單程估時 ${driveAccessibleLabel(city)}">${driveLabel(city)}<small${city.access === "border" || city.access === "ferry" ? ' class="access-label"' : ""}>${ACCESS_NAMES[city.access]}・單程</small></span></div>
      <p class="card-subtitle">${escapeHTML(city.subtitle)}</p>
      <p class="card-line">${escapeHTML(city.line)}</p>
      <div class="card-tags">${tags.map((id) => `<span class="card-tag">${escapeHTML(state.interestCatalog.get(id).name)}</span>`).join("")}${city.rain === "good" ? '<span class="card-tag">雨天也行</span>' : ""}</div>
      <p class="card-inventory"><span>${icon("pin")}${guide.places.length} 個地點</span><span>${icon("coffee")}${coffeeCount} 間咖啡</span><span>${icon("clock")}${guide.plans.length} 條時間路線</span>${guide.hikes.length ? `<span>${icon("mountain")}${guide.hikes.length} 條步道數據</span>` : ""}</p>
      <div class="card-bottom"><span class="card-stay">${icon("clock")}${escapeHTML(city.stay)}</span><button class="card-detail" type="button" data-open="${city.id}">詳細看這座城${icon("external")}</button></div>
    </div>
  </article>`;
}

function hasFilters() {
  return state.query.trim() || state.region !== "all" || state.maxDrive !== 240 || state.season !== "all"
    || state.trip !== "all" || state.country !== "all" || state.picks || state.rain || state.easy || state.favoritesOnly || state.interestFilters.size;
}

function updateFavoriteControls() {
  $("#favorite-count").textContent = String(state.favorites.size);
  $("#favorites-nav").setAttribute("aria-pressed", String(state.favoritesOnly));
  for (const button of $$("[data-save]")) {
    const city = state.cities.get(button.dataset.save);
    const saved = state.favorites.has(city.id);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", `${saved ? "取消收藏" : "收藏"} ${city.name}`);
    const label = $(".save-text", button);
    if (label) label.textContent = saved ? "已收藏" : "收藏這個地方";
  }
}

function render({ resetLimit = false } = {}) {
  if (resetLimit) state.limit = 12;
  state.filtered = filterCities();
  const shown = state.filtered.slice(0, state.limit);
  $("#city-grid").innerHTML = shown.map(cardHTML).join("");
  $("#city-grid").dataset.total = String(state.filtered.length);
  $("#city-grid").dataset.shown = String(shown.length);
  $("#empty-state").hidden = state.filtered.length > 0;
  $("#empty-message").textContent = state.favoritesOnly && !state.favorites.size
    ? "先點城市卡片上的愛心，再回來慢慢挑下一趟。收藏只存於目前瀏覽器。"
    : "換個關鍵字，或放寬一個條件看看；每個條件會一起生效。";
  $("#load-more-row").hidden = shown.length >= state.filtered.length;
  $("#load-more").innerHTML = `再看 ${Math.min(12, state.filtered.length - shown.length)} 個目的地${icon("plus")}`;
  $("#results-count").innerHTML = `<strong>${state.filtered.length}</strong> 個${state.favoritesOnly ? "收藏" : "目的地"} <span>／顯示 ${shown.length} 個</span>`;
  $("#reset-filters").hidden = !hasFilters();
  for (const button of $$(".region-tab")) button.setAttribute("aria-pressed", String(button.dataset.region === state.region));
  for (const key of ["picks", "rain", "easy"]) $(`#filter-${key}`).setAttribute("aria-pressed", String(state[key]));
  for (const button of $$("[data-interest]")) button.setAttribute("aria-pressed", String(state.interestFilters.has(button.dataset.interest)));
  $("#interest-hint").textContent = state.interestFilters.size ? `已選 ${state.interestFilters.size} 種・同時符合` : "可複選・同時符合";
  updateFavoriteControls();
  renderMapPins();
}

function resetFilters() {
  Object.assign(state, { region: "all", query: "", maxDrive: 240, season: "all", trip: "all", country: "all", picks: false, rain: false, easy: false, favoritesOnly: false, sort: "far" });
  $("#search").value = "";
  $("#max-drive").value = "240";
  for (const id of ["season", "trip", "country"]) $(`#${id}`).value = "all";
  $("#sort").value = "far";
  state.interestFilters.clear();
  clearTimeout(inputTimer);
  render({ resetLimit: true });
}

function toggleFavorite(id) {
  if (!state.cities.has(id)) throw new Error(`找不到收藏目的地：${id}`);
  const wasSaved = state.favorites.has(id);
  if (wasSaved) state.favorites.delete(id);
  else state.favorites.add(id);
  const persisted = persistPreferences();
  if (state.favoritesOnly) render();
  else updateFavoriteControls();
  showToast(persisted
    ? `${wasSaved ? "已取消收藏" : "已收藏"} ${state.cities.get(id).name}。收藏保存在目前瀏覽器。`
    : "收藏已在本次瀏覽中更新，但瀏覽器不允許持久儲存；重新開啟後可能不保留。");
}

function sourcesHTML(sources) {
  return sources.map(([label, url]) => `<a class="source-link" href="${sourceURL(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}${icon("external")}</a>`).join("");
}

function cityURL(city) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", state.data.origin.name);
  url.searchParams.set("destination", `${city.lat},${city.lon}`);
  url.searchParams.set("travelmode", "driving");
  return escapeHTML(url.href);
}

function placeActions(place) {
  return `<a href="${mapsURL(place.query)}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${escapeHTML(place.name)} 的 Google Maps 地圖">${icon("map")}Google Maps</a>
    ${place.program ? '<span class="program-note">活動場地須按當場公告確認，不提供虛構固定導航。</span>' : `<a href="${navigationURL(place.query)}" target="_blank" rel="noopener noreferrer" aria-label="導航到 ${escapeHTML(place.name)}">${icon("pin")}導航</a>`}
    ${place.url ? `<a href="${sourceURL(place.url)}" target="_blank" rel="noopener noreferrer">${icon("external")}${place.program ? "節目／場地資訊" : "營業／官方資訊"}</a>` : ""}`;
}

function placeMatches(place, category) {
  if (category === "all") return true;
  if (category === "indoor") return place.indoor;
  if (category === "outdoors") return place.kinds.includes("walk") || place.kinds.includes("sight");
  return place.kinds.includes(category);
}

function placeFiltersHTML(guide) {
  return Object.entries(PLACE_FILTERS).map(([id, name]) => {
    const count = guide.places.filter((place) => placeMatches(place, id)).length;
    return count ? `<button class="place-filter" type="button" data-place-filter="${id}" aria-pressed="${id === "all"}">${name}<small>${count}</small></button>` : "";
  }).join("");
}

function placeCardHTML(place, index) {
  return `<article class="stop-card place-card" data-place="${place.id}">
    <div class="place-card-top"><span class="stop-number">${String(index + 1).padStart(2, "0")}</span><span class="place-setting${place.indoor ? " is-indoor" : ""}">${escapeHTML(place.setting || (place.indoor ? "有室內空間" : "戶外為主"))}</span></div>
    <h4>${escapeHTML(place.name)}</h4>
    <div class="place-kinds">${place.kinds.map((kind) => `<span>${PLACE_KINDS[kind]}</span>`).join("")}</div>
    <p>${escapeHTML(place.note)}</p>
    <div class="place-time">${icon("clock")}建議停留約 ${stayLabel(place.minutes)}</div>
    ${place.hours ? `<p class="place-hours">營業（官網）：${escapeHTML(place.hours)}</p>` : ""}
    ${place.liveMusic ? `<p class="place-hours">演出：${escapeHTML(place.liveMusic)}</p>` : ""}
    ${place.kinds.some((kind) => BUSINESS_KINDS.has(kind)) ? `<p class="place-verified" data-verified="${place.verified ? "yes" : "no"}">${place.verified ? `${icon("check")}${dateLabel(parseISODate(place.verified))}已查證營業` : `${icon("info")}營業狀態尚未逐家查證，出發前先看 Google Maps`}</p>` : ""}
    <p class="place-location">${escapeHTML(place.query)}</p>
    <div class="place-actions">${placeActions(place)}</div>
  </article>`;
}

function setPlaceFilter(category) {
  if (!(category in PLACE_FILTERS)) throw new Error(`未知地點分類：${category}`);
  state.placeCategory = category;
  const guide = state.guides.get(state.activeCity);
  for (const place of guide.places) {
    $(`.place-card[data-place="${place.id}"]`, cityDialog).hidden = !placeMatches(place, category);
  }
  for (const button of $$("[data-place-filter]", cityDialog)) button.setAttribute("aria-pressed", String(button.dataset.placeFilter === category));
}

function departureNote(city, plan) {
  if (city.access === "border") return "以下從已到當地開始；過境排隊不包含在時間表，遠程建議前晚抵達。";
  if (city.access === "ferry" || city.access === "optional") return "以下從已到當地開始；選擇的陸路／渡輪和候船需另外計入，不給不可靠的固定出門時間。";
  if (city.drive[1] > 120) return "以下是已到當地後的一日；想從早上開始玩，建議前晚抵達。Redmond 往返、山口與休息另計。";
  const leave = minutesFromClock(plan.steps[0][0]) - city.drive[1] - 20;
  if (leave < 0) return "以下從已到當地開始；請把 Redmond 單程、停車與休息另外加入。";
  return `若從 Redmond 當天出發，約 ${clockLabel(leave)} 出門可作規劃起點（採單程上緣＋20 分鐘緩衝，並非即時導航）。`;
}

function renderTimedPlan(id = state.activePlan) {
  const city = state.cities.get(state.activeCity);
  const guide = state.guides.get(city.id);
  const plan = guide.plans.find((item) => item.id === id);
  if (!plan) throw new Error(`${city.id} 沒有路線 ${id}`);
  state.activePlan = plan.id;
  const places = new Map(guide.places.map((place) => [place.id, place]));
  const last = plan.steps.at(-1);
  const finish = clockLabel(minutesFromClock(last[0]) + last[2]);
  $("#timed-plan", cityDialog).innerHTML = `<div class="plan-heading">
    <span class="plan-span">${plan.steps[0][0]}–${finish} / ${plan.steps.length} 站 / 當地時間</span>
    <h4>${escapeHTML(plan.title)}</h4><p>${escapeHTML(plan.note)}</p>
    <p class="departure-note">${escapeHTML(departureNote(city, plan))}</p>
    </div><ol class="timed-route">${plan.steps.map((step, index) => {
      const [at, placeId, minutes, transfer, note, mode] = step;
      const place = places.get(placeId);
      const previous = index ? places.get(plan.steps[index - 1][1]) : null;
      const end = clockLabel(minutesFromClock(at) + minutes);
      return `<li class="timed-stop" data-route-place="${place.id}" data-start="${at}" data-end="${end}">
        <div class="stop-clock"><time>${at}</time><span>至 ${end}</span></div>
        <div class="timed-stop-body"><h4>${escapeHTML(place.name)}</h4><p>停留約 ${stayLabel(minutes)}・${escapeHTML(note)}</p>
        ${index ? `<p class="stop-transfer">${mode === "walk" ? "步行轉場" : "開車／轉場"}預留 ${transfer} 分鐘（含必要停車、折返或進出）</p>` : ""}
        <div class="stop-links"><a href="${mapsURL(place.query)}" target="_blank" rel="noopener noreferrer">${icon("map")}本地點地圖</a>
        <a href="${navigationURL(place.query, previous?.query || null, previous ? mode : "drive")}" target="_blank" rel="noopener noreferrer">${icon("arrow")}${previous ? `上站 → 本站${mode === "walk" ? "（步行）" : "（開車）"}` : "開車前往第一站"}</a></div></div></li>`;
    }).join("")}</ol><p class="plan-disclaimer">${escapeHTML(state.guideData.timingNote)}冬季日照短，戶外段請提早或縮短；未來日期不保證照同一時刻營業。</p>`;
  for (const button of $$("[data-plan]", cityDialog)) button.setAttribute("aria-pressed", String(button.dataset.plan === plan.id));
}

function namedOptionsHTML(guide, ids) {
  const places = new Map(guide.places.map((place) => [place.id, place]));
  return ids.map((id) => {
    const place = places.get(id);
    return `<a class="named-option" href="${mapsURL(place.query)}" target="_blank" rel="noopener noreferrer"><span>${escapeHTML(place.name)}</span>${icon("external")}</a>`;
  }).join("");
}

function trailCardHTML(hike) {
  const trail = state.trails.get(hike.trail);
  const distance = trail.km ?? trail.miles * 1.609344;
  const gain = trail.gainM ?? trail.gainFt * .3048;
  const query = trail.trailhead ? trail.trailhead.join(",") : trail.query;
  const originalUnits = trail.miles !== undefined
    ? `原來源 ${trail.miles} mile／${trail.gainFt.toLocaleString("en-US")} ft`
    : `原來源 ${trail.km} km／${trail.gainM} m`;
  const status = trailStatus(trail);
  const statusLinks = trail.status.filter(([, url]) => new URL(url).href !== new URL(trail.source).href);
  const transfer = hike.drive ? `從這座城市再開約 ${hike.drive[0]}–${hike.drive[1]} 分鐘。${hike.note}` : hike.note;
  return `<article class="trail-card" data-trail="${trail.id}" data-season="${status.tone}">
    <h4>${escapeHTML(trail.name)}</h4>
    <div class="trail-season"><span class="season-badge" data-tone="${status.tone}">${escapeHTML(status.label)}</span><span>建議月份：${monthsLabel(trail.months)}</span><span>依 ${dateLabel(state.planDate)} 判斷</span></div>
    ${status.detail ? `<p class="trail-season-note">${escapeHTML(status.detail)}</p>` : ""}
    <div class="trail-stats"><span>${trail.oneWay ? "單向上山" : "所列路線總長"} <strong>${distance.toFixed(1)} km</strong></span><span>累計爬升 <strong>約 ${Math.round(gain)} m</strong></span><span>${DIFFICULTY_NAMES[trail.difficulty]}</span><span>規劃 ${timePart(trail.duration[0])}–${timePart(trail.duration[1])}</span></div>
    <p>${escapeHTML(trail.note)}</p>
    ${transfer ? `<p class="trail-transfer">${escapeHTML(transfer)}</p>` : ""}
    ${trail.roadAccess ? `<p class="trail-road">${escapeHTML(trail.roadAccess)}</p>` : ""}
    <p class="trail-access">${escapeHTML(trail.access)}</p>
    <p class="trail-pass">${escapeHTML(trail.pass.replace(/。$/, ""))}・${originalUnits}</p>
    <div class="trail-actions"><a href="${mapsURL(query)}" target="_blank" rel="noopener noreferrer">${icon("map")}登山口 Google Maps</a><a href="${navigationURL(query)}" target="_blank" rel="noopener noreferrer">${icon("pin")}導航至入口</a><a href="${sourceURL(trail.source)}" target="_blank" rel="noopener noreferrer">${icon("external")}指定路線／近期資訊</a>${statusLinks.map(([label, url]) => `<a class="status-link" href="${sourceURL(url)}" target="_blank" rel="noopener noreferrer">${icon("info")}${escapeHTML(label)}</a>`).join("")}</div>
  </article>`;
}

function musicHTML(guide) {
  const places = new Map(guide.places.map((place) => [place.id, place]));
  return guide.musicPlaces.map((id) => {
    const place = places.get(id);
    return `<article class="music-item"><h4>${escapeHTML(place.name)}</h4><p>${escapeHTML(place.note)}</p><div class="place-actions">${placeActions(place)}</div></article>`;
  }).join("");
}

function guideSources(city, guide) {
  const sources = [...city.sources, ...guide.places.filter((place) => place.url).map((place) => [place.name, place.url])];
  const seen = new Set();
  return sources.filter(([, url]) => {
    const normalized = new URL(url).href;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function jumpToDetail(id) {
  const section = $(`#${id}`, cityDialog);
  if (!section) throw new Error(`不存在的詳細段落：${id}`);
  section.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
}

function openCity(id, { syncURL = true } = {}) {
  const city = state.cities.get(id);
  if (!city) {
    showToast("這個城市連結不在目前指南裡，請用清單搜尋。");
    return;
  }
  if (!cityDialog.open) lastDialogTrigger = document.activeElement;
  state.activeCity = id;
  state.placeCategory = "all";
  const guide = state.guides.get(id);
  state.activePlan = guide.plans[0].id;
  const region = state.regions.get(city.region);
  const accessNote = city.accessNote || (city.drive[1] >= 225
    ? "位在約四小時圈的外緣；尖峰、事故與天候可能超出區間。估時只到城市，不包含延伸景點。"
    : "單程只估到城市／旅行基地，建議停留不含往返。周邊景點、停車與休息需要另外留時間。");
  const rainyPlan = guide.plans.find((plan) => plan.id === "rain");
  cityDialog.innerHTML = `
    <div class="dialog-topbar"><span>OUTSIDE / ${escapeHTML(region.english)}</span><div class="dialog-topbar-actions"><button class="dialog-share" type="button" data-share aria-label="複製這座城市的連結">${icon("copy")}</button><button class="dialog-close" type="button" data-close="city" aria-label="關閉城市指南">${icon("close")}</button></div></div>
    <div class="dialog-feedback" role="status" aria-live="polite" hidden></div>
    <nav class="detail-shortcuts" aria-label="城市指南段落"><button type="button" data-detail-jump="detail-places">所有地點 ${guide.places.length}</button><button type="button" data-detail-jump="detail-plans">時間路線 ${guide.plans.length}</button><button type="button" data-detail-jump="detail-rain">下雨去哪</button><button type="button" data-detail-jump="detail-trails">步道與山</button><button type="button" data-detail-jump="detail-music">音樂</button></nav>
    <div class="dialog-hero"><div class="dialog-hero-copy"><p class="eyebrow">${escapeHTML(city.area === "BC" ? "BRITISH COLUMBIA / CANADA" : `${city.area} / PACIFIC NORTHWEST`)}</p><h2 id="city-title">${escapeHTML(city.name)}</h2><p class="dialog-subtitle">${escapeHTML(city.subtitle)}</p><p class="dialog-tagline">${escapeHTML(city.line)}</p></div><div class="dialog-hero-art">${artwork(city.scene)}</div></div>
    <div class="dialog-facts"><div class="dialog-fact"><span>從 Redmond 單程</span><strong>${driveLabel(city)}</strong><small>${ACCESS_NAMES[city.access]}・非即時路況</small></div><div class="dialog-fact"><span>建議停留</span><strong>${escapeHTML(city.stay)}</strong><small>不含往返</small></div><div class="dialog-fact"><span>較適合的季節</span><strong>${city.seasons.map((season) => SEASON_NAMES[season]).join("・")}</strong><small>${RAIN_NAMES[city.rain]}</small></div></div>
    <div class="dialog-content">
      <div class="share-field" hidden><label>城市連結<input type="text" readonly aria-label="可手動複製的城市連結"></label></div>
      <div class="access-notice">${icon("info")}<span>${escapeHTML(accessNote)}</span></div>
      <p class="detail-intro">${escapeHTML(guide.intro)}</p>
      <div class="detail-summary"><span>${guide.places.length} 個具體地點</span><span>${guide.plans.length} 條有時段的路線</span><span>${guide.rainPlaces.length} 個室內候選</span>${guide.hikes.length ? `<span>${guide.hikes.length} 條指定步道路線</span>` : ""}</div>
      <section class="detail-section" id="detail-places"><h3 class="detail-section-title"><span>01</span>每一站，都能直接看地圖</h3><div class="place-filters" aria-label="篩選本城地點">${placeFiltersHTML(guide)}</div>
      <div class="stops-grid">${guide.places.map(placeCardHTML).join("")}</div></section>
      <section class="detail-section" id="detail-plans"><h3 class="detail-section-title"><span>02</span>有時間、有轉場的走法</h3>
      <div class="plan-picker" aria-label="選擇本城時間路線">${guide.plans.map((plan) => `<button class="plan-tab" type="button" data-plan="${plan.id}" aria-pressed="${plan.id === state.activePlan}">${escapeHTML(plan.title)}</button>`).join("")}</div><div id="timed-plan"></div></section>
      <section class="detail-section" id="detail-rain"><h3 class="detail-section-title"><span>03</span>下雨，直接去這幾個地方</h3>
      <div class="named-options">${namedOptionsHTML(guide, guide.rainPlaces)}</div><p class="named-note">${escapeHTML(guide.rainNote)}</p>${rainyPlan ? `<button class="secondary-button" type="button" data-plan="${rainyPlan.id}" data-plan-jump>切到完整雨天時間表${icon("arrow")}</button>` : ""}</section>
      <section class="detail-section" id="detail-trails"><h3 class="detail-section-title"><span>04</span>步道與爬山，不混成一種散步</h3>
      ${guide.hikes.length ? `<div class="plan-date-row">${planDateControl()}<span>季節與已公告的封閉依出發日判斷；積雪、落石與路況仍以官方即時頁為準。</span></div><p class="plan-disclaimer">${escapeHTML(state.trailData.method)}</p><div class="trails-list">${guide.hikes.map(trailCardHTML).join("")}</div>` : '<p class="music-empty">這座主線是小鎮／城市步行，地點卡已列可走的河岸或公園。這裡不把未指定入口、里程與爬升的公園自動當成登山；要完整爬山，可用首頁「爬山」篩選找有路線數據的目的地。</p>'}</section>
      <section class="detail-section" id="detail-music"><h3 class="detail-section-title"><span>05</span>音樂，先挑場次再排</h3>${musicHTML(guide)}<p class="named-note">${escapeHTML(guide.musicNote)}</p></section>
      <div class="detail-tips practical-tips"><section class="tip"><h4>什麼季節值得來</h4><p>${escapeHTML(city.seasonNote)}</p></section><section class="tip"><h4>若有推車／同行照顧需求</h4><p>${escapeHTML(city.stroller)}</p></section></div>
      <section class="detail-watch"><h4>有一點，先知道會更好。</h4><p>${escapeHTML(city.watch)}</p></section>
      <section class="detail-sources"><h4>營業、演出與日期，再看營運方。</h4><div class="source-links">${sourcesHTML(guideSources(city, guide))}</div><p class="source-disclaimer">整理於 ${escapeHTML(state.guideData.updated)}。時間表為建議，尚未代訂餐廳、票或入場；每站 Maps 可查商家最新資訊，已知年齡／室內外／季節限制另列於地點卡。停車或登山口請再核對指定路線資訊。</p></section>
      <div class="detail-actions"><a class="primary-button" href="${cityURL(city)}" target="_blank" rel="noopener noreferrer">${icon("pin")}在 Google Maps 查看${icon("external")}</a><button class="secondary-button" type="button" data-save="${city.id}" aria-pressed="${state.favorites.has(id)}">${icon("heart")}<span class="save-text">${state.favorites.has(id) ? "已收藏" : "收藏這個地方"}</span></button><button class="text-button method-button" type="button">車程怎麼估？</button></div>
      <section class="related-cities"><p>若要串另一座，請刪減本城內容再接，不把兩個完整一日照表相加。</p><div class="related-list">${city.pairWith.map((relatedId) => `<button type="button" data-open="${relatedId}">${escapeHTML(state.cities.get(relatedId).name)}${icon("arrow")}</button>`).join("")}</div></section>
    </div>`;
  renderTimedPlan(state.activePlan);
  cityDialog.scrollTop = 0;
  if (!cityDialog.open) cityDialog.showModal();
  document.body.classList.add("dialog-open");
  $("[data-close]", cityDialog).focus({ preventScroll: true });
  if (syncURL) updateURL(id);
  updateFavoriteControls();
}

function closeCity() {
  if (cityDialog.open) cityDialog.close();
}

function lodgingBase(id) {
  const base = state.tripData.lodging[id];
  if (!base) throw new Error(`找不到住宿基地：${id}`);
  return base;
}

function endpoint(id) {
  if (id === REDMOND.id) return REDMOND;
  const base = lodgingBase(id);
  return { id, name: base.name, query: base.town };
}

// Trip steps reference "cityId/placeId", "extra/id" (stops outside the city catalog) or "trail/id" (trailheads with season data).
function resolveStop(ref) {
  if (typeof ref !== "string") throw new Error("行程地點參照格式錯誤。");
  const [kind, id, ...rest] = ref.split("/");
  if (!id || rest.length) throw new Error(`行程地點參照格式錯誤：${ref}`);
  if (kind === "extra") {
    const extra = state.tripData.extras[id];
    if (!extra) throw new Error(`行程延伸地點不存在：${ref}`);
    return extra;
  }
  if (kind === "trail") {
    const trail = state.trails.get(id);
    if (!trail) throw new Error(`行程步道不存在：${ref}`);
    return { id: trail.id, name: `${trail.name}・登山口`, query: trail.trailhead ? trail.trailhead.join(",") : trail.query, url: trail.source, trail: trail.id };
  }
  const place = state.guides.get(kind)?.places.find((item) => item.id === id);
  if (!place) throw new Error(`行程地點不存在：${ref}`);
  return { ...place, city: kind };
}

function validateTrips(tripData) {
  if (tripData.version !== 1 || !Array.isArray(tripData.trips) || !tripData.trips.length || typeof tripData.note !== "string" || !tripData.note.trim()
    || !tripData.lodging || typeof tripData.lodging !== "object" || !tripData.extras || typeof tripData.extras !== "object") throw new Error("行程資料格式不符。");
  for (const [id, base] of Object.entries(tripData.lodging)) {
    if (!/^[a-z0-9-]+$/.test(id) || id === REDMOND.id) throw new Error(`住宿基地 ID 不符：${id}`);
    for (const field of ["name", "town", "searchQuery", "note"]) if (typeof base[field] !== "string" || !base[field].trim()) throw new Error(`${id} 住宿缺少 ${field}`);
    if (!Array.isArray(base.options) || !base.options.length) throw new Error(`${id} 至少要有一間具名住宿。`);
    for (const option of base.options) {
      for (const field of ["name", "query", "type", "season", "note"]) if (typeof option[field] !== "string" || !option[field].trim()) throw new Error(`${id} 住宿選項缺少 ${field}`);
      sourceURL(option.url);
    }
  }
  for (const [id, extra] of Object.entries(tripData.extras)) {
    if (!/^[a-z0-9-]+$/.test(id) || extra.id !== id) throw new Error(`延伸地點 ID 不符：${id}`);
    for (const field of ["name", "note", "query", "town"]) if (typeof extra[field] !== "string" || !extra[field].trim()) throw new Error(`${id} 延伸地點缺少 ${field}`);
    if (!Number.isInteger(extra.minutes) || extra.minutes <= 0 || typeof extra.indoor !== "boolean" || !Array.isArray(extra.kinds)
      || !extra.kinds.length || extra.kinds.some((kind) => !(kind in PLACE_KINDS))) throw new Error(`${id} 延伸地點資料不符。`);
    if (extra.url !== undefined) sourceURL(extra.url);
  }
  const ids = new Set();
  for (const trip of tripData.trips) {
    if (!/^[a-z0-9-]+$/.test(trip.id) || ids.has(trip.id)) throw new Error(`行程 ID 重複或格式不符：${trip.id}`);
    ids.add(trip.id);
    if (![1, 2, 3].includes(trip.days) || !SCENES.has(trip.scene) || !validMonths(trip.months)) throw new Error(`${trip.id} 的天數、插畫或月份不符。`);
    for (const field of ["title", "subtitle", "route", "driving", "why", "seasonNote", "watch"]) if (typeof trip[field] !== "string" || !trip[field].trim()) throw new Error(`${trip.id} 缺少 ${field}`);
    if (!Array.isArray(trip.interests) || !trip.interests.length || trip.interests.some((id) => !state.interestCatalog.has(id))) throw new Error(`${trip.id} 的興趣分類不符。`);
    if (!Array.isArray(trip.cities) || !trip.cities.length || trip.cities.some((id) => !state.cities.has(id))) throw new Error(`${trip.id} 的相關城市不存在。`);
    if (!Array.isArray(trip.hikes) || trip.hikes.some((hike) => !state.trails.has(hike.trail) || typeof hike.note !== "string" || !hike.note.trim())) throw new Error(`${trip.id} 的步道參照不符。`);
    if (!Array.isArray(trip.itinerary) || trip.itinerary.length !== trip.days) throw new Error(`${trip.id} 每天都要有行程。`);
    trip.itinerary.forEach((day, index) => {
      const label = `${trip.id} 第 ${index + 1} 天`;
      const last = index === trip.days - 1;
      if (day.from !== (index ? trip.itinerary[index - 1].to : REDMOND.id) || (last ? day.to !== REDMOND.id : day.to === REDMOND.id)) throw new Error(`${label}起訖不連貫。`);
      endpoint(day.to);
      if (typeof day.title !== "string" || !day.title.trim() || !Number.isInteger(day.returnDrive) || day.returnDrive <= 0) throw new Error(`${label}資料不符。`);
      if (!Array.isArray(day.steps) || day.steps.length < 3) throw new Error(`${label}至少要有三站。`);
      let previousEnd = minutesFromClock(day.depart);
      for (const step of day.steps) {
        if (!Array.isArray(step) || step.length !== 6) throw new Error(`${label}步驟格式不符。`);
        const [at, ref, minutes, transfer, note, mode] = step;
        if (resolveStop(ref).program) throw new Error(`${label}不能把未確認場地的節目當固定行程。`);
        const start = minutesFromClock(at);
        if (!Number.isInteger(minutes) || minutes <= 0 || !Number.isInteger(transfer) || transfer < 0 || typeof note !== "string" || !note.trim()
          || !["walk", "drive"].includes(mode) || start < previousEnd + transfer) throw new Error(`${label} ${at} 時段重疊或格式不符。`);
        previousEnd = start + minutes;
      }
      if (previousEnd + day.returnDrive >= 1440) throw new Error(`${label}結束時間超過午夜。`);
    });
  }
}

function tripFit(trip, date = state.planDate) {
  const problems = [];
  trip.itinerary.forEach((day, index) => {
    for (const [, ref] of day.steps) {
      if (!ref.startsWith("trail/")) continue;
      const trail = state.trails.get(ref.slice(6));
      const status = trailStatus(trail, addDays(date, index));
      if (status.tone === "closed" || status.tone === "off") problems.push(`Day ${index + 1}・${trail.name}：${status.label}`);
    }
  });
  if (problems.length) return { tone: "closed", label: "這天有步道不能照走", problems };
  const months = trip.itinerary.map((_, index) => addDays(date, index).getMonth() + 1);
  if (months.some((month) => !trip.months.includes(month))) return { tone: "off", label: `${date.getMonth() + 1} 月不是建議季節`, problems };
  return { tone: "ok", label: "出發日在建議季節", problems };
}

function tripCardHTML(trip) {
  const fit = tripFit(trip);
  const stops = trip.itinerary.reduce((sum, day) => sum + day.steps.length, 0);
  return `<article class="trip-card" data-trip="${trip.id}" data-fit="${fit.tone}">
    <button class="trip-art" type="button" data-trip-open="${trip.id}" aria-label="查看 ${escapeHTML(trip.title)} 行程">${artwork(trip.scene)}<span class="trip-length">${TRIP_LENGTHS[trip.days]}</span></button>
    <div class="trip-copy">
      <span class="season-badge" data-tone="${fit.tone}">${escapeHTML(fit.label)}</span>
      <h3><button type="button" data-trip-open="${trip.id}">${escapeHTML(trip.title)}</button></h3>
      <p class="trip-subtitle">${escapeHTML(trip.subtitle)}</p>
      <p class="trip-route">${escapeHTML(trip.route)}</p>
      <div class="trip-facts"><span>${icon("clock")}${escapeHTML(trip.driving)}</span><span>${icon("pin")}${stops} 站</span><span>${icon("spark")}最適合 ${monthsLabel(trip.months)}</span></div>
      <div class="card-tags">${trip.interests.map((id) => `<span class="card-tag">${escapeHTML(state.interestCatalog.get(id).name)}</span>`).join("")}</div>
    </div>
  </article>`;
}

function renderTrips() {
  const trips = state.tripData.trips.filter((trip) => trip.days === state.tripLength);
  $("#trip-grid").innerHTML = trips.map(tripCardHTML).join("");
  for (const button of $$("[data-trip-length]")) button.setAttribute("aria-pressed", String(Number(button.dataset.tripLength) === state.tripLength));
  const fitting = trips.filter((trip) => tripFit(trip).tone === "ok").length;
  $("#trip-count").textContent = `${trips.length} 條${TRIP_LENGTHS[state.tripLength]}・以 ${dateLabel(state.planDate)} 出發判斷，${fitting} 條在建議季節`;
}

function setTripLength(days) {
  if (!(days in TRIP_LENGTHS)) throw new Error(`未知行程天數：${days}`);
  state.tripLength = days;
  renderTrips();
}

function setPlanDate(raw) {
  const date = parseISODate(raw);
  if (!date) {
    for (const input of $$("[data-plan-date]")) input.value = isoDate(state.planDate);
    showToast("日期格式不正確，已保留原本的出發日。");
    return;
  }
  state.planDate = date;
  for (const input of $$("[data-plan-date]")) input.value = isoDate(date);
  renderTrips();
  if (cityDialog.open && state.activeCity) {
    const list = $(".trails-list", cityDialog);
    if (list) list.innerHTML = state.guides.get(state.activeCity).hikes.map(trailCardHTML).join("");
  }
  if (tripDialog.open && state.activeTrip) renderTripStatus();
  updateURL();
}

// Google Maps URLs allow only three waypoints on mobile browsers, so longer driving days are split into linked segments.
function dayRouteLinks(from, stops, to) {
  const points = [from.query, ...stops.filter((stop, index) => index === 0 || stop.mode === "drive").map((stop) => stop.place.query), to.query]
    .filter((point, index, all) => index === 0 || point !== all[index - 1]);
  const segments = [];
  for (let start = 0; start < points.length - 1; start += 4) segments.push(points.slice(start, start + 5));
  return segments.map((segment, index) => {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", segment[0]);
    url.searchParams.set("destination", segment.at(-1));
    if (segment.length > 2) url.searchParams.set("waypoints", segment.slice(1, -1).join("|"));
    url.searchParams.set("travelmode", "driving");
    return `<a class="route-link" href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${icon("map")}${segments.length === 1 ? "整天開車路線" : `開車路線 ${index + 1}／${segments.length}`}（Google Maps）</a>`;
  }).join("");
}

function tripTimelineHTML(stops, origin) {
  return stops.map((stop, index) => {
    const { at, place, minutes, transfer, note, mode } = stop;
    const previous = index ? stops[index - 1].place : origin;
    const travel = index ? mode : "drive";
    const end = clockLabel(minutesFromClock(at) + minutes);
    const label = index ? `上站 → 本站${mode === "walk" ? "（步行）" : "（開車）"}` : `從 ${origin.name} 開車前往`;
    return `<li class="timed-stop" data-route-place="${escapeHTML(stop.ref)}" data-start="${at}" data-end="${end}">
      <div class="stop-clock"><time>${at}</time><span>至 ${end}</span></div>
      <div class="timed-stop-body"><h4>${escapeHTML(place.name)}</h4><p>停留約 ${stayLabel(minutes)}・${escapeHTML(note)}</p>
      ${place.hours ? `<p class="stop-hours">營業（官網）：${escapeHTML(place.hours)}</p>` : ""}
      <p class="stop-transfer">${travel === "walk" ? "步行轉場" : "開車／轉場"}預留 ${transfer} 分鐘${index ? "（含必要停車、折返或進出）" : `（${escapeHTML(origin.name)}出發）`}</p>
      <div class="stop-links"><a href="${mapsURL(place.query)}" target="_blank" rel="noopener noreferrer">${icon("map")}本地點地圖</a>
      <a href="${navigationURL(place.query, previous.query, travel)}" target="_blank" rel="noopener noreferrer">${icon("arrow")}${escapeHTML(label)}</a>${place.url ? `<a href="${sourceURL(place.url)}" target="_blank" rel="noopener noreferrer">${icon("external")}${place.trail ? "路線資訊" : "官方資訊"}</a>` : ""}</div></div></li>`;
  }).join("");
}

function lodgingHTML(base, sources) {
  for (const option of base.options) sources.set(new URL(option.url).href, option.name);
  return `<div class="lodging-block"><h4>${icon("pin")}今晚住 ${escapeHTML(base.name)}</h4><p class="named-note">${escapeHTML(base.note)}</p>
    <div class="lodging-options">${base.options.map((option) => `<article class="lodging-option"><h5>${escapeHTML(option.name)}</h5><p class="lodging-meta">${escapeHTML(option.type)}・${escapeHTML(option.season)}</p><p>${escapeHTML(option.note)}</p>
      <div class="place-actions"><a href="${mapsURL(option.query)}" target="_blank" rel="noopener noreferrer">${icon("map")}Google Maps</a><a href="${sourceURL(option.url)}" target="_blank" rel="noopener noreferrer">${icon("external")}官網與訂房</a></div></article>`).join("")}</div>
    <a class="named-option" href="${mapsURL(base.searchQuery)}" target="_blank" rel="noopener noreferrer"><span>在 Google Maps 比較 ${escapeHTML(base.name)} 其他住宿與價格</span>${icon("external")}</a></div>`;
}

function tripDayHTML(day, index, sources) {
  const from = endpoint(day.from);
  const to = endpoint(day.to);
  const stops = day.steps.map(([at, ref, minutes, transfer, note, mode]) => ({ at, ref, place: resolveStop(ref), minutes, transfer, note, mode }));
  for (const stop of stops) if (stop.place.url) sources.set(new URL(stop.place.url).href, stop.place.name);
  const last = stops.at(-1);
  const arrive = minutesFromClock(last.at) + last.minutes + day.returnDrive;
  return `<section class="detail-section trip-day" id="trip-day-${index + 1}">
    <h3 class="detail-section-title"><span>DAY ${index + 1}</span>${escapeHTML(day.title)}</h3>
    <p class="trip-day-line">${icon("arrow")}${day.depart} 從 ${escapeHTML(from.name)} 出發</p>
    <ol class="timed-route">${tripTimelineHTML(stops, from)}</ol>
    <p class="trip-day-line">${icon("pin")}約 ${clockLabel(arrive)} ${day.to === REDMOND.id ? "回到 Redmond" : `抵達 ${escapeHTML(to.name)}`}（最後一站後開車約 ${stayLabel(day.returnDrive)}）</p>
    <div class="trip-route-links">${dayRouteLinks(from, stops, to)}<span>只串開車段；步行段用各站連結。手機瀏覽器每段最多 3 個中途點，所以長的一天會拆段。</span></div>
    ${day.to === REDMOND.id ? "" : lodgingHTML(lodgingBase(day.to), sources)}
  </section>`;
}

function renderTripStatus() {
  const trip = state.trips.get(state.activeTrip);
  const fit = tripFit(trip);
  $("#trip-fit", tripDialog).innerHTML = `<div class="trip-fit-row"><span class="season-badge" data-tone="${fit.tone}">${escapeHTML(fit.label)}</span>${planDateControl()}</div>
    ${fit.problems.length ? `<ul class="trip-problems">${fit.problems.map((problem) => `<li>${escapeHTML(problem)}</li>`).join("")}</ul>` : ""}<p>${escapeHTML(trip.seasonNote)}</p>`;
  const list = $("#trip-trails .trails-list", tripDialog);
  if (list) list.innerHTML = trip.hikes.map(trailCardHTML).join("");
}

function openTrip(id, { syncURL = true } = {}) {
  const trip = state.trips.get(id);
  if (!trip) {
    showToast("這條行程連結不在目前指南裡，請從行程清單選。");
    return;
  }
  if (!tripDialog.open) lastTripTrigger = document.activeElement;
  state.activeTrip = id;
  const sources = new Map();
  const days = trip.itinerary.map((day, index) => tripDayHTML(day, index, sources)).join("");
  const stops = trip.itinerary.reduce((sum, day) => sum + day.steps.length, 0);
  tripDialog.innerHTML = `
    <div class="dialog-topbar"><span>OUTSIDE / ${trip.days}-DAY ROUTE</span><div class="dialog-topbar-actions"><button class="dialog-share" type="button" data-share aria-label="複製這條行程的連結">${icon("copy")}</button><button class="dialog-close" type="button" data-close="trip" aria-label="關閉行程">${icon("close")}</button></div></div>
    <div class="dialog-feedback" role="status" aria-live="polite" hidden></div>
    <nav class="detail-shortcuts" aria-label="行程段落">${trip.itinerary.map((day, index) => `<button type="button" data-trip-jump="trip-day-${index + 1}">Day ${index + 1}</button>`).join("")}${trip.hikes.length ? '<button type="button" data-trip-jump="trip-trails">沿線步道</button>' : ""}<button type="button" data-trip-jump="trip-watch">出發前注意</button></nav>
    <div class="dialog-hero"><div class="dialog-hero-copy"><p class="eyebrow">${escapeHTML(TRIP_LENGTHS[trip.days])} / FROM REDMOND</p><h2 id="trip-title">${escapeHTML(trip.title)}</h2><p class="dialog-subtitle">${escapeHTML(trip.subtitle)}</p><p class="dialog-tagline">${escapeHTML(trip.route)}</p></div><div class="dialog-hero-art">${artwork(trip.scene)}</div></div>
    <div class="dialog-facts"><div class="dialog-fact"><span>天數</span><strong>${trip.days} 天</strong><small>${trip.days > 1 ? `住 ${trip.days - 1} 晚・${stops} 站` : `當天來回・${stops} 站`}</small></div><div class="dialog-fact"><span>開車</span><strong>${escapeHTML(trip.driving)}</strong><small>規劃估算・非即時路況</small></div><div class="dialog-fact"><span>建議季節</span><strong>${monthsLabel(trip.months)}</strong><small>依出發日檢查步道封閉</small></div></div>
    <div class="dialog-content">
      <div class="share-field" hidden><label>行程連結<input type="text" readonly aria-label="可手動複製的行程連結"></label></div>
      <div class="trip-fit" id="trip-fit"></div>
      <p class="detail-intro">${escapeHTML(trip.why)}</p>
      ${days}
      ${trip.hikes.length ? '<section class="detail-section" id="trip-trails"><h3 class="detail-section-title"><span>TRAILS</span>沿線步道，季節與封閉一起看</h3><div class="trails-list"></div></section>' : ""}
      <section class="detail-watch" id="trip-watch"><h4>出發前先知道</h4><p>${escapeHTML(trip.watch)}</p></section>
      <section class="detail-sources"><h4>營業、住宿與路況，再看官方。</h4><div class="source-links">${sourcesHTML([...sources].map(([url, label]) => [label, url]))}</div><p class="source-disclaimer">${escapeHTML(state.tripData.note)}</p></section>
      <section class="related-cities"><p>想看單一城鎮的完整清單、雨天備案與音樂：</p><div class="related-list">${trip.cities.map((cityId) => `<button type="button" data-open="${cityId}">${escapeHTML(state.cities.get(cityId).name)}${icon("arrow")}</button>`).join("")}</div></section>
    </div>`;
  renderTripStatus();
  tripDialog.scrollTop = 0;
  if (!tripDialog.open) tripDialog.showModal();
  document.body.classList.add("dialog-open");
  $("[data-close]", tripDialog).focus({ preventScroll: true });
  if (syncURL) updateURL();
}

function closeTrip() {
  if (tripDialog.open) tripDialog.close();
}

function jumpInDialog(dialog, id) {
  const section = $(`#${id}`, dialog);
  if (!section) throw new Error(`不存在的段落：${id}`);
  section.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
}

function openMethod() {
  const method = state.data.method;
  methodDialog.innerHTML = `<div class="dialog-topbar"><span>OUTSIDE / HOW THIS GUIDE WORKS</span><button class="dialog-close" data-close="method" type="button" aria-label="關閉指南說明">${icon("close")}</button></div>
    <div class="method-body"><h2 id="method-title">把範圍說清楚，<br>才不會白跑一趟。</h2>
      <h3>這份指南收什麼？</h3><p>${escapeHTML(method.scope)}</p>
      <h3>「四小時」怎麼看？</h3><p>${escapeHTML(method.timing)}</p><p>${escapeHTML(method.sorting)}</p>
      <h3>城市與延伸景點分開算</h3><p>${escapeHTML(method.detail)}</p>
      <h3>資料新鮮度與判斷方式</h3><p>${escapeHTML(method.freshness)}</p>
      <h3>具體地點、餐飲與時間表</h3><p>目前有 ${[...state.guides.values()].reduce((sum, guide) => sum + guide.places.length, 0)} 個地點／體驗、${[...state.guides.values()].reduce((sum, guide) => sum + guide.plans.length, 0)} 條時間路線。每站都可開 Maps，時間為建議停留和轉場預留，不是即時測得車程或每天開門保證。音樂、列車與需預約的場所，先選到真正日期／票再使用該段。</p><p>${escapeHTML(state.guideData.timingNote)}</p>
      <h3>步道資料怎麼看？</h3><p>${escapeHTML(state.trailData.method)}公里與公尺由來源單位換算；累計爬升不是最高海拔。單向上山路線會特別標示，不把它當來回距離。城市到登山口的車程和 Redmond 到城市分開。</p>
      <h3>刻意沒有硬塞進四小時圈的地方</h3><ul class="outside-list">${method.outside.map(([name, note]) => `<li><strong>${escapeHTML(name)}</strong>：${escapeHTML(note)}</li>`).join("")}</ul>
      <h3>出發前的官方工具</h3><div class="source-links">${sourcesHTML(method.resources)}</div>
      <h3>收藏與風格儲存</h3><p>只保存在目前瀏覽器的 localStorage，不需帳號，不會傳到伺服器，也不會自動跨裝置同步。清除網站資料後會消失；更換版型不會清掉收藏。</p>
      <h3>地圖與插畫</h3><p>海岸底圖使用 Natural Earth 公有領域資料，標記為城市概略位置，不是精確停車點或導航路線。插畫是原創風景意境圖，不是各景點實景照片。</p>
    </div>`;
  if (!methodDialog.open) methodDialog.showModal();
  document.body.classList.add("dialog-open");
}

function manualShare(dialog) {
  const field = $(".share-field", dialog);
  const input = $("input", field);
  field.hidden = false;
  input.value = window.location.href;
  input.focus({ preventScroll: true });
  input.select();
  showToast("瀏覽器無法自動複製；已顯示網址，請手動複製。");
}

async function shareCity(dialog = cityDialog) {
  if (!navigator.clipboard?.writeText) {
    manualShare(dialog);
    return;
  }
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast(dialog === tripDialog ? "已複製這條行程的連結，包含出發日與網站風格。" : "已複製這座城市的連結，包含目前選的網站風格。");
  } catch (error) {
    console.warn("OUTSIDE：無法使用剪貼簿。", error);
    manualShare(dialog);
  }
}

function project(longitude, latitude) {
  const [west, south, east, north] = coast.bounds;
  const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  return {
    x: (longitude - west) / (east - west) * coast.width,
    y: (mercator(north) - mercator(latitude)) / (mercator(north) - mercator(south)) * coast.height,
  };
}

function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function drawBaseMap() {
  if (!Array.isArray(coast.paths) || !coast.paths.length || coast.width !== 1200 || coast.height !== 1000) {
    throw new Error("海岸地圖資料格式錯誤。");
  }
  const land = $("#map-land");
  for (const path of coast.paths) land.append(svgElement("path", { d: path, class: "land-shape" }));
  const grid = $("#map-grid");
  for (const longitude of [-125, -124, -123, -122, -121, -120]) {
    const a = project(longitude, coast.bounds[1]);
    const b = project(longitude, coast.bounds[3]);
    grid.append(svgElement("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "map-grid-line" }));
  }
  for (const latitude of [46, 47, 48, 49]) {
    const a = project(coast.bounds[0], latitude);
    const b = project(coast.bounds[2], latitude);
    grid.append(svgElement("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: latitude === 49 ? "map-boundary" : "map-grid-line" }));
  }
  const labels = [
    ["BRITISH COLUMBIA", -122.65, 49.52, 0, false],
    ["WASHINGTON", -121.72, 46.85, 0, false],
    ["OREGON", -122.35, 45.42, 0, false],
    ["PACIFIC OCEAN", -124.8, 47.3, -90, false],
    ["CASCADES", -120.96, 48.15, -72, true],
    ["PUGET SOUND", -122.83, 47.35, -72, true],
  ];
  for (const [text, longitude, latitude, rotation, small] of labels) {
    const { x, y } = project(longitude, latitude);
    $("#map-labels").append(svgElement("text", { x, y, class: `map-label${small ? " map-small-label" : ""}`, transform: `rotate(${rotation} ${x} ${y})`, "text-anchor": "middle" }, text));
  }
  const origin = project(state.data.origin.lon, state.data.origin.lat);
  const group = svgElement("g", { id: "origin-group", "data-x": origin.x, "data-y": origin.y });
  group.append(svgElement("path", { d: "M0,-14L5,-5L14,0L5,5L0,14L-5,5L-14,0L-5,-5Z", class: "origin-marker" }));
  group.append(svgElement("text", { x: 20, y: 6, class: "origin-label" }, "REDMOND"));
  $("#map-origin").append(group);
}

function renderMapPins() {
  if (!coast) return;
  const fragment = document.createDocumentFragment();
  for (const city of state.filtered) {
    const { x, y } = project(city.lon, city.lat);
    const region = state.regions.get(city.region);
    const group = svgElement("g", {
      class: "map-pin", role: "button", tabindex: "0", "data-open": city.id,
      "data-x": x, "data-y": y, "aria-label": `${city.name}，單程 ${driveAccessibleLabel(city)}，查看詳細指南`,
      style: `--pin-color:${region.color}`,
    });
    group.append(svgElement("title", {}, `${city.name} · ${driveLabel(city)}`));
    group.append(svgElement("circle", { r: 38, class: "pin-halo" }));
    group.append(svgElement("circle", { r: 7.5, class: "pin-dot" }));
    group.append(svgElement("text", { x: 16, y: -14, class: "pin-name" }, city.name));
    fragment.append(group);
  }
  $("#map-pins").replaceChildren(fragment);
  $("#map-count").textContent = String(state.filtered.length);
  updateCamera();
}

function updateCamera() {
  mapSvg.setAttribute("viewBox", `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
  const markerScale = camera.width / coast.width;
  for (const group of $$("#map-pins > g, #origin-group")) {
    group.setAttribute("transform", `translate(${group.dataset.x} ${group.dataset.y}) scale(${markerScale})`);
  }
}

function zoomMap(factor) {
  const width = Math.max(coast.width / 8, Math.min(coast.width * 1.15, camera.width * factor));
  const height = width * coast.height / coast.width;
  camera = { x: camera.x + (camera.width - width) / 2, y: camera.y + (camera.height - height) / 2, width, height };
  updateCamera();
}

function fitMap() {
  const points = [project(state.data.origin.lon, state.data.origin.lat), ...state.filtered.map((city) => project(city.lon, city.lat))];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(190, (maxX - minX) * 1.3, (maxY - minY) * 1.3 * coast.width / coast.height);
  const height = width * coast.height / coast.width;
  camera = { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
  updateCamera();
}

function updateView() {
  $("#explore-layout").dataset.view = state.view;
  $("#map-panel").hidden = state.view !== "map";
  $("#view-cards").setAttribute("aria-pressed", String(state.view === "cards"));
  $("#view-map").setAttribute("aria-pressed", String(state.view === "map"));
}

function bindMapEvents() {
  $("#map-zoom-in").addEventListener("click", () => zoomMap(1 / 1.5));
  $("#map-zoom-out").addEventListener("click", () => zoomMap(1.5));
  $("#map-fit").addEventListener("click", fitMap);
  const canvas = $("#map-canvas");
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, [data-open]")) return;
    const matrix = mapSvg.getScreenCTM()?.inverse();
    if (!matrix) return;
    const start = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    mapDrag = { id: event.pointerId, matrix, start, camera: { ...camera } };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!mapDrag || event.pointerId !== mapDrag.id) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(mapDrag.matrix);
    camera.x = mapDrag.camera.x - (point.x - mapDrag.start.x);
    camera.y = mapDrag.camera.y - (point.y - mapDrag.start.y);
    updateCamera();
  });
  const endDrag = () => {
    mapDrag = null;
    canvas.classList.remove("is-dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const open = event.target.closest("[data-open]");
    const save = event.target.closest("[data-save]");
    const close = event.target.closest("[data-close]");
    const tripOpen = event.target.closest("[data-trip-open]");
    if (open) openCity(open.dataset.open);
    else if (tripOpen) openTrip(tripOpen.dataset.tripOpen);
    else if (save) toggleFavorite(save.dataset.save);
    else if (close) {
      if (close.dataset.close === "city") closeCity();
      else if (close.dataset.close === "trip") closeTrip();
      else methodDialog.close();
    } else if (event.target.closest(".method-button")) openMethod();
    else if (event.target.closest("[data-share]")) shareCity(event.target.closest("dialog") || cityDialog);
    else if (event.target.closest("[data-trip-length]")) setTripLength(Number(event.target.closest("[data-trip-length]").dataset.tripLength));
    else if (event.target.closest("[data-trip-jump]")) jumpInDialog(tripDialog, event.target.closest("[data-trip-jump]").dataset.tripJump);
    else if (event.target.closest("[data-place-filter]")) setPlaceFilter(event.target.closest("[data-place-filter]").dataset.placeFilter);
    else if (event.target.closest("[data-plan]")) {
      const button = event.target.closest("[data-plan]");
      renderTimedPlan(button.dataset.plan);
      if (button.hasAttribute("data-plan-jump")) jumpToDetail("detail-plans");
    } else if (event.target.closest("[data-detail-jump]")) jumpToDetail(event.target.closest("[data-detail-jump]").dataset.detailJump);
  });
  mapSvg.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element) {
      const target = event.target.closest("[data-open]");
      if (target) {
        event.preventDefault();
        openCity(target.dataset.open);
      }
    }
  });
  for (const dialog of [cityDialog, methodDialog, tripDialog]) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (dialog === cityDialog) {
        state.activeCity = null;
        updateURL(null);
        if (lastDialogTrigger instanceof HTMLElement && lastDialogTrigger.isConnected) lastDialogTrigger.focus({ preventScroll: true });
      }
      if (dialog === tripDialog) {
        state.activeTrip = null;
        updateURL(state.activeCity, null);
        if (lastTripTrigger instanceof HTMLElement && lastTripTrigger.isConnected) lastTripTrigger.focus({ preventScroll: true });
      }
      if (!cityDialog.open && !methodDialog.open && !tripDialog.open) document.body.classList.remove("dialog-open");
    });
  }
  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.matches("[data-plan-date]")) setPlanDate(event.target.value);
  });
  $("#search").addEventListener("input", () => {
    state.query = $("#search").value;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => render({ resetLimit: true }), 100);
  });
  $("#region-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-region]");
    if (!tab) return;
    state.region = tab.dataset.region;
    render({ resetLimit: true });
    if (state.view === "map") fitMap();
  });
  $("#interest-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-interest]");
    if (!button) return;
    const id = button.dataset.interest;
    if (!state.interestCatalog.has(id)) throw new Error(`不存在的興趣：${id}`);
    if (state.interestFilters.has(id)) state.interestFilters.delete(id);
    else state.interestFilters.add(id);
    render({ resetLimit: true });
  });
  for (const [id, field] of [["max-drive", "maxDrive"], ["season", "season"], ["trip", "trip"], ["country", "country"], ["sort", "sort"]]) {
    $(`#${id}`).addEventListener("change", (event) => {
      state[field] = field === "maxDrive" ? Number(event.target.value) : event.target.value;
      render({ resetLimit: true });
    });
  }
  for (const key of ["picks", "rain", "easy"]) $(`#filter-${key}`).addEventListener("click", () => {
    state[key] = !state[key];
    render({ resetLimit: true });
  });
  $("#favorites-nav").addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    render({ resetLimit: true });
    $("#explore").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  });
  for (const id of ["reset-filters", "empty-reset"]) $(`#${id}`).addEventListener("click", resetFilters);
  $("#load-more").addEventListener("click", () => { state.limit += 12; render(); });
  $("#show-all").addEventListener("click", () => { state.limit = state.data.cities.length; render(); });
  for (const view of ["cards", "map"]) $(`#view-${view}`).addEventListener("click", () => {
    state.view = view;
    updateView();
  });
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag) && !cityDialog.open && !methodDialog.open && !tripDialog.open) {
      event.preventDefault();
      $("#search").focus();
    }
  });
  $("#city-grid").addEventListener("pointerover", (event) => {
    const card = event.target.closest(".city-card");
    if (!card) return;
    for (const pin of $$(".map-pin")) pin.classList.toggle("is-highlighted", pin.dataset.open === card.dataset.city);
  });
  $("#city-grid").addEventListener("pointerleave", () => {
    for (const pin of $$(".map-pin.is-highlighted")) pin.classList.remove("is-highlighted");
  });
  window.addEventListener("popstate", () => {
    const url = new URL(window.location.href);
    const style = url.searchParams.get("style");
    if (THEMES.has(style) && style !== state.style) applyStyle(style);
    const tripId = url.searchParams.get("trip");
    if (tripId && state.trips.has(tripId)) openTrip(tripId, { syncURL: false });
    else closeTrip();
    const id = url.searchParams.get("city");
    if (id && state.cities.has(id)) openCity(id, { syncURL: false });
    else closeCity();
  });
  bindMapEvents();
}

async function initialize() {
  const preferences = readPreferences();
  const url = new URL(window.location.href);
  const requestedStyle = url.searchParams.get("style");
  if (requestedStyle && !THEMES.has(requestedStyle)) preferenceWarnings.push("連結中的版型名稱不在選項內，已使用清爽地圖版。");
  const style = requestedStyle && THEMES.has(requestedStyle) ? requestedStyle : "atlas";
  applyStyle(style);
  const requestedDate = url.searchParams.get("date");
  state.planDate = parseISODate(requestedDate) || localToday();
  if (requestedDate && !parseISODate(requestedDate)) preferenceWarnings.push("連結中的出發日格式不正確，已改用今天。");
  const [data, map, details, trailData, tripData] = await Promise.all([
    fetchJSON("cities.json"), fetchJSON("assets/coastline.json"), fetchJSON("city-guides.json"), fetchJSON("trails.json"), fetchJSON("trips.json"),
  ]);
  validateData(data);
  validateDetailedData(data, details, trailData);
  state.data = data;
  state.guideData = details;
  state.trailData = trailData;
  coast = map;
  state.regions = new Map(data.regions.map((region) => [region.id, region]));
  state.cities = new Map(data.cities.map((city) => [city.id, city]));
  state.guides = new Map(Object.entries(details.guides));
  state.trails = new Map(trailData.items.map((trail) => [trail.id, trail]));
  state.interestCatalog = new Map(details.interests.map((interest) => [interest.id, interest]));
  state.tripData = tripData;
  validateTrips(tripData);
  state.trips = new Map(tripData.trips.map((trip) => [trip.id, trip]));
  for (const city of data.cities) city.searchText = searchableCity(city);
  if (preferences.favorites !== undefined) {
    if (!Array.isArray(preferences.favorites) || preferences.favorites.some((id) => typeof id !== "string")) {
      preferenceWarnings.push("收藏格式不符，這次未載入舊收藏。");
    } else {
      state.favorites = new Set(preferences.favorites.filter((id) => state.cities.has(id)));
      if (state.favorites.size !== preferences.favorites.length) preferenceWarnings.push("部分舊收藏不在目前名單，已只載入仍收錄的目的地。");
    }
  }
  $("#hero-city-count").textContent = String(data.cities.length);
  $("#hero-place-count").textContent = String([...state.guides.values()].reduce((sum, guide) => sum + guide.places.length, 0));
  $("#hero-trail-count").textContent = String(state.trails.size);
  $("#region-tabs").innerHTML = `<button class="region-tab" type="button" data-region="all" aria-pressed="true">所有方向<small>${data.cities.length}</small></button>${data.regions.map((region) => `<button class="region-tab" type="button" data-region="${region.id}" aria-pressed="false">${escapeHTML(region.name)}<small>${data.cities.filter((city) => city.region === region.id).length}</small></button>`).join("")}`;
  $("#interest-filters").innerHTML = details.interests.map((interest) => `<button class="interest-button" type="button" data-interest="${interest.id}" aria-pressed="false" title="${escapeHTML(interest.note)}">${icon(INTEREST_ICONS[interest.id])}${escapeHTML(interest.name)}<small>${[...state.guides.values()].filter((guide) => guide.interests.includes(interest.id)).length}</small></button>`).join("");
  drawBaseMap();
  bindEvents();
  render();
  $("#trip-date").value = isoDate(state.planDate);
  $("#trip-tabs").innerHTML = Object.entries(TRIP_LENGTHS).map(([days, name]) => `<button class="region-tab trip-tab" type="button" data-trip-length="${days}" aria-pressed="${Number(days) === state.tripLength}">${name}<small>${tripData.trips.filter((trip) => trip.days === Number(days)).length}</small></button>`).join("");
  renderTrips();
  fitMap();
  if (!persistPreferences()) preferenceWarnings.push("瀏覽器不允許持久儲存；本次可使用收藏，但關閉後可能不保留。");
  const tripId = url.searchParams.get("trip");
  if (tripId) {
    if (state.trips.has(tripId)) openTrip(tripId, { syncURL: false });
    else preferenceWarnings.push("這條行程連結不在目前指南裡，請從行程清單選。");
  }
  const cityId = url.searchParams.get("city");
  if (cityId) {
    if (state.cities.has(cityId)) openCity(cityId);
    else {
      preferenceWarnings.push("這個城市連結不在目前指南裡，請用清單搜尋。");
      updateURL(null);
    }
  } else updateURL(null);
  if (preferenceWarnings.length) showToast(preferenceWarnings.join(" "));
  document.documentElement.dataset.ready = "true";
}

initialize().catch((error) => {
  console.error("OUTSIDE：指南載入失敗。", error);
  $("#city-grid").innerHTML = `<p class="loading-message" role="alert">指南未能載入。請確認透過本機網站網址開啟，而不是直接雙擊 HTML，然後重新整理。<br>${escapeHTML(error.message)}</p>`;
  $("#results-count").textContent = "資料載入失敗，尚未顯示城市。";
  $("#map-panel").hidden = true;
  document.documentElement.dataset.ready = "error";
});
