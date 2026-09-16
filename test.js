/* =========================================================
   FieldTest — test.js
   Self-contained implementation of the 5-step New Test workflow
   (Info -> Camera -> Analysis -> Result -> Record).
   ========================================================= */

/* =========================================================
   0. DEMO / PROTOTYPE CLASSIFICATION CONFIGURATION
   =========================================================
   IMPORTANT -- READ BEFORE USING WITH A REAL FIELD-TEST KIT
   The values below are DEMONSTRATION values only. They assume a
   reference colour card near the top-left of the frame and a
   reaction area near the centre, and classify purely by hue/
   saturation of the calibrated reaction-region colour. Real
   deployments MUST replace the region coordinates and thresholds
   with values calibrated against the specific test kit's
   documented chemistry and reference card layout. Nothing here
   has been scientifically validated.
   ========================================================= */
const DEMO_CLASSIFICATION_CONFIG = {
  referenceRegion: { xRatio: 0.06, yRatio: 0.06, wRatio: 0.22, hRatio: 0.22 },
  reactionRegion: { xRatio: 0.4, yRatio: 0.4, wRatio: 0.2, hRatio: 0.2 },
  expectedReferenceGray: 200,
  positiveHueRange: [0, 40],
  negativeHueRange: [170, 260],
  minSaturationForConclusive: 0.12,
  algorithmVersion: 'demo-1.0',
};

/* =========================================================
   1. APPLICATION STATE
   ========================================================= */
const state = {
  step: 1,
  testId: null,
  operatorId: 'OP-102',
  timestamp: null,
  location: {
    status: 'idle',
    latitude: null,
    longitude: null,
    accuracy: null
  },
  facingMode: 'environment',
  cameraStream: null,
  capturedImage: null,
  quality: null,
  analysis: {
    running: false,
    done: false,
    phaseIndex: -1,
    result: null,
    confidence: null,
    colorMetrics: null,
  },
  record: null,
};

const ANALYSIS_PHASES = [
  {
    title: 'Image quality checked',
    desc: 'Image is clear and well lit'
  },
  {
    title: 'Reference colour detected',
    desc: 'Colour card identified successfully'
  },
  {
    title: 'Calibrating colour values',
    desc: 'Adjusting for lighting conditions...'
  },
  {
    title: 'Analysing reaction area',
    desc: 'Detecting test region and comparing colours'
  },
  {
    title: 'Preparing result',
    desc: 'Generating presumptive outcome'
  },
];

/* =========================================================
   2. DOM REFERENCES
   ========================================================= */
const els = {};

function cacheDom() {
  els.backBtn = document.getElementById('back-btn');
  els.progressCircles = document.querySelectorAll('.progress-circle');
  els.progressLines = document.querySelectorAll('.progress-line');
  els.progressLabels = document.querySelectorAll('.progress-label');
  els.panels = document.querySelectorAll('.step-panel');

  els.testIdValue = document.getElementById('test-id-value');
  els.operatorIdValue = document.getElementById('operator-id-value');
  els.datetimeValue = document.getElementById('datetime-value');
  els.locationValue = document.getElementById('location-value');

  els.gpsBanner = document.getElementById('gps-status-banner');
  els.gpsIcon = document.getElementById('gps-status-icon');
  els.gpsTitle = document.getElementById('gps-status-title');
  els.gpsDesc = document.getElementById('gps-status-desc');

  els.step1ContinueBtn = document.getElementById('step1-continue-btn');

  els.cameraFrame = document.getElementById('camera-frame');
  els.cameraVideo = document.getElementById('camera-video');
  els.capturedPreview = document.getElementById('captured-preview');
  els.cameraPlaceholder = document.getElementById('camera-placeholder');
  els.cameraPlaceholderText = document.getElementById('camera-placeholder-text');
  els.cameraGuide = document.getElementById('camera-guide');
  els.cameraGuideLabel = document.getElementById('camera-guide-label');
  els.cameraStatusBanner = document.getElementById('camera-status-banner');
  els.cameraControls = document.getElementById('camera-controls');
  els.captureBtn = document.getElementById('capture-btn');
  els.flashBtn = document.getElementById('flash-btn');
  els.flipBtn = document.getElementById('flip-btn');
  els.cameraFallbackActions = document.getElementById('camera-fallback-actions');
  els.retryCameraBtn = document.getElementById('retry-camera-btn');
  els.cameraFileInput = document.getElementById('camera-file-input');
  els.captureResultActions = document.getElementById('capture-result-actions');
  els.retakeBtn = document.getElementById('retake-btn');
  els.continueAnalysisBtn = document.getElementById('continue-analysis-btn');

  els.analysisThumb = document.getElementById('analysis-thumb');
  els.analysisProgressFill = document.getElementById('analysis-progress-fill');
  els.analysisProgressPct = document.getElementById('analysis-progress-pct');
  els.analysisStatusText = document.getElementById('analysis-status-text');
  els.analysisStepsLive = document.getElementById('analysis-steps-live');
  els.analysisStepsRecap = document.getElementById('analysis-steps-recap');

  els.resultCard = document.getElementById('result-card');
  els.resultValue = document.getElementById('result-value');
  els.confidencePill = document.getElementById('confidence-pill');
  els.saveRecordBtn = document.getElementById('save-record-btn');

  els.recordSavedSubtitle = document.getElementById('record-saved-subtitle');
  els.recordTestId = document.getElementById('record-test-id');
  els.recordStatus = document.getElementById('record-status');
  els.recordOperatorId = document.getElementById('record-operator-id');
  els.recordSavedAt = document.getElementById('record-saved-at');
  els.recordLocation = document.getElementById('record-location');
  els.recordHash = document.getElementById('record-hash');
  els.newTestBtn = document.getElementById('new-test-btn');

  els.toast = document.getElementById('toast');
}

