/**
 * app.js - Главный контроллер приложения ГОСТ 19.701-90 Flowchart Studio.
 */

document.addEventListener("DOMContentLoaded", () => {
  const svgEl = document.getElementById("flowchart-svg");
  const inspector = document.getElementById("right-inspector");
  const inspectorNodeContent = document.getElementById("inspector-content");
  const inspectorEdgeContent = document.getElementById("inspector-edge-content");
  const inspectorEmpty = document.querySelector(".empty-state");

  // Элементы узла
  const blockTypeSelect = document.getElementById("block-type");
  const blockTextInput = document.getElementById("block-text");
  const outgoingEdgesList = document.getElementById("outgoing-edges-list");

  // Элементы стрелки
  const edgeInfoTitle = document.getElementById("edge-info-title");
  const edgeLabelInput = document.getElementById("edge-label-input");
  const edgeFromPort = document.getElementById("edge-from-port");
  const edgeToPort = document.getElementById("edge-to-port");

  let currentSelectedNode = null;
  let currentSelectedEdgeIndex = null;

  // Инициализация холста
  const canvas = new FlowchartCanvas(svgEl, {
    onSelectNode: (node) => {
      currentSelectedNode = node;
      currentSelectedEdgeIndex = null;
      if (node) {
        inspectorEmpty.style.display = "none";
        inspectorEdgeContent.style.display = "none";
        inspectorNodeContent.style.display = "block";
        blockTypeSelect.value = node.type || "process";
        blockTextInput.value = (node.text || "").replace(/\\n/g, "\n");
        renderOutgoingEdges(node);
      } else if (currentSelectedEdgeIndex === null) {
        inspectorEmpty.style.display = "block";
        inspectorNodeContent.style.display = "none";
        inspectorEdgeContent.style.display = "none";
      }
    },

    onSelectEdge: (edge, index) => {
      currentSelectedEdgeIndex = index;
      currentSelectedNode = null;
      if (edge !== null && index !== null) {
        inspectorEmpty.style.display = "none";
        inspectorNodeContent.style.display = "none";
        inspectorEdgeContent.style.display = "block";

        const fromNode = canvas.nodes.find(n => n.id === edge.from);
        const toNode = canvas.nodes.find(n => n.id === edge.to);
        const fromTitle = fromNode ? fromNode.text.split("\n")[0].substring(0, 14) : edge.from;
        const toTitle = toNode ? toNode.text.split("\n")[0].substring(0, 14) : edge.to;

        edgeInfoTitle.textContent = `${fromTitle} ➔ ${toTitle}`;
        edgeLabelInput.value = edge.label || "";
        edgeFromPort.value = edge.fromPort || "";
        edgeToPort.value = edge.toPort || "";
      } else if (currentSelectedNode === null) {
        inspectorEmpty.style.display = "block";
        inspectorNodeContent.style.display = "none";
        inspectorEdgeContent.style.display = "none";
      }
    },

    onChange: () => {
      // Состояние изменилось
    }
  });

  // Кнопки Undo / Redo
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  if (btnUndo) btnUndo.addEventListener("click", () => canvas.undo());
  if (btnRedo) btnRedo.addEventListener("click", () => canvas.redo());

  // Инспектор стрелок
  edgeLabelInput.addEventListener("input", (e) => {
    if (currentSelectedEdgeIndex !== null) {
      canvas.updateEdge(currentSelectedEdgeIndex, { label: e.target.value.trim() });
    }
  });

  document.querySelectorAll(".edge-quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentSelectedEdgeIndex !== null) {
        const val = btn.getAttribute("data-label");
        edgeLabelInput.value = val;
        canvas.updateEdge(currentSelectedEdgeIndex, { label: val });
      }
    });
  });

  edgeFromPort.addEventListener("change", (e) => {
    if (currentSelectedEdgeIndex !== null) {
      canvas.updateEdge(currentSelectedEdgeIndex, { fromPort: e.target.value || null });
    }
  });

  edgeToPort.addEventListener("change", (e) => {
    if (currentSelectedEdgeIndex !== null) {
      canvas.updateEdge(currentSelectedEdgeIndex, { toPort: e.target.value || null });
    }
  });

  document.getElementById("btn-flip-edge").addEventListener("click", () => {
    if (currentSelectedEdgeIndex !== null) {
      canvas.flipEdge(currentSelectedEdgeIndex);
    }
  });

  document.getElementById("btn-delete-edge").addEventListener("click", () => {
    if (currentSelectedEdgeIndex !== null) {
      canvas.deleteEdge(currentSelectedEdgeIndex);
    }
  });

  function renderOutgoingEdges(node) {
    outgoingEdgesList.innerHTML = "";
    const edges = canvas.edges.filter(e => e.from === node.id);
    if (edges.length === 0) {
      outgoingEdgesList.innerHTML = "<span style='font-size:11px;color:#94a3b8;'>Нет исходящих ветвей</span>";
      return;
    }

    edges.forEach((edge) => {
      const targetNode = canvas.nodes.find(n => n.id === edge.to);
      const targetName = targetNode ? (targetNode.text.split("\n")[0].substring(0, 15) || targetNode.id) : edge.to;

      const row = document.createElement("div");
      row.className = "edge-item-row";
      row.innerHTML = `
        <span class="edge-item-target">➜ ${targetName}</span>
        <select class="edge-label-select">
          <option value="" ${edge.label === "" ? "selected" : ""}>Без метки</option>
          <option value="Да" ${edge.label === "Да" ? "selected" : ""}>Да</option>
          <option value="Нет" ${edge.label === "Нет" ? "selected" : ""}>Нет</option>
        </select>
      `;

      row.querySelector(".edge-label-select").addEventListener("change", (e) => {
        edge.label = e.target.value;
        canvas.pushState();
        canvas.render();
      });

      outgoingEdgesList.appendChild(row);
    });
  }

  // Обновление свойств блока из инспектора
  blockTypeSelect.addEventListener("change", (e) => {
    if (currentSelectedNode) {
      canvas.updateNode(currentSelectedNode.id, { type: e.target.value });
    }
  });

  blockTextInput.addEventListener("input", (e) => {
    if (currentSelectedNode) {
      canvas.updateNode(currentSelectedNode.id, { text: e.target.value });
    }
  });

  document.getElementById("btn-delete-selected").addEventListener("click", () => {
    canvas.deleteSelected();
  });

  document.getElementById("btn-close-inspector").addEventListener("click", () => {
    canvas.selectNode(null);
    canvas.selectEdge(null);
  });

  // Палитра инструментов
  const toolButtons = document.querySelectorAll(".tool-btn");
  toolButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      toolButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const toolId = btn.id.replace("tool-", "");
      canvas.setTool(toolId);
    });
  });

  // Добавление блоков из палитры ГОСТ
  document.querySelectorAll(".shape-item").forEach(item => {
    item.addEventListener("click", () => {
      const shapeType = item.getAttribute("data-shape");
      const center = canvas.clientToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      canvas.addNode(shapeType, "", center.x - 70, center.y - 25);
    });
  });

  // Zoom контролы
  document.getElementById("btn-zoom-in").addEventListener("click", () => canvas.zoom(1.2));
  document.getElementById("btn-zoom-out").addEventListener("click", () => canvas.zoom(0.8));
  document.getElementById("btn-zoom-reset").addEventListener("click", () => canvas.resetZoom());

  // Автовыравнивание по ГОСТу
  document.getElementById("btn-auto-layout").addEventListener("click", async () => {
    const data = canvas.getData();
    try {
      const resp = await fetch("/api/auto-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!resp.ok) throw new Error("Ошибка выравнивания");
      const layout = await resp.json();

      data.nodes.forEach(n => {
        if (layout.positions[n.id]) {
          n.x = layout.positions[n.id].x;
          n.y = layout.positions[n.id].y;
        }
      });

      canvas.setData(data, true);
      canvas.resetZoom();
    } catch (err) {
      alert("Не удалось выполнить автовыравнивание: " + err.message);
    }
  });

  // Экспорт
  async function triggerExport(fmt) {
    const data = canvas.getData();
    try {
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: data, format: fmt, dpi: 300 })
      });
      if (!resp.ok) throw new Error("Ошибка генерации файла экспорта");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flowchart_gost.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Ошибка экспорта: " + err.message);
    }
  }

  document.getElementById("btn-export-png").addEventListener("click", () => triggerExport("png"));
  document.getElementById("export-svg").addEventListener("click", (e) => { e.preventDefault(); triggerExport("svg"); });
  document.getElementById("export-pdf").addEventListener("click", (e) => { e.preventDefault(); triggerExport("pdf"); });
  document.getElementById("export-dot").addEventListener("click", (e) => { e.preventDefault(); triggerExport("dot"); });

  // Сохранение и загрузка JSON проекта
  document.getElementById("btn-save-json").addEventListener("click", (e) => {
    e.preventDefault();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(canvas.getData(), null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = "flowchart_project.json";
    a.click();
  });

  const jsonFileInput = document.getElementById("json-file-input");
  document.getElementById("btn-load-json").addEventListener("click", (e) => {
    e.preventDefault();
    jsonFileInput.click();
  });

  jsonFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const loaded = JSON.parse(evt.target.result);
        canvas.setData(loaded, true);
        canvas.resetZoom();
      } catch (err) {
        alert("Ошибка чтения JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Модалка импорта кода
  const modalImport = document.getElementById("modal-import");
  const codeInput = document.getElementById("code-input");
  const fileCodeInput = document.getElementById("file-code-input");
  const dropZone = document.getElementById("drop-zone");

  document.getElementById("btn-import-code").addEventListener("click", () => {
    modalImport.classList.add("active");
  });

  document.getElementById("modal-import-close").addEventListener("click", () => {
    modalImport.classList.remove("active");
  });
  document.getElementById("btn-import-cancel").addEventListener("click", () => {
    modalImport.classList.remove("active");
  });

  // Примеры кода
  const codeExamples = {
    crypto: `def otp_process_binary(data: bytes, key: bytes) -> bytes:
    if len(key) < len(data):
        raise ValueError("Длина ключа должна быть >= длине данных")
    
    result = []
    for b, k in zip(data, key):
        result.append(b ^ k)
        
    return bytes(result)`,

    search: `def find_maximum(arr):
    max_val = arr[0]
    for x in arr:
        if x > max_val:
            max_val = x
    print("Максимум:", max_val)
    return max_val`,

    factorial: `def calc_factorial(n):
    if n <= 1:
        return 1
    res = 1
    i = 2
    while i <= n:
        res = res * i
        i = i + 1
    return res`
  };

  document.querySelectorAll(".badge-btn[data-example]").forEach(btn => {
    btn.addEventListener("click", () => {
      const ex = btn.getAttribute("data-example");
      if (codeExamples[ex]) {
        codeInput.value = codeExamples[ex];
      }
    });
  });

  // Загрузка файла через инпут
  fileCodeInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleCodeFile(file);
  });

  // Drag & drop файла
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleCodeFile(e.dataTransfer.files[0]);
    }
  });

  function handleCodeFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      codeInput.value = e.target.result;
    };
    reader.readAsText(file);
  }

  // Отправка кода на генерацию схемы
  document.getElementById("btn-import-submit").addEventListener("click", async () => {
    const code = codeInput.value.trim();
    if (!code) {
      alert("Пожалуйста, введите код или выберите файл.");
      return;
    }

    try {
      const resp = await fetch("/api/parse-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, language: "auto" })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Ошибка парсинга кода");
      }

      const res = await resp.json();
      canvas.setData(res.model, true);
      canvas.resetZoom();
      modalImport.classList.remove("active");
    } catch (err) {
      alert("Ошибка построения схемы: " + err.message);
    }
  });

  // Модалка DOT редактора
  const modalDot = document.getElementById("modal-dot");
  const dotEditorInput = document.getElementById("dot-editor-input");

  document.getElementById("btn-toggle-dot").addEventListener("click", async () => {
    try {
      const resp = await fetch("/api/render-svg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canvas.getData())
      });
      const data = await resp.json();
      dotEditorInput.value = data.dot;
      modalDot.classList.add("active");
    } catch (err) {
      alert("Ошибка получения DOT: " + err.message);
    }
  });

  document.getElementById("modal-dot-close").addEventListener("click", () => modalDot.classList.remove("active"));
  document.getElementById("btn-dot-cancel").addEventListener("click", () => modalDot.classList.remove("active"));

  document.getElementById("btn-dot-apply").addEventListener("click", async () => {
    const dotStr = dotEditorInput.value;
    try {
      const resp = await fetch("/api/auto-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: [], edges: [], dot: dotStr })
      });
      const layout = await resp.json();
      modalDot.classList.remove("active");
    } catch (err) {
      alert("Ошибка применения DOT: " + err.message);
    }
  });

  // Стартовая загрузка примера по умолчанию
  codeInput.value = codeExamples.crypto;
  document.getElementById("btn-import-submit").click();
});
