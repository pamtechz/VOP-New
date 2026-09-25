from pathlib import Path
import re

root=Path('.')

p=root/'src/pages/AdminPage.tsx'
s=p.read_text()
if "import CandidateEnrollment from './CandidateEnrollment';" not in s:
    s=s.replace("import OrganizationManagement from './OrganizationManagement';", "import OrganizationManagement from './OrganizationManagement';\nimport CandidateEnrollment from './CandidateEnrollment';", 1)
if "{activeTab==='candidates'&&<CandidateEnrollment currentUser={currentUser}/>}" not in s:
    pattern=r"\{activeTab\s*===\s*'candidates'\s*&&\s*<div>"
    m=re.search(pattern,s)
    if not m: raise SystemExit('candidate branch start marker not found')
    end=re.search(r"\n\s*\{activeTab\s*===",s[m.end():])
    if not end: raise SystemExit('candidate branch end marker not found')
    branch_end=m.end()+end.start()
    s=s[:m.start()]+"{activeTab==='candidates'&&<CandidateEnrollment currentUser={currentUser}/>}"+s[branch_end:]
if "const [languageEditorOpen" not in s:
    s=s.replace("  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);", "  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);\n  const [languageEditorOpen, setLanguageEditorOpen] = useState(false);", 1)
p.write_text(s)

p=root/'src/pages/OrganizationManagement.tsx'
s=p.read_text()
if 'vop-org-details-card' not in s:
    s=s.replace('<div className="vop-card vop-form-card">\n        {!selected?', '<div className={"vop-card vop-form-card vop-org-details-card" + (selected ? " is-open" : "")}>\n        {!selected?', 1)
p.write_text(s)

p=root/'src/pages/admin.css'
s=p.read_text()
css='''\n.vop-translation-target,.vop-translation-entries{grid-column:1 / -1}\n.vop-radio-admin-add-card{display:none!important}\n.vop-org-details-card.is-open{position:relative}\n@media(max-width:900px){.vop-translation-auto-row{grid-template-columns:1fr!important}}\n'''
if '.vop-translation-target' not in s:s+=css
p.write_text(s)
print('finish patch complete')
