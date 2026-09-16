
/* =========================================================
   FieldTest — history.js
   Reads records from the SAME IndexedDB store the Test page
   writes to (db: fieldtest_db, store: test_records, keyPath: testId).
   Falls back to a clearly-labelled demo dataset only when that
   storage cannot be accessed at all.
   ========================================================= */


/* ---------- Storage constants (must match test.js exactly) ---------- */

const DB_NAME = 'fieldtest_db';
const DB_VERSION = 1;
const STORE_NAME = 'test_records';


/* ---------- Demo fallback dataset (prototype only) ----------
   Used ONLY if IndexedDB itself cannot be opened (unsupported browser
   or a storage error) so the page still demonstrates its functionality.
   Structured identically to a real record -- swap this array out or
   remove the fallback path once storage is guaranteed to be available. */

const DEMO_FALLBACK_RECORDS = [
  {
    testId: 'FT-2026-00124',
    operatorId: 'OP-102',
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 2
    ).toISOString(),
    location: {
      latitude: 26.9124,
      longitude: 75.7873,
      accuracy: 12
    },
    result: 'PRESUMPTIVE_NEGATIVE',
    confidence: 91,
    imageHash:
      'a84fbe21c9d0e3f7451b8a2c6d9e0f1a2b3c4d5e6f7081920a1b2c3d4e5f6091',
    integrityStatus: 'VALID',
    image: null,
    recordCreatedAt: new Date(
      Date.now() - 1000 * 60 * 60 * 2
    ).toISOString(),
    status: 'SAVED'
  },

  {
    testId: 'FT-2026-00123',
    operatorId: 'OP-102',
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24
    ).toISOString(),
    location: {
      latitude: null,
      longitude: null,
      accuracy: null,
      status: 'denied'
    },
    result: 'INCONCLUSIVE',
    confidence: 64,
    imageHash:
      '5e6f7081920a1b2c3d4e5f6091a84fbe21c9d0e3f7451b8a2c6d9e0f1a2b3c4',
    integrityStatus: 'VALID',
    image: null,
    recordCreatedAt: new Date(
      Date.now() - 1000 * 60 * 60 * 24
    ).toISOString(),
    status: 'SAVED'
  },

  {
    testId: 'FT-2026-00122',
    operatorId: 'OP-102',
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 2
    ).toISOString(),
    location: {
      latitude: 26.9155,
      longitude: 75.8,
      accuracy: 18
    },
    result: 'PRESUMPTIVE_POSITIVE',
    confidence: 88,
    imageHash:
      '2c3d4e5f6091a84fbe21c9d0e3f7451b8a2c6d9e0f1a2b3c4d5e6f7081920a1',
    integrityStatus: 'VALID',
    image: null,
    recordCreatedAt: new Date(
      Date.now() - 1000 * 60 * 60 * 24 * 2
    ).toISOString(),
    status: 'SAVED'
  }
];


/* ---------- Result metadata ---------- */

const RESULT_META = {
  PRESUMPTIVE_POSITIVE: {
    label: 'Presumptive Positive',
    badgeClass: 'badge--positive'
  },

  PRESUMPTIVE_NEGATIVE: {
    label: 'Presumptive Negative',
    badgeClass: 'badge--negative'
  },

  INCONCLUSIVE: {
    label: 'Inconclusive',
    badgeClass: 'badge--inconclusive'
  }
};


function resultMeta(result) {
  return (
    RESULT_META[result] || {
      label: 'Unknown',
      badgeClass: 'badge--neutral'
    }
  );
}


/* ---------- Application state ---------- */

const state = {
  allRecords: [],
  usingDemoData: false,

  filters: {
    search: '',
    result: 'all',
    date: 'all'
  },

  imageObjectUrls: []
};


/* ---------- DOM references ---------- */

const els = {};


