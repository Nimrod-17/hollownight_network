// Hallownest Diary — force-directed graph with progressive reveal
//
// Node states:
//   hidden    -> doesn't exist yet for the viewer (not drawn)
//   glimpsed  -> spotted (neighbor of a revealed node): dim shape, no card
//   revealed  -> clicked: shows the fragment card in the side panel
//
// SEED_IDS: which nodes the exploration starts from. Change these to match the real dataset.
const SEED_IDS = ["the-knight", "hornet-silksong"];

const TYPE_BASE_RADIUS = { protagonist: 16, boss: 10, npc: 7, location: 10 };
const ALL_TYPES = ["protagonist", "boss", "npc", "location"];
const ALL_GAMES = ["Hollow Knight", "Silksong"];

const appFrame = document.querySelector(".app-frame");

function measureAppFrame() {
  const rect = appFrame.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

const svg = d3.select("#graph");
let { width, height } = measureAppFrame();
svg.attr("viewBox", [0, 0, width, height]);

// Official Team Cherry artwork, used as-is (see assets/icon/), drawn at
// its own natural aspect ratio - NOT cropped/masked into a uniform shape.
// Hornet's mask is genuinely taller-than-wide (long vertical horns);
// the Knight's is closer to square. Aspect ratios below are measured
// directly from the source files (knight_head.png: 1618x1815,
// hornet_head.png: 1340x2142) rather than hardcoding pixel dimensions,
// so only the ratio matters.
const PROTAGONIST_ICONS = {
  "the-knight": { href: "assets/icon/knight_head.png", aspect: 1618 / 1815 },
  "hornet-silksong": { href: "assets/icon/hornet_head.png", aspect: 1340 / 2142 },
};
// Shared height for both protagonist icons so neither reads as
// disproportionately bigger - width is then derived per-icon from its
// own aspect ratio, so proportions stay true (Hornet ends up narrower).
const PROTAGONIST_ICON_HEIGHT = 46;

const viewport = svg.append("g").attr("class", "viewport");
const linkLayer = viewport.append("g").attr("class", "links");
const nodeLayer = viewport.append("g").attr("class", "nodes");
const labelLayer = viewport.append("g").attr("class", "labels");

const zoom = d3.zoom()
  .scaleExtent([0.3, 4])
  // d3-zoom's default wheelDelta multiplies by 10 whenever ctrlKey is set,
  // since browsers report trackpad pinch-zoom as ctrl+wheel with tiny
  // deltas that need amplifying. We require ctrl/cmd+wheel for every zoom
  // (see filter below), so a real mouse wheel's much larger delta was
  // getting that same 10x boost on every notch - jumping almost straight
  // to the min/max zoom in one scroll click. Dropping that multiplier
  // (and halving the base rate) gives small, steady steps instead.
  .wheelDelta((event) => -event.deltaY * (event.deltaMode ? 0.025 : 0.001))
  // Plain wheel scrolls the page (the graph now lives in a scrollable
  // post, not the whole viewport); only ctrl/cmd+wheel (also how
  // trackpad pinch is reported) or drag zoom/pan the graph itself.
  .filter((event) => (event.type !== "wheel" || event.ctrlKey || event.metaKey) && !event.button)
  .on("zoom", (event) => {
    viewport.attr("transform", event.transform);
    currentZoomScale = event.transform.k;
    updateLabelVisibility();
  });
svg.call(zoom);

const journal = document.getElementById("journal");
const journalTitle = document.getElementById("journal-title");
const journalArea = document.getElementById("journal-area");
const journalFragment = document.getElementById("journal-fragment");
const journalClose = document.getElementById("journal-close");
const focusToggle = document.getElementById("focus-toggle");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const hint = document.getElementById("hint");
const revealAllBtn = document.getElementById("reveal-all-btn");

const filtersPanel = document.getElementById("filters-panel");
const filtersToggleBtn = document.getElementById("filters-toggle-btn");
const filtersCloseBtn = document.getElementById("filters-close");
const typeFilterInputs = document.querySelectorAll(".type-filter");
const gameFilterInputs = document.querySelectorAll(".game-filter");
const viewModeSelect = document.getElementById("view-mode-select");
const searchInput = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");

let allNodes = [];
let allLinks = [];
let state = new Map(); // id -> 'hidden' | 'glimpsed' | 'revealed'
let degreeById = new Map();
let topHubIds = new Set();

let activeTypes = new Set(ALL_TYPES);
let activeGames = new Set(ALL_GAMES);
let searchQuery = "";
let openNodeId = null;
let focusNodeId = null;
let hoveredNodeId = null;

let simulation;
let currentViewMode = "force";
let currentZoomScale = 1;
const LOW_ZOOM_LABEL_THRESHOLD = 1.6; // below this, only hub labels show
const HUB_COUNT = 18;

fetch("data.json")
  .then(res => res.json())
  .then(data => {
    allNodes = data.nodes.map(d => ({ ...d }));
    allLinks = data.links.map(d => ({ ...d }));

    allNodes.forEach(n => state.set(n.id, "hidden"));
    SEED_IDS.forEach(id => state.set(id, "glimpsed"));

    // Computed once, before the force simulation ever touches allLinks:
    // d3.forceLink() mutates link.source/target from ids into node object
    // references the first time a link takes part in the simulation, so
    // degree has to be read off the raw data while everything is still a
    // plain string id.
    allLinks.forEach(l => {
      degreeById.set(l.source, (degreeById.get(l.source) || 0) + 1);
      degreeById.set(l.target, (degreeById.get(l.target) || 0) + 1);
    });
    topHubIds = new Set(
      [...degreeById.entries()].sort((a, b) => b[1] - a[1]).slice(0, HUB_COUNT).map(([id]) => id)
    );

    simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id(d => d.id).distance(150).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-360))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(d => radiusFor(d) + 14))
      .alphaDecay(0.05)
      .on("tick", ticked);

    render("high");
  });

