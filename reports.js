/* =========================================================
   FieldTest — reports.js
   Reads the SAME test records the Test page writes to IndexedDB
   (db: fieldtest_db, store: test_records) and derives a report
   for each one. PDFs are generated on-demand, client-side, from
   the real record data using jsPDF (loaded via CDN in reports.html).
   ========================================================= */

/* ---------- Storage constants (must match test.js / history.js) ---------- */
const DB_NAME = 'fieldtest_db';
const DB_VERSION = 1;
const STORE_NAME = 'test_records';

/* ---------- Demo fallback dataset (prototype only) ----------
   Mirrors the same sample test IDs used in history.js's fallback so
   both pages agree if neither can reach real storage. Used ONLY when
   IndexedDB itself cannot be opened at all. */
const DEMO_FALLBACK_RECORDS = [
  {
    testId: 'FT-2026-00124',
    operatorId: 'OP-102',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    location: { latitude: 26.9124, longitude: 75.7873, accuracy: 12 },
    result: 'PRESUMPTIVE_NEGATIVE',
    confidence: 91,
    imageHash: 'a84fbe21c9d0e3f7451b8a2c6d9e0f1a2b3c4d5e6f7081920a1b2c3d4e5f6091',
    integrityStatus: 'VALID',
    image: null,
    recordCreatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    status: 'SAVED',
  },
  {
    testId: 'FT-2026-00123',
    operatorId: 'OP-102',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    location: { latitude: null, longitude: null, accuracy: null, status: 'denied' },
    result: 'INCONCLUSIVE',
    confidence: 64,
    imageHash: '5e6f7081920a1b2c3d4e5f6091a84fbe21c9d0e3f7451b8a2c6d9e0f1a2b3c4',
    integrityStatus: 'VALID',
    image: null,
    recordCreatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    status: 'SAVED',
  },
  {
    testId: 'FT-2026-00122',
    operatorId: 'OP-102',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    location: { latitude: 26.9155, longitude: 75.8, accuracy: 18 },
    result: 'PRESUMPTIVE_POSITIVE',
    confidence: 88,
    imageHash: '2c3d4e5f6091a84fbe21c9d0e3f7451b8a2c6d9e0f1a2b3c4d5e6f7081920a1',
    integrityStatus: 'VALID',
    image: null,
    recordCreatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    status: 'SAVED',
  },
];

/* ---------- Result metadata ---------- */
const RESULT_META = {
  PRESUMPTIVE_POSITIVE: {
    label: 'Presumptive Positive',
    badgeClass: 'badge--positive',
  },
  PRESUMPTIVE_NEGATIVE: {
    label: 'Presumptive Negative',
    badgeClass: 'badge--negative',
  },
  INCONCLUSIVE: {
    label: 'Inconclusive',
    badgeClass: 'badge--inconclusive',
  },
};

function resultMeta(result) {
  return (
    RESULT_META[result] || {
      label: 'Unknown',
      badgeClass: 'badge--neutral',
    }
  );
}

const STATUS_META = {
  GENERATED: {
    label: 'Generated',
    badgeClass: 'badge--status-generated',
  },
  PENDING: {
    label: 'Pending',
    badgeClass: 'badge--status-pending',
  },
  FAILED: {
    label: 'Failed',
    badgeClass: 'badge--status-failed',
  },
};

/* ---------- Application state ---------- */
const state = {
  allReports: [],
  usingDemoData: false,
  filters: {
    search: '',
    status: 'all',
    result: 'all',
    date: 'all',
  },
  imageObjectUrls: [],
  activeReportId: null,
};

const els = {};