/* =========================================================
   3. STEP NAVIGATION
   ========================================================= */
function goToStep(n) {
  state.step = n;

  els.panels.forEach((panel) => {
    panel.classList.toggle(
      'is-active',
      Number(panel.dataset.step) === n
    );
  });

  els.progressCircles.forEach((c) => {
    c.classList.toggle(
      'is-reached',
      Number(c.dataset.circle) <= n
    );
  });

  els.progressLines.forEach((l) => {
    l.classList.toggle(
      'is-reached',
      Number(l.dataset.line) < n
    );
  });

  els.progressLabels.forEach((label) => {
    label.classList.toggle(
      'is-current',
      Number(label.dataset.label) === n
    );
  });

  els.backBtn.style.visibility = n === 5 ? 'hidden' : 'visible';

  if (n === 2) {
    renderCameraStep();
  }

  if (n === 3) {
    maybeStartAnalysis();
  }

  const content = document.querySelector('.test-content');

  if (content) {
    content.scrollTop = 0;
  }
}

function handleBack() {
  if (state.step === 1) {
    window.location.href = 'home.html';
    return;
  }

  if (state.step === 2) {
    stopCameraStream();
    goToStep(1);
    return;
  }

  if (state.step === 3) {
    clearAnalysisTimers();
    goToStep(2);
    return;
  }

  if (state.step === 4) {
    goToStep(3);
    return;
  }
}

/* =========================================================
   4. TOAST
   ========================================================= */
let toastTimer = null;

function showToast(message) {
  if (!els.toast) return;

  els.toast.textContent = message;
  els.toast.style.opacity = '1';
  els.toast.style.transform =
    'translateX(-50%) translateY(0)';

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    els.toast.style.opacity = '0';
    els.toast.style.transform =
      'translateX(-50%) translateY(10px)';
  }, 1800);
}

/* =========================================================
   5. TIMESTAMP
   ========================================================= */
function formatDateTime(date) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;

  if (hours === 0) {
    hours = 12;
  }

  return `${day} ${month} ${year} • ${hours}:${minutes} ${ampm}`;
}

/* =========================================================
   6. TEST SETUP
   ========================================================= */
function generateTestId() {
  const year = new Date().getFullYear();
  const seq = String(
    Math.floor(Math.random() * 999999)
  ).padStart(6, '0');

  return `FT-${year}-${seq}`;
}

function initTestSetup() {
  state.testId = generateTestId();
  state.timestamp = new Date();

  els.testIdValue.textContent = state.testId;
  els.operatorIdValue.textContent = state.operatorId;
  els.datetimeValue.textContent =
    formatDateTime(state.timestamp);

  requestLocation();
}

