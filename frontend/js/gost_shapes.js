/**
 * gost_shapes.js - Векторная отрисовка символов ГОСТ 19.701-90 для SVG холста.
 */

const GostShapes = {
  // Расчет портов подключения стрелок (север, юг, запад, восток)
  getPorts(x, y, w, h) {
    return {
      n: { x: x + w / 2, y: y },
      s: { x: x + w / 2, y: y + h },
      w: { x: x, y: y + h / 2 },
      e: { x: x + w, y: y + h / 2 }
    };
  },

  // Отрисовка фигуры узла в зависимости от типа
  renderShapeSvg(node) {
    const x = node.x;
    const y = node.y;
    const w = node.width || 140;
    const h = node.height || 50;
    const type = node.type || "process";

    switch (type) {
      case "terminator": {
        const r = Math.min(w, h) / 2;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" />`;
      }

      case "process": {
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" />`;
      }

      case "decision": {
        const p1 = `${x + w / 2},${y}`;
        const p2 = `${x + w},${y + h / 2}`;
        const p3 = `${x + w / 2},${y + h}`;
        const p4 = `${x},${y + h / 2}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4}" />`;
      }

      case "io": {
        const skew = Math.min(20, w * 0.15);
        const p1 = `${x + skew},${y}`;
        const p2 = `${x + w},${y}`;
        const p3 = `${x + w - skew},${y + h}`;
        const p4 = `${x},${y + h}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4}" />`;
      }

      case "subroutine": {
        const inset = 10;
        return `
          <rect x="${x}" y="${y}" width="${w}" height="${h}" />
          <line x1="${x + inset}" y1="${y}" x2="${x + inset}" y2="${y + h}" stroke="#000" stroke-width="1.5" />
          <line x1="${x + w - inset}" y1="${y}" x2="${x + w - inset}" y2="${y + h}" stroke="#000" stroke-width="1.5" />
        `;
      }

      case "document": {
        const waveH = 6;
        const c1x = x + w * 0.75;
        const c1y = y + h - waveH;
        const c2x = x + w * 0.25;
        const c2y = y + h + waveH;
        const d = `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} C ${c1x},${c1y} ${c2x},${c2y} ${x},${y + h} Z`;
        return `<path d="${d}" />`;
      }

      case "database": {
        const rh = 6;
        return `
          <path d="M ${x},${y + rh} L ${x},${y + h - rh} A ${w/2} ${rh} 0 0 0 ${x + w} ${y + h - rh} L ${x + w},${y + rh} Z" />
          <ellipse cx="${x + w / 2}" cy="${y + rh}" rx="${w / 2}" ry="${rh}" />
        `;
      }

      case "preparation": {
        const cut = Math.min(20, w * 0.15);
        const p1 = `${x + cut},${y}`;
        const p2 = `${x + w - cut},${y}`;
        const p3 = `${x + w},${y + h / 2}`;
        const p4 = `${x + w - cut},${y + h}`;
        const p5 = `${x + cut},${y + h}`;
        const p6 = `${x},${y + h / 2}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4} ${p5} ${p6}" />`;
      }

      case "connector": {
        const r = Math.min(w, h) / 2;
        return `<circle cx="${x + r}" cy="${y + r}" r="${r}" />`;
      }

      default:
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" />`;
    }
  },

  // Отрисовка многострочного текста по центру блока
  renderTextSvg(node) {
    const x = node.x + (node.width || 140) / 2;
    const startY = node.y + (node.height || 50) / 2;
    const lines = (node.text || "").split("\\n").flatMap(l => l.split("\n"));
    const lineHeight = 14;
    const totalH = lines.length * lineHeight;
    const initialY = startY - totalH / 2 + 10;

    return lines.map((line, i) => {
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<text x="${x}" y="${initialY + i * lineHeight}">${escaped}</text>`;
    }).join("");
  },

  // Построение ортогональной линии со стрелкой между двумя точками
  buildOrthoPath(p1, p2) {
    // Если на одной вертикали
    if (Math.abs(p1.x - p2.x) < 4) {
      return `M ${p1.x},${p1.y} L ${p2.x},${p2.y}`;
    }
    // Если p2 ниже p1: вниз до половины, вбок, вниз до p2
    if (p2.y > p1.y) {
      const midY = (p1.y + p2.y) / 2;
      return `M ${p1.x},${p1.y} L ${p1.x},${midY} L ${p2.x},${midY} L ${p2.x},${p2.y}`;
    } else {
      // Обратная петля (цикл): вправо/влево, вверх, к p2
      const offset = 40;
      const cornerX = Math.min(p1.x, p2.x) - offset;
      return `M ${p1.x},${p1.y} L ${cornerX},${p1.y} L ${cornerX},${p2.y} L ${p2.x},${p2.y}`;
    }
  }
};
