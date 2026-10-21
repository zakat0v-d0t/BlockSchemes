/**
 * gost_shapes.js - Векторная отрисовка символов ГОСТ 19.701-90 для SVG холста и экспорта.
 * Все фигуры имеют явные fill="#ffffff", stroke="#000000", stroke-width="1.5" для 100% совместимости при экспорте.
 */

const GostShapes = {
  // Расчет портов подключения стрелок (север, юг, запад, восток)
  getPorts(x, y, w, h) {
    return {
      n: { x: Math.round(x + w / 2), y: Math.round(y), dir: "n" },
      s: { x: Math.round(x + w / 2), y: Math.round(y + h), dir: "s" },
      w: { x: Math.round(x), y: Math.round(y + h / 2), dir: "w" },
      e: { x: Math.round(x + w), y: Math.round(y + h / 2), dir: "e" }
    };
  },

  // Отрисовка фигуры узла в зависимости от типа
  renderShapeSvg(node) {
    const x = Math.round(node.x);
    const y = Math.round(node.y);
    const w = Math.round(node.width || 140);
    const h = Math.round(node.height || 50);
    const type = node.type || "process";

    const styleAttrs = 'fill="#ffffff" stroke="#000000" stroke-width="1.5"';

    switch (type) {
      case "terminator": {
        const r = Math.round(Math.min(w, h) / 2);
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${styleAttrs} />`;
      }

      case "process": {
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${styleAttrs} />`;
      }

      case "decision": {
        const p1 = `${x + Math.round(w / 2)},${y}`;
        const p2 = `${x + w},${y + Math.round(h / 2)}`;
        const p3 = `${x + Math.round(w / 2)},${y + h}`;
        const p4 = `${x},${y + Math.round(h / 2)}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4}" ${styleAttrs} />`;
      }

      case "io": {
        const skew = Math.round(Math.min(20, w * 0.15));
        const p1 = `${x + skew},${y}`;
        const p2 = `${x + w},${y}`;
        const p3 = `${x + w - skew},${y + h}`;
        const p4 = `${x},${y + h}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4}" ${styleAttrs} />`;
      }

      case "subroutine": {
        const inset = 10;
        return `
          <rect x="${x}" y="${y}" width="${w}" height="${h}" ${styleAttrs} />
          <line x1="${x + inset}" y1="${y}" x2="${x + inset}" y2="${y + h}" stroke="#000000" stroke-width="1.5" />
          <line x1="${x + w - inset}" y1="${y}" x2="${x + w - inset}" y2="${y + h}" stroke="#000000" stroke-width="1.5" />
        `;
      }

      case "document": {
        const waveH = 6;
        const c1x = Math.round(x + w * 0.75);
        const c1y = Math.round(y + h - waveH);
        const c2x = Math.round(x + w * 0.25);
        const c2y = Math.round(y + h + waveH);
        const d = `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} C ${c1x},${c1y} ${c2x},${c2y} ${x},${y + h} Z`;
        return `<path d="${d}" ${styleAttrs} />`;
      }

      case "database": {
        const rh = 6;
        return `
          <path d="M ${x},${y + rh} L ${x},${y + h - rh} A ${Math.round(w/2)} ${rh} 0 0 0 ${x + w} ${y + h - rh} L ${x + w},${y + rh} Z" ${styleAttrs} />
          <ellipse cx="${x + Math.round(w / 2)}" cy="${y + rh}" rx="${Math.round(w / 2)}" ry="${rh}" ${styleAttrs} />
        `;
      }

      case "preparation": {
        const cut = Math.round(Math.min(20, w * 0.15));
        const p1 = `${x + cut},${y}`;
        const p2 = `${x + w - cut},${y}`;
        const p3 = `${x + w},${y + Math.round(h / 2)}`;
        const p4 = `${x + w - cut},${y + h}`;
        const p5 = `${x + cut},${y + h}`;
        const p6 = `${x},${y + Math.round(h / 2)}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4} ${p5} ${p6}" ${styleAttrs} />`;
      }

      case "connector": {
        const r = Math.round(Math.min(w, h) / 2);
        return `<circle cx="${x + r}" cy="${y + r}" r="${r}" ${styleAttrs} />`;
      }

      default:
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${styleAttrs} />`;
    }
  },

  // Отрисовка многострочного текста по центру блока
  renderTextSvg(node) {
    const x = Math.round(node.x + (node.width || 140) / 2);
    const startY = Math.round(node.y + (node.height || 50) / 2);
    const lines = (node.text || "").split("\\n").flatMap(l => l.split("\n"));
    const lineHeight = 15;
    const totalH = lines.length * lineHeight;
    const initialY = Math.round(startY - totalH / 2 + 11);

    return lines.map((line, i) => {
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<text x="${x}" y="${initialY + i * lineHeight}" fill="#000000" font-family="'Liberation Sans', 'DejaVu Sans', Arial, sans-serif" font-size="12px" text-anchor="middle">${escaped}</text>`;
    }).join("");
  },

  // Построение аккуратной ортогональной линии по правилам ГОСТ 19.701-90
  buildOrthoPath(p1, p2) {
    const x1 = Math.round(p1.x);
    const y1 = Math.round(p1.y);
    const x2 = Math.round(p2.x);
    const y2 = Math.round(p2.y);
    const dir1 = p1.dir || (y2 > y1 ? "s" : "w");
    const dir2 = p2.dir || "n";

    // 1. Прямая вертикальная линия
    if (Math.abs(x1 - x2) < 3 && dir1 === "s" && dir2 === "n" && y2 > y1) {
      return `M ${x1},${y1} L ${x1},${y2}`;
    }

    // 2. Линия из нижнего порта (юг) в верхний порт (север)
    if (dir1 === "s" && dir2 === "n") {
      if (y2 > y1 + 15) {
        const midY = Math.round((y1 + y2) / 2);
        return `M ${x1},${y1} L ${x1},${midY} L ${x2},${midY} L ${x2},${y2}`;
      } else {
        // Если целевой блок выше (обратная петля цикла): уходим в обход
        const sideX = Math.min(x1, x2) - 50;
        return `M ${x1},${y1} L ${x1},${y1 + 20} L ${sideX},${y1 + 20} L ${sideX},${y2 - 20} L ${x2},${y2 - 20} L ${x2},${y2}`;
      }
    }

    // 3. Линия из правого порта (восток)
    if (dir1 === "e") {
      if (dir2 === "n") {
        // Идет вправо до x2, затем вниз до y2
        if (x2 > x1) {
          return `M ${x1},${y1} L ${x2},${y1} L ${x2},${y2}`;
        } else {
          // Идет вправо, опускается/поднимается, затем к x2
          const rightX = Math.max(x1, x2) + 40;
          return `M ${x1},${y1} L ${rightX},${y1} L ${rightX},${y2 - 20} L ${x2},${y2 - 20} L ${x2},${y2}`;
        }
      } else if (dir2 === "w") {
        const midX = Math.round((x1 + x2) / 2);
        return `M ${x1},${y1} L ${midX},${y1} L ${midX},${y2} L ${x2},${y2}`;
      } else {
        return `M ${x1},${y1} L ${x2},${y1} L ${x2},${y2}`;
      }
    }

    // 4. Линия из левого порта (запад)
    if (dir1 === "w") {
      if (dir2 === "w") {
        // Обходная петля слева
        const leftX = Math.min(x1, x2) - 40;
        return `M ${x1},${y1} L ${leftX},${y1} L ${leftX},${y2} L ${x2},${y2}`;
      } else if (dir2 === "n") {
        return `M ${x1},${y1} L ${x2},${y1} L ${x2},${y2}`;
      } else {
        const leftX = Math.min(x1, x2) - 30;
        return `M ${x1},${y1} L ${leftX},${y1} L ${leftX},${y2} L ${x2},${y2}`;
      }
    }

    // 5. Общий случай (ортогональная Z-линия)
    if (y2 >= y1) {
      const midY = Math.round((y1 + y2) / 2);
      return `M ${x1},${y1} L ${x1},${midY} L ${x2},${midY} L ${x2},${y2}`;
    } else {
      const sideX = Math.min(x1, x2) - 40;
      return `M ${x1},${y1} L ${sideX},${y1} L ${sideX},${y2} L ${x2},${y2}`;
    }
  }
};
