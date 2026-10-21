/**
 * canvas.js - Интерактивный редактор холста блок-схем.
 * Поддерживает Undo/Redo (Ctrl+Z), выделение и редактирование узлов и стрелок.
 */

class FlowchartCanvas {
  constructor(svgElement, options = {}) {
    this.svg = svgElement;
    this.viewport = svgElement.querySelector("#viewport-group");
    this.nodesLayer = svgElement.querySelector("#nodes-layer");
    this.edgesLayer = svgElement.querySelector("#edges-layer");
    this.handlesLayer = svgElement.querySelector("#handles-layer") || this.edgesLayer;

    this.nodes = [];
    this.edges = [];

    // Выделение
    this.selectedNodeId = null;
    this.selectedEdgeIndex = null;

    this.activeTool = "select"; // 'select', 'connect', 'delete'
    this.connectSourceId = null;

    // Viewport трансформации (pan & zoom)
    this.scale = 1.0;
    this.panX = 100;
    this.panY = 60;
    this.isPanning = false;
    this.startPan = { x: 0, y: 0 };

    // Dragging узлов
    this.draggedNode = null;
    this.dragOffset = { x: 0, y: 0 };
    this.dragStartedPos = null;

    // Dragging точек стрелок (изломов и портов)
    this.draggedWaypoint = null;
    this.draggedPort = null;

    // Стек истории (Undo / Redo)
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    // Callbacks
    this.onSelectNode = options.onSelectNode || (() => {});
    this.onSelectEdge = options.onSelectEdge || (() => {});
    this.onChange = options.onChange || (() => {});

    this.initEvents();
    this.updateViewportTransform();
  }

  // Сохранение снимка состояния для Ctrl+Z
  pushState() {
    // Если мы отменяли и делаем новое действие, отсекаем ветку вперед
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    const snapshot = JSON.stringify({
      nodes: this.nodes,
      edges: this.edges
    });

    // Избегаем дублирования идентичных состояний
    if (this.history.length > 0 && this.history[this.historyIndex] === snapshot) {
      return;
    }

    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }

    this.onChange();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const snapshot = JSON.parse(this.history[this.historyIndex]);
      this.nodes = snapshot.nodes || [];
      this.edges = snapshot.edges || [];
      this.selectedNodeId = null;
      this.selectedEdgeIndex = null;
      this.onSelectNode(null);
      this.onSelectEdge(null, null);
      this.render();
      this.onChange();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const snapshot = JSON.parse(this.history[this.historyIndex]);
      this.nodes = snapshot.nodes || [];
      this.edges = snapshot.edges || [];
      this.selectedNodeId = null;
      this.selectedEdgeIndex = null;
      this.onSelectNode(null);
      this.onSelectEdge(null, null);
      this.render();
      this.onChange();
    }
  }

  setData(model, recordHistory = true) {
    this.nodes = (model.nodes || []).map(n => ({
      id: String(n.id || ""),
      type: String(n.type || "process"),
      text: String(n.text || ""),
      x: Number.isFinite(Number(n.x)) ? Number(n.x) : 100,
      y: Number.isFinite(Number(n.y)) ? Number(n.y) : 100,
      width: Number.isFinite(Number(n.width)) && Number(n.width) > 0 ? Number(n.width) : 150,
      height: Number.isFinite(Number(n.height)) && Number(n.height) > 0 ? Number(n.height) : 55
    }));

    this.edges = (model.edges || []).map(e => ({
      from: String(e.from || ""),
      to: String(e.to || ""),
      label: String(e.label || ""),
      fromPort: e.fromPort || null,
      toPort: e.toPort || null,
      waypoints: Array.isArray(e.waypoints)
        ? e.waypoints
            .filter(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
            .map(p => ({ x: Number(p.x), y: Number(p.y) }))
        : []
    }));

    this.selectedNodeId = null;
    this.selectedEdgeIndex = null;
    this.onSelectNode(null);
    this.onSelectEdge(null, null);

    if (recordHistory) {
      this.pushState();
    }
    this.render();
  }

  // Расчет всех точек полилинии стрелки (порты + кастомные изломы)
  getEdgePoints(edge) {
    const fromNode = this.nodes.find(n => n.id === edge.from);
    const toNode = this.nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return [];

    const fromPorts = GostShapes.getPorts(fromNode.x, fromNode.y, fromNode.width, fromNode.height);
    const toPorts = GostShapes.getPorts(toNode.x, toNode.y, toNode.width, toNode.height);

    let p1 = fromPorts.s;
    let p2 = toPorts.n;

    if (edge.fromPort && fromPorts[edge.fromPort]) p1 = fromPorts[edge.fromPort];
    if (edge.toPort && toPorts[edge.toPort]) p2 = toPorts[edge.toPort];

    if (!edge.fromPort && !edge.toPort && toNode.y < fromNode.y) {
      p1 = fromPorts.w;
      p2 = toPorts.w;
    }

    if (edge.waypoints && edge.waypoints.length > 0) {
      return [p1, ...edge.waypoints, p2];
    }
    return GostShapes.getOrthoPoints(p1, p2);
  }

  // Генерация чистого автономного SVG со всеми узлами и стрелками в текущих координатах пользователя
  getExportSvg() {
    if (this.nodes.length === 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="200" y="100" text-anchor="middle">Пустая схема</text></svg>`;
    }

    const padding = 50;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 150));
      maxY = Math.max(maxY, n.y + (n.height || 55));
    });

    // Учитываем возможные обходные линии и кастомные изломы
    this.edges.forEach(edge => {
      if (edge.waypoints) {
        edge.waypoints.forEach(wp => {
          minX = Math.min(minX, wp.x);
          minY = Math.min(minY, wp.y);
          maxX = Math.max(maxX, wp.x);
          maxY = Math.max(maxY, wp.y);
        });
      }
    });

    const extraMargin = 50;
    const originX = Math.round(minX - padding - extraMargin);
    const originY = Math.round(minY - padding);
    const totalW = Math.round((maxX - minX) + (padding * 2) + extraMargin * 2);
    const totalH = Math.round((maxY - minY) + (padding * 2));

    let edgesSvg = "";
    this.edges.forEach(edge => {
      const pts = this.getEdgePoints(edge);
      if (pts.length < 2) return;

      const pathData = GostShapes.pointsToSvgPath(pts);
      edgesSvg += `<path d="${pathData}" class="edge-line" fill="none" stroke="#000000" stroke-width="1.5" marker-end="url(#arrowhead)" />\n`;

      if (edge.label) {
        const escapedLabel = String(edge.label)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        const midSegIdx = Math.floor((pts.length - 1) / 2);
        const pA = pts[midSegIdx];
        const pB = pts[midSegIdx + 1] || pA;
        const midX = Math.round((pA.x + pB.x) / 2 + 10);
        const midY = Math.round((pA.y + pB.y) / 2 - 6);
        const labelW = Math.max(36, String(escapedLabel).length * 8 + 14);
        edgesSvg += `
          <rect x="${midX - labelW / 2}" y="${midY - 11}" width="${labelW}" height="16" rx="3" class="edge-label-bg" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
          <text x="${midX}" y="${midY + 1}" text-anchor="middle" font-family="'Liberation Sans', 'DejaVu Sans', Arial, sans-serif" font-size="11px" fill="#000000">${escapedLabel}</text>
        `;
      }
    });

    let nodesSvg = "";
    this.nodes.forEach(node => {
      const shape = GostShapes.renderShapeSvg(node);
      const text = GostShapes.renderTextSvg(node);
      nodesSvg += `<g class="gost-node-export">${shape}${text}</g>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}pt" height="${totalH}pt" viewBox="${originX} ${originY} ${totalW} ${totalH}">
  <defs>
    <marker id="arrowhead" markerWidth="9" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 9 3, 0 6" fill="#000000" />
    </marker>
  </defs>
  <style>
    rect.canvas-bg { fill: #ffffff; }
    .gost-node-export rect, .gost-node-export polygon, .gost-node-export circle, .gost-node-export path { fill: #ffffff !important; stroke: #000000 !important; stroke-width: 1.5px !important; }
    .edge-line { fill: none !important; stroke: #000000 !important; stroke-width: 1.5px !important; }
    .edge-label-bg { fill: #ffffff !important; }
    text { font-family: 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif !important; fill: #000000 !important; }
  </style>
  <rect class="canvas-bg" x="${originX}" y="${originY}" width="${totalW}" height="${totalH}" fill="#ffffff" />
  <g>
    ${edgesSvg}
    ${nodesSvg}
  </g>
</svg>`;
  }

  getData() {
    return {
      nodes: this.nodes,
      edges: this.edges
    };
  }

  setTool(tool) {
    this.activeTool = tool;
    this.connectSourceId = null;
    this.render();
  }

  addNode(type, text = "Новый блок", x = 200, y = 200) {
    const id = "node_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const defaultTexts = {
      terminator: "Начало",
      process: "Действие = 0",
      decision: "Условие ?",
      io: "Ввод X",
      subroutine: "Подпрограмма()",
      document: "Печать отчета",
      database: "База данных",
      preparation: "i = 0, n, 1",
      connector: "1"
    };

    const node = {
      id,
      type,
      text: text || defaultTexts[type] || "Операция",
      x,
      y,
      width: type === "connector" ? 36 : 150,
      height: type === "connector" ? 36 : 55
    };

    this.nodes.push(node);
    this.selectNode(id);
    this.pushState();
    this.render();
    return node;
  }

  deleteSelected() {
    if (this.selectedNodeId) {
      const id = this.selectedNodeId;
      this.nodes = this.nodes.filter(n => n.id !== id);
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      this.selectedNodeId = null;
      this.onSelectNode(null);
      this.pushState();
      this.render();
    } else if (this.selectedEdgeIndex !== null) {
      this.deleteEdge(this.selectedEdgeIndex);
    }
  }

  selectNode(id) {
    this.selectedNodeId = id;
    this.selectedEdgeIndex = null;
    this.onSelectEdge(null, null);

    const node = this.nodes.find(n => n.id === id) || null;
    this.onSelectNode(node);
    this.render();
  }

  selectEdge(index) {
    this.selectedEdgeIndex = index;
    this.selectedNodeId = null;
    this.onSelectNode(null);

    const edge = this.edges[index] || null;
    this.onSelectEdge(edge, index);
    this.render();
  }

  updateNode(id, props, recordHistory = true) {
    const node = this.nodes.find(n => n.id === id);
    if (!node) return;
    Object.assign(node, props);
    if (recordHistory) {
      this.pushState();
    }
    this.render();
  }

  updateEdge(index, props, recordHistory = true) {
    const edge = this.edges[index];
    if (!edge) return;
    Object.assign(edge, props);
    if (recordHistory) {
      this.pushState();
    }
    this.render();
  }

  flipEdge(index) {
    const edge = this.edges[index];
    if (!edge) return;
    const temp = edge.from;
    edge.from = edge.to;
    edge.to = temp;

    const tempPort = edge.fromPort;
    edge.fromPort = edge.toPort;
    edge.toPort = tempPort;

    if (edge.waypoints && edge.waypoints.length > 0) {
      edge.waypoints.reverse();
    }

    this.pushState();
    this.render();
    this.onSelectEdge(edge, index);
  }

  deleteEdge(index) {
    if (index >= 0 && index < this.edges.length) {
      this.edges.splice(index, 1);
      this.selectedEdgeIndex = null;
      this.onSelectEdge(null, null);
      this.pushState();
      this.render();
    }
  }

  resetEdgeRoute(index) {
    const edge = this.edges[index];
    if (!edge) return;
    edge.waypoints = [];
    this.pushState();
    this.render();
  }

  distanceToSegment(p, a, b) {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  }

  findNearestPort(x, y) {
    let best = null;
    let minDist = Infinity;
    this.nodes.forEach(node => {
      const ports = GostShapes.getPorts(node.x, node.y, node.width, node.height);
      for (const [portKey, pt] of Object.entries(ports)) {
        const d = Math.hypot(pt.x - x, pt.y - y);
        if (d < minDist) {
          minDist = d;
          best = { nodeId: node.id, port: portKey, dist: d };
        }
      }
    });
    return best;
  }

  render() {
    this.renderEdges();
    this.renderNodes();
    this.renderHandles();
  }

  renderNodes() {
    this.nodesLayer.innerHTML = "";

    this.nodes.forEach(node => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `gost-node ${node.id === this.selectedNodeId ? "selected" : ""}`);
      g.setAttribute("data-id", node.id);

      const shapeSvg = GostShapes.renderShapeSvg(node);
      const textSvg = GostShapes.renderTextSvg(node);
      g.innerHTML = shapeSvg + textSvg;

      g.addEventListener("mousedown", (e) => this.onNodeMouseDown(e, node));
      g.addEventListener("dblclick", (e) => this.onNodeDblClick(e, node));

      this.nodesLayer.appendChild(g);
    });
  }

  renderEdges() {
    this.edgesLayer.innerHTML = "";

    this.edges.forEach((edge, idx) => {
      const pts = this.getEdgePoints(edge);
      if (pts.length < 2) return;

      const pathData = GostShapes.pointsToSvgPath(pts);
      const isSelected = this.selectedEdgeIndex === idx;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `gost-edge ${isSelected ? "selected" : ""}`);
      g.setAttribute("data-edge-index", idx);

      // Невидимая широкая полоса для удобного клика мышкой по стрелке
      const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitbox.setAttribute("d", pathData);
      hitbox.setAttribute("class", "edge-hitbox");
      g.appendChild(hitbox);

      // Видимая линия стрелки
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("class", "edge-line");
      path.setAttribute("marker-end", isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)");
      g.appendChild(path);

      // Метка ветки ("Да", "Нет" и др.)
      if (edge.label) {
        const midSegIdx = Math.floor((pts.length - 1) / 2);
        const pA = pts[midSegIdx];
        const pB = pts[midSegIdx + 1] || pA;
        const midX = Math.round((pA.x + pB.x) / 2 + 10);
        const midY = Math.round((pA.y + pB.y) / 2 - 6);
        const labelW = Math.max(36, String(edge.label).length * 8 + 14);

        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("class", "edge-label-bg");
        bgRect.setAttribute("x", midX - labelW / 2);
        bgRect.setAttribute("y", midY - 11);
        bgRect.setAttribute("width", labelW);
        bgRect.setAttribute("height", 16);
        bgRect.setAttribute("rx", 3);
        g.appendChild(bgRect);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("class", "edge-label");
        text.setAttribute("x", midX);
        text.setAttribute("y", midY + 1);
        text.textContent = edge.label;
        g.appendChild(text);
      }

      // Клик по стрелке: выделение или перетаскивание произвольной точки стрелки
      g.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (this.selectedEdgeIndex !== idx) {
          this.selectEdge(idx);
          return;
        }
        // При двойном клике не создаем паразитный waypoint
        if (e.detail > 1) return;

        // Стрелка уже выбрана: клик прямо в линию добавляет новый излом в точке клика и начинает его драг!
        const mouseCanvas = this.clientToCanvas(e.clientX, e.clientY);
        let bestSeg = 0;
        let bestDist = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const d = this.distanceToSegment(mouseCanvas, pts[i], pts[i + 1]);
          if (d < bestDist) {
            bestDist = d;
            bestSeg = i;
          }
        }
        if (!edge.waypoints || edge.waypoints.length === 0) {
          edge.waypoints = pts.slice(1, -1).map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
        }
        const newPt = { x: Math.round(mouseCanvas.x), y: Math.round(mouseCanvas.y) };
        edge.waypoints.splice(bestSeg, 0, newPt);
        this.draggedWaypoint = {
          edgeIndex: idx,
          wpIndex: bestSeg,
          startPos: newPt
        };
        this.render();
      });

      // Двойной клик по стрелке — быстрое редактирование метки
      g.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const newLabel = prompt("Подпись ветки (например, Да, Нет):", edge.label || "");
        if (newLabel !== null) {
          edge.label = newLabel.trim();
          this.pushState();
          this.render();
          this.onSelectEdge(edge, idx);
        }
      });

      this.edgesLayer.appendChild(g);
    });
  }

  // Отрисовка интерактивных точек управления выбранной стрелкой
  renderHandles() {
    if (!this.handlesLayer) return;
    this.handlesLayer.innerHTML = "";
    if (this.selectedEdgeIndex === null) return;

    const edge = this.edges[this.selectedEdgeIndex];
    if (!edge) return;

    const pts = this.getEdgePoints(edge);
    if (pts.length < 2) return;

    const p1 = pts[0];
    const p2 = pts[pts.length - 1];

    // 1. Точки излома (Waypoints): перемещение и удаление по двойному клику
    for (let i = 1; i < pts.length - 1; i++) {
      const pt = pts[i];
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("class", "edge-handle");
      circle.setAttribute("cx", Math.round(pt.x));
      circle.setAttribute("cy", Math.round(pt.y));
      circle.setAttribute("r", "6");
      circle.setAttribute("title", "Потяните для изменения положения стрелки. Двойной клик: удалить излом");

      circle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        if (!edge.waypoints || edge.waypoints.length === 0) {
          edge.waypoints = pts.slice(1, -1).map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
        }
        this.draggedWaypoint = {
          edgeIndex: this.selectedEdgeIndex,
          wpIndex: i - 1,
          startPos: { x: pt.x, y: pt.y }
        };
      });

      circle.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (edge.waypoints && edge.waypoints.length > 0) {
          edge.waypoints.splice(i - 1, 1);
          this.pushState();
          this.render();
        }
      });

      this.handlesLayer.appendChild(circle);
    }

    // 2. Средние точки сегментов для легкого создания новых изгибов
    for (let i = 0; i < pts.length - 1; i++) {
      const pA = pts[i];
      const pB = pts[i + 1];
      const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (dist < 20) continue;

      const midX = Math.round((pA.x + pB.x) / 2);
      const midY = Math.round((pA.y + pB.y) / 2);

      const midCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      midCircle.setAttribute("class", "edge-midpoint-handle");
      midCircle.setAttribute("cx", midX);
      midCircle.setAttribute("cy", midY);
      midCircle.setAttribute("r", "4.5");
      midCircle.setAttribute("title", "Потяните, чтобы добавить новый изгиб стрелки");

      midCircle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        if (!edge.waypoints || edge.waypoints.length === 0) {
          edge.waypoints = pts.slice(1, -1).map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
        }
        edge.waypoints.splice(i, 0, { x: midX, y: midY });
        this.draggedWaypoint = {
          edgeIndex: this.selectedEdgeIndex,
          wpIndex: i,
          startPos: { x: midX, y: midY }
        };
        this.render();
      });

      this.handlesLayer.appendChild(midCircle);
    }

    // 3. Порты подключения: начало (зеленый) и конец (красный)
    const startHandle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    startHandle.setAttribute("class", "edge-port-handle from");
    startHandle.setAttribute("cx", Math.round(p1.x));
    startHandle.setAttribute("cy", Math.round(p1.y));
    startHandle.setAttribute("r", "6");
    startHandle.setAttribute("title", "Начало стрелки: потяните к любому блоку/порту");
    startHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.draggedPort = { edgeIndex: this.selectedEdgeIndex, which: "from" };
    });
    this.handlesLayer.appendChild(startHandle);

    const endHandle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    endHandle.setAttribute("class", "edge-port-handle to");
    endHandle.setAttribute("cx", Math.round(p2.x));
    endHandle.setAttribute("cy", Math.round(p2.y));
    endHandle.setAttribute("r", "6");
    endHandle.setAttribute("title", "Острие стрелки: потяните к любому блоку/порту");
    endHandle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.draggedPort = { edgeIndex: this.selectedEdgeIndex, which: "to" };
    });
    this.handlesLayer.appendChild(endHandle);
  }

  initEvents() {
    // Zoom колесиком
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom(zoomFactor, e.clientX, e.clientY);
    });

    // Pan холста и сброс выделения при клике в пустоту
    this.svg.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target === this.svg || e.target.tagName === "rect") {
        this.isPanning = true;
        this.startPan = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.selectNode(null);
        this.selectEdge(null);
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startPan.x;
        this.panY = e.clientY - this.startPan.y;
        this.updateViewportTransform();
      } else if (this.draggedNode) {
        const mouseCanvas = this.clientToCanvas(e.clientX, e.clientY);
        this.draggedNode.x = Math.round(mouseCanvas.x - this.dragOffset.x);
        this.draggedNode.y = Math.round(mouseCanvas.y - this.dragOffset.y);
        this.render();
      } else if (this.draggedWaypoint) {
        const mouseCanvas = this.clientToCanvas(e.clientX, e.clientY);
        const edge = this.edges[this.draggedWaypoint.edgeIndex];
        if (edge && edge.waypoints && edge.waypoints[this.draggedWaypoint.wpIndex]) {
          const snap = e.shiftKey ? 1 : 5;
          const nx = Math.round(mouseCanvas.x / snap) * snap;
          const ny = Math.round(mouseCanvas.y / snap) * snap;
          edge.waypoints[this.draggedWaypoint.wpIndex] = { x: nx, y: ny };
          this.render();
        }
      } else if (this.draggedPort) {
        const mouseCanvas = this.clientToCanvas(e.clientX, e.clientY);
        const edge = this.edges[this.draggedPort.edgeIndex];
        if (edge) {
          const nearest = this.findNearestPort(mouseCanvas.x, mouseCanvas.y);
          if (nearest && nearest.dist < 35) {
            if (this.draggedPort.which === "from" && nearest.nodeId !== edge.to) {
              if (edge.from !== nearest.nodeId) {
                edge.waypoints = [];
              }
              edge.from = nearest.nodeId;
              edge.fromPort = nearest.port;
            } else if (this.draggedPort.which === "to" && nearest.nodeId !== edge.from) {
              if (edge.to !== nearest.nodeId) {
                edge.waypoints = [];
              }
              edge.to = nearest.nodeId;
              edge.toPort = nearest.port;
            }
          }
          this.render();
        }
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isPanning) this.isPanning = false;
      if (this.draggedNode) {
        // Если координаты изменились, записываем в историю
        if (
          !this.dragStartedPos ||
          this.dragStartedPos.x !== this.draggedNode.x ||
          this.dragStartedPos.y !== this.draggedNode.y
        ) {
          this.pushState();
        }
        this.draggedNode = null;
        this.dragStartedPos = null;
      }
      if (this.draggedWaypoint) {
        this.pushState();
        this.draggedWaypoint = null;
      }
      if (this.draggedPort) {
        this.pushState();
        this.draggedPort = null;
        if (this.selectedEdgeIndex !== null) {
          this.onSelectEdge(this.edges[this.selectedEdgeIndex], this.selectedEdgeIndex);
        }
      }
    });

    // Клавиатурные сокращения: Ctrl+Z (Undo), Ctrl+Y (Redo), Delete (Удаление)
    window.addEventListener("keydown", (e) => {
      const isInput = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA");
      if (isInput) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlOrCmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      } else if (ctrlOrCmd && e.key.toLowerCase() === "y") {
        e.preventDefault();
        this.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        this.deleteSelected();
      }
    });
  }

  onNodeMouseDown(e, node) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (this.activeTool === "connect") {
      if (!this.connectSourceId) {
        this.connectSourceId = node.id;
        this.selectNode(node.id);
      } else if (this.connectSourceId !== node.id) {
        const label = prompt("Подпись ветки (например, 'Да', 'Нет' или оставьте пустым):", "");
        this.edges.push({
          from: this.connectSourceId,
          to: node.id,
          label: label !== null ? label.trim() : "",
          fromPort: null,
          toPort: null
        });
        this.connectSourceId = null;
        this.pushState();
        this.render();
      }
      return;
    }

    if (this.activeTool === "delete") {
      this.selectedNodeId = node.id;
      this.deleteSelected();
      return;
    }

    // Режим выбора и перетаскивания узла
    this.selectNode(node.id);
    this.draggedNode = node;
    this.dragStartedPos = { x: node.x, y: node.y };
    const mouseCanvas = this.clientToCanvas(e.clientX, e.clientY);
    this.dragOffset = {
      x: mouseCanvas.x - node.x,
      y: mouseCanvas.y - node.y
    };
  }

  onNodeDblClick(e, node) {
    e.stopPropagation();
    const editor = document.getElementById("inline-editor");
    const textarea = document.getElementById("inline-editor-input");

    const screenPos = this.canvasToClient(node.x, node.y);
    editor.style.left = `${screenPos.x}px`;
    editor.style.top = `${screenPos.y}px`;
    editor.style.width = `${(node.width || 150) * this.scale}px`;
    editor.style.height = `${(node.height || 55) * this.scale}px`;
    editor.style.display = "block";

    textarea.value = (node.text || "").replace(/\\n/g, "\n");
    textarea.focus();

    const saveAndClose = () => {
      const newText = textarea.value.trim();
      if (newText !== node.text) {
        node.text = newText;
        this.pushState();
      }
      editor.style.display = "none";
      this.render();
      this.onSelectNode(node);
      textarea.removeEventListener("blur", saveAndClose);
    };

    textarea.addEventListener("blur", saveAndClose);
  }

  clientToCanvas(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.scale,
      y: (clientY - rect.top - this.panY) / this.scale
    };
  }

  canvasToClient(canvasX, canvasY) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: canvasX * this.scale + this.panX + rect.left,
      y: canvasY * this.scale + this.panY + rect.top
    };
  }

  zoom(factor, clientX, clientY) {
    const newScale = Math.min(Math.max(0.2, this.scale * factor), 3.0);
    if (clientX !== undefined && clientY !== undefined) {
      const rect = this.svg.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;
      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
    }
    this.scale = newScale;
    this.updateViewportTransform();
  }

  resetZoom() {
    this.scale = 1.0;
    this.panX = 80;
    this.panY = 60;
    this.updateViewportTransform();
  }

  updateViewportTransform() {
    this.viewport.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
  }
}