function cacheDom() {
  els.filterToggleBtn = document.getElementById('filter-toggle-btn');
  els.filtersPanel = document.getElementById('filters-panel');

  els.searchBar = document.getElementById('search-bar');
  els.searchInput = document.getElementById('search-input');
  els.searchClearBtn = document.getElementById('search-clear-btn');

  els.resultFilterRow = document.getElementById('result-filter-row');
  els.dateFilterRow = document.getElementById('date-filter-row');

  els.clearFiltersBtn = document.getElementById('clear-filters-btn');

  els.demoBanner = document.getElementById('demo-banner');

  els.listContainer = document.getElementById('list-container');
  els.emptyState = document.getElementById('empty-state');
  els.noResultsState = document.getElementById('no-results-state');
  els.storageErrorState = document.getElementById(
    'storage-error-state'
  );

  /* ---------- Detail overlay ---------- */

  els.detailOverlay = document.getElementById('detail-overlay');
  els.detailCloseBtn = document.getElementById('detail-close-btn');

  els.detailTestId = document.getElementById('detail-test-id');
  els.detailResult = document.getElementById('detail-result');
  els.detailDate = document.getElementById('detail-date');
  els.detailTime = document.getElementById('detail-time');
  els.detailOperator = document.getElementById('detail-operator');
  els.detailLocation = document.getElementById('detail-location');

  els.detailImageFrame = document.getElementById('detail-image-frame');
  els.detailImagePlaceholder = document.getElementById(
    'detail-image-placeholder'
  );
  els.detailImage = document.getElementById('detail-image');

  els.detailRecordTimestamp = document.getElementById(
    'detail-record-timestamp'
  );
  els.detailRecordOperator = document.getElementById(
    'detail-record-operator'
  );
  els.detailRecordLocation = document.getElementById(
    'detail-record-location'
  );
  els.detailRecordHash = document.getElementById(
    'detail-record-hash'
  );
  els.detailCopyHashBtn = document.getElementById(
    'detail-copy-hash-btn'
  );
  els.detailRecordIntegrity = document.getElementById(
    'detail-record-integrity'
  );

  els.toast = document.getElementById('toast');
}


/* =========================================================
   STORAGE INTEGRATION
   ========================================================= */

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'testId'
        });
      }
    };

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}


function getAllRecordsFromDb() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(
            STORE_NAME,
            'readonly'
          );

          const store = tx.objectStore(STORE_NAME);

          const req = store.getAll
            ? store.getAll()
            : null;

          if (req) {
            req.onsuccess = () => {
              resolve(req.result || []);
            };

            req.onerror = () => {
              reject(req.error);
            };
          } else {
            const results = [];

            const cursorReq = store.openCursor();

            cursorReq.onsuccess = (e) => {
              const cursor = e.target.result;

              if (cursor) {
                results.push(cursor.value);
                cursor.continue();
              } else {
                resolve(results);
              }
            };

            cursorReq.onerror = () => {
              reject(cursorReq.error);
            };
          }
        } catch (err) {
          reject(err);
        }
      })
  );
}


/* =========================================================
   NORMALIZATION
   ========================================================= */

function safeDate(value) {
  if (!value) return null;

  const d = new Date(value);

  return isNaN(d.getTime()) ? null : d;
}


function normalizeRecord(raw) {
  const timestamp =
    safeDate(raw.timestamp) ||
    safeDate(raw.recordCreatedAt);

  const location = raw.location || {};

  const hasCoords =
    location.latitude != null &&
    location.longitude != null;

  return {
    testId: raw.testId || 'Unknown Test ID',

    operatorId: raw.operatorId || null,

    timestampDate: timestamp,

    result: raw.result || null,

    confidence:
      typeof raw.confidence === 'number'
        ? raw.confidence
        : null,

    hasCoords: hasCoords,

    latitude: hasCoords
      ? location.latitude
      : null,

    longitude: hasCoords
      ? location.longitude
      : null,

    imageHash: raw.imageHash || null,

    integrityStatus:
      raw.integrityStatus || null,

    imageBlob:
      raw.image instanceof Blob
        ? raw.image
        : null
  };
}


/* =========================================================
   LOAD RECORDS
   ========================================================= */

async function loadAllRecords() {
  try {
    const raw = await getAllRecordsFromDb();

    state.usingDemoData = false;

    return raw.map(normalizeRecord);
  } catch (err) {
    state.usingDemoData = true;

    return DEMO_FALLBACK_RECORDS.map(
      normalizeRecord
    );
  }
}


