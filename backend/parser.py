"""
parser.py - Преобразование исходного кода алгоритмов в граф ГОСТ 19.701-90.
Поддерживает Python (через AST), а также C/C++, Pascal, JS, Java, псевдокод (через лексический парсер).
"""

import ast
import re
from typing import Dict, List, Any, Tuple


class FlowchartBuilder:
    def __init__(self):
        self.nodes: List[Dict[str, Any]] = []
        self.edges: List[Dict[str, Any]] = []
        self._counter = 0

    def new_id(self, prefix: str = "node") -> str:
        self._counter += 1
        return f"{prefix}_{self._counter}"

    def add_node(self, ntype: str, text: str, nid: str = None) -> str:
        if nid is None:
            nid = self.new_id(ntype)
        self.nodes.append({
            "id": nid,
            "type": ntype,
            "text": text
        })
        return nid

    def add_edge(self, from_id: str, to_id: str, label: str = "", from_port: str = None, to_port: str = None):
        self.edges.append({
            "from": from_id,
            "to": to_id,
            "label": label,
            "fromPort": from_port,
            "toPort": to_port
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodes": self.nodes,
            "edges": self.edges
        }


def parse_python_code(code: str) -> Dict[str, Any]:
    """Парсит Python код в узлы и связи по ГОСТ 19.701-90."""
    builder = FlowchartBuilder()
    try:
        tree = ast.parse(code)
    except Exception as e:
        # Если код не валидный Python, пробуем generic parser
        return parse_generic_code(code)

    # Ищем основную функцию или глобальные инструкции
    func_defs = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
    target_stmts = []

    if func_defs:
        # Если есть функция main, берем ее, иначе первую функцию
        main_func = next((f for f in func_defs if f.name == "main"), func_defs[0])
        name = main_func.name
        start_id = builder.add_node("terminator", f"Начало ({name})")
        target_stmts = main_func.body
    else:
        start_id = builder.add_node("terminator", "Начало")
        target_stmts = tree.body

    curr_id = start_id

    def expr_to_str(node: ast.AST) -> str:
        try:
            return ast.unparse(node)
        except Exception:
            return "выражение"

    def process_statements(stmts: List[ast.AST], prev_id: str, depth: int = 0) -> str:
        if depth > 200:
            return prev_id
        current = prev_id
        for stmt in stmts:
            if isinstance(stmt, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                text = expr_to_str(stmt)
                nid = builder.add_node("process", text)
                builder.add_edge(current, nid)
                current = nid

            elif isinstance(stmt, ast.Expr):
                # Проверяем вызовы функций: print, input, save, etc.
                val = stmt.value
                if isinstance(val, ast.Call):
                    func_name = ""
                    if isinstance(val.func, ast.Name):
                        func_name = val.func.id
                    elif isinstance(val.func, ast.Attribute):
                        func_name = val.func.attr

                    args_str = ", ".join(expr_to_str(a) for a in val.args)

                    if func_name == "print":
                        nid = builder.add_node("io", f"Вывод {args_str}")
                    elif func_name == "input":
                        nid = builder.add_node("io", f"Ввод {args_str}")
                    elif "report" in func_name.lower() or "doc" in func_name.lower() or "print" in func_name.lower():
                        nid = builder.add_node("document", f"Печать документа\\n{func_name}({args_str})")
                    elif any(db_kw in func_name.lower() for db_kw in ["sql", "db", "file", "disk"]):
                        nid = builder.add_node("database", f"База данных\\n{func_name}({args_str})")
                    else:
                        nid = builder.add_node("subroutine", f"{func_name}({args_str})")

                    builder.add_edge(current, nid)
                    current = nid
                else:
                    text = expr_to_str(stmt)
                    nid = builder.add_node("process", text)
                    builder.add_edge(current, nid)
                    current = nid

            elif isinstance(stmt, ast.If):
                cond_text = f"{expr_to_str(stmt.test)} ?"
                cond_id = builder.add_node("decision", cond_text)
                builder.add_edge(current, cond_id)

                # Ветка Да
                then_end = process_statements(stmt.body, cond_id, depth + 1)
                for e in builder.edges:
                    if e["from"] == cond_id and not e["label"]:
                        e["label"] = "Да"
                        break

                # Ветка Нет
                if stmt.orelse:
                    else_end = process_statements(stmt.orelse, cond_id, depth + 1)
                    for e in builder.edges:
                        if e["from"] == cond_id and not e["label"]:
                            e["label"] = "Нет"
                            break
                    # Точка слияния
                    if then_end and else_end:
                        merge_id = builder.add_node("connector", "")
                        builder.add_edge(then_end, merge_id)
                        builder.add_edge(else_end, merge_id)
                        current = merge_id
                    elif then_end:
                        current = then_end
                    elif else_end:
                        current = else_end
                    else:
                        current = None
                        break
                else:
                    if then_end:
                        merge_id = builder.add_node("connector", "")
                        builder.add_edge(then_end, merge_id)
                        builder.add_edge(cond_id, merge_id, label="Нет")
                        current = merge_id
                    else:
                        current = cond_id

            elif isinstance(stmt, ast.For):
                target = expr_to_str(stmt.target)
                iter_str = expr_to_str(stmt.iter)
                prep_id = builder.add_node("preparation", f"Для каждого {target} в {iter_str}")
                builder.add_edge(current, prep_id)

                body_end = process_statements(stmt.body, prep_id, depth + 1)
                if body_end:
                    builder.add_edge(body_end, prep_id)  # возврат цикла
                current = prep_id

            elif isinstance(stmt, ast.While):
                cond_text = f"{expr_to_str(stmt.test)} ?"
                while_id = builder.add_node("decision", cond_text)
                builder.add_edge(current, while_id)

                body_end = process_statements(stmt.body, while_id, depth + 1)
                for e in builder.edges:
                    if e["from"] == while_id and not e["label"]:
                        e["label"] = "Да"
                        break
                if body_end:
                    builder.add_edge(body_end, while_id)  # возврат цикла
                current = while_id

            elif isinstance(stmt, ast.Raise):
                err_text = expr_to_str(stmt.exc) if stmt.exc else "Ошибка"
                err_io = builder.add_node("io", f"Вывод ошибки:\\n{err_text}")
                builder.add_edge(current, err_io)
                err_end = builder.add_node("terminator", "Конец (аварийный)")
                builder.add_edge(err_io, err_end)
                current = None
                break

            elif isinstance(stmt, ast.Assert):
                cond_text = f"{expr_to_str(stmt.test)} ?"
                cond_id = builder.add_node("decision", cond_text)
                builder.add_edge(current, cond_id)

                msg = expr_to_str(stmt.msg) if stmt.msg else "Ошибка утверждения"
                err_io = builder.add_node("io", f"Вывод ошибки:\\n{msg}")
                err_end = builder.add_node("terminator", "Конец (аварийный)")
                builder.add_edge(cond_id, err_io, label="Нет")
                builder.add_edge(err_io, err_end)
                current = cond_id

            elif isinstance(stmt, ast.Return):
                val_text = expr_to_str(stmt.value) if stmt.value else ""
                if val_text:
                    ret_id = builder.add_node("io", f"Возврат {val_text}")
                    builder.add_edge(current, ret_id)
                    current = ret_id
                end_id = builder.add_node("terminator", "Конец")
                builder.add_edge(current, end_id)
                current = None
                break

        return current

    final_curr = process_statements(target_stmts, curr_id)
    if final_curr:
        end_id = builder.add_node("terminator", "Конец")
        builder.add_edge(final_curr, end_id)

    return builder.to_dict()


def parse_generic_code(code: str) -> Dict[str, Any]:
    """
    Универсальный эвристический парсер для C, C++, Pascal, Java, JS, Go и псевдокода.
    """
    builder = FlowchartBuilder()
    lines = [l.strip() for l in code.split("\n") if l.strip()]

    start_id = builder.add_node("terminator", "Начало")
    curr = start_id

    for line in lines:
        # Пропуск директив препроцессора и пустых скобок
        if line.startswith("#include") or line.startswith("import ") or line in ["{", "}", "begin", "end;"]:
            continue

        # Ввод-вывод
        if re.search(r"\b(cin|scanf|read|readline|input)\b", line, re.IGNORECASE):
            clean = re.sub(r"[;{}()\"]", "", line)
            nid = builder.add_node("io", f"Ввод: {clean}")
            builder.add_edge(curr, nid)
            curr = nid
        elif re.search(r"\b(cout|printf|print|println|write|writeln|console\.log)\b", line, re.IGNORECASE):
            clean = re.sub(r"[;{}()\"]", "", line)
            nid = builder.add_node("io", f"Вывод: {clean}")
            builder.add_edge(curr, nid)
            curr = nid
        elif re.search(r"\b(throw|raise)\b", line, re.IGNORECASE):
            clean = re.sub(r"[;{}()\"]", "", line)
            err_io = builder.add_node("io", f"Вывод ошибки:\\n{clean}")
            builder.add_edge(curr, err_io)
            err_end = builder.add_node("terminator", "Конец (аварийный)")
            builder.add_edge(err_io, err_end)
            curr = err_end
        elif re.search(r"\b(if)\b", line, re.IGNORECASE):
            m = re.search(r"if\s*\((.*?)\)", line, re.IGNORECASE)
            cond = m.group(1) if m else line
            nid = builder.add_node("decision", f"{cond} ?")
            builder.add_edge(curr, nid)
            curr = nid
        elif re.search(r"\b(for|while)\b", line, re.IGNORECASE):
            m = re.search(r"(for|while)\s*\((.*?)\)", line, re.IGNORECASE)
            loop_desc = m.group(2) if m else line
            nid = builder.add_node("preparation", loop_desc)
            builder.add_edge(curr, nid)
            curr = nid
        elif re.search(r"\b(return)\b", line, re.IGNORECASE):
            clean = line.replace("return", "").replace(";", "").strip()
            ret_id = builder.add_node("io", f"Возврат {clean}")
            builder.add_edge(curr, ret_id)
            end_id = builder.add_node("terminator", "Конец")
            builder.add_edge(ret_id, end_id)
            curr = end_id
        else:
            # Вызов функции или обычный процесс
            if "(" in line and ")" in line and not line.startswith("def ") and not line.startswith("function "):
                clean = line.rstrip(";")
                nid = builder.add_node("subroutine", clean)
            else:
                clean = line.rstrip(";")
                nid = builder.add_node("process", clean)
            builder.add_edge(curr, nid)
            curr = nid

    # Если последняя нода не терминатор, добавляем Конец
    if curr and not any(n["id"] == curr and n["type"] == "terminator" for n in builder.nodes):
        end_id = builder.add_node("terminator", "Конец")
        builder.add_edge(curr, end_id)

    return builder.to_dict()


def parse_code_to_flowchart(code: str, lang: str = "auto") -> Dict[str, Any]:
    """Главная точка входа парсера."""
    if len(code) > 1_000_000:
        raise ValueError("Code too large")
    is_python = lang == "python" or (
        lang == "auto" and any(token in code for token in ["def ", "import ", "class ", "print(", "__main__", "elif "])
    )
    if is_python:
        try:
            return parse_python_code(code)
        except Exception:
            return parse_generic_code(code)
    return parse_generic_code(code)
