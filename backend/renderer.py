"""
renderer.py - Движок рендеринга и экспорта блок-схем по ГОСТ 19.701-90.
"""

import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from typing import Dict, List, Any, Optional


def build_dot_from_model(model: Dict[str, Any]) -> str:
    """
    Преобразует JSON-модель {nodes: [...], edges: [...]} в Graphviz DOT
    со строгим соблюдением стандартов ГОСТ 19.701-90.
    """
    nodes: List[Dict[str, Any]] = model.get("nodes", [])
    edges: List[Dict[str, Any]] = model.get("edges", [])

    lines = [
        'digraph GostFlowchart {',
        '    graph [rankdir=TB, splines=ortho, nodesep=0.7, ranksep=0.5, bgcolor=white];',
        '    node [fontname="Liberation Sans", fontsize=11, penwidth=1.5, color=black, fillcolor=white, style="solid,filled"];',
        '    edge [fontname="Liberation Sans", fontsize=10, penwidth=1.5, color=black, arrowhead=normal, arrowsize=0.8];',
        ''
    ]

    for n in nodes:
        raw_id = str(n.get("id", ""))
        nid = re.sub(r"[^a-zA-Z0-9_]", "_", raw_id) or "node"
        ntype = n.get("type", "process")
        raw_text = str(n.get("text", ""))
        # Экранирование для DOT: сначала бэкслеши, затем кавычки и переводы строк
        safe_text = raw_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

        w_val = n.get("width", 2.0)
        h_val = n.get("height", 0.7)
        # Graphviz принимает width и height в дюймах (1 дюйм = 72 pt)
        w = round(w_val / 72.0, 2) if w_val > 10 else round(w_val, 2)
        h = round(h_val / 72.0, 2) if h_val > 10 else round(h_val, 2)
        # Гарантируем разумные границы
        w = max(0.8, min(w, 8.0))
        h = max(0.4, min(h, 4.0))

        if ntype == "terminator":
            lines.append(f'    {nid} [shape=box, style="rounded,filled", label="{safe_text}", width={w}, height={h}];')
        elif ntype == "process":
            lines.append(f'    {nid} [shape=box, label="{safe_text}", width={w}, height={h}];')
        elif ntype == "decision":
            lines.append(f'    {nid} [shape=diamond, label="{safe_text}", width={w}, height={h}];')
        elif ntype == "io":
            lines.append(f'    {nid} [shape=parallelogram, label="{safe_text}", width={w}, height={h}];')
        elif ntype == "subroutine":
            # Предопределенный процесс (двойные боковые линии)
            html_text = (
                raw_text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#39;")
                .replace("\n", "<br/>")
            )
            lines.append(f'    {nid} [shape=none, margin=0, label=<')
            lines.append('        <table border="1" cellborder="0" cellspacing="0" cellpadding="8">')
            lines.append(f'            <tr><td sides="R" width="6"></td><td>{html_text}</td><td sides="L" width="6"></td></tr>')
            lines.append('        </table>')
            lines.append('    >];')
        elif ntype == "document":
            lines.append(f'    {nid} [shape=box, style="filled", class="gost_document", label="{safe_text}", width={w}, height={h}];')
        elif ntype == "database":
            lines.append(f'    {nid} [shape=cylinder, label="{safe_text}", width={w}, height={h}];')
        elif ntype == "preparation":
            lines.append(f'    {nid} [shape=hexagon, label="{safe_text}", width={w}, height={h}];')
        elif ntype == "connector":
            lines.append(f'    {nid} [shape=circle, width=0.4, fixedsize=true, label="{safe_text}"];')
        else:
            lines.append(f'    {nid} [shape=box, label="{safe_text}", width={w}, height={h}];')

    lines.append('')
    for e in edges:
        from_id = re.sub(r"[^a-zA-Z0-9_]", "_", str(e.get("from", "")))
        to_id = re.sub(r"[^a-zA-Z0-9_]", "_", str(e.get("to", "")))
        label = str(e.get("label", "")).strip()
        from_port = re.sub(r"[^a-zA-Z0-9_]", "_", str(e["fromPort"])) if e.get("fromPort") else None
        to_port = re.sub(r"[^a-zA-Z0-9_]", "_", str(e["toPort"])) if e.get("toPort") else None

        src = f"{from_id}:{from_port}" if from_port else from_id
        dst = f"{to_id}:{to_port}" if to_port else to_id

        attrs = []
        if label:
            safe_label = label.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
            attrs.append(f'xlabel="{safe_label} "')

        attr_str = f" [{', '.join(attrs)}]" if attrs else ""
        lines.append(f'    {src} -> {dst}{attr_str};')

    lines.append('}')
    return "\n".join(lines)