function sortNewestFirst(records) {
  return records.slice().sort((a, b) => {
    const ta = a.timestampDate
      ? a.timestampDate.getTime()
      : 0;

    const tb = b.timestampDate
      ? b.timestampDate.getTime()
      : 0;

    return tb - ta;
  });
}


/* =========================================================
   FORMATTING HELPERS
   ========================================================= */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];


function formatDateLong(date) {
  return (
    `${String(date.getDate()).padStart(2, '0')} ` +
    `${MONTHS[date.getMonth()]} ` +
    `${date.getFullYear()}`
  );
}


function formatTime(date) {
  let hours = date.getHours();

  const minutes = String(
    date.getMinutes()
  ).padStart(2, '0');

  const ampm = hours >= 12
    ? 'PM'
    : 'AM';

  hours = hours % 12;

  if (hours === 0) {
    hours = 12;
  }

  return `${hours}:${minutes} ${ampm}`;
}


function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}


function dateGroupLabel(date) {
  const now = new Date();

  const yesterday = new Date(now);

  yesterday.setDate(
    now.getDate() - 1
  );

  if (isSameDay(date, now)) {
    return 'Today';
  }

  if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  }

  return formatDateLong(date).toUpperCase();
}


function formatLocationShort(record) {
  if (!record.hasCoords) {
    return 'Location unavailable';
  }

  return (
    `${record.latitude.toFixed(3)}\u00b0, ` +
    `${record.longitude.toFixed(3)}\u00b0`
  );
}


function truncateHash(hash) {
  if (!hash) {
    return 'Not available';
  }

  if (hash.length <= 20) {
    return hash;
  }

  return (
    `${hash.slice(0, 10)}\u2026` +
    `${hash.slice(-8)}`
  );
}


/* =========================================================
   FILTERING + GROUPING
   ========================================================= */

