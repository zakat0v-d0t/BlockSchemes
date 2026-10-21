"""
app.py - FastAPI веб-сервер приложения GOST Flowchart Editor.
"""

import os
from fastapi import FastAPI, HTTPException, Response, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Dict, List, Any, Optional

from backend.parser import parse_code_to_flowchart
from backend.renderer import (
    build_dot_from_model,
    render_svg,
    calculate_layout,
    export_format
)

app = FastAPI(title="GOST Flowchart Editor", version="1.0.0")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


class ParseRequest(BaseModel):
    code: str
    language: Optional[str] = "auto"


class FlowchartModel(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    dot: Optional[str] = None


class ExportRequest(BaseModel):
    model: Optional[Dict[str, Any]] = None
    dot: Optional[str] = None
    format: str = "png"
    dpi: Optional[int] = 300


@app.post("/api/parse-code")
async def api_parse_code(req: ParseRequest):
    """Парсинг исходного кода в модель блок-схемы по ГОСТ 19.701-90."""
    if not req.code.strip():
        raise HTTPException(status_code=400, detail="Код не может быть пустым")

    model = parse_code_to_flowchart(req.code, req.language)
    dot_str = build_dot_from_model(model)
    layout = calculate_layout(dot_str)

    # Присваиваем нодам вычисленные координаты
    for n in model["nodes"]:
        nid = n["id"]
        if nid in layout["positions"]:
            pos = layout["positions"][nid]
            n["x"] = pos["x"]
            n["y"] = pos["y"]
            n["width"] = pos["width"]
            n["height"] = pos["height"]

    svg_preview = render_svg(dot_str)

    return {
        "model": model,
        "dot": dot_str,
        "layout": layout,
        "svg": svg_preview
    }


@app.post("/api/upload-file")
async def api_upload_file(file: UploadFile = File(...)):
    """Загрузка файла с кодом через Drag & Drop или файловый диалог."""
    contents = await file.read()
    try:
        code_str = contents.decode("utf-8")
    except UnicodeDecodeError:
        code_str = contents.decode("cp1251", errors="ignore")

    filename = file.filename or "code.py"
    lang = "python" if filename.endswith(".py") else "auto"

    model = parse_code_to_flowchart(code_str, lang)
    dot_str = build_dot_from_model(model)
    layout = calculate_layout(dot_str)

    for n in model["nodes"]:
        nid = n["id"]
        if nid in layout["positions"]:
            pos = layout["positions"][nid]
            n["x"] = pos["x"]
            n["y"] = pos["y"]
            n["width"] = pos["width"]
            n["height"] = pos["height"]

    svg_preview = render_svg(dot_str)

    return {
        "filename": filename,
        "code": code_str,
        "model": model,
        "dot": dot_str,
        "layout": layout,
        "svg": svg_preview
    }


@app.post("/api/render-svg")
async def api_render_svg(flowchart: FlowchartModel):
    """Генерация чистого ГОСТ SVG из модели или DOT текста."""
    dot_str = flowchart.dot if flowchart.dot else build_dot_from_model(flowchart.model_dump())
    try:
        svg = render_svg(dot_str)
        return {"svg": svg, "dot": dot_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/auto-layout")
async def api_auto_layout(flowchart: FlowchartModel):
    """Автоматическое выравнивание блоков по стандарту ГОСТ 19.701-90."""
    dot_str = flowchart.dot if flowchart.dot else build_dot_from_model(flowchart.model_dump())
    try:
        layout = calculate_layout(dot_str)
        return layout
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export")
async def api_export(req: ExportRequest):
    """Экспорт схемы в PNG (300 DPI), SVG, PDF или DOT."""
    dot_str = req.dot if req.dot else (build_dot_from_model(req.model) if req.model else "")
    if not dot_str.strip():
        raise HTTPException(status_code=400, detail="Отсутствуют данные схемы")

    fmt = req.format.lower()
    dpi = req.dpi or 300

    media_types = {
        "png": "image/png",
        "svg": "image/svg+xml",
        "pdf": "application/pdf",
        "dot": "text/vnd.graphviz"
    }

    try:
        data = export_format(dot_str, fmt, dpi)
        media_type = media_types.get(fmt, "application/octet-stream")
        filename = f"flowchart_gost.{fmt}"
        return Response(
            content=data,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Раздача статики фронтенда
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def root():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
