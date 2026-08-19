(() => {
  "use strict";

  const data = window.REPO_ATLAS_DATA;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const toneMap = {
    cyan: { color: "#2455ff", rgb: "36 85 255" },
    green: { color: "#009f6b", rgb: "0 159 107" },
    violet: { color: "#963cff", rgb: "150 60 255" },
    amber: { color: "#ff6b24", rgb: "255 107 36" },
  };
  const kindTone = {
    interface: "cyan", runtime: "cyan", renderer: "green", gateway: "violet", agent: "violet",
    security: "violet", collector: "amber", worker: "amber", adapter: "amber", tool: "amber",
    database: "green", test: "green", operations: "green", contract: "green",
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    activeFlowId: data?.flows?.[0]?.id || null,
    selected: null,
    running: !reducedMotion,
    baseDistance: 0,
    startedAt: performance.now(),
    stepEdgeId: null,
    zoom: { scale: 1, x: 0, y: 0 },
    drag: null,
    copyText: "",
  };
  const elements = {
    stage: $("#atlasStage"), viewport: $("#viewport"), shell: $("#stageShell"), groups: $("#groupLayer"),
    edges: $("#edgeLayer"), nodes: $("#nodeLayer"), particles: $("#particleLayer"), flowList: $("#flowList"),
    inspector: $("#inspector"), inspectorKind: $("#inspectorKind"), inspectorTitle: $("#inspectorTitle"),
    inspectorBody: $("#inspectorBody"), status: $("#mapStatus"), play: $("#playButton"), search: $("#moduleSearch"),
  };
  const nodeElements = new Map();
  const edgeElements = new Map();
  const edgeGeometry = new Map();
  const particleElements = new Map();
  let toastTimer;

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function formatNumber(value) { return Number(value || 0).toLocaleString("zh-CN"); }
  function flowById(id = state.activeFlowId) { return data.flows.find((flow) => flow.id === id); }
  function nodeById(id) { return data.nodes.find((node) => node.id === id); }
  function edgeById(id) { return data.edges.find((edge) => edge.id === id); }
  function tone(name) { return toneMap[name] || toneMap.cyan; }
  function cssTone(element, name) {
    const value = tone(name);
    element.style.setProperty("--flow-color", value.color);
    element.style.setProperty("--flow-rgb", value.rgb);
  }

  function nodeSize(node) {
    const lines = Math.max(1, node.metrics?.lines || 1);
    const files = Math.max(1, node.metrics?.files || 1);
    const averageLines = lines / files;
    const form = node.kind === "renderer" ? "plate"
      : files >= 10 || (files >= 5 && averageLines < 180) ? "array"
      : files >= 3 ? "stack"
      : averageLines > 640 ? "monolith" : "block";
    const baseWidth = 104 + Math.sqrt(lines) * 1.15 + Math.log2(files + 1) * 8;
    const width = form === "plate" ? clamp(baseWidth * 1.24, 168, 220)
      : form === "array" ? clamp(baseWidth * 1.12, 158, 220)
      : clamp(baseWidth, 126, 194);
    const depth = form === "plate" ? 78
      : form === "array" ? clamp(48 + Math.log2(files + 1) * 6, 62, 82)
      : clamp(42 + Math.log2(files + 1) * 7, 48, 74);
    const elevation = form === "plate" ? 24
      : form === "monolith" ? clamp(54 + Math.log2(averageLines + 1) * 3.6, 76, 98)
      : form === "stack" ? clamp(30 + Math.ceil(Math.log2(files + 1)) * 9, 48, 78)
      : form === "array" ? clamp(30 + Math.log2(averageLines + 1) * 2.8, 44, 66)
      : clamp(26 + Math.log2(averageLines + 1) * 3.2, 38, 66);
    return {
      form,
      width: Math.round(width),
      depth: Math.round(depth),
      elevation: Math.round(elevation),
      layers: form === "stack" ? Math.round(clamp(Math.ceil(Math.log2(files + 1)), 2, 5)) : 1,
      fileDivisions: form === "array" ? Math.round(clamp(Math.ceil(Math.log2(files + 1)) + 1, 3, 7)) : 1,
    };
  }

  function nodeGeometry(node) {
    const size = nodeSize(node);
    const height = size.depth + size.elevation;
    return {
      ...size,
      height,
      x: node.x,
      y: node.y,
      cx: node.x + size.width / 2,
      cy: node.y + size.depth / 2 + size.elevation,
      baseY: node.y + height,
    };
  }

  function edgePath(edge) {
    const from = nodeGeometry(nodeById(edge.from));
    const to = nodeGeometry(nodeById(edge.to));
    const hash = [...edge.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    const start = { x: from.cx, y: from.cy + 8 };
    const end = { x: to.cx, y: to.cy + 8 };
    const toGround = ({ x, y }) => ({ u: (x + 2 * y) / 2, v: (2 * y - x) / 2 });
    const fromGround = ({ u, v }) => ({ x: u - v, y: (u + v) / 2 });
    const first = toGround(start);
    const last = toGround(end);
    const laneOffset = (hash % 5 - 2) * 12;
    const lane = (first.u + last.u) / 2 + laneOffset;
    const elbowA = fromGround({ u: lane, v: first.v });
    const elbowB = fromGround({ u: lane, v: last.v });
    return `M ${start.x} ${start.y} L ${elbowA.x} ${elbowA.y} L ${elbowB.x} ${elbowB.y} L ${end.x} ${end.y}`;
  }

  function renderGroups() {
    for (const group of data.groups) {
      const container = svgElement("g");
      container.style.setProperty("--group-color", tone(group.tone).color);
      const slant = Math.min(72, group.height * .2);
      const points = `${group.x + slant} ${group.y} ${group.x + group.width} ${group.y} ${group.x + group.width - slant} ${group.y + group.height} ${group.x} ${group.y + group.height}`;
      container.append(svgElement("polygon", { class: "group-zone", points }));
      const label = svgElement("text", { class: "group-label", x: group.x + slant + 12, y: group.y + 19 });
      label.textContent = group.label;
      const name = svgElement("text", { class: "group-name", x: group.x + group.width - 12, y: group.y + 19, "text-anchor": "end" });
      name.textContent = group.name;
      container.append(label, name);
      elements.groups.append(container);
    }
  }

  function renderEdges() {
    for (const edge of data.edges) {
      const path = svgElement("path", { class: "edge-path", d: edgePath(edge), "data-edge": edge.id });
      const label = svgElement("text", { class: "edge-label", "text-anchor": "middle" });
      const labelPath = svgElement("textPath", { href: `#edge-${edge.id}`, startOffset: "50%" });
      path.id = `edge-${edge.id}`;
      labelPath.textContent = edge.label;
      label.append(labelPath);
      elements.edges.append(path, label);
      edgeElements.set(edge.id, path);
    }
  }

  function renderNodes() {
    const orderedNodes = [...data.nodes].sort((first, second) => nodeGeometry(first).baseY - nodeGeometry(second).baseY);
    for (const node of orderedNodes) {
      const geometry = nodeGeometry(node);
      const nodeTone = tone(kindTone[node.kind]);
      const group = svgElement("g", {
        class: `node node--${geometry.form}`,
        transform: `translate(${node.x} ${node.y})`,
        tabindex: "0",
        role: "button",
        "aria-label": `${node.label}，${node.role}，${node.metrics.files} 个文件，${node.metrics.lines} 行`,
        "data-node": node.id,
      });
      group.style.setProperty("--node-accent", nodeTone.color);
      const halfWidth = geometry.width / 2;
      const halfDepth = geometry.depth / 2;
      const topPoints = `0 ${halfDepth} ${halfWidth} 0 ${geometry.width} ${halfDepth} ${halfWidth} ${geometry.depth}`;
      const leftPoints = `0 ${halfDepth} ${halfWidth} ${geometry.depth} ${halfWidth} ${geometry.baseY - node.y} 0 ${halfDepth + geometry.elevation}`;
      const rightPoints = `${halfWidth} ${geometry.depth} ${geometry.width} ${halfDepth} ${geometry.width} ${halfDepth + geometry.elevation} ${halfWidth} ${geometry.baseY - node.y}`;
      const shadow = svgElement("polygon", {
        class: "node-shadow",
        points: `8 ${halfDepth + geometry.elevation + 8} ${halfWidth + 8} ${geometry.depth + geometry.elevation + 8} ${geometry.width + 8} ${halfDepth + geometry.elevation + 8} ${halfWidth + 8} ${geometry.elevation + 8}`,
      });
      const leftFace = svgElement("polygon", { class: "node-face node-face-left", points: leftPoints });
      const rightFace = svgElement("polygon", { class: "node-face node-face-right", points: rightPoints });
      const top = svgElement("polygon", { class: "node-top", points: topPoints });
      const flowPlane = svgElement("polygon", { class: "node-flow-plane", points: topPoints });
      const cap = svgElement("path", { class: "node-cap", d: `M 0 ${halfDepth} L ${halfWidth} 0 L ${halfWidth + 9} ${4.5} L 9 ${halfDepth + 4.5} Z` });

      const stackLines = [];
      for (let layer = 1; layer < geometry.layers; layer += 1) {
        const offset = geometry.elevation * layer / geometry.layers;
        stackLines.push(svgElement("path", {
          class: "node-stack-line",
          d: `M 0 ${halfDepth + offset} L ${halfWidth} ${geometry.depth + offset} L ${geometry.width} ${halfDepth + offset}`,
        }));
      }

      const fileLines = [];
      for (let division = 1; division < geometry.fileDivisions; division += 1) {
        const progress = division / geometry.fileDivisions;
        const startX = halfWidth * progress;
        const startY = halfDepth * (1 - progress);
        const endX = halfWidth + halfWidth * progress;
        const endY = geometry.depth - halfDepth * progress;
        const path = `M ${startX} ${startY} L ${endX} ${endY} L ${endX} ${endY + geometry.elevation}`;
        fileLines.push(svgElement("path", { class: "node-array-gap", d: path }));
        fileLines.push(svgElement("path", { class: "node-file-line", d: path }));
      }

      const plaqueWidth = Math.round(clamp(node.label.length * 6.4 + 22, 82, geometry.width + 26));
      const plaque = svgElement("rect", { class: "node-plaque", x: 0, y: -32, width: plaqueWidth, height: 22 });
      const title = svgElement("text", { class: "node-title", x: 8, y: -18 });
      title.textContent = node.label;
      const role = svgElement("text", { class: "node-role", x: 0, y: -3 });
      role.textContent = `${node.metrics.files} FILES · ${formatNumber(node.metrics.lines)} LINES`;
      const metric = svgElement("text", { class: "node-metric", x: halfWidth + 8, y: geometry.depth + geometry.elevation - 9 });
      metric.textContent = node.kind.toUpperCase();
      const codeMark = svgElement("text", { class: "node-code-mark", x: halfWidth, y: halfDepth + 3, "text-anchor": "middle" });
      codeMark.textContent = `${geometry.form.toUpperCase()}::${String(node.metrics.files).padStart(2, "0")}`;
      const asciiLayer = renderAsciiSurface(node, geometry);
      const portIn = svgElement("circle", { class: "node-port", cx: 0, cy: halfDepth + geometry.elevation, r: 3.5 });
      const portOut = svgElement("circle", { class: "node-port", cx: geometry.width, cy: halfDepth + geometry.elevation, r: 3.5 });
      group.append(shadow, leftFace, rightFace, top, flowPlane, cap, ...stackLines, ...fileLines, asciiLayer, codeMark, plaque, title, role, metric, portIn, portOut);
      group.addEventListener("click", (event) => { event.stopPropagation(); selectNode(node.id); });
      group.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectNode(node.id); }
      });
      elements.nodes.append(group);
      nodeElements.set(node.id, group);
    }
  }

  function renderAsciiSurface(node, geometry) {
    const layer = svgElement("g", { class: "node-ascii-layer", "aria-hidden": "true" });
    const seed = [...node.id].reduce((total, character) => (total * 33 + character.charCodeAt(0)) >>> 0, 2166136261);
    const random = seededRandom(seed);
    const glyphs = ["·", ":", "+", "0", "1", "∷"];
    const density = Math.round(clamp(Math.log2(node.metrics.lines + 1) * 1.8 + node.metrics.files * .4, 10, 34));
    const halfWidth = geometry.width / 2;
    const halfDepth = geometry.depth / 2;
    for (let index = 0; index < density; index += 1) {
      const u = .09 + random() * .82;
      const v = .09 + random() * .82;
      const glyph = svgElement("text", {
        class: "node-ascii node-ascii-top",
        x: halfWidth + (u - v) * halfWidth,
        y: (u + v) * halfDepth + 1.5,
        "text-anchor": "middle",
      });
      glyph.textContent = glyphs[(index + node.metrics.files) % glyphs.length];
      layer.append(glyph);
    }
    for (let index = 0; index < Math.ceil(density * .55); index += 1) {
      const u = .08 + random() * .84;
      const v = .1 + random() * .8;
      const onRight = index % 2 === 0;
      const glyph = svgElement("text", {
        class: "node-ascii node-ascii-side",
        x: onRight ? halfWidth + u * halfWidth : u * halfWidth,
        y: onRight ? geometry.depth - u * halfDepth + v * geometry.elevation : halfDepth + u * halfDepth + v * geometry.elevation,
        "text-anchor": "middle",
      });
      glyph.textContent = glyphs[(index * 2 + node.metrics.lines) % glyphs.length];
      layer.append(glyph);
    }
    return layer;
  }

  function renderFlowList() {
    elements.flowList.replaceChildren();
    data.flows.forEach((flow, index) => {
      const button = document.createElement("button");
      button.className = "flow-button";
      button.type = "button";
      button.dataset.flow = flow.id;
      button.innerHTML = `<span class="flow-index">${String(index + 1).padStart(2, "0")}</span><span class="flow-copy"><strong></strong><small></small><span class="flow-count"><i></i>${flow.payloads.length} payloads / ${flow.edges.length} hops</span></span>`;
      $("strong", button).textContent = flow.label;
      $("small", button).textContent = flow.short;
      cssTone(button, flow.color);
      button.addEventListener("click", () => selectFlow(flow.id, true));
      elements.flowList.append(button);
    });
  }

  function renderParticles() {
    elements.particles.replaceChildren();
    particleElements.clear();
    const flow = flowById();
    if (!flow) return;
    flow.payloads.forEach((payload) => {
      const particle = svgElement("g", { class: "particle", role: "button", tabindex: "0", "aria-label": `检查数据片段 ${payload.label}` });
      cssTone(particle, flow.color);
      particle.append(
        svgElement("path", { class: "particle-tail", d: "M -16 0 H -5" }),
        svgElement("circle", { class: "particle-ring", r: 8 }),
        svgElement("circle", { class: "particle-dot", r: 4.5 }),
        svgElement("circle", { class: "particle-hit", r: window.innerWidth <= 540 ? 42 : 24 }),
      );
      particle.addEventListener("pointerdown", (event) => event.stopPropagation());
      particle.addEventListener("click", (event) => { event.stopPropagation(); selectPayload(payload.id); });
      particle.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); selectPayload(payload.id); }
      });
      elements.particles.append(particle);
      particleElements.set(payload.id, particle);
    });
  }

  function updateFlowState() {
    const flow = flowById();
    if (!flow) return;
    document.querySelectorAll(".flow-button").forEach((button) => button.classList.toggle("active", button.dataset.flow === flow.id));
    const activeEdges = new Set(flow.edges);
    const activeNodes = new Set();
    flow.edges.forEach((id) => {
      const edge = edgeById(id);
      if (edge) { activeNodes.add(edge.from); activeNodes.add(edge.to); }
    });
    edgeElements.forEach((element, id) => {
      element.classList.toggle("active", activeEdges.has(id));
      element.classList.toggle("dimmed", !activeEdges.has(id));
      element.classList.toggle("step-active", id === state.stepEdgeId);
      cssTone(element, flow.color);
      const label = element.nextElementSibling;
      if (label) cssTone(label, flow.color);
    });
    nodeElements.forEach((element, id) => {
      element.classList.toggle("flow-active", activeNodes.has(id));
      element.classList.toggle("dimmed", !activeNodes.has(id));
      cssTone(element, flow.color);
    });
    elements.status.textContent = `${flow.label} · ${state.running ? "实时播放" : state.stepEdgeId ? `停在 ${edgeById(state.stepEdgeId)?.label || "当前步骤"}` : "已暂停"}`;
  }

  function selectFlow(id, showInspector = false) {
    state.activeFlowId = id;
    state.baseDistance = 0;
    state.startedAt = performance.now();
    state.stepEdgeId = null;
    state.selected = { type: "flow", id };
    renderParticles();
    updateFlowState();
    renderInspector();
    if (showInspector && window.innerWidth <= 1080) elements.inspector.classList.add("open");
  }

  function selectNode(id) {
    state.selected = { type: "node", id };
    state.stepEdgeId = null;
    nodeElements.forEach((element, nodeId) => element.classList.toggle("selected", nodeId === id));
    particleElements.forEach((element) => element.classList.remove("selected"));
    renderInspector();
    elements.inspector.classList.add("open");
  }

  function pauseFlow() {
    if (!state.running) return;
    state.baseDistance = currentDistance();
    state.running = false;
    updatePlayButton();
  }

  function selectPayload(id) {
    pauseFlow();
    state.selected = { type: "payload", id };
    particleElements.forEach((element, payloadId) => element.classList.toggle("selected", payloadId === id));
    nodeElements.forEach((element) => element.classList.remove("selected"));
    renderInspector();
    elements.inspector.classList.add("open");
  }

  function fileListMarkup(files) {
    if (!files.length) return "<p class=\"detail-lede\">这个节点尚未匹配到源文件。</p>";
    return `<ul class="file-list">${files.map((file) => `<li><button type="button" data-copy-path="${encodeURIComponent(file.path)}"><span></span><small>${formatNumber(file.lines)}L</small></button></li>`).join("")}</ul>`;
  }

  function bindInspectorActions() {
    elements.inspectorBody.querySelectorAll("[data-copy-path]").forEach((button) => {
      const path = decodeURIComponent(button.dataset.copyPath);
      $("span", button).textContent = path;
      button.addEventListener("click", () => copyText(path, "已复制文件路径"));
    });
    elements.inspectorBody.querySelectorAll("[data-payload]").forEach((button) => {
      const id = button.dataset.payload;
      const payload = flowById()?.payloads.find((item) => item.id === id);
      if (payload) button.textContent = `${payload.label} · ${payload.type}`;
      button.addEventListener("click", () => selectPayload(id));
    });
  }

  function renderInspector() {
    const selection = state.selected || { type: "flow", id: state.activeFlowId };
    const flow = flowById();
    if (selection.type === "node") {
      const node = nodeById(selection.id);
      elements.inspectorKind.textContent = `MODULE / ${node.kind.toUpperCase()}`;
      elements.inspectorTitle.textContent = node.label;
      elements.inspectorBody.innerHTML = `
        <p class="detail-lede">${node.whatItDoes}</p>
        <span class="detail-role">${node.role}</span>
        <section class="detail-section"><h3>MEASURED</h3><div class="detail-metrics"><div><span>FILES</span><b>${node.metrics.files}</b></div><div><span>LINES</span><b>${formatNumber(node.metrics.lines)}</b></div><div><span>BYTES</span><b>${formatNumber(node.metrics.bytes)}</b></div></div></section>
        <section class="detail-section"><h3>HOW IT IS BUILT</h3><p>${node.howItsBuilt}</p></section>
        <section class="detail-section"><h3>REAL FILES</h3>${fileListMarkup(node.files)}</section>`;
      state.copyText = `请结合 ${data.meta.repository} 仓库解释「${node.label}」模块。\n\n职责：${node.whatItDoes}\n实现：${node.howItsBuilt}\n真实文件：\n${node.files.map((file) => `- ${file.path} (${file.lines} 行)`).join("\n")}\n\n请先追踪这些文件之间的调用，再回答我的问题。`;
    } else if (selection.type === "payload") {
      const payload = flow.payloads.find((item) => item.id === selection.id);
      elements.inspectorKind.textContent = `PAYLOAD / ${payload.type.toUpperCase()}`;
      elements.inspectorTitle.textContent = payload.label;
      elements.inspectorBody.innerHTML = `
        <p class="detail-lede">${payload.preview}</p>
        <span class="detail-role">${flow.label}</span>
        <section class="detail-section"><h3>DATA SNIPPET</h3><pre class="payload-code"></pre></section>
        <div class="payload-route"><span>${payload.source}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-5-5 5 5-5 5" /></svg><span>${payload.destination}</span></div>
        <section class="detail-section"><h3>WHY THIS MOVES</h3><p>这个光点对应「${flow.label}」中的真实数据形状；路径只使用配置中有源码证据的调用边。</p></section>`;
      $(".payload-code", elements.inspectorBody).textContent = payload.body;
      state.copyText = `我正在追踪 ${data.meta.repository} 的「${flow.label}」流程。请解释数据片段 ${payload.label} 如何从 ${payload.source} 到达 ${payload.destination}。\n\n${payload.body}\n\n相关调用边：\n${flow.edges.map((id) => { const edge = edgeById(id); return `- ${edge.label}: ${edge.evidence.join(", ")}`; }).join("\n")}`;
    } else {
      const index = data.flows.findIndex((item) => item.id === flow.id) + 1;
      elements.inspectorKind.textContent = `FLOW / ${String(index).padStart(2, "0")}`;
      elements.inspectorTitle.textContent = flow.label;
      elements.inspectorBody.innerHTML = `
        <p class="detail-lede">${flow.short}</p>
        <section class="detail-section"><h3>REAL CALL PATH</h3><ol class="route-list">${flow.edges.map((id) => { const edge = edgeById(id); return `<li>${edge.label}<small>${nodeById(edge.from).label} → ${nodeById(edge.to).label}</small></li>`; }).join("")}</ol></section>
        <section class="detail-section"><h3>INSPECTABLE PAYLOADS</h3><ul class="payload-list">${flow.payloads.map((payload) => `<li><button type="button" data-payload="${payload.id}"></button></li>`).join("")}</ul></section>
        <section class="detail-section"><h3>SOURCE EVIDENCE</h3><p>${[...new Set(flow.edges.flatMap((id) => edgeById(id).evidence))].join(" · ")}</p></section>`;
      state.copyText = `请沿着 ${data.meta.repository} 的「${flow.label}」真实调用路径和我讨论代码：\n${flow.edges.map((id, edgeIndex) => { const edge = edgeById(id); return `${edgeIndex + 1}. ${nodeById(edge.from).label} → ${nodeById(edge.to).label}：${edge.label}（${edge.evidence.join(", ")}）`; }).join("\n")}\n\n先说明每一步传递的数据与失败边界，再回答我的问题。`;
    }
    bindInspectorActions();
  }

  function rebuildEdgeGeometry() {
    edgeGeometry.clear();
    edgeElements.forEach((path, id) => edgeGeometry.set(id, { path, length: path.getTotalLength() }));
  }

  function activeRoute() {
    const flow = flowById();
    const segments = flow.edges.map((id) => ({ id, ...edgeGeometry.get(id) })).filter((segment) => segment.path);
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    return { segments, total };
  }

  function currentDistance(timestamp = performance.now()) {
    const { total } = activeRoute();
    if (!total) return 0;
    return (state.baseDistance + (state.running ? (timestamp - state.startedAt) * .055 : 0)) % total;
  }

  function positionParticles(timestamp) {
    const flow = flowById();
    const route = activeRoute();
    if (!flow || !route.total) return;
    const mainDistance = currentDistance(timestamp);
    flow.payloads.forEach((payload, index) => {
      const offset = route.total * index / Math.max(1, flow.payloads.length) * .54;
      let target = (mainDistance + offset) % route.total;
      let segment = route.segments[0];
      let before = 0;
      for (const candidate of route.segments) {
        if (target <= before + candidate.length) { segment = candidate; break; }
        before += candidate.length;
      }
      const point = segment.path.getPointAtLength(clamp(target - before, 0, segment.length));
      particleElements.get(payload.id)?.setAttribute("transform", `translate(${point.x} ${point.y})`);
    });
  }

  function seededRandom(seed = 24051991) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function animate(timestamp) {
    positionParticles(timestamp);
    if (!reducedMotion) requestAnimationFrame(animate);
  }

  function updatePlayButton() {
    elements.play.setAttribute("aria-pressed", String(state.running));
    const text = $("span", elements.play);
    if (state.running) {
      text.textContent = "暂停数据流";
      elements.play.setAttribute("aria-label", "暂停数据流");
      elements.play.querySelector("path").setAttribute("d", "M8 7v10M16 7v10");
    } else {
      text.textContent = "继续数据流";
      elements.play.setAttribute("aria-label", "继续数据流");
      elements.play.querySelector("path").setAttribute("d", "m9 7 8 5-8 5z");
    }
    updateFlowState();
  }

  function togglePlay() {
    if (state.running) pauseFlow();
    else {
      state.running = true;
      state.startedAt = performance.now();
      state.stepEdgeId = null;
      updatePlayButton();
    }
  }

  function traceStep() {
    pauseFlow();
    const route = activeRoute();
    if (!route.segments.length) return;
    const currentIndex = Math.max(-1, route.segments.findIndex((segment) => segment.id === state.stepEdgeId));
    const nextIndex = (currentIndex + 1) % route.segments.length;
    const before = route.segments.slice(0, nextIndex).reduce((sum, segment) => sum + segment.length, 0);
    state.stepEdgeId = route.segments[nextIndex].id;
    state.baseDistance = before + route.segments[nextIndex].length * .55;
    positionParticles(performance.now());
    updateFlowState();
  }

  function updateViewport() {
    const { scale, x, y } = state.zoom;
    elements.viewport.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
    $("#zoomReadout").textContent = `${Math.round(scale * 100)}%`;
  }

  function resetView() {
    state.zoom = { scale: 1, x: 0, y: 0 };
    updateViewport();
  }

  function viewPoint(event) {
    const bounds = elements.stage.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * 1320 / bounds.width, y: (event.clientY - bounds.top) * 760 / bounds.height };
  }

  function bindStageControls() {
    elements.shell.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = viewPoint(event);
      const nextScale = clamp(state.zoom.scale * (event.deltaY > 0 ? .9 : 1.1), .58, 2.2);
      const ratio = nextScale / state.zoom.scale;
      state.zoom.x = point.x - (point.x - state.zoom.x) * ratio;
      state.zoom.y = point.y - (point.y - state.zoom.y) * ratio;
      state.zoom.scale = nextScale;
      updateViewport();
    }, { passive: false });
    elements.shell.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".node, .particle")) return;
      elements.shell.setPointerCapture(event.pointerId);
      state.drag = { pointerId: event.pointerId, point: viewPoint(event), startX: state.zoom.x, startY: state.zoom.y };
      elements.shell.classList.add("dragging");
    });
    elements.shell.addEventListener("pointermove", (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) return;
      const point = viewPoint(event);
      state.zoom.x = state.drag.startX + point.x - state.drag.point.x;
      state.zoom.y = state.drag.startY + point.y - state.drag.point.y;
      updateViewport();
    });
    const stopDrag = (event) => {
      if (state.drag?.pointerId !== event.pointerId) return;
      state.drag = null;
      elements.shell.classList.remove("dragging");
    };
    elements.shell.addEventListener("pointerup", stopDrag);
    elements.shell.addEventListener("pointercancel", stopDrag);
    elements.stage.addEventListener("click", () => {
      state.selected = { type: "flow", id: state.activeFlowId };
      nodeElements.forEach((element) => element.classList.remove("selected"));
      particleElements.forEach((element) => element.classList.remove("selected"));
      renderInspector();
    });
  }

  function searchNodes(query) {
    const normalized = query.trim().toLowerCase();
    const matches = [];
    for (const node of data.nodes) {
      const haystack = [node.label, node.role, node.whatItDoes, node.howItsBuilt, ...node.files.map((file) => file.path)].join(" ").toLowerCase();
      const isMatch = !normalized || haystack.includes(normalized);
      nodeElements.get(node.id).classList.toggle("search-match", Boolean(normalized && isMatch));
      nodeElements.get(node.id).classList.toggle("search-dim", Boolean(normalized && !isMatch));
      if (normalized && isMatch) matches.push(node.id);
    }
    elements.status.textContent = normalized ? `${matches.length} 个模块匹配「${query.trim()}」` : `${flowById().label} · ${state.running ? "实时播放" : "已暂停"}`;
    return matches;
  }

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(message);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast(message);
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function renderMeta() {
    document.title = `${data.meta.product} · ${data.meta.title}`;
    $("#stageTitle").textContent = `${data.meta.repository} 代码库架构图`;
    $("#hostLinkLabel").textContent = `返回 ${data.meta.hostLabel || "工作台"}`;
    $("#metricFiles").textContent = formatNumber(data.meta.totals.files);
    $("#metricLines").textContent = formatNumber(data.meta.totals.lines);
    $("#metricCoverage").textContent = `${data.meta.coverage}%`;
    $("#metricFingerprint").textContent = data.meta.fingerprint;
    const generated = new Date(data.meta.generatedAt);
    $("#generatedAt").textContent = `GENERATED ${Number.isNaN(generated.getTime()) ? "—" : generated.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }

  function bindControls() {
    elements.play.addEventListener("click", togglePlay);
    $("#stepButton").addEventListener("click", traceStep);
    $("#resetButton").addEventListener("click", resetView);
    $("#inspectorClose").addEventListener("click", () => elements.inspector.classList.remove("open"));
    $("#copyContextButton").addEventListener("click", () => copyText(state.copyText, "已复制讨论上下文，可直接粘贴给 Codex 或 Claude"));
    elements.search.addEventListener("input", (event) => searchNodes(event.target.value));
    elements.search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const first = searchNodes(event.currentTarget.value)[0];
        if (first) { event.preventDefault(); selectNode(first); nodeElements.get(first).focus(); }
      }
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        elements.search.focus();
      }
      if (event.key === "Escape") {
        elements.inspector.classList.remove("open");
        elements.search.value = "";
        searchNodes("");
      }
    });
  }

  function showLoadError(message) {
    elements.status.textContent = message;
    elements.status.parentElement.classList.add("error");
    elements.inspectorTitle.textContent = "仓库模型不可用";
    elements.inspectorBody.innerHTML = "<p class=\"detail-lede\">先运行 <code>pnpm atlas:sync</code> 生成 data.generated.js。</p>";
  }

  function init() {
    if (!data?.nodes?.length || !data?.flows?.length) {
      showLoadError("未找到可用的仓库模型");
      return;
    }
    renderMeta();
    renderGroups();
    renderEdges();
    renderNodes();
    renderFlowList();
    rebuildEdgeGeometry();
    selectFlow(state.activeFlowId);
    bindStageControls();
    bindControls();
    updatePlayButton();
    requestAnimationFrame(animate);
  }

  init();
})();
