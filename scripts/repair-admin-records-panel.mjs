import fs from 'node:fs';

const path = 'src/pages/AdminRecordsPanel.tsx';
const source = fs.readFileSync(path, 'utf8');
const marker = "  const [saving, setSaving] = useState(false);\n\n  const loadError";
const state = "  const [saving, setSaving] = useState(false);\n  const [editorOpen, setEditorOpen] = useState(false);\n\n  const loadError";

if (!source.includes('const [editorOpen, setEditorOpen] = useState(false);')) {
  if (!source.includes(marker)) {
    throw new Error('AdminRecordsPanel repair marker not found.');
  }
  fs.writeFileSync(path, source.replace(marker, state), 'utf8');
  console.log('Repaired AdminRecordsPanel editor state.');
} else {
  console.log('AdminRecordsPanel editor state already present.');
}
