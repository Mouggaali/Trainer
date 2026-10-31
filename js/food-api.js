// Product data from Open Food Facts (free, no key) + camera barcode scanner.
// iOS Safari has no native BarcodeDetector, so a zxing-wasm polyfill is loaded the first time the scanner opens.

const FIELDS = 'code,product_name,product_name_nl,brands,nutriments,serving_quantity,serving_size,quantity,product_quantity_unit,serving_quantity_unit';
const SCANNER_LIB = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/+esm';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/** Open Food Facts product → our food shape, or null without usable nutrition data. */
export function fromOff(p) {
  const n = p?.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184; // kJ
  const name = (p.product_name_nl || p.product_name || '').trim();
  if (kcal == null || !name) return null;
  const servingG = Number(p.serving_quantity);
  // Drinks: Open Food Facts stores their values per 100 ml (still under the *_100g keys).
  const liquid = [p.product_quantity_unit, p.serving_quantity_unit].some((u) => /^(ml|cl|l)$/i.test(u || ''))
    || /\d\s*(ml|cl|l|liter)/i.test(p.quantity || '');
  return {
    name,
    brand: (p.brands || '').split(',')[0].trim() || undefined,
    barcode: p.code || undefined,
    per100: { kcal: Math.round(kcal), protein: r1(n.proteins_100g), carbs: r1(n.carbohydrates_100g), fat: r1(n.fat_100g) },
    serving: servingG > 0 && servingG < 2000 ? { label: p.serving_size || `${servingG} g`, g: servingG } : undefined,
    unit: liquid ? 'ml' : 'g',
    source: 'off',
  };
}

/** Product by barcode → food or null (not found / no nutrition data). Throws when offline. */
export async function productByBarcode(code) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const j = await res.json();
  return j.status === 1 ? fromOff(j.product) : null;
}

/** Text search (Dutch products first) → foods with nutrition data. */
export async function searchProducts(query) {
  const url = `https://nl.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=24&fields=${FIELDS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const j = await res.json();
  return (j.products || []).map(fromOff).filter(Boolean);
}

// ---------- Scanner ----------
let Detector = null;

async function getDetector() {
  if (!Detector) {
    const native = window.BarcodeDetector;
    const ok = native && (await native.getSupportedFormats?.().catch(() => []))?.includes('ean_13');
    Detector = ok ? native : (await import(SCANNER_LIB)).BarcodeDetector;
  }
  return new Detector({ formats: FORMATS });
}

/**
 * Opens a fullscreen camera overlay and resolves with the scanned barcode, or null when closed.
 * Rejects when the camera cannot be used (no permission / no camera).
 */
export async function scanBarcode() {
  const root = document.createElement('div');
  root.className = 'scanner';
  root.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="scanner-frame"></div>
    <div class="scanner-bar"><span class="scanner-msg">Camera starten…</span>
      <button class="btn btn-secondary" type="button">Sluiten</button></div>`;
  document.body.appendChild(root);
  const video = root.querySelector('video');
  const msg = root.querySelector('.scanner-msg');
  let stream = null;
  let timer = null;
  let done;
  const result = new Promise((res) => { done = res; });
  const stop = (value) => {
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    root.remove();
    done(value);
  };
  root.querySelector('button').addEventListener('click', () => stop(null));

  try {
    const [detector, s] = await Promise.all([
      getDetector(),
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }),
    ]);
    stream = s;
    if (!root.isConnected) { stop(null); return result; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    msg.textContent = 'Richt op de barcode';
    const loop = async () => {
      if (!root.isConnected) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
          if (hit) return stop(hit.rawValue);
        }
      } catch { /* frame not ready */ }
      timer = setTimeout(loop, 250);
    };
    loop();
  } catch (e) {
    stop(null);
    throw e;
  }
  return result;
}
