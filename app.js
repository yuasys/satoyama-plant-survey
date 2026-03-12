/**
 * 里山 植物調査 - 記録アプリ
 * 撮影・位置・植物名を記録し、IndexedDBに保存・JSONエクスポート
 */

const DB_NAME = 'SatoyamaPlantSurvey';
const DB_VERSION = 1;
const STORE_NAME = 'records';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- UI 要素 ----------
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const previewImg = document.getElementById('previewImg');
const photoPlaceholder = photoPreview.querySelector('.photo-placeholder');
const clearPhotoBtn = document.getElementById('clearPhotoBtn');
const plantNameInput = document.getElementById('plantName');
const notesInput = document.getElementById('notes');
const locationStatus = document.getElementById('locationStatus');
const getLocationBtn = document.getElementById('getLocationBtn');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const saveBtn = document.getElementById('saveBtn');
const recordsList = document.getElementById('recordsList');
const emptyMessage = document.getElementById('emptyMessage');
const exportBtn = document.getElementById('exportBtn');

let currentPhotoDataUrl = null;

// ---------- 写真 ----------
photoPreview.addEventListener('click', () => {
  // プレビュー領域をタップしたら、実際のファイル入力を開く
  photoInput.click();
});

photoInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentPhotoDataUrl = reader.result;
    previewImg.src = currentPhotoDataUrl;
    previewImg.hidden = false;
    photoPlaceholder.hidden = true;
    clearPhotoBtn.hidden = false;
    updateSaveButton();
  };
  reader.readAsDataURL(file);
});

clearPhotoBtn.addEventListener('click', () => {
  currentPhotoDataUrl = null;
  previewImg.src = '';
  previewImg.hidden = true;
  photoPlaceholder.hidden = true;
  clearPhotoBtn.hidden = true;
  photoPlaceholder.hidden = false;
  photoInput.value = '';
  updateSaveButton();
});

// ---------- 位置 ----------
getLocationBtn.addEventListener('click', () => {
  locationStatus.textContent = '取得中...';
  if (!navigator.geolocation) {
    locationStatus.textContent = 'お使いの環境では位置情報が使えません';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      latitudeInput.value = lat;
      longitudeInput.value = lng;
      locationStatus.textContent = `緯度 ${lat.toFixed(5)}, 経度 ${lng.toFixed(5)}`;
      locationStatus.classList.add('has-location');
      updateSaveButton();
    },
    (err) => {
      locationStatus.textContent = '位置を取得できません: ' + (err.message || '許可されていません');
      locationStatus.classList.remove('has-location');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

// ---------- 保存 ----------
function updateSaveButton() {
  const hasLocation = latitudeInput.value && longitudeInput.value;
  const hasName = plantNameInput.value.trim().length > 0;
  saveBtn.disabled = !(hasLocation && hasName);
}

plantNameInput.addEventListener('input', updateSaveButton);

saveBtn.addEventListener('click', async () => {
  const plantName = plantNameInput.value.trim();
  const lat = latitudeInput.value;
  const lng = longitudeInput.value;
  if (!plantName || !lat || !lng) return;

  const record = {
    id: generateId(),
    plantName,
    notes: notesInput.value.trim(),
    latitude: parseFloat(lat),
    longitude: parseFloat(lng),
    photoDataUrl: currentPhotoDataUrl || null,
    createdAt: new Date().toISOString(),
  };

  try {
    const database = await openDB();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    showToast('記録を保存しました');
    renderRecords();
    resetForm();
  } catch (err) {
    showToast('保存に失敗しました: ' + (err.message || ''));
  }
});

function resetForm() {
  currentPhotoDataUrl = null;
  previewImg.src = '';
  previewImg.hidden = true;
  photoPlaceholder.hidden = false;
  clearPhotoBtn.hidden = true;
  photoInput.value = '';
  plantNameInput.value = '';
  notesInput.value = '';
  latitudeInput.value = '';
  longitudeInput.value = '';
  locationStatus.textContent = '取得していません';
  locationStatus.classList.remove('has-location');
  updateSaveButton();
}

// ---------- 一覧表示 ----------
async function getAllRecords() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const req = index.openCursor(null, 'prev');
    const results = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderRecords() {
  getAllRecords().then((records) => {
    recordsList.innerHTML = '';
    if (records.length === 0) {
      emptyMessage.classList.remove('hidden');
      return;
    }
    emptyMessage.classList.add('hidden');
    records.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'record-item';
      const imgPart = r.photoDataUrl
        ? `<img src="${r.photoDataUrl}" alt="">`
        : '<div class="no-image">写真なし</div>';
      li.innerHTML = `
        ${imgPart}
        <div class="body">
          <div class="plant-name">${escapeHtml(r.plantName)}</div>
          <div class="meta">${formatDate(r.createdAt)} · ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}</div>
          ${r.notes ? `<div class="notes">${escapeHtml(r.notes)}</div>` : ''}
        </div>
      `;
      recordsList.appendChild(li);
    });
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------- エクスポート ----------
exportBtn.addEventListener('click', async () => {
  const records = await getAllRecords();
  const data = {
    exportedAt: new Date().toISOString(),
    description: '里山 植物調査 - 記録データ',
    records: records.map((r) => ({
      id: r.id,
      plantName: r.plantName,
      notes: r.notes || '',
      latitude: r.latitude,
      longitude: r.longitude,
      createdAt: r.createdAt,
      hasPhoto: !!r.photoDataUrl,
      photoDataUrl: r.photoDataUrl || undefined,
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `satoyama-plant-survey-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSONをダウンロードしました');
});

// ---------- トースト ----------
function showToast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---------- 初期化 ----------
openDB().then(() => renderRecords()).catch(console.error);
updateSaveButton();
