"""Build a small Word .docx file from a limited Markdown subset.

This intentionally uses only the Python standard library so the guide can be
regenerated on a clean checkout without installing Pandoc or python-docx.
"""

from __future__ import annotations

import html
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def xml_escape(value: str) -> str:
    return html.escape(value, quote=True)


def text_run(text: str, *, bold: bool = False) -> str:
    space = ' xml:space="preserve"' if text != text.strip() or "  " in text else ""
    props = "<w:rPr><w:b/></w:rPr>" if bold else ""
    return f"<w:r>{props}<w:t{space}>{xml_escape(text)}</w:t></w:r>"


def paragraph(text: str = "", *, style: str | None = None, bold: bool = False) -> str:
    props = ""
    if style:
        props = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>'
    return f"<w:p>{props}{text_run(text, bold=bold)}</w:p>"


def code_paragraph(text: str) -> str:
    return paragraph(text, style="CodeBlock")


def table_cell(text: str, *, header: bool = False) -> str:
    shade = '<w:shd w:fill="F2F2F2"/>' if header else ""
    return (
        "<w:tc>"
        f"<w:tcPr><w:tcW w:w=\"2400\" w:type=\"dxa\"/>{shade}</w:tcPr>"
        f"{paragraph(text, bold=header)}"
        "</w:tc>"
    )


def table(rows: list[list[str]]) -> str:
    if not rows:
        return ""

    parts = [
        "<w:tbl>",
        "<w:tblPr>",
        '<w:tblW w:w="0" w:type="auto"/>',
        "<w:tblBorders>",
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>',
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>',
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>',
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>',
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>',
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>',
        "</w:tblBorders>",
        "</w:tblPr>",
    ]

    for row_index, row in enumerate(rows):
        parts.append("<w:tr>")
        for cell in row:
            parts.append(table_cell(cell, header=row_index == 0))
        parts.append("</w:tr>")

    parts.append("</w:tbl>")
    parts.append(paragraph())
    return "".join(parts)


def is_table_separator(line: str) -> bool:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return False
    content = stripped.strip("|").strip()
    return bool(content) and all(char in "-:| " for char in stripped)


def parse_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def markdown_to_body(markdown: str) -> str:
    lines = markdown.splitlines()
    parts: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        if stripped.startswith("```"):
            index += 1
            code_lines: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            if index < len(lines):
                index += 1
            parts.append(paragraph())
            for code_line in code_lines:
                parts.append(code_paragraph(code_line))
            parts.append(paragraph())
            continue

        if (
            stripped.startswith("|")
            and index + 1 < len(lines)
            and is_table_separator(lines[index + 1])
        ):
            raw_rows: list[str] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                raw_rows.append(lines[index])
                index += 1
            rows = [parse_table_row(row) for row in raw_rows if not is_table_separator(row)]
            parts.append(table(rows))
            continue

        heading_match = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2).strip()
            style = "Title" if level == 1 else f"Heading{min(level - 1, 3)}"
            parts.append(paragraph(text, style=style))
            index += 1
            continue

        if stripped.startswith("- "):
            parts.append(paragraph(stripped, style="ListParagraph"))
            index += 1
            continue

        if re.match(r"^\d+\.\s+", stripped):
            parts.append(paragraph(stripped, style="ListParagraph"))
            index += 1
            continue

        if re.match(r"^[A-Z][A-Z0-9_]*=.*$", stripped):
            parts.append(code_paragraph(stripped))
            index += 1
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            next_stripped = lines[index].strip()
            if not next_stripped:
                break
            if next_stripped.startswith(("```", "|", "#", "- ")):
                break
            if re.match(r"^\d+\.\s+", next_stripped):
                break
            if re.match(r"^[A-Z][A-Z0-9_]*=.*$", next_stripped):
                break
            paragraph_lines.append(next_stripped)
            index += 1

        parts.append(paragraph(" ".join(paragraph_lines)))

    parts.append(
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" '
        'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    return "".join(parts)


def document_xml(body: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W_NS}" xmlns:r="{R_NS}"><w:body>{body}</w:body></w:document>'
    )


def styles_xml() -> str:
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W_NS}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="300"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="23"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="360"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock">
    <w:name w:val="Code Block"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="0"/><w:shd w:fill="F7F7F7"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr>
  </w:style>
</w:styles>'''


def content_types_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''


def package_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''


def document_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''


def core_xml(title: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{xml_escape(title)}</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>
</cp:coreProperties>'''


def app_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>'''


def build_docx(markdown_path: Path, output_path: Path) -> None:
    markdown = markdown_path.read_text(encoding="utf-8")
    title_match = re.search(r"(?m)^#\s+(.+?)\s*$", markdown)
    document_title = title_match.group(1) if title_match else markdown_path.stem
    body = markdown_to_body(markdown)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with ZipFile(output_path, "w", ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types_xml())
        docx.writestr("_rels/.rels", package_rels_xml())
        docx.writestr("word/document.xml", document_xml(body))
        docx.writestr("word/_rels/document.xml.rels", document_rels_xml())
        docx.writestr("word/styles.xml", styles_xml())
        docx.writestr("docProps/core.xml", core_xml(document_title))
        docx.writestr("docProps/app.xml", app_xml())


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python tools/build_docx_from_markdown.py INPUT.md OUTPUT.docx")
        return 2

    build_docx(Path(sys.argv[1]), Path(sys.argv[2]))
    print(f"Wrote {sys.argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