function setGpsBanner(variant, title, desc) {
  els.gpsBanner.style.display = 'flex';
  els.gpsBanner.className =
    `status-banner status-banner--${variant}`;

  els.gpsTitle.textContent = title;
  els.gpsDesc.textContent = desc;

  const icons = {
    success:
      '<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 9l2.3 2.3L12.5 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',

    warning:
      '<svg viewBox="0 0 18 18" fill="none"><path d="M9 2l8 14H1L9 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 7.5v3.5M9 13.2v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',

    danger:
      '<svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };

  els.gpsIcon.innerHTML =
    icons[variant] || icons.warning;
}

/* ---------- GPS ---------- */
function requestLocation() {
  state.location.status = 'pending';
  els.locationValue.textContent =
    'Requesting location…';

  if (!('geolocation' in navigator)) {
    state.location.status = 'unavailable';

    els.locationValue.textContent =
      'Location unavailable on this device';

    setGpsBanner(
      'warning',
      'GPS not supported',
      'This browser does not support location services.'
    );

    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.location.status = 'active';

      state.location.latitude =
        pos.coords.latitude;

      state.location.longitude =
        pos.coords.longitude;

      state.location.accuracy =
        pos.coords.accuracy;

      els.locationValue.textContent =
        `Lat ${pos.coords.latitude.toFixed(4)}°  Long ${pos.coords.longitude.toFixed(4)}°`;

      setGpsBanner(
        'success',
        'GPS location is active and accurate.',
        'Your location will be added to the test record.'
      );
    },

    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        state.location.status = 'denied';

        els.locationValue.textContent =
          'Location permission denied';

        setGpsBanner(
          'danger',
          'Location permission denied',
          'The test record will be saved without GPS coordinates.'
        );
      } else {
        state.location.status = 'unavailable';

        els.locationValue.textContent =
          'Location unavailable';

        setGpsBanner(
          'warning',
          'GPS location unavailable',
          'Could not determine your location right now.'
        );
      }
    },

    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    }
  );
}

/* =========================================================
   7. CAMERA FUNCTIONS
   ========================================================= */
function renderCameraStep() {
  clearCameraStatus();

  if (state.capturedImage) {
    showCapturedState();
  } else {
    startCameraLive();
  }
}

function clearCameraStatus() {
  els.cameraStatusBanner.style.display = 'none';
  els.cameraStatusBanner.innerHTML = '';
}

function setCameraStatus(variant, title, desc) {
  els.cameraStatusBanner.style.display = 'flex';

  els.cameraStatusBanner.className =
    `status-banner status-banner--${variant}`;

  els.cameraStatusBanner.innerHTML = `
    <span class="status-banner__icon"></span>
    <span>
      <p class="status-banner__title">${title}</p>
      <p class="status-banner__desc">${desc}</p>
    </span>`;
}

async function startCameraLive() {
  els.capturedPreview.style.display = 'none';

  els.cameraVideo.style.display = 'none';

  els.cameraPlaceholder.style.display = 'flex';

  els.cameraPlaceholderText.textContent =
    'Starting camera…';

  els.cameraControls.style.display = 'none';

  els.cameraFallbackActions.style.display = 'none';

  els.captureResultActions.style.display = 'none';

  els.cameraGuide.style.display = 'none';

  els.cameraGuideLabel.style.display = 'none';

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    els.cameraPlaceholderText.textContent =
      'Camera is not supported in this browser.';

    setCameraStatus(
      'warning',
      'Camera unavailable',
      'This browser does not support camera access. You can choose a photo instead.'
    );

    els.cameraFallbackActions.style.display = 'flex';

    return;
  }

  try {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: state.facingMode
        },
        audio: false,
      });

    state.cameraStream = stream;

    els.cameraVideo.srcObject = stream;

    els.cameraVideo.style.display = 'block';

    els.cameraPlaceholder.style.display = 'none';

    els.cameraGuide.style.display = 'block';

    els.cameraGuideLabel.style.display = 'block';

    els.cameraControls.style.display = 'flex';

    els.captureBtn.disabled = false;
  } catch (err) {
    let title = 'Camera unavailable';

    let desc =
      'Could not start the camera on this device.';

    if (
      err.name === 'NotAllowedError' ||
      err.name === 'PermissionDeniedError'
    ) {
      title = 'Camera permission denied';

      desc =
        'Allow camera access in your browser settings, or choose a photo instead.';
    } else if (err.name === 'NotFoundError') {
      title = 'No camera found';

      desc =
        'This device does not have an accessible camera.';
    }

    els.cameraPlaceholderText.textContent =
      title;

    setCameraStatus(
      'danger',
      title,
      desc
    );

    els.cameraFallbackActions.style.display =
      'flex';
  }
}

