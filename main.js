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

const svg = d3.select("#graph");
let width = window.innerWidth;
let height = window.innerHeight;
svg.attr("viewBox", [0, 0, width, height]);

const defs = svg.append("defs");
defs.append("symbol").attr("id", "icon-knight").attr("viewBox", "0 0 32 32").html(`
  <path d="M16 3C9 3 5 9 5 16C5 23 9 29 16 29C23 29 27 23 27 16C27 9 23 3 16 3Z" />
  <ellipse cx="11.5" cy="17" rx="2.6" ry="3.6" fill="var(--bg-deep)" />
  <ellipse cx="20.5" cy="17" rx="2.6" ry="3.6" fill="var(--bg-deep)" />
`);
defs.append("symbol").attr("id", "icon-hornet").attr("viewBox", "0 0 32 32").html(`
  <path d="M16 3L19.5 9.5L25.5 13C26.5 20.5 21.5 29 16 29C10.5 29 5.5 20.5 6.5 13L12.5 9.5Z" />
  <line x1="16" y1="10" x2="16" y2="24" stroke="var(--bg-deep)" stroke-width="1.2" opacity="0.55" />
  <circle cx="16" cy="16" r="1.8" fill="var(--bg-deep)" />
`);

const viewport = svg.append("g").attr("class", "viewport");
const linkLayer = viewport.append("g").attr("class", "links");
const nodeLayer = viewport.append("g").attr("class", "nodes");
const labelLayer = viewport.append("g").attr("class", "labels");

const zoom = d3.zoom()
  .scaleExtent([0.3, 4])
  .on("zoom", (event) => viewport.attr("transform", event.transform));
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

let activeTypes = new Set(ALL_TYPES);
let activeGames = new Set(ALL_GAMES);
let searchQuery = "";
let openNodeId = null;
let focusNodeId = null;

let simulation;
let currentViewMode = "force";

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

    simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id(d => d.id).distance(90).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(d => radiusFor(d) + 6))
      .on("tick", ticked);

    render();
  });

function radiusFor(d) {
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

function protagonistIcon(d) {
  return d.id === "the-knight" ? "#icon-knight" : "#icon-hornet";
}

function matchesSearch(d) {
  if (!searchQuery) return false;
  if (state.get(d.id) === "hidden") return false;
  return d.label.toLowerCase().includes(searchQuery);
}

function render() {
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
  simulation.alpha(0.7).restart();

  const linkSel = linkLayer.selectAll("line").data(links, d => `${idOf(d.source)}-${idOf(d.target)}`);
  linkSel.exit().remove();
  linkSel.enter().append("line").attr("class", "link-line");

  const nodeSel = nodeLayer.selectAll("g.node").data(nodes, d => d.id);
  nodeSel.exit().remove();
  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .on("click", (event, d) => onNodeClick(d));

  nodeEnter.each(function (d) {
    const g = d3.select(this);
    const r = radiusFor(d);
    if (d.type === "protagonist") {
      g.append("use").attr("href", protagonistIcon(d)).attr("x", -r).attr("y", -r).attr("width", r * 2).attr("height", r * 2);
    } else if (d.type === "boss") {
      const side = r * 1.3;
      g.append("rect").attr("x", -side / 2).attr("y", -side / 2).attr("width", side).attr("height", side).attr("transform", "rotate(45)");
    } else {
      g.append("circle").attr("r", r);
    }
  });

  nodeLayer.selectAll("g.node").each(function (d) {
    const shapeState = state.get(d.id);
    const classes = ["node-shape", `type-${d.type}`, shapeState];
    if (matchesSearch(d)) classes.push("search-match");
    d3.select(this).select("use, rect, circle").attr("class", classes.join(" "));
  });

  const labelSel = labelLayer.selectAll("text").data(nodes, d => d.id);
  labelSel.exit().remove();
  labelSel.enter()
    .append("text")
    .attr("class", "node-label")
    .attr("dx", d => radiusFor(d) + 6)
    .attr("dy", 4);

  labelLayer.selectAll("text")
    .text(d => (state.get(d.id) === "revealed" ? d.label : "?"))
    .attr("class", d => `node-label ${state.get(d.id) === "revealed" ? "visible" : ""}`);

  updateProgress();
  updateSearchStatus(nodes);
}

function ticked() {
  linkLayer.selectAll("line")
    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

  nodeLayer.selectAll("g.node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  labelLayer.selectAll("text")
    .attr("x", d => d.x).attr("y", d => d.y);
}

function onNodeClick(d) {
  if (state.get(d.id) === "hidden") return;

  if (state.get(d.id) === "glimpsed") {
    state.set(d.id, "revealed");
    neighborsOf(d.id).forEach(id => {
      if (state.get(id) === "hidden") state.set(id, "glimpsed");
    });
  }

  openJournal(d);
  render();
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
  openNodeId = null;
  focusNodeId = null;
  focusToggle.checked = false;
  render();
});

focusToggle.addEventListener("change", () => {
  focusNodeId = focusToggle.checked ? openNodeId : null;
  render();
});

revealAllBtn.addEventListener("click", () => {
  allNodes.forEach(n => state.set(n.id, "revealed"));
  hint.style.display = "none";
  render();
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
    render();
  });
});
gameFilterInputs.forEach(input => {
  input.addEventListener("change", () => {
    activeGames = new Set([...gameFilterInputs].filter(i => i.checked).map(i => i.value));
    render();
  });
});

viewModeSelect.addEventListener("change", () => {
  currentViewMode = viewModeSelect.value;
  applyViewMode();
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
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

function applyViewMode() {
  if (currentViewMode === "by-game") {
    const gameX = { "Hollow Knight": width * 0.28, "Silksong": width * 0.72 };
    simulation.force("x", d3.forceX(d => gameX[d.game] ?? width / 2).strength(0.12));
    simulation.force("y", d3.forceY(height / 2).strength(0.05));
    simulation.force("link").distance(70).strength(0.5);
    simulation.force("charge").strength(-200);
  } else if (currentViewMode === "by-type") {
    const typeAnchors = {
      protagonist: { x: width * 0.5, y: height * 0.18 },
      boss: { x: width * 0.82, y: height * 0.55 },
      npc: { x: width * 0.5, y: height * 0.85 },
      location: { x: width * 0.18, y: height * 0.55 },
    };
    simulation.force("x", d3.forceX(d => (typeAnchors[d.type] || {}).x ?? width / 2).strength(0.45));
    simulation.force("y", d3.forceY(d => (typeAnchors[d.type] || {}).y ?? height / 2).strength(0.45));
    simulation.force("link").distance(40).strength(0.1);
    simulation.force("charge").strength(-90);
  } else {
    simulation.force("x", null);
    simulation.force("y", null);
    simulation.force("link").distance(90).strength(0.6);
    simulation.force("charge").strength(-260);
  }
  simulation.alpha(0.9).restart();
}

function updateProgress() {
  const total = allNodes.length;
  const revealed = allNodes.filter(n => state.get(n.id) === "revealed").length;
  const pct = total ? Math.round((revealed / total) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `${pct}% explored`;
}

window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  svg.attr("viewBox", [0, 0, width, height]);
  simulation.force("center", d3.forceCenter(width / 2, height / 2));
  applyViewMode();
});
