// Hallownest Diary — force-directed graph with progressive reveal
//
// Node states:
//   hidden    -> doesn't exist yet for the viewer (not drawn)
//   glimpsed  -> spotted (neighbor of a revealed node): dim circle, no card
//   revealed  -> clicked: shows the fragment card in the side panel
//
// SEED_IDS: which nodes the exploration starts from. Change these to match the real dataset.
const SEED_IDS = ["the-knight", "hornet-silksong"];

const svg = d3.select("#graph");
let width = window.innerWidth;
let height = window.innerHeight;
svg.attr("viewBox", [0, 0, width, height]);

const linkLayer = svg.append("g").attr("class", "links");
const nodeLayer = svg.append("g").attr("class", "nodes");
const labelLayer = svg.append("g").attr("class", "labels");

const journal = document.getElementById("journal");
const journalTitle = document.getElementById("journal-title");
const journalArea = document.getElementById("journal-area");
const journalFragment = document.getElementById("journal-fragment");
const journalClose = document.getElementById("journal-close");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const hint = document.getElementById("hint");
const revealAllBtn = document.getElementById("reveal-all-btn");

let allNodes = [];
let allLinks = [];
let state = new Map(); // id -> 'hidden' | 'glimpsed' | 'revealed'

let simulation;

fetch("data.json")
  .then(res => res.json())
  .then(data => {
    allNodes = data.nodes.map(d => ({ ...d }));
    allLinks = data.links.map(d => ({ ...d }));

    allNodes.forEach(n => state.set(n.id, "hidden"));
    SEED_IDS.forEach(id => state.set(id, "glimpsed"));

    simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id(d => d.id).distance(90).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(28))
      .on("tick", ticked);

    render();
  });

function neighborsOf(id) {
  return allLinks
    .filter(l => l.source === id || l.target === id)
    .map(l => (l.source === id ? l.target : l.source));
}

function visibleGraph() {
  const visibleIds = new Set(
    allNodes.filter(n => state.get(n.id) !== "hidden").map(n => n.id)
  );
  const nodes = allNodes.filter(n => visibleIds.has(n.id));
  const links = allLinks.filter(
    l => visibleIds.has(l.source.id || l.source) && visibleIds.has(l.target.id || l.target)
  );
  return { nodes, links };
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

  const linkSel = linkLayer.selectAll("line").data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
  linkSel.exit().remove();
  linkSel.enter().append("line").attr("class", "link-line");

  const nodeSel = nodeLayer.selectAll("circle").data(nodes, d => d.id);
  nodeSel.exit().remove();
  const nodeEnter = nodeSel.enter()
    .append("circle")
    .attr("class", "node-circle")
    .attr("r", d => (d.type === "location" ? 10 : 7))
    .on("click", (event, d) => onNodeClick(d));

  nodeLayer.selectAll("circle")
    .attr("class", d => `node-circle ${state.get(d.id)}`);

  const labelSel = labelLayer.selectAll("text").data(nodes, d => d.id);
  labelSel.exit().remove();
  labelSel.enter()
    .append("text")
    .attr("class", "node-label")
    .attr("dx", 12)
    .attr("dy", 4);

  labelLayer.selectAll("text")
    .text(d => (state.get(d.id) === "revealed" ? d.label : "?"))
    .attr("class", d => `node-label ${state.get(d.id) === "revealed" ? "visible" : ""}`);

  updateProgress();
}

function ticked() {
  linkLayer.selectAll("line")
    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

  nodeLayer.selectAll("circle")
    .attr("cx", d => d.x).attr("cy", d => d.y);

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
  journalArea.textContent = d.area || "";
  journalTitle.textContent = d.label;
  journalFragment.textContent = d.fragment;
  journal.classList.remove("hidden");
}

journalClose.addEventListener("click", () => journal.classList.add("hidden"));

revealAllBtn.addEventListener("click", () => {
  allNodes.forEach(n => state.set(n.id, "revealed"));
  hint.style.display = "none";
  render();
});

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
  simulation.alpha(0.4).restart();
});
