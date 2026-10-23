#!/usr/bin/env python3
"""Extract the user-supplied 104-page Discover PDF without downloading lessons.

Publisher Guide 1..26 becomes one VOP lesson each. Reading columns are walked
left then right; the separate answer-sheet column is never public lesson text.
Requires PyMuPDF. The source PDF is read-only and is not committed or uploaded.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

import fitz


def compact(value):
    return " ".join(value.replace("\xa0", " ").split())


def digest(value):
    return hashlib.sha256(value).hexdigest()


def reading_lines(page, first, answer_page):
    columns = [[], []]
    titles = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [span for span in line["spans"] if span["text"].strip()]
            if not spans:
                continue
            x, y = line["bbox"][:2]
            text = compact("".join(span["text"] for span in spans))
            title = first and all("Italic" in span["font"] and span["size"] >= 20 for span in spans) and y > 90
            if title:
                titles.append((y, x, text))
                continue
            if first and y < 95:
                continue
            column = 0 if x < 306 else 1
            if answer_page and column == 1:
                continue
            if not text:
                continue
            columns[column].append({
                "x": x, "y": y, "text": text,
                "size": max(span["size"] for span in spans),
                "bold": all("Bold" in span["font"] for span in spans),
                "dropSpace": any(span["text"].endswith(" ") for span in spans),
            })
    result = []
    for column, lines in enumerate(columns):
        lines.sort(key=lambda line: (round(line["y"], 1), line["x"]))
        for line in lines:
            line["base"] = 36.85 if column == 0 else 320.315
            result.append(line)
    return result, compact(" ".join(text for _, _, text in sorted(titles)))


def extract(pdf_path):
    data = pdf_path.read_bytes()
    source_hash = digest(data)
    document = fitz.open(stream=data, filetype="pdf")
    if len(document) != 104:
        raise ValueError("Expected the supplied 104-page, 26-guide English PDF.")
    lessons, manifest, warnings = [], [], []
    for number in range(1, 27):
        start = (number - 1) * 4
        if compact(document[start + 3].get_text()):
            raise ValueError(f"Guide {number}: unexpected text on the fourth sheet; review its reading layout.")
        if not re.search(rf"DISCOVER\s*-\s*Answer Sheet\s*{number}\b", document[start + 2].get_text()):
            raise ValueError(f"Guide {number}: cannot identify the answer-sheet column.")
        lines, title = reading_lines(document[start], True, False)
        if not title:
            raise ValueError(f"Guide {number}: title is missing.")
        for page_number in [start + 1, start + 2]:
            extra, _ = reading_lines(document[page_number], False, page_number == start + 2)
            lines.extend(extra)
        sections = [{"pageNumber": 1, "title": title, "blocks": []}]
        paragraph, heading_numbers, source_text = [], [], []
        heading_open, dropcap, dropcap_flow = False, None, False

        def flush():
            nonlocal paragraph
            if paragraph:
                text = paragraph[0]
                for part in paragraph[1:]:
                    text += ("" if text.endswith("-") else " ") + part
                sections[-1]["blocks"].append({"type": "text", "text": compact(text)})
                paragraph = []

        for line in lines:
            text = line["text"]
            # Printed drop caps are separate PDF objects, not separate words.
            if line["size"] >= 20 and len(text) == 1 and text.isalpha():
                if dropcap is not None:
                    raise ValueError(f"Guide {number}: consecutive drop caps.")
                dropcap = text + (" " if line["dropSpace"] else "")
                continue
            if dropcap is not None:
                text = dropcap + text
                dropcap = None
                dropcap_flow = True
            major_style = line["bold"] and 14.9 <= line["size"] <= 15.1
            heading = re.match(r"^(\d+)\.\s*(.+)$", text) if major_style else None
            if heading:
                flush()
                heading_numbers.append(int(heading[1]))
                sections.append({"pageNumber": len(sections) + 1, "title": heading[2], "blocks": []})
                source_text.append(heading[2])
                heading_open = True
            elif major_style and heading_open and text.upper() == text:
                sections[-1]["title"] += " " + text
                source_text.append(text)
            else:
                heading_open = False
                source_text.append(text)
                # PDF paragraph starts are indented; body sublists remain prose.
                if (line["x"] - line["base"] >= 11 and not dropcap_flow) or re.match(r"^\(?\d+\)", text) or (line["bold"] and line["size"] >= 11.9):
                    flush()
                paragraph.append(text)
                if line["x"] - line["base"] < 3:
                    dropcap_flow = False
        flush()
        if dropcap is not None:
            raise ValueError(f"Guide {number}: orphaned drop cap.")
        if not heading_numbers or any(not page["blocks"] for page in sections):
            raise ValueError(f"Guide {number}: empty or missing reading sections.")
        if heading_numbers != list(range(1, len(heading_numbers) + 1)):
            warnings.append({"guide": number, "printedSectionNumbers": heading_numbers, "action": "Preserve the source headings and order; use stable sequential VOP section IDs."})
        # Preserve source reading characters while removing layout whitespace.
        expected = re.sub(r"\s+", "", "".join(source_text))
        actual = re.sub(r"\s+", "", "".join(("" if index == 0 else page["title"]) + "".join(block["text"] for block in page["blocks"]) for index, page in enumerate(sections)))
        if actual != expected:
            raise ValueError(f"Guide {number}: source reading character verification failed.")
        # Bound paragraph counts to the existing VOP section contract.
        for section in sections:
            while len(section["blocks"]) > 48:
                lengths = [len(section["blocks"][i]["text"]) + len(section["blocks"][i+1]["text"]) for i in range(len(section["blocks"])-1)]
                index = min(range(len(lengths)), key=lengths.__getitem__)
                section["blocks"][index:index+2] = [{"type": "text", "text": "\n\n".join(block["text"] for block in section["blocks"][index:index+2])}]
            if any(len(block["text"]) > 8000 for block in section["blocks"]):
                raise ValueError(f"Guide {number}: paragraph exceeds the existing limit.")
        attribution = next(compact(line) for line in document[start+2].get_text().splitlines() if "Copyrights" in line)
        lesson = {
            "lang": "en", "lessonId": f"lesson-{number:02}", "title": title,
            "pages": sections, "quiz": [], "attribution": attribution,
            "source": {"file": pdf_path.name, "sha256": source_hash, "pdfPageStart": start+1,
                       "pdfPageEnd": start+3, "reportedLessonNumber": number,
                       "url": "https://bibleschools.com/en/courses/discover?s=476"},
        }
        lessons.append(lesson)
        manifest.append({"lessonId": lesson["lessonId"], "title": title, "pdfPages": [start+1,start+2,start+3],
                         "excludedAnswerSheetColumn": {"pdfPage": start+3, "xFrom": 306},
                         "printedSectionNumbers": heading_numbers, "sections": len(sections),
                         "readingCharacters": len(expected), "readingSha256": digest(expected.encode()),
                         "sectionTitles": [page["title"] for page in sections]})
    return {"schemaVersion": 2, "lessons": lessons}, {
        "schemaVersion": 1, "sourceFile": pdf_path.name, "sourceSha256": source_hash,
        "pdfPages": len(document), "lessonCount": len(lessons),
        "sectionCount": sum(len(lesson["pages"]) for lesson in lessons),
        "answerSheetsImportedAsPublicContent": 0, "warnings": warnings, "lessons": manifest,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    master, audit = extract(args.pdf)
    for path, value in [(args.output, master), (args.manifest, audit)]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in audit.items() if key != "lessons"}, indent=2))
