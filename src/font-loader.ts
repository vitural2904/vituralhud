const lensWeights = [
  ["Thin", 100], ["ExtraLight", 200], ["Light", 300], ["Book", 400],
  ["Medium", 500], ["SemiBold", 600], ["Bold", 700], ["ExtraBold", 800],
] as const;

const lensFaces = lensWeights.flatMap(([name, weight]) => [
  { weight, style: "normal", url: `/fonts/lens-grotesk/LensGrotesk-${name}.woff2` },
  { weight, style: "italic", url: `/fonts/lens-grotesk/LensGrotesk-${name}Italic.woff2` },
]);
// This family bundle also has a separate Regular face; Book owns the 400 slot.
// Keeping Regular under its own name avoids two competing 400 faces.
lensFaces.push({ weight: 400, style: "normal", url: "/fonts/lens-grotesk/LensGrotesk-Regular.woff2" });

export async function loadLicensedLensGrotesk() {
  let faces: string[] = [];
  try { const response = await fetch('/api/fonts'); if (response.ok) { const payload = await response.json(); if (Array.isArray(payload.faces)) faces = payload.faces; } } catch { /* fallback fonts remain available */ }
  const availableFaces = lensFaces.filter(({ url }) => faces.includes(url.split('/').pop()!));
  if (!availableFaces.length || document.querySelector('style[data-font="lens-grotesk"]')) return;

  const sheet = document.createElement("style");
  sheet.dataset.font = "lens-grotesk";
  const hasThin = availableFaces.some(face => face.weight === 100 && face.style === "normal");
  const hasLightItalic = availableFaces.some(face => face.weight === 300 && face.style === "italic");
  sheet.textContent = availableFaces.map(({ weight, style, url }) => `@font-face{font-family:"${url.endsWith("-Regular.woff2") ? "Lens Grotesk Regular" : "Lens Grotesk"}";src:url("${url}") format("woff2");font-style:${style};font-weight:${weight};font-display:swap;}`).join("")
    + `:root{--lens-display-weight:${hasThin ? 100 : 700};--lens-note-style:${hasLightItalic ? "italic" : "normal"};}`;
  document.head.append(sheet);
  document.documentElement.dataset.lens = 'available';
}