function stopCameraStream() {
  if (state.cameraStream) {
    state.cameraStream
      .getTracks()
      .forEach((track) => track.stop());

    state.cameraStream = null;
  }

  els.cameraVideo.srcObject = null;
}

async function toggleFlash() {
  if (!state.cameraStream) return;

  const track =
    state.cameraStream.getVideoTracks()[0];

  if (!track) return;

  const capabilities =
    track.getCapabilities
      ? track.getCapabilities()
      : {};

  const isOn =
    els.flashBtn.classList.toggle('is-active');

  if (capabilities.torch) {
    try {
      await track.applyConstraints({
        advanced: [
          {
            torch: isOn
          }
        ]
      });
    } catch (e) {
      showToast(
        'Flash control is not supported on this device'
      );
    }
  } else if (isOn) {
    showToast(
      'Flash control is not supported on this device'
    );
  }
}

function flipCamera() {
  state.facingMode =
    state.facingMode === 'environment'
      ? 'user'
      : 'environment';

  stopCameraStream();

  startCameraLive();
}

/* =========================================================
   8. IMAGE CAPTURE
   ========================================================= */
function captureFromVideo() {
  const video = els.cameraVideo;

  if (!video.videoWidth) return;

  const canvas =
    document.createElement('canvas');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas
    .getContext('2d')
    .drawImage(video, 0, 0);

  canvas.toBlob(
    (blob) => {
      finalizeCapturedImage(canvas, blob);

      stopCameraStream();
    },
    'image/jpeg',
    0.92
  );
}

function captureFromFile(file) {
  const img = new Image();

  const url =
    URL.createObjectURL(file);

  img.onload = () => {
    const canvas =
      document.createElement('canvas');

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    canvas
      .getContext('2d')
      .drawImage(img, 0, 0);

    URL.revokeObjectURL(url);

    canvas.toBlob(
      (blob) => {
        finalizeCapturedImage(
          canvas,
          blob
        );
      },
      file.type || 'image/jpeg',
      0.92
    );
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);

    setCameraStatus(
      'danger',
      'Invalid image',
      'That file could not be read as an image. Please choose another.'
    );
  };

  img.src = url;
}

function finalizeCapturedImage(
  canvas,
  blob
) {
  const dataUrl =
    canvas.toDataURL(
      'image/jpeg',
      0.85
    );

  state.capturedImage = {
    blob,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    canvas
  };

  state.quality =
    checkImageQuality(canvas);

  showCapturedState();
}

function showCapturedState() {
  els.cameraVideo.style.display = 'none';

  els.cameraPlaceholder.style.display =
    'none';

  els.cameraGuide.style.display = 'none';

  els.cameraGuideLabel.style.display =
    'none';

  els.cameraControls.style.display =
    'none';

  els.cameraFallbackActions.style.display =
    'none';

  els.capturedPreview.src =
    state.capturedImage.dataUrl;

  els.capturedPreview.style.display =
    'block';

  els.captureResultActions.style.display =
    'flex';

  const q = state.quality;

  if (q.severity === 'danger') {
    setCameraStatus(
      'danger',
      'Image quality needs improvement',
      q.issues.join(' ')
    );

    els.continueAnalysisBtn.disabled =
      true;
  } else if (q.severity === 'warning') {
    setCameraStatus(
      'warning',
      'Image quality could be better',
      q.issues.join(' ')
    );

    els.continueAnalysisBtn.disabled =
      false;
  } else {
    setCameraStatus(
      'success',
      'Image quality acceptable',
      'Reference card area and reaction area look readable.'
    );

    els.continueAnalysisBtn.disabled =
      false;
  }
}

function retakePhoto() {
  state.capturedImage = null;
  state.quality = null;

  els.captureResultActions.style.display =
    'none';

  clearCameraStatus();

  startCameraLive();
}

/* =========================================================
   9. IMAGE QUALITY CHECK
   ========================================================= */
