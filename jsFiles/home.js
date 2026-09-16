
/* =========================================================
   FieldTest — home.js
   Home dashboard powered by real saved test records
   from IndexedDB.

   Database:
   fieldtest_db

   Object Store:
   test_records

   This file does NOT use temporary/mock test data.
   ========================================================= */


/* =========================================================
   1. INDEXEDDB CONFIGURATION
   ========================================================= */

const DB_NAME = 'fieldtest_db';
const DB_VERSION = 1;
const STORE_NAME = 'test_records';


/* =========================================================
   2. DOM / ICON CONFIGURATION
   ========================================================= */

const ICONS = {
  statusClear:
    'https://www.figma.com/api/mcp/asset/2af0e997-6056-46e2-9688-f7a9181b7d61.svg',

  statusAttention:
    'https://www.figma.com/api/mcp/asset/ddbc1dc9-cbef-4765-9054-1c31101bf197.svg',

  rowChevron:
    'https://www.figma.com/api/mcp/asset/7ae3e243-3573-4f2b-b731-d4e93ad9bdaa.svg',

  summaryTotalTests:
    'https://www.figma.com/api/mcp/asset/c1231dd5-0aa2-431b-a60b-ea6574581000.svg',

  summaryValid:
    'https://www.figma.com/api/mcp/asset/0d841fa8-fed3-4e27-a53c-b9d3534bb304.svg',

  summaryInvalid:
    'https://www.figma.com/api/mcp/asset/78ccb0cf-003a-4e11-b711-49f1f497198c.svg',

  summaryDate:
    'https://www.figma.com/api/mcp/asset/c7a6b035-6897-4e01-8dc8-19680b3051a7.svg',
};


/* =========================================================
   3. APPLICATION DATA
   ========================================================= */

let homeRecords = [];

let toastTimer = null;


/* =========================================================
   4. GREETING
   ========================================================= */

function renderGreeting() {
  const hour = new Date().getHours();

  let greeting = 'Good Morning,';

  if (hour >= 12 && hour < 17) {
    greeting = 'Good Afternoon,';
  } else if (hour >= 17) {
    greeting = 'Good Evening,';
  }

  const greetingTitle = document.getElementById('greeting-title');
  const greetingName = document.getElementById('greeting-name');

  if (greetingTitle) {
    greetingTitle.textContent = greeting;
  }

  if (greetingName) {
    /*
     * Keep the existing operator name for now.
     *
     * Later this can be connected to the real login/session
     * operator information.
     */
    greetingName.textContent = 'Ramesh Sir';
  }
}


/* =========================================================
   5. INDEXEDDB
   ========================================================= */