function cacheDom() {
  els.filterToggleBtn = document.getElementById('filter-toggle-btn');
  els.filtersPanel = document.getElementById('filters-panel');
  els.searchBar = document.getElementById('search-bar');
  els.searchInput = document.getElementById('search-input');
  els.searchClearBtn = document.getElementById('search-clear-btn');
  els.statusFilterRow = document.getElementById('status-filter-row');
  els.resultFilterRow = document.getElementById('result-filter-row');
  els.dateFilterRow = document.getElementById('date-filter-row');
  els.clearFiltersBtn = document.getElementById('clear-filters-btn');
  els.demoBanner = document.getElementById('demo-banner');
  els.listContainer = document.getElementById('list-container');
  els.emptyState = document.getElementById('empty-state');
  els.noResultsState = document.getElementById('no-results-state');
  els.storageErrorState = document.getElementById('storage-error-state');

  els.summaryTotal = document.getElementById('summary-total');
  els.summaryGenerated = document.getElementById('summary-generated');
  els.summaryPending = document.getElementById('summary-pending');

  els.detailOverlay = document.getElementById('detail-overlay');
  els.detailCloseBtn = document.getElementById('detail-close-btn');
  els.detailReportId = document.getElementById('detail-report-id');
  els.detailTestId = document.getElementById('detail-test-id');
  els.detailResult = document.getElementById('detail-result');
  els.detailDate = document.getElementById('detail-date');
  els.detailTime = document.getElementById('detail-time');
  els.detailOperator = document.getElementById('detail-operator');
  els.detailLocation = document.getElementById('detail-location');
  els.detailImageFrame = document.getElementById('detail-image-frame');
  els.detailImagePlaceholder = document.getElementById('detail-image-placeholder');
  els.detailImage = document.getElementById('detail-image');
  els.detailHash = document.getElementById('detail-hash');
  els.detailIntegrityTimestamp = document.getElementById(
    'detail-integrity-timestamp'
  );
  els.detailIntegrityOperator = document.getElementById(
    'detail-integrity-operator'
  );
  els.detailIntegrityLocation = document.getElementById(
    'detail-integrity-location'
  );

  els.pdfStatus = document.getElementById('pdf-status');
  els.pdfSpinner = document.getElementById('pdf-spinner');
  els.pdfStatusText = document.getElementById('pdf-status-text');
  els.downloadPdfBtn = document.getElementById('download-pdf-btn');
  els.downloadPdfBtnLabel = document.getElementById(
    'download-pdf-btn-label'
  );

  els.toast = document.getElementById('toast');
}

/* =========================================================
   STORAGE INTEGRATION -- same IndexedDB the Test page writes to
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
          keyPath: 'testId',
        });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllRecordsFromDb() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll ? store.getAll() : null;

          if (req) {
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
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

            cursorReq.onerror = () => reject(cursorReq.error);
          }
        } catch (err) {
          reject(err);
        }
      })
  );
}

/* =========================================================
   REPORT ID DERIVATION -- deterministic, not random per load
   ========================================================= */

function deriveReportId(testId) {
  if (testId && testId.indexOf('FT-') === 0) {
    return `RPT-${testId.slice(3)}`;
  }

  return `RPT-${testId || 'UNKNOWN'}`;
}

function deriveReportStatus(raw) {
  // A report can only be fully generated once its underlying record has
  // everything a report needs. The Test page only saves a record after
  // the hash + result are ready, so in practice this is almost always
  // "Generated" -- "Pending" reflects a genuinely incomplete record.

  const hasCore =
    raw.testId &&
    raw.result &&
    (raw.timestamp || raw.recordCreatedAt);

  return hasCore ? 'GENERATED' : 'PENDING';
}

/* =========================================================
   NORMALIZATION
   ========================================================= */

function safeDate(value) {
  if (!value) return null;

  const d = new Date(value);

  return isNaN(d.getTime()) ? null : d;
}

function normalizeReport(raw) {
  const timestamp =
    safeDate(raw.timestamp) ||
    safeDate(raw.recordCreatedAt);

  const location = raw.location || {};

  const hasCoords =
    location.latitude != null &&
    location.longitude != null;

  return {
    reportId: deriveReportId(raw.testId),
    testId: raw.testId || 'Unknown Test ID',
    operatorId: raw.operatorId || null,
    timestampDate: timestamp,
    result: raw.result || null,
    hasCoords: hasCoords,
    latitude: hasCoords ? location.latitude : null,
    longitude: hasCoords ? location.longitude : null,
    imageHash: raw.imageHash || null,
    integrityStatus: raw.integrityStatus || null,
    imageBlob: raw.image instanceof Blob ? raw.image : null,
    status: deriveReportStatus(raw),
  };
}

/* =========================================================
   LOAD REPORTS
   ========================================================= */