function checkImageQuality(sourceCanvas) {
  const size = 64;

  const tmp =
    document.createElement('canvas');

  tmp.width = size;
  tmp.height = size;

  const tctx =
    tmp.getContext('2d');

  tctx.drawImage(
    sourceCanvas,
    0,
    0,
    size,
    size
  );

  let data;

  try {
    data =
      tctx.getImageData(
        0,
        0,
        size,
        size
      ).data;
  } catch (e) {
    return {
      mean: 0,
      sharpness: 0,
      variance: 0,
      severity: 'danger',
      issues: [
        'Could not read the captured image.'
      ]
    };
  }

  const gray =
    new Float32Array(
      size * size
    );

  let sum = 0;

  for (
    let i = 0, p = 0;
    i < data.length;
    i += 4, p += 1
  ) {
    const g =
      0.299 * data[i] +
      0.587 * data[i + 1] +
      0.114 * data[i + 2];

    gray[p] = g;

    sum += g;
  }

  const mean =
    sum / gray.length;

  let sumSq = 0;

  for (
    let p = 0;
    p < gray.length;
    p += 1
  ) {
    sumSq +=
      (gray[p] - mean) *
      (gray[p] - mean);
  }

  const variance =
    sumSq / gray.length;

  let edgeSum = 0;
  let edgeN = 0;

  for (
    let y = 1;
    y < size - 1;
    y += 1
  ) {
    for (
      let x = 1;
      x < size - 1;
      x += 1
    ) {
      const idx =
        y * size + x;

      const lap =
        Math.abs(
          4 * gray[idx] -
          gray[idx - 1] -
          gray[idx + 1] -
          gray[idx - size] -
          gray[idx + size]
        );

      edgeSum += lap;
      edgeN += 1;
    }
  }

  const sharpness =
    edgeN
      ? edgeSum / edgeN
      : 0;

  const issues = [];

  let severity = 'ok';

  if (variance < 1.5) {
    severity = 'danger';

    issues.push(
      'Image appears blank or unreadable.'
    );
  } else {
    if (mean < 35) {
      severity = 'warning';

      issues.push(
        'Image appears too dark.'
      );
    } else if (mean > 225) {
      severity = 'warning';

      issues.push(
        'Image appears overexposed.'
      );
    }

    if (sharpness < 2.5) {
      severity = 'warning';

      issues.push(
        'Image may be blurry.'
      );
    }
  }

  return {
    mean,
    sharpness,
    variance,
    severity,
    issues
  };
}

/* =========================================================
   10. IMAGE PROCESSING / COLOUR ANALYSIS
   ========================================================= */
function sampleRegionAverage(
  canvas,
  regionRatio
) {
  const ctx =
    canvas.getContext('2d');

  const x =
    Math.floor(
      canvas.width *
      regionRatio.xRatio
    );

  const y =
    Math.floor(
      canvas.height *
      regionRatio.yRatio
    );

  const w =
    Math.max(
      1,
      Math.floor(
        canvas.width *
        regionRatio.wRatio
      )
    );

  const h =
    Math.max(
      1,
      Math.floor(
        canvas.height *
        regionRatio.hRatio
      )
    );

  const data =
    ctx.getImageData(
      x,
      y,
      w,
      h
    ).data;

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }

  return {
    r: r / n,
    g: g / n,
    b: b / n
  };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max =
    Math.max(r, g, b);

  const min =
    Math.min(r, g, b);

  let h = 0;
  let s = 0;

  const l =
    (max + min) / 2;

  const d =
    max - min;

  if (d !== 0) {
    s =
      d /
      (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h =
          60 *
          (((g - b) / d) % 6);
        break;

      case g:
        h =
          60 *
          ((b - r) / d + 2);
        break;

      case b:
        h =
          60 *
          ((r - g) / d + 4);
        break;
    }
  }

  if (h < 0) {
    h += 360;
  }

  return {
    h,
    s,
    l
  };
}

