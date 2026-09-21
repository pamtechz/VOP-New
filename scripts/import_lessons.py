#!/usr/bin/env python3
"""Extract the approved Bemba and Tonga VOP lessons from a supplied ZIP.

The importer is intentionally build-time only. It never downloads content and it
does not contact Firebase. Its output is a reviewable master, an optional
editorial Firestore export, an audit report, and the exact referenced images.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable, Iterator

from lxml import html


HEADING_RE = re.compile(r"^\s*(\d+)\s*\.\s*(\S.*)$", re.DOTALL)
LESSON_NUMBER_RE = re.compile(r"\b(?:Icisambililo|Ciiyo)\s*(\d+)\b", re.IGNORECASE)
SAFE_ASSET_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}\.(?:jpe?g|png|gif|webp)$", re.IGNORECASE)
TEXT_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6"}
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_MEMBER_BYTES = 4 * 1024 * 1024


class ImportFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class Language:
    code: str
    label: str
    source_directory: str
    file_prefix: str


def compact(value: str) -> str:
    return " ".join(value.replace("\xa0", " ").split())


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def uppercase_ratio(value: str) -> float:
    letters = [character for character in value if character.isalpha()]
    if not letters:
        return 0.0
    return sum(character.isupper() for character in letters) / len(letters)


def load_metadata(path: Path) -> tuple[int, list[Language]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ImportFailure(f"Cannot read approved language metadata: {error}") from error
    if value.get("schemaVersion") != 1 or not isinstance(value.get("expectedLessonsPerLanguage"), int):
        raise ImportFailure("Approved language metadata has an invalid schema.")
    languages: list[Language] = []
    for item in value.get("languages", []):
        try:
            language = Language(
                code=item["code"],
                label=item["label"],
                source_directory=item["sourceDirectory"],
                file_prefix=item["filePrefix"],
            )
        except (KeyError, TypeError) as error:
            raise ImportFailure("Approved language metadata is incomplete.") from error
        if not re.fullmatch(r"[a-z]{2,3}(?:-[a-z0-9]{2,8})*", language.code):
            raise ImportFailure(f"Unsafe language code: {language.code!r}")
        if not re.fullmatch(r"[a-z0-9_-]+", language.source_directory) or not re.fullmatch(
            r"[a-z0-9_-]+", language.file_prefix
        ):
            raise ImportFailure("Unsafe source directory or filename prefix.")
        languages.append(language)
    if not languages or len({language.code for language in languages}) != len(languages):
        raise ImportFailure("Approved languages must be nonempty and unique.")
    return value["expectedLessonsPerLanguage"], languages


def validated_members(archive: zipfile.ZipFile) -> dict[str, zipfile.ZipInfo]:
    members: dict[str, zipfile.ZipInfo] = {}
    total = 0
    for item in archive.infolist():
        path = PurePosixPath(item.filename.replace("\\", "/"))
        if path.is_absolute() or ".." in path.parts or not path.parts:
            raise ImportFailure(f"Unsafe ZIP member: {item.filename!r}")
        normalized = path.as_posix()
        if normalized in members:
            raise ImportFailure(f"Duplicate ZIP member: {normalized}")
        if item.file_size > MAX_MEMBER_BYTES:
            raise ImportFailure(f"ZIP member is too large: {normalized}")
        total += item.file_size
        if total > MAX_ARCHIVE_BYTES:
            raise ImportFailure("ZIP expands beyond the allowed size.")
        members[normalized] = item
    return members


def find_member(members: dict[str, zipfile.ZipInfo], suffix: str) -> zipfile.ZipInfo:
    matches = [item for name, item in members.items() if name.lower().endswith(suffix.lower())]
    if len(matches) != 1:
        raise ImportFailure(f"Expected exactly one archive member ending in {suffix!r}; found {len(matches)}.")
    return matches[0]


def title_from(main: html.HtmlElement, first_heading_index: int, blocks: list[html.HtmlElement]) -> str:
    first_block = blocks[first_heading_index]
    candidates = main.xpath(".//font[@size='6'] | .//font[@size='5'] | .//font[@size='4'] | .//h1")
    for element in candidates:
        if first_block in element.iterancestors() or element is first_block:
            continue
        if first_block.sourceline and element.sourceline and element.sourceline >= first_block.sourceline:
            continue
        value = compact(element.text_content())
        value = re.sub(r"\s+(?:Icisambililo|Ciiyo)\s*\d+\s*$", "", value, flags=re.IGNORECASE)
        if 3 <= len(value) <= 240 and not HEADING_RE.match(value):
            return value
    document_title = compact("".join(main.getroottree().xpath("//title/text()")))
    if document_title:
        return document_title
    raise ImportFailure("Lesson title could not be identified.")


def heading_candidates(
    blocks: list[html.HtmlElement],
) -> dict[int, tuple[float, int, str, html.HtmlElement]]:
    choices: dict[int, tuple[float, int, str, html.HtmlElement]] = {}
    for block_index, block in enumerate(blocks):
        elements: Iterable[html.HtmlElement]
        if block.tag.lower() in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            elements = [block, *block.xpath(".//b | .//strong")]
        else:
            elements = block.xpath(".//b | .//strong")
        for element in elements:
            match = HEADING_RE.match(compact(element.text_content()))
            if not match:
                continue
            number = int(match.group(1))
            heading = compact(match.group(2))
            score = uppercase_ratio(heading)
            previous = choices.get(number)
            if previous is None or score > previous[0]:
                choices[number] = (score, block_index, heading, element)
            break
    if not choices:
        raise ImportFailure("No numbered lesson sections were found.")
    expected = list(range(1, max(choices) + 1))
    if sorted(choices) != expected:
        raise ImportFailure(f"Numbered lesson sections are incomplete: found {sorted(choices)}.")
    ordered = [choices[number][1] for number in expected]
    if ordered != sorted(ordered):
        raise ImportFailure("Numbered lesson sections are out of source order.")
    return choices


def block_events(
    block: html.HtmlElement,
    selected_headings: dict[html.HtmlElement, str],
) -> Iterator[tuple[str, str, str]]:
    """Yield source-order text, image and heading events from malformed legacy HTML.

    A few originals place a new numbered heading at the end of the preceding
    paragraph. Walking the element tree keeps that boundary instead of merging
    the two reading pages.
    """

    text_parts: list[str] = []

    def flush_text() -> Iterator[tuple[str, str, str]]:
        value = compact(" ".join(text_parts))
        text_parts.clear()
        if value and value != "©" and "copyright ©" not in value.lower():
            yield ("text", value, "")

    def walk(element: html.HtmlElement) -> Iterator[tuple[str, str, str]]:
        heading = selected_headings.get(element)
        if heading is not None:
            yield from flush_text()
            yield ("heading", heading, "")
            return
        if element.tag.lower() == "img":
            name = PurePosixPath(element.get("src", "").replace("\\", "/")).name
            if name.lower() != "logo.jpg":
                if not SAFE_ASSET_RE.fullmatch(name):
                    raise ImportFailure(f"Unsafe lesson image reference: {name!r}")
                yield from flush_text()
                yield ("image", name, compact(element.get("alt", "")))
            return
        if element.text:
            text_parts.append(element.text)
        for child in element:
            yield from walk(child)
            if child.tail:
                text_parts.append(child.tail)

    yield from walk(block)
    yield from flush_text()


def parse_lesson(data: bytes, source_name: str, language: Language, lesson_id: str, filename_number: int) -> tuple[dict, set[str], list[str]]:
    try:
        document = html.fromstring(data)
    except (ValueError, TypeError) as error:
        raise ImportFailure(f"Cannot parse {source_name}: {error}") from error
    mains = document.xpath("//td[@rowspan='3' and @width='100%']")
    main = mains[0] if mains else document.xpath("//body")[0]
    blocks = [element for element in main.xpath(".//p | .//h1 | .//h2 | .//h3 | .//h4 | .//h5 | .//h6") if element.tag.lower() in TEXT_TAGS]
    headings = heading_candidates(blocks)
    first_heading_index = min(item[1] for item in headings.values())
    title = title_from(main, first_heading_index, blocks)
    prefix_text = compact(main.text_content())
    number_match = LESSON_NUMBER_RE.search(prefix_text)
    reported_number = int(number_match.group(1)) if number_match else None
    attribution = ""
    for block in blocks:
        block_text = compact(block.text_content())
        if "copyright ©" in block_text.lower():
            attribution = block_text[block_text.lower().index("copyright ©") :]
            break
    if not attribution:
        raise ImportFailure(f"{source_name}: copyright attribution could not be identified.")
    selected_headings = {element: heading for _, _, heading, element in headings.values()}
    pages: list[dict] = []
    current_title = title
    current_blocks: list[dict[str, str]] = []
    assets: set[str] = set()
    started = False

    def flush() -> None:
        nonlocal current_blocks
        if not any(item["type"] == "text" and item["text"].strip() for item in current_blocks):
            current_blocks = []
            return
        pages.append({"pageNumber": len(pages) + 1, "title": current_title, "blocks": current_blocks})
        current_blocks = []

    for index, block in enumerate(blocks):
        if "copyright ©" in compact(block.text_content()).lower():
            break
        if index < first_heading_index:
            if block.tag.lower().startswith("h") or uppercase_ratio(compact(block.text_content())) > 0.9:
                continue
        for kind, value, alt in block_events(block, selected_headings):
            if kind == "heading":
                flush()
                current_title = value
                started = True
            elif kind == "image":
                assets.add(value)
                current_blocks.append({"type": "image", "src": f"assets/{value}", "alt": alt})
            else:
                current_blocks.append({"type": "text", "text": value})
    flush()
    if not started or len(pages) != max(headings) + 1:
        raise ImportFailure(
            f"{source_name}: expected an introduction plus {max(headings)} numbered sections; generated {len(pages)} pages."
        )
    # Some legacy pages put the visual title and lesson label in the same
    # paragraph as the introduction. Keep the introduction while removing only
    # that exact, already-captured header prefix.
    for item_index, item in enumerate(pages[0]["blocks"]):
        if item["type"] != "text":
            continue
        header = re.compile(
            rf"^\s*{re.escape(title)}\s+(?:(?:Icisambililo|Ciiyo)\s*\d+\s*)?",
            re.IGNORECASE,
        )
        item["text"] = compact(header.sub("", item["text"], count=1))
        if not item["text"]:
            pages[0]["blocks"].pop(item_index)
        break
    warnings: list[str] = []
    if reported_number is not None and reported_number != filename_number:
        warnings.append(
            f"{source_name}: visible lesson number {reported_number} conflicts with filename lesson {filename_number}."
        )
    return (
        {
            "lang": language.code,
            "lessonId": lesson_id,
            "title": title,
            "pages": pages,
            "quiz": [],
            "attribution": attribution,
            "source": {
                "file": source_name,
                "sha256": sha256(data),
                "reportedLessonNumber": reported_number,
            },
        },
        assets,
        warnings,
    )


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(archive_path: Path, metadata_path: Path, output: Path) -> dict:
    expected_count, languages = load_metadata(metadata_path)
    archive_bytes = archive_path.read_bytes()
    archive_hash = sha256(archive_bytes)
    output_parent = output.resolve().parent
    output_parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="vop-lessons-", dir=output_parent))
    try:
        lessons: list[dict] = []
        lesson_ids = [f"lesson-{number:02d}" for number in range(1, expected_count + 1)]
        all_assets: set[str] = set()
        warnings: list[str] = []
        with zipfile.ZipFile(archive_path) as archive:
            members = validated_members(archive)
            for language in languages:
                for number, lesson_id in enumerate(lesson_ids, start=1):
                    suffix = f"/{language.source_directory}/{language.file_prefix}{number:02d}.html"
                    source = find_member(members, suffix)
                    data = archive.read(source)
                    lesson, assets, lesson_warnings = parse_lesson(
                        data, source.filename, language, lesson_id, number
                    )
                    lessons.append(lesson)
                    all_assets.update(assets)
                    warnings.extend(lesson_warnings)
            asset_hashes: dict[str, str] = {}
            for name in sorted(all_assets):
                source = find_member(members, f"/assets/{name}")
                data = archive.read(source)
                destination = staging / "content" / "assets" / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
                asset_hashes[name] = sha256(data)

        master = {
            "schemaVersion": 2,
            "languages": [language.code for language in languages],
            "languageLabels": [language.label for language in languages],
            "lessonIds": lesson_ids,
            "lessons": lessons,
        }
        revision = sha256(json.dumps(master, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        documents = []
        for lesson in lessons:
            documents.append(
                {
                    "path": f"curricula/discover/languages/{lesson['lang']}/lessons/{lesson['lessonId']}",
                    "data": {
                        **lesson,
                        "curriculumId": "discover",
                        "importRevision": revision,
                        "sourceArchiveSha256": archive_hash,
                    },
                }
            )
        seed = {
            "schemaVersion": 2,
            "curriculumId": "discover",
            "sourceArchive": archive_path.name,
            "sourceArchiveSha256": archive_hash,
            "importRevision": revision,
            "documents": documents,
        }
        page_count = sum(len(lesson["pages"]) for lesson in lessons)
        report = {
            "schemaVersion": 1,
            "sourceArchive": archive_path.name,
            "sourceArchiveSha256": archive_hash,
            "importRevision": revision,
            "languages": {language.code: expected_count for language in languages},
            "lessonCount": len(lessons),
            "pageCount": page_count,
            "assetCount": len(asset_hashes),
            "assetHashes": asset_hashes,
            "quizQuestionCount": 0,
            "warnings": warnings,
        }
        write_json(staging / "content" / "lessons.master.json", master)
        write_json(staging / "content" / "lessons.seed.json", seed)
        write_json(staging / "content" / "import-report.json", report)
        if output.exists():
            shutil.rmtree(output)
        staging.replace(output)
        return report
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract approved VOP Bemba and Tonga lesson data from a ZIP archive.")
    parser.add_argument("archive", type=Path)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = run(args.archive, args.metadata, args.output)
    except (ImportFailure, OSError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Lesson import failed: {error}\n")
    print(
        f"Extracted {report['lessonCount']} lessons, {report['pageCount']} reading pages and "
        f"{report['assetCount']} referenced images; quizzes remain empty."
    )


if __name__ == "__main__":
    main()