async function loadAllReports() {
  try {
    const raw = await getAllRecordsFromDb();

    state.usingDemoData = false;

    return raw.map(normalizeReport);
  } catch (err) {
    state.usingDemoData = true;

    return DEMO_FALLBACK_RECORDS.map(normalizeReport);
  }
}

function sortNewestFirst(reports) {
  return reports.slice().sort((a, b) => {
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
  'Dec',
];

function formatDateLong(date) {
  return `${String(date.getDate()).padStart(2, '0')} ${
    MONTHS[date.getMonth()]
  } ${date.getFullYear()}`;
}

function formatTime(date) {
  let hours = date.getHours();

  const minutes = String(date.getMinutes()).padStart(2, '0');

  const ampm = hours >= 12 ? 'PM' : 'AM';

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

/* =========================================================
   FILTERING
   ========================================================= */

function matchesSearch(report, term) {
  if (!term) return true;

  const haystack = [
    report.reportId,
    report.testId,
    report.operatorId,
    resultMeta(report.result).label,
    report.timestampDate
      ? formatDateLong(report.timestampDate)
      : '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.indexOf(term.toLowerCase()) !== -1;
}

function matchesStatusFilter(report, filter) {
  if (filter === 'all') return true;

  return report.status === filter;
}

function matchesResultFilter(report, filter) {
  if (filter === 'all') return true;

  return report.result === filter;
}

function matchesDateFilter(report, filter) {
  if (filter === 'all') return true;

  if (!report.timestampDate) return false;

  const now = Date.now();

  const ageMs =
    now - report.timestampDate.getTime();

  const day =
    1000 * 60 * 60 * 24;

  if (filter === 'today') {
    return isSameDay(
      report.timestampDate,
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

function getFilteredReports() {
  const f = state.filters;

  return state.allReports.filter(
    (r) =>
      matchesSearch(r, f.search) &&
      matchesStatusFilter(r, f.status) &&
      matchesResultFilter(r, f.result) &&
      matchesDateFilter(r, f.date)
  );
}

/* =========================================================
   RENDERING
   ========================================================= */

function renderSummary() {
  const total = state.allReports.length;

  const generated =
    state.allReports.filter(
      (r) => r.status === 'GENERATED'
    ).length;

  const pending =
    state.allReports.filter(
      (r) => r.status === 'PENDING'
    ).length;

  els.summaryTotal.textContent = String(total);
  els.summaryGenerated.textContent = String(generated);
  els.summaryPending.textContent = String(pending);
}

function renderReportCard(report) {
  const rMeta = resultMeta(report.result);

  const sMeta =
    STATUS_META[report.status] ||
    STATUS_META.PENDING;

  const dateStr = report.timestampDate
    ? formatDateLong(report.timestampDate)
    : 'Not available';

  const timeStr = report.timestampDate
    ? formatTime(report.timestampDate)
    : '';

  const canDownload =
    report.status === 'GENERATED';

  return `
    <div class="report-card" data-report-id="${report.reportId}">
      <div class="report-card__top">
        <div>
          <p class="report-card__id">${report.reportId}</p>
          <p class="report-card__testid">Test ID: ${report.testId}</p>
        </div>

        <span class="badge ${rMeta.badgeClass}">
          ${rMeta.label}
        </span>
      </div>

      <p class="report-card__meta">
        ${dateStr}${timeStr ? ' • ' + timeStr : ''}
      </p>

      <p class="report-card__meta">
        Operator: ${report.operatorId || 'Not available'}
      </p>

      <span class="badge ${sMeta.badgeClass}">
        ${sMeta.label}
      </span>

      <div class="report-card__actions">

        <button
          type="button"
          class="action-btn action-btn--ghost"
          data-action="view"
          data-report-id="${report.reportId}"
        >
          <svg
            viewBox="0 0 18 18"
            fill="none"
          >
            <path
              d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"
              stroke="currentColor"
              stroke-width="1.4"
            />
            <circle
              cx="9"
              cy="9"
              r="2.3"
              stroke="currentColor"
              stroke-width="1.4"
            />
          </svg>

          View Report
        </button>

        <button
          type="button"
          class="action-btn action-btn--solid"
          data-action="download"
          data-report-id="${report.reportId}"
          ${canDownload ? '' : 'disabled'}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10"
              stroke="white"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          Download PDF
        </button>

      </div>
    </div>
  `;
}

function renderList() {
  const hasAny =
    state.allReports.length > 0;

  const filtered =
    sortNewestFirst(
      getFilteredReports()
    );

  const f = state.filters;

  const filtersActive =
    f.search ||
    f.status !== 'all' ||
    f.result !== 'all' ||
    f.date !== 'all';

  els.demoBanner.classList.toggle(
    'is-visible',
    state.usingDemoData
  );

  if (!hasAny) {
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

  els.listContainer.innerHTML =
    filtered.map(renderReportCard).join('');

  els.clearFiltersBtn.classList.toggle(
    'is-visible',
    Boolean(filtersActive)
  );
}

/* =========================================================
   REPORT PREVIEW
   ========================================================= */

function revokeTrackedImageUrls() {
  state.imageObjectUrls.forEach(
    (url) => URL.revokeObjectURL(url)
  );

  state.imageObjectUrls = [];
}

function findReport(reportId) {
  return state.allReports.find(
    (r) => r.reportId === reportId
  );
}

function setPdfStatus(text, variant) {
  els.pdfStatusText.textContent =
    text || '';

  els.pdfStatus.classList.remove(
    'is-error',
    'is-success'
  );

  if (variant) {
    els.pdfStatus.classList.add(
      variant === 'error'
        ? 'is-error'
        : 'is-success'
    );
  }

  els.pdfSpinner.classList.toggle(
    'is-spinning',
    variant === 'loading'
  );
}

function openPreview(reportId) {
  const report = findReport(reportId);

  if (!report) return;

  state.activeReportId = reportId;

  const meta = resultMeta(
    report.result
  );

  els.detailReportId.textContent =
    report.reportId;

  els.detailTestId.textContent =
    report.testId;

  els.detailResult.textContent =
    meta.label;

  els.detailDate.textContent =
    report.timestampDate
      ? formatDateLong(report.timestampDate)
      : 'Not available';

  els.detailTime.textContent =
    report.timestampDate
      ? formatTime(report.timestampDate)
      : 'Not available';

  els.detailOperator.textContent =
    report.operatorId ||
    'Not available';

  els.detailLocation.textContent =
    report.hasCoords
      ? `Lat ${report.latitude.toFixed(4)}°  Long ${report.longitude.toFixed(4)}°`
      : 'Location unavailable';

  revokeTrackedImageUrls();

  if (report.imageBlob) {
    const url =
      URL.createObjectURL(
        report.imageBlob
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

  els.detailHash.textContent =
    report.imageHash ||
    'Not available';

  els.detailIntegrityTimestamp.textContent =
    report.timestampDate
      ? formatDateLong(
          report.timestampDate
        ) +
        ', ' +
        formatTime(
          report.timestampDate
        )
      : 'Not available';

  els.detailIntegrityOperator.textContent =
    report.operatorId ||
    'Not available';

  els.detailIntegrityLocation.textContent =
    report.hasCoords
      ? 'Available'
      : 'Unavailable';

  setPdfStatus('', null);

  els.downloadPdfBtn.disabled =
    report.status !== 'GENERATED';

  els.downloadPdfBtnLabel.textContent =
    'Download PDF';

  els.detailOverlay.classList.add(
    'is-open'
  );
}

function closePreview() {
  els.detailOverlay.classList.remove(
    'is-open'
  );

  state.activeReportId = null;
}

/* =========================================================
   PDF GENERATION
   ========================================================= */

function blobToDataUrl(blob) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () =>
        resolve(reader.result);

      reader.onerror = () =>
        reject(reader.error);

      reader.readAsDataURL(blob);
    }
  );
}

function getImageMimeFromDataUrl(
  dataUrl
) {
  const match =
    /^data:(image\/\w+);/.exec(
      dataUrl || ''
    );

  return match
    ? match[1]
    : 'image/jpeg';
}

async function generateAndDownloadPdf(
  report,
  options
) {
  const onStatus =
    (options && options.onStatus) ||
    function () {};

  const jsPdfCtor =
    window.jspdf &&
    window.jspdf.jsPDF;

  if (!jsPdfCtor) {
    throw new Error(
      'PDF library failed to load'
    );
  }

  onStatus(
    'loading',
    'Generating report...'
  );

  const doc = new jsPdfCtor({
    unit: 'mm',
    format: 'a4',
  });

  const marginX = 18;

  let y = 20;

  const pageWidth =
    doc.internal.pageSize.getWidth();

  /* ---------- Letterhead ---------- */

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(18);

  doc.setTextColor(
    9,
    156,
    76
  );

  doc.text(
    'FieldTest',
    marginX,
    y
  );

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(10);

  doc.setTextColor(
    120,
    130,
    140
  );

  doc.text(
    'Digital Field Testing Companion',
    marginX,
    y + 6
  );

  y += 16;

  doc.setDrawColor(
    225,
    228,
    233
  );

  doc.line(
    marginX,
    y,
    pageWidth - marginX,
    y
  );

  y += 10;

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(13);

  doc.setTextColor(
    20,
    34,
    53
  );

  doc.text(
    'FIELD TEST REPORT',
    marginX,
    y
  );

  y += 10;

  const meta =
    resultMeta(report.result);

  const rows = [
    [
      'Report ID',
      report.reportId,
    ],
    [
      'Test ID',
      report.testId,
    ],
    [
      'Result',
      meta.label,
    ],
    [
      'Date',
      report.timestampDate
        ? formatDateLong(
            report.timestampDate
          )
        : 'Not available',
    ],
    [
      'Time',
      report.timestampDate
        ? formatTime(
            report.timestampDate
          )
        : 'Not available',
    ],
    [
      'Operator ID',
      report.operatorId ||
        'Not available',
    ],
    [
      'Location',
      report.hasCoords
        ? `${report.latitude.toFixed(
            4
          )}, ${report.longitude.toFixed(
            4
          )}`
        : 'Location unavailable',
    ],
  ];

  doc.setFontSize(11);

  rows.forEach((row) => {
    const label = row[0];

    const value = row[1];

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setTextColor(
      120,
      130,
      140
    );

    doc.text(
      `${label}`,
      marginX,
      y
    );

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setTextColor(
      20,
      34,
      53
    );

    doc.text(
      String(value),
      marginX + 45,
      y
    );

    y += 7;
  });

  y += 4;

  doc.setDrawColor(
    225,
    228,
    233
  );

  doc.line(
    marginX,
    y,
    pageWidth - marginX,
    y
  );

  y += 10;

  /* ---------- Captured image ---------- */

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(11);

  doc.setTextColor(
    20,
    34,
    53
  );

  doc.text(
    'CAPTURED TEST IMAGE',
    marginX,
    y
  );

  y += 6;

  if (report.imageBlob) {
    try {
      const dataUrl =
        await blobToDataUrl(
          report.imageBlob
        );

      const mime =
        getImageMimeFromDataUrl(
          dataUrl
        ).indexOf('png') !== -1
          ? 'PNG'
          : 'JPEG';

      const imgWidth =
        pageWidth -
        marginX * 2;

      const imgHeight =
        imgWidth * 0.65;

      doc.addImage(
        dataUrl,
        mime,
        marginX,
        y,
        imgWidth,
        imgHeight
      );

      y +=
        imgHeight + 10;
    } catch (e) {
      doc.setFont(
        'helvetica',
        'italic'
      );

      doc.setFontSize(10);

      doc.setTextColor(
        150,
        60,
        60
      );

      doc.text(
        'Captured image unavailable',
        marginX,
        y
      );

      y += 10;
    }
  } else {
    doc.setFont(
      'helvetica',
      'italic'
    );

    doc.setFontSize(10);

    doc.setTextColor(
      150,
      60,
      60
    );

    doc.text(
      'Captured image unavailable',
      marginX,
      y
    );

    y += 10;
  }

  if (y > 250) {
    doc.addPage();

    y = 20;
  }

  doc.setDrawColor(
    225,
    228,
    233
  );

  doc.line(
    marginX,
    y,
    pageWidth - marginX,
    y
  );

  y += 10;

  /* ---------- Digital integrity ---------- */

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(11);

  doc.setTextColor(
    20,
    34,
    53
  );

  doc.text(
    'DIGITAL INTEGRITY',
    marginX,
    y
  );

  y += 7;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(9.5);

  doc.setTextColor(
    120,
    130,
    140
  );

  doc.text(
    'SHA-256 Image Hash',
    marginX,
    y
  );

  y += 5;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(8.5);

  doc.setTextColor(
    20,
    34,
    53
  );

  const hashLines =
    doc.splitTextToSize(
      report.imageHash ||
        'Not available',
      pageWidth -
        marginX * 2
    );

  doc.text(
    hashLines,
    marginX,
    y
  );

  y +=
    hashLines.length * 4.5 +
    4;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(9.5);

  doc.setTextColor(
    120,
    130,
    140
  );

  doc.text(
    'Timestamp',
    marginX,
    y
  );

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setTextColor(
    20,
    34,
    53
  );

  doc.text(
    report.timestampDate
      ? `${formatDateLong(
          report.timestampDate
        )}, ${formatTime(
          report.timestampDate
        )}`
      : 'Not available',
    marginX + 45,
    y
  );

  y += 10;

  if (y > 250) {
    doc.addPage();

    y = 20;
  }

  /* ---------- Disclaimer ---------- */

  doc.setDrawColor(
    225,
    228,
    233
  );

  doc.line(
    marginX,
    y,
    pageWidth - marginX,
    y
  );

  y += 8;

  doc.setFont(
    'helvetica',
    'italic'
  );

  doc.setFontSize(9);

  doc.setTextColor(
    120,
    130,
    140
  );

  const disclaimer =
    'IMPORTANT: This report contains a presumptive field-test result and does not constitute laboratory confirmation.';

  const disclaimerLines =
    doc.splitTextToSize(
      disclaimer,
      pageWidth -
        marginX * 2
    );

  doc.text(
    disclaimerLines,
    marginX,
    y
  );

  y +=
    disclaimerLines.length * 5 +
    10;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(8.5);

  doc.setTextColor(
    150,
    158,
    168
  );

  doc.text(
    'Generated by FieldTest',
    marginX,
    y
  );

  doc.text(
    'Digital Field Testing Companion',
    marginX,
    y + 4.5
  );

  onStatus(
    'success',
    'Report ready'
  );

  doc.save(
    `FieldTest_Report_${report.reportId}.pdf`
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

  toastTimer = setTimeout(
    () =>
      els.toast.classList.remove(
        'is-visible'
      ),
    2000
  );
}

/* =========================================================
   ACTIONS
   ========================================================= */

async function handleDownload(
  reportId,
  opts
) {
  const fromCard =
    opts && opts.fromCard;

  const report =
    findReport(reportId);

  if (!report) return;

  if (report.status !== 'GENERATED') {
    showToast(
      'This report is still pending and cannot be downloaded yet.'
    );

    return;
  }

  const cardBtn = fromCard
    ? document.querySelector(
        '.action-btn--solid[data-report-id="' +
          cssEscape(reportId) +
          '"]'
      )
    : null;

  if (cardBtn) {
    cardBtn.disabled = true;
  }

  if (!fromCard) {
    els.downloadPdfBtn.disabled =
      true;

    els.downloadPdfBtnLabel.textContent =
      'Generating...';
  }

  try {
    await generateAndDownloadPdf(
      report,
      {
        onStatus: function (
          variant,
          text
        ) {
          if (!fromCard) {
            setPdfStatus(
              text,
              variant
            );
          }
        },
      }
    );

    showToast(
      'Report ready — download started'
    );
  } catch (err) {
    if (!fromCard) {
      setPdfStatus(
        'Unable to generate PDF. Please try again.',
        'error'
      );
    } else {
      showToast(
        'Unable to generate PDF. Please try again.'
      );
    }
  } finally {
    if (cardBtn) {
      cardBtn.disabled = false;
    }

    if (!fromCard) {
      els.downloadPdfBtnLabel.textContent =
        'Download PDF';

      els.downloadPdfBtn.disabled =
        report.status !== 'GENERATED';
    }
  }
}

function cssEscape(value) {
  if (
    window.CSS &&
    window.CSS.escape
  ) {
    return window.CSS.escape(value);
  }

  return String(value).replace(
    /[^a-zA-Z0-9_-]/g,
    '\\$&'
  );
}

/* =========================================================
   EVENT WIRING
   ========================================================= */

function updateFilterDot() {
  const f = state.filters;

  const active =
    f.status !== 'all' ||
    f.result !== 'all' ||
    f.date !== 'all';

  els.filterToggleBtn.classList.toggle(
    'has-active',
    active
  );
}

function wireEvents() {
  /* ---------- Filter toggle ---------- */

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

  /* ---------- Search ---------- */

  els.searchInput.addEventListener(
    'input',
    () => {
      state.filters.search =
        els.searchInput.value.trim();

      els.searchBar.classList.toggle(
        'has-value',
        Boolean(state.filters.search)
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

  /* ---------- Status filter ---------- */

  els.statusFilterRow.addEventListener(
    'click',
    (e) => {
      const chip =
        e.target.closest('.chip');

      if (!chip) return;

      state.filters.status =
        chip.dataset.statusFilter;

      Array.from(
        els.statusFilterRow.children
      ).forEach((c) =>
        c.classList.toggle(
          'is-active',
          c === chip
        )
      );

      updateFilterDot();

      renderList();
    }
  );

  /* ---------- Result filter ---------- */

  els.resultFilterRow.addEventListener(
    'click',
    (e) => {
      const chip =
        e.target.closest('.chip');

      if (!chip) return;

      state.filters.result =
        chip.dataset.resultFilter;

      Array.from(
        els.resultFilterRow.children
      ).forEach((c) =>
        c.classList.toggle(
          'is-active',
          c === chip
        )
      );

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

      if (!chip) return;

      state.filters.date =
        chip.dataset.dateFilter;

      Array.from(
        els.dateFilterRow.children
      ).forEach((c) =>
        c.classList.toggle(
          'is-active',
          c === chip
        )
      );

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
        status: 'all',
        result: 'all',
        date: 'all',
      };

      els.searchInput.value = '';

      els.searchBar.classList.remove(
        'has-value'
      );

      Array.from(
        els.statusFilterRow.children
      ).forEach((c) =>
        c.classList.toggle(
          'is-active',
          c.dataset.statusFilter ===
            'all'
        )
      );

      Array.from(
        els.resultFilterRow.children
      ).forEach((c) =>
        c.classList.toggle(
          'is-active',
          c.dataset.resultFilter ===
            'all'
        )
      );

      Array.from(
        els.dateFilterRow.children
      ).forEach((c) =>
        c.classList.toggle(
          'is-active',
          c.dataset.dateFilter ===
            'all'
        )
      );

      updateFilterDot();

      renderList();
    }
  );

  /* ---------- Report card actions ---------- */

  els.listContainer.addEventListener(
    'click',
    (e) => {
      const btn =
        e.target.closest(
          '.action-btn'
        );

      if (!btn) return;

      const reportId =
        btn.dataset.reportId;

      if (
        btn.dataset.action ===
        'view'
      ) {
        openPreview(reportId);
      }

      if (
        btn.dataset.action ===
        'download'
      ) {
        handleDownload(
          reportId,
          {
            fromCard: true,
          }
        );
      }
    }
  );

  /* ---------- Preview close ---------- */

  els.detailCloseBtn.addEventListener(
    'click',
    closePreview
  );

  els.detailOverlay.addEventListener(
    'click',
    (e) => {
      if (
        e.target ===
        els.detailOverlay
      ) {
        closePreview();
      }
    }
  );

  /* ---------- PDF download from preview ---------- */

  els.downloadPdfBtn.addEventListener(
    'click',
    () => {
      if (state.activeReportId) {
        handleDownload(
          state.activeReportId,
          {
            fromCard: false,
          }
        );
      }
    }
  );
}

/* =========================================================
   INIT
   ========================================================= */

async function init() {
  cacheDom();

  /*
   * IMPORTANT:
   * Keep Filters panel CLOSED when Reports page loads.
   * It will open only after the user clicks the Filter button.
   */
  els.filtersPanel.classList.add(
    'is-collapsed'
  );

  els.filterToggleBtn.setAttribute(
    'aria-expanded',
    'false'
  );

  wireEvents();

  const reports =
    await loadAllReports();

  state.allReports =
    sortNewestFirst(reports);

  renderSummary();

  renderList();
}

document.addEventListener(
  'DOMContentLoaded',
  init
);