function runDemoColourAnalysis(
  canvas
) {
  const cfg =
    DEMO_CLASSIFICATION_CONFIG;

  const reference =
    sampleRegionAverage(
      canvas,
      cfg.referenceRegion
    );

  const referenceGray =
    (
      reference.r +
      reference.g +
      reference.b
    ) / 3;

  const calibrationFactor =
    cfg.expectedReferenceGray /
    Math.max(
      1,
      referenceGray
    );

  const reactionRaw =
    sampleRegionAverage(
      canvas,
      cfg.reactionRegion
    );

  const reactionCalibrated = {
    r: Math.min(
      255,
      reactionRaw.r *
      calibrationFactor
    ),

    g: Math.min(
      255,
      reactionRaw.g *
      calibrationFactor
    ),

    b: Math.min(
      255,
      reactionRaw.b *
      calibrationFactor
    )
  };

  const hsl =
    rgbToHsl(
      reactionCalibrated.r,
      reactionCalibrated.g,
      reactionCalibrated.b
    );

  let result;
  let confidence;

  if (
    hsl.s <
    cfg.minSaturationForConclusive
  ) {
    result =
      'INCONCLUSIVE';

    confidence =
      Math.round(
        55 +
        hsl.s * 100
      );
  } else if (
    hsl.h >=
      cfg.positiveHueRange[0] &&
    hsl.h <=
      cfg.positiveHueRange[1]
  ) {
    result =
      'PRESUMPTIVE_POSITIVE';

    confidence =
      Math.min(
        99,
        Math.round(
          65 +
          hsl.s * 40
        )
      );
  } else if (
    hsl.h >=
      cfg.negativeHueRange[0] &&
    hsl.h <=
      cfg.negativeHueRange[1]
  ) {
    result =
      'PRESUMPTIVE_NEGATIVE';

    confidence =
      Math.min(
        99,
        Math.round(
          65 +
          hsl.s * 40
        )
      );
  } else {
    result =
      'INCONCLUSIVE';

    confidence =
      Math.round(
        55 +
        hsl.s * 30
      );
  }

  return {
    referenceColor: reference,
    reactionColorRaw: reactionRaw,
    reactionColorCalibrated:
      reactionCalibrated,
    hsl,
    calibrationFactor,
    result,
    confidence,
    algorithmVersion:
      cfg.algorithmVersion
  };
}

/* =========================================================
   11. ANALYSIS STEP ANIMATION
   ========================================================= */
let analysisTimers = [];

function clearAnalysisTimers() {
  analysisTimers.forEach(
    (t) => clearTimeout(t)
  );

  analysisTimers = [];
}

function renderAnalysisStepsInto(
  container,
  upToIndex
) {
  container.innerHTML =
    ANALYSIS_PHASES
      .map((phase, i) => {
        const done =
          i <= upToIndex;

        const badgeInner =
          String(i + 1);

        const checkIcon =
          done
            ? '<svg viewBox="0 0 20 20" fill="none" style="color:#099c4c"><circle cx="10" cy="10" r="9" fill="#099c4c"/><path d="M6 10l2.5 2.5L14 7" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : '';

        return `
          <div class="analysis-step ${done ? 'is-done' : ''}">
            <span class="analysis-step__check ${done ? '' : 'analysis-step__check--empty'}">
              ${checkIcon}
            </span>

            <span class="analysis-step__badge">
              ${badgeInner}
            </span>

            <span class="analysis-step__text">
              <p class="analysis-step__title">
                ${phase.title}
              </p>

              <p class="analysis-step__desc">
                ${phase.desc}
              </p>
            </span>
          </div>
        `;
      })
      .join('');
}

function maybeStartAnalysis() {
  if (!state.capturedImage) {
    return;
  }

  if (state.analysis.done) {
    els.analysisThumb.src =
      state.capturedImage.dataUrl;

    els.analysisThumb.style.display =
      'block';

    els.analysisProgressFill.style.width =
      '100%';

    els.analysisProgressPct.textContent =
      '100%';

    els.analysisStatusText.textContent =
      'Analysis complete.';

    renderAnalysisStepsInto(
      els.analysisStepsLive,
      ANALYSIS_PHASES.length - 1
    );

    return;
  }

  if (state.analysis.running) {
    return;
  }

  runAnalysis();
}

function runAnalysis() {
  state.analysis.running = true;
  state.analysis.phaseIndex = -1;

  els.analysisThumb.src =
    state.capturedImage.dataUrl;

  els.analysisThumb.style.display =
    'block';

  renderAnalysisStepsInto(
    els.analysisStepsLive,
    -1
  );

  els.analysisProgressFill.style.width =
    '0%';

  els.analysisProgressPct.textContent =
    '0%';

  let colourAnalysis;
  let analysisFailed = false;

  try {
    colourAnalysis =
      runDemoColourAnalysis(
        state.capturedImage.canvas
      );
  } catch (e) {
    analysisFailed = true;
  }

  const stepDurationMs = 480;

  ANALYSIS_PHASES.forEach(
    (phase, i) => {
      const t =
        setTimeout(() => {
          state.analysis.phaseIndex =
            i;

          const pct =
            Math.round(
              ((i + 1) /
                ANALYSIS_PHASES.length) *
                100
            );

          els.analysisProgressFill.style.width =
            `${pct}%`;

          els.analysisProgressPct.textContent =
            `${pct}%`;

          els.analysisStatusText.textContent =
            phase.desc;

          renderAnalysisStepsInto(
            els.analysisStepsLive,
            i
          );

          if (
            i ===
            ANALYSIS_PHASES.length - 1
          ) {
            const finishTimer =
              setTimeout(() => {
                state.analysis.running =
                  false;

                state.analysis.done =
                  true;

                if (analysisFailed) {
                  state.analysis.result =
                    'INCONCLUSIVE';

                  state.analysis.confidence =
                    null;

                  state.analysis.colorMetrics =
                    null;
                } else {
                  state.analysis.result =
                    colourAnalysis.result;

                  state.analysis.confidence =
                    colourAnalysis.confidence;

                  state.analysis.colorMetrics =
                    colourAnalysis;
                }

                renderResultStep();

                goToStep(4);
              }, 500);

            analysisTimers.push(
              finishTimer
            );
          }
        },
        stepDurationMs *
          (i + 1)
      );

      analysisTimers.push(t);
    }
  );
}