function radiusFor(d) {
  // Protagonists render at a fixed icon height regardless of degree (see
  // PROTAGONIST_ICON_HEIGHT), so their "radius" for collision/label
  // purposes is just half that height, not the degree-based formula.
  if (d.type === "protagonist") return PROTAGONIST_ICON_HEIGHT / 2;
  const degree = degreeById.get(d.id) || 0;
  return TYPE_BASE_RADIUS[d.type] + Math.min(6, Math.sqrt(degree) * 1.1);
}

function idOf(endpoint) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

function neighborsOf(id) {
  return allLinks
    .filter(l => idOf(l.source) === id || idOf(l.target) === id)
    .map(l => (idOf(l.source) === id ? idOf(l.target) : idOf(l.source)));
}

function visibleGraph() {
  let visibleIds = new Set(
    allNodes
      .filter(n => state.get(n.id) !== "hidden" && activeTypes.has(n.type) && activeGames.has(n.game))
      .map(n => n.id)
  );

  if (focusNodeId && visibleIds.has(focusNodeId)) {
    const keep = new Set([focusNodeId, ...neighborsOf(focusNodeId)]);
    visibleIds = new Set([...visibleIds].filter(id => keep.has(id)));
  }

  const nodes = allNodes.filter(n => visibleIds.has(n.id));
  const links = allLinks.filter(
    l => visibleIds.has(idOf(l.source)) && visibleIds.has(idOf(l.target))
  );
  return { nodes, links };
}

function matchesSearch(d) {
  if (!searchQuery) return false;
  if (state.get(d.id) === "hidden") return false;
  return d.label.toLowerCase().includes(searchQuery);
}

// Hidden by default; shown on hover (a quick peek without committing to a
// reveal), once a node is actually revealed, or - even when revealed -
// only for hub nodes while zoomed out, so the initial view isn't a wall
// of overlapping text.
function labelVisible(d) {
  if (d.id === hoveredNodeId) return true;
  if (state.get(d.id) !== "revealed") return false;
  if (currentZoomScale < LOW_ZOOM_LABEL_THRESHOLD) return topHubIds.has(d.id);
  return true;
}

function updateLabelVisibility() {
  labelLayer.selectAll("text")
    .text(d => (labelVisible(d) ? d.label : "?"))
    .attr("class", d => `node-label ${labelVisible(d) ? "visible" : ""}`);
}

const REHEAT_ALPHA = { none: null, low: 0.25, medium: 0.5, high: 0.9 };

