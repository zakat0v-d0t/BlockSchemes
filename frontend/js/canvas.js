/**
 * canvas.js - Интерактивный редактор холста блок-схем.
 */

class FlowchartCanvas {
  constructor(svgElement, options = {}) {
    this.svg = svgElement;
    this.viewport = svgElement.querySelector("#viewport-group");
    this.nodesLayer = svgElement.querySelector("#nodes-layer");
    this.edgesLayer = svgElement.querySelector("#edges-layer");

    this.nodes = [];
    this.edges = [];

    this.selectedNodeId = null;
    this.selectedEdge = null;
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

    // Callbacks
    this.onSelectNode = options.onSelectNode || (() => {});
    this.onChange = options.onChange || (() => {});

    this.initEvents();
    this.updateViewportTransform();
  }

  setData(model) {
    this.nodes = (model.nodes || []).map(n => ({
      id: n.id,
      type: n.type || "process",
      text: n.text || "",
      x: typeof n.x === "number" ? n.x : 100,
      y: typeof n.y === "number" ? n.y : 100,
      width: n.width || 150,
      height: n.height || 55
    }));

    this.edges = (model.edges || []).map(e => ({
      from: e.from,
      to: e.to,
      label: e.label || "",
      fromPort: e.fromPort || null,
      toPort: e.toPort || null
    }));

    this.render();
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
    this.render();
    this.onChange();
    return node;
  }

  deleteSelected() {
    if (this.selectedNodeId) {
      const id = this.selectedNodeId;
      this.nodes = this.nodes.filter(n => n.id !== id);
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      this.selectedNodeId = null;
      this.onSelectNode(null);
      this.render();
      this.onChange();
    }
  }

  selectNode(id) {
    this.selectedNodeId = id;
    const node = this.nodes.find(n => n.id === id) || null;
    this.onSelectNode(node);
    this.render();
  }

  updateNode(id, props) {
    const node = this.nodes.find(n => n.id === id);
    if (!node) return;
    Object.assign(node, props);
    this.render();
    this.onChange();
  }

  render() {
    this.renderEdges();
    this.renderNodes();
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

      // События узла
      g.addEventListener("mousedown", (e) => this.onNodeMouseDown(e, node));
      g.addEventListener("dblclick", (e) => this.onNodeDblClick(e, node));

      this.nodesLayer.appendChild(g);
    });
  }

  renderEdges() {
    this.edgesLayer.innerHTML = "";

    this.edges.forEach((edge, idx) => {
      const fromNode = this.nodes.find(n => n.id === edge.from);
      const toNode = this.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const fromPorts = GostShapes.getPorts(fromNode.x, fromNode.y, fromNode.width, fromNode.height);
      const toPorts = GostShapes.getPorts(toNode.x, toNode.y, toNode.width, toNode.height);

      let p1 = fromPorts.s;
      let p2 = toPorts.n;

      if (edge.fromPort && fromPorts[edge.fromPort]) p1 = fromPorts[edge.fromPort];
      if (edge.toPort && toPorts[edge.toPort]) p2 = toPorts[edge.toPort];

      // Если целевой узел выше исходного, это обратная петля цикла
      if (toNode.y < fromNode.y) {
        p1 = fromPorts.w;
        p2 = toPorts.w;
      }

      const pathData = GostShapes.buildOrthoPath(p1, p2);

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "gost-edge");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      path.setAttribute("marker-end", "url(#arrowhead)");
      g.appendChild(path);

      // Метка на стрелке ("Да", "Нет")
      if (edge.label) {
        const midX = (p1.x + p2.x) / 2 + 10;
        const midY = (p1.y + p2.y) / 2 - 6;

        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("class", "edge-label-bg");
        bgRect.setAttribute("x", midX - 16);
        bgRect.setAttribute("y", midY - 11);
        bgRect.setAttribute("width", 32);
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

      this.edgesLayer.appendChild(g);
    });
  }

  // Обработка событий холста
  initEvents() {
    // Zoom колесиком
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom(zoomFactor, e.clientX, e.clientY);
    });

    // Pan холста
    this.svg.addEventListener("mousedown", (e) => {
      if (e.target === this.svg || e.target.tagName === "rect") {
        this.isPanning = true;
        this.startPan = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.selectNode(null);
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
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isPanning) this.isPanning = false;
      if (this.draggedNode) {
        this.draggedNode = null;
        this.onChange();
      }
    });

    // Клавиатурные сокращения
    window.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
          this.deleteSelected();
        }
      }
    });
  }

  onNodeMouseDown(e, node) {
    e.stopPropagation();

    if (this.activeTool === "connect") {
      if (!this.connectSourceId) {
        this.connectSourceId = node.id;
        this.selectNode(node.id);
      } else if (this.connectSourceId !== node.id) {
        // Создаем связь
        const label = prompt("Подпись ветки (например, 'Да', 'Нет' или оставьте пустым):", "");
        this.edges.push({
          from: this.connectSourceId,
          to: node.id,
          label: label !== null ? label : ""
        });
        this.connectSourceId = null;
        this.render();
        this.onChange();
      }
      return;
    }

    if (this.activeTool === "delete") {
      this.selectedNodeId = node.id;
      this.deleteSelected();
      return;
    }

    // Режим выбора и перетаскивания
    this.selectNode(node.id);
    this.draggedNode = node;
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
      node.text = textarea.value.trim();
      editor.style.display = "none";
      this.render();
      this.onChange();
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