/* =========================================================
   12. RESULT HANDLING
   ========================================================= */
const RESULT_LABELS = {
  PRESUMPTIVE_POSITIVE:
    'PRESUMPTIVE\nPOSITIVE',

  PRESUMPTIVE_NEGATIVE:
    'PRESUMPTIVE\nNEGATIVE',

  INCONCLUSIVE:
    'INCONCLUSIVE',
};

function renderResultStep() {
  const result =
    state.analysis.result;

  els.resultValue.innerHTML =
    (
      RESULT_LABELS[result] ||
      result ||
      '—'
    ).replace(
      '\n',
      '<br/>'
    );

  els.resultCard.classList.toggle(
    'is-attention',
    result === 'INCONCLUSIVE'
  );

  els.confidencePill.textContent =
    state.analysis.confidence != null
      ? `Confidence : ${state.analysis.confidence}%`
      : 'Confidence : n/a';

  renderAnalysisStepsInto(
    els.analysisStepsRecap,
    ANALYSIS_PHASES.length - 1
  );
}

/* =========================================================
   13. SHA-256 HASHING
   ========================================================= */
async function sha256Hex(blob) {
  const buffer =
    await blob.arrayBuffer();

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      buffer
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map(
      (b) =>
        b
          .toString(16)
          .padStart(2, '0')
    )
    .join('');
}

/* =========================================================
   14. INDEXEDDB
   ========================================================= */
const DB_NAME =
  'fieldtest_db';

const DB_VERSION =
  1;

const STORE_NAME =
  'test_records';

function openDb() {
  return new Promise(
    (resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(
          new Error(
            'IndexedDB is not supported in this browser.'
          )
        );

        return;
      }

      const req =
        indexedDB.open(
          DB_NAME,
          DB_VERSION
        );

      req.onupgradeneeded = () => {
        const db =
          req.result;

        if (
          !db.objectStoreNames.contains(
            STORE_NAME
          )
        ) {
          db.createObjectStore(
            STORE_NAME,
            {
              keyPath: 'testId'
            }
          );
        }
      };

      req.onsuccess = () =>
        resolve(req.result);

      req.onerror = () =>
        reject(req.error);
    }
  );
}

function saveRecordToDb(record) {
  return openDb().then(
    (db) =>
      new Promise(
        (resolve, reject) => {
          const tx =
            db.transaction(
              STORE_NAME,
              'readwrite'
            );

          tx.objectStore(
            STORE_NAME
          ).put(record);

          tx.oncomplete = () =>
            resolve(true);

          tx.onerror = () =>
            reject(tx.error);
        }
      )
  );
}

/* =========================================================
   15. SAVE DIGITAL RECORD
   ========================================================= */