// reheat controls how much the layout is allowed to shift: "none" for
// interactions that don't change which nodes are visible (reopening an
// already-revealed node, typing a search query), up to "high" for
// structural changes (reveal all, first load). Restarting the simulation
// hard on every click was the main source of the graph jumping around
// and disorienting the viewer on every interaction.
function render(reheat = "low") {
  const { nodes, links } = visibleGraph();

  // preserve existing node positions across re-renders
  const prevPositions = new Map(
    simulation.nodes().map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }])
  );
  nodes.forEach(n => {
    const prev = prevPositions.get(n.id);
    if (prev) Object.assign(n, prev);
  });

  simulation.nodes(nodes);
  simulation.force("link").links(links);
  const alpha = REHEAT_ALPHA[reheat];
  if (alpha != null) simulation.alpha(Math.max(alpha, simulation.alpha())).restart();

  const linkSel = linkLayer.selectAll("path").data(links, d => `${idOf(d.source)}-${idOf(d.target)}`);
  linkSel.exit().remove();
  linkSel.enter().append("path").attr("class", "link-line").attr("fill", "none");

  const nodeSel = nodeLayer.selectAll("g.node").data(nodes, d => d.id);
  nodeSel.exit().remove();
  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .on("click", (event, d) => onNodeClick(d))
    .on("pointerenter", (event, d) => { hoveredNodeId = d.id; updateLabelVisibility(); })
    .on("pointerleave", (event, d) => { if (hoveredNodeId === d.id) hoveredNodeId = null; updateLabelVisibility(); });

  nodeEnter.each(function (d) {
    const g = d3.select(this);
    const r = radiusFor(d);
    if (d.type === "protagonist") {
      const icon = PROTAGONIST_ICONS[d.id];
      const h = PROTAGONIST_ICON_HEIGHT;
      const w = h * icon.aspect;
      const shape = g.append("g").attr("class", "node-shape");
      // Halo drawn first (behind the image): a soft, blurred, low-opacity
      // ellipse loosely matching the icon's own bounding box - not a
      // fixed circle, and not a solid backing shape (that would show
      // through the PNG's transparent regions as a hard-edged color).
      shape.append("ellipse")
        .attr("class", "protagonist-halo")
        .attr("rx", w / 2 + 7)
        .attr("ry", h / 2 + 7);
      shape.append("image")
        .attr("href", icon.href)
        .attr("x", -w / 2).attr("y", -h / 2)
        .attr("width", w).attr("height", h)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("class", "protagonist-image");
    } else if (d.type === "boss") {
      const side = r * 1.3;
      g.append("rect").attr("class", "node-shape")
        .attr("x", -side / 2).attr("y", -side / 2).attr("width", side).attr("height", side)
        .attr("transform", "rotate(45)");
    } else {
      g.append("circle").attr("class", "node-shape").attr("r", r);
    }
  });

  nodeLayer.selectAll("g.node").each(function (d) {
    const shapeState = state.get(d.id);
    const classes = ["node-shape", `type-${d.type}`, shapeState];
    if (matchesSearch(d)) classes.push("search-match");
    d3.select(this).select(".node-shape").attr("class", classes.join(" "));
  });

  const labelSel = labelLayer.selectAll("text").data(nodes, d => d.id);
  labelSel.exit().remove();
  labelSel.enter()
    .append("text")
    .attr("class", "node-label")
    .attr("dx", d => radiusFor(d) + 6)
    .attr("dy", 4);

  updateLabelVisibility();

  updateProgress();
  updateSearchStatus(nodes);
  ticked(); // position freshly-entered elements immediately, even if reheat === "none"
}

// Slight, stable bezier bow instead of a straight line - the offset
// direction depends only on the link's own source/target, so a given
// link always bows the same way instead of flickering between renders.
function linkPath(d) {
  const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
  const dx = tx - sx, dy = ty - sy;
  const dr = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = dr * 0.15;
  const mx = (sx + tx) / 2 - (dy / dr) * offset;
  const my = (sy + ty) / 2 + (dx / dr) * offset;
  return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
}

