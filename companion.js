// Small companion sprite that hops between a handful of fixed waypoints as
// the visitor scrolls, instead of tracking the scroll position
// continuously. Reuses the same official Knight head image already used
// for the hero emblem and the graph's protagonist node - no new art. The
// "walking/jumping" feel is entirely procedural (squash-and-stretch,
// directional lean, a scaling contact shadow), built with CSS transforms
// on this one image rather than any frame-by-frame animation.
//
// Waypoints are expressed as a fraction of the page's total scroll range
// (0 = top, 1 = bottom) rather than pixel offsets tied to specific
// elements, so they stay sensibly spread out even as more posts are added
// to the page later.
const COMPANION_WAYPOINTS = [
  { fraction: 0.00, style: { top: "14vh", left: "9vw" } },   // hero title
  { fraction: 0.10, style: { top: "60vh", left: "84vw" } },  // hero, near the scroll cue
  { fraction: 0.30, style: { top: "20vh", left: "8vw" } },   // post heading
  { fraction: 0.44, style: { top: "13vh", left: "6vw" } },   // graph topbar
  { fraction: 0.66, style: { top: "46vh", left: "5vw" } },   // mid graph view
  { fraction: 0.92, style: { bottom: "10vh", left: "18vw" } }, // footer
];

const HOP_DURATION_MS = 620;
const LEDGE_OFFSET_PX = 58; // roughly the companion's own height + a gap
const SHADOW_OFFSET_PX = 44; // sits closer under the sprite than the ledge

const companion = document.getElementById("companion");
const companionShadow = document.getElementById("companion-shadow");
const companionLedge = document.getElementById("companion-ledge");
const journalEl = document.getElementById("journal");

let activeWaypointIndex = -1;
let hopTimeout = null;

function applyPosition(el, style) {
  el.style.top = style.top ?? "auto";
  el.style.bottom = style.bottom ?? "auto";
  el.style.left = style.left ?? "auto";
  el.style.right = style.right ?? "auto";
}

function ledgeStyleFor(style) {
  const ledge = { left: style.left, right: style.right };
  if (style.top) {
    ledge.top = `calc(${style.top} + ${LEDGE_OFFSET_PX}px)`;
  } else if (style.bottom) {
    ledge.bottom = `calc(${style.bottom} - ${LEDGE_OFFSET_PX}px)`;
  }
  return ledge;
}

function shadowStyleFor(style) {
  const shadow = { left: style.left, right: style.right };
  if (style.top) {
    shadow.top = `calc(${style.top} + ${SHADOW_OFFSET_PX}px)`;
  } else if (style.bottom) {
    shadow.bottom = `calc(${style.bottom} - ${SHADOW_OFFSET_PX}px)`;
  }
  return shadow;
}

// Approximate on-screen X (px) for a waypoint's style, used only to work
// out which way the companion is about to travel so the hop can lean into
// it - doesn't need to be exact, just the right sign.
function resolveXPixels(style) {
  if (style.left) return (parseFloat(style.left) / 100) * window.innerWidth;
  if (style.right) return window.innerWidth - (parseFloat(style.right) / 100) * window.innerWidth;
  return window.innerWidth / 2;
}

function goToWaypoint(index, previousIndex) {
  const waypoint = COMPANION_WAYPOINTS[index];
  const previousWaypoint = COMPANION_WAYPOINTS[previousIndex] ?? waypoint;

  const dx = resolveXPixels(waypoint.style) - resolveXPixels(previousWaypoint.style);
  const lean = dx > 4 ? 1 : dx < -4 ? -1 : 0;
  companion.style.setProperty("--lean", String(lean));

  applyPosition(companion, waypoint.style);
  applyPosition(companionShadow, shadowStyleFor(waypoint.style));
  applyPosition(companionLedge, ledgeStyleFor(waypoint.style));

  for (const el of [companion, companionShadow]) {
    el.classList.remove("idle");
    el.classList.add("hopping");
  }
  clearTimeout(hopTimeout);
  hopTimeout = setTimeout(() => {
    for (const el of [companion, companionShadow]) {
      el.classList.remove("hopping");
      el.classList.add("idle");
    }
  }, HOP_DURATION_MS);
}

function updateCompanion() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = window.scrollY / maxScroll;

  let newIndex = 0;
  for (let i = 0; i < COMPANION_WAYPOINTS.length; i++) {
    if (progress >= COMPANION_WAYPOINTS[i].fraction) newIndex = i;
  }

  if (newIndex !== activeWaypointIndex) {
    const previousIndex = activeWaypointIndex;
    activeWaypointIndex = newIndex;
    goToWaypoint(newIndex, previousIndex);
  }
}

let scrollTicking = false;
window.addEventListener("scroll", () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    updateCompanion();
    scrollTicking = false;
  });
});

// The page's total scrollable height can shift slightly once images
// (including the hero background) finish loading, or on resize.
window.addEventListener("resize", updateCompanion);
window.addEventListener("load", updateCompanion);

// Dim the companion while the journal drawer is open rather than risk it
// sitting awkwardly on top of that panel.
const journalObserver = new MutationObserver(() => {
  const isOpen = !journalEl.classList.contains("hidden");
  for (const el of [companion, companionShadow, companionLedge]) {
    el.classList.toggle("journal-dim", isOpen);
  }
});
journalObserver.observe(journalEl, { attributes: true, attributeFilter: ["class"] });

companion.classList.add("idle");
companionShadow.classList.add("idle");
updateCompanion();
