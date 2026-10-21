"""
app.py - FastAPI веб-сервер приложения GOST Flowchart Editor.
"""

import os
import sys

# Подключение завендоренных библиотек (работает автономно без uv и pip)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

VENDOR_PKG = os.path.join(BASE_DIR, "vendor", "packages")
if os.path.exists(VENDOR_PKG) and VENDOR_PKG not in sys.path:
    sys.path.append(VENDOR_PKG)

import logging
import shutil
import subprocess
import tempfile
from fastapi import FastAPI, HTTPException, Response, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Any, Optional

logger = logging.getLogger("gost_flowchart")

from backend.parser import parse_code_to_flowchart
from backend.renderer import (
    build_dot_from_model,
    render_svg,
    calculate_layout,
    export_format
)

app = FastAPI(title="GOST Flowchart Editor", version="1.0.0")

FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


class ParseRequest(BaseModel):
    code: str
    language: Optional[str] = "auto"


class FlowchartModel(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    dot: Optional[str] = Field(default=None, max_length=2_000_000)


class ExportRequest(BaseModel):
    model: Optional[Dict[str, Any]] = None
    dot: Optional[str] = Field(default=None, max_length=2_000_000)
    svg: Optional[str] = Field(default=None, max_length=5_000_000)
    format: str = "png"
    dpi: Optional[int] = Field(default=300, ge=50, le=1200)

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        if v.lower() not in ["png", "svg", "pdf", "dot"]:
            raise ValueError("Недопустимый формат экспорта. Допустимы: png, svg, pdf, dot")
        return v.lower()


@app.post("/api/parse-code")
async def api_parse_code(req: ParseRequest):
    """Парсинг исходного кода в модель блок-схемы по ГОСТ 19.701-90."""
    if not req.code.strip():
        raise HTTPException(status_code=400, detail="Код не может быть пустым")
    if len(req.code) > 1_000_000:
        raise HTTPException(status_code=400, detail="Превышен размер кода")

    try:
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка парсинга кода: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка парсинга кода")


@app.post("/api/upload-file")
async def api_upload_file(file: UploadFile = File(...)):
    """Загрузка файла с кодом через Drag & Drop или файловый диалог."""
    try:
        contents = await file.read(2 * 1024 * 1024 + 1)
        if len(contents) > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Файл слишком большой")
    finally:
        await file.close()

    try:
        code_str = contents.decode("utf-8")
    except UnicodeDecodeError:
        code_str = contents.decode("cp1251", errors="ignore")

    if len(code_str) > 1_000_000:
        raise HTTPException(status_code=400, detail="Превышен размер кода")

    filename = file.filename or "code.py"
    lang = "python" if filename.endswith(".py") else "auto"

    try:
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка обработки загруженного файла: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка при обработке файла")


@app.post("/api/render-svg")
async def api_render_svg(flowchart: FlowchartModel):
    """Генерация чистого ГОСТ SVG из модели или DOT текста."""
    dot_str = flowchart.dot if flowchart.dot else build_dot_from_model(flowchart.model_dump())
    try:
        svg = render_svg(dot_str)
        return {"svg": svg, "dot": dot_str}
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=400, detail="Некорректный синтаксис DOT схемы")
    except Exception as e:
        logger.exception("Ошибка рендеринга SVG: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка рендеринга схемы")


@app.post("/api/auto-layout")
async def api_auto_layout(flowchart: FlowchartModel):
    """Автоматическое выравнивание блоков по стандарту ГОСТ 19.701-90."""
    dot_str = flowchart.dot if flowchart.dot else build_dot_from_model(flowchart.model_dump())
    try:
        layout = calculate_layout(dot_str)
        return layout
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=400, detail="Некорректный синтаксис DOT схемы")
    except Exception as e:
        logger.exception("Ошибка расчета разметки: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка расчета разметки схемы")