function matchesSearch(record, term) {
  if (!term) {
    return true;
  }

  const haystack = [
    record.testId,
    record.operatorId,
    resultMeta(record.result).label,

    record.timestampDate
      ? formatDateLong(record.timestampDate)
      : '',

    record.hasCoords
      ? formatLocationShort(record)
      : ''
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(
    term.toLowerCase()
  );
}


function matchesResultFilter(record, filter) {
  if (filter === 'all') {
    return true;
  }

  return record.result === filter;
}


function matchesDateFilter(record, filter) {
  if (filter === 'all') {
    return true;
  }

  if (!record.timestampDate) {
    return false;
  }

  const now = Date.now();

  const ageMs =
    now - record.timestampDate.getTime();

  const day =
    1000 * 60 * 60 * 24;

  if (filter === 'today') {
    return isSameDay(
      record.timestampDate,
      new Date()
    );
  }

  if (filter === '7d') {
    return ageMs <= day * 7;
  }

  if (filter === '30d') {
    return ageMs <= day * 30;
  }

  return true;
}


function getFilteredRecords() {
  const search = state.filters.search;
  const result = state.filters.result;
  const date = state.filters.date;

  return state.allRecords.filter(
    (r) =>
      matchesSearch(r, search) &&
      matchesResultFilter(r, result) &&
      matchesDateFilter(r, date)
  );
}


function groupByDate(records) {
  const groups = [];

  let currentLabel = null;
  let currentGroup = null;

  records.forEach((record) => {
    const label = record.timestampDate
      ? dateGroupLabel(
          record.timestampDate
        )
      : 'Date unavailable';

    if (label !== currentLabel) {
      currentGroup = {
        label: label,
        records: []
      };

      groups.push(currentGroup);

      currentLabel = label;
    }

    currentGroup.records.push(record);
  });

  return groups;
}


/* =========================================================
   RENDERING
   ========================================================= */

function iconForResult(result) {
  if (result === 'PRESUMPTIVE_POSITIVE') {
    return {
      bg: 'var(--color-status-positive-bg)',
      color:
        'var(--color-status-positive-text)',

      svg:
        '<path d="M9 2v9L3 20a2.4 2.4 0 002 3.7h9a2.4 2.4 0 002-3.7l-6-9V2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'
    };
  }

  if (result === 'PRESUMPTIVE_NEGATIVE') {
    return {
      bg:
        'var(--color-status-negative-bg)',

      color:
        'var(--color-status-negative-text)',

      svg:
        '<circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M6 9l2 2 4-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    };
  }

  if (result === 'INCONCLUSIVE') {
    return {
      bg:
        'var(--color-status-inconclusive-bg)',

      color:
        'var(--color-status-inconclusive-text)',

      svg:
        '<path d="M9 2l7 12H2L9 2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8v3M9 13.5v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    };
  }

  return {
    bg: 'var(--color-surface-soft)',

    color:
      'var(--color-text-muted)',

    svg:
      '<circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.6"/>'
  };
}


function renderRecordCard(record) {
  const meta = resultMeta(record.result);

  const icon = iconForResult(
    record.result
  );

  const dateStr =
    record.timestampDate
      ? formatDateLong(
          record.timestampDate
        )
      : 'Not available';

  const timeStr =
    record.timestampDate
      ? formatTime(
          record.timestampDate
        )
      : '';

  const locationStr =
    formatLocationShort(record);

  return `
    <button
      type="button"
      class="record-card"
      data-test-id="${record.testId}"
    >
      <span
        class="record-card__icon"
        style="background:${icon.bg}; color:${icon.color};"
      >
        <svg
          viewBox="0 0 18 18"
          fill="none"
        >
          ${icon.svg}
        </svg>
      </span>

      <span class="record-card__body">
        <span class="record-card__top">
          <span class="record-card__id">
            ${record.testId}
          </span>

          <span class="badge ${meta.badgeClass}">
            ${meta.label}
          </span>
        </span>

        <span class="record-card__meta">
          ${dateStr}
          ${timeStr
            ? ' \u2022 ' + timeStr
            : ''}
          \u00b7 ${locationStr}
        </span>
      </span>

      <span class="record-card__chevron">
        <svg
          viewBox="0 0 7 12"
          fill="none"
        >
          <path
            d="M1 1l5 5-5 5"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>
  `;
}


function renderList() {
  const hasAnyRecordsAtAll =
    state.allRecords.length > 0;

  const filtered =
    sortNewestFirst(
      getFilteredRecords()
    );

  const filtersActive =
    state.filters.search ||
    state.filters.result !== 'all' ||
    state.filters.date !== 'all';

  els.demoBanner.classList.toggle(
    'is-visible',
    state.usingDemoData
  );

  if (!hasAnyRecordsAtAll) {
    els.listContainer.innerHTML = '';

    els.emptyState.classList.add(
      'is-visible'
    );

    els.noResultsState.classList.remove(
      'is-visible'
    );

    els.storageErrorState.classList.remove(
      'is-visible'
    );

    return;
  }

  els.emptyState.classList.remove(
    'is-visible'
  );

  els.storageErrorState.classList.remove(
    'is-visible'
  );

  if (filtered.length === 0) {
    els.listContainer.innerHTML = '';

    els.noResultsState.classList.add(
      'is-visible'
    );

    return;
  }

  els.noResultsState.classList.remove(
    'is-visible'
  );

  const groups =
    groupByDate(filtered);

  els.listContainer.innerHTML =
    groups
      .map(
        (group) => `
          <div class="date-group">
            <p class="date-group__label">
              ${group.label}
            </p>

            <div class="record-list">
              ${group.records
                .map(renderRecordCard)
                .join('')}
            </div>
          </div>
        `
      )
      .join('');

  els.clearFiltersBtn.classList.toggle(
    'is-visible',
    Boolean(filtersActive)
  );
}


/* =========================================================
   DETAIL VIEW
   ========================================================= */

function revokeTrackedImageUrls() {
  state.imageObjectUrls.forEach(
    (url) => URL.revokeObjectURL(url)
  );

  state.imageObjectUrls = [];
}


function openDetail(testId) {
  const record =
    state.allRecords.find(
      (r) => r.testId === testId
    );

  if (!record) {
    return;
  }

  const meta =
    resultMeta(record.result);

  els.detailTestId.textContent =
    record.testId;

  els.detailResult.textContent =
    meta.label;

  els.detailDate.textContent =
    record.timestampDate
      ? formatDateLong(
          record.timestampDate
        )
      : 'Not available';

  els.detailTime.textContent =
    record.timestampDate
      ? formatTime(
          record.timestampDate
        )
      : 'Not available';

  els.detailOperator.textContent =
    record.operatorId ||
    'Not available';

  els.detailLocation.textContent =
    record.hasCoords
      ? `Lat ${record.latitude.toFixed(
          4
        )}\u00b0  Long ${record.longitude.toFixed(
          4
        )}\u00b0`
      : 'Location unavailable';


  /* ---------- Image ---------- */

  revokeTrackedImageUrls();

  if (record.imageBlob) {
    const url =
      URL.createObjectURL(
        record.imageBlob
      );

    state.imageObjectUrls.push(url);

    els.detailImage.src = url;

    els.detailImage.style.display =
      'block';

    els.detailImagePlaceholder.style.display =
      'none';
  } else {
    els.detailImage.style.display =
      'none';

    els.detailImage.removeAttribute(
      'src'
    );

    els.detailImagePlaceholder.style.display =
      'flex';
  }


  /* ---------- Record metadata ---------- */

  els.detailRecordTimestamp.textContent =
    record.timestampDate
      ? formatDateLong(
          record.timestampDate
        ) +
        ', ' +
        formatTime(
          record.timestampDate
        )
      : 'Not available';

  els.detailRecordOperator.textContent =
    record.operatorId ||
    'Not available';

  els.detailRecordLocation.textContent =
    record.hasCoords
      ? 'Available'
      : 'Unavailable';

  els.detailRecordHash.textContent =
    truncateHash(
      record.imageHash
    );

  els.detailRecordHash.title =
    record.imageHash || '';

  els.detailCopyHashBtn.style.display =
    record.imageHash
      ? 'inline-flex'
      : 'none';

  els.detailCopyHashBtn.dataset.hash =
    record.imageHash || '';

  els.detailRecordIntegrity.textContent =
    record.integrityStatus === 'VALID'
      ? 'Verified'
      : record.integrityStatus ||
        'Not available';

  els.detailOverlay.classList.add(
    'is-open'
  );
}


function closeDetail() {
  els.detailOverlay.classList.remove(
    'is-open'
  );
}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer = null;


function showToast(message) {
  els.toast.textContent = message;

  els.toast.classList.add(
    'is-visible'
  );

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    els.toast.classList.remove(
      'is-visible'
    );
  }, 1800);
}


/* =========================================================
   EVENT WIRING
   ========================================================= */

function wireEvents() {

  /* =======================================================
     FILTER PANEL

     IMPORTANT:
     Filter panel will ALWAYS start CLOSED when
     history.html is opened.
     ======================================================= */

  if (
    els.filtersPanel &&
    els.filterToggleBtn
  ) {
    els.filtersPanel.classList.add(
      'is-collapsed'
    );

    els.filterToggleBtn.setAttribute(
      'aria-expanded',
      'false'
    );

    els.filterToggleBtn.addEventListener(
      'click',
      () => {
        const collapsed =
          els.filtersPanel.classList.toggle(
            'is-collapsed'
          );

        els.filterToggleBtn.setAttribute(
          'aria-expanded',
          String(!collapsed)
        );
      }
    );
  }


  /* ---------- Search ---------- */

  els.searchInput.addEventListener(
    'input',
    () => {
      state.filters.search =
        els.searchInput.value.trim();

      els.searchBar.classList.toggle(
        'has-value',
        Boolean(
          state.filters.search
        )
      );

      renderList();
    }
  );


  els.searchClearBtn.addEventListener(
    'click',
    () => {
      els.searchInput.value = '';

      state.filters.search = '';

      els.searchBar.classList.remove(
        'has-value'
      );

      renderList();
    }
  );


  /* ---------- Result filter ---------- */

  els.resultFilterRow.addEventListener(
    'click',
    (e) => {
      const chip =
        e.target.closest('.chip');

      if (!chip) {
        return;
      }

      state.filters.result =
        chip.dataset.resultFilter;

      Array.from(
        els.resultFilterRow.children
      ).forEach((c) => {
        c.classList.toggle(
          'is-active',
          c === chip
        );
      });

      updateFilterDot();

      renderList();
    }
  );


  /* ---------- Date filter ---------- */

  els.dateFilterRow.addEventListener(
    'click',
    (e) => {
      const chip =
        e.target.closest('.chip');

      if (!chip) {
        return;
      }

      state.filters.date =
        chip.dataset.dateFilter;

      Array.from(
        els.dateFilterRow.children
      ).forEach((c) => {
        c.classList.toggle(
          'is-active',
          c === chip
        );
      });

      updateFilterDot();

      renderList();
    }
  );


  /* ---------- Clear filters ---------- */

  els.clearFiltersBtn.addEventListener(
    'click',
    () => {
      state.filters = {
        search: '',
        result: 'all',
        date: 'all'
      };

      els.searchInput.value = '';

      els.searchBar.classList.remove(
        'has-value'
      );

      Array.from(
        els.resultFilterRow.children
      ).forEach((c) => {
        c.classList.toggle(
          'is-active',
          c.dataset.resultFilter ===
            'all'
        );
      });

      Array.from(
        els.dateFilterRow.children
      ).forEach((c) => {
        c.classList.toggle(
          'is-active',
          c.dataset.dateFilter ===
            'all'
        );
      });

      updateFilterDot();

      renderList();
    }
  );


  /* ---------- Record cards ---------- */

  els.listContainer.addEventListener(
    'click',
    (e) => {
      const card =
        e.target.closest(
          '.record-card'
        );

      if (!card) {
        return;
      }

      openDetail(
        card.dataset.testId
      );
    }
  );


  /* ---------- Detail close ---------- */

  els.detailCloseBtn.addEventListener(
    'click',
    closeDetail
  );


  els.detailOverlay.addEventListener(
    'click',
    (e) => {
      if (
        e.target ===
        els.detailOverlay
      ) {
        closeDetail();
      }
    }
  );


  /* ---------- Copy hash ---------- */

  els.detailCopyHashBtn.addEventListener(
    'click',
    async () => {
      const hash =
        els.detailCopyHashBtn.dataset.hash;

      if (!hash) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          hash
        );

        showToast(
          'Hash copied to clipboard'
        );
      } catch (e) {
        showToast(
          'Could not copy — long-press the hash to select it manually'
        );
      }
    }
  );


  /* =======================================================
     NAVIGATION
     ======================================================= */

  document
    .querySelectorAll(
      '.nav-item[data-nav]'
    )
    .forEach((item) => {

      item.addEventListener(
        'click',
        () => {

          const nav =
            item.dataset.nav;


          /* ---------- History ---------- */

          if (nav === 'history') {
            return;
          }


          /* ---------- Reports ---------- */

          if (nav === 'reports') {
            window.location.href =
              'reports.html';

            return;
          }


          /* ---------- Home ---------- */

          if (nav === 'home') {
            window.location.href =
              'home.html';

            return;
          }


          /* ---------- New Test ---------- */

          if (nav === 'new-test') {
            window.location.href =
              'test.html';

            return;
          }


          /* ---------- Other pages ---------- */

          showToast(
            'This screen is coming soon'
          );
        }
      );
    });
}


/* =========================================================
   FILTER DOT
   ========================================================= */

function updateFilterDot() {
  const active =
    state.filters.result !== 'all' ||
    state.filters.date !== 'all';

  els.filterToggleBtn.classList.toggle(
    'has-active',
    active
  );
}


/* =========================================================
   INIT
   ========================================================= */

async function init() {
  cacheDom();

  /*
    Make absolutely sure the filter is closed
    before the page starts rendering.
  */
  if (
    els.filtersPanel &&
    els.filterToggleBtn
  ) {
    els.filtersPanel.classList.add(
      'is-collapsed'
    );

    els.filterToggleBtn.setAttribute(
      'aria-expanded',
      'false'
    );
  }

  wireEvents();

  const records =
    await loadAllRecords();

  state.allRecords =
    sortNewestFirst(records);

  updateFilterDot();

  renderList();
}


/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  init
);