function ticked() {
  linkLayer.selectAll("path").attr("d", linkPath);

  nodeLayer.selectAll("g.node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  labelLayer.selectAll("text")
    .attr("x", d => d.x).attr("y", d => d.y);
}

function onNodeClick(d) {
  if (state.get(d.id) === "hidden") return;

  const wasGlimpsed = state.get(d.id) === "glimpsed";
  if (wasGlimpsed) {
    state.set(d.id, "revealed");
    neighborsOf(d.id).forEach(id => {
      if (state.get(id) === "hidden") state.set(id, "glimpsed");
    });
  }

  openJournal(d);
  // reopening an already-revealed node's card doesn't add any nodes, so
  // there's nothing to settle into place - only reheat when new
  // neighbors were just glimpsed.
  render(wasGlimpsed ? "medium" : "none");
}

function openJournal(d) {
  hint.style.display = "none";
  journalArea.textContent = d.area || d.game || "";
  journalTitle.textContent = d.label;
  journalFragment.textContent = d.fragment;
  openNodeId = d.id;
  focusNodeId = null;
  focusToggle.checked = false;
  journal.classList.remove("hidden");
}

journalClose.addEventListener("click", () => {
  journal.classList.add("hidden");
  const wasFocused = focusNodeId !== null;
  openNodeId = null;
  focusNodeId = null;
  focusToggle.checked = false;
  render(wasFocused ? "medium" : "none");
});

focusToggle.addEventListener("change", () => {
  focusNodeId = focusToggle.checked ? openNodeId : null;
  render("medium");
});

revealAllBtn.addEventListener("click", () => {
  allNodes.forEach(n => state.set(n.id, "revealed"));
  hint.style.display = "none";
  render("high");
});

filtersToggleBtn.addEventListener("click", () => {
  const nowHidden = filtersPanel.classList.toggle("hidden");
  filtersToggleBtn.setAttribute("aria-expanded", String(!nowHidden));
});
filtersCloseBtn.addEventListener("click", () => {
  filtersPanel.classList.add("hidden");
  filtersToggleBtn.setAttribute("aria-expanded", "false");
});

typeFilterInputs.forEach(input => {
  input.addEventListener("change", () => {
    activeTypes = new Set([...typeFilterInputs].filter(i => i.checked).map(i => i.value));
    render("medium");
  });
});
gameFilterInputs.forEach(input => {
  input.addEventListener("change", () => {
    activeGames = new Set([...gameFilterInputs].filter(i => i.checked).map(i => i.value));
    render("medium");
  });
});

viewModeSelect.addEventListener("change", () => {
  currentViewMode = viewModeSelect.value;
  applyViewMode("high");
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render("none"); // highlighting only, the visible node set doesn't change
  recenterOnSingleMatch();
});

function recenterOnSingleMatch() {
  if (!searchQuery) return;
  const matches = allNodes.filter(matchesSearch);
  if (matches.length !== 1) return;
  const target = matches[0];
  if (target.x == null || target.y == null) return;
  const scale = 1.4;
  const transform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(scale)
    .translate(-target.x, -target.y);
  svg.transition().duration(500).call(zoom.transform, transform);
}

function updateSearchStatus(visibleNodes) {
  if (!searchQuery) {
    searchStatus.textContent = "";
    return;
  }
  const matchCount = visibleNodes.filter(matchesSearch).length;
  searchStatus.textContent = matchCount === 0
    ? `No discovered entries match "${searchInput.value.trim()}".`
    : `${matchCount} match${matchCount === 1 ? "" : "es"} found.`;
}

function applyViewMode(reheat = "high") {
  if (currentViewMode === "by-game") {
    const gameX = { "Hollow Knight": width * 0.28, "Silksong": width * 0.72 };
    simulation.force("x", d3.forceX(d => gameX[d.game] ?? width / 2).strength(0.12));
    simulation.force("y", d3.forceY(height / 2).strength(0.05));
    simulation.force("link").distance(90).strength(0.5);
    simulation.force("charge").strength(-260);
  } else if (currentViewMode === "by-type") {
    const typeAnchors = {
      protagonist: { x: width * 0.5, y: height * 0.18 },
      boss: { x: width * 0.82, y: height * 0.55 },
      npc: { x: width * 0.5, y: height * 0.85 },
      location: { x: width * 0.18, y: height * 0.55 },
    };
    simulation.force("x", d3.forceX(d => (typeAnchors[d.type] || {}).x ?? width / 2).strength(0.45));
    simulation.force("y", d3.forceY(d => (typeAnchors[d.type] || {}).y ?? height / 2).strength(0.45));
    simulation.force("link").distance(50).strength(0.15);
    simulation.force("charge").strength(-120);
  } else {
    simulation.force("x", null);
    simulation.force("y", null);
    simulation.force("link").distance(150).strength(0.5);
    simulation.force("charge").strength(-360);
  }
  simulation.alpha(REHEAT_ALPHA[reheat]).restart();
}

function updateProgress() {
  const total = allNodes.length;
  const revealed = allNodes.filter(n => state.get(n.id) === "revealed").length;
  const pct = total ? Math.round((revealed / total) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `${pct}% explored`;
}

window.addEventListener("resize", () => {
  ({ width, height } = measureAppFrame());
  svg.attr("viewBox", [0, 0, width, height]);
  simulation.force("center", d3.forceCenter(width / 2, height / 2));
  applyViewMode("low");
});

document.getElementById("scroll-cue").addEventListener("click", () => {
  document.getElementById("post-network").scrollIntoView({ behavior: "smooth" });
});