@app.post("/api/export")
async def api_export(req: ExportRequest):
    """
    Экспорт схемы в PNG (300 DPI), SVG, PDF или DOT.
    Если передан svg (ручная расстановка пользователя с холста), экспортирует именно его!
    """
    fmt = req.format.lower()
    dpi = req.dpi or 300

    media_types = {
        "png": "image/png",
        "svg": "image/svg+xml",
        "pdf": "application/pdf",
        "dot": "text/vnd.graphviz"
    }

    try:
        if fmt == "dot":
            dot_str = req.dot if req.dot else (build_dot_from_model(req.model) if req.model else "")
            if not dot_str.strip():
                raise HTTPException(status_code=400, detail="Отсутствуют данные схемы")
            return Response(
                content=dot_str.encode("utf-8"),
                media_type="text/vnd.graphviz",
                headers={"Content-Disposition": 'attachment; filename="flowchart_gost.dot"'}
            )

        # Если передан актуальный SVG холста пользователя
        if req.svg and req.svg.strip():
            svg_data = req.svg.strip()
            if fmt == "svg":
                return Response(
                    content=svg_data.encode("utf-8"),
                    media_type="image/svg+xml",
                    headers={
                        "Content-Disposition": 'attachment; filename="flowchart_gost.svg"',
                        "Content-Security-Policy": "default-src 'none'"
                    }
                )

            with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as f_svg:
                f_svg.write(svg_data)
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
                        subprocess.run(
                            ["magick", "-density", str(dpi), f_svg_path, out_file],
                            check=True,
                            timeout=15
                        )
                elif fmt == "pdf":
                    if shutil.which("rsvg-convert"):
                        subprocess.run(
                            ["rsvg-convert", "-f", "pdf", f_svg_path, "-o", out_file],
                            check=True,
                            timeout=15
                        )
                    else:
                        subprocess.run(
                            ["magick", f_svg_path, out_file],
                            check=True,
                            timeout=15
                        )
                else:
                    raise HTTPException(status_code=400, detail=f"Неизвестный формат экспорта: {fmt}")

                with open(out_file, "rb") as f_out:
                    content_bytes = f_out.read()

                headers = {"Content-Disposition": f'attachment; filename="flowchart_gost.{fmt}"'}
                return Response(
                    content=content_bytes,
                    media_type=media_types.get(fmt, "application/octet-stream"),
                    headers=headers
                )
            finally:
                for p in [f_svg_path, out_file]:
                    if os.path.exists(p):
                        try:
                            os.remove(p)
                        except OSError:
                            pass

        # Фоллбек через DOT
        dot_str = req.dot if req.dot else (build_dot_from_model(req.model) if req.model else "")
        if not dot_str.strip():
            raise HTTPException(status_code=400, detail="Отсутствуют данные схемы")

        data = export_format(dot_str, fmt, dpi)
        media_type = media_types.get(fmt, "application/octet-stream")
        headers = {"Content-Disposition": f'attachment; filename="flowchart_gost.{fmt}"'}
        if fmt == "svg":
            headers["Content-Security-Policy"] = "default-src 'none'"
        return Response(
            content=data,
            media_type=media_type,
            headers=headers
        )
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        logger.error("Превышен таймаут экспорта схемы")
        raise HTTPException(status_code=504, detail="Превышено время ожидания при экспорте схемы")
    except Exception as e:
        logger.exception("Ошибка экспорта схемы: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка при экспорте схемы")


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/favicon.ico")
async def favicon():
    fav_path = os.path.join(FRONTEND_DIR, "favicon.svg")
    return FileResponse(fav_path, media_type="image/svg+xml")


@app.get("/")
async def root():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    return FileResponse(index_path, media_type="text/html")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="GOST Flowchart Studio Server")
    parser.add_argument("--host", default="127.0.0.1", help="Хост сервера")
    parser.add_argument("--port", type=int, default=8000, help="Порт сервера")
    args = parser.parse_args()

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)
