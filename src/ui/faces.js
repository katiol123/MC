// Round avatars: every portrait is framed on the fighter's FACE (the portraits are upper-body
// cut-outs with the face in a different place on each). FACE = [centre x, centre y, face width],
// all as fractions of the portrait (600×1071).
const FACE = {
  brick: [0.45, 0.23, 0.5], bruno: [0.45, 0.29, 0.45], chuy: [0.4, 0.28, 0.32], cinder: [0.5, 0.32, 0.35],
  goro: [0.48, 0.31, 0.55], grizz: [0.5, 0.33, 0.42], hawk: [0.45, 0.28, 0.4], jaguar: [0.52, 0.29, 0.42],
  jax: [0.48, 0.33, 0.5], rattigan: [0.48, 0.35, 0.5], roxy: [0.38, 0.27, 0.34], smiles: [0.48, 0.32, 0.58],
  snapper: [0.55, 0.24, 0.55], sobby: [0.5, 0.27, 0.5], tao: [0.6, 0.27, 0.36], vellaro: [0.48, 0.36, 0.45],
};
const ASPECT = 1071 / 600;

/** Inline style that fills a round box with the fighter's face (works at any box size). */
export function faceStyle(app, id, fill = 0.9) {
  const [cx, cy, fw] = FACE[id] || [0.5, 0.3, 0.45];
  const k = fill / fw; // image width relative to the box
  const px = (0.5 - cx * k) / (1 - k), py = (0.5 - cy * k * ASPECT) / (1 - k * ASPECT);
  return {
    backgroundImage: `url(${app.portraitURL(id)})`,
    backgroundSize: `${(k * 100).toFixed(1)}% auto`,
    backgroundPosition: `${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%`,
    backgroundRepeat: 'no-repeat',
  };
}
