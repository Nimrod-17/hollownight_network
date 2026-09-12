// Network Stats — every metric here is computed client-side, directly
// from data.json, so this section stays accurate automatically whenever
// the dataset changes. Nothing on this page is a hand-typed number.

(function () {
  // Force en-US formatting regardless of the visitor's own locale, since
  // the rest of the site's copy is English (otherwise a browser set to a
  // comma-decimal locale would render "4,5%" next to English sentences).
  const fmt = (n, digits = 2) => Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  const pct = (n, digits = 1) => `${fmt(n * 100, digits)}%`;

  function buildAdjacency(nodes, links) {
    const adj = new Map();
    nodes.forEach((n) => adj.set(n.id, new Set()));
    links.forEach((l) => {
      if (adj.has(l.source)) adj.get(l.source).add(l.target);
      if (adj.has(l.target)) adj.get(l.target).add(l.source);
    });
    return adj;
  }

  function computeComponents(adj) {
    const visited = new Set();
    const components = [];
    for (const id of adj.keys()) {
      if (visited.has(id)) continue;
      const queue = [id];
      visited.add(id);
      const comp = [];
      while (queue.length) {
        const cur = queue.shift();
        comp.push(cur);
        for (const nb of adj.get(cur)) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      components.push(comp);
    }
    components.sort((a, b) => b.length - a.length);
    return components;
  }

  function computeClustering(adj) {
    let sum = 0;
    for (const [, neighbors] of adj) {
      const k = neighbors.size;
      if (k < 2) continue;
      const arr = [...neighbors];
      let linksAmongNeighbors = 0;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (adj.get(arr[i]).has(arr[j])) linksAmongNeighbors++;
        }
      }
      sum += (2 * linksAmongNeighbors) / (k * (k - 1));
    }
    return sum / adj.size;
  }

  function bfsDistances(adj, start) {
    const dist = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of adj.get(cur)) {
        if (!dist.has(nb)) {
          dist.set(nb, dist.get(cur) + 1);
          queue.push(nb);
        }
      }
    }
    return dist;
  }

  // BFS from every node - O(N*(N+E)), trivial at this graph's size.
  function computePathStats(adj) {
    let totalDist = 0;
    let pairCount = 0;
    let diameter = 0;
    for (const id of adj.keys()) {
      const dist = bfsDistances(adj, id);
      for (const [otherId, d] of dist) {
        if (otherId === id) continue;
        totalDist += d;
        pairCount++;
        if (d > diameter) diameter = d;
      }
    }
    return { avgPathLength: pairCount ? totalDist / pairCount : 0, diameter };
  }

  function computeFriendshipParadox(adj, degrees) {
    let sum = 0;
    let n = 0;
    for (const [, neighbors] of adj) {
      if (neighbors.size === 0) continue;
      n++;
      let neighborDegreeSum = 0;
      for (const nb of neighbors) neighborDegreeSum += degrees.get(nb);
      sum += neighborDegreeSum / neighbors.size;
    }
    return n ? sum / n : 0;
  }

  function renderStatCards(container, cards) {
    container.innerHTML = cards.map(({ value, label }) => `
      <div class="stat-card">
        <div class="stat-card-value">${value}</div>
        <div class="stat-card-label">${label}</div>
      </div>
    `).join("");
  }

  function renderRankList(el, entries) {
    el.innerHTML = entries.map(({ label, degree }) => `
      <li><span class="rank-name">${label}</span><span class="rank-degree">${degree}</span></li>
    `).join("");
  }

  function renderComponents(el, components, nodesById) {
    if (components.length <= 1) {
      el.innerHTML = `<p class="stats-empty">Every one of the ${components[0]?.length ?? 0} entries is reachable from every other - a single unbroken web. No forgotten fragments (yet).</p>`;
      return;
    }
    const [giant, ...islands] = components;
    const islandsHtml = islands.map((comp) => {
      const names = comp.map((id) => nodesById.get(id)?.label ?? id).join(", ");
      return `<li><strong>${comp.length === 1 ? "Lone entry" : `Fragment of ${comp.length}`}:</strong> ${names}</li>`;
    }).join("");
    el.innerHTML = `
      <p class="stats-figure">${components.length} components · giant component: ${giant.length} entries</p>
      <ul class="stats-islands">${islandsHtml}</ul>
    `;
  }

  function renderGames(el, nodes, links, nodesById) {
    const games = [...new Set(nodes.map((n) => n.game).filter(Boolean))];
    if (games.length < 2) {
      el.innerHTML = `<p class="stats-empty">Not enough game-origin variety in this dataset to compare.</p>`;
      return;
    }
    const [gameA, gameB] = games;
    const countA = nodes.filter((n) => n.game === gameA).length;
    const countB = nodes.filter((n) => n.game === gameB).length;
    let edgesA = 0, edgesB = 0, cross = 0;
    links.forEach((l) => {
      const g1 = nodesById.get(l.source)?.game;
      const g2 = nodesById.get(l.target)?.game;
      if (g1 === gameA && g2 === gameA) edgesA++;
      else if (g1 === gameB && g2 === gameB) edgesB++;
      else cross++;
    });
    const total = countA + countB;
    el.innerHTML = `
      <div class="stats-game-row">
        <span class="stats-game-name">${gameA}</span>
        <span class="stats-game-bar"><span style="width:${(countA / total) * 100}%"></span></span>
        <span class="stats-game-figure">${countA} nodes · ${edgesA} edges</span>
      </div>
      <div class="stats-game-row">
        <span class="stats-game-name">${gameB}</span>
        <span class="stats-game-bar"><span style="width:${(countB / total) * 100}%"></span></span>
        <span class="stats-game-figure">${countB} nodes · ${edgesB} edges</span>
      </div>
      <p class="stats-cross">${cross} edges cross between the two games.</p>
    `;
  }

  function degreeHistogram(degrees) {
    const counts = new Map();
    for (const d of degrees.values()) counts.set(d, (counts.get(d) || 0) + 1);
    return [...counts.entries()].map(([degree, count]) => ({ degree, count })).sort((a, b) => a.degree - b.degree);
  }

  function renderChart(svgEl, histogram, { log }) {
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const width = 460, height = 260;
    const margin = { top: 12, right: 16, bottom: 34, left: 42 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const data = log ? histogram.filter((d) => d.degree > 0) : histogram;
    if (!data.length) return;

    const x = log
      ? d3.scaleLog().domain([1, d3.max(data, (d) => d.degree)]).range([margin.left, width - margin.right]).nice()
      : d3.scaleLinear().domain([0, d3.max(histogram, (d) => d.degree)]).range([margin.left, width - margin.right]).nice();

    const y = log
      ? d3.scaleLog().domain([1, d3.max(data, (d) => d.count)]).range([height - margin.bottom, margin.top]).nice()
      : d3.scaleLinear().domain([0, d3.max(histogram, (d) => d.count)]).range([height - margin.bottom, margin.top]).nice();

    svg.append("g")
      .attr("class", "stats-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(log ? d3.axisBottom(x).ticks(4, "~s") : d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));

    svg.append("g")
      .attr("class", "stats-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(log ? d3.axisLeft(y).ticks(4, "~s") : d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")));

    if (log) {
      svg.append("g").selectAll("circle").data(data).enter().append("circle")
        .attr("cx", (d) => x(d.degree))
        .attr("cy", (d) => y(d.count))
        .attr("r", 3.5)
        .attr("class", "stats-point");
    } else {
      const barWidth = Math.max(1, (width - margin.left - margin.right) / (d3.max(histogram, (d) => d.degree) + 1) - 1);
      svg.append("g").selectAll("rect").data(data).enter().append("rect")
        .attr("x", (d) => x(d.degree) - barWidth / 2)
        .attr("y", (d) => y(d.count))
        .attr("width", barWidth)
        .attr("height", (d) => (height - margin.bottom) - y(d.count))
        .attr("class", "stats-bar");
    }
  }

  fetch("data.json")
    .then((res) => res.json())
    .then((data) => {
      const nodes = data.nodes;
      const links = data.links;
      const nodesById = new Map(nodes.map((n) => [n.id, n]));
      const adj = buildAdjacency(nodes, links);
      const degrees = new Map([...adj].map(([id, nb]) => [id, nb.size]));

      const N = nodes.length;
      const E = links.length;
      const density = N > 1 ? (2 * E) / (N * (N - 1)) : 0;
      const avgDegree = N ? (2 * E) / N : 0;

      renderStatCards(document.getElementById("stats-cards"), [
        { value: N.toLocaleString("en-US"), label: "Total entries" },
        { value: E.toLocaleString("en-US"), label: "Total connections" },
        { value: pct(density), label: "Network density" },
        { value: fmt(avgDegree, 1), label: "Average connections / entry" },
      ]);

      const ranked = [...degrees.entries()]
        .map(([id, degree]) => ({ id, degree, label: nodesById.get(id)?.label ?? id }))
        .sort((a, b) => b.degree - a.degree);
      renderRankList(document.getElementById("stats-top10"), ranked.slice(0, 10));
      renderRankList(document.getElementById("stats-bottom10"), [...ranked].reverse().slice(0, 10));

      const components = computeComponents(adj);
      renderComponents(document.getElementById("stats-components"), components, nodesById);

      const clustering = computeClustering(adj);
      document.getElementById("stats-clustering").textContent = fmt(clustering, 3);

      const { avgPathLength, diameter } = computePathStats(adj);
      document.getElementById("stats-paths").textContent =
        `${fmt(avgPathLength, 2)} average · ${diameter} diameter`;

      const hub = ranked[0];
      const hubShare = E ? hub.degree / E : 0;
      document.getElementById("stats-hub").innerHTML =
        `${pct(hubShare)} <span class="stats-figure-sub">of all edges touch "${hub.label}"</span>`;

      const neighborAvgDegree = computeFriendshipParadox(adj, degrees);
      document.getElementById("stats-paradox").innerHTML =
        `${fmt(avgDegree, 1)} <span class="stats-figure-sub">vs.</span> ${fmt(neighborAvgDegree, 1)}` +
        `<span class="stats-figure-sub"> — connections' connections average ${fmt(neighborAvgDegree / avgDegree, 1)}× more links</span>`;

      const histogram = degreeHistogram(degrees);
      renderChart(document.getElementById("chart-degree-linear"), histogram, { log: false });
      renderChart(document.getElementById("chart-degree-loglog"), histogram, { log: true });

      renderGames(document.getElementById("stats-games"), nodes, links, nodesById);
    });
})();
