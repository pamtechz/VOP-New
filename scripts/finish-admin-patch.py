from pathlib import Path

root=Path('.')

# The first patch script intentionally stops after the candidate component/API changes.
# Finish the remaining UI wiring from stable source markers.
p=root/'src/pages/AdminPage.tsx'
s=p.read_text()
if "import CandidateEnrollment from './CandidateEnrollment';" not in s:
    s=s.replace("import OrganizationManagement from './OrganizationManagement';", "import OrganizationManagement from './OrganizationManagement';\nimport CandidateEnrollment from './CandidateEnrollment';", 1)
start=s.find("{activeTab==='candidates'&&<div>")
end=s.find("{activeTab==='curriculum' &&", start)
if start<0 or end<0: raise SystemExit('candidate branch markers not found')
s=s[:start]+"{activeTab==='candidates'&&<CandidateEnrollment currentUser={currentUser}/>}\n        "+s[end:]
if "const [languageEditorOpen" not in s:
    s=s.replace("  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);", "  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);\n  const [languageEditorOpen, setLanguageEditorOpen] = useState(false);", 1)
s=s.replace("      setEditingLanguage(language.code);\n      setLanguageDraft({", "      setEditingLanguage(language.code);\n      setLanguageEditorOpen(true);\n      setLanguageDraft({", 1)
s=s.replace("      setEditingLanguage(null);\n      setLanguageDraft({", "      setEditingLanguage(null);\n      setLanguageEditorOpen(true);\n      setLanguageDraft({", 1)
s=s.replace("      showMessage('Language saved.');\n      openLanguageEditor();", "      showMessage('Language saved.');\n      setLanguageEditorOpen(false);\n      openLanguageEditor();", 1)
p.write_text(s)

# Organization admin: add a modal/page hook and make the details surface visually independent from the list column.
p=root/'src/pages/OrganizationManagement.tsx'
s=p.read_text()
s=s.replace('<div className="vop-card vop-form-card">\n        {!selected?', '<div className={"vop-card vop-form-card vop-org-details-card" + (selected ? " is-open" : "")}>\n        {!selected?', 1)
p.write_text(s)

# Finish CSS for all non-reloading editor surfaces.
p=root/'src/pages/admin.css'
s=p.read_text()
css='''\n.vop-admin-record-list-only{display:block!important}\n.vop-admin-editor-backdrop,.vop-ann-editor-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(7,27,61,.48);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px}\n.vop-admin-editor-modal,.vop-ann-editor-modal{width:min(760px,96vw);max-height:min(88vh,900px);overflow:hidden;background:#fff;border:1px solid #dbe5f2;border-radius:20px;box-shadow:0 28px 80px rgba(8,31,70,.25);padding:22px}\n.vop-admin-editor-scroll{max-height:65vh;overflow:auto;padding:4px 3px 4px 0}\n.vop-admin-editor-modal .vop-section-title,.vop-ann-editor-modal .vop-section-title{position:sticky;top:0;background:#fff;z-index:2;padding-bottom:12px;border-bottom:1px solid #edf1f6;margin-bottom:14px}\n.vop-icon-button{width:38px;height:38px;border:1px solid #d9e3ef;border-radius:10px;background:#fff;color:#193f78;display:grid;place-items:center;cursor:pointer}\n.vop-ann-editor-backdrop{z-index:1210}.vop-ann-editor-modal{overflow:auto;max-height:90vh}\n.vop-translation-target,.vop-translation-entries{grid-column:1 / -1}\n.vop-radio-admin-add-card{display:none!important}\n@media(max-width:900px){.vop-admin-editor-backdrop,.vop-ann-editor-backdrop{padding:12px}.vop-admin-editor-modal,.vop-ann-editor-modal{width:100%;max-height:94vh;border-radius:16px;padding:16px}.vop-admin-editor-scroll{max-height:72vh}.vop-translation-auto-row{grid-template-columns:1fr!important}}\n'''
if '.vop-admin-editor-backdrop' not in s:s+=css
p.write_text(s)
print('finish patch complete')
