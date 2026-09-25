from pathlib import Path

root=Path('.')

# Normalize publication values so Radio/Announcements public queries receive real booleans.
p=root/'api/admin/content.ts'
s=p.read_text()
if "incoming.published === true" not in s:
    s=s.replace("          ...incoming,\n          id,\n          organizationId: '',", "          ...incoming,\n          id,\n          ...(Object.prototype.hasOwnProperty.call(incoming, 'published') ? { published: incoming.published === true } : {}),\n          organizationId: '',", 1)
    s=s.replace("          ...incoming,\n          id,\n          organizationId: effectiveOrganizationId,", "          ...incoming,\n          id,\n          ...(Object.prototype.hasOwnProperty.call(incoming, 'published') ? { published: incoming.published === true } : {}),\n          organizationId: effectiveOrganizationId,", 1)
p.write_text(s)

# Organizations: selected organization editing is a non-reloading modal/page surface.
p=root/'src/pages/OrganizationManagement.tsx'
s=p.read_text()
if "const [detailsOpen" not in s:
    s=s.replace("  const [selected,setSelected]=useState<Organization|null>(null);", "  const [selected,setSelected]=useState<Organization|null>(null);\n  const [detailsOpen,setDetailsOpen]=useState(false);", 1)
s=s.replace("  const selectOrganization=(item:Organization)=>{\n    setSelected(item);", "  const selectOrganization=(item:Organization)=>{\n    setSelected(item);setDetailsOpen(true);", 1)
# Top action button.
needle='<button className="vop-secondary" type="button" onClick={()=>void load()}><RefreshCw size={16}/>{t(\'common.refresh\',\'Refresh\')}</button>'
if needle in s and 'onClick={()=>setDetailsOpen(true)}' not in s:
    s=s.replace(needle, needle+'{selected&&<button className="vop-primary" type="button" onClick={()=>setDetailsOpen(true)}><Edit3 size={16}/>{isSuperAdmin?\'Manage Organization\':\'Edit My Organization\'}</button>}',1)
start=s.find('      <div className={"vop-card vop-form-card vop-org-details-card"')
if start>=0 and 'vop-org-editor-backdrop' not in s:
    # Match the outer div by counting div tags.
    pos=start
    depth=0
    end=None
    while True:
        next_open=s.find('<div',pos)
        next_close=s.find('</div>',pos)
        if next_close<0: break
        if next_open>=0 and next_open<next_close:
            depth+=1;pos=next_open+4
        else:
            depth-=1;pos=next_close+6
            if depth==0:
                end=pos;break
    if end is None: raise SystemExit('organization details card boundary not found')
    block=s[start:end]
    first_close=block.find('>')
    inner=block[first_close+1:block.rfind('</div>')]
    modal='''      {detailsOpen && selected && <div className="vop-org-editor-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDetailsOpen(false)}}>\n        <div className="vop-org-editor-modal vop-card">\n          <div className="vop-org-editor-head"><div><div className="vop-breadcrumb"><Building2 size={15}/> {isSuperAdmin?'Organization Management':'My Organization'}</div><h2>{selected.name}</h2><p>Manage permitted organization settings, members and invitations.</p></div><button className="vop-icon-button" type="button" onClick={()=>setDetailsOpen(false)} aria-label="Close"><span aria-hidden="true">×</span></button></div>\n          '''+inner+'''\n        </div>\n      </div>}'''
    s=s[:start]+modal+s[end:]
p.write_text(s)

# Translation target mirrors the supplied reference: language selector left, summary cards right, entries full width.
p=root/'src/pages/admin.css'
s=p.read_text()
css='''\n.vop-translation-target{display:grid!important;grid-template-columns:minmax(260px,1fr) minmax(300px,1fr);gap:18px;align-items:start}\n.vop-translation-target>.vop-section-title{grid-column:1/-1;margin-bottom:0}\n.vop-translation-target>.vop-field{grid-column:1}\n.vop-translation-target>.vop-translation-summary{grid-column:2;margin-top:0!important}\n.vop-translation-entries{grid-column:1/-1}\n.vop-org-editor-backdrop{position:fixed;inset:0;z-index:1300;background:rgba(7,27,61,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}\n.vop-org-editor-modal{width:min(1080px,96vw);max-height:92vh;overflow:auto;border-radius:20px;padding:24px;box-shadow:0 30px 90px rgba(8,31,70,.28)}\n.vop-org-editor-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #e7edf5;position:sticky;top:0;background:#fff;z-index:5}\n.vop-org-editor-modal>.vop-card{border:0;box-shadow:none;padding:0}\n@media(max-width:800px){.vop-translation-target{grid-template-columns:1fr}.vop-translation-target>.vop-translation-summary{grid-column:1}.vop-org-editor-backdrop{padding:10px}.vop-org-editor-modal{width:100%;max-height:95vh;padding:16px;border-radius:16px}.vop-org-editor-head{position:sticky;top:-16px;padding-top:4px}}\n'''
if '.vop-org-editor-backdrop' not in s:s+=css
p.write_text(s)
print('final admin finish complete')