def patch_gost_document_wave(svg_content: str) -> str:
    """Заменяет нижнюю грань блоков gost_document на ГОСТовскую волну."""
    def replace_poly(match):
        node_xml = match.group(0)
        poly_match = re.search(
            r'<polygon fill="([^"]+)" stroke="([^"]+)" stroke-width="([^"]+)" points="([^"]+)"/>',
            node_xml
        )
        if not poly_match:
            return node_xml

        fill, stroke, sw, pts_str = poly_match.groups()
        pts = [p.split(",") for p in pts_str.strip().split()]
        coords = [(float(x), float(y)) for x, y in pts]
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w = max_x - min_x

        top_y = min_y
        bot_y = max_y
        h_wave = 5.0

        c1_x = max_x - w * 0.25
        c1_y = bot_y - h_wave
        c2_x = min_x + w * 0.25
        c2_y = bot_y + h_wave

        path = (
            f'<path fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'd="M {min_x},{top_y} L {max_x},{top_y} L {max_x},{bot_y} '
            f'C {c1_x},{c1_y} {c2_x},{c2_y} {min_x},{bot_y} Z"/>'
        )
        return node_xml.replace(poly_match.group(0), path)

    return re.sub(
        r'<g [^>]*class="[^"]*gost_document[^"]*"[^>]*>.*?</g>',
        replace_poly,
        svg_content,
        flags=re.DOTALL
    )


def fix_penetrating_arrows(svg: str) -> str:
    """Устраняет проникновение острия стрелки внутрь границы блока."""
    nodes = {}
    for n in re.finditer(r"<g id=\"(node\d+)\"[^>]*>\s*<title>([^<]+)</title>(.*?)</g>", svg, re.DOTALL):
        name = n.group(2).strip()
        body = n.group(3)
        pts = []
        for poly in re.finditer(r"points=\"([^\"]+)\"", body):
            for pt in poly.group(1).strip().split():
                x, y = map(float, pt.split(","))
                pts.append((x, y))
        for p in re.finditer(r"d=\"([^\"]+)\"", body):
            nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+", p.group(1))]
            for i in range(0, len(nums) - 1, 2):
                pts.append((nums[i], nums[i + 1]))
        if pts:
            nodes[name] = {
                "min_x": min(p[0] for p in pts), "max_x": max(p[0] for p in pts),
                "min_y": min(p[1] for p in pts), "max_y": max(p[1] for p in pts),
            }

    def patch_edge(match):
        edge_xml = match.group(0)
        title_m = re.search(r"<title>([^<]+)</title>", edge_xml)
        poly_m = re.search(r'<polygon fill="black" stroke="black" [^>]*points="([^"]+)"', edge_xml)
        if not title_m or not poly_m:
            return edge_xml

        title = title_m.group(1)
        pts_str = poly_m.group(1)
        poly_pts = [tuple(map(float, pt.split(","))) for pt in pts_str.strip().split()]
        if len(poly_pts) < 3:
            return edge_xml

        tip_x, tip_y = poly_pts[1]
        base_mid_x = (poly_pts[0][0] + poly_pts[2][0]) / 2.0
        base_mid_y = (poly_pts[0][1] + poly_pts[2][1]) / 2.0

        dir_x = tip_x - base_mid_x
        dir_y = tip_y - base_mid_y
        arrow_len = math.hypot(dir_x, dir_y)
        if arrow_len == 0:
            return edge_xml

        ux = dir_x / arrow_len
        uy = dir_y / arrow_len

        parts = re.split(r"&#45;&gt;|->", title)
        if len(parts) != 2:
            return edge_xml
        target = parts[1].split(":")[0].strip()
        if target not in nodes:
            return edge_xml

        nb = nodes[target]
        eps = 0.5
        is_inside_x = (nb["min_x"] + eps < tip_x < nb["max_x"] - eps)
        is_inside_y = (nb["min_y"] + eps < tip_y < nb["max_y"] - eps)

        if is_inside_x and is_inside_y:
            t_candidates = []
            if abs(ux) > 1e-4:
                t1 = (nb["min_x"] - tip_x) / ux
                t2 = (nb["max_x"] - tip_x) / ux
                t_candidates.extend([t for t in [t1, t2] if t <= 0])
            if abs(uy) > 1e-4:
                t3 = (nb["min_y"] - tip_y) / uy
                t4 = (nb["max_y"] - tip_y) / uy
                t_candidates.extend([t for t in [t3, t4] if t <= 0])

            if t_candidates:
                best_t = max(t_candidates)
                dx = best_t * ux
                dy = best_t * uy
                new_poly_pts = [(p[0] + dx, p[1] + dy) for p in poly_pts]
                new_pts_str = " ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in new_poly_pts)

                path_m = re.search(r'd="([^"]+)"', edge_xml)
                new_edge_xml = edge_xml.replace(pts_str, new_pts_str)
                if path_m:
                    old_d = path_m.group(1)
                    coords = list(re.finditer(r'[-+]?\d*\.?\d+', old_d))
                    if len(coords) >= 2:
                        last_x = float(coords[-2].group(0)) + dx
                        last_y = float(coords[-1].group(0)) + dy
                        new_d = (
                            old_d[:coords[-2].start()]
                            + f"{last_x:.2f}"
                            + old_d[coords[-2].end():coords[-1].start()]
                            + f"{last_y:.2f}"
                            + old_d[coords[-1].end():]
                        )
                        new_edge_xml = new_edge_xml.replace(old_d, new_d)
                return new_edge_xml

        return edge_xml

    return re.sub(r"<g id=\"edge\d+\"[^>]*>.*?</g>", patch_edge, svg, flags=re.DOTALL)