async function saveDigitalRecord() {
  els.saveRecordBtn.disabled =
    true;

  els.saveRecordBtn.textContent =
    'Saving…';

  try {
    const imageHash =
      await sha256Hex(
        state.capturedImage.blob
      );

    const savedAt =
      new Date();

    const record = {
      testId:
        state.testId,

      operatorId:
        state.operatorId,

      timestamp:
        state.timestamp.toISOString(),

      location:
        state.location.status === 'active'
          ? {
              latitude:
                state.location.latitude,

              longitude:
                state.location.longitude,

              accuracy:
                state.location.accuracy
            }
          : {
              latitude: null,
              longitude: null,
              accuracy: null,
              status:
                state.location.status
            },

      result:
        state.analysis.result,

      confidence:
        state.analysis.confidence,

      algorithmVersion:
        DEMO_CLASSIFICATION_CONFIG.algorithmVersion,

      image:
        state.capturedImage.blob,

      imageHash,

      integrityStatus:
        'VALID',

      recordCreatedAt:
        savedAt.toISOString(),

      status:
        'SAVED',
    };

    await saveRecordToDb(
      record
    );

    state.record =
      record;

    els.recordTestId.textContent =
      record.testId;

    els.recordStatus.textContent =
      'Valid';

    els.recordOperatorId.textContent =
      record.operatorId;

    els.recordSavedAt.textContent =
      formatDateTime(
        savedAt
      );

    els.recordLocation.textContent =
      record.location.latitude != null
        ? `Lat ${record.location.latitude.toFixed(4)}°  Long ${record.location.longitude.toFixed(4)}°`
        : 'Not available for this test';

    els.recordHash.textContent =
      imageHash;

    els.recordHash.title =
      imageHash;

    els.recordSavedSubtitle.textContent =
      `Test #${record.testId} has been added to Test History.`;

    goToStep(5);
  } catch (err) {
    console.error(
      'Save record error:',
      err
    );

    showToast(
      'Could not save the record. Please try again.'
    );
  } finally {
    els.saveRecordBtn.disabled =
      false;

    els.saveRecordBtn.textContent =
      'Save Digital record';
  }
}

/* =========================================================
   16. RESET / NEW TEST
   ========================================================= */
function resetForNewTest() {
  stopCameraStream();

  clearAnalysisTimers();

  state.capturedImage =
    null;

  state.quality =
    null;

  state.analysis = {
    running: false,
    done: false,
    phaseIndex: -1,
    result: null,
    confidence: null,
    colorMetrics: null
  };

  state.record =
    null;

  els.analysisThumb.style.display =
    'none';

  els.captureResultActions.style.display =
    'none';

  initTestSetup();

  goToStep(1);
}

/* =========================================================
   17. EVENT LISTENERS
   ========================================================= */
function wireEvents() {
  /* ---------- Back button ---------- */
  els.backBtn.addEventListener(
    'click',
    handleBack
  );

  /* ---------- Step 1 ---------- */
  els.step1ContinueBtn.addEventListener(
    'click',
    () => {
      if (
        state.location.status ===
        'pending'
      ) {
        showToast(
          'Still checking location… you can continue, it will be added once available.'
        );
      }

      goToStep(2);
    }
  );

  /* ---------- Camera ---------- */
  els.captureBtn.addEventListener(
    'click',
    captureFromVideo
  );

  els.flashBtn.addEventListener(
    'click',
    toggleFlash
  );

  els.flipBtn.addEventListener(
    'click',
    flipCamera
  );

  els.retryCameraBtn.addEventListener(
    'click',
    startCameraLive
  );

  els.cameraFileInput.addEventListener(
    'change',
    (e) => {
      const file =
        e.target.files &&
        e.target.files[0];

      if (file) {
        captureFromFile(file);
      }
    }
  );

  els.retakeBtn.addEventListener(
    'click',
    retakePhoto
  );

  /* ---------- Continue to Analysis ---------- */
  els.continueAnalysisBtn.addEventListener(
    'click',
    () => {
      goToStep(3);
    }
  );

  /* ---------- Save Record ---------- */
  els.saveRecordBtn.addEventListener(
    'click',
    saveDigitalRecord
  );

  /* ---------- New Test ---------- */
  els.newTestBtn.addEventListener(
    'click',
    resetForNewTest
  );

  /* =======================================================
     MAIN NAVIGATION

     History  -> history.html
     Reports  -> reports.html
     New Test -> stay on current test page
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

          /* New Test
             Already on test.html */
          if (
            nav === 'new-test'
          ) {
            return;
          }

          /* History */
          if (
            nav === 'history'
          ) {
            window.location.href =
              'history.html';

            return;
          }

          /* Reports */
          if (
            nav === 'reports'
          ) {
            window.location.href =
              'reports.html';

            return;
          }
        }
      );
    });

  /* ---------- Stop camera before leaving page ---------- */
  window.addEventListener(
    'beforeunload',
    stopCameraStream
  );

  /* ---------- Stop camera when page becomes hidden ---------- */
  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.hidden &&
        state.step === 2 &&
        !state.capturedImage
      ) {
        stopCameraStream();
      }
    }
  );
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener(
  'DOMContentLoaded',
  () => {
    cacheDom();

    wireEvents();

    initTestSetup();

    goToStep(1);
  }
);