function openDb() {
  return new Promise((resolve, reject) => {

    if (!('indexedDB' in window)) {
      reject(
        new Error('IndexedDB is not supported in this browser.')
      );
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'testId'
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}


/* =========================================================
   6. READ ALL SAVED TEST RECORDS
   ========================================================= */

function getAllTestRecords() {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {

      const transaction = db.transaction(
        STORE_NAME,
        'readonly'
      );

      const store = transaction.objectStore(STORE_NAME);

      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  });
}


/* =========================================================
   7. DATE HELPERS
   ========================================================= */

function isToday(dateValue) {
  if (!dateValue) return false;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}


function formatActivityTime(dateValue) {
  if (!dateValue) return '—';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  /*
   * If the test was today, show time.
   * Otherwise show date.
   */

  if (isToday(date)) {
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  return date.toLocaleDateString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}


/* =========================================================
   8. RESULT HELPERS
   ========================================================= */

function getResultLabel(result) {

  switch (result) {

    case 'PRESUMPTIVE_POSITIVE':
      return 'Positive';

    case 'PRESUMPTIVE_NEGATIVE':
      return 'Negative';

    case 'INCONCLUSIVE':
      return 'Inconclusive';

    default:
      return result || 'Unknown';
  }
}


function isValidResult(result) {

  return (
    result === 'PRESUMPTIVE_POSITIVE' ||
    result === 'PRESUMPTIVE_NEGATIVE'
  );
}


function isInvalidResult(result) {

  return result === 'INCONCLUSIVE';
}


function getResultStatus(result) {

  if (result === 'PRESUMPTIVE_POSITIVE') {
    return 'attention';
  }

  if (result === 'PRESUMPTIVE_NEGATIVE') {
    return 'clear';
  }

  return 'attention';
}


/* =========================================================
   9. TODAY'S SUMMARY
   ========================================================= */

function renderSummary(records) {

  const todayRecords = records.filter((record) => {
    return isToday(record.timestamp);
  });


  const totalTests = todayRecords.length;

  const validResults = todayRecords.filter((record) => {
    return isValidResult(record.result);
  }).length;

  const invalidResults = todayRecords.filter((record) => {
    return isInvalidResult(record.result);
  }).length;


  const columns = [

    {
      icon: ICONS.summaryTotalTests,
      value: totalTests,
      label: 'Total Tests'
    },

    {
      icon: ICONS.summaryValid,
      value: validResults,
      label: 'Valid Results'
    },

    {
      icon: ICONS.summaryInvalid,
      value: invalidResults,
      label: 'Invalid Results'
    },

    {
      icon: ICONS.summaryDate,
      value: 'Today',
      label: 'Test Date'
    }

  ];


  const container =
    document.getElementById('summary-card');

  if (!container) return;


  container.innerHTML = columns
    .map((col) => {

      return `
        <div class="summary-card__col">

          <img
            class="summary-card__icon"
            src="${col.icon}"
            alt=""
          />

          <p class="summary-card__value">
            ${col.value}
          </p>

          <p class="summary-card__label">
            ${col.label}
          </p>

        </div>
      `;

    })
    .join('');
}


/* =========================================================
   10. RECENT ACTIVITY
   ========================================================= */

function renderRecentActivity(records) {

  const container =
    document.getElementById('activity-card');

  if (!container) return;


  /*
   * Sort newest first.
   */

  const sortedRecords = [...records].sort((a, b) => {

    const dateA = new Date(
      a.recordCreatedAt || a.timestamp || 0
    ).getTime();

    const dateB = new Date(
      b.recordCreatedAt || b.timestamp || 0
    ).getTime();

    return dateB - dateA;
  });


  /*
   * Show latest 8 saved tests.
   */

  const recentRecords = sortedRecords.slice(0, 8);


  /*
   * No saved records.
   */

  if (recentRecords.length === 0) {

    container.innerHTML = `
      <div class="activity-empty">
        <p>No tests recorded yet.</p>
      </div>
    `;

    return;
  }


  container.innerHTML = recentRecords
    .map((record) => {

      const resultLabel =
        getResultLabel(record.result);

      const status =
        getResultStatus(record.result);

      const icon =
        status === 'clear'
          ? ICONS.statusClear
          : ICONS.statusAttention;

      const time =
        formatActivityTime(
          record.recordCreatedAt ||
          record.timestamp
        );


      return `
        <button
          type="button"
          class="activity-row"
          data-nav="test-detail"
          data-test-id="${escapeHtml(record.testId)}"
        >

          <img
            class="activity-row__icon"
            src="${icon}"
            alt=""
          />

          <div class="activity-row__body">

            <p class="activity-row__id">
              Test #${escapeHtml(record.testId)}
            </p>

            <p class="activity-row__result">
              Result : ${escapeHtml(resultLabel)}
            </p>

          </div>

          <div class="activity-row__meta">

            <span class="activity-row__time">
              ${escapeHtml(time)}
            </span>

            <img
              class="activity-row__chevron"
              src="${ICONS.rowChevron}"
              alt=""
            />

          </div>

        </button>
      `;

    })
    .join('');
}


/* =========================================================
   11. BASIC HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {

  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* =========================================================
   12. LOAD HOME DATA
   ========================================================= */

async function loadHomeData() {

  try {

    homeRecords = await getAllTestRecords();

    /*
     * Render real IndexedDB data.
     */

    renderSummary(homeRecords);

    renderRecentActivity(homeRecords);

  } catch (error) {

    console.error(
      '[FieldTest] Could not load test records:',
      error
    );


    /*
     * If database cannot be read,
     * show zero/empty state instead of fake data.
     */

    renderSummary([]);

    renderRecentActivity([]);

    showToast(
      'Could not load saved test records.'
    );
  }
}


/* =========================================================
   13. TOAST
   ========================================================= */

function showToast(message) {

  const toast =
    document.getElementById('toast');

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add('is-visible');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {

    toast.classList.remove('is-visible');

  }, 1800);
}


/* =========================================================
   14. REAL PAGE ROUTES
   ========================================================= */

const ROUTES = {

  home: 'home.html',

  'new-test': 'test.html',

  history: 'history.html',

  reports: 'reports.html'

};


const ROUTE_LABELS = {

  home: 'Home',

  'new-test': 'New Test',

  history: 'Test History',

  reports: 'Reports',

  'saved-results': 'Saved Results',

  profile: 'Profile',

  'test-detail': 'Test Detail'

};


/* =========================================================
   15. NAVIGATION
   ========================================================= */

function goTo(routeKey, meta) {

  console.log(
    '[FieldTest] navigate ->',
    routeKey,
    meta || ''
  );


  /*
   * Real pages.
   */

  if (ROUTES[routeKey]) {

    window.location.href =
      ROUTES[routeKey];

    return;
  }


  /*
   * Already on home.
   */

  if (routeKey === 'home') {
    return;
  }


  /*
   * Other pages that are not connected yet.
   */

  const label =
    ROUTE_LABELS[routeKey] || routeKey;

  showToast(
    `${label} screen — coming soon`
  );
}


/* =========================================================
   16. QUICK ACCESS CARDS
   ========================================================= */

function wireQuickAccessCards() {

  document
    .querySelectorAll(
      '.quick-access__card[data-nav]'
    )
    .forEach((card) => {

      card.addEventListener('click', () => {

        goTo(card.dataset.nav);

      });

    });
}


/* =========================================================
   17. FOOTER NAVIGATION
   ========================================================= */

function wireFooterNav() {

  document
    .querySelectorAll(
      '.nav-item[data-nav]'
    )
    .forEach((item) => {

      item.addEventListener('click', () => {

        goTo(item.dataset.nav);

      });

    });
}


/* =========================================================
   18. RECENT ACTIVITY CLICK
   ========================================================= */

function wireRecentActivityRows() {

  const activityCard =
    document.getElementById(
      'activity-card'
    );

  if (!activityCard) return;


  activityCard.addEventListener(
    'click',
    (event) => {

      const row =
        event.target.closest(
          '.activity-row'
        );

      if (!row) return;


      const testId =
        row.dataset.testId;


      /*
       * Test detail page is not connected yet.
       * Keep the existing placeholder behavior.
       */

      goTo(
        'test-detail',
        {
          testId: testId
        }
      );

    }
  );
}


/* =========================================================
   19. PROFILE BUTTON
   ========================================================= */

function wireProfileButton() {

  const profileButton =
    document.getElementById(
      'profile-btn'
    );

  if (!profileButton) return;


  profileButton.addEventListener(
    'click',
    () => {

      goTo('profile');

    }
  );
}


/* =========================================================
   20. AUTO REFRESH WHEN RETURNING TO HOME
   =========================================================

   This is useful when:

   Home
      ↓
   New Test
      ↓
   Save Digital Record
      ↓
   Home

   The Home page will read IndexedDB again.
   */

document.addEventListener(
  'visibilitychange',
  () => {

    if (
      !document.hidden &&
      document.visibilityState === 'visible'
    ) {

      loadHomeData();

    }

  }
);


/* =========================================================
   21. INITIALIZE HOME PAGE
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    renderGreeting();

    /*
     * First load real data from IndexedDB.
     */

    await loadHomeData();

    /*
     * Wire UI interactions.
     */

    wireQuickAccessCards();

    wireFooterNav();

    wireRecentActivityRows();

    wireProfileButton();

  }
);