def render_svg(dot_str: str) -> str:
    """Рендерит DOT в кастомизированный ГОСТ SVG."""
    res = subprocess.run(["dot", "-Tsvg"], input=dot_str, text=True, capture_output=True, check=True, timeout=10)
    svg = res.stdout
    svg = patch_gost_document_wave(svg)
    svg = fix_penetrating_arrows(svg)
    return svg


def calculate_layout(dot_str: str) -> Dict[str, Any]:
    """
    Вычисляет идеальное автовыравнивание узлов по ГОСТу с помощью dot -Tjson
    и возвращает координаты x, y для редактора на фронтенде.
    """
    res = subprocess.run(["dot", "-Tjson"], input=dot_str, text=True, capture_output=True, check=True, timeout=10)
    raw = json.loads(res.stdout)

    bb = [float(v) for v in raw.get("bb", "0,0,800,600").split(",")]
    canvas_height = bb[3] if len(bb) >= 4 else 600.0

    node_positions = {}
    for obj in raw.get("objects", []):
        name = obj.get("name")
        pos_str = obj.get("pos")
        if name and pos_str:
            px, py = [float(v) for v in pos_str.split(",")]
            # В SVG координатах Y инвертирован (0 сверху)
            node_positions[name] = {
                "x": px,
                "y": canvas_height - py,
                "width": float(obj.get("width", 2.0)) * 72,
                "height": float(obj.get("height", 0.7)) * 72
            }

    return {
        "positions": node_positions,
        "width": bb[2] if len(bb) >= 3 else 800.0,
        "height": canvas_height
    }


def export_format(dot_str: str, fmt: str, dpi: int = 300) -> bytes:
    """Экспорт схемы в PNG (300 DPI), SVG, PDF или DOT."""
    if fmt == "dot":
        return dot_str.encode("utf-8")

    dpi = max(50, min(int(dpi), 1200))

    svg = render_svg(dot_str)
    if fmt == "svg":
        return svg.encode("utf-8")

    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as f_svg:
        f_svg.write(svg)
        f_svg_path = f_svg.name

    out_file = f_svg_path + f".{fmt}"
    try:
        if fmt == "png":
            if shutil.which("rsvg-convert"):
                subprocess.run(
                    ["rsvg-convert", "-d", str(dpi), "-p", str(dpi), f_svg_path, "-o", out_file],
                    check=True,
                    timeout=15
                )
            else:
                subprocess.run(["magick", "-density", str(dpi), f_svg_path, out_file], check=True, timeout=15)
        elif fmt == "pdf":
            if shutil.which("rsvg-convert"):
                subprocess.run(
                    ["rsvg-convert", "-f", "pdf", f_svg_path, "-o", out_file],
                    check=True,
                    timeout=15
                )
            else:
                with open(out_file, "wb") as f_out:
                    subprocess.run(["dot", "-Tpdf"], input=dot_str, text=True, stdout=f_out, check=True, timeout=15)
        else:
            raise ValueError(f"Неизвестный формат экспорта: {fmt}")

        with open(out_file, "rb") as f_out:
            return f_out.read()
    finally:
        for p in [f_svg_path, out_file]:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
